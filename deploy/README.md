# ARIS Docker Deployment

This deployment setup runs `aris-web`, `aris-backend`, and PostgreSQL together with Docker Compose.

## 1. Prepare env file

```bash
cp deploy/.env.example deploy/.env
```

Set at minimum:

- `AUTH_JWT_SECRET`
- `ARIS_ADMIN_EMAIL`
- `ARIS_ADMIN_PASSWORD`
- `RUNTIME_API_TOKEN`
- `POSTGRES_PASSWORD`

Use unique random values. Do not use placeholder or generic defaults.

## 2. Start local stack

ARIS uses a hybrid deployment model:
- **Web & DB**: Docker Compose
- **Backend**: PM2 (running on Host for OS-level control)

### 2.1 Backend (Host)
```bash
# In services/aris-backend
npm install
npm run build
# Start with pm2 (token is read from deploy/services env files automatically)
pm2 start deploy/ecosystem.config.cjs --env production

# Zero-downtime backend deploy:
./deploy/deploy_backend_zero_downtime.sh
```

### 2.2 Web & DB (Docker)
```bash
./deploy/deploy_web.sh
```

`deploy_web.sh` now runs zero-downtime blue/green deployment:
- Build `aris-web-blue` / `aris-web-green` slots alternately.
- Start the inactive slot and wait for container + HTTP health checks.
- Atomically switch nginx upstream snippet to the new slot port and reload nginx.
- Drain a short period (`WEB_DRAIN_SECONDS`) and stop the previous slot.
- Stop legacy single-slot `aris-web` container by default (`STOP_LEGACY_WEB=1`).

Important operational rule:
- Use `./deploy/deploy_web.sh` (or `./deploy/deploy_zero_downtime.sh`) as the only web deploy entrypoint.
- Do not deploy web with `docker compose ... up -d --build aris-web` in zero-downtime mode. That updates the legacy single-slot service, while nginx may still route to blue/green slot ports.

Useful overrides:
```bash
WEB_DRAIN_SECONDS=12 ./deploy/deploy_web.sh
PULL_BASE=1 ./deploy/deploy_web.sh
SKIP_BUILD_IF_UNCHANGED=0 ./deploy/deploy_web.sh
STOP_LEGACY_WEB=0 ./deploy/deploy_web.sh
```

Access web UI:

- `http://localhost:3300` (legacy single-slot)
- Blue slot port: `WEB_BLUE_PORT` (default `3301`)
- Green slot port: `WEB_GREEN_PORT` (default `3302`)

Route/slot verification after deploy:
```bash
cat deploy/.state/aris-web.active-slot
sudo cat /etc/nginx/snippets/aris-web-upstream.conf
docker compose --env-file deploy/.env ps aris-web-blue aris-web-green aris-web
```

If latest code is not reflected:
```bash
# Re-run blue/green deploy and stop legacy service
STOP_LEGACY_WEB=1 ./deploy/deploy_web.sh
```

### 2.3 Backend (PM2 zero-downtime reload)
```bash
./deploy/deploy_backend_zero_downtime.sh
```

`deploy/ecosystem.config.cjs` runs `aris-backend` in PM2 cluster mode so `pm2 reload` performs graceful worker replacement.
For strict no-downtime behavior, run with at least 2 workers:
```bash
# deploy/.env
ARIS_BACKEND_INSTANCES=2
```
With `ARIS_BACKEND_INSTANCES=1` (default), reload is graceful but brief connection drops are still possible during process replacement.

### 2.4 Full zero-downtime deploy (backend + web)
```bash
./deploy/deploy_zero_downtime.sh
```

## 3. Start with domain + HTTPS (Caddy)

Set `ARIS_DOMAIN` and `APP_BASE_URL` in `deploy/.env`, then:

```bash
docker compose --env-file deploy/.env --profile edge up -d --build
```

Caddy will request and renew TLS certificates automatically after DNS points to this server.

## 4. Current production host note

On this host, ports `80/443` are already served by system nginx.  
`aris.lawdigest.cloud` is connected through nginx reverse proxy and is switched between blue/green slot ports by deployment script.

## 5. Useful commands

```bash
docker compose --env-file deploy/.env logs -f aris-web
docker compose --env-file deploy/.env logs -f aris-web-blue aris-web-green
docker compose --env-file deploy/.env ps
docker compose --env-file deploy/.env down
docker system df -v
pm2 logs aris-backend --lines 120
```

### Runtime auth check (recommended after token changes)

```bash
./deploy/check-runtime-connection.sh
```

This verifies:

- `deploy/.env`와 `services/aris-backend/.env`의 `RUNTIME_API_TOKEN` 일치 여부
- 백엔드 `/health` 접근성
- `/v1/sessions`에 토큰이 없는 경우 401 반환
- `/v1/sessions`를 `deploy/.env` 토큰으로 호출해 200이 나오는지

`401`이 반복되면 다음 항목을 점검하세요:

1. `deploy/.env`의 `RUNTIME_API_TOKEN`이 실제 PM2 백엔드 프로세스 환경으로 반영됐는지
2. `services/aris-backend/.env`의 `RUNTIME_API_TOKEN`이 동일한지
3. 토큰 변경 후 백엔드 reload가 되었는지 (`./deploy/deploy_backend_zero_downtime.sh`)
