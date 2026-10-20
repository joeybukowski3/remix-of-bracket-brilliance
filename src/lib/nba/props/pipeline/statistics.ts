/**
 * Incremental statistics from stored snapshots, results and evaluations. Pure.
 *
 * Line-based statistics use only AUTHENTIC archived pregame lines: captured
 * before tipoff, fresh, and not synthetic (unless a test asks for synthetic).
 * A line reconstructed later, a stale line, or a post-tipoff price never feeds
 * a hit rate or a trend. Anything used to TRAIN additionally needs
 * model-development rights on the record itself.
 */
import { sha256Json } from "../canonicalJson";
import { etGameDate } from "../canonical";
import { calibrationBins, summarizeErrors, type CalibrationBin, type ErrorSummary } from "../evaluation/metrics";
import { playerKeyOf, type Market, type NbaFinalResult, type NbaPregameSnapshot, type NbaPropEvaluation } from "./contracts";
import type { DataUse } from "../sources/types";
import { realizedProfit } from "./settlement";

export interface EvaluatedProp {
  snapshot: NbaPregameSnapshot;
  evaluation: NbaPropEvaluation;
}

/** Latest evaluation of each snapshot, paired with it. A snapshot never evaluated is omitted. */
export function joinEvaluations(snapshots: readonly NbaPregameSnapshot[], evaluations: readonly NbaPropEvaluation[]): EvaluatedProp[] {
  const latest = new Map<string, NbaPropEvaluation>();
  for (const e of evaluations) {
    const held = latest.get(e.snapshotId);
    if (!held || e.revision > held.revision) latest.set(e.snapshotId, e);
  }
  return snapshots.flatMap((snapshot) => {
    const evaluation = latest.get(snapshot.snapshotId);
    return evaluation ? [{ snapshot, evaluation }] : [];
  });
}

export interface AuthenticityOptions {
  allowSynthetic?: boolean;
}

/**
 * Fresh (provider-dated or observed at capture), pregame, not backfilled, not
 * synthetic, and carrying at least private-research rights. A line whose age
 * cannot be established ("unknown") or that was imported after the game is not
 * authentic: its capture time cannot be trusted.
 */
export function isAuthenticLine(s: NbaPregameSnapshot, options: AuthenticityOptions = {}): boolean {
  if (s.source.method === "synthetic" && !options.allowSynthetic) return false;
  if (s.permissions.attestation?.backfilled) return false;
  return s.freshness.status === "fresh" && Date.parse(s.timing.capturedAtUtc) < Date.parse(s.game.tipoffUtc) && s.permissions.permittedUses.includes("private-research");
}

/** Training needs model-development rights on the line AND on the result that labels it. */
export const hasTrainingRights = (s: NbaPregameSnapshot, e?: NbaPropEvaluation): boolean =>
  s.permissions.permittedUses.includes("model-development") && (e === undefined || e.resultPermittedUses.includes("model-development"));

// ---- Player minutes history, from final results ----

const latestPerKey = (results: readonly NbaFinalResult[]): NbaFinalResult[] => {
  const latest = new Map<string, NbaFinalResult>();
  for (const r of results) {
    const key = `${r.game.canonicalGameKey}|${playerKeyOf(r.player)}`;
    const held = latest.get(key);
    if (!held || r.revision > held.revision) latest.set(key, r);
  }
  return [...latest.values()];
};

/** NBA season label ("2026-27") of an instant, from its Eastern date. */
export function seasonOfInstant(instantUtc: string): string {
  const date = etGameDate(instantUtc);
  const year = Number(date.slice(0, 4));
  const start = Number(date.slice(5, 7)) >= 8 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export interface MinutesHistory {
  games: number;
  last5: number | null;
  last10: number | null;
  season: number | null;
}

const mean = (values: readonly number[]): number | null => (values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length);

/** Minutes of games the player PLAYED, final before `asOfUtc`. DNPs and unverified absences are not zero-minute games. */
export function minutesHistory(results: readonly NbaFinalResult[], playerKey: string, asOfUtc: string, requiredUse: DataUse = "private-research"): MinutesHistory {
  const asOfMs = Date.parse(asOfUtc);
  // Point in time: only revisions recorded by then, so a later correction cannot leak into an earlier as-of.
  const known = results.filter((r) => Date.parse(r.recordedAtUtc) <= asOfMs && r.permissions.permittedUses.includes(requiredUse));
  const played = latestPerKey(known)
    .filter((r) => playerKeyOf(r.player) === playerKey && r.participation === "played" && r.stats !== null && r.game.finalizedAtUtc !== null && Date.parse(r.game.finalizedAtUtc) < asOfMs)
    .sort((a, b) => b.game.tipoffUtc.localeCompare(a.game.tipoffUtc));
  const season = seasonOfInstant(asOfUtc);
  return {
    games: played.length,
    last5: mean(played.slice(0, 5).map((r) => r.stats!.minutes)),
    last10: mean(played.slice(0, 10).map((r) => r.stats!.minutes)),
    season: mean(played.filter((r) => seasonOfInstant(r.game.tipoffUtc) === season).map((r) => r.stats!.minutes)),
  };
}

// ---- Projection error ----

export interface ProjectionErrors {
  byMarket: Record<Market, ErrorSummary>;
  minutes: ErrorSummary;
}

/** Errors are projection minus actual, on decided props that carried a projection. */
export function projectionErrors(props: readonly EvaluatedProp[]): ProjectionErrors {
  const pairsFor = (pick: (p: EvaluatedProp) => number | null, market?: Market) =>
    props.filter((p) => market === undefined || p.snapshot.market === market).flatMap((p) => {
      const e = pick(p);
      return e === null ? [] : [[e, 0] as const];
    });
  const market = (m: Market) => summarizeErrors(pairsFor((p) => p.evaluation.errors.projection, m));
  return { byMarket: { pts: market("pts"), reb: market("reb"), ast: market("ast") }, minutes: summarizeErrors(pairsFor((p) => p.evaluation.errors.minutes)) };
}

// ---- Over/under records ----

export interface OverUnderRecord {
  over: number;
  under: number;
  push: number;
  void: number;
  pending: number;
  decided: number;
  /** over / (over + under); pushes and voids excluded. */
  overRate: number | null;
}

const emptyRecord = (): OverUnderRecord => ({ over: 0, under: 0, push: 0, void: 0, pending: 0, decided: 0, overRate: null });

function tally(props: readonly EvaluatedProp[]): OverUnderRecord {
  const record = emptyRecord();
  for (const { evaluation } of props) record[evaluation.settlement] += 1;
  record.decided = record.over + record.under;
  record.overRate = record.decided === 0 ? null : record.over / record.decided;
  return record;
}

export type OverUnderGrouping = "market" | "player" | "opponent" | "venue" | "sportsbook";

function groupKey(p: EvaluatedProp, by: OverUnderGrouping): string {
  const { snapshot } = p;
  const team = snapshot.player.team;
  switch (by) {
    case "market":
      return snapshot.market;
    case "player":
      return `${playerKeyOf(snapshot.player)}|${snapshot.market}`;
    case "sportsbook":
      return snapshot.source.sportsbook;
    case "opponent":
      return team === null ? "unknown" : team === snapshot.game.homeTeam ? (snapshot.game.awayTeam ?? "unknown") : (snapshot.game.homeTeam ?? "unknown");
    case "venue":
      return snapshot.game.neutralSite ? "neutral" : team === null ? "unknown" : team === snapshot.game.homeTeam ? "home" : "away";
  }
}

/** O/U and push history relative to the CAPTURED line, from authentic lines only. */
export function overUnderRecords(props: readonly EvaluatedProp[], by: OverUnderGrouping, options: AuthenticityOptions = {}): { excludedNotAuthentic: number; groups: Record<string, OverUnderRecord> } {
  const usable = props.filter((p) => isAuthenticLine(p.snapshot, options));
  const groups = new Map<string, EvaluatedProp[]>();
  for (const p of usable) (groups.get(groupKey(p, by)) ?? groups.set(groupKey(p, by), []).get(groupKey(p, by))!).push(p);
  return { excludedNotAuthentic: props.length - usable.length, groups: Object.fromEntries([...groups].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, tally(v)])) };
}

// ---- Calibration and EV (only where probabilities exist) ----

export interface EvEvaluation {
  calibrationVersion: string;
  /** Props with a decided over/under and a calibrated probability. */
  n: number;
  calibration: CalibrationBin[];
  bets: number;
  meanPredictedEv: number | null;
  meanRealizedProfit: number | null;
}

/**
 * Per calibration version: reliability of pOver against the over outcome, and
 * the realized profit of betting the side the model rates higher when its EV
 * exceeds `threshold`. Props without probabilities are not guessed at.
 */
export function evEvaluations(props: readonly EvaluatedProp[], threshold = 0, options: AuthenticityOptions = {}): EvEvaluation[] {
  const byVersion = new Map<string, EvaluatedProp[]>();
  for (const p of props) {
    const probs = p.snapshot.probabilities;
    const decided = p.evaluation.settlement === "over" || p.evaluation.settlement === "under";
    if (!probs || !decided || !isAuthenticLine(p.snapshot, options)) continue;
    (byVersion.get(probs.calibrationVersion) ?? byVersion.set(probs.calibrationVersion, []).get(probs.calibrationVersion)!).push(p);
  }
  return [...byVersion].sort(([a], [b]) => a.localeCompare(b)).map(([calibrationVersion, group]) => {
    const pairs = group.map((p): [number, 0 | 1] => [p.snapshot.probabilities!.pOver, p.evaluation.settlement === "over" ? 1 : 0]);
    const bets = group.flatMap((p) => {
      const probs = p.snapshot.probabilities!;
      const side = probs.evOver >= probs.evUnder ? "over" : "under";
      const ev = side === "over" ? probs.evOver : probs.evUnder;
      if (ev <= threshold) return [];
      const profit = realizedProfit(side, p.evaluation.settlement, side === "over" ? p.snapshot.overPrice : p.snapshot.underPrice);
      return profit === null ? [] : [{ ev, profit }];
    });
    return {
      calibrationVersion,
      n: group.length,
      calibration: calibrationBins(pairs),
      bets: bets.length,
      meanPredictedEv: bets.length === 0 ? null : bets.reduce((s, b) => s + b.ev, 0) / bets.length,
      meanRealizedProfit: bets.length === 0 ? null : bets.reduce((s, b) => s + b.profit, 0) / bets.length,
    };
  });
}

// ---- Frozen chronological partitions ----

export interface PartitionManifest {
  schemaVersion: "nba-prop-partition-v1";
  trainEndUtc: string;
  holdoutStartUtc: string;
  counts: { train: number; gap: number; holdout: number };
  excluded: { notAuthentic: number; undecided: number; noTrainingRights: number };
  idsSha256: string;
}

export interface Partitions {
  train: string[];
  gap: string[];
  holdout: string[];
  manifest: PartitionManifest;
}

/**
 * Splits authentic, decided props by tipoff: train <= trainEnd, holdout >=
 * holdoutStart, nothing in between (a gap prevents adjacent-game leakage).
 * A training row also needs model-development rights on the record itself.
 */
export function freezePartitions(props: readonly EvaluatedProp[], trainEndUtc: string, holdoutStartUtc: string, options: AuthenticityOptions = {}): Partitions {
  if (!(trainEndUtc < holdoutStartUtc)) throw new Error("trainEnd must be before holdoutStart");
  const excluded = { notAuthentic: 0, undecided: 0, noTrainingRights: 0 };
  const settlementOf = new Map(props.map((p) => [p.snapshot.snapshotId, p.evaluation.settlement]));
  const train: string[] = [];
  const gap: string[] = [];
  const holdout: string[] = [];
  for (const p of [...props].sort((a, b) => a.snapshot.game.tipoffUtc.localeCompare(b.snapshot.game.tipoffUtc) || a.snapshot.snapshotId.localeCompare(b.snapshot.snapshotId))) {
    if (!isAuthenticLine(p.snapshot, options)) excluded.notAuthentic += 1;
    else if (p.evaluation.settlement !== "over" && p.evaluation.settlement !== "under" && p.evaluation.settlement !== "push") excluded.undecided += 1;
    else if (p.snapshot.game.tipoffUtc <= trainEndUtc) {
      if (hasTrainingRights(p.snapshot, p.evaluation)) train.push(p.snapshot.snapshotId);
      else excluded.noTrainingRights += 1;
    } else if (p.snapshot.game.tipoffUtc >= holdoutStartUtc) holdout.push(p.snapshot.snapshotId);
    else gap.push(p.snapshot.snapshotId);
  }
  return {
    train,
    gap,
    holdout,
    // The hash covers each member's settlement too, so a correction that flips a label reads as a change.
    manifest: { schemaVersion: "nba-prop-partition-v1", trainEndUtc, holdoutStartUtc, counts: { train: train.length, gap: gap.length, holdout: holdout.length }, excluded, idsSha256: sha256Json({ members: [...train, ...gap, ...holdout].sort().map((id) => [id, settlementOf.get(id)]), train, gap, holdout }) },
  };
}

/** Rebuilds the partitions and reports whether the frozen membership changed (late arrivals, removals). */
export function verifyFrozenPartitions(frozen: PartitionManifest, props: readonly EvaluatedProp[], options: AuthenticityOptions = {}): { unchanged: boolean; current: PartitionManifest } {
  const current = freezePartitions(props, frozen.trainEndUtc, frozen.holdoutStartUtc, options).manifest;
  return { unchanged: current.idsSha256 === frozen.idsSha256, current };
}
