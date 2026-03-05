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

# If already running, reload safely after token changes:
pm2 restart aris-backend --update-env
```

### 2.2 Web & DB (Docker)
```bash
./deploy/deploy_web.sh
```

`deploy_web.sh` defaults:
- Build with BuildKit enabled (`DOCKER_BUILDKIT=1`)
- Deploy only `aris-web` with `up -d --no-deps` (faster than full stack rebuild)
- Cleanup policy: `PRUNE_MODE=light`
  - `docker image prune -f` (dangling image only)
  - `docker buildx prune -f --keep-storage 8gb` (build cache 상한 유지, fallback: `docker builder prune`)

Useful overrides:
```bash
PRUNE_MODE=off ./deploy/deploy_web.sh
PRUNE_MODE=aggressive CACHE_UNTIL=72h ./deploy/deploy_web.sh
PULL_BASE=1 ./deploy/deploy_web.sh
```

Access web UI:

- `http://localhost:3300` (change `WEB_PORT` in `deploy/.env` if needed)

## 3. Start with domain + HTTPS (Caddy)

Set `ARIS_DOMAIN` and `APP_BASE_URL` in `deploy/.env`, then:

```bash
docker compose --env-file deploy/.env --profile edge up -d --build
```

Caddy will request and renew TLS certificates automatically after DNS points to this server.

## 4. Current production host note

On this host, ports `80/443` are already served by system nginx.  
`aris.lawdigest.cloud` is connected through nginx reverse proxy to `127.0.0.1:3300` with Let's Encrypt TLS.

## 5. Useful commands

```bash
docker compose --env-file deploy/.env logs -f aris-web
docker compose --env-file deploy/.env logs -f aris-backend
docker compose --env-file deploy/.env ps
docker compose --env-file deploy/.env down
docker system df -v
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
3. 토큰 변경 후 백엔드 재시작이 되었는지
