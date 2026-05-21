#!/bin/sh
set -e

# Wait for the DinD sidecar to be reachable on $DOCKER_HOST. DinD typically
# needs 5-15s to start; without this the first scan after `docker stack
# deploy` would fail because Shannon's CLI calls `docker compose up -d`.
if [ -n "${DOCKER_HOST:-}" ]; then
  echo "[entrypoint] waiting for docker daemon on ${DOCKER_HOST}…"
  for i in $(seq 1 60); do
    if docker info >/dev/null 2>&1; then
      echo "[entrypoint] docker daemon reachable."
      break
    fi
    sleep 1
  done
fi

# Ensure HOME for Shannon's ~/.shannon/ exists and is writable.
mkdir -p "$HOME"

exec "$@"
