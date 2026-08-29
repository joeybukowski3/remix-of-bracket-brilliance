/**
 * Comparative overall ratings for the /nfl/power-ratings board: EPA Overall,
 * YPP Overall, Success Overall, plus period Strength of Schedule.
 *
 * These are new *display* ratings layered on top of values the repo already
 * computes — they never change an underlying EPA, yards-per-play or success
 * calculation. Each is built the same way, from the exact games of the selected
 * period:
 *
 *   1. offense value  (higher is better)  and defense-allowed value
 *   2. league z-score of each, over the teams that have both values
 *   3. defensive z is negated (a lower allowed value is a better defense)
 *   4. combined = mean(zOffense, zDefenseInverted)          — a 50/50 blend
 *   5. rating   = 50 + 15 * (combined / stdev(combined))    — repo public-scale
 *                 convention (cf. team-performance-analytics scaleDivisors),
 *                 clamped to [1, 99]
 *   6. rank 1..N by the unrounded `combined`, ties broken by abbreviation
 *
 * A team missing either the offense or the defense input gets `null` — never a
 * zero, never a substituted league-average. Ranks are dense over the rated
 * teams only.
 *
 * Strength of Schedule (decision 7): the opponent-strength yardstick is this
 * feature's own period EPA Overall rank, not JKB OVR — that is the one overall
 * rank available for all three periods from the identical game window. SoS is
 * the mean of a team's period opponents' EPA Overall ranks (one entry per game
 * played, repeat opponents counted per game); lower mean = harder schedule =
 * SoS rank 1. SoS is display-only and is never fed back into any rating.
 */

const RATING_SCALE = { min: 1, max: 99, center: 50, spread: 15 } as const;

export type OverallRating = {
  /** Clamped [1, 99] public-scale rating, higher is better. */
  value: number;
  /** 1..N over rated teams, 1 = best. */
  rank: number;
  /** Unrounded combined z, exposed for SoS / auditing. */
  combined: number;
};

export type SosRating = {
  /** Mean EPA Overall rank of period opponents. Lower = harder. */
  avgOpponentRank: number;
  /** 1..N, 1 = hardest schedule. */
  rank: number;
  /** Opponent games actually averaged (opponent had a rated EPA Overall). */
  ratedGames: number;
};

function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdev(values: readonly number[], meanValue: number): number {
  if (values.length === 0) return 0;
  const variance = values.reduce((sum, v) => sum + (v - meanValue) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function clampRating(value: number): number {
  return Math.max(RATING_SCALE.min, Math.min(RATING_SCALE.max, value));
}

/** Deterministic dense ranking, descending by value, ties broken by key. */
function rankDescending(byKey: ReadonlyMap<string, number>): Map<string, number> {
  const sorted = [...byKey.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const ranks = new Map<string, number>();
  sorted.forEach(([key], index) => ranks.set(key, index + 1));
  return ranks;
}

/** Deterministic dense ranking, ascending by value, ties broken by key. */
function rankAscending(byKey: ReadonlyMap<string, number>): Map<string, number> {
  const sorted = [...byKey.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  const ranks = new Map<string, number>();
  sorted.forEach(([key], index) => ranks.set(key, index + 1));
  return ranks;
}

/**
 * Build one overall rating map from an offense value map and a
 * defense-allowed value map. `defenseLowerIsBetter` is true for every metric
 * this board uses (EPA allowed, yards/play allowed, success rate allowed).
 */
export function buildOverallRatings(
  offenseByAbbr: ReadonlyMap<string, number | null | undefined>,
  defenseByAbbr: ReadonlyMap<string, number | null | undefined>,
  options: { defenseLowerIsBetter: boolean }
): Map<string, OverallRating | null> {
  const result = new Map<string, OverallRating | null>();

  const finite = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

  const abbrs = new Set<string>([...offenseByAbbr.keys(), ...defenseByAbbr.keys()]);
  const eligible: string[] = [];
  for (const abbr of abbrs) {
    if (finite(offenseByAbbr.get(abbr)) && finite(defenseByAbbr.get(abbr))) eligible.push(abbr);
    else result.set(abbr, null);
  }
  if (eligible.length === 0) return result;

  const offValues = eligible.map((abbr) => offenseByAbbr.get(abbr) as number);
  const defValues = eligible.map((abbr) => defenseByAbbr.get(abbr) as number);
  const offMean = mean(offValues);
  const defMean = mean(defValues);
  const offSd = stdev(offValues, offMean);
  const defSd = stdev(defValues, defMean);

  const combinedByAbbr = new Map<string, number>();
  eligible.forEach((abbr) => {
    const zOff = offSd === 0 ? 0 : ((offenseByAbbr.get(abbr) as number) - offMean) / offSd;
    let zDef = defSd === 0 ? 0 : ((defenseByAbbr.get(abbr) as number) - defMean) / defSd;
    if (options.defenseLowerIsBetter) zDef = -zDef;
    combinedByAbbr.set(abbr, (zOff + zDef) / 2);
  });

  const combinedValues = [...combinedByAbbr.values()];
  const combinedMean = mean(combinedValues);
  const combinedSd = stdev(combinedValues, combinedMean);
  const ranks = rankDescending(combinedByAbbr);

  for (const abbr of eligible) {
    const combined = combinedByAbbr.get(abbr) as number;
    const value =
      combinedSd === 0
        ? RATING_SCALE.center
        : clampRating(RATING_SCALE.center + RATING_SCALE.spread * (combined / combinedSd));
    result.set(abbr, { value, rank: ranks.get(abbr) as number, combined });
  }
  return result;
}

/**
 * Period Strength of Schedule.
 *
 * @param epaOverallRankByAbbr  EPA Overall rank for the SAME period.
 * @param opponentsByAbbr       one opponent abbr per completed period game
 *                              (repeats kept — a doubleheader counts twice).
 */
export function buildSosBoard(
  epaOverallRankByAbbr: ReadonlyMap<string, number>,
  opponentsByAbbr: ReadonlyMap<string, readonly string[]>
): Map<string, SosRating | null> {
  const avgByAbbr = new Map<string, number>();
  const ratedByAbbr = new Map<string, number>();

  for (const [abbr, opponents] of opponentsByAbbr) {
    let total = 0;
    let rated = 0;
    for (const opponent of opponents) {
      const rank = epaOverallRankByAbbr.get(opponent);
      if (rank === undefined) continue;
      total += rank;
      rated += 1;
    }
    if (rated === 0) continue;
    avgByAbbr.set(abbr, total / rated);
    ratedByAbbr.set(abbr, rated);
  }

  const ranks = rankAscending(avgByAbbr);
  const result = new Map<string, SosRating | null>();
  for (const abbr of opponentsByAbbr.keys()) {
    const avg = avgByAbbr.get(abbr);
    if (avg === undefined) {
      result.set(abbr, null);
      continue;
    }
    result.set(abbr, {
      avgOpponentRank: avg,
      rank: ranks.get(abbr) as number,
      ratedGames: ratedByAbbr.get(abbr) as number,
    });
  }
  return result;
}
