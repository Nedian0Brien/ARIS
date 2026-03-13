#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/lookup_runtime_logs_by_id.sh <id> [--message-limit N] [--log-limit N] [--include-session-id]

Description:
  Resolve an ARIS/Happy runtime identifier and print the related session/chat metadata,
  matching SessionMessage rows, and matching log file snippets.

Identifiers supported:
  - SessionChat.id
  - SessionChat.threadId
  - SessionChat.sessionId
  - SessionChat.latestEventId
  - direct SessionMessage.id fallback

Environment overrides:
  ARIS_DB_CONTAINER   default: aris-stack-postgres-1
  ARIS_DB_NAME        default: aris
  ARIS_DB_USER        default: postgres
  HAPPY_DB_CONTAINER  default: happy-postgres
  HAPPY_DB_NAME       default: handy
  HAPPY_DB_USER       default: postgres
  ARIS_REPO_ROOT      default: git repo root
  ARIS_SHARED_REPO_ROOT default: ARIS_REPO_ROOT
EOF
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

TARGET_ID=""
MESSAGE_LIMIT=12
LOG_LIMIT=80
INCLUDE_SESSION_ID=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --message-limit)
      MESSAGE_LIMIT="${2:-}"
      shift 2
      ;;
    --log-limit)
      LOG_LIMIT="${2:-}"
      shift 2
      ;;
    --include-session-id)
      INCLUDE_SESSION_ID=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [[ -n "$TARGET_ID" ]]; then
        echo "Only one identifier is supported per run." >&2
        exit 1
      fi
      TARGET_ID="$1"
      shift
      ;;
  esac
done

if [[ -z "$TARGET_ID" ]]; then
  usage
  exit 1
fi

case "$MESSAGE_LIMIT" in
  ''|*[!0-9]*)
    echo "--message-limit must be a positive integer." >&2
    exit 1
    ;;
esac

case "$LOG_LIMIT" in
  ''|*[!0-9]*)
    echo "--log-limit must be a positive integer." >&2
    exit 1
    ;;
esac

ARIS_DB_CONTAINER="${ARIS_DB_CONTAINER:-aris-stack-postgres-1}"
ARIS_DB_NAME="${ARIS_DB_NAME:-aris}"
ARIS_DB_USER="${ARIS_DB_USER:-postgres}"
HAPPY_DB_CONTAINER="${HAPPY_DB_CONTAINER:-happy-postgres}"
HAPPY_DB_NAME="${HAPPY_DB_NAME:-handy}"
HAPPY_DB_USER="${HAPPY_DB_USER:-postgres}"
ARIS_REPO_ROOT="${ARIS_REPO_ROOT:-$(git rev-parse --show-toplevel)}"
ARIS_SHARED_REPO_ROOT="${ARIS_SHARED_REPO_ROOT:-$ARIS_REPO_ROOT}"

sql_escape() {
  printf "%s" "${1//\'/\'\'}"
}

query_aris() {
  docker exec "$ARIS_DB_CONTAINER" psql -U "$ARIS_DB_USER" -d "$ARIS_DB_NAME" -At -F $'\t' -c "$1"
}

query_happy() {
  docker exec "$HAPPY_DB_CONTAINER" psql -U "$HAPPY_DB_USER" -d "$HAPPY_DB_NAME" -At -F $'\t' -c "$1"
}

json_array_from_args() {
  if [[ $# -eq 0 ]]; then
    printf '[]'
    return
  fi

  printf '%s\n' "$@" | jq -Rsc 'split("\n")[:-1] | map(select(length > 0)) | unique'
}

require_docker_container() {
  local container_name="$1"
  if ! docker inspect "$container_name" >/dev/null 2>&1; then
    echo "Docker container not available: $container_name" >&2
    exit 3
  fi
}

require_docker_container "$ARIS_DB_CONTAINER"
require_docker_container "$HAPPY_DB_CONTAINER"

TARGET_SQL="$(sql_escape "$TARGET_ID")"

chat_query=$'select "id", "sessionId", "userId", "agent", "title", coalesce("threadId", \'\'), coalesce("latestEventId", \'\'), coalesce(to_char("latestEventAt", \'YYYY-MM-DD HH24:MI:SS.MS\'), \'\'), coalesce("latestPreview", \'\') from "SessionChat" where "id" = \''"$TARGET_SQL"$'\' or coalesce("threadId", \'\') = \''"$TARGET_SQL"$'\' or "sessionId" = \''"$TARGET_SQL"$'\' or coalesce("latestEventId", \'\') = \''"$TARGET_SQL"$'\' order by "updatedAt" desc;'

mapfile -t chat_rows < <(query_aris "$chat_query")

if [[ ${#chat_rows[@]} -eq 0 ]]; then
  message_fallback_query=$'select "id", "sessionId", seq, left(content::text, 600) from "SessionMessage" where "id" = \''"$TARGET_SQL"$'\' order by seq desc;'
  mapfile -t fallback_rows < <(query_happy "$message_fallback_query")
  if [[ ${#fallback_rows[@]} -eq 0 ]]; then
    echo "No SessionChat or SessionMessage match found for: $TARGET_ID" >&2
    exit 2
  fi

  echo "== SessionMessage Fallback =="
  for row in "${fallback_rows[@]}"; do
    IFS=$'\t' read -r message_id session_id seq preview <<<"$row"
    echo "messageId : $message_id"
    echo "sessionId : $session_id"
    echo "seq       : $seq"
    echo "preview   : $preview"
  done
  exit 0
fi

chat_ids=()
session_ids=()
thread_ids=()
event_ids=()
message_ids=()

for row in "${chat_rows[@]}"; do
  IFS=$'\t' read -r chat_id session_id user_id agent title thread_id latest_event_id latest_event_at latest_preview <<<"$row"

  echo "== SessionChat =="
  echo "chatId         : $chat_id"
  echo "sessionId      : $session_id"
  echo "userId         : $user_id"
  echo "agent          : $agent"
  echo "title          : $title"
  echo "threadId       : ${thread_id:-<none>}"
  echo "latestEventId  : ${latest_event_id:-<none>}"
  echo "latestEventAt  : ${latest_event_at:-<none>}"
  echo "latestPreview  : ${latest_preview:-<empty>}"
  echo

  if [[ -n "$chat_id" ]]; then
    chat_ids+=("$chat_id")
  fi
  if [[ -n "$session_id" ]]; then
    session_ids+=("$session_id")
  fi
  if [[ -n "$thread_id" ]]; then
    thread_ids+=("$thread_id")
  fi
  if [[ -n "$latest_event_id" ]]; then
    event_ids+=("$latest_event_id")
  fi

  session_sql="$(sql_escape "$session_id")"
  chat_sql="$(sql_escape "$chat_id")"
  thread_sql="$(sql_escape "$thread_id")"
  event_sql="$(sql_escape "$latest_event_id")"

  message_query=$'select seq, "id", to_char("createdAt", \'YYYY-MM-DD HH24:MI:SS.MS\'), left(coalesce(content->>\'c\', content::text), 1200) from "SessionMessage" where "sessionId" = \''"$session_sql"$'\' and (coalesce(content->>\'c\', content::text) like \'%"chatId":"'"$chat_sql"$'"%\''
  if [[ -n "$thread_id" ]]; then
    message_query+=$' or coalesce(content->>\'c\', content::text) like \'%"threadId":"'"$thread_sql"$'"%\''
  fi
  if [[ -n "$latest_event_id" ]]; then
    message_query+=$' or "id" = \''"$event_sql"$'\''
  fi
  message_query+=$') order by seq desc limit '"$MESSAGE_LIMIT"$';'

  mapfile -t message_rows < <(query_happy "$message_query")

  echo "== Matching SessionMessage Rows =="
  if [[ ${#message_rows[@]} -eq 0 ]]; then
    echo "(none)"
  else
    for message_row in "${message_rows[@]}"; do
      IFS=$'\t' read -r seq message_id created_at preview <<<"$message_row"
      if [[ -n "$message_id" ]]; then
        message_ids+=("$message_id")
      fi
      echo "---"
      echo "seq       : $seq"
      echo "messageId : $message_id"
      echo "createdAt : $created_at"
      echo "preview   : $preview"
    done
  fi
  echo
done

candidate_fragments=()
for chat_id in "${chat_ids[@]}"; do
  candidate_fragments+=("\"chatId\":\"$chat_id\"")
done
for thread_id in "${thread_ids[@]}"; do
  candidate_fragments+=("\"threadId\":\"$thread_id\"")
done
for event_id in "${event_ids[@]}"; do
  candidate_fragments+=("\"id\":\"$event_id\"" "\"eventId\":\"$event_id\"" "\"latestEventId\":\"$event_id\"")
done
for message_id in "${message_ids[@]}"; do
  candidate_fragments+=("\"messageId\":\"$message_id\"" "\"id\":\"$message_id\"")
done
if [[ "$INCLUDE_SESSION_ID" -eq 1 ]]; then
  for session_id in "${session_ids[@]}"; do
    candidate_fragments+=("\"sessionId\":\"$session_id\"")
  done
fi

declare -A seen_candidate_fragments=()
rg_candidate_args=()
for fragment in "${candidate_fragments[@]}"; do
  if [[ -n "${seen_candidate_fragments[$fragment]:-}" ]]; then
    continue
  fi
  seen_candidate_fragments[$fragment]=1
  rg_candidate_args+=(-e "$fragment")
done

log_dirs=()
for candidate in \
  "$ARIS_SHARED_REPO_ROOT/logs" \
  "$ARIS_SHARED_REPO_ROOT/.runtime/aris-backend/logs" \
  "$ARIS_SHARED_REPO_ROOT/services/aris-backend/logs" \
  "$ARIS_REPO_ROOT/logs" \
  "$ARIS_REPO_ROOT/.runtime/aris-backend/logs" \
  "$ARIS_REPO_ROOT/services/aris-backend/logs"
do
  if [[ -d "$candidate" ]]; then
    log_dirs+=("$candidate")
  fi
done

echo "== Matching Log Files =="
if [[ ${#log_dirs[@]} -eq 0 ]]; then
  echo "No log directories found."
  exit 0
fi

chat_ids_json="$(json_array_from_args "${chat_ids[@]}")"
thread_ids_json="$(json_array_from_args "${thread_ids[@]}")"
event_ids_json="$(json_array_from_args "${event_ids[@]}")"
message_ids_json="$(json_array_from_args "${message_ids[@]}")"
session_ids_json="$(json_array_from_args "${session_ids[@]}")"

jq_filter='
  def has_match($values; $candidate):
    ($candidate != null) and any($values[]; . == $candidate);

  select(
    has_match($chat_ids; .chatId?)
    or has_match($chat_ids; .payload.meta.chatId?)
    or has_match($chat_ids; .payload.options.meta.chatId?)
    or has_match($thread_ids; .threadId?)
    or has_match($thread_ids; .payload.meta.threadId?)
    or has_match($thread_ids; .payload.options.meta.threadId?)
    or has_match($event_ids; .id?)
    or has_match($event_ids; .eventId?)
    or has_match($event_ids; .payload.id?)
    or has_match($event_ids; .payload.meta.eventId?)
    or has_match($event_ids; .payload.meta.latestEventId?)
    or has_match($event_ids; .payload.params.id?)
    or has_match($message_ids; .messageId?)
    or has_match($message_ids; .payload.messageId?)
    or (
      $include_session_id
      and (
        has_match($session_ids; .sessionId?)
        or has_match($session_ids; .payload.meta.sessionId?)
        or has_match($session_ids; .payload.options.meta.sessionId?)
      )
    )
  )
  | {file: input_filename, entry: .}
'

mapfile -t structured_entries < <(
  rg -l -F "${rg_candidate_args[@]}" "${log_dirs[@]}" 2>/dev/null \
    | jq -Rsc 'split("\n")[:-1] | map(select(length > 0)) | unique[]' -r \
    | xargs -r jq -c \
      --argjson chat_ids "$chat_ids_json" \
      --argjson thread_ids "$thread_ids_json" \
      --argjson event_ids "$event_ids_json" \
      --argjson message_ids "$message_ids_json" \
      --argjson session_ids "$session_ids_json" \
      --argjson include_session_id "$([[ "$INCLUDE_SESSION_ID" -eq 1 ]] && printf 'true' || printf 'false')" \
      "$jq_filter" 2>/dev/null \
    | sed -n "1,${LOG_LIMIT}p"
)

if [[ ${#structured_entries[@]} -eq 0 ]]; then
  echo "(none)"
  echo
  echo "No exact structured log entries matched. Re-run with --include-session-id to broaden to session-level logs."
  exit 0
fi

printf '%s\n' "${structured_entries[@]}" | jq -r '.file' | awk '!seen[$0]++'
echo

echo "== Matching Structured Log Entries =="
printf '%s\n' "${structured_entries[@]}" | jq -c '.'
if [[ "$INCLUDE_SESSION_ID" -eq 1 ]]; then
  echo
  echo "Note: --include-session-id broadens matches to the whole runtime session, so adjacent chats in the same session can appear."
fi
