#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/services/aris-backend"
ECOSYSTEM_FILE="${ROOT_DIR}/deploy/ecosystem.config.cjs"
BACKEND_PORT="${BACKEND_PORT:-4080}"
HEALTH_TIMEOUT_SECONDS="${BACKEND_HEALTH_TIMEOUT_SECONDS:-60}"

cd "$ROOT_DIR"

current_exec_mode() {
  pm2 jlist | node -e "
    let raw = '';
    process.stdin.on('data', (chunk) => { raw += chunk; });
    process.stdin.on('end', () => {
      try {
        const apps = JSON.parse(raw);
        const app = apps.find((item) => item.name === 'aris-backend');
        if (!app) return;
        process.stdout.write(String(app.pm2_env?.exec_mode || ''));
      } catch {
        process.exit(0);
      }
    });
  "
}

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

mode="$(current_exec_mode || true)"
if [[ "$mode" != "cluster_mode" ]]; then
  echo "[deploy:backend-zd] migrating aris-backend to PM2 cluster mode (one-time cutover)"
  pm2 delete aris-backend >/dev/null 2>&1 || true
  pm2 start "$ECOSYSTEM_FILE" --only aris-backend --env production --update-env
else
  echo "[deploy:backend-zd] reloading aris-backend in cluster mode"
  pm2 reload "$ECOSYSTEM_FILE" --only aris-backend --env production --update-env
fi

if ! wait_for_backend_health "$HEALTH_TIMEOUT_SECONDS"; then
  echo "[deploy:backend-zd] backend health check failed on :${BACKEND_PORT}" >&2
  pm2 logs aris-backend --lines 120 --nostream || true
  exit 1
fi

echo "[deploy:backend-zd] backend is healthy"
pm2 list | sed -n '1,20p'
