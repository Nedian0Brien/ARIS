#!/bin/sh
set -eu

tries=0
max_tries=30
HOST_HOME_DIR="${HOST_HOME_DIR:-/home/ubuntu}"

if command -v git >/dev/null 2>&1; then
  for safe_root in /workspace "$HOST_HOME_DIR"; do
    if [ -d "$safe_root" ]; then
      # Repo roots under /home/ubuntu are often nested one level deeper than the
      # previous scan covered, so include the .git entry itself in the search.
      find "$safe_root" -mindepth 1 -maxdepth 3 \( -type d -name .git -o -type f -name .git \) 2>/dev/null \
        | while IFS= read -r git_meta_path; do
          repo_dir=$(dirname "$git_meta_path")
          git config --global --add safe.directory "$repo_dir" >/dev/null 2>&1 || true
        done
    fi
  done
fi

until npm run prisma:deploy; do
  tries=$((tries + 1))
  if [ "$tries" -ge "$max_tries" ]; then
    echo "[aris-web] prisma migrate deploy failed after ${max_tries} attempts"
    exit 1
  fi

  echo "[aris-web] waiting for database (${tries}/${max_tries})"
  sleep 2
done

npm run seed
exec npm run start -- -H 0.0.0.0 -p "${PORT:-3000}"
