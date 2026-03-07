# ARIS Backend

Fastify runtime backend for ARIS.

## What It Provides

- Bearer-token protected runtime API (`/v1/*`, `/v3/*`)
- Session lifecycle and control actions
- Session message append/read API for UI timelines
- Permission request/decision API
- Runtime status endpoint for session process state
- Two runtime modes:
  - `mock`: local in-memory runtime
  - `happy`: proxy/bridge to Happy-compatible runtime

## API Surface

- `GET /health`
- `GET /v1/sessions`
- `POST /v1/sessions`
- `POST /v1/sessions/:sessionId/actions`
- `GET /v1/sessions/:sessionId/runtime`
- `GET /v3/sessions/:sessionId/messages`
- `POST /v3/sessions/:sessionId/messages`
- `GET /v1/permissions?state=pending|approved|denied`
- `POST /v1/permissions`
- `POST /v1/permissions/:permissionId/decision`

## Environment

Create env file:

```bash
cp .env.example .env
```

Important values:
- `RUNTIME_API_TOKEN` (must match web `HAPPY_SERVER_TOKEN`)
- `RUNTIME_BACKEND=mock|happy`
- `HAPPY_SERVER_URL` / `HAPPY_SERVER_TOKEN` (when `happy` mode)
- `DEFAULT_PROJECT_PATH`
- `HOST_PROJECTS_ROOT` (optional)

## Quick Start

```bash
npm install
npm run dev
```

Default port: `4080`

## Scripts

- `npm run dev`: watch mode
- `npm run build`: TypeScript build
- `npm run start`: run built server
- `npm run typecheck`: static type check
- `npm run test`: run Vitest

## Token Wiring With aris-web

Use the same token in both services:

- `services/aris-backend/.env`: `RUNTIME_API_TOKEN=...`
- `services/aris-web/.env`:
  - `HAPPY_SERVER_URL=http://localhost:4080`
  - `HAPPY_SERVER_TOKEN=...`

## Notes

- `mock` mode is in-memory; restarting clears runtime state.
- `happy` mode should point at a reachable Happy server and valid token.
