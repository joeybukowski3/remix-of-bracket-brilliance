/**
 * Performance Rating engine — composite + 1-99 public scale.
 * Model identity: nfl-current-ovr-v1.2.0 (see currentOvrModelVersion.ts).
 *
 * Consumes the full 9+9 metric bundle from performanceMetricsCore2026.ts but
 * the APPROVED composite (Model C from the 2026 Performance Model Backtest)
 * uses only 3 candidates per side, equal-weighted:
 *
 *   OFF Performance = mean( z(EPA/Play), z(Traditional Success Rate), z(Explosive Rate) )
 *   DEF Performance = mean( z(-EPA/Play Allowed), z(-Success Rate Allowed), z(-Explosive Rate Allowed) )
 *   Overall Performance = 0.40 * OFF + 0.20 * DEF + 0.40 * z(RAW Point Differential/Game)
 *
 * OFF and DEF are opponent-adjusted (leave-one-out, below). Point differential
 * is RAW: it enters the composite as the team's unadjusted mean game margin,
 * z-scored across the league. (v1.1.0 used z(opponent-adjusted PD); see the
 * v1.2.0 note below.)
 *
 * (v1.1.0 re-weighted the top-level composite from 40/40/20 to 40/20/40 after
 * the 2026-09 Current-OVR forensic audit: opponent-adjusted defense carried
 * almost no forward signal, point differential the most. OFF/DEF component
 * calculations and sub-weights are unchanged.)
 *
 * v1.2.0 — PD IS NO LONGER OPPONENT-ADJUSTED. The v1.0.0/v1.1.0 point-
 * differential adjustment applied `raw - (opponentPD - leagueMean)`, i.e. it
 * SUBTRACTED opponent strength, so a team was penalized for playing stronger
 * opponents (v0.3.1's documented margin adjustment adds it). OFF/DEF use the
 * same subtraction correctly because their comparison values are "allowed"
 * metrics. Historical validation did not support replacing the wrong-signed
 * adjustment with a full-strength sign-corrected one (early-season estimates of
 * opponent strength are far too noisy), so raw PD was selected. This is a
 * correctness / model-semantics change, NOT a claimed spread-accuracy
 * improvement. The LOO-adjusted PD value is still computed and exposed as
 * `pointDifferential.adjusted` purely as a legacy DIAGNOSTIC (same wrong-signed
 * definition as before); it does NOT feed the rating.
 *
 * All other 6 offense + 6 defense metrics (Points/Drive, Early Down,
 * Passing/Rushing Efficiency, Third-Down Performance, Sack Rate, and the
 * EPA>0 diagnostic) remain fully computable via performanceMetricsCore2026.ts
 * but do NOT enter this composite — the backtest found they add no
 * out-of-sample predictive value once EPA + SR + Explosive are present.
 * Display-only, by design.
 *
 * GARBAGE-TIME FILTER TREATMENT (backtest §6/§22 — empirically decided, not
 * assumed): EPA/Play and Success Rate use the garbage-time-FILTERED bundle
 * (`offense.filtered` / `defenseAllowed.filtered`); Explosive Rate uses the
 * UNFILTERED bundle (`offense.all` / `defenseAllowed.all`) because filtering
 * measurably hurt its out-of-sample predictive power in the backtest.
 *
 * OPPONENT ADJUSTMENT — LEAVE-ONE-OUT (v1.1.0; applies to OFF and DEF only as
 * of v1.2.0). Applied ONLY at full-season granularity (the backtest found
 * opponent adjustment harmful at 9-game half-season granularity, so no L4/L8
 * variant exists here):
 *
 *   adjusted = raw - (mean over the team's games of the opponent's comparison
 *                     value EXCLUDING that game  -  league mean comparison)
 *
 * Offense compares against opponents' matching defense-allowed metric and
 * defense against opponents' matching offense metric. (The legacy point-
 * differential diagnostic compares against opponents' own point differential;
 * it does not feed the rating — see v1.2.0 above.) The exclusion is the whole point: the
 * pre-v1.1.0 one-pass method used each opponent's season-to-date aggregate,
 * which INCLUDES the game against the team being adjusted, so the game
 * partially graded itself (100% at one game played, 50% at two, 1/n in general).
 * After Week 1 that subtracted each team's entire offensive and defensive
 * signal, leaving only the league mean — dozens of teams received identical
 * ratings and one outlier pinned at 99. With leave-one-out, a game contributes
 * NO adjustment when the opponent has no other evidence (one-game samples
 * therefore equal the raw values), and a missing opponent likewise
 * contributes no adjustment rather than being silently dropped.
 *
 * 1-99 SCALE: same formula family as v0.3.1
 * (`50 + 15 * (compositeZ / pooledDivisor)`, clamped [1, 99] — see
 * scripts/lib/nfl-power-v03-metrics.mjs toPublicRating /
 * src/lib/nfl/v03Review.ts publicScaleEquivalent). The offense and defense
 * divisors were fitted 2026-08-18 from the 2023-2025 historical composite
 * distribution (96 team-seasons) via
 * scripts/analysis/nfl-performance-backtest/fit-scale.mjs. The OVERALL divisor
 * was refit for v1.1.0 (scripts/analysis/nfl-current-ovr-v1.1.0/
 * fit-overall-divisor.mts) because the 40/20/40 composite is ~11% wider than
 * the 40/40/20 composite the original 0.7224 was fitted for; keeping the old
 * constant would have widened the public rating scale. The refit preserves
 * the same calibration the previous divisor had (see that script).
 */

import type { PerformancePlaySums, TeamPerformanceMetrics } from "@/lib/nfl/performanceMetricsCore2026";
import { rankByDescending } from "@/lib/nfl/publicPowerRatings";
import { NFL_OPPONENT_ADJUSTMENT_METHOD } from "@/lib/nfl/currentOvrModelVersion";

/**
 * Fitted constants. offense/defense: 2026-08-18, 2023-2025 nflverse play-by-play
 * (96 team-seasons). overall: refit for nfl-current-ovr-v1.1.0. Do not hand-tune.
 */
export const PERFORMANCE_SCALE_DIVISORS = Object.freeze({
  offense: 0.9248507883569935,
  defense: 0.8648390483639914,
  overall: 0.8015993487311668,
});

export const PERFORMANCE_PUBLIC_SCALE = Object.freeze({
  center: 50,
  standardDeviation: 15,
  minimum: 1,
  maximum: 99,
});

/** Top-level live composite weights, introduced in nfl-current-ovr-v1.1.0 and unchanged in v1.2.0 (v1.0.0 was 0.40 / 0.40 / 0.20). */
export const PERFORMANCE_OVERALL_WEIGHTS = Object.freeze({
  offense: 0.4,
  defense: 0.2,
  pointDifferential: 0.4,
});

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function leagueMeanAndStandardDeviation(
  values: readonly (number | null)[]
): { mean: number; standardDeviation: number } | null {
  const finite = values.filter(isFiniteNumber);
  if (finite.length === 0) return null;
  const mean = finite.reduce((sum, v) => sum + v, 0) / finite.length;
  const variance = finite.reduce((sum, v) => sum + (v - mean) ** 2, 0) / finite.length;
  return { mean, standardDeviation: Math.sqrt(variance) };
}

/** Population z-score. A valid zero-variance league deterministically maps to 0. */
function stableZScore(value: number | null, league: { mean: number; standardDeviation: number } | null): number | null {
  if (!isFiniteNumber(value) || !league || !isFiniteNumber(league.standardDeviation) || league.standardDeviation < 0) {
    return null;
  }
  if (league.standardDeviation === 0) return 0;
  return (value - league.mean) / league.standardDeviation;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** One side's play sums for one game: the unfiltered (`all`) and garbage-time-filtered bundles. */
export type TeamPerformanceGameSide = { all: PerformancePlaySums; filtered: PerformancePlaySums };

/**
 * Per-game evidence for one team's game — what leave-one-out needs that a
 * season aggregate cannot supply. `defenseAllowed` is by construction the
 * opponent's offense in the same game, and `offense` is the opponent's
 * defense-allowed in that game.
 */
export type TeamPerformanceGameEvidence = {
  opponent: string;
  /** This team's final margin in the game (own points - opponent points). */
  margin: number;
  offense: TeamPerformanceGameSide;
  defenseAllowed: TeamPerformanceGameSide;
};

/** One team's full-season input: its own season metrics plus the per-game evidence they were aggregated from. */
export type TeamPerformanceSeasonEntry = {
  team: string;
  /** Season-to-date metrics; MUST be the aggregation of `games` (checked via `metrics.gamesPlayed`). */
  metrics: TeamPerformanceMetrics;
  games: readonly TeamPerformanceGameEvidence[];
};

// ---------------------------------------------------------------------------
// Leave-one-out opponent adjustment
// ---------------------------------------------------------------------------

type Family = "epa" | "sr" | "explosive";
type Pair = readonly [numerator: number, denominator: number];

/** Numerator/denominator for one metric family from one side's game sums (same bundles the rate math uses). */
function pairOf(side: TeamPerformanceGameSide, family: Family): Pair {
  switch (family) {
    case "epa":
      return [side.filtered.offEpa, side.filtered.offPlays];
    case "sr":
      return [side.filtered.successNum, side.filtered.successDen];
    case "explosive":
      return [side.all.explosivePass + side.all.explosiveRush, side.all.offPlays];
  }
}

type TeamTotals = {
  games: number;
  margin: number;
  /** This team's own offense, summed over its games. */
  offense: Record<Family, Pair>;
  /** What this team's defense allowed, summed over its games. */
  allowed: Record<Family, Pair>;
};

const FAMILIES: readonly Family[] = ["epa", "sr", "explosive"];

function addPair(a: Pair, b: Pair): Pair {
  return [a[0] + b[0], a[1] + b[1]];
}

function totalsFor(entry: TeamPerformanceSeasonEntry): TeamTotals {
  const zero: Pair = [0, 0];
  const offense: Record<Family, Pair> = { epa: zero, sr: zero, explosive: zero };
  const allowed: Record<Family, Pair> = { epa: zero, sr: zero, explosive: zero };
  let margin = 0;
  for (const game of entry.games) {
    margin += game.margin;
    for (const family of FAMILIES) {
      offense[family] = addPair(offense[family], pairOf(game.offense, family));
      allowed[family] = addPair(allowed[family], pairOf(game.defenseAllowed, family));
    }
  }
  return { games: entry.games.length, margin, offense, allowed };
}

/**
 * The opponent's comparison value for ONE of this team's games, computed over
 * the opponent's OTHER games. Returns `leagueMean` (i.e. contributes zero
 * adjustment) when the opponent has no other evidence — the one-game case —
 * or is absent from the board entirely.
 *
 * `own` is this team's evidence for the game being excluded: the opponent's
 * defense-allowed in that game equals this team's offense there, and the
 * opponent's offense equals this team's defense-allowed.
 */
function comparisonExcludingGame(
  kind: { side: "offense" | "defense"; family: Family } | "pointDifferential",
  game: TeamPerformanceGameEvidence,
  opponent: TeamTotals | undefined,
  leagueMean: number
): number {
  if (!opponent) return leagueMean;
  if (kind === "pointDifferential") {
    const remaining = opponent.games - 1;
    // The opponent's margin in this game is the negative of this team's margin.
    return remaining > 0 ? (opponent.margin + game.margin) / remaining : leagueMean;
  }
  const { side, family } = kind;
  // Offense is compared with the opponent's defense-allowed; defense with the opponent's offense.
  const totals = side === "offense" ? opponent.allowed[family] : opponent.offense[family];
  const excluded = pairOf(side === "offense" ? game.offense : game.defenseAllowed, family);
  const denominator = totals[1] - excluded[1];
  return denominator > 0 ? (totals[0] - excluded[0]) / denominator : leagueMean;
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export type PerformanceRatingRow = {
  team: string;
  offense: {
    epaPerPlayAdjusted: number | null;
    epaPerPlayZ: number | null;
    successRateAdjusted: number | null;
    successRateZ: number | null;
    explosiveRateAdjusted: number | null;
    explosiveRateZ: number | null;
    composite: number | null;
    compositeZ: number | null;
  };
  defense: {
    epaPerPlayAllowedAdjusted: number | null;
    epaPerPlayAllowedZ: number | null;
    successRateAllowedAdjusted: number | null;
    successRateAllowedZ: number | null;
    explosiveRateAllowedAdjusted: number | null;
    explosiveRateAllowedZ: number | null;
    composite: number | null;
    compositeZ: number | null;
  };
  pointDifferential: {
    /** RAW mean game margin per game. This is the value the rating actually uses. */
    raw: number;
    /**
     * LEGACY DIAGNOSTIC ONLY — NOT used by the rating (v1.2.0). The v1.1.0 leave-one-out PD adjustment,
     * unchanged and still wrong-signed (`raw - (opponentPD - league)`). Kept so the artifact shape is stable.
     */
    adjusted: number | null;
    /** z-score of `raw` across the league. This is the PD component of the composite. */
    z: number | null;
  };
  overallComposite: number | null;
  offensePerformanceRating: number | null;
  defensePerformanceRating: number | null;
  performanceRating: number | null;
  offensePerformanceRank: number | null;
  defensePerformanceRank: number | null;
  performanceRank: number | null;
};

export type PerformanceRatingBoard = {
  rows: PerformanceRatingRow[];
  scaleDivisors: typeof PERFORMANCE_SCALE_DIVISORS;
  opponentAdjustment: typeof NFL_OPPONENT_ADJUSTMENT_METHOD;
};

function toPublicRating(compositeZ: number | null, divisor: number): number | null {
  if (!isFiniteNumber(compositeZ) || !isFiniteNumber(divisor) || divisor === 0) return null;
  const unitZ = compositeZ / divisor;
  const unbounded = PERFORMANCE_PUBLIC_SCALE.center + PERFORMANCE_PUBLIC_SCALE.standardDeviation * unitZ;
  if (!isFiniteNumber(unbounded)) return null;
  return Math.max(PERFORMANCE_PUBLIC_SCALE.minimum, Math.min(PERFORMANCE_PUBLIC_SCALE.maximum, unbounded));
}

/**
 * Build the full-season Performance Rating board (OFF/DEF/Overall, 1-99
 * scale, ranks) from already-aggregated full-season team metrics and the
 * per-game evidence they came from. Never fetches, never mutates its inputs.
 *
 * Throws when an entry's `games` do not match its `metrics.gamesPlayed`: a
 * leave-one-out comparison against a mismatched sample would be silently wrong.
 */
export function buildPerformanceRatingBoard(entries: readonly TeamPerformanceSeasonEntry[]): PerformanceRatingBoard {
  for (const entry of entries) {
    if (entry.games.length !== entry.metrics.gamesPlayed) {
      throw new Error(
        `buildPerformanceRatingBoard: ${entry.team} has ${entry.games.length} game(s) of evidence but metrics.gamesPlayed=${entry.metrics.gamesPlayed}`
      );
    }
  }

  const totalsByTeam = new Map(entries.map((e) => [e.team, totalsFor(e)]));
  const pointDiffRaw = entries.map((e) => (e.games.length > 0 ? totalsByTeam.get(e.team)!.margin / e.games.length : null));

  const offEpaRaw = entries.map((e) => e.metrics.offense.filtered.epaPerPlay);
  const offSrRaw = entries.map((e) => e.metrics.offense.filtered.successRate);
  const offExpRaw = entries.map((e) => e.metrics.offense.all.explosiveRate);
  const defEpaRaw = entries.map((e) => e.metrics.defenseAllowed.filtered.epaPerPlay);
  const defSrRaw = entries.map((e) => e.metrics.defenseAllowed.filtered.successRate);
  const defExpRaw = entries.map((e) => e.metrics.defenseAllowed.all.explosiveRate);

  const leagueOffEpa = leagueMeanAndStandardDeviation(offEpaRaw);
  const leagueOffSr = leagueMeanAndStandardDeviation(offSrRaw);
  const leagueOffExp = leagueMeanAndStandardDeviation(offExpRaw);
  const leagueDefEpa = leagueMeanAndStandardDeviation(defEpaRaw);
  const leagueDefSr = leagueMeanAndStandardDeviation(defSrRaw);
  const leagueDefExp = leagueMeanAndStandardDeviation(defExpRaw);
  const leaguePointDiff = leagueMeanAndStandardDeviation(pointDiffRaw);

  /** raw - (mean opponent comparison excluding the game - league comparison mean). Null when raw or the league mean is unavailable. */
  function adjust(
    entry: TeamPerformanceSeasonEntry,
    raw: number | null,
    kind: { side: "offense" | "defense"; family: Family } | "pointDifferential",
    leagueComparisonMean: number | null
  ): number | null {
    if (!isFiniteNumber(raw) || !isFiniteNumber(leagueComparisonMean) || entry.games.length === 0) return null;
    const comparisons = entry.games.map((game) =>
      comparisonExcludingGame(kind, game, totalsByTeam.get(game.opponent), leagueComparisonMean)
    );
    const mean = comparisons.reduce((sum, v) => sum + v, 0) / comparisons.length;
    return raw - (mean - leagueComparisonMean);
  }

  const adjusted = entries.map((entry, i) => {
    const offEpaAdj = adjust(entry, offEpaRaw[i], { side: "offense", family: "epa" }, leagueDefEpa?.mean ?? null);
    const offSrAdj = adjust(entry, offSrRaw[i], { side: "offense", family: "sr" }, leagueDefSr?.mean ?? null);
    const offExpAdj = adjust(entry, offExpRaw[i], { side: "offense", family: "explosive" }, leagueDefExp?.mean ?? null);
    const defEpaAdj = adjust(entry, defEpaRaw[i], { side: "defense", family: "epa" }, leagueOffEpa?.mean ?? null);
    const defSrAdj = adjust(entry, defSrRaw[i], { side: "defense", family: "sr" }, leagueOffSr?.mean ?? null);
    const defExpAdj = adjust(entry, defExpRaw[i], { side: "defense", family: "explosive" }, leagueOffExp?.mean ?? null);
    const pointDiffAdj = adjust(entry, pointDiffRaw[i], "pointDifferential", leaguePointDiff?.mean ?? null);
    return { team: entry.team, offEpaAdj, offSrAdj, offExpAdj, defEpaAdj, defSrAdj, defExpAdj, pointDiffAdj };
  });

  const leagueOffEpaAdj = leagueMeanAndStandardDeviation(adjusted.map((a) => a.offEpaAdj));
  const leagueOffSrAdj = leagueMeanAndStandardDeviation(adjusted.map((a) => a.offSrAdj));
  const leagueOffExpAdj = leagueMeanAndStandardDeviation(adjusted.map((a) => a.offExpAdj));
  const leagueDefEpaAdj = leagueMeanAndStandardDeviation(adjusted.map((a) => a.defEpaAdj));
  const leagueDefSrAdj = leagueMeanAndStandardDeviation(adjusted.map((a) => a.defSrAdj));
  const leagueDefExpAdj = leagueMeanAndStandardDeviation(adjusted.map((a) => a.defExpAdj));

  const composites = adjusted.map((a, i) => {
    const offEpaZ = stableZScore(a.offEpaAdj, leagueOffEpaAdj);
    const offSrZ = stableZScore(a.offSrAdj, leagueOffSrAdj);
    const offExpZ = stableZScore(a.offExpAdj, leagueOffExpAdj);
    const defEpaZ = stableZScore(a.defEpaAdj, leagueDefEpaAdj);
    const defSrZ = stableZScore(a.defSrAdj, leagueDefSrAdj);
    const defExpZ = stableZScore(a.defExpAdj, leagueDefExpAdj);
    // v1.2.0: the PD component is the z-score of RAW point differential per game (league statistics over the raw values).
    // `a.pointDiffAdj` is a legacy diagnostic and deliberately does not enter the rating.
    const pointDiffZ = stableZScore(pointDiffRaw[i], leaguePointDiff);

    const offComponents = [offEpaZ, offSrZ, offExpZ];
    const offComposite = offComponents.every(isFiniteNumber)
      ? offComponents.reduce((s, v) => s + v, 0) / offComponents.length
      : null;

    // Defense: lower allowed EPA/SR/Explosive is better, so invert each z before averaging.
    const defComponents = [defEpaZ, defSrZ, defExpZ].map((z) => (isFiniteNumber(z) ? -z : null));
    const defComposite = defComponents.every(isFiniteNumber)
      ? (defComponents as number[]).reduce((s, v) => s + v, 0) / defComponents.length
      : null;

    return { offEpaZ, offSrZ, offExpZ, defEpaZ, defSrZ, defExpZ, pointDiffZ, offComposite, defComposite };
  });

  const leagueOffComposite = leagueMeanAndStandardDeviation(composites.map((c) => c.offComposite));
  const leagueDefComposite = leagueMeanAndStandardDeviation(composites.map((c) => c.defComposite));

  const rows: PerformanceRatingRow[] = entries.map((entry, i) => {
    const a = adjusted[i];
    const c = composites[i];
    const offCompositeZ = stableZScore(c.offComposite, leagueOffComposite);
    const defCompositeZ = stableZScore(c.defComposite, leagueDefComposite);

    const overallComponents: [number | null, number][] = [
      [offCompositeZ, PERFORMANCE_OVERALL_WEIGHTS.offense],
      [defCompositeZ, PERFORMANCE_OVERALL_WEIGHTS.defense],
      [c.pointDiffZ, PERFORMANCE_OVERALL_WEIGHTS.pointDifferential],
    ];
    const overallComposite = overallComponents.every(([v]) => isFiniteNumber(v))
      ? overallComponents.reduce((sum, [v, w]) => sum + (v as number) * w, 0)
      : null;

    return {
      team: entry.team,
      offense: {
        epaPerPlayAdjusted: a.offEpaAdj,
        epaPerPlayZ: c.offEpaZ,
        successRateAdjusted: a.offSrAdj,
        successRateZ: c.offSrZ,
        explosiveRateAdjusted: a.offExpAdj,
        explosiveRateZ: c.offExpZ,
        composite: c.offComposite,
        compositeZ: offCompositeZ,
      },
      defense: {
        epaPerPlayAllowedAdjusted: a.defEpaAdj,
        epaPerPlayAllowedZ: c.defEpaZ,
        successRateAllowedAdjusted: a.defSrAdj,
        successRateAllowedZ: c.defSrZ,
        explosiveRateAllowedAdjusted: a.defExpAdj,
        explosiveRateAllowedZ: c.defExpZ,
        composite: c.defComposite,
        compositeZ: defCompositeZ,
      },
      pointDifferential: {
        raw: pointDiffRaw[i] ?? 0,
        adjusted: a.pointDiffAdj,
        z: c.pointDiffZ,
      },
      overallComposite,
      offensePerformanceRating: toPublicRating(offCompositeZ, PERFORMANCE_SCALE_DIVISORS.offense),
      defensePerformanceRating: toPublicRating(defCompositeZ, PERFORMANCE_SCALE_DIVISORS.defense),
      performanceRating: toPublicRating(overallComposite, PERFORMANCE_SCALE_DIVISORS.overall),
      offensePerformanceRank: null,
      defensePerformanceRank: null,
      performanceRank: null,
    };
  });

  const offRanks = rankByDescending(
    rows.filter((r) => r.offensePerformanceRating !== null).map((r) => ({ key: r.team, value: r.offensePerformanceRating as number, name: r.team, teamId: r.team }))
  );
  const defRanks = rankByDescending(
    rows.filter((r) => r.defensePerformanceRating !== null).map((r) => ({ key: r.team, value: r.defensePerformanceRating as number, name: r.team, teamId: r.team }))
  );
  const overallRanks = rankByDescending(
    rows.filter((r) => r.performanceRating !== null).map((r) => ({ key: r.team, value: r.performanceRating as number, name: r.team, teamId: r.team }))
  );

  for (const row of rows) {
    row.offensePerformanceRank = offRanks.get(row.team) ?? null;
    row.defensePerformanceRank = defRanks.get(row.team) ?? null;
    row.performanceRank = overallRanks.get(row.team) ?? null;
  }

  return { rows, scaleDivisors: PERFORMANCE_SCALE_DIVISORS, opponentAdjustment: NFL_OPPONENT_ADJUSTMENT_METHOD };
}
