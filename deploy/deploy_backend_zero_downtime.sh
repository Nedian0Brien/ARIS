#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/services/aris-backend"
ECOSYSTEM_FILE="${ROOT_DIR}/deploy/ecosystem.config.cjs"
BACKEND_PORT="${BACKEND_PORT:-4080}"
HEALTH_TIMEOUT_SECONDS="${BACKEND_HEALTH_TIMEOUT_SECONDS:-60}"

wait_for_backend_health() {
  local timeout="$1"
  local i code
  for ((i=1; i<=timeout; i++)); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 4 "http://127.0.0.1:${BACKEND_PORT}/health" || true)"
    if [[ "$code" == "200" ]]; then
      return 0
    fi
    sleep 1
  done
  return 1
}

echo "[deploy:backend-zd] building backend"
npm --prefix "$BACKEND_DIR" run build

echo "[deploy:backend-zd] reloading backend via PM2 (zero-downtime mode)"
if pm2 describe aris-backend >/dev/null 2>&1; then
  pm2 reload "$ECOSYSTEM_FILE" --only aris-backend --env production --update-env
else
  pm2 start "$ECOSYSTEM_FILE" --only aris-backend --env production --update-env
fi

if ! wait_for_backend_health "$HEALTH_TIMEOUT_SECONDS"; then
  echo "[deploy:backend-zd] backend health check failed on :${BACKEND_PORT}" >&2
  pm2 logs aris-backend --lines 120 --nostream || true
  exit 1
fi

echo "[deploy:backend-zd] backend is healthy"
pm2 list | sed -n '1,20p'
