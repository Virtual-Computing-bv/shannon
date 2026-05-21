#!/bin/sh
set -e

# v0: skip the docker-daemon probe entirely. DOCKER_HOST defaults to a
# sidecar that may not exist in the catalog template, and `docker info`
# against an unreachable DNS name can hang. The portal checks for the
# daemon at scan-start time and surfaces a clean error to the customer
# there.
mkdir -p "$HOME"

exec "$@"
