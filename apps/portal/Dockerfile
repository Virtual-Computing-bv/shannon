# Nahayat Pentest portal — bundles the Shannon portal UI/server AND the
# Shannon worker runtime in a single image. No Docker socket, no DinD, no
# privileged sidecars — strict swarm-native.
#
# The portal spawns the worker (apps/worker/dist/temporal/worker.js) as a
# Node child process. The worker connects to a non-privileged `temporal`
# swarm sidecar at $TEMPORAL_ADDRESS (default shannon-temporal:7233).

# ── Stage 1: build the monorepo (portal web/server + worker dist) ────────────
# Debian-slim base (glibc) — alpine/musl prebuilds for native deps are
# flakier. The size delta is worth predictable native modules.
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

# Install all deps (incl. dev) so we can build everything.
RUN pnpm install --frozen-lockfile

# Now bring in the rest of the source.
COPY . .

# Build the worker (TypeScript → dist/), portal UI/server, and CLI bundle
# (we still ship the CLI binary for debugging — not on the runtime hot path).
RUN pnpm --filter @shannon/worker run build
RUN pnpm --filter @nahayat/pentest-portal run build
RUN pnpm --filter @keygraph/shannon run build

# Explicitly rebuild native modules so .node binaries land where the
# runtime stage can copy them.
RUN pnpm rebuild

# ── Stage 2: runtime image ───────────────────────────────────────────────────
# Includes Chromium (for playwright-cli), git, and the worker's Node runtime
# deps. No Docker CLI, no daemon, no socket.
FROM node:22-slim AS runtime

# Runtime tools:
#   git/curl/bash/ca-certs — clone customer repos + outbound HTTPS.
#   chromium               — playwright-cli launches headless browser sessions.
#   fonts-liberation       — chromium needs a font set or text renders empty.
#   The chromium deps (libnss3, libatk, libdrm, libxkbcommon, etc.) come in
#   transitively when apt installs the chromium meta-package on debian-slim.
RUN apt-get update && apt-get install -y --no-install-recommends \
      bash git ca-certificates curl \
      chromium fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy node_modules + built portal + worker dist + CLI bundle.
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/apps/portal/dist ./apps/portal/dist
COPY --from=builder /build/apps/portal/node_modules ./apps/portal/node_modules
COPY --from=builder /build/apps/worker/dist ./apps/worker/dist
COPY --from=builder /build/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=builder /build/apps/worker/prompts ./apps/worker/prompts
COPY --from=builder /build/apps/worker/configs ./apps/worker/configs
COPY --from=builder /build/apps/worker/package.json ./apps/worker/package.json
COPY --from=builder /build/apps/cli/dist ./apps/cli/dist
COPY --from=builder /build/apps/cli/infra ./apps/cli/infra
COPY --from=builder /build/apps/cli/package.json ./apps/cli/package.json
COPY --from=builder /build/apps/cli/node_modules ./apps/cli/node_modules
COPY --from=builder /build/shannon ./shannon
COPY --from=builder /build/package.json ./package.json
COPY --from=builder /build/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Make the shannon CLI script executable (kept around for debugging).
RUN chmod +x /app/shannon

# Install claude-code + playwright-cli globally so the worker can find them
# on PATH (the same versions used by the upstream worker image). Pinned to
# match Dockerfile at repo root to keep behaviour identical.
RUN npm install -g --ignore-scripts @anthropic-ai/claude-code@2.1.84 @playwright/cli@0.1.1

# Pre-warm Playwright's skills directory so SDK agents that invoke
# `playwright-cli` find the skill plugin without trying to write to
# read-only paths at runtime.
RUN mkdir -p /tmp/.claude/skills && \
    playwright-cli install --skills && \
    cp -r .claude/skills/playwright-cli /tmp/.claude/skills/ && \
    rm -rf .claude

# Symlink the worker's CLI helpers onto PATH (used by agent prompts).
RUN ln -s /app/apps/worker/dist/scripts/save-deliverable.js /usr/local/bin/save-deliverable && \
    chmod +x /app/apps/worker/dist/scripts/save-deliverable.js && \
    ln -s /app/apps/worker/dist/scripts/generate-totp.js /usr/local/bin/generate-totp && \
    chmod +x /app/apps/worker/dist/scripts/generate-totp.js

# System-level git config so the worker's deliverables-repo commits work
# regardless of which UID the container runs as.
RUN git config --system user.email "agent@localhost" && \
    git config --system user.name "Pentest Agent" && \
    git config --system --add safe.directory '*'

# State volume lives at /data (sqlite, sessions, cloned repos, scan logs,
# Shannon's workspaces dir, reports).
ENV NAHAYAT_DATA_DIR=/data \
    SHANNON_DIR=/app \
    HOME=/data/.home \
    PORT=3001 \
    NODE_ENV=production \
    TEMPORAL_ADDRESS=shannon-temporal:7233 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_MCP_EXECUTABLE_PATH=/usr/bin/chromium \
    SHANNON_DOCKER=true

# Non-root user. Matches the worker image's UID 1001 so any deliverable
# git history written by the worker is owned consistently.
RUN groupadd --system --gid 1001 scanner \
    && useradd  --system --uid 1001 --gid scanner --home /data/.home --shell /bin/bash scanner \
    && mkdir -p /data/.home /data/repos /data/reports /data/logs /data/workspaces \
    && chown -R scanner:scanner /data /app /tmp/.claude

EXPOSE 3001

# Lightweight entrypoint — no docker daemon probe, no GHCR login.
COPY apps/portal/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

USER scanner

ENTRYPOINT ["/app/docker-entrypoint.sh"]
# --experimental-sqlite: node:sqlite is built-in since 22.5 but still gated
# behind the flag on Node 22.x. Lets us skip native better-sqlite3.
CMD ["node", "--experimental-sqlite", "apps/portal/dist/server/index.js"]
