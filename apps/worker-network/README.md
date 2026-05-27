# @nahayat/worker-network

AI-driven network pentest engine. Spawned per-scan by the portal whenever a
network-kind target is run. Claude orchestrates a curated set of audited
pentest tools (nmap, nuclei, gobuster, whatweb, searchsploit, metasploit,
hydra) against a scope-checked allowlist of hosts and produces a Markdown
report.

## Pipeline

```
                        ┌──────────────────────────────────────────┐
   portal (scope        │  portal/server/runner.ts                 │
   gate + dispatch)     │   - resolves hosts → IPs                 │
   ────────────────────▶│   - matches against scope_rules table    │
                        │   - persists scope-decisions.json        │
                        │   - spawns worker-network if allowed     │
                        └──────────────────┬───────────────────────┘
                                           │ execa node dist/run.js
                                           ▼
                  ┌──────────────────────────────────────────────────┐
                  │ worker-network/run.ts                            │
                  │   phase 1 ─ recon   (nmap, dig, openssl, …)      │
                  │   phase 2 ─ enum    (nuclei, gobuster, whatweb,  │
                  │                       enum4linux, sqlmap, …)     │
                  │   phase 3 ─ exploit (searchsploit, msf, hydra)   │
                  │   phase 4 ─ report  (Claude consolidates)        │
                  └──────────────────────────────────────────────────┘
                                           │
                                           ▼
                       /data/reports/<scan-id>/network-pentest-*.md
```

Each phase is a single Anthropic Messages API conversation. The system prompt
loads `prompts/system-base.md` + `prompts/phase-<phase>.md`. The user prompt
carries the scope + allowlist + prior-phase output.

## Tool surface

| Tool | Min intensity | Notes |
|------|---------------|-------|
| `nmap_scan` | recon | Port/service discovery. Default T3 / 1-1000. |
| `shell_command` | recon | Binary-allowlisted shell (curl, dig, sqlmap, enum4linux, crackmapexec, …). |
| `nuclei_scan` | enum | JSONL CVE/misconfig findings. |
| `gobuster_dir` | enum | Directory brute-force on HTTP/HTTPS. |
| `whatweb_fingerprint` | enum | Tech-stack fingerprint. |
| `searchsploit_lookup` | enum | Read-only Exploit-DB lookup. |
| `metasploit_module` | exploit | `check` action by default; gated by global exploit-module switch. |
| `hydra_brute` | exploit | Credential brute-force. |

Every tool wraps a Zod schema for input validation, calls `assertHostsAllowed`
to refuse anything outside the scope allowlist, and writes a JSONL audit
entry plus a full-output dump to the workspace.

## CLI

```sh
node dist/run.js \
  --workspace /data/workspaces/<scan-id> \
  --output    /data/reports/<scan-id> \
  --intensity exploit \
  --scope-label "Lab DMZ 2026-Q2" \
  --host 10.20.30.5 \
  --host 10.20.30.6
```

The portal calls this with the post-scope-gate host set. The worker treats
its `--host` args as the final, immutable allowlist — there is no path for
Claude to expand it.

## Env

- `ANTHROPIC_API_KEY` — required.
- `NAHAYAT_PENTEST_MODEL` — default `claude-opus-4-7`.
- `NAHAYAT_MAX_TURNS` — default 60.
- `NAHAYAT_MAX_TOKENS` — default 16384.
- `NAHAYAT_SCAN_ID` — used to name the final report file.

## Output

- `<workspace>/tool-audit.jsonl` — one line per tool invocation
- `<workspace>/tool-<name>-<ts>.log` — full untruncated tool output
- `<workspace>/phase-{recon,enum,exploit}.md` — per-phase text deliverable
- `<output>/network-pentest-<scan-id>.md` — final report
