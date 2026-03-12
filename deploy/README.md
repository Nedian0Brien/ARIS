# ARIS Deployment Guide

ARIS production deploy uses a hybrid model:
- Web: Docker Compose blue/green slots (`aris-web-blue`, `aris-web-green`)
- Backend: PM2 cluster reload on host
- Reverse proxy: system nginx switches upstream between slot ports

## Official entrypoints

Use these three commands as the only standard deployment entrypoints:

```bash
./deploy/deploy_backend_zero_downtime.sh
./deploy/deploy_web.sh
./deploy/deploy_zero_downtime.sh
```

- `deploy_backend_zero_downtime.sh`: backend build + PM2 zero-downtime reload
- `deploy_web.sh`: web blue/green deploy and nginx upstream switch
- `deploy_zero_downtime.sh`: backend then web

`deploy/deploy_web_zero_downtime.sh` remains only as a compatibility wrapper. New docs and automation should use `deploy/deploy_web.sh`.

## Directory layout

```text
deploy/
├── deploy_backend_zero_downtime.sh   # official backend entrypoint
├── deploy_web.sh                     # official web entrypoint
├── deploy_zero_downtime.sh           # official full deploy entrypoint
├── deploy_web_zero_downtime.sh       # compatibility wrapper
├── internal/                         # actual deploy implementations
├── ops/                              # runtime checks / cleanup
├── dev/                              # local hot reload helpers
├── legacy/                           # deprecated scripts kept for fallback
├── ecosystem.config.cjs
├── .env.example
└── Caddyfile
```

## Before deploying

1. Confirm you are on the expected commit and branch.
2. Verify `deploy/.env` exists and required values are set.
3. Ensure `deploy/.env` and `services/aris-backend/.env` use the same `RUNTIME_API_TOKEN`.
4. Confirm nginx-managed production host is the target environment.

Minimum required secrets:
- `AUTH_JWT_SECRET`
- `ARIS_ADMIN_EMAIL`
- `ARIS_ADMIN_PASSWORD`
- `RUNTIME_API_TOKEN`
- `POSTGRES_PASSWORD`
- `SSH_KEY_ENCRYPTION_SECRET`

## Standard deployment flows

### Backend only

```bash
./deploy/deploy_backend_zero_downtime.sh
```

This builds `services/aris-backend`, stages runtime files under `.runtime/aris-backend`, then reloads PM2 in cluster mode.

### Web only

```bash
./deploy/deploy_web.sh
```

Default behavior:
- Builds the inactive slot image unless the web fingerprint is unchanged
- Starts the inactive slot (`aris-web-blue` or `aris-web-green`)
- Waits for container health and HTTP readiness on `/login`
- Switches nginx upstream to `WEB_BLUE_PORT` or `WEB_GREEN_PORT`
- Drains for `WEB_DRAIN_SECONDS` seconds
- Stops the previous slot
- Stops legacy `aris-web` by default (`STOP_LEGACY_WEB=1`)

Useful overrides:

```bash
WEB_DRAIN_SECONDS=12 ./deploy/deploy_web.sh
PULL_BASE=1 ./deploy/deploy_web.sh
SKIP_BUILD_IF_UNCHANGED=0 ./deploy/deploy_web.sh
STOP_LEGACY_WEB=0 ./deploy/deploy_web.sh
```

### Full deploy

```bash
./deploy/deploy_zero_downtime.sh
```

## Health checks after deploy

```bash
docker compose --env-file deploy/.env ps aris-web-blue aris-web-green
docker compose --env-file deploy/.env logs --tail=120 aris-web-blue aris-web-green
pm2 logs aris-backend --lines 120 --nostream
curl -sS http://127.0.0.1:4080/health
```

Current web routing expectations:
- Production traffic: `https://aris.lawdigest.cloud` through nginx
- Active slot local ports: `WEB_BLUE_PORT` (default `3301`), `WEB_GREEN_PORT` (default `3302`)
- `localhost:3300` is legacy single-slot behavior, not the standard production verification target

## Operational helpers

Runtime connectivity check:

```bash
./deploy/ops/check-runtime-connection.sh
```

This validates:
- token alignment between deploy/backend env files
- backend `/health`
- unauthenticated `/v1/sessions` returns `401`
- authenticated `/v1/sessions` returns `200`

Docker reclaimable cleanup:

```bash
./deploy/ops/prune_docker_reclaimable.sh
```

Daily cron example:

```bash
( crontab -l 2>/dev/null; echo "0 2 * * * /home/ubuntu/project/ARIS/deploy/ops/prune_docker_reclaimable.sh >> /home/ubuntu/project/ARIS/deploy/.logs/docker-prune-cron.log 2>&1" ) | crontab -
```

## Development helper

Use hot reload without touching production routing:

```bash
./deploy/dev/run_web_dev_hot_reload.sh
```

Optional fast restart:

```bash
SKIP_DB_PREPARE=1 ./deploy/dev/run_web_dev_hot_reload.sh
```

## Legacy fallback

The previous single-slot web deploy script is preserved at:

```bash
./deploy/legacy/deploy_web_legacy.sh
```

Do not use it as the default production path unless explicitly required for rollback or incident handling.
