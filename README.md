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

The two are **deployed separately**. The browser loads the frontend. The frontend gets its
data from the backend, in one of two ways:

- **Proxy:** the browser calls `/api/*` on the frontend's own site, and Next forwards it to
  `BACKEND_URL`.
- **Direct:** the browser calls the backend itself at `NEXT_PUBLIC_API_BASE_URL`, and the
  backend allows that site in `CORS_ORIGINS`.

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
