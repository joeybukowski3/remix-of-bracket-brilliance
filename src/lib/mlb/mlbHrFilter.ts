export const CF_BEARING: Record<string, number> = {
  "Truist Park": 35,
  "Oriole Park at Camden Yards": 55,
  "Fenway Park": 95,
  "Wrigley Field": 45,
  "Guaranteed Rate Field": 5,
  "Rate Field": 5,
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
  "Minute Maid Park", "loanDepot park", "American Family Field", "T-Mobile Park",
  "Globe Life Field", "Rogers Centre", "Chase Field", "Tropicana Field",
]);

const COMPASS: Record<string, number> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};

export type WindSignal = "out" | "in" | "cross" | "calm" | "unknown";

export function classifyWind(stadium: string, roofType: string, windDirection: string, windSpeed: number | null): WindSignal {
  if (roofType === "Dome") return "unknown";
  if (RETRACTABLE_PARKS.has(stadium) && roofType !== "Open") return "unknown";
  const speed = windSpeed ?? 0;
  if (speed < 4) return "calm";
  const cfBearing = CF_BEARING[stadium];
  const windDeg = COMPASS[(windDirection ?? "").toUpperCase()];
  if (cfBearing == null || windDeg == null) return "unknown";
  const diff = Math.abs(((windDeg - cfBearing) + 540) % 360 - 180);
  if (diff <= 60) return "out";
  if (diff >= 120) return "in";
  return "cross";
}

export const SIN_CITY_THRESHOLDS = {
  barrelRate: 12,
  pullAirRate: 20,
  hardHitRate: 45,
  exitVelo: 92,
  windSpeed: 8,
} as const;

export const SIN_CITY_MIN_CRITERIA = 3;
export const SIN_CITY_FALLBACK_COUNT = 5;

export type SinCityInput = {
  barrelRate: number | null | undefined;
  pullAirRate: number | null | undefined;
  hardHitRate: number | null | undefined;
  exitVelo: number | null | undefined;
  stadium?: string | null;
  roofType?: string | null;
  windDirection?: string | null;
  windSpeed?: number | null;
};

export type SinCityCriterionResult = {
  name: "Barrel%" | "Pull Air%" | "Hard Hit%" | "Exit Velo" | "Wind Out";
  value: number | null;
  threshold: number;
  pass: boolean;
  shortfall: number;
  detail?: string;
  windSignal?: WindSignal;
};

export type SinCityEvaluation = {
  criteria: SinCityCriterionResult[];
  matchCount: number;
  qualifies: boolean;
  totalShortfall: number;
};

function numericCriterion(name: SinCityCriterionResult["name"], value: number | null | undefined, threshold: number): SinCityCriterionResult {
  const resolved = value ?? null;
  return {
    name,
    value: resolved,
    threshold,
    pass: resolved !== null && resolved >= threshold,
    shortfall: resolved === null ? 1 : Math.max(0, threshold - resolved) / threshold,
  };
}

export function evaluateSinCityHitter(input: SinCityInput): SinCityEvaluation {
  const windSignal = classifyWind(
    input.stadium ?? "",
    input.roofType ?? "Unknown",
    input.windDirection ?? "",
    input.windSpeed ?? null,
  );
  const windSpeed = input.windSpeed ?? null;
  const windPass = windSignal === "out" && windSpeed !== null && windSpeed >= SIN_CITY_THRESHOLDS.windSpeed;
  const windShortfall = windSignal === "unknown"
    ? 1
    : windSignal !== "out"
      ? 1
      : windSpeed === null
        ? 1
        : Math.max(0, SIN_CITY_THRESHOLDS.windSpeed - windSpeed) / SIN_CITY_THRESHOLDS.windSpeed;

  const criteria: SinCityCriterionResult[] = [
    numericCriterion("Barrel%", input.barrelRate, SIN_CITY_THRESHOLDS.barrelRate),
    numericCriterion("Pull Air%", input.pullAirRate, SIN_CITY_THRESHOLDS.pullAirRate),
    numericCriterion("Hard Hit%", input.hardHitRate, SIN_CITY_THRESHOLDS.hardHitRate),
    numericCriterion("Exit Velo", input.exitVelo, SIN_CITY_THRESHOLDS.exitVelo),
    {
      name: "Wind Out",
      value: windSpeed,
      threshold: SIN_CITY_THRESHOLDS.windSpeed,
      pass: windPass,
      shortfall: windShortfall,
      windSignal,
      detail: windSignal === "unknown"
        ? "Wind unavailable or roof not confirmed open"
        : `${windSignal} at ${windSpeed ?? 0} mph${input.windDirection ? ` (${input.windDirection})` : ""}`,
    },
  ];

  const matchCount = criteria.filter((criterion) => criterion.pass).length;
  return {
    criteria,
    matchCount,
    qualifies: matchCount >= SIN_CITY_MIN_CRITERIA,
    totalShortfall: criteria.filter((criterion) => !criterion.pass).reduce((sum, criterion) => sum + criterion.shortfall, 0),
  };
}

export type SinCityRow<T> = { batter: T; evaluation: SinCityEvaluation; isFallback: boolean };

export function getSinCityResults<T extends {
  player: string;
  hrScore: number;
  barrelRate: number | null | undefined;
  hardHitRate: number | null | undefined;
  exitVelo: number | null | undefined;
  pullRate: number | null | undefined;
  stadium?: string | null;
  roofType?: string | null;
  windDirection?: string | null;
  windSpeed?: number | null;
}>(batters: T[]): { rows: SinCityRow<T>[]; isFallback: boolean } {
  const evaluated = batters.map((batter) => ({
    batter,
    evaluation: evaluateSinCityHitter({
      barrelRate: batter.barrelRate,
      pullAirRate: batter.pullRate,
      hardHitRate: batter.hardHitRate,
      exitVelo: batter.exitVelo,
      stadium: batter.stadium,
      roofType: batter.roofType,
      windDirection: batter.windDirection,
      windSpeed: batter.windSpeed,
    }),
    isFallback: false,
  }));

  const sortQualifiers = (a: SinCityRow<T>, b: SinCityRow<T>) => {
    if (b.evaluation.matchCount !== a.evaluation.matchCount) return b.evaluation.matchCount - a.evaluation.matchCount;
    if (b.batter.hrScore !== a.batter.hrScore) return b.batter.hrScore - a.batter.hrScore;
    if ((b.batter.barrelRate ?? 0) !== (a.batter.barrelRate ?? 0)) return (b.batter.barrelRate ?? 0) - (a.batter.barrelRate ?? 0);
    if ((b.batter.hardHitRate ?? 0) !== (a.batter.hardHitRate ?? 0)) return (b.batter.hardHitRate ?? 0) - (a.batter.hardHitRate ?? 0);
    return a.batter.player.localeCompare(b.batter.player);
  };

  const qualifiers = evaluated.filter((row) => row.evaluation.qualifies).sort(sortQualifiers);
  if (qualifiers.length > 0) return { rows: qualifiers, isFallback: false };

  evaluated.sort((a, b) => {
    if (b.evaluation.matchCount !== a.evaluation.matchCount) return b.evaluation.matchCount - a.evaluation.matchCount;
    if (a.evaluation.totalShortfall !== b.evaluation.totalShortfall) return a.evaluation.totalShortfall - b.evaluation.totalShortfall;
    if (b.batter.hrScore !== a.batter.hrScore) return b.batter.hrScore - a.batter.hrScore;
    return a.batter.player.localeCompare(b.batter.player);
  });

  return { rows: evaluated.slice(0, SIN_CITY_FALLBACK_COUNT).map((row) => ({ ...row, isFallback: true })), isFallback: true };
}
