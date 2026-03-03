#!/bin/sh
set -eu

tries=0
max_tries=30

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
