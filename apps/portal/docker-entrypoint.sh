#!/bin/sh
set -e

# In-process worker model: no docker daemon to probe, no GHCR pull, no
# privileged sidecar. The portal spawns the worker as a Node child process
# and connects to the `temporal` swarm sidecar over plain gRPC.

mkdir -p "$HOME"

exec "$@"
