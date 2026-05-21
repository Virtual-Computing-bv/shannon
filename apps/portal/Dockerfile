# Nahayat Pentest portal — bundles the Shannon CLI + our admin portal in
# one image. Customer-deployed container talks to a DinD sidecar via
# DOCKER_HOST=tcp://shannon-dind:2375; Shannon's CLI then brings up its own
# Temporal + worker inside that DinD so nothing leaks onto the swarm host.

# ── Stage 1: build the monorepo (CLI bundle + portal web/server) ─────────────
FROM node:22-alpine AS builder

RUN apk add --no-cache bash python3 make g++ git
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

# Re-install prod-only deps for runtime stage.
RUN rm -rf node_modules apps/*/node_modules \
  && pnpm install --frozen-lockfile --prod

# ── Stage 2: runtime image ───────────────────────────────────────────────────
FROM node:22-alpine AS runtime

# Tools we need at runtime:
#   docker-cli + docker-cli-compose  — talk to DinD sidecar
#   git                              — shallow-clone customer repos
#   bash                             — Shannon's entrypoint scripts
#   ca-certificates                  — TLS to Anthropic + GitHub
RUN apk add --no-cache bash git docker-cli docker-cli-compose ca-certificates curl

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
CMD ["node", "apps/portal/dist/server/index.js"]
