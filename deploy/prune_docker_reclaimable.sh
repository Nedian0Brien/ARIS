#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_FILE="${DOCKER_PRUNE_LOCK_FILE:-/tmp/docker-prune-reclaimable.lock}"
LOG_DIR="${DOCKER_PRUNE_LOG_DIR:-${ROOT_DIR}/deploy/.logs}"

mkdir -p "$LOG_DIR"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[docker-prune] another prune process is already running. skip."
  exit 0
fi

echo "[docker-prune] started at $(date -Iseconds)"
echo "[docker-prune] before:"
docker system df

# Reclaims images/containers/networks/build cache that are not in use.
# Does not remove volumes because --volumes is intentionally not used.
docker system prune -af

echo "[docker-prune] after:"
docker system df
echo "[docker-prune] completed at $(date -Iseconds)"
