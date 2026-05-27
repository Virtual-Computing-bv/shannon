/**
 * Scope validation for network-pentest targets.
 *
 * Resolves each requested host (IP, CIDR, or hostname) to an effective
 * IP set, then checks it against the configured allow/deny rules. The
 * worker-network engine refuses to dispatch any active probe unless
 * every host clears this check, and the rule evaluator is identical
 * in the portal preflight and in the worker (defense in depth).
 *
 * Rules are evaluated in this order:
 *   1. Per-target rules (most specific) — first match wins
 *   2. Global rules (target_id IS NULL)  — first match wins
 *   3. Fallback to scopeDefaultPolicy
 *
 * IPv4-only for now. IPv6 support is a follow-up — the resolver would
 * need to walk addresses returned by dns.lookup with `family: 6` and
 * a 128-bit BigInt CIDR check.
 */

import dns from 'node:dns/promises';
import type { ScopeRule, ScopeRulePolicy } from '../shared/types.js';

export interface HostResolution {
  /** Raw host string as entered by the user (e.g. '10.0.0.0/24'). */
  raw: string;
  /** Hostname after CIDR/IP stripping — used for glob matching. */
  hostname: string | null;
  /**
   * The set of IPv4 addresses this host expands to. For CIDR inputs we
   * keep the network address + prefix length; we don't enumerate every
   * /24 host. The CIDR is matched against rule-CIDRs as a range
   * intersection (any-overlap = match).
   */
  cidrs: Array<{ network: bigint; prefix: number }>;
  /** Set if resolution failed. */
  error?: string;
}

export interface ScopeDecision {
  host: HostResolution;
  decision: 'allow' | 'deny';
  /** ID of the rule that matched (-1 = no rule, default policy applied). */
  matchedRuleId: number;
  /** Human-readable reason for the audit log. */
  reason: string;
}

export interface ScopeCheckResult {
  /** True iff every host resolved to allow. */
  allowed: boolean;
  decisions: ScopeDecision[];
}

const CIDR_RE = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/;
const IPV4_RE = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/;

function ipv4ToBigInt(ip: string): bigint | null {
  const m = IPV4_RE.exec(ip);
  if (!m) return null;
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return null;
  for (const p of parts) {
    if (!Number.isInteger(p) || p < 0 || p > 255) return null;
  }
  const [a, b, c, d] = parts as [number, number, number, number];
  return (BigInt(a) << 24n) | (BigInt(b) << 16n) | (BigInt(c) << 8n) | BigInt(d);
}

function parseCidr(input: string): { network: bigint; prefix: number } | null {
  if (IPV4_RE.test(input)) {
    const n = ipv4ToBigInt(input);
    if (n === null) return null;
    return { network: n, prefix: 32 };
  }
  const m = CIDR_RE.exec(input);
  if (!m) return null;
  const prefix = Number(m[2]);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const ip = ipv4ToBigInt(m[1]!);
  if (ip === null) return null;
  // Normalize: zero out host bits.
  const mask = prefix === 0 ? 0n : (0xffffffffn << BigInt(32 - prefix)) & 0xffffffffn;
  return { network: ip & mask, prefix };
}

function rangesOverlap(a: { network: bigint; prefix: number }, b: { network: bigint; prefix: number }): boolean {
  const shorter = Math.min(a.prefix, b.prefix);
  const mask = shorter === 0 ? 0n : (0xffffffffn << BigInt(32 - shorter)) & 0xffffffffn;
  return (a.network & mask) === (b.network & mask);
}

/**
 * Convert a hostname glob ('*.lab.example' or 'exact.example.com') into
 * a regex. '*' matches any sequence of characters except a dot — this
 * keeps `*.example.com` from matching `foo.bar.example.com` which would
 * surprise users; if they want deep matching they write `**` and we
 * convert it to `.*`.
 */
function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__DEEP__')
    .replace(/\*/g, '[^.]*')
    .replace(/__DEEP__/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

export async function resolveHost(raw: string): Promise<HostResolution> {
  const trimmed = raw.trim();
  // CIDR or bare IPv4
  const cidr = parseCidr(trimmed);
  if (cidr) {
    return { raw: trimmed, hostname: null, cidrs: [cidr] };
  }
  // Hostname — resolve to A records
  try {
    const records = await dns.lookup(trimmed, { all: true, family: 4 });
    const cidrs: Array<{ network: bigint; prefix: number }> = [];
    for (const r of records) {
      const n = ipv4ToBigInt(r.address);
      if (n !== null) cidrs.push({ network: n, prefix: 32 });
    }
    if (cidrs.length === 0) {
      return { raw: trimmed, hostname: trimmed, cidrs: [], error: 'no IPv4 records' };
    }
    return { raw: trimmed, hostname: trimmed, cidrs };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { raw: trimmed, hostname: trimmed, cidrs: [], error: `dns lookup failed: ${msg}` };
  }
}

function matchRule(host: HostResolution, rule: ScopeRule): boolean {
  if (rule.cidr) {
    const ruleCidr = parseCidr(rule.cidr);
    if (!ruleCidr) return false;
    return host.cidrs.some((hc) => rangesOverlap(hc, ruleCidr));
  }
  if (rule.hostnameGlob && host.hostname) {
    return globToRegex(rule.hostnameGlob).test(host.hostname);
  }
  return false;
}

/**
 * Evaluate scope for a single resolved host. Rules are pre-sorted by
 * specificity by the caller (per-target before global). First match
 * wins; no match → defaultPolicy.
 */
function decideHost(host: HostResolution, rules: ScopeRule[], defaultPolicy: ScopeRulePolicy): ScopeDecision {
  if (host.error) {
    return {
      host,
      decision: 'deny',
      matchedRuleId: -1,
      reason: `resolution error: ${host.error}`,
    };
  }
  for (const rule of rules) {
    if (matchRule(host, rule)) {
      return {
        host,
        decision: rule.policy,
        matchedRuleId: rule.id,
        reason: `${rule.policy} via ${rule.cidr ?? rule.hostnameGlob} (rule #${rule.id})`,
      };
    }
  }
  return {
    host,
    decision: defaultPolicy,
    matchedRuleId: -1,
    reason: `no rule matched — default policy ${defaultPolicy}`,
  };
}

/**
 * Top-level scope check. Resolves each raw host, runs it through the
 * combined rule set, and returns a per-host decision plus a single
 * boolean `allowed` flag that's true iff every host cleared.
 */
export async function checkScope(
  rawHosts: string[],
  perTargetRules: ScopeRule[],
  globalRules: ScopeRule[],
  defaultPolicy: ScopeRulePolicy,
): Promise<ScopeCheckResult> {
  // Per-target rules win over global. The DB returns them in id order;
  // we just concatenate so the per-target list is evaluated first.
  const rules = [...perTargetRules, ...globalRules];
  const resolutions = await Promise.all(rawHosts.map((h) => resolveHost(h)));
  const decisions = resolutions.map((host) => decideHost(host, rules, defaultPolicy));
  return {
    allowed: decisions.every((d) => d.decision === 'allow'),
    decisions,
  };
}
