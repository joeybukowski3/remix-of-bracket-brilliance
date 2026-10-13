/**
 * QuotaManager: reserve -> (caller makes the request) -> settle.
 *
 * Every attempt (retries and pages included) is its own reservation. A
 * reservation that is never settled keeps counting at its estimate. Only
 * `release` with proof the request was not sent returns units.
 */
import { randomUUID } from "node:crypto";
import { admit, newAlerts } from "./policy";
import { validateRegistry } from "./registry";
import type { UsageStore } from "./store";
import type {
  AccountUsageState,
  AlertEvent,
  Consumer,
  CostEstimate,
  Denial,
  LedgerEntry,
  ProviderAccountConfig,
  ProviderUsageSnapshot,
  RequestOutcome,
  UsageRollup,
} from "./types";
import { entryUnits, retentionCutoffMs } from "./windows";

export interface Reservation {
  allowed: true;
  reservationId: string;
  accountId: string;
  estimatedUnits: number;
  alerts: AlertEvent[];
}

export interface SettleInput {
  httpStatus: number | null;
  outcome: Exclude<RequestOutcome, "pending" | "not-sent">;
  /** Cost of this call as reported by the provider (e.g. x-requests-last). Absent = estimate is charged. */
  providerReportedUnits?: number | null;
  snapshots?: readonly ProviderUsageSnapshot[];
  detail?: string | null;
}

export interface PreflightResult {
  accountId: string;
  totalEstimatedUnits: number;
  /** Admission for the whole batch as if reserved now. */
  decision: { allowed: true } | Denial;
}

export class UnknownAccountError extends Error {
  constructor(accountId: string) {
    super(`No quota configuration for account "${accountId}"`);
    this.name = "UnknownAccountError";
  }
}

export interface QuotaManagerOptions {
  accounts: readonly ProviderAccountConfig[];
  store: UsageStore;
  now?: () => Date;
  newId?: () => string;
}

/** Mask anything that looks like a credential (long opaque tokens, key=value pairs). */
export function redactDetail(detail: string | null | undefined): string | null {
  if (!detail) return null;
  return detail
    .replace(/((?:api[_-]?key|apikey|key|token|secret|authorization)\s*[=:]\s*)[^\s&;,]+/gi, "$1[redacted]")
    .replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]")
    .slice(0, 300);
}

/** Keep only a path-like label: drop scheme/host and any query string (which may carry a key). */
export function endpointLabel(endpoint: string): string {
  const withoutQuery = endpoint.split(/[?#]/)[0];
  const withoutOrigin = withoutQuery.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "");
  return withoutOrigin.slice(0, 120) || "/";
}

/** Fold settled entries older than every window into monthly rollups (immutably). */
function prune(state: AccountUsageState, nowMs: number): AccountUsageState {
  const cutoff = retentionCutoffMs(nowMs);
  const keep: LedgerEntry[] = [];
  const rollups = new Map<string, UsageRollup>(state.rollups.map((r) => [`${r.month}|${r.sport}|${r.workflow}|${r.endpoint}`, { ...r }]));
  for (const entry of state.entries) {
    // Open reservations and approval-funded entries are kept so approval budgets never refresh.
    if (entry.status === "reserved" || entry.approvalId !== null || Date.parse(entry.createdAt) >= cutoff) {
      keep.push(entry);
      continue;
    }
    const month = entry.createdAt.slice(0, 7);
    const key = `${month}|${entry.attribution.sport}|${entry.attribution.workflow}|${entry.attribution.endpoint}`;
    const rollup = rollups.get(key) ?? { month, sport: entry.attribution.sport, workflow: entry.attribution.workflow, endpoint: entry.attribution.endpoint, requests: 0, units: 0 };
    rollups.set(key, { ...rollup, requests: rollup.requests + (entry.status === "released" ? 0 : 1), units: rollup.units + entryUnits(entry) });
  }
  return {
    ...state,
    entries: keep,
    snapshots: state.snapshots.filter((s) => Date.parse(s.observedAt) >= cutoff),
    alerts: state.alerts.filter((a) => Date.parse(a.firedAt) >= cutoff),
    rollups: [...rollups.values()],
  };
}

function withAlerts(account: ProviderAccountConfig, state: AccountUsageState, nowMs: number): { state: AccountUsageState; alerts: AlertEvent[] } {
  const { events, records } = newAlerts(account, state, nowMs);
  return { state: { ...state, alerts: [...state.alerts, ...records] }, alerts: events };
}

export class QuotaManager {
  private readonly accounts: Map<string, ProviderAccountConfig>;
  private readonly store: UsageStore;
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(options: QuotaManagerOptions) {
    validateRegistry(options.accounts);
    this.accounts = new Map(options.accounts.map((a) => [a.accountId, a]));
    this.store = options.store;
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? randomUUID;
  }

  account(accountId: string): ProviderAccountConfig {
    const account = this.accounts.get(accountId);
    if (!account) throw new UnknownAccountError(accountId);
    return account;
  }

  listAccounts(): ProviderAccountConfig[] {
    return [...this.accounts.values()];
  }

  /** Read-only: would this whole batch be admitted now? Spends nothing. */
  async preflight(accountId: string, consumer: Consumer, estimates: readonly CostEstimate[]): Promise<PreflightResult> {
    const account = this.account(accountId);
    const state = await this.store.read(accountId);
    const totalEstimatedUnits = estimates.reduce((sum, e) => sum + e.units, 0);
    const batch: CostEstimate = { units: totalEstimatedUnits, basis: "preflight batch", isUsageCheck: estimates.length > 0 && estimates.every((e) => e.isUsageCheck) };
    const decision = admit(account, state, consumer, batch, this.now().getTime());
    return { accountId, totalEstimatedUnits, decision: decision.allowed ? { allowed: true } : decision };
  }

  async reserve(accountId: string, consumer: Consumer, estimate: CostEstimate, attempt = 1): Promise<Reservation | Denial> {
    const account = this.account(accountId);
    const id = this.newId();
    return this.store.transact<Reservation | Denial>(accountId, (current) => {
      const nowMs = this.now().getTime();
      const state = prune(current, nowMs);
      const decision = admit(account, state, consumer, estimate, nowMs);
      if (!decision.allowed) return { state: current, result: decision, changed: false };
      const entry: LedgerEntry = {
        id,
        accountId,
        createdAt: new Date(nowMs).toISOString(),
        settledAt: null,
        status: "reserved",
        estimatedUnits: estimate.units,
        actualUnits: null,
        costSource: "estimate",
        attribution: { ...consumer.attribution, endpoint: endpointLabel(consumer.attribution.endpoint) },
        priority: consumer.priority,
        attempt,
        httpStatus: null,
        outcome: "pending",
        detail: null,
        approvalId: consumer.priority === "nonessential" ? account.liveApproval?.id ?? null : null,
        isUsageCheck: estimate.isUsageCheck === true,
      };
      const next = withAlerts(account, { ...state, entries: [...state.entries, entry] }, nowMs);
      return { state: next.state, result: { allowed: true, reservationId: id, accountId, estimatedUnits: estimate.units, alerts: next.alerts } };
    });
  }

  async settle(accountId: string, reservationId: string, input: SettleInput): Promise<{ actualUnits: number; alerts: AlertEvent[] }> {
    const account = this.account(accountId);
    return this.store.transact(accountId, (state) => {
      const nowMs = this.now().getTime();
      const entry = state.entries.find((e) => e.id === reservationId);
      if (!entry) throw new Error(`Unknown reservation ${reservationId} on ${accountId}`);
      if (entry.status !== "reserved") throw new Error(`Reservation ${reservationId} is already ${entry.status}`);
      const reported = input.providerReportedUnits;
      const hasReport = typeof reported === "number" && Number.isFinite(reported) && reported >= 0;
      const actualUnits = hasReport ? reported : entry.estimatedUnits;
      const settled: LedgerEntry = {
        ...entry,
        status: "settled",
        settledAt: new Date(nowMs).toISOString(),
        actualUnits,
        costSource: hasReport ? "provider-header" : "estimate",
        httpStatus: input.httpStatus,
        outcome: input.outcome,
        detail: redactDetail(input.detail),
      };
      const reconciled: AccountUsageState = {
        ...state,
        entries: state.entries.map((e) => (e.id === reservationId ? settled : e)),
        snapshots: [...state.snapshots, ...(input.snapshots ?? [])],
      };
      const next = withAlerts(account, reconciled, nowMs);
      return { state: next.state, result: { actualUnits, alerts: next.alerts } };
    });
  }

  /**
   * Return a reservation's units. Only valid when the request was provably never
   * sent (e.g. the caller aborted before calling fetch). A reservation past its
   * TTL may be a crashed run whose call was billed, so it can never be refunded:
   * use `reconcileOrphans` instead.
   */
  async release(accountId: string, reservationId: string, reason: string): Promise<void> {
    const account = this.account(accountId);
    await this.store.transact(accountId, (state) => {
      const nowMs = this.now().getTime();
      const entry = state.entries.find((e) => e.id === reservationId);
      if (!entry || entry.status !== "reserved") throw new Error(`Cannot release ${reservationId}: not an open reservation`);
      if (nowMs - Date.parse(entry.createdAt) > account.reservationTtlMs) {
        throw new Error(`Cannot release ${reservationId}: older than the reservation TTL; reconcile it as orphaned instead`);
      }
      const released: LedgerEntry = { ...entry, status: "released", settledAt: new Date(nowMs).toISOString(), actualUnits: 0, costSource: "not-sent", outcome: "not-sent", detail: redactDetail(reason) };
      return { state: { ...state, entries: state.entries.map((e) => (e.id === reservationId ? released : e)) }, result: undefined };
    });
  }

  /**
   * Recovery for reservations that were never settled (crashed or killed run):
   * settle every reservation older than the account's reservationTtlMs as
   * "orphaned", charged at its estimate. Never refunds: units are unchanged,
   * the entry just becomes prunable. Use `settle` instead when the provider's
   * own usage report proves a different cost.
   */
  async reconcileOrphans(accountId: string): Promise<{ orphaned: number; unitsCharged: number }> {
    const account = this.account(accountId);
    return this.store.transact(accountId, (state) => {
      const nowMs = this.now().getTime();
      const settledAt = new Date(nowMs).toISOString();
      let orphaned = 0;
      let unitsCharged = 0;
      const entries = state.entries.map((e) => {
        if (e.status !== "reserved" || nowMs - Date.parse(e.createdAt) <= account.reservationTtlMs) return e;
        orphaned += 1;
        unitsCharged += e.estimatedUnits;
        return { ...e, status: "settled" as const, settledAt, actualUnits: e.estimatedUnits, costSource: "estimate" as const, outcome: "orphaned" as const, detail: "reconciled as orphaned; charged at estimate" };
      });
      return { state: { ...state, entries }, result: { orphaned, unitsCharged }, changed: orphaned > 0 };
    });
  }

  /** Record provider-reported usage observed outside a reservation (e.g. a log or dashboard reading). */
  async recordProviderUsage(accountId: string, snapshots: readonly ProviderUsageSnapshot[]): Promise<AlertEvent[]> {
    const account = this.account(accountId);
    return this.store.transact(accountId, (state) => {
      const next = withAlerts(account, { ...state, snapshots: [...state.snapshots, ...snapshots] }, this.now().getTime());
      return { state: next.state, result: next.alerts };
    });
  }

  async state(accountId: string): Promise<AccountUsageState> {
    this.account(accountId);
    return this.store.read(accountId);
  }
}
