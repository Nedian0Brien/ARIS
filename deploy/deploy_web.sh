#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${DEPLOY_ENV_FILE:-${ROOT_DIR}/deploy/.env}"
SERVICE="${SERVICE_NAME:-aris-web}"
PRUNE_MODE="${PRUNE_MODE:-light}"            # off | light | aggressive
CACHE_UNTIL="${CACHE_UNTIL:-168h}"           # e.g. 24h, 168h
CACHE_KEEP_STORAGE="${CACHE_KEEP_STORAGE:-8gb}"
PULL_BASE="${PULL_BASE:-0}"                  # 1 to refresh base image

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

echo "[deploy] service: $SERVICE"
echo "[deploy] env file: $ENV_FILE"
echo "[deploy] prune mode: $PRUNE_MODE"
echo "[deploy] cache until: $CACHE_UNTIL"
echo "[deploy] cache keep storage: $CACHE_KEEP_STORAGE"

build_args=(build "$SERVICE")
if [[ "$PULL_BASE" == "1" ]]; then
  build_args+=(--pull)
fi

echo "[deploy] building image..."
compose "${build_args[@]}"

echo "[deploy] starting updated container..."
compose up -d --no-deps "$SERVICE"

echo "[deploy] post-deploy cleanup..."
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

echo "[deploy] current status:"
compose ps "$SERVICE"
