/**
 * Postgame settlement job (offline runner; provider and gate are injected).
 *
 * Meant to run once the following morning. It touches only games that have
 * had time to finish and are either unprocessed or inside a bounded
 * correction window, records results as new revisions, and appends
 * evaluations of the immutable pregame snapshots. It never edits a snapshot,
 * and a player missing from a box score becomes `unverified_absent` (a pending
 * settlement), never a confirmed DNP.
 */
import { canonicalTeamCode } from "../canonical";
import type { RequestGate } from "./budget";
import {
  normalizePlayerName,
  PIPELINE_SCHEMA,
  PipelineValidationError,
  playerKeyOf,
  type AttemptOutcome,
  type GameStatus,
  type NbaCaptureAttempt,
  type NbaFinalResult,
  type NbaPipelineGame,
  type NbaPregameSnapshot,
  type Participation,
} from "./contracts";
import { recordResultDraft, type ResultDraft } from "./resultsRecorder";
import { evaluateSnapshot } from "./settlement";
import type { PipelineStore } from "./store";

export interface ProviderPlayerResult {
  playerName: string;
  team: string | null;
  participation: Exclude<Participation, "unverified_absent">;
  stats?: { minutes: number; pts: number; reb: number; ast: number };
}

export interface ProviderGameResult {
  canonicalGameKey: string;
  status: GameStatus;
  periods: number | null;
  finalizedAtUtc: string | null;
  players: readonly ProviderPlayerResult[];
}

export type ResultsFetch =
  | { status: "ok"; result: ProviderGameResult; creditsCharged: number | null; requestRef: string }
  | { status: "not_available" }
  | { status: "error"; message: string };

export interface ResultsProvider {
  sourceId: string;
  method: "api" | "manual-import" | "synthetic";
  fetchGameResult(game: NbaPipelineGame): Promise<ResultsFetch>;
}

export interface SettlementPolicy {
  /** A game is checked only this long after its scheduled tipoff. */
  minHoursAfterTipoff: number;
  /** After the first final result, re-check for corrections for this long... */
  correctionWindowHours: number;
  /** ...and at most this many times. */
  maxCorrectionChecks: number;
  /** A game still without a final result this long after tipoff stops being fetched and stays pending. */
  giveUpDays: number;
}

export const DEFAULT_SETTLEMENT_POLICY: SettlementPolicy = Object.freeze({ minHoursAfterTipoff: 4, correctionWindowHours: 72, maxCorrectionChecks: 2, giveUpDays: 7 });

export interface PostgameDeps {
  store: PipelineStore;
  provider: ResultsProvider;
  /** Required when the provider is metered; omit for free or manual sources. */
  gate?: RequestGate;
  creditsPerGame?: number;
  now: () => Date;
  runId: string;
  policy?: SettlementPolicy;
  /** Rights recorded on results from this provider. */
  permissions: NbaFinalResult["permissions"];
  resolvePlayer?: (name: string, team: string | null) => string | null;
  lockTtlMs?: number;
}

export interface PostgameReport {
  runId: string;
  outcome: "completed" | "locked" | "blocked" | "failed";
  reason: string | null;
  gamesChecked: number;
  gamesSkipped: number;
  resultsInserted: number;
  correctionsInserted: number;
  absentUnverified: number;
  evaluationsInserted: number;
  providerErrors: number;
  /** Drafts refused because they would move a settled result backwards without a correction reason. */
  refusedRegressions: number;
  /** Provider rows that failed validation (kept as unverified, never as production). */
  invalidProviderRows: number;
  creditsCharged: number;
}

const LOCK_NAME = "nba-postgame-settlement";
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export async function runPostgameSettlement(deps: PostgameDeps): Promise<PostgameReport> {
  const policy = deps.policy ?? DEFAULT_SETTLEMENT_POLICY;
  const report: PostgameReport = { runId: deps.runId, outcome: "completed", reason: null, gamesChecked: 0, gamesSkipped: 0, resultsInserted: 0, correctionsInserted: 0, absentUnverified: 0, evaluationsInserted: 0, providerErrors: 0, refusedRegressions: 0, invalidProviderRows: 0, creditsCharged: 0 };
  const started = deps.now().toISOString();
  const finish = async (outcome: PostgameReport["outcome"], reason: string | null): Promise<PostgameReport> => {
    report.outcome = outcome;
    report.reason = reason;
    await deps.store.recordRun({
      schemaVersion: PIPELINE_SCHEMA.run,
      runId: deps.runId,
      job: "postgame-settlement",
      startedAtUtc: started,
      finishedAtUtc: deps.now().toISOString(),
      outcome,
      reason,
      counts: { gamesChecked: report.gamesChecked, gamesSkipped: report.gamesSkipped, resultsInserted: report.resultsInserted, correctionsInserted: report.correctionsInserted, absentUnverified: report.absentUnverified, evaluationsInserted: report.evaluationsInserted, providerErrors: report.providerErrors, creditsCharged: report.creditsCharged },
    });
    return report;
  };
  if (!deps.permissions.permittedUses.includes("private-research")) return finish("blocked", "no recorded permission to store results from this provider");
  if (deps.provider.method === "api" && (!deps.gate || !deps.gate.enforcesNbaAllowance || (deps.creditsPerGame ?? 0) <= 0)) {
    return finish("blocked", "a metered results provider needs a quota gate that enforces the NBA allowance, and a positive per-game cost");
  }
  if (!(await deps.store.acquireLock(LOCK_NAME, deps.runId, deps.lockTtlMs ?? 30 * 60_000, deps.now()))) return finish("locked", "another settlement run holds the lock");
  try {
    const snapshots = await deps.store.listSnapshots();
    const byGame = new Map<string, NbaPregameSnapshot[]>();
    for (const s of snapshots) (byGame.get(s.game.canonicalGameKey) ?? byGame.set(s.game.canonicalGameKey, []).get(s.game.canonicalGameKey)!).push(s);
    const games = (await deps.store.listGames()).filter((g) => byGame.has(g.canonicalGameKey));
    for (const game of games) await settleGame(deps, policy, game, byGame.get(game.canonicalGameKey) ?? [], report);
    return finish("completed", null);
  } catch (error) {
    return finish("failed", error instanceof Error ? error.message : String(error));
  } finally {
    await deps.store.releaseLock(LOCK_NAME, deps.runId);
  }
}

async function settleGame(deps: PostgameDeps, policy: SettlementPolicy, game: NbaPipelineGame, snapshots: readonly NbaPregameSnapshot[], report: PostgameReport): Promise<void> {
  const nowMs = deps.now().getTime();
  const sinceTipoff = nowMs - Date.parse(game.tipoffUtc);
  const attempts = await deps.store.listAttempts(game.canonicalGameKey);
  const fetches = attempts.filter((a) => a.outcome === "result_fetched" || a.outcome === "result_unavailable" || a.outcome === "result_error");
  const results = (await deps.store.listResults()).filter((r) => r.game.canonicalGameKey === game.canonicalGameKey);
  const firstFinal = results.filter((r) => r.game.status === "final").sort((a, b) => a.recordedAtUtc.localeCompare(b.recordedAtUtc))[0];

  if (game.status === "postponed" || game.status === "cancelled") {
    await recordGameLevelResults(deps, game, snapshots, { status: game.status, periods: null, provider: { sourceId: "schedule", method: deps.provider.method }, evidence: { sourceSnapshotId: `schedule:${game.observedAtUtc}`, importBatchId: null, rowRef: `game ${game.status}` } }, report);
    return;
  }
  if (sinceTipoff < policy.minHoursAfterTipoff * HOUR_MS) {
    report.gamesSkipped += 1;
    return;
  }
  if (firstFinal) {
    const inWindow = nowMs - Date.parse(firstFinal.recordedAtUtc) <= policy.correctionWindowHours * HOUR_MS;
    // The fetch that produced the first final result is not a correction check.
    const checksSinceFinal = Math.max(0, fetches.filter((a) => a.atUtc >= firstFinal.recordedAtUtc).length - 1);
    if (!inWindow || checksSinceFinal >= policy.maxCorrectionChecks) {
      report.gamesSkipped += 1;
      return;
    }
  } else if (sinceTipoff > policy.giveUpDays * DAY_MS) {
    report.gamesSkipped += 1;
    return;
  }

  const credits = deps.creditsPerGame ?? 0;
  let settle: ((actual: number | null, outcome: "ok" | "provider-error" | "http-error" | "network-error", detail?: string | null) => Promise<void>) | null = null;
  if (deps.gate && credits > 0) {
    const reservation = await deps.gate.reserve(credits, "/results");
    if (!reservation.ok) {
      report.gamesSkipped += 1;
      return;
    }
    settle = reservation.settle;
  }
  report.gamesChecked += 1;
  const attemptId = `${game.canonicalGameKey}|result|${fetches.length + 1}`;
  const note = async (outcome: AttemptOutcome, reason: string | null, charged: number) => {
    const attempt: NbaCaptureAttempt = { schemaVersion: PIPELINE_SCHEMA.attempt, attemptId, runId: deps.runId, canonicalGameKey: game.canonicalGameKey, outcome, reason, minutesToTipoff: -sinceTipoff / 60_000, creditsCharged: charged, linesStored: 0, atUtc: deps.now().toISOString() };
    await deps.store.appendAttempt(attempt);
  };

  let fetched;
  try {
    fetched = await deps.provider.fetchGameResult(game);
  } catch (error) {
    await settle?.(null, "network-error", "network error");
    report.creditsCharged += credits;
    report.providerErrors += 1;
    await note("result_error", error instanceof Error ? error.message.slice(0, 200) : "network error", credits);
    return;
  }
  if (fetched.status !== "ok") {
    await settle?.(null, fetched.status === "error" ? "provider-error" : "ok", fetched.status === "error" ? fetched.message.slice(0, 200) : null);
    report.creditsCharged += credits;
    if (fetched.status === "error") report.providerErrors += 1;
    await note(fetched.status === "error" ? "result_error" : "result_unavailable", fetched.status === "error" ? fetched.message.slice(0, 200) : "provider has no result yet", credits);
    return;
  }
  const charged = fetched.creditsCharged ?? credits;
  await settle?.(fetched.creditsCharged, "ok");
  report.creditsCharged += charged;
  await note("result_fetched", null, charged);
  await applyProviderResult(deps, game, snapshots, fetched.result, fetched.requestRef, report);
}

function snapshotPlayers(snapshots: readonly NbaPregameSnapshot[]) {
  return new Map(snapshots.map((s) => [playerKeyOf(s.player), s.player]));
}

async function applyProviderResult(deps: PostgameDeps, game: NbaPipelineGame, snapshots: readonly NbaPregameSnapshot[], provided: ProviderGameResult, requestRef: string, report: PostgameReport): Promise<void> {
  if (provided.status !== "final") {
    // A partial or interrupted box score is not a result: the game-level status is recorded and the props stay pending or void.
    await recordGameLevelResults(deps, game, snapshots, { status: provided.status, periods: provided.periods, provider: { sourceId: deps.provider.sourceId, method: deps.provider.method }, evidence: { sourceSnapshotId: requestRef, importBatchId: null, rowRef: `game ${provided.status}` } }, report);
    return;
  }
  const recordedAtUtc = deps.now().toISOString();
  const gameRef = {
    canonicalGameKey: game.canonicalGameKey,
    tipoffUtc: game.tipoffUtc,
    status: provided.status,
    periods: provided.periods,
    finalizedAtUtc: provided.status === "final" ? provided.finalizedAtUtc ?? recordedAtUtc : null,
  };
  const base = { game: gameRef, provider: { sourceId: deps.provider.sourceId, method: deps.provider.method }, evidence: { sourceSnapshotId: requestRef, importBatchId: null }, permissions: deps.permissions };
  const wanted = snapshotPlayers(snapshots);
  const seen = new Set<string>();

  for (const p of provided.players) {
    const team = p.team ? canonicalTeamCode(p.team) : null;
    // Every pregame line for this player (the same person can be keyed more than one way) is keyed exactly as its snapshot is,
    // so result and snapshot always meet.
    const matches = [...wanted.values()].filter((w) => normalizePlayerName(w.sourcePlayerName) === normalizePlayerName(p.playerName) && (team === null || w.team === null || w.team === team));
    const players = matches.length > 0 ? matches : [{ canonicalPlayerId: deps.resolvePlayer?.(p.playerName, team) ?? null, sourcePlayerName: p.playerName, sourcePlayerId: null, team }];
    // A "played" row without positive minutes is ambiguous (providers list DNP-CD rows that way): keep it unverified.
    const usable = p.participation !== "played" || (p.stats !== undefined && p.stats.minutes > 0 && [p.stats.pts, p.stats.reb, p.stats.ast].every((n) => Number.isInteger(n) && n >= 0));
    if (!usable) report.invalidProviderRows += 1;
    for (const player of players) {
      seen.add(playerKeyOf(player));
      const draft: ResultDraft = {
        ...base,
        player,
        participation: usable ? p.participation : "unverified_absent",
        stats: usable && p.participation === "played" ? p.stats ?? null : null,
        correctionReason: null,
        evidence: { ...base.evidence, rowRef: usable ? p.playerName : `${p.playerName} (invalid provider row)` },
      };
      try {
        await record(deps, draft, recordedAtUtc, report);
      } catch (error) {
        if (!(error instanceof PipelineValidationError)) throw error;
        report.invalidProviderRows += 1; // one bad row never aborts the game or the run
      }
    }
  }
  // A player with a line who is missing from the box score is UNVERIFIED, never a DNP.
  for (const [key, player] of wanted) {
    if (seen.has(key)) continue;
    report.absentUnverified += 1;
    await record(deps, { ...base, player, participation: "unverified_absent", stats: null, correctionReason: null, evidence: { ...base.evidence, rowRef: "absent from provider box score" } }, recordedAtUtc, report);
  }
  await evaluateGame(deps, snapshots, recordedAtUtc, report);
}

interface GameLevel {
  status: GameStatus;
  periods: number | null;
  provider: NbaFinalResult["provider"];
  evidence: NbaFinalResult["evidence"];
}

async function recordGameLevelResults(deps: PostgameDeps, game: NbaPipelineGame, snapshots: readonly NbaPregameSnapshot[], level: GameLevel, report: PostgameReport): Promise<void> {
  const recordedAtUtc = deps.now().toISOString();
  for (const [, player] of snapshotPlayers(snapshots)) {
    await record(
      deps,
      {
        game: { canonicalGameKey: game.canonicalGameKey, tipoffUtc: game.tipoffUtc, status: level.status, periods: level.periods, finalizedAtUtc: null },
        player,
        participation: "unverified_absent",
        stats: null,
        correctionReason: null,
        provider: level.provider,
        evidence: level.evidence,
        permissions: deps.permissions,
      },
      recordedAtUtc,
      report,
    );
  }
  await evaluateGame(deps, snapshots, recordedAtUtc, report);
}

async function record(deps: PostgameDeps, draft: ResultDraft, recordedAtUtc: string, report: PostgameReport): Promise<void> {
  const before = await deps.store.latestResult(draft.game.canonicalGameKey, playerKeyOf(draft.player));
  const { outcome } = await recordResultDraft(deps.store, draft, recordedAtUtc);
  if (outcome === "refused") report.refusedRegressions += 1;
  if (outcome !== "inserted") return;
  if (before) report.correctionsInserted += 1;
  else report.resultsInserted += 1;
}

async function evaluateGame(deps: PostgameDeps, snapshots: readonly NbaPregameSnapshot[], evaluatedAtUtc: string, report: PostgameReport): Promise<void> {
  report.evaluationsInserted += await evaluateSnapshots(deps.store, snapshots, evaluatedAtUtc);
}

async function evaluateSnapshots(store: PipelineStore, snapshots: readonly NbaPregameSnapshot[], evaluatedAtUtc: string): Promise<number> {
  let inserted = 0;
  for (const snapshot of snapshots) {
    const result = await store.latestResult(snapshot.game.canonicalGameKey, playerKeyOf(snapshot.player));
    if (!result) continue;
    const evaluation = evaluateSnapshot(snapshot, result, await store.latestEvaluation(snapshot.snapshotId), evaluatedAtUtc);
    if (evaluation && (await store.appendEvaluation(evaluation)) === "inserted") inserted += 1;
  }
  return inserted;
}

/**
 * Evaluates every stored snapshot against the latest stored result, with no
 * provider call. This is how manually imported results are settled. Idempotent:
 * an unchanged snapshot/result pair adds nothing.
 */
export async function settleStoredResults(store: PipelineStore, evaluatedAtUtc: string): Promise<{ evaluationsInserted: number }> {
  return { evaluationsInserted: await evaluateSnapshots(store, await store.listSnapshots(), evaluatedAtUtc) };
}
