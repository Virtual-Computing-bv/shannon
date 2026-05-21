#!/bin/sh
set -e

# Best-effort probe of $DOCKER_HOST so the operator can see whether scan-
# execution will work. We DON'T block startup on it: in v0 the Docker
# daemon is optional (portal UI is fully usable without it for managing
# targets + settings + viewing past reports). The wait is short.
if [ -n "${DOCKER_HOST:-}" ]; then
  echo "[entrypoint] probing docker daemon on ${DOCKER_HOST}…"
  ok=0
  for i in $(seq 1 5); do
    if docker info >/dev/null 2>&1; then
      ok=1
      break
    fi
    sleep 1
  done
  if [ "$ok" = "1" ]; then
    echo "[entrypoint] docker daemon reachable — scans can execute."
  else
    echo "[entrypoint] docker daemon NOT reachable at ${DOCKER_HOST} — portal will start in read-only mode (scans will fail until a daemon is wired up)."
  fi
fi

# Ensure HOME for Shannon's ~/.shannon/ exists and is writable.
mkdir -p "$HOME"

exec "$@"
