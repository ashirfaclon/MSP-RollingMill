# MSP Rolling Mill — API

The data service behind the HSM dashboard. It reads the **plant historian** (InfluxDB), the
**electrical meters** (a second InfluxDB), the **ERP** (Oracle, read-only, through a synced
cache) and the **IOsense logbook**. It computes every KPI and serves the results as JSON to the
frontend (`../frontend`).

- **Stack:** Node 22, TypeScript, Fastify 5, Vitest, tsup.
- **Port:** 4000 by default.

## Folder structure

```
backend/
├── src/
│   ├── server.ts               entry: config → listen → optional ERP schedule → graceful shutdown
│   ├── app.ts                  buildApp(): plugins + routes, no listen (tests use app.inject)
│   ├── config/
│   │   ├── server.ts           HTTP settings (PORT, CORS_ORIGINS …), zod-validated at startup
│   │   └── env.ts              source connections (INFLUX_*, EMS_*, ERP_*, IOSENSE_*), read per call
│   ├── contracts/              the API contract: every response type — type-only, no imports
│   ├── plugins/
│   │   ├── error-handler.ts    one error shape: { error: '<code>', message }
│   │   └── security.ts         CORS allow-list, helmet, rate limit, Cache-Control: no-store
│   ├── modules/                one folder per feature: routes + services
│   │   ├── hsm/                /api/hsm/*  production, yield, running rate, ERP KPIs, live, stands
│   │   ├── system/             /api/health, /ready, /config, /sources
│   │   └── sources/            /api/erp, /historian/catalogue, /ems/equipment, /logbook, /logbook-sso
│   ├── integrations/           clients for external systems — no HTTP concerns
│   │   ├── influx.ts           shared InfluxDB query helpers
│   │   ├── historian/          plant historian client + tag definitions
│   │   ├── ems/                electrical meters client
│   │   ├── erp/                cache reader (cache.ts) + the read-only Oracle sync (sync.ts)
│   │   └── logbook/            IOsense logbook session + reads
│   ├── jobs/
│   │   ├── erp-sync.ts         the ERP sync as a one-shot CLI (exit 0 / 1)
│   │   └── scheduler.ts        optional in-service schedule, runs the CLI as a child process
│   └── shared/                 HttpError, client-facing messages, request helpers
├── test/
│   ├── unit/                   KPI arithmetic and degraded source paths (no plant access)
│   ├── routes/                 every route through the real app with inject() (no network)
│   └── live/                   against the real plant systems; each suite skips if not configured
├── Dockerfile                  multi-stage, non-root, Oracle Instant Client, healthcheck
└── .env.example                every variable, with notes
```

**Layering.** A route only validates its input and calls one service. Services hold the
business rules: plant day, reset events, noise, yield, running rate. Integrations only talk
to external systems. The API **never opens Oracle during a request**: the ERP sync copies raw
rows into `data/*.json`, and requests read those files.

**Frontend contract.** The frontend imports `src/contracts` as types only (`@contracts`), so
both sides share the response shapes without sharing any runtime code. Change a response
there first, and the compiler shows every place in both apps that needs updating.

## API

All paths are under `/api`. **Every route except `/health`, `/ready` and `/auth/*` needs a
session** (`Authorization: Bearer <sessionToken>`), otherwise it answers `401 unauthenticated`.
Every response has `Cache-Control: no-store` and an `X-Request-Id` header. Errors always look like `{ "error": "<code>", "message": "…" }`.

| Method | Path | What |
|---|---|---|
| GET | `/health` | Liveness: the process is up |
| GET | `/ready` | Readiness: 503 while shutting down |
| GET | `/config` | `{ poll_interval_seconds }` |
| GET | `/sources[?refresh=1]` | Every source actually exercised: up, fresh, last data |
| GET | `/hsm/production?from&to[&grain]` | Production: Influx counter vs ERP, per plant day / week / month |
| GET | `/hsm/billets?from&to[&grain]` | Billets: Dicharged_Billet vs ERP INPUT_PCS |
| GET | `/hsm/yield?from&to[&grain]` | Mass yield: Influx net vs ERP |
| GET | `/hsm/running-rate?from&to[&grain]` | Production ÷ running hours, ERP rate beside it |
| GET | `/hsm/logsheet?from&to[&grain]` | ERP log sheet: balance, losses, quality, stores check |
| GET | `/hsm/sizes?from&to` | Produced / dispatched per strip size |
| GET | `/hsm/orders?from&to[&grain]` | Orders placed, plus the open order book |
| GET | `/hsm/stock?to` | Finished stock in the FG yard |
| GET | `/hsm/live` | Billets today, stand groups on/off |
| GET | `/hsm/stands?group&metric&hours` | Stand trend (current / rpm / force / on-off) |
| GET | `/erp` | ERP sync state |
| GET | `/historian/catalogue[?measurement]` | Historian discovery |
| GET | `/ems/equipment` | Meter feeders seen in the last day |
| GET | `/logbook[?days]` | Logbook session (and form counts once mapped) |
| POST | `/auth/sso` | `{ token }` — the IOsense SSO token → an app session (public) |
| GET | `/auth/session` | Is the caller's session valid? (public) |

Query rules:
- `from` and `to` are plant dates (`YYYY-MM-DD`, 06:00 → 06:00 IST), at most 400 days apart.
- `grain` is `day`, `week` or `month`.
- Bad input returns a named 400: `bad_range`, `range_too_long`, `bad_grain`, `bad_group`, `bad_metric` or `bad_hours`.

## Access (IOsense SSO)

The app opens only from IOsense:

1. IOsense opens the dashboard with a one-time SSO token in the URL (`?token=…`, valid 60 s).
2. The frontend sends it to `POST /api/auth/sso`.
3. The backend exchanges it with IOsense (functionID `validateSSOToken`). It then issues an
   app session: a JWT signed with `SESSION_SECRET`, valid for `SESSION_TTL_HOURS`, carrying
   only the IOsense `userId` and `organisation`. IOsense's own JWT never reaches the browser.
4. Every other route checks that session.

Without one (opened directly, a reused or expired link, or a session that has ended), the
frontend shows a "Open from IOsense" screen instead of the dashboard.

Optional: `AUTH_ALLOWED_ORGANISATIONS` limits sign-in to given IOsense organisations.
`AUTH_DISABLED=true` opens every route for **local development only**; the service refuses
to start with it in production.

## Run locally

```bash
cd backend
cp .env.example .env          # fill in the plant connections
npm install
npm run sync:erp              # pull the ERP cache once (read-only)
npm run dev                   # http://localhost:4000, reloads on change
```

| Command | Does |
|---|---|
| `npm run dev` | Dev server with reload (`tsx watch`) |
| `npm start` | Build to `dist/` (automatic, via `prestart`) and run it — works with only `npm install && npm start` |
| `npm run typecheck` | `tsc --noEmit` over src and tests |
| `npm test` | Unit and route tests (no plant access) |
| `npm run test:live` | Tests against the real systems (needs `.env` and network) |
| `npm run sync:erp` / `npm run sync:erp:prod` | One ERP sync (dev / built) |

## Configuration

Every variable is listed in `.env.example`. Locally they are read from `backend/.env`; in
production, set them on the platform.

| Variable | Default | Notes |
|---|---|---|
| `PORT` / `HOST` | `4000` / `0.0.0.0` | |
| `NODE_ENV` | `development` | `production` in deployment |
| `CORS_ORIGINS` | *(none)* | The frontend origin(s), comma-separated. Required when the browser calls the API directly. `*` is refused in production. |
| `TRUST_PROXY` | `false` | `true` behind a load balancer, so rate limits and logs see the real client IP |
| `RATE_LIMIT_PER_MINUTE` | `600` | Per client IP; health and ready are exempt |
| `ERP_SYNC_INTERVAL_MINUTES` | `0` | e.g. `180` to sync inside the service; `0` = run the job externally |
| `ERP_CACHE_DIR` | `data` | Put this on a persistent volume |
| `INFLUX_*`, `EMS_INFLUX_*`, `ERP_*`, `IOSENSE_*` | | Source connections; a missing one reads as "not configured", never as a crash |

A bad HTTP setting stops startup with the variable named. A missing source connection does
not stop startup: that source simply reports itself as down.

## Deploy

The backend is its own deployment. It needs **network access to the plant** (historian,
meters and ERP over the VPN), so it runs where that network is reachable. The frontend
doesn't need that access.

1. **Build and run.** With Docker, use `docker build -t msp-rollingmill-api backend/` and run
   the image with the variables set and a volume on `/app/data`. Without Docker, run
   `npm ci && npm run build && npm ci --omit=dev && npm start`.
2. **Oracle Instant Client** (ERP sync only, thick mode). The image installs it, and
   `ERP_ORACLE_CLIENT_DIR` points to it. Build with `--build-arg ORACLE_CLIENT=false` if the
   sync runs elsewhere.
3. **ERP sync.** Pick one:
   - set `ERP_SYNC_INTERVAL_MINUTES=180`, or
   - schedule `node dist/erp-sync.js` (cron, a Kubernetes CronJob, or the platform's
     scheduled jobs) on the same `data` volume.

   The ERP is entered 1–2 days late, so every few hours is plenty.
4. **Probes.** Use `GET /api/health` for liveness and `GET /api/ready` for readiness.
   `SIGTERM` drains: readiness turns 503, in-flight requests finish, then the process exits.
5. **Connect the frontend.** The frontend is a static site, so the browser calls this API
   directly:
   - build the frontend with `NEXT_PUBLIC_API_BASE_URL=https://<api-host>`;
   - set `CORS_ORIGINS=https://<frontend-host>` here.

   The API must be served over `https` when the site is.

Logs are JSON lines (pino), one per request, carrying the request id. `authorization`,
`cookie` and the SSO token are redacted.
