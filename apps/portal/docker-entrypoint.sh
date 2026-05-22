#!/bin/sh
set -e

# v0: skip the docker-daemon probe entirely. DOCKER_HOST defaults to a
# sidecar that may not exist in the catalog template, and `docker info`
# against an unreachable DNS name can hang. The portal checks for the
# daemon at scan-start time and surfaces a clean error to the customer
# there.
mkdir -p "$HOME"

# Best-effort docker login on the DinD sidecar so Shannon's CLI can `docker
# pull` the private GHCR worker image. We try a few times because DinD's
# daemon can take 5-15s to come up after the swarm replica is scheduled.
# Failures are logged and ignored — if the image is later made public, no
# login is required.
if [ -n "$GHCR_TOKEN" ] && [ -n "$GHCR_USERNAME" ]; then
    for attempt in 1 2 3 4 5; do
        if echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin >/dev/null 2>&1; then
            echo "[entrypoint] docker login to ghcr.io succeeded (attempt $attempt)"
            break
        fi
        echo "[entrypoint] docker login attempt $attempt failed, retrying in 3s..."
        sleep 3
    done
fi

exec "$@"
