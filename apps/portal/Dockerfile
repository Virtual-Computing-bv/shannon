# Nahayat Pentest portal — bundles the Shannon CLI + our admin portal in
# one image. Customer-deployed container talks to a DinD sidecar via
# DOCKER_HOST=tcp://shannon-dind:2375; Shannon's CLI then brings up its own
# Temporal + worker inside that DinD so nothing leaks onto the swarm host.

# ── Stage 1: build the monorepo (CLI bundle + portal web/server) ─────────────
# Debian-slim base (glibc) — alpine/musl prebuilds for better-sqlite3 +
# friends are flakier and have hit "Could not locate the bindings file"
# multiple times in CI. The size delta is ~50MB, easily worth predictable
# native deps.
FROM node:22-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
      bash python3 make g++ git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g --ignore-scripts pnpm@10.33.0

WORKDIR /build

# Copy workspace manifests first for cache friendliness.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/cli/package.json ./apps/cli/
COPY apps/portal/package.json ./apps/portal/
COPY apps/worker/package.json ./apps/worker/
COPY tsconfig.base.json ./

# Install all deps (incl. dev) so we can build both CLI and portal.
RUN pnpm install --frozen-lockfile

# Now bring in the rest of the source.
COPY . .

# Build the CLI bundle (tsdown → apps/cli/dist/index.mjs + infra/).
RUN pnpm --filter @keygraph/shannon run build

# Build the portal (Vite for the React UI, tsc for the Express server).
RUN pnpm --filter @nahayat/pentest-portal run build

# Explicitly rebuild native modules so the .node binaries land in
# node_modules/.pnpm/<pkg>/.../build/ for the runtime stage to copy.
RUN pnpm rebuild

# NOTE: we don't strip devDeps for a prod-only install — pnpm's --prod
# pass has skipped install scripts in CI, leaving better-sqlite3 without
# its native binding. Carrying ~30MB extra of dev tooling is the cheaper
# trade than another debugging round-trip.

# ── Stage 2: runtime image ───────────────────────────────────────────────────
FROM node:22-slim AS runtime

# Runtime tools:
#   git                — shallow-clone customer repos
#   bash + ca-certificates + curl — entrypoint + outbound HTTPS
#   docker static CLI  — talk to remote DinD/socket (no daemon needed here)
ARG DOCKER_CLI_VERSION=27.3.1
RUN apt-get update && apt-get install -y --no-install-recommends \
      bash git ca-certificates curl \
    && curl -fsSL "https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_CLI_VERSION}.tgz" \
        | tar -xz -C /tmp \
    && mv /tmp/docker/docker /usr/local/bin/docker \
    && chmod +x /usr/local/bin/docker \
    && rm -rf /tmp/docker /var/lib/apt/lists/*

WORKDIR /app

# Copy node_modules + built portal + shannon CLI bundle.
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/apps/portal/dist ./apps/portal/dist
COPY --from=builder /build/apps/portal/node_modules ./apps/portal/node_modules
COPY --from=builder /build/apps/cli/dist ./apps/cli/dist
COPY --from=builder /build/apps/cli/infra ./apps/cli/infra
COPY --from=builder /build/apps/cli/package.json ./apps/cli/package.json
COPY --from=builder /build/shannon ./shannon
COPY --from=builder /build/package.json ./package.json

# Make the shannon entry script executable + ensure it doesn't try to set
# SHANNON_LOCAL=1 (we want npx-mode: pull worker image from Docker Hub).
RUN chmod +x /app/shannon

# State volume lives at /data (sqlite, sessions, cloned repos, scan logs,
# Shannon's ~/.shannon/, downloaded worker image cache, reports).
ENV NAHAYAT_DATA_DIR=/data \
    SHANNON_DIR=/app \
    HOME=/data/.home \
    PORT=3001 \
    NODE_ENV=production

# Default DOCKER_HOST points at the DinD sidecar — control-plane sidecar
# wiring will override this if the customer renames the service.
ENV DOCKER_HOST=tcp://shannon-dind:2375

# Prepare HOME so Shannon's ~/.shannon state survives container restarts.
RUN mkdir -p /data/.home && chmod 0777 /data

EXPOSE 3001

# Wait briefly for DinD to come up on first launch — DinD takes 5-15s to
# start the daemon, and Shannon's CLI fails fast if it can't talk to docker.
COPY apps/portal/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

ENTRYPOINT ["/app/docker-entrypoint.sh"]
# --experimental-sqlite: node:sqlite is built-in since 22.5 but still gated
# behind the flag on Node 22.x. Lets us skip native better-sqlite3.
CMD ["node", "--experimental-sqlite", "apps/portal/dist/server/index.js"]
