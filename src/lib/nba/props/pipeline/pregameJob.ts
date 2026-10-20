/**
 * Pregame snapshot job (offline runner; provider and gate are injected).
 *
 * One run:
 *   1. refuses to start unless the odds source's record permits storing lines;
 *   2. takes a durable lock, so overlapping runs cannot double-spend;
 *   3. decides per game from the clock (never early, never after the floor);
 *   4. plans and reserves credits before every provider call;
 *   5. stores each line as an immutable snapshot, skipping an unchanged market
 *      and flagging stale lines instead of hiding them;
 *   6. records an explicit attempt for every game it acted on, including the
 *      ones that produced no line.
 * It never reads a page request and never fetches outside a game's window.
 * Re-running it with the same inputs changes nothing.
 */
import type { SourceLicense } from "../sources/types";
import { sha256Json } from "../canonicalJson";
import type { CapturePlan, RequestGate } from "./budget";
import { creditsPerCapture } from "./budget";
import { decideCapture, DEFAULT_CAPTURE_POLICY, summarizeCaptureState, assertCapturePolicy, type CapturePolicy } from "./captureWindow";
import {
  buildSnapshot,
  MARKETS,
  marketKeyOf,
  playerKeyOf,
  type AttemptOutcome,
  type Market,
  type NbaCaptureAttempt,
  type NbaPipelineGame,
  type OddsSourceId,
  PIPELINE_SCHEMA,
  PipelineValidationError,
} from "./contracts";
import { ODDS_SOURCE_LICENSES, ODDS_SOURCE_PROFILES } from "./oddsSources";
import type { PipelineStore } from "./store";
import { canonicalTeamCode } from "../canonical";
import type { ProviderUsageSnapshot } from "../../../api-quota/types";

export interface ProviderPropLine {
  playerName: string;
  team: string | null;
  identityAmbiguous?: boolean;
  market: Market;
  sportsbook: string;
  line: number;
  overPrice: number;
  underPrice: number;
  lastUpdateUtc: string | null;
  rawProviderRef?: { eventId: string; bookmakerKey: string; marketKey: string; overOutcomeIndex: number; underOutcomeIndex: number };
}

export type PropsFetchResult =
  | { status: "ok"; lines: readonly ProviderPropLine[]; creditsCharged: number | null; requestRef: string | null; unmatched?: readonly string[]; usageSnapshots?: readonly ProviderUsageSnapshot[]; usageIssue?: string | null }
  | { status: "error"; message: string; creditsCharged: number | null; failureKind?: "http-error" | "network-error" | "provider-error"; usageSnapshots?: readonly ProviderUsageSnapshot[]; usageIssue?: string | null };

/** Fetches every requested market for one event. Real adapters sit behind the quota gate; none exists yet. */
export interface PropsProvider {
  sourceId: OddsSourceId;
  /** A live adapter consumes this one-use authorization immediately before its HTTP call. */
  authorizeRequest?(event: { sourceEventId: string; markets: readonly Market[] }): void;
  fetchEventProps(event: { sourceEventId: string; markets: readonly Market[] }): Promise<PropsFetchResult>;
}

export interface ProjectionValue {
  value: number;
  minutes: number | null;
  modelVersion: string;
  /** Latest information the projection used. Must not postdate the capture. */
  inputCutoffUtc: string;
}

export interface PregameDeps {
  store: PipelineStore;
  provider: PropsProvider;
  gate: RequestGate;
  /** Reads the budget; spending happens at the gate. */
  plan: (gameKeys: readonly string[]) => Promise<CapturePlan>;
  now: () => Date;
  runId: string;
  markets?: readonly Market[];
  policy?: CapturePolicy;
  licenses?: Readonly<Record<OddsSourceId, SourceLicense>>;
  lockTtlMs?: number;
  resolvePlayer?: (name: string, team: string | null) => string | null;
  project?: (player: { name: string; team: string | null; canonicalPlayerId: string | null }, market: Market, game: NbaPipelineGame, capturedAtUtc: string) => ProjectionValue | null;
}

export interface PregameReport {
  runId: string;
  outcome: "completed" | "locked" | "blocked" | "failed";
  reason: string | null;
  considered: number;
  captured: number;
  deduplicated: number;
  staleOnly: number;
  noMarket: number;
  missed: number;
  waiting: number;
  budgetDeferred: number;
  linesStored: number;
  staleLinesStored: number;
  rejectedLines: number;
  /** Why the first few lines were rejected (validation failures only). */
  rejectionReasons: string[];
  creditsCharged: number;
}

const LOCK_NAME = "nba-pregame-capture";
const DEFAULT_LOCK_TTL_MS = 15 * 60_000;

const emptyReport = (runId: string): PregameReport => ({
  runId, outcome: "completed", reason: null, considered: 0, captured: 0, deduplicated: 0, staleOnly: 0, noMarket: 0, missed: 0, waiting: 0, budgetDeferred: 0, linesStored: 0, staleLinesStored: 0, rejectedLines: 0, rejectionReasons: [], creditsCharged: 0,
});

export async function runPregameCapture(deps: PregameDeps): Promise<PregameReport> {
  const policy = deps.policy ?? DEFAULT_CAPTURE_POLICY;
  assertCapturePolicy(policy);
  const markets = deps.markets ?? MARKETS;
  const report = emptyReport(deps.runId);
  const started = deps.now().toISOString();
  const finish = async (outcome: PregameReport["outcome"], reason: string | null): Promise<PregameReport> => {
    report.outcome = outcome;
    report.reason = reason;
    await deps.store.recordRun({
      schemaVersion: PIPELINE_SCHEMA.run,
      runId: deps.runId,
      job: "pregame-capture",
      startedAtUtc: started,
      finishedAtUtc: deps.now().toISOString(),
      outcome,
      reason,
      counts: { considered: report.considered, captured: report.captured, deduplicated: report.deduplicated, staleOnly: report.staleOnly, noMarket: report.noMarket, missed: report.missed, waiting: report.waiting, budgetDeferred: report.budgetDeferred, linesStored: report.linesStored, creditsCharged: report.creditsCharged },
    });
    return report;
  };

  const license = (deps.licenses ?? ODDS_SOURCE_LICENSES)[deps.provider.sourceId];
  if (!license.permittedUses.includes("private-research")) {
    return finish("blocked", `no recorded permission to store lines from ${deps.provider.sourceId} (${license.status})`);
  }
  const sourceProfile = ODDS_SOURCE_PROFILES[deps.provider.sourceId];
  if (sourceProfile.method === "api") {
    // A metered source must be funded by its own registered quota account, through a gate that enforces the NBA-only allowance.
    if (deps.gate.accountId !== sourceProfile.quotaAccountId) return finish("blocked", `the gate funds ${deps.gate.accountId}, not ${sourceProfile.quotaAccountId}, which is registered for ${deps.provider.sourceId}`);
    if (!deps.gate.enforcesNbaAllowance) return finish("blocked", "the request gate does not enforce an NBA-only allowance");
  }
  if (!(await deps.store.acquireLock(LOCK_NAME, deps.runId, deps.lockTtlMs ?? DEFAULT_LOCK_TTL_MS, deps.now()))) {
    return finish("locked", "another capture run holds the lock");
  }
  try {
    const games = await deps.store.listGames();
    const snapshots = await deps.store.listSnapshots();
    const due: NbaPipelineGame[] = [];
    for (const game of games) {
      const attempts = await deps.store.listAttempts(game.canonicalGameKey);
      const stored = snapshots.filter((s) => s.game.canonicalGameKey === game.canonicalGameKey).length;
      const decision = decideCapture(game, summarizeCaptureState(attempts, stored), deps.now(), policy);
      report.considered += 1;
      if (decision.action === "capture") due.push(game);
      else if (decision.action === "wait") report.waiting += 1;
      else if (decision.reason === "missed_window" || decision.reason === "postponed") {
        const outcome: AttemptOutcome = decision.reason === "postponed" ? "postponed" : "missed_window";
        // Deterministic id: the explicit "no line for this game" marker is written once, however many runs see it.
        const added = await recordAttempt(deps, game, `${decision.reason}|${game.canonicalGameKey}`, outcome, outcome === "postponed" ? `game is ${game.status}` : "no line captured before the capture floor", decision.minutesToTipoff, 0, 0);
        if (added && outcome === "missed_window") report.missed += 1;
      }
    }
    if (due.length === 0) return finish("completed", null);

    due.sort((a, b) => a.tipoffUtc.localeCompare(b.tipoffUtc) || a.canonicalGameKey.localeCompare(b.canonicalGameKey));
    const plan = await deps.plan(due.map((g) => g.canonicalGameKey));
    const affordable = new Map(plan.affordable.map((a) => [a.gameKey, a]));
    for (const game of due) {
      const now = deps.now();
      const decision = decideCapture(game, summarizeCaptureState(await deps.store.listAttempts(game.canonicalGameKey), 0), now, policy);
      if (decision.action !== "capture") continue; // the clock moved on while earlier games were fetched
      const funded = affordable.get(game.canonicalGameKey);
      if (!funded) {
        const why = plan.deferred.find((d) => d.gameKey === game.canonicalGameKey);
        report.budgetDeferred += 1;
        await recordAttempt(deps, game, await sequencedId(deps, game, "deferred"), plan.blocked ? "blocked" : "budget_exhausted", why ? `${why.reason}: ${why.detail}` : "not planned", decision.minutesToTipoff, 0, 0);
        continue;
      }
      if (!game.sourceEventId) {
        // Checked before reserving: a game we cannot even request must not cost a reservation.
        await recordAttempt(deps, game, await sequencedId(deps, game, "capture"), "error", "game has no provider event id", decision.minutesToTipoff, 0, 0);
        continue;
      }
      // The planner may have chosen fewer or more markets for this game than the run default; what it chose is what is requested and paid for.
      const gameMarkets = funded.markets ?? markets;
      if (gameMarkets.length === 0 || gameMarkets.some((m) => !MARKETS.includes(m))) throw new Error(`invalid market set planned for ${game.canonicalGameKey}`);
      const credits = creditsPerCapture(gameMarkets.length);
      const reservation = await deps.gate.reserve(credits, "/events/{id}/odds");
      if (!reservation.ok) {
        report.budgetDeferred += 1;
        await recordAttempt(deps, game, await sequencedId(deps, game, "deferred"), "budget_exhausted", `${reservation.code}: ${reservation.message}`, decision.minutesToTipoff, 0, 0);
        continue;
      }
      await captureGame(deps, game, gameMarkets, policy, decision, credits, reservation.settle, report);
    }
    if (plan.blocked && report.captured + report.deduplicated + report.staleOnly + report.noMarket === 0) return finish("blocked", `${plan.blocked.code}: ${plan.blocked.message}`);
    return finish("completed", null);
  } catch (error) {
    return finish("failed", error instanceof Error ? error.message : String(error));
  } finally {
    await deps.store.releaseLock(LOCK_NAME, deps.runId);
  }
}

/**
 * Unique per execution: runs are serialized by the lock, so the count of this
 * game's earlier attempts is a stable sequence number. (The markers for a missed
 * or postponed game keep a fixed id so they are written once.)
 */
async function sequencedId(deps: PregameDeps, game: NbaPipelineGame, kind: string): Promise<string> {
  return `${game.canonicalGameKey}|${kind}|${(await deps.store.listAttempts(game.canonicalGameKey)).length + 1}`;
}

async function recordAttempt(deps: PregameDeps, game: NbaPipelineGame, attemptId: string, outcome: AttemptOutcome, reason: string | null, minutesToTipoff: number, creditsCharged: number, linesStored: number): Promise<boolean> {
  const attempt: NbaCaptureAttempt = {
    schemaVersion: PIPELINE_SCHEMA.attempt,
    attemptId,
    runId: deps.runId,
    canonicalGameKey: game.canonicalGameKey,
    outcome,
    reason,
    minutesToTipoff,
    creditsCharged,
    linesStored,
    atUtc: deps.now().toISOString(),
  };
  return (await deps.store.appendAttempt(attempt)) === "inserted";
}

async function captureGame(
  deps: PregameDeps,
  game: NbaPipelineGame,
  markets: readonly Market[],
  policy: CapturePolicy,
  decision: { window: "in_window" | "late"; minutesToTipoff: number },
  estimatedCredits: number,
  settle: (actual: number | null, outcome: "ok" | "provider-error" | "http-error" | "network-error", detail?: string | null, snapshots?: readonly ProviderUsageSnapshot[]) => Promise<void>,
  report: PregameReport,
): Promise<void> {
  const attemptId = await sequencedId(deps, game, "capture");
  const fail = async (message: string, charged: number | null, failureKind: "http-error" | "network-error" | "provider-error" = "provider-error", usageIssue: string | null = null, snapshots: readonly ProviderUsageSnapshot[] = []) => {
    await settle(charged, failureKind, usageIssue ?? message.slice(0, 200), snapshots);
    report.creditsCharged += charged ?? estimatedCredits;
    await recordAttempt(deps, game, attemptId, "error", message.slice(0, 200), decision.minutesToTipoff, charged ?? estimatedCredits, 0);
  };
  let fetched;
  try {
    // The caller has already checked that the game has a provider event id.
    const request = { sourceEventId: game.sourceEventId as string, markets };
    deps.provider.authorizeRequest?.(request);
    fetched = await deps.provider.fetchEventProps(request);
  } catch (error) {
    await settle(null, "network-error", error instanceof Error ? error.message.slice(0, 200) : "network error");
    report.creditsCharged += estimatedCredits;
    await recordAttempt(deps, game, attemptId, "error", "network error", decision.minutesToTipoff, estimatedCredits, 0);
    return;
  }
  if (fetched.status === "error") return fail(fetched.message, fetched.creditsCharged, fetched.failureKind, fetched.usageIssue, fetched.usageSnapshots);
  const charged = fetched.creditsCharged ?? estimatedCredits;
  await settle(fetched.creditsCharged, "ok", fetched.usageIssue, fetched.usageSnapshots);
  report.creditsCharged += charged;

  const capturedAtUtc = deps.now().toISOString();
  // The clock may have crossed the floor during the call: never store a price captured too close to tipoff.
  if ((Date.parse(game.tipoffUtc) - Date.parse(capturedAtUtc)) / 60_000 < policy.floorMinutes) {
    await recordAttempt(deps, game, attemptId, "missed_window", "the response arrived after the capture floor and was discarded", decision.minutesToTipoff, charged, 0);
    report.missed += 1;
    return;
  }
  const license = (deps.licenses ?? ODDS_SOURCE_LICENSES)[deps.provider.sourceId];
  const profile = ODDS_SOURCE_PROFILES[deps.provider.sourceId];
  let stored = 0;
  let staleStored = 0;
  let unchanged = 0;
  for (const line of fetched.lines) {
    try {
      const team = line.team ? canonicalTeamCode(line.team) : null;
      const canonicalPlayerId = deps.resolvePlayer?.(line.playerName, team) ?? null;
      const projection = deps.project?.({ name: line.playerName, team, canonicalPlayerId }, line.market, game, capturedAtUtc) ?? null;
      const snapshot = buildSnapshot({
        game: { canonicalGameKey: game.canonicalGameKey, sourceEventId: game.sourceEventId, tipoffUtc: game.tipoffUtc, awayTeam: game.awayTeam, homeTeam: game.homeTeam, neutralSite: game.neutralSite },
        player: { canonicalPlayerId, sourcePlayerName: line.playerName, sourcePlayerId: null, team },
        market: line.market,
        source: { sourceId: deps.provider.sourceId, method: profile.method, sportsbook: line.sportsbook, sourceMarketKey: PROVIDER_KEY[line.market], ...(line.rawProviderRef ? { rawProviderRef: line.rawProviderRef } : {}), ...(line.identityAmbiguous !== undefined ? { playerIdentityAmbiguous: line.identityAmbiguous && canonicalPlayerId === null } : {}) },
        line: line.line,
        overPrice: line.overPrice,
        underPrice: line.underPrice,
        sourceLastUpdateUtc: line.lastUpdateUtc,
        capturedAtUtc,
        maxAgeMinutes: policy.maxLineAgeMinutes,
        projection: projection
          ? { value: projection.value, minutes: projection.minutes, modelVersion: projection.modelVersion, inputCutoffUtc: projection.inputCutoffUtc, unavailableReason: null }
          : { unavailableReason: "no permitted history to project from" },
        permissions: { permittedUses: [...license.permittedUses], licenseBasis: license.basis, licenseReviewedOn: license.reviewedOn, attestation: null },
        provenance: { runId: deps.runId, importBatchId: null, creditsCharged: charged },
      });
      const latest = await deps.store.latestSnapshotForMarket(marketKeyOf(snapshot.game.canonicalGameKey, playerKeyOf(snapshot.player), snapshot.market, snapshot.source.sportsbook));
      if (latest && latest.fingerprint === snapshot.fingerprint) {
        unchanged += 1;
        continue;
      }
      if ((await deps.store.insertSnapshot(snapshot)) === "inserted") {
        stored += 1;
        if (snapshot.freshness.status === "stale") staleStored += 1;
      }
    } catch (error) {
      // Only a record that fails validation is a rejected line. A storage failure must not look like "no lines".
      if (!(error instanceof PipelineValidationError)) {
        report.linesStored += stored;
        report.staleLinesStored += staleStored;
        await recordAttempt(deps, game, attemptId, "error", `storage failure after the provider call: ${error instanceof Error ? error.message.slice(0, 160) : "unknown"}`, decision.minutesToTipoff, charged, stored);
        throw error;
      }
      report.rejectedLines += 1;
      if (report.rejectionReasons.length < 5) report.rejectionReasons.push(error.message.slice(0, 200));
    }
  }
  report.linesStored += stored;
  report.staleLinesStored += staleStored;
  const outcome: AttemptOutcome = fetched.lines.length === 0 ? "no_market" : stored === 0 && unchanged > 0 ? "deduplicated" : stored > 0 && staleStored === stored ? "stale_only" : stored > 0 ? "captured" : "no_market";
  if (outcome === "captured") report.captured += 1;
  else if (outcome === "deduplicated") report.deduplicated += 1;
  else if (outcome === "stale_only") report.staleOnly += 1;
  else report.noMarket += 1;
  await recordAttempt(deps, game, attemptId, outcome, fetched.unmatched?.length ? fetched.unmatched.slice(0, 3).join("; ").slice(0, 200) : outcome === "no_market" ? "no player-prop lines posted yet" : null, decision.minutesToTipoff, charged, stored);
}

const PROVIDER_KEY: Readonly<Record<Market, string>> = { pts: "player_points", reb: "player_rebounds", ast: "player_assists" };

/** A run id for a scheduled slot. The nonce makes every execution unique: a re-dispatch of the same slot is a new run. */
export const runIdFor = (job: string, slotUtc: string, nonce: string): string => `${job}-${sha256Json({ job, slotUtc, nonce }).slice(0, 12)}`;
