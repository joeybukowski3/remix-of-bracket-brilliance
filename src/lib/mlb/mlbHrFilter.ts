/**
 * mlbHrFilter.ts
 *
 * Sin City HR preset model and wind classification utility.
 *
 * Sin City: a pure batter-power preset. It evaluates only four core
 * hitter criteria and does not use wind, temperature, park factor,
 * pitcher data, or handedness for qualification.
 *
 * Wind classification is retained here for display context elsewhere
 * (park sidebar, angle tags) but plays no role in Sin City qualification.
 *
 * All percentage values are display-scale (e.g. barrelRate = 12.8 means
 * 12.8%, not 0.128). Missing values are treated as "not passing" with a
 * full normalized shortfall of 1 for that criterion.
 */

// ─── Wind classification (used by park context display, not by Sin City) ──────

export const CF_BEARING: Record<string, number> = {
  "Truist Park": 35,
  "Oriole Park at Camden Yards": 55,
  "Fenway Park": 95,
  "Wrigley Field": 45,
  "Guaranteed Rate Field": 5,
  "Great American Ball Park": 20,
  "Progressive Field": 30,
  "Coors Field": 15,
  "Comerica Park": 330,
  "Minute Maid Park": 25,
  "Kauffman Stadium": 10,
  "Dodger Stadium": 330,
  "Angel Stadium": 30,
  "loanDepot park": 20,
  "American Family Field": 5,
  "Target Field": 350,
  "Citi Field": 5,
  "Yankee Stadium": 25,
  "Oakland Coliseum": 350,
  "Citizens Bank Park": 40,
  "PNC Park": 355,
  "Petco Park": 340,
  "Oracle Park": 310,
  "T-Mobile Park": 350,
  "Busch Stadium": 5,
  "Tropicana Field": 0,
  "Globe Life Field": 350,
  "Rogers Centre": 15,
  "Nationals Park": 5,
  "Chase Field": 350,
};

const RETRACTABLE_PARKS = new Set([
  "Minute Maid Park",
  "loanDepot park",
  "American Family Field",
  "T-Mobile Park",
  "Globe Life Field",
  "Rogers Centre",
  "Chase Field",
  "Tropicana Field",
]);

const COMPASS: Record<string, number> = {
  N: 0,   NNE: 22.5, NE: 45,  ENE: 67.5,
  E: 90,  ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
  W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};

export type WindSignal = "out" | "in" | "cross" | "calm" | "unknown";

export function classifyWind(
  stadium: string,
  roofType: string,
  windDirection: string,
  windSpeed: number | null,
): WindSignal {
  if (roofType === "Dome") return "unknown";
  if (RETRACTABLE_PARKS.has(stadium) && roofType !== "Open") return "unknown";
  const speed = windSpeed ?? 0;
  if (speed < 4) return "calm";
  const cfBearing = CF_BEARING[stadium];
  if (cfBearing == null) return "unknown";
  const windDeg = COMPASS[(windDirection ?? "").toUpperCase()];
  if (windDeg == null) return "unknown";
  const diff = Math.abs(((windDeg - cfBearing) + 540) % 360 - 180);
  if (diff <= 60) return "out";
  if (diff >= 120) return "in";
  return "cross";
}

// ─── Sin City model ────────────────────────────────────────────────────────────

/** The four exact thresholds. Do not lower these. */
export const SIN_CITY_THRESHOLDS = {
  barrelRate:   12,   // Barrel% ≥ 12
  pullAirRate:  20,   // Pull Air% ≥ 20   (stored as row.pullRate)
  hardHitRate:  45,   // Hard Hit% ≥ 45
  exitVelo:     92,   // Exit Velocity ≥ 92 mph
} as const;

/** Minimum criteria count to qualify. */
export const SIN_CITY_MIN_CRITERIA = 3;

/** Max number of closest-match fallback rows shown. */
export const SIN_CITY_FALLBACK_COUNT = 5;

export type SinCityInput = {
  /** Barrel% in display scale (12.8 = 12.8%). null/undefined = missing. */
  barrelRate:  number | null | undefined;
  /** Pull Air% in display scale. null/undefined = missing. */
  pullAirRate: number | null | undefined;
  /** Hard Hit% in display scale. null/undefined = missing. */
  hardHitRate: number | null | undefined;
  /** Exit velocity in mph. null/undefined = missing. */
  exitVelo:    number | null | undefined;
};

export type SinCityCriterionResult = {
  name:       "Barrel%" | "Pull Air%" | "Hard Hit%" | "Exit Velo";
  value:      number | null;
  threshold:  number;
  pass:       boolean;
  /** Normalized shortfall for failed criteria. 1.0 when value is missing. */
  shortfall:  number;
};

export type SinCityEvaluation = {
  criteria:    SinCityCriterionResult[];
  matchCount:  number;   // 0–4
  qualifies:   boolean;  // matchCount >= SIN_CITY_MIN_CRITERIA
  totalShortfall: number; // sum of shortfalls for failed criteria only
};

/**
 * Evaluate a batter against Sin City criteria.
 * Missing values are treated as not passing, with a full shortfall of 1.
 */
export function evaluateSinCityHitter(input: SinCityInput): SinCityEvaluation {
  const t = SIN_CITY_THRESHOLDS;

  const criteria: SinCityCriterionResult[] = [
    {
      name:      "Barrel%",
      value:     input.barrelRate ?? null,
      threshold: t.barrelRate,
      pass:      (input.barrelRate ?? null) !== null && input.barrelRate! >= t.barrelRate,
      shortfall: (input.barrelRate ?? null) === null
        ? 1
        : Math.max(0, t.barrelRate - input.barrelRate!) / t.barrelRate,
    },
    {
      name:      "Pull Air%",
      value:     input.pullAirRate ?? null,
      threshold: t.pullAirRate,
      pass:      (input.pullAirRate ?? null) !== null && input.pullAirRate! >= t.pullAirRate,
      shortfall: (input.pullAirRate ?? null) === null
        ? 1
        : Math.max(0, t.pullAirRate - input.pullAirRate!) / t.pullAirRate,
    },
    {
      name:      "Hard Hit%",
      value:     input.hardHitRate ?? null,
      threshold: t.hardHitRate,
      pass:      (input.hardHitRate ?? null) !== null && input.hardHitRate! >= t.hardHitRate,
      shortfall: (input.hardHitRate ?? null) === null
        ? 1
        : Math.max(0, t.hardHitRate - input.hardHitRate!) / t.hardHitRate,
    },
    {
      name:      "Exit Velo",
      value:     input.exitVelo ?? null,
      threshold: t.exitVelo,
      pass:      (input.exitVelo ?? null) !== null && input.exitVelo! >= t.exitVelo,
      shortfall: (input.exitVelo ?? null) === null
        ? 1
        : Math.max(0, t.exitVelo - input.exitVelo!) / t.exitVelo,
    },
  ];

  const matchCount = criteria.filter(c => c.pass).length;
  const totalShortfall = criteria
    .filter(c => !c.pass)
    .reduce((sum, c) => sum + c.shortfall, 0);

  return {
    criteria,
    matchCount,
    qualifies: matchCount >= SIN_CITY_MIN_CRITERIA,
    totalShortfall,
  };
}

export type SinCityRow<T> = {
  batter:     T;
  evaluation: SinCityEvaluation;
  isFallback: boolean;
};

/**
 * Apply the Sin City model to a pre-filtered batter list.
 *
 * Filtering order the caller must already have applied:
 *   1. Game filter
 *   2. Text search
 * This function receives the already-filtered list and applies Sin City
 * qualification (or fallback) on top of it.
 *
 * Returns rows sorted by:
 *   Qualifiers:      matchCount desc → hrScore desc → barrelRate desc → hardHitRate desc → player asc
 *   Fallback (top 5): matchCount desc → totalShortfall asc → hrScore desc → player asc
 */
export function getSinCityResults<T extends {
  player: string;
  hrScore: number;
  barrelRate: number | null | undefined;
  hardHitRate: number | null | undefined;
  exitVelo: number | null | undefined;
  pullRate: number | null | undefined;
}>(batters: T[]): { rows: SinCityRow<T>[]; isFallback: boolean } {
  const evaluated = batters.map(b => ({
    batter: b,
    evaluation: evaluateSinCityHitter({
      barrelRate:  b.barrelRate,
      pullAirRate: b.pullRate,
      hardHitRate: b.hardHitRate,
      exitVelo:    b.exitVelo,
    }),
    isFallback: false,
  }));

  const qualifiers = evaluated.filter(r => r.evaluation.qualifies);

  if (qualifiers.length > 0) {
    qualifiers.sort((a, b) => {
      if (b.evaluation.matchCount !== a.evaluation.matchCount)
        return b.evaluation.matchCount - a.evaluation.matchCount;
      if (b.batter.hrScore !== a.batter.hrScore)
        return b.batter.hrScore - a.batter.hrScore;
      if ((b.batter.barrelRate ?? 0) !== (a.batter.barrelRate ?? 0))
        return (b.batter.barrelRate ?? 0) - (a.batter.barrelRate ?? 0);
      if ((b.batter.hardHitRate ?? 0) !== (a.batter.hardHitRate ?? 0))
        return (b.batter.hardHitRate ?? 0) - (a.batter.hardHitRate ?? 0);
      return a.batter.player.localeCompare(b.batter.player);
    });
    return { rows: qualifiers, isFallback: false };
  }

  // No qualifiers — show top-5 closest matches
  evaluated.sort((a, b) => {
    if (b.evaluation.matchCount !== a.evaluation.matchCount)
      return b.evaluation.matchCount - a.evaluation.matchCount;
    if (a.evaluation.totalShortfall !== b.evaluation.totalShortfall)
      return a.evaluation.totalShortfall - b.evaluation.totalShortfall;
    if (b.batter.hrScore !== a.batter.hrScore)
      return b.batter.hrScore - a.batter.hrScore;
    return a.batter.player.localeCompare(b.batter.player);
  });

  return {
    rows: evaluated.slice(0, SIN_CITY_FALLBACK_COUNT).map(r => ({ ...r, isFallback: true })),
    isFallback: true,
  };
}
