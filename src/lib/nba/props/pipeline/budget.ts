/**
 * Request-budget planning and the request gate for live odds calls.
 *
 * Two independent ceilings apply to every NBA capture:
 *   1. the quota manager's admission (plan known, approval on file, usage
 *      verified, safety reserve, nonessential ratio); and
 *   2. an NBA-only allowance (credits per day and per month) that NBA can never
 *      exceed even if the shared pool has room, so NFL, MLB and PGA keep theirs.
 * The planner only reads; spending happens in the gate, one reservation per call.
 */
import type { QuotaManager } from "../../../api-quota/manager";
import { estimates } from "../../../api-quota/providers";
import type { AccountUsageState, Consumer, CostEstimate, ProviderUsageSnapshot } from "../../../api-quota/types";
import { entryUnits, windowUsage } from "../../../api-quota/windows";
import { etGameDate } from "../canonical";
import type { Market } from "./contracts";

export const NBA_CAPTURE_CONSUMER: Consumer = Object.freeze({
  priority: "nonessential",
  attribution: { sport: "nba", workflow: "pregame-capture", endpoint: "/events/{id}/odds" },
});

/** Credits one per-event odds call costs: markets returned x region equivalents (The Odds API docs). */
export const creditsPerCapture = (markets: number, regionEquivalents = 1): number => markets * regionEquivalents;

export interface SlateCost {
  gamesPerDay: number;
  marketsPerGame: number;
  creditsPerDay: number;
  creditsPerMonth: number;
}

export function projectSlateCost(gamesPerDay: number, marketsPerGame: number, gameDaysPerMonth: number, regionEquivalents = 1): SlateCost {
  const creditsPerDay = gamesPerDay * creditsPerCapture(marketsPerGame, regionEquivalents);
  return { gamesPerDay, marketsPerGame, creditsPerDay, creditsPerMonth: creditsPerDay * gameDaysPerMonth };
}

export interface NbaAllowance {
  perDayCredits: number;
  perMonthCredits: number;
  /**
   * Credits that must still remain in the shared month window after an NBA call: the other sports'
   * projected spend to month end plus the NFL job's own floor (see zeroCostBudget.peerReserveCredits).
   * When set and the remaining credits are unknown, NBA spends nothing.
   */
  peerReserveCredits?: number;
  /**
   * The provider's own counter must have been read this recently, or NBA spends nothing. Other sports spend
   * between readings, so a stale reading cannot show that unused credits are still there. Unset = not checked.
   */
  maxEvidenceAgeMs?: number;
}

export type DeferralReason = "nba_daily_allowance" | "nba_monthly_allowance" | "stale_evidence" | "peer_reserve" | "quota_denied" | "account_blocked";

export interface MonthEvidence {
  /** Credits left in the account's month window (limit minus ledger/provider-effective use), or null when unknown. */
  remaining: number | null;
  /** When the provider's counter was last read inside this window, or null when it has not been. */
  observedAt: string | null;
  ageMs: number | null;
}

/** What the provider has told us about the month window, and how old that is. */
export async function monthEvidence(manager: QuotaManager, accountId: string, now: Date): Promise<MonthEvidence> {
  const month = manager.account(accountId).windows.find((w) => w.kind === "month");
  if (!month) return { remaining: null, observedAt: null, ageMs: null };
  const usage = windowUsage(month, await manager.state(accountId), now.getTime());
  const observedAt = usage.snapshotObservedAt;
  return {
    remaining: usage.limit === null ? null : usage.limit - usage.effectiveUsed,
    observedAt,
    ageMs: observedAt === null ? null : Math.max(0, now.getTime() - Date.parse(observedAt)),
  };
}

/** Credits left in the account's month window, or null when unknown. */
export async function monthRemaining(manager: QuotaManager, accountId: string, now: Date): Promise<number | null> {
  return (await monthEvidence(manager, accountId, now)).remaining;
}

/** True when the allowance demands fresh provider evidence and the reading is missing or too old. */
export const evidenceIsStale = (allowance: NbaAllowance, evidence: MonthEvidence): boolean =>
  allowance.maxEvidenceAgeMs !== undefined && (evidence.ageMs === null || evidence.ageMs > allowance.maxEvidenceAgeMs);

export const staleDetail = (allowance: NbaAllowance, evidence: MonthEvidence): string =>
  evidence.observedAt === null ? "the provider's counter has not been read this month" : `the provider's counter was last read ${evidence.observedAt}, older than ${allowance.maxEvidenceAgeMs} ms`;

export interface CapturePlan {
  /** `markets` is the set chosen for this game; absent means the job's default set. */
  affordable: Array<{ gameKey: string; credits: number; markets?: readonly Market[] }>;
  deferred: Array<{ gameKey: string; reason: DeferralReason; detail: string }>;
  creditsPlanned: number;
  /** Set when the account itself refuses NBA work (unknown plan, no approval, blocking reason, unverified usage). */
  blocked: { code: string; message: string } | null;
}

const ACCOUNT_LEVEL_DENIALS = new Set(["BLOCKED_BY_POLICY", "UNKNOWN_PLAN", "NOT_APPROVED", "APPROVAL_BUDGET_EXHAUSTED", "UNKNOWN_USAGE", "STALE_USAGE_EVIDENCE", "USAGE_CHECK_LIMIT", "UNKNOWN_ACCOUNT"]);

/** NBA credits already reserved or spent today (Eastern date) and this month, from the ledger by sport. */
export function nbaSpend(state: AccountUsageState, now: Date): { today: number; month: number } {
  const today = etGameDate(now.toISOString());
  const month = today.slice(0, 7);
  let spentToday = 0;
  let spentMonth = 0;
  for (const entry of state.entries) {
    if (entry.attribution.sport !== "nba") continue;
    const day = etGameDate(entry.createdAt);
    const units = entryUnits(entry);
    if (day === today) spentToday += units;
    if (day.slice(0, 7) === month) spentMonth += units;
  }
  return { today: spentToday, month: spentMonth };
}

export interface PlanInput {
  manager: QuotaManager;
  accountId: string;
  /** Games to capture, in priority order (earliest tipoff first). */
  gameKeys: readonly string[];
  marketsPerGame: number;
  /** Markets chosen per game (game priority); a game not listed uses `marketsPerGame` markets. */
  marketsByGame?: ReadonlyMap<string, readonly Market[]>;
  regionEquivalents?: number;
  allowance: NbaAllowance;
  now: Date;
}

export async function planCaptureBudget(input: PlanInput): Promise<CapturePlan> {
  if (!Number.isInteger(input.marketsPerGame) || input.marketsPerGame < 1) throw new Error("marketsPerGame must be a positive integer");
  const regions = input.regionEquivalents ?? 1;
  const state = await input.manager.state(input.accountId);
  const { today: spentToday, month: spentMonth } = nbaSpend(state, input.now);
  const peerReserve = input.allowance.peerReserveCredits;
  const needsEvidence = peerReserve !== undefined || input.allowance.maxEvidenceAgeMs !== undefined;
  const evidence = needsEvidence ? await monthEvidence(input.manager, input.accountId, input.now) : null;
  const remaining = evidence?.remaining ?? null;
  const plan: CapturePlan = { affordable: [], deferred: [], creditsPlanned: 0, blocked: null };
  const batch: CostEstimate[] = [];
  let total = 0;
  for (const gameKey of input.gameKeys) {
    const markets = input.marketsByGame?.get(gameKey);
    const marketCount = markets?.length ?? input.marketsPerGame;
    const creditsPerGame = creditsPerCapture(marketCount, regions);
    total += creditsPerGame;
    if (spentToday + total > input.allowance.perDayCredits) {
      plan.deferred.push({ gameKey, reason: "nba_daily_allowance", detail: `${spentToday} spent today + ${total} planned exceeds ${input.allowance.perDayCredits}` });
      continue;
    }
    if (spentMonth + total > input.allowance.perMonthCredits) {
      plan.deferred.push({ gameKey, reason: "nba_monthly_allowance", detail: `${spentMonth} spent this month + ${total} planned exceeds ${input.allowance.perMonthCredits}` });
      continue;
    }
    if (evidence && evidenceIsStale(input.allowance, evidence)) {
      // The whole account is unusable until the provider's counter is read again: a block, not a spent budget.
      plan.blocked ??= { code: "NBA_STALE_EVIDENCE", message: staleDetail(input.allowance, evidence) };
      plan.deferred.push({ gameKey, reason: "stale_evidence", detail: staleDetail(input.allowance, evidence) });
      continue;
    }
    if (peerReserve !== undefined && (remaining === null || remaining - total < peerReserve)) {
      plan.deferred.push({ gameKey, reason: "peer_reserve", detail: remaining === null ? "remaining credits unknown" : `${remaining} remaining - ${total} planned would fall below the ${peerReserve} kept for other sports` });
      continue;
    }
    const trial = [...batch, estimates.theOddsApiOdds(marketCount, regions)];
    const { decision } = await input.manager.preflight(input.accountId, NBA_CAPTURE_CONSUMER, trial);
    if (decision.allowed) {
      batch.push(trial[trial.length - 1]);
      plan.affordable.push(markets ? { gameKey, credits: creditsPerGame, markets } : { gameKey, credits: creditsPerGame });
      plan.creditsPlanned += creditsPerGame;
      continue;
    }
    if (ACCOUNT_LEVEL_DENIALS.has(decision.code)) plan.blocked ??= { code: decision.code, message: decision.message };
    plan.deferred.push({ gameKey, reason: ACCOUNT_LEVEL_DENIALS.has(decision.code) ? "account_blocked" : "quota_denied", detail: `${decision.code}: ${decision.message}` });
  }
  return plan;
}

export type GateResult =
  | { ok: true; settle: (actualUnits: number | null, outcome: "ok" | "provider-error" | "http-error" | "network-error", detail?: string | null, snapshots?: readonly ProviderUsageSnapshot[]) => Promise<void> }
  | { ok: false; code: string; message: string };

/** Reserves credits before a provider call and settles them after it. */
export interface RequestGate {
  /** The quota account every reservation is made against. A job checks it against the source's registered account. */
  readonly accountId: string;
  /** True when the gate itself refuses to exceed the NBA-only daily and monthly allowance. */
  readonly enforcesNbaAllowance: boolean;
  reserve(units: number, endpoint: string): Promise<GateResult>;
}

/**
 * The gate every metered NBA call goes through. With an allowance it enforces
 * the NBA-only ceiling itself (counted from the ledger by sport), on top of the
 * quota manager's own admission, so NBA cannot borrow from other sports even if
 * a caller forgets to run the planner.
 */
export function quotaRequestGate(manager: QuotaManager, accountId: string, workflow: string, allowance?: NbaAllowance, now: () => Date = () => new Date()): RequestGate {
  return {
    accountId,
    enforcesNbaAllowance: allowance !== undefined,
    async reserve(units, endpoint) {
      const state = await manager.state(accountId);
      const approval = manager.account(accountId).liveApproval;
      if (approval?.scope === "NBA one-event player_points one-credit probe" && workflow !== "one-credit-probe") return { ok: false, code: "NBA_APPROVAL_SCOPE", message: "one-credit probe approval cannot fund another workflow" };
      if (approval?.scope === "NBA events discovery one request" && workflow !== "events-discovery") return { ok: false, code: "NBA_APPROVAL_SCOPE", message: "events discovery approval cannot fund another workflow" };
      if (approval?.scope === "NBA one-event player_points one-credit probe" && state.entries.some((entry) => entry.approvalId === approval.id)) return { ok: false, code: "NBA_APPROVAL_USED", message: "the one-credit probe approval has already funded an attempt" };
      if (approval?.scope === "NBA events discovery one request" && state.entries.some((entry) => entry.approvalId === approval.id)) return { ok: false, code: "NBA_APPROVAL_USED", message: "the events discovery approval has already funded an attempt" };
      if (state.entries.some((entry) => entry.attribution.sport === "nba" && entry.detail?.startsWith("NBA_BREACH:"))) return { ok: false, code: "NBA_ACCOUNTING_VIOLATION", message: "a previous NBA provider response needs reconciliation" };
      if (allowance) {
        const spent = nbaSpend(await manager.state(accountId), now());
        if (spent.today + units > allowance.perDayCredits) return { ok: false, code: "NBA_DAILY_ALLOWANCE", message: `${spent.today} spent today + ${units} exceeds ${allowance.perDayCredits}` };
        if (spent.month + units > allowance.perMonthCredits) return { ok: false, code: "NBA_MONTHLY_ALLOWANCE", message: `${spent.month} spent this month + ${units} exceeds ${allowance.perMonthCredits}` };
      }
      if (allowance && (allowance.peerReserveCredits !== undefined || allowance.maxEvidenceAgeMs !== undefined)) {
        const evidence = await monthEvidence(manager, accountId, now());
        if (evidenceIsStale(allowance, evidence)) return { ok: false, code: "NBA_STALE_EVIDENCE", message: staleDetail(allowance, evidence) };
        if (allowance.peerReserveCredits !== undefined) {
          if (evidence.remaining === null) return { ok: false, code: "NBA_PEER_RESERVE", message: "remaining credits unknown" };
          if (evidence.remaining - units < allowance.peerReserveCredits) return { ok: false, code: "NBA_PEER_RESERVE", message: `${evidence.remaining} remaining - ${units} would fall below the ${allowance.peerReserveCredits} kept for other sports` };
        }
      }
      const consumer: Consumer = { priority: "nonessential", attribution: { sport: "nba", workflow, endpoint } };
      const reservation = await manager.reserve(accountId, consumer, { units, basis: `NBA ${workflow}: ${units} credit(s)` });
      if (!reservation.allowed) return { ok: false, code: reservation.code, message: reservation.message };
      return {
        ok: true,
        settle: async (actualUnits, outcome, detail = null, snapshots = []) => {
          const configuredLimit = manager.account(accountId).windows.find((window) => window.kind === "month")?.limit;
          const month = manager.account(accountId).windows.find((window) => window.kind === "month");
          const previousUsed = month ? windowUsage(month, await manager.state(accountId), now().getTime()).providerUsed : null;
          const badLimit = snapshots.some((snapshot) => snapshot.window === "month" && configuredLimit !== null && configuredLimit !== undefined && snapshot.limit !== null && snapshot.limit !== configuredLimit);
          const counterDrop = snapshots.some((snapshot) => snapshot.window === "month" && snapshot.used !== null && previousUsed !== null && snapshot.used < previousUsed);
          const violation = actualUnits !== null && actualUnits > units || detail?.startsWith("NBA_BREACH:") || badLimit || counterDrop;
          const safeDetail = violation ? `NBA_BREACH: ${detail ?? (badLimit ? "provider limit disagrees with configured limit" : counterDrop ? "provider used counter decreased" : "reported charge exceeds reservation")}` : detail;
          await manager.settle(accountId, reservation.reservationId, { httpStatus: outcome === "ok" ? 200 : null, outcome, providerReportedUnits: actualUnits, snapshots, detail: safeDetail });
        },
      };
    },
  };
}
