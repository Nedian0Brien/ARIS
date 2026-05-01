#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# shellcheck source=../lib/nginx.sh
source "${ROOT_DIR}/deploy/lib/nginx.sh"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

call_log="${tmp_dir}/calls.log"

cat > "${tmp_dir}/sudo-stub" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail

printf 'sudo %s\n' "$*" >> "$ARIS_TEST_CALL_LOG"

case "$*" in
  'nginx -t')
    exit 0
    ;;
  'systemctl reload nginx')
    exit 1
    ;;
  'nginx -s reload')
    exit 1
    ;;
  'systemctl show -p ActiveState -p SubState -p MainPID nginx')
    printf 'ActiveState=failed\nSubState=failed\nMainPID=0\n'
    exit 0
    ;;
  'test -s /run/nginx.pid'|'test -s /var/run/nginx.pid')
    exit 1
    ;;
  'cat /run/nginx.pid'|'cat /var/run/nginx.pid')
    exit 0
    ;;
esac

exit 0
STUB

cat > "${tmp_dir}/pgrep-stub" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf 'pgrep %s\n' "$*" >> "$ARIS_TEST_CALL_LOG"
if [[ "$*" == '-xo nginx' ]]; then
  printf '1234\n'
  exit 0
fi
exit 1
STUB

cat > "${tmp_dir}/kill-stub" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf 'kill %s\n' "$*" >> "$ARIS_TEST_CALL_LOG"
exit 0
STUB

chmod +x "${tmp_dir}/sudo-stub" "${tmp_dir}/pgrep-stub" "${tmp_dir}/kill-stub"

export ARIS_TEST_CALL_LOG="$call_log"
export ARIS_DEPLOY_SUDO="${tmp_dir}/sudo-stub"
export ARIS_DEPLOY_PGREP="${tmp_dir}/pgrep-stub"
export ARIS_DEPLOY_KILL="${tmp_dir}/kill-stub"

reload_nginx >/tmp/aris-nginx-reload-test.out 2>/tmp/aris-nginx-reload-test.err

grep -q 'sudo nginx -t' "$call_log"
grep -q 'sudo systemctl reload nginx' "$call_log"
grep -q 'sudo nginx -s reload' "$call_log"
grep -q 'pgrep -xo nginx' "$call_log"
grep -q 'kill -HUP 1234' "$call_log"
grep -q 'falling back to nginx master HUP' /tmp/aris-nginx-reload-test.err
