/**
 * Does the JKB projection do better for steady-minutes players? Error by research tier (Core, Rotation, Variable) and by stat, and
 * how often the projection leaned the right way against a posted line.
 *
 * Nothing here changes the projection, the tiers or the board. Every input is available before tip-off:
 *  - the tier of a game is the one the board would have shown before it: the very same `seasonStatsFor` and `researchProfile` the
 *    page uses, called with the game's date as the cutoff, so it sees only earlier completed games (no retrospective selection);
 *  - the projections come from walk-forward predictions built from games strictly before each target (walkForward.ts);
 *  - a sportsbook line counts only if it was captured before tip-off, and the latest such capture is the one used.
 *
 * Scope, stated plainly: the import has no did-not-play rows, so every row is a player who appeared, exactly like a projection on
 * the board (which is conditional on playing). Directional accuracy says nothing about price: without timestamped prices and a
 * backtest at those prices there is no expected-value claim to make here, and none is made.
 */
import { buildTeamGameDates } from "../../features";
import { researchProfile, type ResearchTier } from "../../researchTier";
import { errorStats } from "../../backtest";
import { seasonStatsFor } from "../seasonStatsBuild";
import { toPlayerGames } from "../slateBuild";
import { THIN_SEGMENT_ROWS, commonSample } from "./backtestMetrics";
import { robustDifference, type RobustDifference } from "./inference";
import { STATS, type BacktestRow, type Stat, type WalkRow } from "./walkForward";

export const EVAL_GROUPS = ["core", "rotation", "variable"] as const satisfies readonly ResearchTier[];
export type EvalGroup = (typeof EVAL_GROUPS)[number];
export const EVAL_MEASURES = ["minutes", ...STATS] as const;
export type EvalMeasure = (typeof EVAL_MEASURES)[number];

/** A scored game with the research tier the board would have shown for it before tip-off. */
export interface TieredRow {
  row: BacktestRow;
  group: EvalGroup;
  /** Season minutes per game before the game; null when none. */
  mpg: number | null;
  /** The stability verdict before the game; null when there were fewer than five earlier games. */
  stable: boolean | null;
}

/** The tier of every scored row, computed exactly as the board computes it (same code, cutoff = the game's date). */
export function tierRows(imported: readonly WalkRow[], rows: readonly BacktestRow[]): TieredRow[] {
  const playerNumbers = new Map([...new Set(imported.map((r) => r.playerId))].sort().map((id, i) => [id, i + 1]));
  const games = toPlayerGames(imported, playerNumbers);
  const histories = new Map<string, typeof games>();
  const teamIds = new Map<string, number>();
  imported.forEach((r, i) => {
    histories.set(r.playerId, [...(histories.get(r.playerId) ?? []), games[i]]);
    teamIds.set(`${r.gameId}|${r.playerId}`, games[i].teamId);
  });
  const teamGameDates = buildTeamGameDates(games);
  return rows.map((row) => {
    const teamId = teamIds.get(`${row.gameId}|${row.playerId}`) ?? 0;
    const stats = seasonStatsFor(histories.get(row.playerId) ?? [], { gameId: row.gameId, cutoffDate: row.gameDate, season: row.season }, undefined, { teamId, teamGameDates });
    const profile = researchProfile(stats);
    return { row, group: profile?.tier ?? "variable", mpg: profile?.mpg ?? null, stable: profile?.consistency.last5?.stable ?? null };
  });
}

export interface MeasureEvaluation {
  n: number;
  /** JKB (baseline v0) mean absolute error, and its 95% interval clustered by player and by week. */
  mae: number | null;
  maeCi95: [number, number] | null;
  /** Mean of projected minus actual: negative means the projection ran low. */
  bias: number | null;
  /** Mean of the actual outcome, and MAE as a share of it. Absolute error grows with volume (a 30-point scorer misses by more points than a 6-point one), so compare groups on this. */
  meanActual: number | null;
  maeRelative: number | null;
  /** The naive last-ten-average projection's error on the same rows, as a yardstick. */
  naiveL10Mae: number | null;
  /** JKB's absolute error minus the naive last ten's, with a clustered 95% interval (negative favours JKB). */
  vsNaiveL10: RobustDifference;
}

export interface GroupEvaluation {
  rows: number;
  players: number;
  /** Fewer rows than the existing backtest treats as a finding: shown, but not to be read as one. */
  thin: boolean;
  measures: Record<EvalMeasure, MeasureEvaluation>;
}

export interface TierEvaluation {
  overall: GroupEvaluation;
  groups: Record<EvalGroup, GroupEvaluation>;
}

export function evaluateGroup(rows: readonly TieredRow[]): GroupEvaluation {
  const measure = (name: EvalMeasure): MeasureEvaluation => {
    const usable = rows.flatMap((t) => {
      const jkb = t.row.predictions.v0[name];
      const naive = t.row.predictions.naive_l10[name];
      return jkb === null || naive === null ? [] : [{ row: t.row, jkb, naive }];
    });
    const stats = errorStats(usable.map((u): [number, number] => [u.jkb, u.row.actual[name]]));
    const naiveStats = errorStats(usable.map((u): [number, number] => [u.naive, u.row.actual[name]]));
    const interval = robustDifference(usable.map((u) => ({ candidate: Math.abs(u.jkb - u.row.actual[name]), benchmark: 0, gameDate: u.row.gameDate, playerId: u.row.playerId })));
    const meanActual = usable.length === 0 ? null : usable.reduce((sum, u) => sum + u.row.actual[name], 0) / usable.length;
    return {
      n: stats.n,
      mae: stats.mae,
      maeCi95: interval.ci95,
      bias: stats.bias,
      meanActual,
      maeRelative: stats.mae !== null && meanActual !== null && meanActual > 0 ? stats.mae / meanActual : null,
      naiveL10Mae: naiveStats.mae,
      vsNaiveL10: robustDifference(usable.map((u) => ({ candidate: Math.abs(u.jkb - u.row.actual[name]), benchmark: Math.abs(u.naive - u.row.actual[name]), gameDate: u.row.gameDate, playerId: u.row.playerId }))),
    };
  };
  return {
    rows: rows.length,
    players: new Set(rows.map((t) => t.row.playerId)).size,
    thin: rows.length < THIN_SEGMENT_ROWS,
    measures: Object.fromEntries(EVAL_MEASURES.map((m) => [m, measure(m)])) as Record<EvalMeasure, MeasureEvaluation>,
  };
}

/** Error of the JKB projection by research tier and stat, on the rows where every baseline is defined (the existing backtest's common sample). */
export function evaluateTiers(tiered: readonly TieredRow[]): TierEvaluation {
  const common = new Set(commonSample(tiered.map((t) => t.row)));
  const rows = tiered.filter((t) => common.has(t.row));
  return {
    overall: evaluateGroup(rows),
    groups: Object.fromEntries(EVAL_GROUPS.map((g) => [g, evaluateGroup(rows.filter((t) => t.group === g))])) as Record<EvalGroup, GroupEvaluation>,
  };
}

/** A sportsbook line for a player and stat in a game, with when it was captured and when the game began. */
export interface LineObservation {
  gameId: string;
  playerId: string;
  stat: Stat;
  line: number;
  capturedAtUtc: string;
  tipoffUtc: string;
}

export interface DirectionalCell {
  /** Games with a pregame line. */
  matched: number;
  /** Matched games where the projection leaned over or under, and the result was not a push. */
  called: number;
  hits: number;
  /** The result equalled the line. */
  pushes: number;
  /** The projection equalled the line, so it made no call. */
  noLean: number;
  /** Hits over called games; null with none. */
  accuracy: number | null;
  accuracyCi95: [number, number] | null;
  /** Share of called games that went over, to read a hit rate against. */
  overRate: number | null;
}

export interface DirectionalResult {
  /** Lines supplied; `linesUsed` counts matches to a scored player, game and stat (one per stat); lines left out because they were captured at or after tip-off; lines with no scored game. */
  linesSupplied: number;
  linesUsed: number;
  excludedNotPregame: number;
  unmatchedLines: number;
  groups: Record<EvalGroup, Record<Stat, DirectionalCell>>;
}

/** Wilson 95% score interval for hits out of trials; null for no trials. */
export function wilson95(hits: number, trials: number): [number, number] | null {
  if (trials <= 0) return null;
  const z = 1.959963984540054;
  const p = hits / trials;
  const denominator = 1 + z ** 2 / trials;
  const centre = (p + z ** 2 / (2 * trials)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / trials + z ** 2 / (4 * trials ** 2))) / denominator;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

const lineKey = (gameId: string, playerId: string, stat: Stat): string => `${gameId}|${playerId}|${stat}`;

/**
 * How often the projection's lean (over or under the line) matched the result, per tier and stat. Only a line captured strictly
 * before tip-off is used; when several were captured the latest pregame one is. A push or a projection equal to the line makes no
 * call and is counted apart. This measures direction only: it is not a price or a profit.
 */
export function directionalAccuracy(tiered: readonly TieredRow[], lines: readonly LineObservation[]): DirectionalResult {
  const pregame = lines.filter((l) => Date.parse(l.capturedAtUtc) < Date.parse(l.tipoffUtc));
  const latest = new Map<string, LineObservation>();
  for (const l of pregame) {
    const key = lineKey(l.gameId, l.playerId, l.stat);
    const current = latest.get(key);
    if (!current || Date.parse(l.capturedAtUtc) > Date.parse(current.capturedAtUtc)) latest.set(key, l);
  }
  const scoredKeys = new Set(tiered.flatMap((t) => STATS.map((s) => lineKey(t.row.gameId, t.row.playerId, s))));
  const empty = (): DirectionalCell => ({ matched: 0, called: 0, hits: 0, pushes: 0, noLean: 0, accuracy: null, accuracyCi95: null, overRate: null });
  const tallies = Object.fromEntries(EVAL_GROUPS.map((g) => [g, Object.fromEntries(STATS.map((s) => [s, { ...empty(), overs: 0 }]))])) as Record<EvalGroup, Record<Stat, DirectionalCell & { overs: number }>>;
  let used = 0;
  for (const t of tiered) {
    for (const stat of STATS) {
      const observed = latest.get(lineKey(t.row.gameId, t.row.playerId, stat));
      if (!observed) continue;
      used += 1;
      const cell = tallies[t.group][stat];
      cell.matched += 1;
      const projected = t.row.predictions.v0[stat];
      const actual = t.row.actual[stat];
      if (projected === null) continue;
      if (actual === observed.line) {
        cell.pushes += 1;
        continue;
      }
      if (projected === observed.line) {
        cell.noLean += 1;
        continue;
      }
      cell.called += 1;
      if (actual > observed.line) cell.overs += 1;
      if (projected > observed.line === actual > observed.line) cell.hits += 1;
    }
  }
  const groups = Object.fromEntries(
    EVAL_GROUPS.map((g) => [
      g,
      Object.fromEntries(
        STATS.map((s) => {
          const { overs, ...cell } = tallies[g][s];
          return [s, { ...cell, accuracy: cell.called === 0 ? null : cell.hits / cell.called, accuracyCi95: wilson95(cell.hits, cell.called), overRate: cell.called === 0 ? null : overs / cell.called }];
        }),
      ),
    ]),
  ) as Record<EvalGroup, Record<Stat, DirectionalCell>>;
  return {
    linesSupplied: lines.length,
    linesUsed: used,
    excludedNotPregame: lines.length - pregame.length,
    unmatchedLines: [...latest.keys()].filter((key) => !scoredKeys.has(key)).length,
    groups,
  };
}
