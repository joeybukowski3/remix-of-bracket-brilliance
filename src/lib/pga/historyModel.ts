import type { CourseWeightSet, RawPlayerStat } from "@/components/pga/PgaHubShared";

export type PgaMajorType = "masters" | "pga_championship" | "us_open" | "open_championship";
export type PgaFinishStatus = "finished" | "missed_cut" | "withdrawn" | "disqualified";

export type PgaHistoryResult = {
  sequence?: number;
  season?: number;
  eventSlug?: string;
  eventName?: string | null;
  eventDate?: string | null;
  majorType?: PgaMajorType | null;
  finishText: string;
  finishPosition: number | null;
  madeCut: boolean;
  status: PgaFinishStatus;
};

export type PgaHistoryStats = {
  sgTotal?: number | null;
  sgOTT?: number | null;
  sgApp?: number | null;
  sgAtG?: number | null;
  sgPutt?: number | null;
  sgT2G?: number | null;
  sgBallStriking?: number | null;
  drivingDistance?: number | null;
  drivingAccuracy?: number | null;
  draftKingsSalary?: number | null;
};

export type PgaPlayerHistoryRecord = {
  player: string;
  sourcePlayerName?: string;
  modelRecentResults?: PgaHistoryResult[];
  recentResults: PgaHistoryResult[];
  eventHistory: Record<string, PgaHistoryResult[]>;
  stats?: PgaHistoryStats;
};

export type PgaPlayerHistoryPayload = {
  version: number;
  source: string;
  sourceFile?: string;
  generatedAt: string;
  event?: {
    slug: string;
    name: string;
    course?: string;
    category?: string;
  };
  players: PgaPlayerHistoryRecord[];
};

export type PgaMajorHistoryPlayer = {
  player: string;
  playerId?: string | null;
  results: PgaHistoryResult[];
};

export type PgaMajorHistoryPayload = {
  version: number;
  source: string;
  generatedAt: string | null;
  years: number[];
  players: PgaMajorHistoryPlayer[];
  errors?: string[];
};

export type PgaCourseFitMetric =
  | "sgTotal"
  | "sgOTT"
  | "sgApp"
  | "sgAtG"
  | "sgPutt"
  | "drivingAccuracy"
  | "drivingDistance"
  | "bogeyAvoidance"
  | "birdieBogeyRatio";

export type PgaCourseFitWeights = Partial<Record<PgaCourseFitMetric, number>>;

export type PgaDisplayPercentiles = Partial<Record<PgaCourseFitMetric, number | null>>;

export type PgaTrendResult = {
  score: number | null;
  delta: number | null;
  direction: "up" | "down" | "flat" | "unknown";
  label: string;
};

export type PgaTournamentModelRow = RawPlayerStat & {
  baseScore: number;
  modelScore: number;
  modelRank: number;
  recentResults: PgaHistoryResult[];
  eventResults: PgaHistoryResult[];
  specificMajorResults: PgaHistoryResult[];
  allMajorResults: PgaHistoryResult[];
  recentScore: number | null;
  eventHistoryScore: number | null;
  specificMajorScore: number | null;
  allMajorScore: number | null;
  courseFit: number | null;
  trend: PgaTrendResult;
  drivingDistance: number | null;
  displayPercentiles: PgaDisplayPercentiles;
};

const RECENT_WEIGHTS = [24, 20, 16, 13, 10, 8, 5, 4];
const FOUR_RESULT_WEIGHTS = [40, 30, 20, 10];
const LOWER_IS_BETTER = new Set<PgaCourseFitMetric>(["bogeyAvoidance"]);

export function normalizePlayerKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function normalizeEventKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(the|presented by|championship|tournament)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

export function parseFinishText(value: unknown): PgaHistoryResult | null {
  if (value == null) return null;
  let finishText = String(value).trim().toUpperCase();
  if (!finishText || finishText === "NAN" || finishText === "-" || finishText === "—") return null;

  finishText = finishText.replace(/^CUT$/, "MC").replace(/^W\/D$/, "WD");
  if (/^\d+\.0$/.test(finishText)) finishText = finishText.slice(0, -2);
  if (/^T\d+\.0$/.test(finishText)) finishText = `T${finishText.slice(1, -2)}`;

  const positionMatch = finishText.match(/(\d+)/);
  const finishPosition = positionMatch ? Number(positionMatch[1]) : null;

  if (finishText === "MC") {
    return { finishText, finishPosition: null, madeCut: false, status: "missed_cut" };
  }
  if (finishText === "WD") {
    return { finishText, finishPosition: null, madeCut: false, status: "withdrawn" };
  }
  if (finishText === "DQ") {
    return { finishText, finishPosition: null, madeCut: false, status: "disqualified" };
  }

  if (finishPosition == null) return null;
  return { finishText, finishPosition, madeCut: true, status: "finished" };
}

export function finishToScore(result: PgaHistoryResult): number {
  if (result.status === "withdrawn" || result.status === "disqualified") return 0;
  if (result.status === "missed_cut" || !result.madeCut) return 5;

  const position = result.finishPosition;
  if (position == null) return 32;
  if (position === 1) return 100;
  if (position <= 5) return 90;
  if (position <= 10) return 80;
  if (position <= 20) return 68;
  if (position <= 30) return 55;
  if (position <= 40) return 45;
  return 32;
}

export function scoreHistory(
  results: PgaHistoryResult[],
  weights = RECENT_WEIGHTS,
  shrinkStarts = 3,
): number | null {
  const usable = results.slice(0, weights.length);
  if (!usable.length) return null;

  let weightedTotal = 0;
  let weightTotal = 0;
  usable.forEach((result, index) => {
    const weight = weights[index] ?? 0;
    weightedTotal += finishToScore(result) * weight;
    weightTotal += weight;
  });

  if (weightTotal <= 0) return null;
  const observed = weightedTotal / weightTotal;
  const sample = usable.length;
  const adjusted = (sample / (sample + shrinkStarts)) * observed + (shrinkStarts / (sample + shrinkStarts)) * 50;
  return roundOne(adjusted);
}

export function calculateTrend(results: PgaHistoryResult[]): PgaTrendResult {
  const usable = results.slice(0, 8);
  if (usable.length < 4) {
    return { score: null, delta: null, direction: "unknown", label: "—" };
  }

  const newest = usable.slice(0, Math.min(4, usable.length));
  const older = usable.slice(4, 8);
  const newestAvg = average(newest.map(finishToScore));
  const olderAvg = older.length ? average(older.map(finishToScore)) : 50;
  const delta = roundOne(newestAvg - olderAvg);
  const score = roundOne(clamp(50 + delta, 0, 100));

  if (delta >= 3) return { score, delta, direction: "up", label: `↑ +${Math.round(delta)}` };
  if (delta <= -3) return { score, delta, direction: "down", label: `↓ ${Math.round(delta)}` };
  return { score, delta, direction: "flat", label: "→ 0" };
}

export function resolveMajorType(eventName: string, eventSlug = ""): PgaMajorType | null {
  const key = `${eventName} ${eventSlug}`.toLowerCase();
  if (key.includes("masters")) return "masters";
  if (key.includes("pga championship")) return "pga_championship";
  if (key.includes("u.s. open") || key.includes("us open") || key.includes("u-s-open")) return "us_open";
  if (key.includes("open championship") || key.includes("the open")) return "open_championship";
  return null;
}

export function sortHistoryNewestFirst(results: PgaHistoryResult[]) {
  return [...results].sort((left, right) => {
    const leftDate = left.eventDate ?? "";
    const rightDate = right.eventDate ?? "";
    if (leftDate !== rightDate) return rightDate.localeCompare(leftDate);
    return (right.season ?? 0) - (left.season ?? 0);
  });
}

export function selectSpecificMajorHistory(results: PgaHistoryResult[], majorType: PgaMajorType | null) {
  if (!majorType) return [];
  return sortHistoryNewestFirst(results.filter((result) => result.majorType === majorType)).slice(0, 4);
}

export function selectAllMajorHistory(results: PgaHistoryResult[]) {
  return sortHistoryNewestFirst(results.filter((result) => result.majorType != null)).slice(0, 8);
}

export function findEventHistory(
  record: PgaPlayerHistoryRecord | null | undefined,
  eventSlug: string,
  eventName: string,
) {
  if (!record) return [];

  const direct = record.eventHistory[eventSlug];
  if (direct?.length) return sortHistoryNewestFirst(direct).slice(0, 4);

  const requestedKeys = new Set([normalizeEventKey(eventSlug), normalizeEventKey(eventName)]);
  for (const [key, results] of Object.entries(record.eventHistory)) {
    if (requestedKeys.has(normalizeEventKey(key))) {
      return sortHistoryNewestFirst(results).slice(0, 4);
    }
  }
  return [];
}

export function buildPlayerHistoryMap(payload: PgaPlayerHistoryPayload | null | undefined) {
  return new Map((payload?.players ?? []).map((record) => [normalizePlayerKey(record.player), record]));
}

export function buildMajorHistoryMap(payload: PgaMajorHistoryPayload | null | undefined) {
  return new Map((payload?.players ?? []).map((record) => [normalizePlayerKey(record.player), record]));
}

export function buildCourseFitWeights(
  weights: CourseWeightSet | null | undefined,
  event: { slug?: string; name?: string; category?: string; yardage?: number | string },
): PgaCourseFitWeights {
  const eventKey = `${event.slug ?? ""} ${event.name ?? ""}`.toLowerCase();

  if (eventKey.includes("travelers")) {
    return {
      sgTotal: 0.15,
      sgOTT: 0.10,
      sgApp: 0.25,
      sgAtG: 0.10,
      sgPutt: 0.08,
      drivingAccuracy: 0.20,
      drivingDistance: 0.04,
      bogeyAvoidance: 0.05,
      birdieBogeyRatio: 0.03,
    };
  }

  const yardage = Number(event.yardage ?? 0);
  const isLong = Number.isFinite(yardage) && yardage >= 7400;
  const isMajor = event.category === "major";
  const base: PgaCourseFitWeights = {
    sgTotal: weights?.sgTotal ?? 0.18,
    sgOTT: weights?.sgOTT ?? 0.12,
    sgApp: weights?.sgApp ?? 0.22,
    sgAtG: weights?.sgAtG ?? 0.10,
    sgPutt: weights?.sgPutt ?? 0.10,
    drivingAccuracy: weights?.drivingAccuracy ?? 0.10,
    drivingDistance: isLong || isMajor ? 0.12 : 0.06,
    bogeyAvoidance: weights?.bogeyAvoidance ?? 0.06,
    birdieBogeyRatio: weights?.birdieBogeyRatio ?? 0.04,
  };

  const total = Object.values(base).reduce((sum, value) => sum + (value ?? 0), 0);
  if (total <= 0) return base;
  return Object.fromEntries(
    Object.entries(base).map(([key, value]) => [key, (value ?? 0) / total]),
  ) as PgaCourseFitWeights;
}

export function buildMetricPercentiles(
  players: Array<RawPlayerStat & { drivingDistance?: number | null }>,
): Map<string, PgaDisplayPercentiles> {
  const metrics: PgaCourseFitMetric[] = [
    "sgTotal",
    "sgOTT",
    "sgApp",
    "sgAtG",
    "sgPutt",
    "drivingAccuracy",
    "drivingDistance",
    "bogeyAvoidance",
    "birdieBogeyRatio",
  ];

  const maps = new Map<string, PgaDisplayPercentiles>();
  players.forEach((player) => maps.set(normalizePlayerKey(player.player), {}));

  metrics.forEach((metric) => {
    const values = players
      .map((player) => ({ key: normalizePlayerKey(player.player), value: readMetric(player, metric) }))
      .filter((row): row is { key: string; value: number } => typeof row.value === "number" && Number.isFinite(row.value))
      .sort((a, b) => a.value - b.value);

    values.forEach((row) => {
      const less = values.filter((candidate) => candidate.value < row.value).length;
      const equal = values.filter((candidate) => candidate.value === row.value).length;
      const midRank = less + Math.max(0, equal - 1) / 2;
      let percentile = values.length <= 1 ? 50 : (midRank / (values.length - 1)) * 100;
      if (LOWER_IS_BETTER.has(metric)) percentile = 100 - percentile;
      maps.get(row.key)![metric] = roundOne(clamp(percentile, 0, 100));
    });
  });

  return maps;
}

export function calculateCourseFit(
  percentiles: PgaDisplayPercentiles,
  weights: PgaCourseFitWeights,
): number | null {
  let weightedTotal = 0;
  let availableWeight = 0;

  for (const [metric, weight] of Object.entries(weights) as Array<[PgaCourseFitMetric, number]>) {
    const percentile = percentiles[metric];
    if (typeof percentile !== "number" || !Number.isFinite(percentile) || weight <= 0) continue;
    weightedTotal += percentile * weight;
    availableWeight += weight;
  }

  return availableWeight > 0 ? roundOne(weightedTotal / availableWeight) : null;
}

export function calculateTournamentModelScore(args: {
  baseScore: number;
  recentScore: number | null;
  courseFit: number | null;
  eventHistoryScore: number | null;
  specificMajorScore: number | null;
  allMajorScore: number | null;
  trendScore: number | null;
  isMajor: boolean;
}) {
  const components = args.isMajor
    ? [
        [args.baseScore, 38],
        [args.recentScore, 20],
        [args.courseFit, 15],
        [args.specificMajorScore, 10],
        [args.allMajorScore, 9],
        [args.trendScore, 8],
      ]
    : [
        [args.baseScore, 42],
        [args.recentScore, 23],
        [args.courseFit, 17],
        [args.eventHistoryScore, 10],
        [args.trendScore, 8],
      ];

  let weightedTotal = 0;
  let availableWeight = 0;
  for (const [value, weight] of components as Array<[number | null, number]>) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    weightedTotal += clamp(value, 0, 100) * weight;
    availableWeight += weight;
  }

  return availableWeight > 0 ? roundOne(weightedTotal / availableWeight) : 0;
}

export function scoreRecentResults(results: PgaHistoryResult[]) {
  return scoreHistory(results.slice(0, 8), RECENT_WEIGHTS);
}

export function selectModelRecentResults(
  record: PgaPlayerHistoryRecord | null | undefined,
  count: number,
) {
  return (record?.modelRecentResults ?? record?.recentResults ?? []).slice(0, count);
}

export function scoreFourResultHistory(results: PgaHistoryResult[]) {
  return scoreHistory(results.slice(0, 4), FOUR_RESULT_WEIGHTS);
}

function readMetric(
  player: RawPlayerStat & { drivingDistance?: number | null },
  metric: PgaCourseFitMetric,
) {
  const value = player[metric as keyof typeof player];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
