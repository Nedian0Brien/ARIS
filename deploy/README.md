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

## 2. Start local stack

```bash
docker compose --env-file deploy/.env up -d --build
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
```
