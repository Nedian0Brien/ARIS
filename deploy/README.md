# ARIS Deployment Guide

ARIS production deploy uses a hybrid model:
- Web: Docker Compose blue/green slots (`aris-web-blue`, `aris-web-green`)
- Backend: PM2 cluster reload on host
- Reverse proxy: system nginx switches upstream between slot ports

## Official entrypoints

Use these commands as the standard deployment entrypoints:

```bash
mkdir -p /home/ubuntu/.config/aris
cp deploy/.env.example /home/ubuntu/.config/aris/prod.env
export DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env

./deploy/deploy_backend_zero_downtime.sh
./deploy/deploy_web.sh
./deploy/deploy_zero_downtime.sh
```

Production deployment policy:
- The official deployment baseline is the script entrypoints above.
- GitHub Actions deployment workflow is manual-only and should not be treated as the default production trigger.

- `deploy_backend_zero_downtime.sh`: backend build + PM2 zero-downtime reload
- `deploy_web.sh`: web blue/green deploy and nginx upstream switch
- `deploy_zero_downtime.sh`: backend then web

All deploy scripts now require `DEPLOY_ENV_FILE` and production should use `/home/ubuntu/.config/aris/prod.env` as the single source of truth.

For runtime auth naming:
- `services/aris-web` uses `RUNTIME_API_URL` / `RUNTIME_API_TOKEN`
- `services/aris-backend` uses `HAPPY_SERVER_URL` / `HAPPY_SERVER_TOKEN` only for upstream Happy runtime access

`deploy/deploy_web_zero_downtime.sh` remains only as a compatibility wrapper. New docs and automation should use `deploy/deploy_web.sh`.

## Directory layout

```text
deploy/
├── deploy_backend_zero_downtime.sh
├── deploy_web.sh
├── deploy_zero_downtime.sh
├── deploy_web_zero_downtime.sh
├── internal/
├── ops/
├── dev/
├── legacy/
├── lib/
├── ecosystem.config.cjs
└── .env.example
```

## Before deploying

1. Confirm branch and commit are correct.
2. Confirm `/home/ubuntu/.config/aris/prod.env` exists and export `DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env`.
3. Ensure required keys are set: `APP_BASE_URL`, `AUTH_JWT_SECRET`, `ARIS_ADMIN_EMAIL`, `ARIS_ADMIN_PASSWORD`, `POSTGRES_PASSWORD`, `RUNTIME_API_TOKEN`, `RUNTIME_BACKEND`, `SSH_KEY_ENCRYPTION_SECRET`.
4. If `RUNTIME_BACKEND=happy`, also ensure `HAPPY_SERVER_URL`, `HAPPY_SERVER_TOKEN` are set.
5. If `services/aris-backend/.env` is still maintained for local checks, keep its `RUNTIME_API_TOKEN` aligned with `prod.env`.
6. If deployment is needed, run the appropriate script entrypoint directly and do not assume that `main` push alone performed production deployment.
7. After running a deployment script, complete the health checks in this document before reporting completion.

## Standard deployment flows

### Backend only

```bash
cd services/aris-backend && npx prisma migrate deploy && cd /home/ubuntu/project/ARIS
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env ./deploy/deploy_backend_zero_downtime.sh
```

This builds `services/aris-backend`, stages runtime files under `.runtime/aris-backend`, then reloads PM2 in cluster mode.

When the backend release contains Prisma schema changes:
- Run `npx prisma migrate deploy` in `services/aris-backend` before the backend deploy script.
- Keep `ARIS_BACKEND_DRAIN_TIMEOUT_MS` aligned with the maximum time you want in-flight agent runs to survive a PM2 reload.
- `deploy/ecosystem.config.cjs` now maps `ARIS_BACKEND_DRAIN_TIMEOUT_MS` to PM2 `kill_timeout`, so reloads wait for run draining instead of terminating immediately.

### Web only

```bash
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env ./deploy/deploy_web.sh
```

When the command is executed from a git worktree, the default `deploy/.state`
and `deploy/.logs` targets now resolve against the shared repo root, not the
worktree-local copy. You can still override them explicitly with
`DEPLOY_STATE_DIR` and `DEPLOY_LOG_DIR` if a different location is required.

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
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env ARIS_BACKEND_DRAIN_TIMEOUT_MS=600000 ./deploy/deploy_backend_zero_downtime.sh
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env WEB_DRAIN_SECONDS=12 ./deploy/deploy_web.sh
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env PULL_BASE=1 ./deploy/deploy_web.sh
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env SKIP_BUILD_IF_UNCHANGED=0 ./deploy/deploy_web.sh
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env STOP_LEGACY_WEB=0 ./deploy/deploy_web.sh
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env WEB_PRUNE_MODE=aggressive WEB_PRUNE_ASYNC=1 ./deploy/deploy_web.sh
```

### Full deploy

```bash
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env ./deploy/deploy_zero_downtime.sh
```

## Health checks after deploy

```bash
docker compose --env-file /home/ubuntu/.config/aris/prod.env ps aris-web-blue aris-web-green
docker compose --env-file /home/ubuntu/.config/aris/prod.env logs --tail=120 aris-web-blue aris-web-green
pm2 logs aris-backend --lines 120 --nostream
curl -sS http://127.0.0.1:4080/health
```

Recommended runtime continuity checks after a backend deploy:
- Start a long-running agent turn and confirm `/v1/sessions/{id}/runtime` stays `isRunning=true` during `pm2 startOrReload`.
- While the old worker is draining, approve one pending permission and confirm the turn resumes instead of hanging.
- Trigger `abort` or disconnected-chat `retry` once during the drain window and confirm the action is honored by the active run/new worker.

Current web routing expectations:
- Production traffic: `https://aris.lawdigest.cloud` through nginx
- Active slot local ports: `WEB_BLUE_PORT` (default `3301`), `WEB_GREEN_PORT` (default `3302`)
- `localhost:3300` is legacy single-slot behavior, not the standard production verification target

## Operational helpers

Runtime connectivity check:

```bash
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env ./deploy/ops/check-runtime-connection.sh
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
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env ./deploy/dev/run_web_dev_hot_reload.sh
```

Optional fast restart:

```bash
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env SKIP_DB_PREPARE=1 ./deploy/dev/run_web_dev_hot_reload.sh
```

## Legacy fallback

The previous single-slot web deploy script is preserved at:

```bash
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env ./deploy/legacy/deploy_web_legacy.sh
```

### Web deploy cleanup behavior

`deploy/web_zero_downtime.sh` runs optional post-deploy cleanup by default (`WEB_PRUNE_MODE=light`).

```bash
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env WEB_PRUNE_MODE=off ./deploy/deploy_web.sh
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env WEB_PRUNE_MODE=light WEB_PRUNE_ASYNC=1 ./deploy/deploy_web.sh
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env WEB_PRUNE_MODE=aggressive WEB_PRUNE_CACHE_UNTIL=72h WEB_PRUNE_CACHE_KEEP_STORAGE=6gb ./deploy/deploy_web.sh
```

환경변수

- `WEB_PRUNE_MODE`: `off | light | aggressive`
  - `off`: 정리 비활성
  - `light`: `docker image prune -f` + builder 캐시 정리
  - `aggressive`: `docker image prune -af` + `docker container prune -f` + builder 캐시 정리
- `WEB_PRUNE_ASYNC`: `1`(기본, 백그라운드 정리) / `0`(동기식)
- `WEB_PRUNE_CACHE_UNTIL`: builder 캐시 `prune` 조건(예: `168h`, `72h`)
- `WEB_PRUNE_CACHE_KEEP_STORAGE`: `docker buildx prune --keep-storage`를 쓸 때의 상한(예: `8gb`, `12gb`)
- 로그: `deploy/.logs/web-prune.log`

Do not use it as the default production path unless explicitly required for rollback or incident handling.
