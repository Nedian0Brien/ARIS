#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/services/aris-backend"
ECOSYSTEM_FILE="${ROOT_DIR}/deploy/ecosystem.config.cjs"
BACKEND_PORT="${BACKEND_PORT:-4080}"
HEALTH_TIMEOUT_SECONDS="${BACKEND_HEALTH_TIMEOUT_SECONDS:-60}"
COMMON_GIT_DIR="$(git -C "$ROOT_DIR" rev-parse --git-common-dir)"
SHARED_REPO_ROOT="$(cd "${COMMON_GIT_DIR}/.." && pwd)"
PM2_RUNTIME_DIR="${ARIS_BACKEND_PM2_RUNTIME_DIR:-${SHARED_REPO_ROOT}/.runtime/aris-backend}"

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

prepare_pm2_runtime_dir() {
  local runtime_dir="$1"

  mkdir -p "$runtime_dir"
  rm -rf "${runtime_dir}/dist.next"
  cp -a "${BACKEND_DIR}/dist" "${runtime_dir}/dist.next"
  rm -rf "${runtime_dir}/dist"
  mv "${runtime_dir}/dist.next" "${runtime_dir}/dist"
  cp -a "${BACKEND_DIR}/package.json" "${runtime_dir}/package.json"
  ln -sfn "${SHARED_REPO_ROOT}/services/aris-backend/node_modules" "${runtime_dir}/node_modules"
}

echo "[deploy:backend-zd] building backend"
npm --prefix "$BACKEND_DIR" run build

echo "[deploy:backend-zd] staging backend runtime files"
prepare_pm2_runtime_dir "$PM2_RUNTIME_DIR"

export ARIS_BACKEND_PM2_CWD="$PM2_RUNTIME_DIR"
export ARIS_BACKEND_PM2_SCRIPT="./dist/index.js"

expected_exec_path="${PM2_RUNTIME_DIR}/dist/index.js"
mode="$(current_exec_mode || true)"
exec_path="$(current_exec_path || true)"

if [[ "$mode" != "cluster_mode" || "$exec_path" != "$expected_exec_path" ]]; then
  echo "[deploy:backend-zd] performing protected one-time PM2 cutover"
  cutover_started=1
  cutover_complete=0
  trap 'if [[ "${cutover_started:-0}" == "1" && "${cutover_complete:-0}" == "0" ]]; then echo "[deploy:backend-zd] cutover interrupted; attempting backend start" >&2; pm2 start "$ECOSYSTEM_FILE" --only aris-backend --env production --update-env >/dev/null 2>&1 || true; fi' EXIT INT TERM
  pm2 delete aris-backend >/dev/null 2>&1 || true
  pm2 start "$ECOSYSTEM_FILE" --only aris-backend --env production --update-env
  cutover_complete=1
  trap - EXIT INT TERM
else
  echo "[deploy:backend-zd] applying aris-backend PM2 definition via startOrReload"
  pm2 startOrReload "$ECOSYSTEM_FILE" --only aris-backend --env production --update-env
fi

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
