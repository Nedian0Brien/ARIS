#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${ROOT_DIR}/deploy/lib/env.sh"
source "${ROOT_DIR}/deploy/lib/nginx.sh"

ENV_FILE="$(require_deploy_env_file "deploy:web-zd")"
SHARED_REPO_ROOT="${ARIS_SHARED_REPO_ROOT:-$(resolve_shared_repo_root "$ROOT_DIR")}"
STATE_DIR="$(resolve_deploy_state_dir "$SHARED_REPO_ROOT")"
LOG_DIR="$(resolve_deploy_log_dir "$SHARED_REPO_ROOT")"
ACTIVE_SLOT_FILE="${STATE_DIR}/aris-web.active-slot"
FINGERPRINT_FILE="${STATE_DIR}/aris-web.build-fingerprint"

WEB_SLOT_DEFAULT="${WEB_SLOT_DEFAULT:-blue}"
WEB_DRAIN_SECONDS="${WEB_DRAIN_SECONDS:-6}"
WEB_HEALTH_TIMEOUT_SECONDS="${WEB_HEALTH_TIMEOUT_SECONDS:-120}"
SKIP_BUILD_IF_UNCHANGED="${SKIP_BUILD_IF_UNCHANGED:-1}"
PULL_BASE="${PULL_BASE:-0}"
STOP_LEGACY_WEB="${STOP_LEGACY_WEB:-1}"
WEB_PRUNE_MODE="${WEB_PRUNE_MODE:-light}"              # off | light | aggressive
WEB_PRUNE_ASYNC="${WEB_PRUNE_ASYNC:-1}"               # 1 to run pruning in background
WEB_PRUNE_CACHE_UNTIL="${WEB_PRUNE_CACHE_UNTIL:-168h}" # e.g. 24h, 168h
WEB_PRUNE_CACHE_KEEP_STORAGE="${WEB_PRUNE_CACHE_KEEP_STORAGE:-8gb}"

ARIS_WEB_IMAGE="${ARIS_WEB_IMAGE:-aris-stack-aris-web:latest}"
NGINX_SITE="${ARIS_NGINX_SITE:-/etc/nginx/sites-available/aris.lawdigest.cloud}"
NGINX_SNIPPET="${ARIS_WEB_UPSTREAM_SNIPPET:-/etc/nginx/snippets/aris-web-upstream.conf}"

cd "$ROOT_DIR"
require_env_keys "deploy:web-zd" "$ENV_FILE" \
  APP_BASE_URL \
  AUTH_JWT_SECRET \
  ARIS_ADMIN_EMAIL \
  ARIS_ADMIN_PASSWORD \
  POSTGRES_PASSWORD \
  RUNTIME_API_TOKEN \
  SSH_KEY_ENCRYPTION_SECRET

if [[ "$WEB_SLOT_DEFAULT" != "blue" && "$WEB_SLOT_DEFAULT" != "green" ]]; then
  echo "[deploy:web-zd] invalid WEB_SLOT_DEFAULT: $WEB_SLOT_DEFAULT (blue|green)" >&2
  exit 1
fi
if [[ "$WEB_PRUNE_MODE" != "off" && "$WEB_PRUNE_MODE" != "light" && "$WEB_PRUNE_MODE" != "aggressive" ]]; then
  echo "[deploy:web-zd] invalid WEB_PRUNE_MODE: $WEB_PRUNE_MODE (off|light|aggressive)" >&2
  exit 1
fi

mkdir -p "$STATE_DIR" "$LOG_DIR"

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

compose() {
  docker compose --env-file "$ENV_FILE" "$@"
}

port_for_slot() {
  local slot="$1"
  local env_key default_port val
  if [[ "$slot" == "blue" ]]; then
    env_key="WEB_BLUE_PORT"
    default_port="3301"
  else
    env_key="WEB_GREEN_PORT"
    default_port="3302"
  fi
  val="$(read_env_value "$ENV_FILE" "$env_key" || true)"
  if [[ -z "$val" ]]; then
    echo "$default_port"
  else
    echo "$val"
  fi
}

other_slot() {
  local slot="$1"
  if [[ "$slot" == "blue" ]]; then
    echo "green"
  else
    echo "blue"
  fi
}

slot_from_port() {
  local port="$1"
  local blue_port green_port
  blue_port="$(port_for_slot blue)"
  green_port="$(port_for_slot green)"
  if [[ "$port" == "$blue_port" ]]; then
    echo "blue"
    return
  fi
  if [[ "$port" == "$green_port" ]]; then
    echo "green"
    return
  fi
  echo ""
}

active_slot_from_nginx_snippet() {
  if ! sudo test -f "$NGINX_SNIPPET"; then
    echo ""
    return
  fi
  local port
  port="$(sudo sed -nE 's#.*127\.0\.0\.1:([0-9]+).*#\1#p' "$NGINX_SNIPPET" | head -n1)"
  if [[ -z "$port" ]]; then
    echo ""
    return
  fi
  slot_from_port "$port"
}

resolve_active_slot() {
  if [[ -f "$ACTIVE_SLOT_FILE" ]]; then
    local slot
    slot="$(tr -d '[:space:]' < "$ACTIVE_SLOT_FILE" || true)"
    if [[ "$slot" == "blue" || "$slot" == "green" ]]; then
      echo "$slot"
      return
    fi
  fi

  local snippet_slot
  snippet_slot="$(active_slot_from_nginx_snippet || true)"
  if [[ "$snippet_slot" == "blue" || "$snippet_slot" == "green" ]]; then
    echo "$snippet_slot"
    return
  fi

  echo "$WEB_SLOT_DEFAULT"
}

wait_for_service_healthy() {
  local service="$1"
  local timeout_seconds="$2"

  local cid
  cid="$(compose ps -q "$service" | head -n1)"
  if [[ -z "$cid" ]]; then
    echo "[deploy:web-zd] container not found for service: $service" >&2
    return 1
  fi

  local i status
  for ((i=1; i<=timeout_seconds; i++)); do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || true)"
    if [[ "$status" == "healthy" || "$status" == "running" ]]; then
      return 0
    fi
    sleep 1
  done

  echo "[deploy:web-zd] health timeout for ${service} (${timeout_seconds}s)" >&2
  return 1
}

wait_for_http_ready() {
  local port="$1"
  local timeout_seconds="$2"
  local i code

  for ((i=1; i<=timeout_seconds; i++)); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:${port}/login" || true)"
    if [[ "$code" =~ ^[23][0-9][0-9]$ ]]; then
      return 0
    fi
    sleep 1
  done

  echo "[deploy:web-zd] HTTP readiness timeout on :${port}" >&2
  return 1
}

compute_context_fingerprint() {
  if git rev-parse HEAD >/dev/null 2>&1; then
    git rev-parse HEAD
    return
  fi

  local service_dir="${ROOT_DIR}/services/aris-web"
  find "$service_dir" -type f \
    ! -path '*/node_modules/*' \
    ! -path '*/.next/*' \
    ! -name '.env' \
    -print0 \
    | sort -z \
    | xargs -0 sha256sum \
    | sha256sum \
    | awk '{print $1}'
}

ensure_nginx_snippet_routing() {
  if ! sudo test -f "$NGINX_SITE"; then
    echo "[deploy:web-zd] nginx site not found: $NGINX_SITE" >&2
    return 1
  fi

  sudo mkdir -p "$(dirname "$NGINX_SNIPPET")"

  if ! sudo grep -qF "include ${NGINX_SNIPPET};" "$NGINX_SITE"; then
    if sudo grep -Eq 'proxy_pass http://127\.0\.0\.1:[0-9]+;' "$NGINX_SITE"; then
      sudo sed -i -E "s#proxy_pass http://127\\.0\\.0\\.1:[0-9]+;#include ${NGINX_SNIPPET};#" "$NGINX_SITE"
    else
      echo "[deploy:web-zd] cannot patch nginx site (proxy_pass line not found): $NGINX_SITE" >&2
      return 1
    fi
  fi
}

write_nginx_upstream_snippet() {
  local port="$1"
  local tmp
  tmp="$(mktemp)"
  printf 'proxy_pass http://127.0.0.1:%s;\n' "$port" > "$tmp"
  sudo install -m 0644 "$tmp" "$NGINX_SNIPPET"
  rm -f "$tmp"
}

prune_builder_cache() {
  local aggressive="$1"
  local args=(-f --filter "until=${WEB_PRUNE_CACHE_UNTIL}")

  if docker buildx version >/dev/null 2>&1; then
    if docker buildx prune --help | grep -q -- '--keep-storage' && [[ "$aggressive" != "1" ]]; then
      docker buildx prune -f --keep-storage "${WEB_PRUNE_CACHE_KEEP_STORAGE}" >/dev/null || true
    else
      docker buildx prune "${args[@]}" >/dev/null || true
    fi
  else
    docker builder prune "${args[@]}" >/dev/null || true
  fi
}

run_cleanup() {
  case "$WEB_PRUNE_MODE" in
    off)
      ;;
    light)
      docker image prune -f >/dev/null || true
      prune_builder_cache 0
      ;;
    aggressive)
      docker image prune -af >/dev/null || true
      docker container prune -f >/dev/null || true
      prune_builder_cache 1
      ;;
  esac
}

build_required=1
current_fingerprint=""

if [[ "$SKIP_BUILD_IF_UNCHANGED" == "1" && "$PULL_BASE" != "1" ]]; then
  current_fingerprint="$(compute_context_fingerprint || true)"
  if [[ -n "$current_fingerprint" && -f "$FINGERPRINT_FILE" ]] && docker image inspect "$ARIS_WEB_IMAGE" >/dev/null 2>&1; then
    previous_fingerprint="$(cat "$FINGERPRINT_FILE" 2>/dev/null || true)"
    if [[ -n "$previous_fingerprint" && "$previous_fingerprint" == "$current_fingerprint" ]]; then
      build_required=0
echo "[deploy:web-zd] build skipped: unchanged context fingerprint"
    fi
  fi
fi
echo "[deploy:web-zd] prune mode: $WEB_PRUNE_MODE"
echo "[deploy:web-zd] prune async: $WEB_PRUNE_ASYNC"
echo "[deploy:web-zd] prune cache until: $WEB_PRUNE_CACHE_UNTIL"
echo "[deploy:web-zd] prune cache keep storage: $WEB_PRUNE_CACHE_KEEP_STORAGE"

active_slot="$(resolve_active_slot)"
target_slot="$(other_slot "$active_slot")"
target_service="aris-web-${target_slot}"
old_service="aris-web-${active_slot}"
target_port="$(port_for_slot "$target_slot")"

if [[ "$build_required" == "1" ]]; then
  echo "[deploy:web-zd] building image for slot: ${target_slot} (version: ${current_fingerprint})"
  build_args=(build "$target_service")
  if [[ "$PULL_BASE" == "1" ]]; then
    build_args+=(--pull)
  fi
  compose "${build_args[@]}" --build-arg APP_VERSION="${current_fingerprint}"
fi

echo "[deploy:web-zd] starting target slot: ${target_slot} (${target_service})"
compose up -d --no-deps "$target_service"

wait_for_service_healthy "$target_service" "$WEB_HEALTH_TIMEOUT_SECONDS"
wait_for_http_ready "$target_port" "$WEB_HEALTH_TIMEOUT_SECONDS"

echo "[deploy:web-zd] switching nginx upstream to ${target_slot} (:${target_port})"
ensure_nginx_snippet_routing
write_nginx_upstream_snippet "$target_port"
reload_nginx

echo "$target_slot" > "$ACTIVE_SLOT_FILE"

# Only update fingerprint/version file after successful health check and nginx switch
if [[ -n "$current_fingerprint" ]]; then
  echo "$current_fingerprint" > "$FINGERPRINT_FILE"
fi

if [[ "$WEB_DRAIN_SECONDS" -gt 0 ]]; then
  echo "[deploy:web-zd] drain ${WEB_DRAIN_SECONDS}s before stopping old slot (${active_slot})"
  sleep "$WEB_DRAIN_SECONDS"
fi

if compose ps -q "$old_service" | grep -q '.'; then
  echo "[deploy:web-zd] stopping old slot: ${active_slot} (${old_service})"
  compose stop "$old_service" >/dev/null || true
fi

if [[ "$STOP_LEGACY_WEB" == "1" ]]; then
  if compose ps -q aris-web | grep -q '.'; then
    echo "[deploy:web-zd] stopping legacy aris-web service"
    compose stop aris-web >/dev/null || true
  fi
fi

if [[ "$WEB_PRUNE_MODE" != "off" ]]; then
  cleanup_log="${LOG_DIR}/web-prune.log"
  if [[ "$WEB_PRUNE_ASYNC" == "1" ]]; then
    echo "[deploy:web-zd] pruning started in background: ${cleanup_log}"
    (
      echo "[$(date -Iseconds)] prune started (mode=${WEB_PRUNE_MODE})"
      run_cleanup
      echo "[$(date -Iseconds)] prune finished"
    ) >> "$cleanup_log" 2>&1 &
  else
    echo "[deploy:web-zd] prune started (foreground)"
    (
      echo "[$(date -Iseconds)] prune started (mode=${WEB_PRUNE_MODE})"
      run_cleanup
      echo "[$(date -Iseconds)] prune finished"
    ) >> "$cleanup_log" 2>&1
  fi
fi

echo "[deploy:web-zd] done. active slot=${target_slot}"
compose ps aris-web-blue aris-web-green aris-web || true
