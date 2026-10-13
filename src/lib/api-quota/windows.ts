/**
 * Quota window boundaries and usage arithmetic. Pure functions of (config, state, now).
 */
import type { AccountUsageState, LedgerEntry, ProviderUsageSnapshot, QuotaWindowConfig, WindowKind } from "./types";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export interface WindowBounds {
  kind: WindowKind;
  /** Stable id of the current window, e.g. "day:2026-10-13T00:00:00.000Z". Rolling minute windows use "minute". */
  key: string;
  startMs: number;
  /** Next reset (exclusive end). */
  endMs: number;
}

function dayBounds(nowMs: number, resetHourUtc: number): WindowBounds {
  const now = new Date(nowMs);
  let start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), resetHourUtc);
  if (start > nowMs) start -= DAY_MS;
  return { kind: "day", key: `day:${new Date(start).toISOString()}`, startMs: start, endMs: start + DAY_MS };
}

/** Month windows reset at 00:00 UTC on `resetDayOfMonth`, clamped to the month's last day. */
function monthStart(year: number, month: number, resetDay: number): number {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(year, month, Math.min(resetDay, lastDay));
}

function monthBounds(nowMs: number, resetDay: number): WindowBounds {
  const now = new Date(nowMs);
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  if (monthStart(year, month, resetDay) > nowMs) {
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
  }
  const start = monthStart(year, month, resetDay);
  const end = month === 11 ? monthStart(year + 1, 0, resetDay) : monthStart(year, month + 1, resetDay);
  return { kind: "month", key: `month:${new Date(start).toISOString()}`, startMs: start, endMs: end };
}

export function windowBounds(config: QuotaWindowConfig, nowMs: number): WindowBounds {
  if (config.kind === "minute") return { kind: "minute", key: "minute", startMs: nowMs - MINUTE_MS, endMs: nowMs };
  if (config.kind === "day") return dayBounds(nowMs, config.resetHourUtc ?? 0);
  return monthBounds(nowMs, config.resetDayOfMonth ?? 1);
}

/** Units an entry counts for. Unsettled reservations count at their estimate, expired or not. */
export function entryUnits(entry: LedgerEntry): number {
  if (entry.status === "released") return 0;
  if (entry.status === "settled") return entry.actualUnits ?? entry.estimatedUnits;
  return entry.estimatedUnits;
}

const inWindow = (iso: string, bounds: WindowBounds, nowMs: number) => {
  const t = Date.parse(iso);
  return t >= bounds.startMs && t <= Math.max(bounds.endMs, nowMs);
};

export function ledgerUnitsIn(entries: readonly LedgerEntry[], bounds: WindowBounds, nowMs: number, afterMs = -Infinity): number {
  return entries
    .filter((entry) => inWindow(entry.createdAt, bounds, nowMs) && Date.parse(entry.createdAt) > afterMs)
    .reduce((sum, entry) => sum + entryUnits(entry), 0);
}

export function snapshotUsed(snapshot: ProviderUsageSnapshot, configuredLimit: number | null): number | null {
  if (snapshot.used !== null) return snapshot.used;
  const limit = snapshot.limit ?? configuredLimit;
  return snapshot.remaining !== null && limit !== null ? limit - snapshot.remaining : null;
}

export interface WindowUsage {
  bounds: WindowBounds;
  /** Configured limit, tightened (never raised) by a provider-reported limit. */
  limit: number | null;
  /** Units recorded by this manager in the window (settled + pending). */
  ledgerUnits: number;
  /** Highest provider-reported used in this window, or null when none exists. */
  providerUsed: number | null;
  /** Provider usage this ledger cannot account for: other consumers of the same account. */
  unattributedUnits: number | null;
  /** The figure every decision uses; never decreases within a window as snapshots arrive. */
  effectiveUsed: number;
  snapshotObservedAt: string | null;
}

interface SnapshotEstimate {
  snapshot: ProviderUsageSnapshot;
  used: number;
  effective: number;
  unattributed: number;
}

/**
 * Effective usage implied by one provider snapshot: what the provider had
 * counted, plus our calls made after it, plus our calls still in flight when it
 * was taken (the provider may not have counted them yet).
 */
function fromSnapshot(snapshot: ProviderUsageSnapshot, used: number, entries: readonly LedgerEntry[], bounds: WindowBounds, nowMs: number, ledgerUnits: number): SnapshotEstimate {
  const observedMs = Date.parse(snapshot.observedAt);
  const ledgerAfter = ledgerUnitsIn(entries, bounds, nowMs, observedMs);
  const inFlightAtSnapshot = entries
    .filter((e) => e.status === "reserved" && inWindow(e.createdAt, bounds, nowMs) && Date.parse(e.createdAt) <= observedMs)
    .reduce((sum, e) => sum + e.estimatedUnits, 0);
  return { snapshot, used, effective: used + ledgerAfter + inFlightAtSnapshot, unattributed: Math.max(0, used - (ledgerUnits - ledgerAfter)) };
}

export function windowUsage(config: QuotaWindowConfig, state: AccountUsageState, nowMs: number): WindowUsage {
  const bounds = windowBounds(config, nowMs);
  const ledgerUnits = ledgerUnitsIn(state.entries, bounds, nowMs);
  const snapshots = bounds.kind === "minute" ? [] : state.snapshots.filter((s) => s.window === bounds.kind && inWindow(s.observedAt, bounds, nowMs));
  const reportedLimits = snapshots.map((s) => s.limit).filter((l): l is number => l !== null);
  const knownLimits = config.limit === null ? reportedLimits : [config.limit, ...reportedLimits];
  const limit = knownLimits.length ? Math.min(...knownLimits) : null;
  // Every snapshot in the window is considered and the highest wins: a later,
  // lower report (provider lag, or a different key in an unverified pool) never
  // lowers usage. A genuine reset starts a new window.
  const estimates = snapshots
    .map((s) => ({ s, used: snapshotUsed(s, config.limit) }))
    .filter((x): x is { s: ProviderUsageSnapshot; used: number } => x.used !== null)
    .map((x) => fromSnapshot(x.s, x.used, state.entries, bounds, nowMs, ledgerUnits));
  if (estimates.length === 0) {
    return { bounds, limit, ledgerUnits, providerUsed: null, unattributedUnits: null, effectiveUsed: ledgerUnits, snapshotObservedAt: null };
  }
  const worst = estimates.reduce((a, b) => (b.effective >= a.effective ? b : a));
  return {
    bounds,
    limit,
    ledgerUnits,
    providerUsed: Math.max(...estimates.map((e) => e.used)),
    unattributedUnits: Math.max(...estimates.map((e) => e.unattributed)),
    effectiveUsed: Math.max(ledgerUnits, worst.effective),
    snapshotObservedAt: estimates.map((e) => e.snapshot.observedAt).sort().at(-1) ?? null,
  };
}

/** Oldest instant any window could still need, used for pruning. */
export function retentionCutoffMs(nowMs: number): number {
  return nowMs - 40 * DAY_MS;
}
