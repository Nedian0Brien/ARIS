# ARIS Backend

Standalone runtime backend service for ARIS, designed to be **independent of `references/`**.

## What it provides

- Happy-compatible endpoints consumed by `services/aris-web`
- Bearer-token protected runtime API (`/v1/*`, `/v3/*`)
- In-memory runtime store for sessions/messages/permissions/actions
- Local development seed data

## API surface

- `GET /health`
- `GET /v1/sessions`
- `POST /v1/sessions`
- `POST /v1/sessions/:sessionId/actions`
- `GET /v3/sessions/:sessionId/messages`
- `POST /v3/sessions/:sessionId/messages`
- `GET /v1/permissions?state=pending|approved|denied`
- `POST /v1/permissions`
- `POST /v1/permissions/:permissionId/decision`

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
```

Default port: `4080`

## Token wiring for aris-web

Use the same token in both services:

- `services/aris-backend/.env` -> `RUNTIME_API_TOKEN=...`
- `services/aris-web/.env` ->
  - `HAPPY_SERVER_URL=http://localhost:4080`
  - `HAPPY_SERVER_TOKEN=...`

## Notes

- Current store is in-memory; restart resets data.
- Replace `RuntimeStore` with persistent DB adapter in next phase.
