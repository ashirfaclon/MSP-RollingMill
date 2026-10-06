# MSP-RollingMill

Rolling-mill dashboards for MSP Steel. The HSM screens are live, fed by the plant historian,
the ERP and the IOsense logbook.

## Project structure

```
MSP-RollingMill/
├── frontend/     Next.js dashboard — UI only, no plant credentials (see frontend/README.md)
├── backend/      Fastify API — reads Influx / ERP / logbook, computes every KPI (see backend/README.md)
└── iosense.md    API and data-source tracking
```

The two are **deployed separately**:

- **Frontend:** `next build` produces a static site in `frontend/out/`, served by nginx.
  The browser calls the backend directly at `NEXT_PUBLIC_API_BASE_URL`, set at build time.
- **Backend:** a Node service. It needs plant network access, and its `CORS_ORIGINS` must
  allow the frontend's site.

In local development, `next dev` proxies `/api/*` to `BACKEND_URL` instead.

Response types are defined once, in `backend/src/contracts`. The frontend imports them as
`@contracts` (types only).

## Run locally

```bash
# 1 — API (needs plant network access and backend/.env)
cd backend && npm install && npm run sync:erp && npm run dev     # :4000 by default

# 2 — dashboard (BACKEND_URL in frontend/.env.local points at the API)
cd frontend && npm install && npm run dev                        # :3000
```

## Tests

- `backend`: `npm test` (unit and route tests) and `npm run test:live` (real systems).
- `frontend`: `npx playwright test` (UI and end-to-end; starts the backend if it isn't running).
