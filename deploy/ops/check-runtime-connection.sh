#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DEPLOY_ENV="${1:-${ROOT_DIR}/deploy/.env}"
BACKEND_ENV="${2:-${ROOT_DIR}/services/aris-backend/.env}"
WEB_ENV="${3:-${ROOT_DIR}/services/aris-web/.env}"

read_env_value() {
  local file="$1"
  local key="$2"

  if [[ ! -f "$file" ]]; then
    return 1
  fi

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line//[[:space:]]/}" ]] && continue
    [[ "$line" == *"="* ]] || continue

    line="${line//$'\r'/}"
    local current_key="${line%%=*}"
    local current_val="${line#*=}"

    current_key="$(printf '%s' "$current_key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    current_val="$(printf '%s' "$current_val" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"

    if [[ "$current_key" == "$key" ]]; then
      if (( ${#current_val} >= 2 )) && [[ "${current_val:0:1}" == '"' ]] && [[ "${current_val: -1}" == '"' ]]; then
        current_val="${current_val:1:${#current_val}-2}"
      fi
      if (( ${#current_val} >= 2 )) && [[ "${current_val:0:1}" == "'" ]] && [[ "${current_val: -1}" == "'" ]]; then
        current_val="${current_val:1:${#current_val}-2}"
      fi
      printf '%s' "$current_val"
      return 0
    fi
  done < "$file"

  return 1
}

mask_value() {
  local value="$1"
  local len="${#value}"
  if ((len == 0)); then
    printf 'empty'
    return
  fi
  if ((len <= 8)); then
    printf '%s' "${value:0:4}..."
    return
  fi
  printf '%s...%s' "${value:0:4}" "${value: -4}"
}

normalize_http_code() {
  local raw="$1"
  raw="$(printf '%s' "$raw" | tr -cd '0-9')"
  if (( ${#raw} < 3 )); then
    printf '000'
    return
  fi
  printf '%s' "${raw: -3}"
}

request_status() {
  local token="$1"
  local path="$2"
  local url="$3${path}"
  local tmp_body
  tmp_body="$(mktemp)"

  local status
  status="$(curl -sS -o "$tmp_body" -w '%{http_code}' \
    -H "Authorization: Bearer ${token}" \
    "$url" || true)"
  status="$(normalize_http_code "$status")"

  local body
  body="$(cat "$tmp_body" | tr -d '\n' | sed 's/[[:space:]]\\+/ /g')"
  rm -f "$tmp_body"

  printf '%s\n' "$status|$body"
}

pick_runtime_url() {
  if [[ -n "${RUNTIME_API_URL:-}" ]]; then
    printf '%s\n' "$RUNTIME_API_URL"
    return 0
  fi

  local candidates=(
    "http://127.0.0.1:4080"
    "http://host.docker.internal:4080"
    "http://172.17.0.1:4080"
    "http://172.18.0.1:4080"
    "http://172.19.0.1:4080"
  )
  local candidate status

  for candidate in "${candidates[@]}"; do
    status="$(curl -sS -o /tmp/runtime-health.$$ -w '%{http_code}' "$candidate/health" 2>/dev/null || true)"
    status="$(normalize_http_code "$status")"
    rm -f "/tmp/runtime-health.$$"
    if [[ "$status" == "200" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  printf '%s\n' "${candidates[0]}"
  return 1
}

log_section() {
  printf '\n[ %s ]\n' "$1"
}

extract_origin() {
  local url="$1"
  printf '%s' "$url" | sed -E 's#^(https?://[^/]+).*$#\1#'
}

is_local_backend_origin() {
  local origin="$1"
  case "$origin" in
    http://127.0.0.1:4080|http://localhost:4080|http://host.docker.internal:4080|http://172.17.0.1:4080|http://172.18.0.1:4080|http://172.19.0.1:4080)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

main() {
  if [[ ! -f "$DEPLOY_ENV" ]]; then
    echo "deploy env not found: $DEPLOY_ENV"
    exit 1
  fi

  local runtime_url
  local runtime_url_status=0
  if ! runtime_url="$(pick_runtime_url)"; then
    runtime_url_status=1
  fi
  local runtime_token
  local web_token=''
  local backend_token=''
  local deploy_token=''
  local runtime_backend=''
  local happy_server_url=''
  local mismatch=0

  deploy_token="$(read_env_value "$DEPLOY_ENV" "RUNTIME_API_TOKEN" || true)"
  backend_token="$(read_env_value "$BACKEND_ENV" "RUNTIME_API_TOKEN" || true)"
  web_token="$(read_env_value "$WEB_ENV" "HAPPY_SERVER_TOKEN" || true)"
  runtime_backend="$(read_env_value "$DEPLOY_ENV" "RUNTIME_BACKEND" || true)"
  if [[ -z "$runtime_backend" ]]; then
    runtime_backend="$(read_env_value "$BACKEND_ENV" "RUNTIME_BACKEND" || true)"
  fi
  happy_server_url="$(read_env_value "$DEPLOY_ENV" "HAPPY_SERVER_URL" || true)"
  if [[ -z "$happy_server_url" ]]; then
    happy_server_url="$(read_env_value "$BACKEND_ENV" "HAPPY_SERVER_URL" || true)"
  fi

  log_section "env validation"
  echo "deploy env      : $DEPLOY_ENV"
  echo "backend env     : $BACKEND_ENV"
  echo "runtime url     : $runtime_url"
  echo "runtime backend : ${runtime_backend:-unset}"
  if [[ "$runtime_backend" == "happy" ]]; then
    echo "happy server url: ${happy_server_url:-unset}"
  fi
  echo "deploy token    : $(mask_value "$deploy_token")"
  echo "backend token   : $(mask_value "$backend_token")"
  if [[ -f "$WEB_ENV" ]]; then
    echo "web token       : $(mask_value "$web_token")"
  else
    echo "web token       : (not configured in services/aris-web/.env)"
  fi

  if [[ -z "$deploy_token" ]]; then
    echo "❌ deploy RUNTIME_API_TOKEN is empty"
    mismatch=1
  fi
  if [[ -z "$backend_token" ]]; then
    echo "❌ backend RUNTIME_API_TOKEN is empty"
    mismatch=1
  fi
  if [[ "$deploy_token" != "$backend_token" ]]; then
    echo "❌ mismatch: deploy RUNTIME_API_TOKEN != backend RUNTIME_API_TOKEN"
    echo "   sync required: export RUNTIME_API_TOKEN from deploy/.env into services/aris-backend/.env"
    mismatch=1
  fi
  if (( mismatch == 1 )); then
    echo "❗ continue check with deploy token can fail until tokens are aligned"
  else
    echo "✅ token values are aligned between deploy and backend env"
  fi

  if [[ "$runtime_backend" == "happy" ]]; then
    if [[ -z "$happy_server_url" ]]; then
      echo "❌ RUNTIME_BACKEND=happy 인데 HAPPY_SERVER_URL이 비어 있습니다."
      exit 1
    fi

    local runtime_origin happy_origin
    runtime_origin="$(extract_origin "$runtime_url")"
    happy_origin="$(extract_origin "$happy_server_url")"

    if [[ "$happy_origin" == "$runtime_origin" ]] || is_local_backend_origin "$happy_origin"; then
      echo "❌ HAPPY_SERVER_URL이 aris-backend 자체 주소로 설정되어 있습니다: $happy_server_url"
      echo "   외부 Happy 런타임 URL로 변경하거나 RUNTIME_BACKEND=mock으로 전환하세요."
      exit 1
    fi

    local happy_health_status
    happy_health_status="$(curl -sS -o /tmp/happy-health-status.$$ -w '%{http_code}' --max-time 4 "$happy_server_url/health" 2>/dev/null || true)"
    happy_health_status="$(normalize_http_code "$happy_health_status")"
    rm -f "/tmp/happy-health-status.$$"
    if [[ "$happy_health_status" == "000" ]]; then
      echo "❌ HAPPY_SERVER_URL에 연결할 수 없습니다: $happy_server_url"
      echo "   외부 Happy 런타임이 내려가 있으면 RUNTIME_BACKEND=mock으로 전환 후 backend reload를 권장합니다."
      exit 1
    fi
  fi

  log_section "runtime connectivity"
  local health_status
  health_status="$(curl -sS -o /tmp/runtime-health-status.$$ -w '%{http_code}' "$runtime_url/health" || true)"
  health_status="$(normalize_http_code "$health_status")"
  echo "/health status : $health_status"
  if [[ "$health_status" != "200" ]]; then
    echo "❌ runtime /health is not reachable (requires backend up)"
    if ((runtime_url_status != 0)); then
      echo "   tried URL candidates: 127.0.0.1:4080, host.docker.internal:4080, 172.17.0.1:4080, 172.18.0.1:4080, 172.19.0.1:4080"
      echo "   you can override with RUNTIME_API_URL to the reachable endpoint."
    fi
    rm -f "/tmp/runtime-health-status.$$"
    exit 1
  fi
  rm -f "/tmp/runtime-health-status.$$"
  echo "✅ runtime /health OK"

  log_section "auth check with deploy token"
  if [[ -z "$deploy_token" ]]; then
    echo "❌ cannot test auth without token"
    exit 1
  fi

  local no_auth_status no_auth_body good_auth
  no_auth_status="$(curl -sS -o /tmp/noauth_body.$$ -w '%{http_code}' "$runtime_url/v1/sessions" || true)"
  no_auth_status="$(normalize_http_code "$no_auth_status")"
  no_auth_body="$(cat /tmp/noauth_body.$$ | tr -d '\n' | sed 's/[[:space:]]\\+/ /g' || true)"
  rm -f "/tmp/noauth_body.$$"
  echo "/v1/sessions without token: $no_auth_status (${no_auth_body:-empty})"
  if [[ "$no_auth_status" != "401" ]]; then
    echo "⚠️  expected 401 without Authorization header"
  else
    echo "✅ unauthorized access is blocked"
  fi

  local with_token
  with_token="$(request_status "$deploy_token" "/v1/sessions" "$runtime_url" )"
  good_auth="${with_token%%|*}"
  local with_auth_body="${with_token#*|}"
  echo "/v1/sessions with deploy token: $good_auth (${with_auth_body:-empty})"

  if [[ "$good_auth" == "200" ]]; then
    echo "✅ deploy token works for runtime API"
  elif [[ "$good_auth" == "401" ]]; then
    echo "❌ deploy token is rejected by backend (still 401)"
    echo "   likely cause: backend process is running with different RUNTIME_API_TOKEN"
    exit 1
  else
    echo "❌ unexpected status with deploy token: $good_auth"
    exit 1
  fi

  if (( mismatch == 1 )); then
    echo "⚠️  token files are mismatched even though deploy token is accepted now."
    echo "   recommend restarting backend after env update and rerunning this check."
    exit 1
  fi

  echo "🎉 runtime auth check passed."
}

main "$@"
