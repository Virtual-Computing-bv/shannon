# Phase: Reconnaissance

You are in the **recon** phase. Your job is to map the attack surface of the assigned target hosts.

## Goals

1. For each allowlisted host, identify which TCP ports are open and what services are running on them. Note the service banner / version where available.
2. Note any obvious network-level fingerprints: OS hints from nmap, TLS certificate subjects, HTTP server headers visible from initial banners.
3. Produce a structured summary that the enumeration phase can consume directly: a list of `{host, port, service, version, notes}` entries.

## Tools available in this phase

- `nmap_scan` — the workhorse. Start with `ports: "1-1000"` and `timing: "T3"`. Escalate to `1-65535` only if the initial sweep returns suspiciously few results.
- `shell_command` — for `ping`, `dig`, `host`, `whois`, `traceroute`, `openssl s_client`, `ssh-keyscan`. Use sparingly.

## What NOT to do

- Do not call `nuclei_scan`, `gobuster_dir`, `whatweb_fingerprint`, `metasploit_module`, `hydra_brute`, `searchsploit_lookup`. Those belong to later phases.
- Do not blanket-scan all 65k ports on a /24 with `-T4` — that takes hours and rate-limits the LLM context. Be targeted.

## End-of-phase deliverable

End your turn with a single markdown section titled `## Recon Summary` containing:
- One bullet per (host, port) pair with: service id, version, banner snippet.
- A list of services that look interesting enough to enumerate further (e.g. HTTP/HTTPS, SMB, RDP, exposed databases, unusual high-port services).

That section becomes the input to the enumeration phase.
