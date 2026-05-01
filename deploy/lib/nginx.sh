#!/usr/bin/env bash

deploy_nginx_sudo() {
  "${ARIS_DEPLOY_SUDO:-sudo}" "$@"
}

deploy_nginx_pgrep() {
  "${ARIS_DEPLOY_PGREP:-pgrep}" "$@"
}

deploy_nginx_kill() {
  if [[ -n "${ARIS_DEPLOY_KILL:-}" ]]; then
    "${ARIS_DEPLOY_KILL}" "$@"
    return
  fi

  deploy_nginx_sudo kill "$@"
}

log_nginx_reload_diagnostics() {
  local status_output=""
  if status_output="$(deploy_nginx_sudo systemctl show -p ActiveState -p SubState -p MainPID nginx 2>&1)"; then
    while IFS= read -r line; do
      [[ -n "$line" ]] && echo "[deploy:web-zd] nginx systemd: ${line}" >&2
    done <<< "$status_output"
  else
    echo "[deploy:web-zd] nginx systemd status unavailable: ${status_output}" >&2
  fi

  local pid_file pid_value
  for pid_file in /run/nginx.pid /var/run/nginx.pid; do
    if deploy_nginx_sudo test -s "$pid_file"; then
      pid_value="$(deploy_nginx_sudo cat "$pid_file" 2>/dev/null || true)"
      echo "[deploy:web-zd] nginx pid file ${pid_file}: ${pid_value:-unreadable}" >&2
    else
      echo "[deploy:web-zd] nginx pid file ${pid_file}: missing or empty" >&2
    fi
  done
}

reload_nginx() {
  deploy_nginx_sudo nginx -t >/dev/null

  if deploy_nginx_sudo systemctl reload nginx; then
    return 0
  fi

  echo "[deploy:web-zd] systemctl reload nginx failed; trying nginx -s reload" >&2
  if deploy_nginx_sudo nginx -s reload; then
    return 0
  fi

  log_nginx_reload_diagnostics

  local master_pid=""
  master_pid="$(deploy_nginx_pgrep -xo nginx 2>/dev/null || true)"
  if [[ -n "$master_pid" ]]; then
    echo "[deploy:web-zd] falling back to nginx master HUP: ${master_pid}" >&2
    if deploy_nginx_kill -HUP "$master_pid"; then
      return 0
    fi

    echo "[deploy:web-zd] failed to signal nginx master process: ${master_pid}" >&2
    return 1
  fi

  echo "[deploy:web-zd] nginx reload failed and no nginx master process was found" >&2
  return 1
}
