# AI Maroc Hub

AI tools directory and free web assistant. The existing GitHub Pages website remains a static frontend; the optional Express API in `backend/` must run on a separate Node.js host.

## Backend setup

The API uses Node.js 20 or newer and an OpenAI-compatible Chat Completions API. It does not return canned or fake AI answers. Without a configured provider key, `POST /api/chat` returns HTTP `503` with a message explaining that `AI_API_KEY` is required.

### Run locally

```bash
cd backend
npm install
cp .env.example .env
```

Add your provider key to `backend/.env` as `AI_API_KEY=...`. Keep that file private; it is excluded by `backend/.gitignore`. Never put the key in `index.html`, browser JavaScript, or a committed file.

Start the API:

```bash
npm start
```

The server uses the hosting platform's `PORT` value, or port `3000` locally. Check it at `http://localhost:3000/health`. Run the tests with `npm test`.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `AI_API_KEY` | Yes, for chat | Provider key, stored only in the backend host's environment secrets. |
| `AI_API_URL` | No | OpenAI-compatible Chat Completions endpoint; defaults to OpenAI's endpoint. |
| `AI_MODEL` | No | Provider model name; defaults to `gpt-4o-mini`. |
| `ALLOWED_ORIGINS` | Yes for browser access | Comma-separated exact site origins, with no paths or trailing slash. |
| `PORT` | Set by host | Port for Express to listen on; defaults to `3000` locally. |

For the default GitHub Pages domain, set `ALLOWED_ORIGINS` to `https://elammaouimustapha987-dotcom.github.io`. If the site uses a custom domain, use that domain's origin instead. Do not use `*` for allowed origins.

### Deploy the backend

GitHub Pages serves static files; it cannot run Node.js or Express. Deploy `backend/` separately to a Node.js hosting service:

1. Set the service's root directory to `backend/`.
2. Use `npm install` as the install/build command and `npm start` as the start command.
3. Set `AI_API_KEY` and `ALLOWED_ORIGINS` in that host's environment secrets/settings. Add `AI_API_URL` or `AI_MODEL` if your provider requires different values.
4. Use the backend service's HTTPS URL for frontend requests.
5. Confirm `https://YOUR_BACKEND_HOST/health` returns `{"ok":true}`.

The API key is never sent to the browser. The backend limits JSON request bodies, accepts messages up to 2,000 characters, applies security headers and a per-IP chat rate limit, and returns sanitized JSON errors without logging provider credentials or upstream error bodies.

## Connect the existing website

The current `index.html` is intentionally not changed by this backend setup. When you choose to connect the chat UI, send the user's message to your deployed backend URL:

```js
const response = await fetch('https://YOUR_BACKEND_HOST/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: userMessage }),
});

const data = await response.json();
if (!response.ok) throw new Error(data.error || 'Chat request failed.');
const reply = data.reply;
```

Only the public backend URL belongs in frontend code—never `AI_API_KEY`.
