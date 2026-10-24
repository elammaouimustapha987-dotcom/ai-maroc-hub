import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'node:url';

const MAX_MESSAGE_LENGTH = 2000;
const DEFAULT_AI_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_AI_MODEL = 'gpt-4o-mini';

export function createApp({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const app = express();
  const allowedOrigins = new Set(
    (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );

  app.disable('x-powered-by');
  app.use(helmet());

  app.use((req, res, next) => {
    const origin = req.get('origin');

    if (origin && !allowedOrigins.has(origin)) {
      return res.status(403).json({ error: 'Origin is not allowed.' });
    }

    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }

    if (req.method === 'OPTIONS') {
      if (!origin) {
        return res.status(400).json({ error: 'Origin is required for this request.' });
      }

      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      return res.sendStatus(204);
    }

    return next();
  });

  app.use(express.json({ limit: '16kb', strict: true }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.post(
    '/api/chat',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 30,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'Too many requests. Please try again later.' },
    }),
    async (req, res) => {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({ error: 'Request body must be a JSON object.' });
      }

      const { message } = req.body;
      if (typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: 'Message must be a non-empty string.' });
      }

      if (message.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ error: 'Message must be 2000 characters or fewer.' });
      }

      const apiKey = typeof env.AI_API_KEY === 'string' ? env.AI_API_KEY.trim() : '';
      if (!apiKey) {
        return res.status(503).json({
          error: 'AI provider is not configured. Set AI_API_KEY in the server environment.',
        });
      }

      try {
        const response = await fetchImpl(env.AI_API_URL || DEFAULT_AI_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: env.AI_MODEL || DEFAULT_AI_MODEL,
            messages: [{ role: 'user', content: message.trim() }],
            stream: false,
          }),
          signal: AbortSignal.timeout(30_000),
        });

        if (!response.ok) {
          return res.status(502).json({
            error: 'The AI provider could not complete the request. Check the server configuration and try again.',
          });
        }

        const result = await response.json();
        const reply = result?.choices?.[0]?.message?.content;

        if (typeof reply !== 'string' || reply.trim().length === 0) {
          return res.status(502).json({
            error: 'The AI provider returned an unexpected response.',
          });
        }

        return res.status(200).json({ reply });
      } catch (error) {
        if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
          return res.status(504).json({ error: 'The AI provider request timed out. Please try again.' });
        }

        return res.status(502).json({
          error: 'The AI provider is unavailable. Please try again later.',
        });
      }
    },
  );

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  app.use((error, _req, res, _next) => {
    if (res.headersSent) {
      return;
    }

    if (error?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body is too large.' });
    }

    if (error instanceof SyntaxError && error.status === 400) {
      return res.status(400).json({ error: 'Request body must be valid JSON.' });
    }

    return res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = process.env.PORT || 3000;
  createApp().listen(port, '0.0.0.0', () => {
    console.log(`AI Maroc Hub backend listening on port ${port}`);
  });
}
