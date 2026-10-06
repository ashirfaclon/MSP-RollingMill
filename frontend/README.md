# MSP Rolling Mill — dashboard

The Next.js frontend. It shows data; it computes nothing and holds no plant credentials.
Every figure comes from the backend API (`../backend`).

## Run locally

```bash
cp .env.example .env.local    # BACKEND_URL=http://localhost:4000 (the running backend)
npm install
npm run dev                   # http://localhost:3000 — /api/* is proxied to BACKEND_URL
```

## Build and deploy (static)

`npm run build` produces a **static site in `out/`**: HTML, JS and CSS files, with no Node
server. Each page is `<route>/index.html`, so nginx or any static host serves it as-is.

Without a server there is no proxy, so the browser calls the backend directly:

| Where | Set |
|---|---|
| Frontend build | `NEXT_PUBLIC_API_BASE_URL=https://<api-host>`, in `.env.production` (committed; a public URL) or the build environment. It is read by `next build`, so set it before building. |
| Backend | `CORS_ORIGINS=https://<this-site>` |

The API URL must be `https` when the site is served over `https`; browsers block `http`
calls from an `https` page.

## Where things are

- `src/services/hsmApi.ts`: the single fetch path (`useApi`, `fetchJson`) and the API base URL.
- `@contracts`: response types, imported type-only from `../backend/src/contracts`.
- `next.config.ts`: static export for `build`, and the `/api` proxy for `dev`.
- `src/tests/`: Playwright tests. They run against `next dev`, and start the backend
  (`../backend`, port 8521 by default) if it isn't already running.
