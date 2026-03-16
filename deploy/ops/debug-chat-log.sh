#!/usr/bin/env bash
# debug-chat-log.sh
# chatId로 parsed 로그를 찾아서 pretty-print한다.
#
# 사용법:
#   ./deploy/ops/debug-chat-log.sh <chatId>              # 오늘 로그 자동 검색
#   ./deploy/ops/debug-chat-log.sh <chatId> 2026/03/16   # 특정 날짜
#   ./deploy/ops/debug-chat-log.sh <chatId> all          # 전체 날짜 검색

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# logs/ 는 항상 메인 프로젝트 루트에 있다 (worktree에는 없음)
MAIN_ROOT="$(git -C "${ROOT_DIR}" rev-parse --path-format=absolute --git-common-dir 2>/dev/null | sed 's|/\.git$||' || echo "${ROOT_DIR}")"
LOG_ROOT="${MAIN_ROOT}/logs"

CHAT_ID="${1:?사용법: $0 <chatId> [YYYY/MM/DD|all]}"
DATE_ARG="${2:-today}"

if [[ "$DATE_ARG" == "today" ]]; then
  SEARCH_ROOT="${LOG_ROOT}/$(date +%Y/%m/%d)"
elif [[ "$DATE_ARG" == "all" ]]; then
  SEARCH_ROOT="${LOG_ROOT}"
else
  SEARCH_ROOT="${LOG_ROOT}/${DATE_ARG}"
fi

if [[ ! -d "$SEARCH_ROOT" ]]; then
  echo "디렉터리 없음: ${SEARCH_ROOT}"
  exit 1
fi

mapfile -t FILES < <(find "${SEARCH_ROOT}" -name "*${CHAT_ID}*-parsed.ndjson" | sort)

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "로그 파일 없음: chatId=${CHAT_ID} in ${SEARCH_ROOT}"
  echo "raw 파일 목록:"
  find "${SEARCH_ROOT}" -name "*${CHAT_ID}*" | sort || true
  exit 1
fi

for FILE in "${FILES[@]}"; do
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "파일: ${FILE}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  cat "$FILE" | python3 -c "
import json,sys
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try:
        o = json.loads(line)
    except Exception:
        print('  [parse error]', line[:80])
        continue
    ts = o.get('loggedAt','')[-15:]
    stage = o.get('stage', o.get('turnStatus','?'))
    payload = json.dumps(o.get('payload',{}), ensure_ascii=False)[:160]
    print(f'{ts} [{stage}] {payload}')
"
done
