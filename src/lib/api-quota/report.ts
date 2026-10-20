/**
 * Admin-only usage report. Shows UNKNOWN wherever plan, identity or usage is
 * not verified. Never reads or prints credential values.
 */
import { isApprovalExpired } from "./policy";
import { entriesInWindow, entryUnits, windowBounds, windowUsage, type CounterDecrease } from "./windows";
import type { AccountUsageState, LedgerEntry, ProviderAccountConfig, QuotaWindowConfig, WindowKind } from "./types";

export interface WindowReport {
  window: WindowKind;
  windowKey: string;
  /** null for the rolling minute window. */
  startsAt: string | null;
  resetsAt: string | null;
  /** "verified" only when the limit came from our own account; otherwise the reset time is what the docs say, not what we saw. */
  resetBoundary: string;
  /** Provider-reported counters that went down inside this window. */
  counterDecreases: CounterDecrease[];
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
  /** Window `attribution` is scoped to (the account's day window, else month); null = no such window, so it covers every retained entry. */
  attributionWindow: string | null;
  /** Usage inside `attributionWindow`. */
  attribution: AttributionRow[];
  /** Every retained ledger entry, including earlier windows (entries already rolled up are excluded). */
  attributionAllEntries: AttributionRow[];
  unmanagedConsumers: readonly string[];
}

const FAILURE_OUTCOMES = new Set(["http-error", "provider-error", "network-error"]);

function attributionRows(entries: readonly LedgerEntry[]): AttributionRow[] {
  const rows = new Map<string, AttributionRow>();
  for (const entry of entries) {
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

const totalRequests = (rows: readonly AttributionRow[]) => rows.reduce((sum, row) => sum + row.requests, 0);

function attributionWindowConfig(account: ProviderAccountConfig): QuotaWindowConfig | undefined {
  return account.windows.find((w) => w.kind === "day") ?? account.windows.find((w) => w.kind === "month");
}

function resetBoundaryLabel(config: QuotaWindowConfig): string {
  if (config.kind === "minute") return "rolling";
  return config.source === "account-verified" ? "verified" : `assumed (${config.source})`;
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
      startsAt: config.kind === "minute" ? null : new Date(usage.bounds.startMs).toISOString(),
      resetsAt: config.kind === "minute" ? null : new Date(usage.bounds.endMs).toISOString(),
      resetBoundary: resetBoundaryLabel(config),
      counterDecreases: usage.counterDecreases,
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
  const scopeConfig = attributionWindowConfig(account);
  const scope = scopeConfig ? windowBounds(scopeConfig, nowMs) : null;
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
    attributionWindow: scope?.key ?? null,
    attribution: attributionRows(scope ? entriesInWindow(state.entries, scope, nowMs) : state.entries),
    attributionAllEntries: attributionRows(state.entries),
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
          (w.startsAt && w.resetsAt ? `, window ${w.startsAt} to ${w.resetsAt} UTC, reset boundary ${w.resetBoundary}` : "") +
          verified,
      );
      const worst = w.counterDecreases.reduce<CounterDecrease | null>((a, d) => (a === null || d.drop > a.drop ? d : a), null);
      if (worst) {
        const many = w.counterDecreases.length > 1 ? ` (largest of ${w.counterDecreases.length} decreases)` : "";
        lines.push(
          `  WARNING ${w.window}: provider counter decreased ${worst.fromUsed} -> ${worst.toUsed} (-${worst.drop})${many} between ${worst.fromObservedAt} and ${worst.toObservedAt}; ` +
            `the reset boundary is ${w.resetBoundary} and may be wrong, or readings may be lagged or from different accounts; effective usage keeps the highest reading`,
        );
      }
    }
    if (r.openReservations > 0) lines.push(`  open reservations: ${r.openReservations} (counted at estimate; ${r.staleReservations} past TTL, check for crashed runs)`);
    const formatRow = (a: AttributionRow) => `  - ${a.sport}/${a.workflow}${a.endpoint}: ${a.requests} req, ${a.units} units, ${a.failures} failed`;
    if (r.attributionWindow) lines.push(`  attribution, current ${r.attributionWindow.split(":")[0]} window ${r.attributionWindow}:`);
    else lines.push("  attribution, all retained ledger entries (no day or month window):");
    for (const a of r.attribution) lines.push(formatRow(a));
    if (r.attributionWindow && totalRequests(r.attributionAllEntries) > totalRequests(r.attribution)) {
      lines.push("  attribution, all retained ledger entries (includes earlier windows):");
      for (const a of r.attributionAllEntries) lines.push(formatRow(a));
    }
    if (r.unmanagedConsumers.length) lines.push(`  unmanaged consumers (usage visible only via provider headers): ${r.unmanagedConsumers.length}`);
    for (const c of r.unmanagedConsumers) lines.push(`    * ${c}`);
    lines.push("");
  }
  return lines.join("\n");
}
