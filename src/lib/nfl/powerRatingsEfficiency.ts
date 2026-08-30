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

/* ------------------------------------------------------------------ *
 * Last 8 Form Rating
 * ------------------------------------------------------------------ *
 *
 * A recent-form efficiency composite that ONLY applies to the Last 8 view of
 * /nfl/power-ratings. It never touches the 2025 v0.3.1 board, the 2026
 * currentRating2026 board, the JKB power formula, or any projected-spread /
 * betting model — those keep their own OFF/DEF/OVR untouched.
 *
 * It measures recent two-way efficiency only. It deliberately excludes SoS,
 * record, point differential, market data, preseason rating, 2025 JKB OVR and
 * the 2026 projection — the function signature has no channel for any of them.
 *
 * Pipeline, per side (offense / defense):
 *   1. component rating for each metric family (EPA, YPP, Success):
 *        z      = (value - leagueMean) / leaguePopulationStdev
 *        rating = clamp(50 + 15 * z, 1, 99)               — repo public scale
 *      defensive metrics ("allowed") are direction-inverted BEFORE the rating
 *      so that higher always means better defense.
 *   2. side composite = weighted sum of the component ratings:
 *        full mode    EPA .40 · YPP .30 · Success .30
 *        reduced mode EPA .60 · YPP .40        (Success unavailable, see below)
 *   3. OVR composite = 0.50 · OFF + 0.50 · DEF
 *   4. rank #1..#N league-wide from each unrounded composite (higher = better),
 *      ties broken by abbreviation.
 *
 * Reduced mode: today the Last-8 sample is entirely 2025, so RBSDM Success is a
 * valid Last-8 number. Once 2026 games begin, RBSDM cannot express a per-team
 * cross-season rolling Last-8 Success sample. Rather than silently fold a stale
 * 2025-only Success into the composite, the caller passes `successAvailable:
 * false` and the weights drop to the documented EPA/YPP split. `method` is
 * surfaced so the UI can explain which mode produced the rating.
 *
 * Missing raw inputs stay missing: a team without a finite EPA or YPP value for
 * a side gets `null` for that side (and for OVR) — never a zero, never a
 * league-average substitute.
 */

export const LAST8_FORM_WEIGHTS_FULL = { epa: 0.4, ypp: 0.3, success: 0.3 } as const;
export const LAST8_FORM_WEIGHTS_REDUCED = { epa: 0.6, ypp: 0.4 } as const;
export const LAST8_FORM_OVR_WEIGHTS = { off: 0.5, def: 0.5 } as const;

export type Last8FormMethod = "epa-ypp-success" | "epa-ypp";

export type FormSide = {
  /** Clamped [1, 99] public-scale composite, higher is better. Unrounded. */
  rating: number;
  /** 1..N over rated teams for this side, 1 = best. */
  rank: number;
};

export type Last8FormRating = {
  off: FormSide | null;
  def: FormSide | null;
  ovr: FormSide | null;
  method: Last8FormMethod;
};

export type Last8FormInputs = {
  offEpaPerPlay: ReadonlyMap<string, number | null | undefined>;
  defEpaPerPlayAllowed: ReadonlyMap<string, number | null | undefined>;
  offYardsPerPlay: ReadonlyMap<string, number | null | undefined>;
  defYardsPerPlayAllowed: ReadonlyMap<string, number | null | undefined>;
  offSuccessRate: ReadonlyMap<string, number | null | undefined>;
  defSuccessRateAllowed: ReadonlyMap<string, number | null | undefined>;
};

/** One metric family -> per-team public-scale component rating (higher better). */
function componentRatingMap(
  byAbbr: ReadonlyMap<string, number | null | undefined>,
  lowerIsBetter: boolean
): Map<string, number> {
  const finite = [...byAbbr.entries()].filter(
    (entry): entry is [string, number] =>
      typeof entry[1] === "number" && Number.isFinite(entry[1])
  );
  const out = new Map<string, number>();
  if (finite.length === 0) return out;

  const values = finite.map(([, v]) => v);
  const m = mean(values);
  const sd = stdev(values, m);
  for (const [abbr, v] of finite) {
    let z = sd === 0 ? 0 : (v - m) / sd;
    if (lowerIsBetter) z = -z;
    out.set(abbr, clampRating(RATING_SCALE.center + RATING_SCALE.spread * z));
  }
  return out;
}

/** Weighted side composite over teams with every required component rating. */
function sideComposite(
  abbrs: Iterable<string>,
  epa: ReadonlyMap<string, number>,
  ypp: ReadonlyMap<string, number>,
  success: ReadonlyMap<string, number> | null
): Map<string, number> {
  const composite = new Map<string, number>();
  for (const abbr of abbrs) {
    const epaRating = epa.get(abbr);
    const yppRating = ypp.get(abbr);
    if (epaRating === undefined || yppRating === undefined) continue;
    if (success) {
      const successRating = success.get(abbr);
      if (successRating === undefined) continue;
      const w = LAST8_FORM_WEIGHTS_FULL;
      composite.set(abbr, epaRating * w.epa + yppRating * w.ypp + successRating * w.success);
    } else {
      const w = LAST8_FORM_WEIGHTS_REDUCED;
      composite.set(abbr, epaRating * w.epa + yppRating * w.ypp);
    }
  }
  return composite;
}

/**
 * Build Last-8 Form ratings for every team present in `inputs`.
 *
 * @param options.successAvailable  false once the rolling Last-8 window crosses
 *        the season boundary and RBSDM Success no longer matches it — switches
 *        both sides to the documented EPA/YPP reduced weighting.
 */
export function buildLast8FormRatings(
  inputs: Last8FormInputs,
  options: { successAvailable: boolean }
): Map<string, Last8FormRating> {
  const method: Last8FormMethod = options.successAvailable ? "epa-ypp-success" : "epa-ypp";

  const offEpa = componentRatingMap(inputs.offEpaPerPlay, false);
  const offYpp = componentRatingMap(inputs.offYardsPerPlay, false);
  const offSuccess = options.successAvailable
    ? componentRatingMap(inputs.offSuccessRate, false)
    : null;
  const defEpa = componentRatingMap(inputs.defEpaPerPlayAllowed, true);
  const defYpp = componentRatingMap(inputs.defYardsPerPlayAllowed, true);
  const defSuccess = options.successAvailable
    ? componentRatingMap(inputs.defSuccessRateAllowed, true)
    : null;

  const abbrs = new Set<string>();
  for (const map of [
    inputs.offEpaPerPlay,
    inputs.defEpaPerPlayAllowed,
    inputs.offYardsPerPlay,
    inputs.defYardsPerPlayAllowed,
    inputs.offSuccessRate,
    inputs.defSuccessRateAllowed,
  ]) {
    for (const abbr of map.keys()) abbrs.add(abbr);
  }

  const offComposite = sideComposite(abbrs, offEpa, offYpp, offSuccess);
  const defComposite = sideComposite(abbrs, defEpa, defYpp, defSuccess);

  const ovrComposite = new Map<string, number>();
  for (const abbr of abbrs) {
    const off = offComposite.get(abbr);
    const def = defComposite.get(abbr);
    if (off === undefined || def === undefined) continue;
    ovrComposite.set(
      abbr,
      off * LAST8_FORM_OVR_WEIGHTS.off + def * LAST8_FORM_OVR_WEIGHTS.def
    );
  }

  const offRanks = rankDescending(offComposite);
  const defRanks = rankDescending(defComposite);
  const ovrRanks = rankDescending(ovrComposite);

  const side = (
    composite: ReadonlyMap<string, number>,
    ranks: ReadonlyMap<string, number>,
    abbr: string
  ): FormSide | null => {
    const rating = composite.get(abbr);
    if (rating === undefined) return null;
    return { rating, rank: ranks.get(abbr) as number };
  };

  const result = new Map<string, Last8FormRating>();
  for (const abbr of abbrs) {
    result.set(abbr, {
      off: side(offComposite, offRanks, abbr),
      def: side(defComposite, defRanks, abbr),
      ovr: side(ovrComposite, ovrRanks, abbr),
      method,
    });
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
