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

current_exec_path() {
  pm2 jlist | node -e "
    let raw = '';
    process.stdin.on('data', (chunk) => { raw += chunk; });
    process.stdin.on('end', () => {
      try {
        const apps = JSON.parse(raw);
        const app = apps.find((item) => item.name === 'aris-backend');
        if (!app) return;
        process.stdout.write(String(app.pm2_env?.pm_exec_path || ''));
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

expected_exec_path="${BACKEND_DIR}/dist/index.js"

echo "[deploy:backend-zd] applying aris-backend PM2 definition via startOrReload"
pm2 startOrReload "$ECOSYSTEM_FILE" --only aris-backend --env production --update-env

mode="$(current_exec_mode || true)"
exec_path="$(current_exec_path || true)"
if [[ "$mode" != "cluster_mode" || "$exec_path" != "$expected_exec_path" ]]; then
  echo "[deploy:backend-zd] PM2 definition did not converge" >&2
  echo "[deploy:backend-zd] mode=${mode:-<empty>} exec_path=${exec_path:-<empty>} expected_exec_path=${expected_exec_path}" >&2
  exit 1
fi

if ! wait_for_backend_health "$HEALTH_TIMEOUT_SECONDS"; then
  echo "[deploy:backend-zd] backend health check failed on :${BACKEND_PORT}" >&2
  pm2 logs aris-backend --lines 120 --nostream || true
  exit 1
fi

echo "[deploy:backend-zd] backend is healthy"
pm2 list | sed -n '1,20p'
