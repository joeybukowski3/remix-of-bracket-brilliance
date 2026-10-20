/**
 * Wires the pure day plan (gamePriority.ts) to the quota manager, the store and the pregame job.
 *
 * The planner is asked once per run which of the DUE games to capture. It looks at the whole night, not only
 * what is due now, so credits are held for a better game that tips off later; then it hands the funded
 * subset to planCaptureBudget, which still runs every account-level check (plan known, approval, usage
 * verified, safety reserve, NBA allowance, peer reserve, evidence age) with the markets chosen per game.
 */
import { etGameDate } from "../canonical";
import type { QuotaManager } from "../../../api-quota/manager";
import { evidenceIsStale, monthEvidence, nbaSpend, planCaptureBudget, staleDetail, type CapturePlan, type DeferralReason, type NbaAllowance } from "./budget";
import { decideCapture, DEFAULT_CAPTURE_POLICY, summarizeCaptureState, type CapturePolicy } from "./captureWindow";
import type { Market, NbaPipelineGame } from "./contracts";
import { expectedBaselineCredits, lineReliabilityFromHistory, NO_EXPANSION, planDay, type ExpansionPolicy, type PriorityCandidate, type UnfundedReason } from "./gamePriority";
import type { PipelineStore } from "./store";
import { GAME_NIGHTS_PER_MONTH } from "./zeroCostBudget";

export interface DayPlannerDeps {
  manager: QuotaManager;
  accountId: string;
  store: PipelineStore;
  allowance: NbaAllowance;
  now: () => Date;
  /** Players with a usable projection for the game (isUsableProjection over the roster); 0 when there is no model yet. */
  usableProjections: (game: NbaPipelineGame) => number | Promise<number>;
  expansion?: ExpansionPolicy;
  policy?: CapturePolicy;
}

/** Game nights left in the Eastern calendar month after today, from the average share of nights with games. */
export function gameNightsAfterToday(now: Date): number {
  const today = etGameDate(now.toISOString());
  const [year, month, day] = today.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.floor(((daysInMonth - day) * GAME_NIGHTS_PER_MONTH) / 31);
}

const DEFERRAL: Readonly<Record<UnfundedReason, DeferralReason>> = {
  no_provider_evidence: "stale_evidence",
  provider_reserve: "peer_reserve",
  month_budget: "nba_monthly_allowance",
  day_budget: "nba_daily_allowance",
};

export function createDayPlanner(deps: DayPlannerDeps): (gameKeys: readonly string[]) => Promise<CapturePlan> {
  const policy = deps.policy ?? DEFAULT_CAPTURE_POLICY;
  return async (gameKeys) => {
    const now = deps.now();
    const today = etGameDate(now.toISOString());
    const requested = new Set(gameKeys);
    const [games, snapshots, state, evidence] = await Promise.all([deps.store.listGames(), deps.store.listSnapshots(), deps.manager.state(deps.accountId), monthEvidence(deps.manager, deps.accountId, now)]);

    const candidates: PriorityCandidate[] = [];
    for (const game of games) {
      if (!requested.has(game.canonicalGameKey) && etGameDate(game.tipoffUtc) !== today) continue;
      const attempts = await deps.store.listAttempts(game.canonicalGameKey);
      const stored = snapshots.filter((s) => s.game.canonicalGameKey === game.canonicalGameKey).length;
      const captureState = summarizeCaptureState(attempts, stored);
      if (!["capture", "wait"].includes(decideCapture(game, captureState, now, policy).action)) continue;
      candidates.push({
        gameKey: game.canonicalGameKey,
        tipoffUtc: game.tipoffUtc,
        usableProjections: await deps.usableProjections(game),
        lineReliability: lineReliabilityFromHistory(snapshots, [game.awayTeam, game.homeTeam], now),
        expandable: captureState.attempts === 0,
      });
    }

    const spent = nbaSpend(state, now);
    const fresh = !evidenceIsStale(deps.allowance, evidence) && evidence.remaining !== null;
    const dayPlan = planDay({
      candidates,
      budget: {
        dayCreditsLeft: deps.allowance.perDayCredits - spent.today,
        monthCreditsLeft: deps.allowance.perMonthCredits - spent.month,
        providerCreditsAvailable: fresh ? (evidence.remaining as number) - (deps.allowance.peerReserveCredits ?? 0) : null,
        futureBaselineReserve: expectedBaselineCredits(gameNightsAfterToday(now)),
      },
      expansion: deps.expansion ?? NO_EXPANSION,
    });

    const marketsByGame = new Map<string, readonly Market[]>(dayPlan.funded.map((f) => [f.gameKey, f.markets]));
    const fundedNow = gameKeys.filter((key) => marketsByGame.has(key));
    const budgeted = await planCaptureBudget({ manager: deps.manager, accountId: deps.accountId, gameKeys: fundedNow, marketsPerGame: 1, marketsByGame, allowance: deps.allowance, now });
    const unfunded = new Map(dayPlan.unfunded.map((u) => [u.gameKey, u.reason]));
    const notFunded: CapturePlan["deferred"] = gameKeys
      .filter((key) => !marketsByGame.has(key))
      .map((gameKey) => {
        const reason = unfunded.get(gameKey);
        return { gameKey, reason: reason ? DEFERRAL[reason] : "quota_denied", detail: reason ? `not funded tonight: ${reason}` : "not a candidate for tonight's plan" };
      });
    // No usable provider reading: the account is blocked for this run, which the job records as "blocked" rather than a spent budget.
    const blocked = budgeted.blocked ?? (!fresh && gameKeys.length > 0 ? { code: "NBA_STALE_EVIDENCE", message: evidence.remaining === null && !evidenceIsStale(deps.allowance, evidence) ? "remaining credits unknown" : staleDetail(deps.allowance, evidence) } : null);
    return { ...budgeted, blocked, deferred: [...budgeted.deferred, ...notFunded] };
  };
}
