# Domain Connection Checklist (ARIS)

## 1. DNS

Create DNS records to your server public IP:

- `A` record: `ARIS_DOMAIN` -> `<server-ip>`

Current target:

- `aris.lawdigest.cloud` -> `140.245.74.246`

## 2. Firewall

Open inbound ports:

- `80/tcp` (HTTP, ACME challenge)
- `443/tcp` (HTTPS)

## 3. Compose env

In `/home/ubuntu/.config/aris/prod.env`:

- `ARIS_DOMAIN=aris.lawdigest.cloud`
- `APP_BASE_URL=https://aris.lawdigest.cloud`
- `AUTH_JWT_SECRET=<long-random-secret>`
- `RUNTIME_API_TOKEN=<long-random-token>`
- `ARIS_ADMIN_PASSWORD=<strong-random-password>`
- `POSTGRES_PASSWORD=<strong-random-password>`

## 4. Start edge profile

```bash
docker compose --env-file /home/ubuntu/.config/aris/prod.env --profile edge up -d --build
```

## 5. Verify

- `https://<ARIS_DOMAIN>/login` opens
- TLS certificate is valid
- Login works with `ARIS_ADMIN_EMAIL`

## 6. Hardening (recommended)

- Keep `WEB_PORT` closed externally when domain mode is active (optional reverse-proxy-only exposure)
- Rotate `AUTH_JWT_SECRET` and `RUNTIME_API_TOKEN` periodically
- Backup PostgreSQL volume (`postgres_data`) regularly
