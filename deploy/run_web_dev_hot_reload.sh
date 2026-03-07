#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${DEPLOY_ENV_FILE:-${ROOT_DIR}/deploy/.env}"
WEB_DEV_PORT="${WEB_DEV_PORT:-3305}"
WEB_DEV_HOST="${WEB_DEV_HOST:-0.0.0.0}"
SKIP_DB_PREPARE="${SKIP_DB_PREPARE:-0}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[web-dev] env file not found: ${ENV_FILE}" >&2
  echo "[web-dev] create it first: cp deploy/.env.example deploy/.env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

export NODE_ENV=development
export HOST="${WEB_DEV_HOST}"
export PORT="${WEB_DEV_PORT}"
export APP_BASE_URL="${DEV_APP_BASE_URL:-http://127.0.0.1:${WEB_DEV_PORT}}"

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
echo "[web-dev] save files to see immediate reload in browser"
exec npm run dev
