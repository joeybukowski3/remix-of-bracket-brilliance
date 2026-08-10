import type { CfbHistoricalGameType, CfbTeamGamePerformance } from "../pipeline";

export type Distribution = {
  count: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
  standardDeviation: number | null;
  p05: number | null;
  p25: number | null;
  p75: number | null;
  p95: number | null;
};

export type CalibrationGame = {
  gameId: string;
  week: number;
  date: string;
  gameType: CfbHistoricalGameType;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
};

export type TeamStrength = {
  teamId: string;
  games: number;
  rawYppOffense: number | null;
  rawYppDefenseAllowed: number | null;
  rawPointsPerPlayOffense: number | null;
  rawPointsPerPlayDefenseAllowed: number | null;
  pointDifferentialPerGame: number | null;
  adjustedYppOffense: number | null;
  adjustedYppDefenseAllowed: number | null;
  adjustedPointsPerPlayOffense: number | null;
  adjustedPointsPerPlayDefenseAllowed: number | null;
};

type WeightScheme = "equal" | "mild-linear" | "exponential-0.9";
type PostseasonScheme = "all-equal" | "postseason-half" | "regular-and-conference-only";

const finite = (value: number | null | undefined): value is number =>
  value !== null && value !== undefined && Number.isFinite(value);

function mean(values: readonly number[], weights?: readonly number[]): number | null {
  if (values.length === 0) return null;
  if (!weights) return values.reduce((sum, value) => sum + value, 0) / values.length;
  const total = weights.reduce((sum, value) => sum + value, 0);
  return total <= 0 ? null : values.reduce((sum, value, index) => sum + value * weights[index], 0) / total;
}

function quantile(sorted: readonly number[], probability: number): number | null {
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function describe(values: readonly (number | null | undefined)[]): Distribution {
  const sorted = values.filter(finite).sort((a, b) => a - b);
  const average = mean(sorted);
  const variance = average === null ? null : mean(sorted.map((value) => (value - average) ** 2));
  return {
    count: sorted.length,
    min: sorted[0] ?? null,
    max: sorted.at(-1) ?? null,
    mean: average,
    median: quantile(sorted, 0.5),
    standardDeviation: variance === null ? null : Math.sqrt(variance),
    p05: quantile(sorted, 0.05),
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
    p95: quantile(sorted, 0.95),
  };
}

export function zScore(value: number | null, distribution: Distribution): number | null {
  if (value === null || distribution.mean === null || !distribution.standardDeviation) return null;
  return (value - distribution.mean) / distribution.standardDeviation;
}

export function robustZScore(value: number | null, values: readonly number[]): number | null {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  const median = quantile(sorted, 0.5);
  if (value === null || median === null) return null;
  const deviations = sorted.map((candidate) => Math.abs(candidate - median)).sort((a, b) => a - b);
  const mad = quantile(deviations, 0.5);
  return !mad ? null : (0.67448975 * (value - median)) / mad;
}

export function splitCalibrationGames(
  games: readonly CalibrationGame[],
  trainMaxWeek = 8,
  testMinWeek = 9,
  testMaxWeek = 14,
): { train: CalibrationGame[]; test: CalibrationGame[] } {
  return {
    train: games.filter((game) => game.gameType === "regular" && game.week <= trainMaxWeek),
    test: games.filter(
      (game) => game.gameType === "regular" && game.week >= testMinWeek && game.week <= testMaxWeek,
    ),
  };
}

function rowWeight(
  week: number,
  gameType: CfbHistoricalGameType,
  maximumWeek: number,
  recency: WeightScheme,
  postseason: PostseasonScheme,
): number {
  if (postseason === "regular-and-conference-only" && !["regular", "conference_championship"].includes(gameType)) return 0;
  const postseasonMultiplier = postseason === "postseason-half" && gameType !== "regular" ? 0.5 : 1;
  if (recency === "mild-linear") return postseasonMultiplier * (0.75 + 0.25 * week / Math.max(1, maximumWeek));
  if (recency === "exponential-0.9") return postseasonMultiplier * 0.9 ** Math.max(0, maximumWeek - week);
  return postseasonMultiplier;
}

export function buildTeamStrengths(options: {
  teamIds: readonly string[];
  performances: readonly CfbTeamGamePerformance[];
  games: readonly CalibrationGame[];
  strength: number;
  iterations: number;
  recency?: WeightScheme;
  postseason?: PostseasonScheme;
}): TeamStrength[] {
  const gameById = new Map(options.games.map((game) => [game.gameId, game]));
  const performanceByGameTeam = new Map(options.performances.map((row) => [`${row.gameId}:${row.teamId}`, row]));
  const opponentPlays = (row: CfbTeamGamePerformance): number | null =>
    row.opponentTeamId === null ? null : performanceByGameTeam.get(`${row.gameId}:${row.opponentTeamId}`)?.plays ?? null;
  const maxWeek = Math.max(1, ...options.games.map((game) => game.week));
  const eligible = options.performances.filter((row) => {
    const game = gameById.get(row.gameId);
    return game && row.opponentTeamId && row.teamClassification === "fbs" && row.opponentClassification === "fbs" &&
      finite(row.yardsPerPlay) && finite(row.yardsPerPlayAllowed) && finite(row.points) &&
      finite(row.pointsAllowed) && finite(row.plays) && row.plays > 0 && finite(opponentPlays(row)) && (opponentPlays(row) as number) > 0 &&
      rowWeight(game.week, game.gameType, maxWeek, options.recency ?? "equal", options.postseason ?? "all-equal") > 0;
  });
  const byTeam = new Map<string, CfbTeamGamePerformance[]>();
  for (const row of eligible) byTeam.set(row.teamId, [...(byTeam.get(row.teamId) ?? []), row]);
  const yppMean = mean(eligible.map((row) => row.yardsPerPlay as number)) ?? 0;
  const pppMean = mean(eligible.map((row) => (row.points as number) / (row.plays as number))) ?? 0;
  type State = { yo: number; yd: number; po: number; pd: number };
  let state = new Map<string, State>();
  for (const teamId of options.teamIds) {
    const rows = byTeam.get(teamId) ?? [];
    const weights = rows.map((row) => {
      const game = gameById.get(row.gameId) as CalibrationGame;
      return rowWeight(game.week, game.gameType, maxWeek, options.recency ?? "equal", options.postseason ?? "all-equal");
    });
    state.set(teamId, {
      yo: (mean(rows.map((row) => row.yardsPerPlay as number), weights) ?? yppMean) - yppMean,
      yd: yppMean - (mean(rows.map((row) => row.yardsPerPlayAllowed as number), weights) ?? yppMean),
      po: (mean(rows.map((row) => (row.points as number) / (row.plays as number)), weights) ?? pppMean) - pppMean,
      pd: pppMean - (mean(rows.map((row) => (row.pointsAllowed as number) / (opponentPlays(row) as number)), weights) ?? pppMean),
    });
  }
  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    const next = new Map<string, State>();
    for (const teamId of options.teamIds) {
      const rows = byTeam.get(teamId) ?? [];
      if (rows.length === 0) { next.set(teamId, { yo: 0, yd: 0, po: 0, pd: 0 }); continue; }
      const weights = rows.map((row) => {
        const game = gameById.get(row.gameId) as CalibrationGame;
        return rowWeight(game.week, game.gameType, maxWeek, options.recency ?? "equal", options.postseason ?? "all-equal");
      });
      next.set(teamId, {
        yo: mean(rows.map((row) => (row.yardsPerPlay as number) - yppMean + options.strength * (state.get(row.opponentTeamId as string)?.yd ?? 0)), weights) ?? 0,
        yd: mean(rows.map((row) => yppMean - (row.yardsPerPlayAllowed as number) + options.strength * (state.get(row.opponentTeamId as string)?.yo ?? 0)), weights) ?? 0,
        po: mean(rows.map((row) => (row.points as number) / (row.plays as number) - pppMean + options.strength * (state.get(row.opponentTeamId as string)?.pd ?? 0)), weights) ?? 0,
        pd: mean(rows.map((row) => pppMean - (row.pointsAllowed as number) / (opponentPlays(row) as number) + options.strength * (state.get(row.opponentTeamId as string)?.po ?? 0)), weights) ?? 0,
      });
    }
    const centers = (key: keyof State) => mean([...next.values()].map((value) => value[key])) ?? 0;
    const yc = centers("yo"), ydc = centers("yd"), pc = centers("po"), pdc = centers("pd");
    state = new Map([...next].map(([id, value]) => [id, { yo: value.yo - yc, yd: value.yd - ydc, po: value.po - pc, pd: value.pd - pdc }]));
  }
  return options.teamIds.map((teamId) => {
    const rows = byTeam.get(teamId) ?? [];
    const weights = rows.map((row) => {
      const game = gameById.get(row.gameId) as CalibrationGame;
      return rowWeight(game.week, game.gameType, maxWeek, options.recency ?? "equal", options.postseason ?? "all-equal");
    });
    const current = state.get(teamId) as State;
    const avg = (project: (row: CfbTeamGamePerformance) => number | null) => {
      const pairs = rows.map((row, index) => ({ value: project(row), weight: weights[index] })).filter((pair): pair is { value: number; weight: number } => finite(pair.value));
      return mean(pairs.map((pair) => pair.value), pairs.map((pair) => pair.weight));
    };
    return {
      teamId, games: rows.length,
      rawYppOffense: avg((row) => row.yardsPerPlay),
      rawYppDefenseAllowed: avg((row) => row.yardsPerPlayAllowed),
      rawPointsPerPlayOffense: avg((row) => finite(row.points) && finite(row.plays) && row.plays > 0 ? row.points / row.plays : null),
      rawPointsPerPlayDefenseAllowed: avg((row) => {
        const plays = opponentPlays(row);
        return finite(row.pointsAllowed) && finite(plays) && plays > 0 ? row.pointsAllowed / plays : null;
      }),
      pointDifferentialPerGame: avg((row) => finite(row.points) && finite(row.pointsAllowed) ? row.points - row.pointsAllowed : null),
      adjustedYppOffense: rows.length ? yppMean + current.yo : null,
      adjustedYppDefenseAllowed: rows.length ? yppMean - current.yd : null,
      adjustedPointsPerPlayOffense: rows.length ? pppMean + current.po : null,
      adjustedPointsPerPlayDefenseAllowed: rows.length ? pppMean - current.pd : null,
    };
  });
}

export type BacktestResult = {
  games: number;
  straightUpAccuracy: number | null;
  marginCorrelation: number | null;
  mae: number | null;
  calibrationSlope: number | null;
  gapBuckets: Array<{ bucket: string; games: number; accuracy: number | null; mae: number | null }>;
};

export function pearson(left: readonly number[], right: readonly number[]): number | null {
  if (left.length < 2 || left.length !== right.length) return null;
  const lm = mean(left) as number, rm = mean(right) as number;
  const numerator = left.reduce((sum, value, index) => sum + (value - lm) * (right[index] - rm), 0);
  const denominator = Math.sqrt(left.reduce((sum, value) => sum + (value - lm) ** 2, 0) * right.reduce((sum, value) => sum + (value - rm) ** 2, 0));
  return denominator === 0 ? null : numerator / denominator;
}

export function evaluateBacktest(
  games: readonly CalibrationGame[],
  ratings: ReadonlyMap<string, number>,
  trainingGames: readonly CalibrationGame[],
): BacktestResult {
  const trainingPairs = trainingGames.map((game) => ({ predicted: (ratings.get(game.homeTeamId) ?? NaN) - (ratings.get(game.awayTeamId) ?? NaN), actual: game.homeScore - game.awayScore })).filter((row) => Number.isFinite(row.predicted));
  const x = trainingPairs.map((row) => row.predicted), y = trainingPairs.map((row) => row.actual);
  const xm = mean(x) ?? 0, ym = mean(y) ?? 0;
  const variance = x.reduce((sum, value) => sum + (value - xm) ** 2, 0);
  const slope = variance === 0 ? 1 : x.reduce((sum, value, index) => sum + (value - xm) * (y[index] - ym), 0) / variance;
  const intercept = ym - slope * xm;
  const evaluated = games.map((game) => {
    const difference = (ratings.get(game.homeTeamId) ?? NaN) - (ratings.get(game.awayTeamId) ?? NaN);
    return { difference, actual: game.homeScore - game.awayScore, translated: intercept + slope * difference };
  }).filter((row) => Number.isFinite(row.difference) && row.actual !== 0 && row.difference !== 0);
  const buckets = [[0, 0.5], [0.5, 1], [1, 2], [2, Infinity]] as const;
  return {
    games: evaluated.length,
    straightUpAccuracy: evaluated.length ? evaluated.filter((row) => Math.sign(row.difference) === Math.sign(row.actual)).length / evaluated.length : null,
    marginCorrelation: pearson(evaluated.map((row) => row.difference), evaluated.map((row) => row.actual)),
    mae: evaluated.length ? mean(evaluated.map((row) => Math.abs(row.translated - row.actual))) : null,
    calibrationSlope: Number.isFinite(slope) ? slope : null,
    gapBuckets: buckets.map(([min, max]) => {
      const rows = evaluated.filter((row) => Math.abs(row.difference) >= min && Math.abs(row.difference) < max);
      return { bucket: `${min}-${max === Infinity ? "plus" : max}`, games: rows.length, accuracy: rows.length ? rows.filter((row) => Math.sign(row.difference) === Math.sign(row.actual)).length / rows.length : null, mae: rows.length ? mean(rows.map((row) => Math.abs(row.translated - row.actual))) : null };
    }),
  };
}

export function standardizedCombinedRatings(
  strengths: readonly TeamStrength[],
  metric: "point-differential" | "raw-ypp" | "adjusted-ypp" | "raw-ppp" | "adjusted-ppp" | "combined",
): Map<string, number> {
  const field = (team: TeamStrength): { offense: number | null; defense: number | null } => {
    if (metric === "point-differential") return { offense: team.pointDifferentialPerGame, defense: 0 };
    if (metric === "raw-ypp") return { offense: team.rawYppOffense, defense: team.rawYppDefenseAllowed === null ? null : -team.rawYppDefenseAllowed };
    if (metric === "adjusted-ypp") return { offense: team.adjustedYppOffense, defense: team.adjustedYppDefenseAllowed === null ? null : -team.adjustedYppDefenseAllowed };
    if (metric === "raw-ppp") return { offense: team.rawPointsPerPlayOffense, defense: team.rawPointsPerPlayDefenseAllowed === null ? null : -team.rawPointsPerPlayDefenseAllowed };
    if (metric === "adjusted-ppp") return { offense: team.adjustedPointsPerPlayOffense, defense: team.adjustedPointsPerPlayDefenseAllowed === null ? null : -team.adjustedPointsPerPlayDefenseAllowed };
    return { offense: team.adjustedYppOffense, defense: team.adjustedYppDefenseAllowed === null ? null : -team.adjustedYppDefenseAllowed };
  };
  if (metric === "point-differential") return new Map(strengths.filter((team) => team.games > 0 && finite(team.pointDifferentialPerGame)).map((team) => [team.teamId, team.pointDifferentialPerGame as number]));
  const yOff = describe(strengths.map((team) => field(team).offense));
  const yDef = describe(strengths.map((team) => field(team).defense));
  const pOff = describe(strengths.map((team) => team.adjustedPointsPerPlayOffense));
  const pDef = describe(strengths.map((team) => team.adjustedPointsPerPlayDefenseAllowed === null ? null : -team.adjustedPointsPerPlayDefenseAllowed));
  return new Map(strengths.filter((team) => team.games > 0).map((team) => {
    const y = ((zScore(field(team).offense, yOff) ?? 0) + (zScore(field(team).defense, yDef) ?? 0)) / 2;
    if (metric !== "combined") return [team.teamId, y];
    const p = ((zScore(team.adjustedPointsPerPlayOffense, pOff) ?? 0) + (zScore(team.adjustedPointsPerPlayDefenseAllowed === null ? null : -team.adjustedPointsPerPlayDefenseAllowed, pDef) ?? 0)) / 2;
    return [team.teamId, (y + p) / 2];
  }));
}
