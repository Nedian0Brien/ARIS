#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"${ROOT_DIR}/deploy/deploy_backend_zero_downtime.sh"
"${ROOT_DIR}/deploy/deploy_web_zero_downtime.sh"

echo "[deploy:zero-downtime] complete"
