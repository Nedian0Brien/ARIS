#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[deploy:web-zd] compatibility wrapper: prefer ./deploy/deploy_web.sh" >&2
exec "${ROOT_DIR}/deploy/deploy_web.sh" "$@"
