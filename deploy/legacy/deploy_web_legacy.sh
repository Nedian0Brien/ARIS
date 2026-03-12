#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${DEPLOY_ENV_FILE:-${ROOT_DIR}/deploy/.env}"
SERVICE="${SERVICE_NAME:-aris-web}"
PRUNE_MODE="${PRUNE_MODE:-light}"            # off | light | aggressive
CACHE_UNTIL="${CACHE_UNTIL:-168h}"           # e.g. 24h, 168h
CACHE_KEEP_STORAGE="${CACHE_KEEP_STORAGE:-8gb}"
PULL_BASE="${PULL_BASE:-0}"                  # 1 to refresh base image
SKIP_BUILD_IF_UNCHANGED="${SKIP_BUILD_IF_UNCHANGED:-1}"  # 1 to skip compose build when context is unchanged
PRUNE_ASYNC="${PRUNE_ASYNC:-1}"              # 1 to run prune in background
STATE_DIR="${DEPLOY_STATE_DIR:-${ROOT_DIR}/deploy/.state}"
LOG_DIR="${DEPLOY_LOG_DIR:-${ROOT_DIR}/deploy/.logs}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[deploy] env file not found: $ENV_FILE" >&2
  exit 1
fi

if [[ "$PRUNE_MODE" != "off" && "$PRUNE_MODE" != "light" && "$PRUNE_MODE" != "aggressive" ]]; then
  echo "[deploy] invalid PRUNE_MODE: $PRUNE_MODE (off|light|aggressive)" >&2
  exit 1
fi

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

compose() {
  docker compose --env-file "$ENV_FILE" "$@"
}

ensure_dirs() {
  mkdir -p "$STATE_DIR" "$LOG_DIR"
}

image_exists() {
  compose images -q "$SERVICE" 2>/dev/null | grep -q '.'
}

build_fingerprint_path() {
  echo "${STATE_DIR}/${SERVICE}.build-fingerprint"
}

compute_context_fingerprint() {
  local service_dir="${ROOT_DIR}/services/${SERVICE}"
  if [[ ! -d "$service_dir" ]]; then
    return 1
  fi

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

prune_builder_cache() {
  local aggressive="$1"
  local args=(-f --filter "until=${CACHE_UNTIL}")

  if [[ "$aggressive" == "1" ]]; then
    args=(-af --filter "until=${CACHE_UNTIL}")
  fi

  if docker buildx version >/dev/null 2>&1; then
    if docker buildx prune --help | grep -q -- '--keep-storage' && [[ "$aggressive" != "1" ]]; then
      # Keep cache bounded even when frequent builds keep touching cache records.
      docker buildx prune -f --keep-storage "${CACHE_KEEP_STORAGE}" >/dev/null || true
    else
      docker buildx prune "${args[@]}" >/dev/null || true
    fi
  else
    docker builder prune "${args[@]}" >/dev/null || true
  fi
}

run_cleanup() {
  case "$PRUNE_MODE" in
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

echo "[deploy] service: $SERVICE"
echo "[deploy] env file: $ENV_FILE"
echo "[deploy] prune mode: $PRUNE_MODE"
echo "[deploy] cache until: $CACHE_UNTIL"
echo "[deploy] cache keep storage: $CACHE_KEEP_STORAGE"
echo "[deploy] skip build if unchanged: $SKIP_BUILD_IF_UNCHANGED"
echo "[deploy] async prune: $PRUNE_ASYNC"

ensure_dirs

build_args=(build "$SERVICE")
if [[ "$PULL_BASE" == "1" ]]; then
  build_args+=(--pull)
fi

build_required=1
current_fingerprint=""
fingerprint_file="$(build_fingerprint_path)"

if [[ "$SKIP_BUILD_IF_UNCHANGED" == "1" && "$PULL_BASE" != "1" ]]; then
  current_fingerprint="$(compute_context_fingerprint || true)"
  if [[ -n "$current_fingerprint" && -f "$fingerprint_file" ]] && image_exists; then
    previous_fingerprint="$(cat "$fingerprint_file" 2>/dev/null || true)"
    if [[ -n "$previous_fingerprint" && "$previous_fingerprint" == "$current_fingerprint" ]]; then
      build_required=0
      echo "[deploy] build skipped: unchanged context fingerprint"
    fi
  fi
fi

if [[ "$build_required" == "1" ]]; then
  echo "[deploy] building image..."
  compose "${build_args[@]}"
else
  echo "[deploy] reusing existing image..."
fi

echo "[deploy] starting updated container..."
compose up -d --no-deps "$SERVICE"

echo "[deploy] post-deploy cleanup..."
if [[ "$build_required" == "1" && -z "$current_fingerprint" ]]; then
  current_fingerprint="$(compute_context_fingerprint || true)"
fi

if [[ -n "$current_fingerprint" ]]; then
  echo "$current_fingerprint" > "$fingerprint_file"
fi

if [[ "$PRUNE_ASYNC" == "1" && "$PRUNE_MODE" != "off" ]]; then
  cleanup_log="${LOG_DIR}/prune-${SERVICE}.log"
  (
    echo "[$(date -Iseconds)] cleanup started (mode=${PRUNE_MODE})"
    run_cleanup
    echo "[$(date -Iseconds)] cleanup finished"
  ) >> "$cleanup_log" 2>&1 &
  echo "[deploy] cleanup started in background: $cleanup_log"
else
  run_cleanup
fi

echo "[deploy] current status:"
compose ps "$SERVICE"
