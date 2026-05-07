#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Run backend and web deploys in parallel when no Prisma schema migrations are
# present in the last commit. Set PARALLEL_DEPLOY=0 to force sequential, or
# ARIS_SCHEMA_CHANGED=1/0 to override automatic detection.
PARALLEL_DEPLOY="${PARALLEL_DEPLOY:-1}"

has_schema_change() {
  if [[ "${ARIS_SCHEMA_CHANGED:-}" == "1" ]]; then
    return 0
  fi
  if [[ "${ARIS_SCHEMA_CHANGED:-}" == "0" ]]; then
    return 1
  fi
  if git -C "$ROOT_DIR" rev-parse HEAD >/dev/null 2>&1; then
    local changed
    changed="$(git -C "$ROOT_DIR" diff --name-only HEAD~1..HEAD 2>/dev/null || true)"
    if echo "$changed" | grep -qE '^services/aris-backend/prisma/migrations/'; then
      return 0
    fi
  fi
  return 1
}

run_parallel() {
  local backend_log web_log
  backend_log="$(mktemp /tmp/aris-deploy-backend-XXXXXX.log)"
  web_log="$(mktemp /tmp/aris-deploy-web-XXXXXX.log)"

  "${ROOT_DIR}/deploy/deploy_backend_zero_downtime.sh" >"$backend_log" 2>&1 &
  local backend_pid=$!

  "${ROOT_DIR}/deploy/deploy_web.sh" >"$web_log" 2>&1 &
  local web_pid=$!

  local backend_exit=0 web_exit=0
  wait "$backend_pid" || backend_exit=$?
  wait "$web_pid"     || web_exit=$?

  echo "[deploy:zero-downtime] --- backend log ---"
  cat "$backend_log"
  echo "[deploy:zero-downtime] --- web log ---"
  cat "$web_log"
  rm -f "$backend_log" "$web_log"

  if [[ "$backend_exit" -ne 0 ]]; then
    echo "[deploy:zero-downtime] backend deploy FAILED (exit ${backend_exit})" >&2
    return 1
  fi
  if [[ "$web_exit" -ne 0 ]]; then
    echo "[deploy:zero-downtime] web deploy FAILED (exit ${web_exit})" >&2
    return 1
  fi
}

if [[ "$PARALLEL_DEPLOY" == "1" ]] && ! has_schema_change; then
  echo "[deploy:zero-downtime] no schema changes detected — running backend+web in parallel"
  run_parallel
else
  if has_schema_change; then
    echo "[deploy:zero-downtime] schema changes detected — running backend first, then web"
  else
    echo "[deploy:zero-downtime] PARALLEL_DEPLOY=0 — running sequentially"
  fi
  "${ROOT_DIR}/deploy/deploy_backend_zero_downtime.sh"
  "${ROOT_DIR}/deploy/deploy_web.sh"
fi

echo "[deploy:zero-downtime] complete"
