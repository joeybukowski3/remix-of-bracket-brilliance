/**
 * Admin-only usage report. Shows UNKNOWN wherever plan, identity or usage is
 * not verified. Never reads or prints credential values.
 */
import { isApprovalExpired } from "./policy";
import { entryUnits, windowUsage } from "./windows";
import type { AccountUsageState, ProviderAccountConfig, WindowKind } from "./types";

export interface WindowReport {
  window: WindowKind;
  windowKey: string;
  resetsAt: string | null;
  limit: number | "UNKNOWN";
  limitSource: string;
  ledgerUnits: number;
  providerUsed: number | "UNKNOWN";
  unattributedUnits: number | "UNKNOWN";
  effectiveUsed: number;
  remaining: number | "UNKNOWN";
  ratio: number | "UNKNOWN";
  /** false = no provider usage report this window; figures are this ledger's lower bound only. */
  usageVerified: boolean;
  snapshotObservedAt: string | null;
}

export interface AttributionRow {
  sport: string;
  workflow: string;
  endpoint: string;
  requests: number;
  units: number;
  failures: number;
}

export interface AccountReport {
  accountId: string;
  provider: string;
  planStatus: string;
  identity: string;
  credentialEnvVars: readonly string[];
  nonessentialStatus: string;
  windows: WindowReport[];
  openReservations: number;
  /** Open longer than the account's reservationTtlMs: likely a crashed run. Still counted at estimate. */
  staleReservations: number;
  attribution: AttributionRow[];
  unmanagedConsumers: readonly string[];
}

const FAILURE_OUTCOMES = new Set(["http-error", "provider-error", "network-error"]);

function attributionRows(state: AccountUsageState): AttributionRow[] {
  const rows = new Map<string, AttributionRow>();
  for (const entry of state.entries) {
    const { sport, workflow, endpoint } = entry.attribution;
    const key = `${sport}|${workflow}|${endpoint}`;
    const row = rows.get(key) ?? { sport, workflow, endpoint, requests: 0, units: 0, failures: 0 };
    rows.set(key, {
      ...row,
      requests: row.requests + (entry.status === "released" ? 0 : 1),
      units: row.units + entryUnits(entry),
      failures: row.failures + (FAILURE_OUTCOMES.has(entry.outcome) ? 1 : 0),
    });
  }
  return [...rows.values()].sort((a, b) => b.units - a.units);
}

function nonessentialStatus(account: ProviderAccountConfig, nowMs: number): string {
  if (account.nonessentialBlockedReason) return `BLOCKED: ${account.nonessentialBlockedReason}`;
  if (account.planStatus === "unknown") return "BLOCKED: plan UNKNOWN";
  const approval = account.liveApproval;
  if (!approval) return "BLOCKED: no live-request approval";
  if (isApprovalExpired(approval, nowMs)) return `BLOCKED: approval ${approval.id} expired`;
  return `APPROVED: ${approval.id} (${approval.scope}, max ${approval.maxUnits} units)`;
}

export function buildAccountReport(account: ProviderAccountConfig, state: AccountUsageState, nowMs: number): AccountReport {
  const windows = account.windows.map((config): WindowReport => {
    const usage = windowUsage(config, state, nowMs);
    const limit = usage.limit;
    return {
      window: config.kind,
      windowKey: usage.bounds.key,
      resetsAt: config.kind === "minute" ? null : new Date(usage.bounds.endMs).toISOString(),
      limit: limit ?? "UNKNOWN",
      limitSource: config.source,
      ledgerUnits: usage.ledgerUnits,
      providerUsed: usage.providerUsed ?? "UNKNOWN",
      unattributedUnits: usage.unattributedUnits ?? "UNKNOWN",
      effectiveUsed: usage.effectiveUsed,
      remaining: limit === null ? "UNKNOWN" : limit - usage.effectiveUsed,
      ratio: limit === null || limit === 0 ? "UNKNOWN" : Number((usage.effectiveUsed / limit).toFixed(3)),
      usageVerified: usage.providerUsed !== null,
      snapshotObservedAt: usage.snapshotObservedAt,
    };
  });
  return {
    accountId: account.accountId,
    provider: account.provider,
    planStatus: account.planStatus === "unknown" ? "UNKNOWN" : account.planStatus,
    identity: account.identity === "unverified-may-share" ? "UNKNOWN (env vars may share one account)" : account.identity,
    credentialEnvVars: account.credentialEnvVars,
    nonessentialStatus: nonessentialStatus(account, nowMs),
    windows,
    openReservations: state.entries.filter((e) => e.status === "reserved").length,
    staleReservations: state.entries.filter((e) => e.status === "reserved" && nowMs - Date.parse(e.createdAt) > account.reservationTtlMs).length,
    attribution: attributionRows(state),
    unmanagedConsumers: account.unmanagedConsumers,
  };
}

export function formatReport(reports: readonly AccountReport[]): string {
  const lines: string[] = [];
  for (const r of reports) {
    lines.push(`## ${r.accountId} (${r.provider})`);
    lines.push(`plan: ${r.planStatus} | identity: ${r.identity} | credentials: ${r.credentialEnvVars.join(", ") || "none"}`);
    lines.push(`new/nonessential consumers: ${r.nonessentialStatus}`);
    if (r.windows.length === 0) lines.push("windows: UNKNOWN (no quota evidence)");
    for (const w of r.windows) {
      const verified = w.window === "minute" || w.usageVerified ? "" : " [UNVERIFIED: no provider usage report this window; ledger lower bound only]";
      lines.push(
        `  ${w.window}: used ${w.effectiveUsed}/${w.limit} (ratio ${w.ratio}; remaining ${w.remaining}; limit source ${w.limitSource}) ` +
          `ledger ${w.ledgerUnits}, provider ${w.providerUsed}, unattributed ${w.unattributedUnits}` +
          (w.resetsAt ? `, resets ${w.resetsAt}` : "") +
          verified,
      );
    }
    if (r.openReservations > 0) lines.push(`  open reservations: ${r.openReservations} (counted at estimate; ${r.staleReservations} past TTL, check for crashed runs)`);
    for (const a of r.attribution) lines.push(`  - ${a.sport}/${a.workflow}${a.endpoint}: ${a.requests} req, ${a.units} units, ${a.failures} failed`);
    if (r.unmanagedConsumers.length) lines.push(`  unmanaged consumers (usage visible only via provider headers): ${r.unmanagedConsumers.length}`);
    for (const c of r.unmanagedConsumers) lines.push(`    * ${c}`);
    lines.push("");
  }
  return lines.join("\n");
}
