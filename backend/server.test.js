import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from './server.js';

async function startServer(app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

let server;

before(async () => {
  server = await startServer(createApp({ env: {} }));
});

after(async () => {
  await server.close();
});

test('GET /health returns JSON health status', async () => {
  const response = await fetch(`${server.baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test('POST /api/chat explains when the provider key is missing', async () => {
  const response = await fetch(`${server.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'سلام' }),
  });

  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /AI_API_KEY/);
});

test('POST /api/chat validates empty and overlong messages', async () => {
  const appServer = await startServer(createApp({ env: { AI_API_KEY: 'test-only-placeholder' } }));
  try {
    const empty = await fetch(`${appServer.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '   ' }),
    });
    assert.equal(empty.status, 400);

    const overlong = await fetch(`${appServer.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'x'.repeat(2001) }),
    });
    assert.equal(overlong.status, 400);
  } finally {
    await appServer.close();
  }
});

test('POST /api/chat forwards the message to the configured AI provider', async () => {
  let requestBody;
  let authorization;
  const app = createApp({
    env: {
      AI_API_KEY: 'test-only-placeholder',
      AI_MODEL: 'test-model',
    },
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      authorization = options.headers.Authorization;
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'أهلاً بك' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    },
  });

  const appServer = await startServer(app);
  try {
    const response = await fetch(`${appServer.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '  مرحبا  ' }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { reply: 'أهلاً بك' });
    assert.equal(authorization, 'Bearer test-only-placeholder');
    assert.equal(requestBody.model, 'test-model');
    assert.equal(requestBody.messages[0].content, 'مرحبا');
  } finally {
    await appServer.close();
  }
});

test('browser requests from unlisted origins are rejected', async () => {
  const response = await fetch(`${server.baseUrl}/health`, {
    headers: { Origin: 'https://unlisted.example' },
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'Origin is not allowed.' });
});
