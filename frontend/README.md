# MSP Rolling Mill — dashboard

The Next.js frontend. It shows data; it computes nothing and holds no plant credentials.
Every figure comes from the backend API (`../backend`).

## Run

```bash
cp .env.example .env.local    # BACKEND_URL=http://localhost:4000 (the running backend)
npm install
npm run dev                   # http://localhost:3000
```

## Reaching the API

| Mode | Set at build time | Browser calls | Backend needs |
|---|---|---|---|
| Proxy (default) | `BACKEND_URL=https://<api-host>` | `/api/*` on this site; Next forwards it | nothing extra |
| Direct | `NEXT_PUBLIC_API_BASE_URL=https://<api-host>` | the backend itself | `CORS_ORIGINS=https://<this-site>` |

Both variables are read by `next build`, so set them before building.

## Where things are

- `src/services/hsmApi.ts`: the single fetch path (`useApi`, `fetchJson`) and the API base URL.
- `@contracts`: response types, imported type-only from `../backend/src/contracts`.
- `src/tests/`: Playwright tests. They start the backend (`../backend`, port 8521 by default)
  and `next start` if those aren't already running.

```bash
npm run build && npx playwright test
```
