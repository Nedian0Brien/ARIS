#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${ROOT_DIR}/deploy/lib/env.sh"
ENV_FILE="$(require_deploy_env_file "web-dev")"
WEB_DEV_PORT="${WEB_DEV_PORT:-3305}"
WEB_DEV_HOST="${WEB_DEV_HOST:-0.0.0.0}"
SKIP_DB_PREPARE="${SKIP_DB_PREPARE:-0}"

require_env_keys "web-dev" "${ENV_FILE}" \
  AUTH_JWT_SECRET \
  ARIS_ADMIN_EMAIL \
  ARIS_ADMIN_PASSWORD \
  POSTGRES_PASSWORD \
  RUNTIME_API_TOKEN

# Load .env without executing shell code so values with spaces are handled safely.
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line//[[:space:]]/}" ]] && continue
  [[ "$line" != *"="* ]] && continue

  key="${line%%=*}"
  value="${line#*=}"

  # trim key/value outer spaces
  key="${key#"${key%%[![:space:]]*}"}"
  key="${key%"${key##*[![:space:]]}"}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"

  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value:1:${#value}-2}"
  fi

  export "${key}=${value}"
done < "${ENV_FILE}"

export NODE_ENV=development
export HOST="${WEB_DEV_HOST}"
export PORT="${WEB_DEV_PORT}"
export ARIS_WEB_ASSET_PREFIX="${ARIS_WEB_ASSET_PREFIX:-/proxy/${WEB_DEV_PORT}}"
export NEXT_PUBLIC_ARIS_WEB_ASSET_PREFIX="${NEXT_PUBLIC_ARIS_WEB_ASSET_PREFIX:-${ARIS_WEB_ASSET_PREFIX}}"

if [[ -n "${DEV_APP_BASE_URL:-}" ]]; then
  export APP_BASE_URL="${DEV_APP_BASE_URL}"
elif [[ -n "${ARIS_DOMAIN:-}" ]]; then
  export APP_BASE_URL="https://${ARIS_DOMAIN}"
else
  export APP_BASE_URL="http://127.0.0.1:${WEB_DEV_PORT}"
fi

# Route web runtime calls through aris-backend by default in dev mode.
# This keeps API surface consistent (e.g. /v1/permissions) while backend proxies to happy runtime.
export RUNTIME_API_URL="${DEV_RUNTIME_API_URL:-${DEV_HAPPY_SERVER_URL:-http://127.0.0.1:4080}}"
if [[ -n "${DEV_RUNTIME_API_TOKEN:-}" ]]; then
  export RUNTIME_API_TOKEN="${DEV_RUNTIME_API_TOKEN}"
elif [[ -n "${DEV_HAPPY_SERVER_TOKEN:-}" ]]; then
  export RUNTIME_API_TOKEN="${DEV_HAPPY_SERVER_TOKEN}"
fi

# Host dev mode does not receive Docker Compose's DATABASE_URL injection.
# Build it from deploy env and point to the running postgres container IP.
if [[ -z "${DATABASE_URL:-}" ]]; then
  pg_user="${POSTGRES_USER:-postgres}"
  pg_pass="${POSTGRES_PASSWORD:-postgres}"
  pg_db="${POSTGRES_DB:-aris}"
  pg_port="${POSTGRES_PORT:-5432}"
  pg_host="${POSTGRES_HOST:-}"

  if [[ -z "$pg_host" ]]; then
    pg_host="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' aris-stack-postgres-1 2>/dev/null || true)"
  fi
  if [[ -z "$pg_host" ]]; then
    pg_host="127.0.0.1"
  fi

  export DATABASE_URL="postgresql://${pg_user}:${pg_pass}@${pg_host}:${pg_port}/${pg_db}"
  echo "[web-dev] DATABASE_URL was not set, using ${pg_host}:${pg_port}/${pg_db}"
fi

cd "${ROOT_DIR}/services/aris-web"

if [[ ! -d node_modules ]]; then
  echo "[web-dev] installing dependencies (npm ci)"
  npm ci
fi

echo "[web-dev] generating prisma client"
npm run prisma:generate

if [[ "${SKIP_DB_PREPARE}" != "1" ]]; then
  echo "[web-dev] applying database migrations"
  npm run prisma:deploy
  echo "[web-dev] seeding admin account"
  npm run seed
fi

echo "[web-dev] starting Next.js dev server on http://${WEB_DEV_HOST}:${WEB_DEV_PORT}"
echo "[web-dev] APP_BASE_URL=${APP_BASE_URL}"
echo "[web-dev] RUNTIME_API_URL=${RUNTIME_API_URL}"
echo "[web-dev] save files to see immediate reload in browser"
exec npm run dev
