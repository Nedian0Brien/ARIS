#!/usr/bin/env bash

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

require_deploy_env_file() {
  local caller="$1"
  local explicit_path="${2:-}"
  local env_file="${explicit_path:-${DEPLOY_ENV_FILE:-}}"

  if [[ -z "$env_file" ]]; then
    echo "[$caller] DEPLOY_ENV_FILE is required. Example: export DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env" >&2
    return 1
  fi

  if [[ ! -f "$env_file" ]]; then
    echo "[$caller] env file not found: $env_file" >&2
    return 1
  fi

  export DEPLOY_ENV_FILE="$env_file"
  printf '%s\n' "$env_file"
}

require_env_keys() {
  local caller="$1"
  local file="$2"
  shift 2

  local missing=0
  local key value
  for key in "$@"; do
    value="$(read_env_value "$file" "$key" || true)"
    if [[ -z "$value" ]]; then
      echo "[$caller] required key missing in ${file}: ${key}" >&2
      missing=1
    fi
  done

  return "$missing"
}

resolve_shared_repo_root() {
  local repo_root="$1"
  local common_git_dir=""

  common_git_dir="$(git -C "$repo_root" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
  if [[ -z "$common_git_dir" ]]; then
    printf '%s\n' "$repo_root"
    return 0
  fi

  cd "${common_git_dir}/.." && pwd
}

resolve_deploy_state_dir() {
  local shared_repo_root="$1"
  printf '%s\n' "${DEPLOY_STATE_DIR:-${shared_repo_root}/deploy/.state}"
}

resolve_deploy_log_dir() {
  local shared_repo_root="$1"
  printf '%s\n' "${DEPLOY_LOG_DIR:-${shared_repo_root}/deploy/.logs}"
}
