#!/usr/bin/env bash
# debug-session-status.sh
# 세션 목록 및 isRunning 상태를 aris-backend API로 조회한다.
#
# 사용법:
#   ./deploy/ops/debug-session-status.sh                    # 전체 세션 목록
#   ./deploy/ops/debug-session-status.sh <sessionId>        # 특정 세션 runtime 상태
#   ./deploy/ops/debug-session-status.sh <sessionId> <chatId>  # 채팅별 isRunning

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${ROOT_DIR}/deploy/lib/env.sh"
ENV_FILE="$(require_deploy_env_file "debug-session-status")"

# prod.env 에서 토큰·URL 로드
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line//[[:space:]]/}" ]] && continue
  [[ "$line" != *"="* ]] && continue
  key="${line%%=*}"; value="${line#*=}"
  key="${key#"${key%%[![:space:]]*}"}"; key="${key%"${key##*[![:space:]]}"}"
  value="${value#"${value%%[![:space:]]*}"}"; value="${value%"${value##*[![:space:]]}"}"
  export "${key}=${value}"
done < "${ENV_FILE}"

BACKEND_URL="${RUNTIME_API_URL:-http://127.0.0.1:4080}"
TOKEN="${RUNTIME_API_TOKEN:?RUNTIME_API_TOKEN is not set in ${ENV_FILE}}"

SESSION_ID="${1:-}"
CHAT_ID="${2:-}"

auth_header="Authorization: Bearer ${TOKEN}"

if [[ -z "$SESSION_ID" ]]; then
  echo "[ 전체 세션 목록 ]"
  curl -sf -H "$auth_header" "${BACKEND_URL}/v1/sessions" | python3 -c "
import json,sys
data = json.load(sys.stdin)
sessions = data.get('sessions', []) if isinstance(data, dict) else data
for s in sessions:
    sid = s.get('id','?')
    status = s.get('state',{}).get('status', s.get('status','?'))
    flavor = s.get('metadata',{}).get('flavor','?')
    path = s.get('metadata',{}).get('path','?')
    print(f'  {sid}  status={status}  agent={flavor}  path={path}')
print(f'  총 {len(sessions)}개')
"
  exit 0
fi

echo "[ 세션 runtime 상태: ${SESSION_ID} ]"
QUERY="?chatId=${CHAT_ID}"
[[ -z "$CHAT_ID" ]] && QUERY=""

curl -sf -H "$auth_header" \
  "${BACKEND_URL}/v1/sessions/${SESSION_ID}/runtime${QUERY}" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(json.dumps(d, ensure_ascii=False, indent=2))
"
