# Nahayat Pentest portal

A single-tenant web portal around [Shannon Lite](https://github.com/Virtual-Computing-bv/shannon) (AGPL-3.0).
The customer deploys one of these per debtor; everything in the container is
their own — admin account, encrypted Anthropic API key, scan history, reports.

## What lives here

```
apps/portal/
├── src/
│   ├── shared/types.ts        — wire types shared by server + UI
│   ├── server/
│   │   ├── index.ts           — Express entry, sessions, static serve
│   │   ├── db.ts              — better-sqlite3 + AES-256-GCM at-rest crypto
│   │   ├── settings.ts        — get/set encrypted Anthropic key
│   │   ├── routes.ts          — REST API: bootstrap, login, targets, scans, settings
│   │   └── runner.ts          — execa wrapper around `./shannon start`
│   └── web/
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx            — Setup/Login/Dashboard routing-by-state
│       ├── components/Brand.tsx
│       └── views/
│           ├── Setup.tsx      — first-launch admin password
│           ├── Login.tsx
│           ├── Dashboard.tsx  — Targets / Scans / Settings tabs
│           ├── Targets.tsx    — CRUD + start-scan
│           ├── Scans.tsx      — list + live log tail + report viewer
│           └── SettingsView.tsx — BYOK Anthropic key
├── Dockerfile
├── docker-entrypoint.sh
├── tailwind.config.ts         — Nahayat tokens (warm onyx + gold + violet)
├── vite.config.ts
├── tsconfig.json
└── tsconfig.server.json
```

## Local dev

```bash
pnpm install
pnpm --filter @nahayat/pentest-portal run dev
```

Vite serves the UI on `:5173` and proxies `/api/*` to the Express server on
`:3001`. `NAHAYAT_DATA_DIR=./.dev-data` keeps state out of `/data`.

## Container deployment

The image bundles Shannon's CLI + this portal. At runtime the CLI needs a
Docker daemon to spawn ephemeral worker containers. The portal expects that
daemon at `$DOCKER_HOST` (defaults to `tcp://shannon-dind:2375`).

**Two deployment shapes are supported:**

### A. Dedicated VM (simplest, recommended for v0)

Run on a host with a local Docker daemon. Mount `/var/run/docker.sock` and
set `DOCKER_HOST=unix:///var/run/docker.sock`. Acceptable when the entire VM
is dedicated to this one customer's pentest workload — never on a shared
swarm node.

```bash
docker run -d \
  -e DOCKER_HOST=unix:///var/run/docker.sock \
  -e NAHAYAT_DATA_DIR=/data \
  -v nahayat-pentest-data:/data \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -p 3001:3001 \
  ghcr.io/virtual-computing-bv/nahayat-pentest:latest
```

### B. Swarm with DinD sidecar (multi-tenant safe)

Sidecar `docker:dind` runs privileged on a per-deploy basis; the portal
talks to it via `DOCKER_HOST=tcp://shannon-dind:2375`. This isolates each
customer's nested Docker daemon from the swarm host.

This is the default for the `nahayat-pentest` template in our catalog.
The `privileged: true` flag on the sidecar maps to swarm `CapabilityAdd:
ALL` + `Privileges.Seccomp: unconfined` + `Privileges.AppArmor: disabled`
— enough for DinD without needing the unsupported `--privileged` shortcut.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | HTTP port the portal listens on |
| `NAHAYAT_DATA_DIR` | `/data` | Where SQLite, sessions, logs, reports live |
| `DOCKER_HOST` | `tcp://shannon-dind:2375` | Docker daemon for spawning workers |
| `SHANNON_DIR` | `/app` | Where the bundled Shannon CLI lives |
| `NAHAYAT_ENCRYPTION_KEY` | (auto-generated) | Pin AES key across redeploys |
| `HOME` | `/data/.home` | Shannon writes `~/.shannon/` here |

## Security model

- Admin password is bcrypt-hashed (cost 12).
- Anthropic API key is AES-256-GCM encrypted at rest; the per-deploy key
  is derived from `NAHAYAT_ENCRYPTION_KEY` if set, otherwise auto-generated
  on first launch and stored in the same SQLite. Pin it for portable backups.
- Sessions are stored in connect-sqlite3 (`/data/sessions/sessions.sqlite`),
  with a 30-day cookie.
- No multi-tenancy — every deploy is one customer.
