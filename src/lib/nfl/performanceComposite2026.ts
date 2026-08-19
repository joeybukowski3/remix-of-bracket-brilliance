/**
 * Performance Rating engine (Phase 5) — composite + 1-99 public scale.
 *
 * Consumes the full 9+9 metric bundle from performanceMetricsCore2026.ts but
 * the APPROVED composite (Model C from the 2026 Performance Model Backtest)
 * uses only 3 candidates per side, equal-weighted:
 *
 *   OFF Performance = mean( z(EPA/Play), z(Traditional Success Rate), z(Explosive Rate) )
 *   DEF Performance = mean( z(-EPA/Play Allowed), z(-Success Rate Allowed), z(-Explosive Rate Allowed) )
 *   Overall Performance = 0.40 * OFF + 0.40 * DEF + 0.20 * z(opponent-adjusted Point Differential/Game)
 *
 * All other 6 offense + 6 defense metrics (Points/Drive, Early Down,
 * Passing/Rushing Efficiency, Third-Down Performance, Sack Rate, and the
 * EPA>0 diagnostic) remain fully computable via performanceMetricsCore2026.ts
 * but do NOT enter this composite — the backtest found they add no
 * out-of-sample predictive value once EPA + SR + Explosive are present
 * (Points/Drive is r=0.96 collinear with EPA/Play; the rest tested flat-to-
 * negative marginal lift). Display-only, by design.
 *
 * GARBAGE-TIME FILTER TREATMENT (backtest §6/§22 — empirically decided, not
 * assumed): EPA/Play and Success Rate use the garbage-time-FILTERED bundle
 * (`offense.filtered` / `defenseAllowed.filtered`); Explosive Rate uses the
 * UNFILTERED bundle (`offense.all` / `defenseAllowed.all`) because filtering
 * measurably hurt its out-of-sample predictive power in the backtest.
 *
 * OPPONENT ADJUSTMENT (backtest §7/§21): applied ONLY at full-season
 * granularity, mirroring the proven scripts/lib/nfl-power-v03-metrics.mjs
 * method exactly (adjusted = raw - (opponentMean - leagueMean), computed
 * against the *comparison* side — offense adjusts by opponents' matching
 * defense-allowed metric, defense adjusts by opponents' matching offense
 * metric, point differential adjusts by opponents' own point differential).
 * The backtest found this same adjustment measurably *hurt* predictive power
 * at half-season (9-game) granularity, so it is intentionally NOT offered
 * here for L4/L8 windows — this module only opponent-adjusts full-season
 * input. Callers building L4/L8 boards should pass raw (unadjusted) metrics
 * and skip buildPerformanceRatingBoard for those windows.
 *
 * 1-99 SCALE: same formula family as v0.3.1
 * (`50 + 15 * (compositeZ / pooledDivisor)`, clamped [1, 99] — see
 * scripts/lib/nfl-power-v03-metrics.mjs toPublicRating /
 * src/lib/nfl/v03Review.ts publicScaleEquivalent). The three divisors below
 * are refit from the real 2023-2025 historical composite distribution (96
 * team-seasons) via scripts/analysis/nfl-performance-backtest/fit-scale.mjs,
 * not guessed: each is the empirical population standard deviation of its
 * own composite, so by construction the pooled historical distribution has
 * mean exactly 50 and standard deviation exactly 15, with zero seasons
 * clamped at 1 or 99 across 2023-2025.
 */

import type { TeamPerformanceMetrics } from "@/lib/nfl/performanceMetricsCore2026";
import { rankByDescending } from "@/lib/nfl/publicPowerRatings";

/** Fitted 2026-08-18 from 2023-2025 nflverse play-by-play (96 team-seasons). Do not hand-tune. */
export const PERFORMANCE_SCALE_DIVISORS = Object.freeze({
  offense: 0.9248507883569935,
  defense: 0.8648390483639914,
  overall: 0.7224159319378768,
});

export const PERFORMANCE_PUBLIC_SCALE = Object.freeze({
  center: 50,
  standardDeviation: 15,
  minimum: 1,
  maximum: 99,
});

export const PERFORMANCE_OVERALL_WEIGHTS = Object.freeze({
  offense: 0.4,
  defense: 0.4,
  pointDifferential: 0.2,
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

/** v0.3.1-style opponent adjustment: raw minus (opponent mean minus league mean) of the comparison metric. */
function adjustForOpponents(
  raw: number | null,
  opponentComparisonValues: readonly (number | null)[],
  leagueComparisonMean: number | null
): number | null {
  if (!isFiniteNumber(raw) || !isFiniteNumber(leagueComparisonMean)) return null;
  const finiteOpponents = opponentComparisonValues.filter(isFiniteNumber);
  if (finiteOpponents.length === 0) return null;
  const opponentMean = finiteOpponents.reduce((sum, v) => sum + v, 0) / finiteOpponents.length;
  return raw - (opponentMean - leagueComparisonMean);
}

/** One team's full-season input: its own metrics, the opponents it faced, and its raw point differential/game. */
export type TeamPerformanceSeasonEntry = {
  team: string;
  metrics: TeamPerformanceMetrics;
  /** One team code per game played this season (duplicates for rematches expected). */
  opponents: readonly string[];
  pointDifferentialPerGame: number;
};

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
    raw: number;
    adjusted: number | null;
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
 * scale, ranks) from already-aggregated full-season team metrics. Never
 * fetches, never mutates its inputs.
 */
export function buildPerformanceRatingBoard(entries: readonly TeamPerformanceSeasonEntry[]): PerformanceRatingBoard {
  const byTeam = new Map(entries.map((e) => [e.team, e]));

  const offEpaRaw = entries.map((e) => e.metrics.offense.filtered.epaPerPlay);
  const offSrRaw = entries.map((e) => e.metrics.offense.filtered.successRate);
  const offExpRaw = entries.map((e) => e.metrics.offense.all.explosiveRate);
  const defEpaRaw = entries.map((e) => e.metrics.defenseAllowed.filtered.epaPerPlay);
  const defSrRaw = entries.map((e) => e.metrics.defenseAllowed.filtered.successRate);
  const defExpRaw = entries.map((e) => e.metrics.defenseAllowed.all.explosiveRate);
  const pointDiffRaw = entries.map((e) => e.pointDifferentialPerGame);

  const leagueOffEpa = leagueMeanAndStandardDeviation(offEpaRaw);
  const leagueOffSr = leagueMeanAndStandardDeviation(offSrRaw);
  const leagueOffExp = leagueMeanAndStandardDeviation(offExpRaw);
  const leagueDefEpa = leagueMeanAndStandardDeviation(defEpaRaw);
  const leagueDefSr = leagueMeanAndStandardDeviation(defSrRaw);
  const leagueDefExp = leagueMeanAndStandardDeviation(defExpRaw);
  const leaguePointDiff = leagueMeanAndStandardDeviation(pointDiffRaw);

  function opponentValues(team: string, pick: (m: TeamPerformanceMetrics) => number | null): (number | null)[] {
    const entry = byTeam.get(team);
    if (!entry) return [];
    return entry.opponents.map((opp) => {
      const oppEntry = byTeam.get(opp);
      return oppEntry ? pick(oppEntry.metrics) : null;
    });
  }

  const adjusted = entries.map((entry) => {
    const offEpaAdj = adjustForOpponents(
      entry.metrics.offense.filtered.epaPerPlay,
      opponentValues(entry.team, (m) => m.defenseAllowed.filtered.epaPerPlay),
      leagueDefEpa?.mean ?? null
    );
    const offSrAdj = adjustForOpponents(
      entry.metrics.offense.filtered.successRate,
      opponentValues(entry.team, (m) => m.defenseAllowed.filtered.successRate),
      leagueDefSr?.mean ?? null
    );
    const offExpAdj = adjustForOpponents(
      entry.metrics.offense.all.explosiveRate,
      opponentValues(entry.team, (m) => m.defenseAllowed.all.explosiveRate),
      leagueDefExp?.mean ?? null
    );
    const defEpaAdj = adjustForOpponents(
      entry.metrics.defenseAllowed.filtered.epaPerPlay,
      opponentValues(entry.team, (m) => m.offense.filtered.epaPerPlay),
      leagueOffEpa?.mean ?? null
    );
    const defSrAdj = adjustForOpponents(
      entry.metrics.defenseAllowed.filtered.successRate,
      opponentValues(entry.team, (m) => m.offense.filtered.successRate),
      leagueOffSr?.mean ?? null
    );
    const defExpAdj = adjustForOpponents(
      entry.metrics.defenseAllowed.all.explosiveRate,
      opponentValues(entry.team, (m) => m.offense.all.explosiveRate),
      leagueOffExp?.mean ?? null
    );
    const opponentPointDiffs = entry.opponents.map((opp) => byTeam.get(opp)?.pointDifferentialPerGame ?? null);
    const pointDiffAdj = adjustForOpponents(entry.pointDifferentialPerGame, opponentPointDiffs, leaguePointDiff?.mean ?? null);
    return { team: entry.team, offEpaAdj, offSrAdj, offExpAdj, defEpaAdj, defSrAdj, defExpAdj, pointDiffAdj };
  });

  const leagueOffEpaAdj = leagueMeanAndStandardDeviation(adjusted.map((a) => a.offEpaAdj));
  const leagueOffSrAdj = leagueMeanAndStandardDeviation(adjusted.map((a) => a.offSrAdj));
  const leagueOffExpAdj = leagueMeanAndStandardDeviation(adjusted.map((a) => a.offExpAdj));
  const leagueDefEpaAdj = leagueMeanAndStandardDeviation(adjusted.map((a) => a.defEpaAdj));
  const leagueDefSrAdj = leagueMeanAndStandardDeviation(adjusted.map((a) => a.defSrAdj));
  const leagueDefExpAdj = leagueMeanAndStandardDeviation(adjusted.map((a) => a.defExpAdj));
  const leaguePointDiffAdj = leagueMeanAndStandardDeviation(adjusted.map((a) => a.pointDiffAdj));

  const composites = adjusted.map((a) => {
    const offEpaZ = stableZScore(a.offEpaAdj, leagueOffEpaAdj);
    const offSrZ = stableZScore(a.offSrAdj, leagueOffSrAdj);
    const offExpZ = stableZScore(a.offExpAdj, leagueOffExpAdj);
    const defEpaZ = stableZScore(a.defEpaAdj, leagueDefEpaAdj);
    const defSrZ = stableZScore(a.defSrAdj, leagueDefSrAdj);
    const defExpZ = stableZScore(a.defExpAdj, leagueDefExpAdj);
    const pointDiffZ = stableZScore(a.pointDiffAdj, leaguePointDiffAdj);

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
        raw: entry.pointDifferentialPerGame,
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

  return { rows, scaleDivisors: PERFORMANCE_SCALE_DIVISORS };
}
