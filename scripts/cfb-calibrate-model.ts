import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CFB_TEAM_METADATA } from "../src/data/cfb/teamMetadata";
import {
  CFB_CALIBRATION_GRID,
  CFB_V02_CANDIDATE_CONFIG,
  buildTeamStrengths,
  describe,
  evaluateBacktest,
  splitCalibrationGames,
  standardizedCombinedRatings,
  zScore,
  type CalibrationGame,
  type TeamStrength,
} from "../src/lib/cfb/calibration";
import { normalizeToDisplayScale } from "../src/lib/cfb/model";
import {
  normalizeCfbdGamePerformance,
  normalizeCfbdGames,
  normalizeCfbdSchedule,
  normalizeCfbdTransitionPriorFallbacks,
  resolveCfbdFbsTeams,
  type CfbdGame,
  type CfbdGameTeamStats,
  type CfbdReturningProduction,
  type CfbdTeam,
  type CfbdTransitionTeamCache,
  type CfbTeamGamePerformance,
} from "../src/lib/cfb/pipeline";
import { getJkbTeamIdForCfbdName } from "../src/data/cfb/externalTeamMapping";
import { computeRawSosForAllTeams, computeSosDisplay, toSosGameInputs } from "../src/lib/cfb/model";
import { CFB_V1_CONFIG, applyTransitionFallbackShrinkage } from "../src/lib/cfb/production";
import { writeAtomic } from "./lib/cfb-cfbd-client";

const ROOT = resolve(import.meta.dirname, "..");
const RAW = resolve(ROOT, "data", "cfb", "cfbd", "raw");
const OUTPUT = resolve(ROOT, "data", "generated", "cfb");
const read = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const raw = <T>(name: string): T => read<T>(resolve(RAW, name));
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const roundDeep = (value: unknown): unknown => typeof value === "number" ? Number(value.toFixed(8)) : Array.isArray(value) ? value.map(roundDeep) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, roundDeep(child)])) : value;
const finite = (value: number | null | undefined): value is number => value !== null && value !== undefined && Number.isFinite(value);
const csvCell = (value: unknown) => value === null || value === undefined ? "" : /[",\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value);
const average = (values: Array<number | null>) => {
  const known = values.filter(finite);
  return known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
};

function rawFallbackStrength(teamId: string, rows: readonly CfbTeamGamePerformance[]): TeamStrength {
  return {
    teamId,
    games: new Set(rows.map((row) => row.gameId)).size,
    rawYppOffense: average(rows.map((row) => row.yardsPerPlay)),
    rawYppDefenseAllowed: average(rows.map((row) => row.yardsPerPlayAllowed)),
    rawPointsPerPlayOffense: average(rows.map((row) => finite(row.points) && finite(row.plays) && row.plays > 0 ? row.points / row.plays : null)),
    rawPointsPerPlayDefenseAllowed: null,
    pointDifferentialPerGame: average(rows.map((row) => finite(row.points) && finite(row.pointsAllowed) ? row.points - row.pointsAllowed : null)),
    adjustedYppOffense: null,
    adjustedYppDefenseAllowed: null,
    adjustedPointsPerPlayOffense: null,
    adjustedPointsPerPlayDefenseAllowed: null,
  };
}

function calibrationGames(games: ReturnType<typeof normalizeCfbdGames>): CalibrationGame[] {
  return games.filter((game): game is typeof game & { homeTeamId: string; awayTeamId: string; homeScore: number; awayScore: number } =>
    game.completed && game.homeClassification === "fbs" && game.awayClassification === "fbs" &&
    game.homeTeamId !== null && game.awayTeamId !== null && game.homeScore !== null && game.awayScore !== null,
  ).map((game) => ({ gameId: game.gameId, week: game.week, date: game.date, gameType: game.gameType, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: game.homeScore, awayScore: game.awayScore }));
}

function rankMap(values: ReadonlyMap<string, number>): Map<string, number> {
  return new Map([...values].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id], index) => [id, index + 1]));
}

function rankCorrelation(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): number | null {
  const ids = [...a.keys()].filter((id) => b.has(id));
  if (ids.length < 2) return null;
  const ar = rankMap(a), br = rankMap(b);
  const squared = ids.reduce((sum, id) => sum + ((ar.get(id) as number) - (br.get(id) as number)) ** 2, 0);
  return 1 - (6 * squared) / (ids.length * (ids.length ** 2 - 1));
}

function main() {
  const baselineCsvPath = resolve(OUTPUT, "2026-preseason-ratings.csv");
  const baselineCsv = readFileSync(baselineCsvPath, "utf8");
  const baselineJson = read<{ rows: Array<Record<string, unknown>> }>(resolve(OUTPUT, "2026-preseason-ratings.json"));
  const teams = raw<CfbdTeam[]>("teams-2026.json");
  const mappings = resolveCfbdFbsTeams(teams);
  const normalizedGames = normalizeCfbdGames(raw<CfbdGame[]>("games-2025.json"), mappings);
  const performances = normalizeCfbdGamePerformance(raw<CfbdGameTeamStats[]>("game-team-stats-2025.json"), normalizedGames, mappings);
  const transition = normalizeCfbdTransitionPriorFallbacks(raw<CfbdTransitionTeamCache>("transition-teams-2025.json"), mappings, new Set(normalizedGames.map((game) => game.gameId)));
  const returning = raw<CfbdReturningProduction[]>("returning-production-2026.json");
  const teamIds = CFB_TEAM_METADATA.map((team) => team.id);
  const games = calibrationGames(normalizedGames);
  const split = splitCalibrationGames(games);
  const trainingIds = new Set(split.train.map((game) => game.gameId));
  const trainPerformances = performances.filter((row) => trainingIds.has(row.gameId));

  const baseStrengths = buildTeamStrengths({ teamIds, performances: trainPerformances, games: split.train, strength: 0.55, iterations: 12 });
  const evaluate = (strengths: TeamStrength[], metric: Parameters<typeof standardizedCombinedRatings>[1]) =>
    evaluateBacktest(split.test, standardizedCombinedRatings(strengths, metric), split.train);
  const baselines = {
    rawPointDifferential: evaluate(baseStrengths, "point-differential"),
    rawYardsPerPlay: evaluate(baseStrengths, "raw-ypp"),
    rawPointsPerPlay: evaluate(baseStrengths, "raw-ppp"),
    opponentAdjustedYardsPerPlay: evaluate(baseStrengths, "adjusted-ypp"),
    opponentAdjustedPointsPerPlay: evaluate(baseStrengths, "adjusted-ppp"),
  };
  const strengthGrid = CFB_CALIBRATION_GRID.strengths.map((strength) => {
    const strengths = buildTeamStrengths({ teamIds, performances: trainPerformances, games: split.train, strength, iterations: 12 });
    return { strength, ...evaluate(strengths, "combined") };
  });
  const iterationGrid = CFB_CALIBRATION_GRID.iterations.map((iterations) => {
    const strengths = buildTeamStrengths({ teamIds, performances: trainPerformances, games: split.train, strength: CFB_V02_CANDIDATE_CONFIG.opponentAdjustment.strength, iterations });
    return { iterations, ...evaluate(strengths, "combined") };
  });
  const recencyTests = (["equal", "mild-linear", "exponential-0.9"] as const).map((recency) => {
    const strengths = buildTeamStrengths({ teamIds, performances: trainPerformances, games: split.train, strength: CFB_V02_CANDIDATE_CONFIG.opponentAdjustment.strength, iterations: CFB_V02_CANDIDATE_CONFIG.opponentAdjustment.iterations, recency });
    return { recency, ...evaluate(strengths, "combined") };
  });
  const postseasonTestGames = games.filter((game) => ["bowl", "playoff", "other_postseason"].includes(game.gameType));
  const postseasonTrainGames = games.filter((game) => !postseasonTestGames.some((candidate) => candidate.gameId === game.gameId));
  const postseasonTrainIds = new Set(postseasonTrainGames.map((game) => game.gameId));
  const postseasonTests = (["all-equal", "postseason-half", "regular-and-conference-only"] as const).map((postseason) => {
    const strengths = buildTeamStrengths({ teamIds, performances: performances.filter((row) => postseasonTrainIds.has(row.gameId)), games: postseasonTrainGames, strength: CFB_V02_CANDIDATE_CONFIG.opponentAdjustment.strength, iterations: CFB_V02_CANDIDATE_CONFIG.opponentAdjustment.iterations, postseason });
    return { postseason, ...evaluateBacktest(postseasonTestGames, standardizedCombinedRatings(strengths, "combined"), postseasonTrainGames) };
  });

  const fullStrengths = buildTeamStrengths({ teamIds, performances, games, strength: CFB_V02_CANDIDATE_CONFIG.opponentAdjustment.strength, iterations: CFB_V02_CANDIDATE_CONFIG.opponentAdjustment.iterations });
  const baselineNumber = (key: string) => baselineJson.rows.map((row) => typeof row[key] === "number" ? row[key] as number : null);
  const distributions = {
    rawPriorOffense: describe(baselineNumber("priorOffense")),
    opponentAdjustedOffense: describe(baselineNumber("opponentAdjustedOffense")),
    rawPriorDefenseAllowed: describe(baselineNumber("priorDefense")),
    opponentAdjustedDefenseAllowed: describe(baselineNumber("opponentAdjustedDefense")),
    rawPointsPerPlayOffense: describe(fullStrengths.map((team) => team.rawPointsPerPlayOffense)),
    rawPointsPerPlayDefenseAllowed: describe(fullStrengths.map((team) => team.rawPointsPerPlayDefenseAllowed)),
    opponentAdjustedPointsPerPlayOffense: describe(fullStrengths.map((team) => team.adjustedPointsPerPlayOffense)),
    opponentAdjustedPointsPerPlayDefenseAllowed: describe(fullStrengths.map((team) => team.adjustedPointsPerPlayDefenseAllowed)),
    returningOffensiveProduction: describe(returning.map((row) => row.percentPPA < 0 ? null : row.percentPPA <= 1 ? row.percentPPA * 100 : row.percentPPA <= 100 ? row.percentPPA : null)),
    qbContinuity: describe([]),
    offensiveBase: describe(baselineNumber("rawOffense")),
    defensiveBase: describe(baselineNumber("rawDefense")),
    powerBase: describe(baselineNumber("rawPower")),
  };
  const yOffDist = describe(fullStrengths.map((team) => team.adjustedYppOffense));
  const yDefDist = describe(fullStrengths.map((team) => team.adjustedYppDefenseAllowed === null ? null : -team.adjustedYppDefenseAllowed));
  const pOffDist = describe(fullStrengths.map((team) => team.adjustedPointsPerPlayOffense));
  const pDefDist = describe(fullStrengths.map((team) => team.adjustedPointsPerPlayDefenseAllowed === null ? null : -team.adjustedPointsPerPlayDefenseAllowed));
  const returnByTeam = new Map(returning.map((row) => [getJkbTeamIdForCfbdName(row.team), row.percentPPA < 0 ? null : row.percentPPA <= 1 ? row.percentPPA * 100 : row.percentPPA <= 100 ? row.percentPPA : null]).filter((row): row is [string | null, number] => row[1] !== null));
  const invalidReturningRows = returning.filter((row) => row.percentPPA < 0 || row.percentPPA > 100).map((row) => ({ team: row.team, percentPPA: row.percentPPA, treatment: "null" }));
  const returnDist = describe([...returnByTeam.values()]);
  const fallbackByTeam = new Map(transition.map((row) => [row.teamId, row]));
  const strengthsByTeam = new Map(fullStrengths.map((team) => [team.teamId, team]));

  const candidateRows = teamIds.map((teamId) => {
    let strength = strengthsByTeam.get(teamId) as TeamStrength;
    const fallback = fallbackByTeam.get(teamId);
    let source = "prior-fbs-opponent-adjusted";
    let sourceClassification = "fbs";
    if (fallback) {
      const fallbackStrength = rawFallbackStrength(teamId, fallback.performances);
      if (!strength || strength.games < 1) strength = fallbackStrength;
      else if (teamId === "sac") strength = fallbackStrength;
      source = "prior-fcs-fallback";
      sourceClassification = "fcs";
    }
    const zYppOffense = zScore(strength.adjustedYppOffense ?? strength.rawYppOffense, yOffDist);
    const zYppDefense = zScore(finite(strength.adjustedYppDefenseAllowed) ? -strength.adjustedYppDefenseAllowed : finite(strength.rawYppDefenseAllowed) ? -strength.rawYppDefenseAllowed : null, yDefDist);
    const zPppOffense = zScore(strength.adjustedPointsPerPlayOffense ?? strength.rawPointsPerPlayOffense, pOffDist);
    const zPppDefense = zScore(finite(strength.adjustedPointsPerPlayDefenseAllowed) ? -strength.adjustedPointsPerPlayDefenseAllowed : finite(strength.rawPointsPerPlayDefenseAllowed) ? -strength.rawPointsPerPlayDefenseAllowed : null, pDefDist);
    const performanceOffense = finite(zYppOffense) && finite(zPppOffense) ? (zYppOffense + zPppOffense) / 2 : zYppOffense ?? zPppOffense;
    const performanceDefense = finite(zYppDefense) && finite(zPppDefense) ? (zYppDefense + zPppDefense) / 2 : zYppDefense ?? zPppDefense;
    const returningValue = returnByTeam.get(teamId) ?? null;
    const standardizedReturning = zScore(returningValue, returnDist);
    const rw = CFB_V02_CANDIDATE_CONFIG.returningProductionWeight;
    const offense = performanceOffense === null ? standardizedReturning : standardizedReturning === null ? performanceOffense : performanceOffense * (1 - rw) + standardizedReturning * rw;
    const defense = performanceDefense;
    const power = finite(offense) && finite(defense) ? offense * 0.5 + defense * 0.5 : offense ?? defense;
    if (!finite(offense) || !finite(defense) || !finite(power)) throw new Error(`Candidate v0.2 insufficient data for ${teamId}`);
    return { teamId, games: strength.games, priorPerformanceSource: source, sourceClassification, rawYppOffense: strength.rawYppOffense, rawYppDefenseAllowed: strength.rawYppDefenseAllowed, adjustedYppOffense: sourceClassification === "fcs" ? null : strength.adjustedYppOffense, adjustedYppDefenseAllowed: sourceClassification === "fcs" ? null : strength.adjustedYppDefenseAllowed, rawPointsPerPlayOffense: strength.rawPointsPerPlayOffense, rawPointsPerPlayDefenseAllowed: strength.rawPointsPerPlayDefenseAllowed, adjustedPointsPerPlayOffense: sourceClassification === "fcs" ? null : strength.adjustedPointsPerPlayOffense, adjustedPointsPerPlayDefenseAllowed: sourceClassification === "fcs" ? null : strength.adjustedPointsPerPlayDefenseAllowed, standardizedYppOffense: zYppOffense, standardizedYppDefense: zYppDefense, standardizedPointsPerPlayOffense: zPppOffense, standardizedPointsPerPlayDefense: zPppDefense, performanceOffense, performanceDefense, returningProduction: returningValue, standardizedReturningProduction: standardizedReturning, offensiveContribution: offense * 0.5, defensiveContribution: defense * 0.5, rawOffense: offense, rawDefense: defense, rawPower: power };
  });
  const offenseDisplay = normalizeToDisplayScale(candidateRows.map((row) => row.rawOffense), CFB_V02_CANDIDATE_CONFIG.displayScale);
  const defenseDisplay = normalizeToDisplayScale(candidateRows.map((row) => row.rawDefense), CFB_V02_CANDIDATE_CONFIG.displayScale);
  const powerDisplay = normalizeToDisplayScale(candidateRows.map((row) => row.rawPower), CFB_V02_CANDIDATE_CONFIG.displayScale);
  const powerLookup = new Map(candidateRows.map((row, index) => [row.teamId, powerDisplay[index] as number]));
  const ranks = rankMap(powerLookup);
  const rawScheduleGames = raw<CfbdGame[]>("games-2026.json");
  const schedule = normalizeCfbdSchedule(rawScheduleGames, mappings);
  const scheduleCounts = new Map(teamIds.map((teamId) => [teamId, 0]));
  for (const game of schedule) {
    if (scheduleCounts.has(game.homeTeamId)) scheduleCounts.set(game.homeTeamId, (scheduleCounts.get(game.homeTeamId) ?? 0) + 1);
    if (scheduleCounts.has(game.awayTeamId)) scheduleCounts.set(game.awayTeamId, (scheduleCounts.get(game.awayTeamId) ?? 0) + 1);
  }
  const sosByTeam = new Map(computeSosDisplay(computeRawSosForAllTeams(teamIds, toSosGameInputs(schedule), powerLookup)).map((row) => [row.teamId, row]));
  const metadata = new Map(CFB_TEAM_METADATA.map((team) => [team.id, team]));
  const outputRows = candidateRows.map((row, index) => ({ ...row, team: metadata.get(row.teamId)?.name, conference: metadata.get(row.teamId)?.conference, rank: ranks.get(row.teamId), jkbPower: powerDisplay[index], jkbOffense: offenseDisplay[index], jkbDefense: defenseDisplay[index], sosRemainingRating: sosByTeam.get(row.teamId)?.sosRemainingRating ?? null, sosRemainingRank: sosByTeam.get(row.teamId)?.sosRemainingRank ?? null, provenance: { modelVersion: CFB_V02_CANDIDATE_CONFIG.version, standardization: CFB_V02_CANDIDATE_CONFIG.standardization, priorPerformance: row.priorPerformanceSource, returningProduction: row.returningProduction === null ? "unavailable" : "CFBD 2026 percentPPA", qbContinuity: "unavailable", talent: "unavailable" } })).sort((a, b) => (a.rank as number) - (b.rank as number));
  const v1BaseRows = candidateRows.map((row) => {
    const performanceOffense = applyTransitionFallbackShrinkage(row.priorPerformanceSource, row.performanceOffense);
    const performanceDefense = applyTransitionFallbackShrinkage(row.priorPerformanceSource, row.performanceDefense);
    const returningWeight = CFB_V1_CONFIG.returningProductionWeight;
    const rawOffense = performanceOffense === null
      ? row.standardizedReturningProduction
      : row.standardizedReturningProduction === null
        ? performanceOffense
        : performanceOffense * (1 - returningWeight) + row.standardizedReturningProduction * returningWeight;
    const rawDefense = performanceDefense;
    const rawPower = finite(rawOffense) && finite(rawDefense)
      ? rawOffense * CFB_V1_CONFIG.power.offenseWeight + rawDefense * CFB_V1_CONFIG.power.defenseWeight
      : rawOffense ?? rawDefense;
    if (!finite(rawOffense) || !finite(rawDefense) || !finite(rawPower)) {
      throw new Error(`Production v1 insufficient data for ${row.teamId}`);
    }
    return {
      ...row,
      standardizedYppOffense: applyTransitionFallbackShrinkage(row.priorPerformanceSource, row.standardizedYppOffense),
      standardizedYppDefense: applyTransitionFallbackShrinkage(row.priorPerformanceSource, row.standardizedYppDefense),
      standardizedPointsPerPlayOffense: applyTransitionFallbackShrinkage(row.priorPerformanceSource, row.standardizedPointsPerPlayOffense),
      standardizedPointsPerPlayDefense: applyTransitionFallbackShrinkage(row.priorPerformanceSource, row.standardizedPointsPerPlayDefense),
      performanceOffense,
      performanceDefense,
      offensiveContribution: rawOffense * CFB_V1_CONFIG.power.offenseWeight,
      defensiveContribution: rawDefense * CFB_V1_CONFIG.power.defenseWeight,
      rawOffense,
      rawDefense,
      rawPower,
      transitionShrinkageApplied: row.priorPerformanceSource === CFB_V1_CONFIG.transitionFallback.source,
      transitionPriorPerformanceWeight: row.priorPerformanceSource === CFB_V1_CONFIG.transitionFallback.source
        ? CFB_V1_CONFIG.transitionFallback.priorPerformanceWeight
        : null,
    };
  });
  const v1OffenseDisplay = normalizeToDisplayScale(v1BaseRows.map((row) => row.rawOffense), CFB_V1_CONFIG.displayScale);
  const v1DefenseDisplay = normalizeToDisplayScale(v1BaseRows.map((row) => row.rawDefense), CFB_V1_CONFIG.displayScale);
  const v1PowerDisplay = normalizeToDisplayScale(v1BaseRows.map((row) => row.rawPower), CFB_V1_CONFIG.displayScale);
  const v1PowerLookup = new Map(v1BaseRows.map((row, index) => [row.teamId, v1PowerDisplay[index] as number]));
  const v1Ranks = rankMap(v1PowerLookup);
  const v1SosByTeam = new Map(computeSosDisplay(computeRawSosForAllTeams(teamIds, toSosGameInputs(schedule), v1PowerLookup)).map((row) => [row.teamId, row]));
  const v1Rows = v1BaseRows.map((row, index) => ({
    ...row,
    team: metadata.get(row.teamId)?.name,
    conference: metadata.get(row.teamId)?.conference,
    rank: v1Ranks.get(row.teamId),
    jkbPower: v1PowerDisplay[index],
    jkbOffense: v1OffenseDisplay[index],
    jkbDefense: v1DefenseDisplay[index],
    sosPlayedRating: null,
    sosPlayedRank: null,
    sosRemainingRating: v1SosByTeam.get(row.teamId)?.sosRemainingRating ?? null,
    sosRemainingRank: v1SosByTeam.get(row.teamId)?.sosRemainingRank ?? null,
    sosProvenance: scheduleCounts.get(row.teamId) === 11
      ? "provisional-pac-12-week-13-flex-unassigned"
      : "complete-current-cfbd-schedule",
    provenance: {
      modelVersion: CFB_V1_CONFIG.version,
      standardization: CFB_V1_CONFIG.standardization,
      priorPerformance: row.priorPerformanceSource,
      transitionAdjustment: row.priorPerformanceSource === CFB_V1_CONFIG.transitionFallback.source
        ? CFB_V1_CONFIG.transitionFallback.policy
        : "not-applicable",
      returningProduction: row.returningProduction === null ? "unavailable" : "CFBD 2026 percentPPA",
      quarterbackContinuity: "unavailable",
      talent: "unavailable",
    },
  })).sort((a, b) => (a.rank as number) - (b.rank as number));
  if (v1Rows.length !== 138 || v1Rows.some((row, index) => row.rank !== index + 1)) {
    throw new Error("Production v1 must contain exactly ranks 1-138");
  }
  const candidateRatings = new Map(outputRows.map((row) => [row.teamId, row.rawPower]));
  const baselineRatings = new Map(baselineJson.rows.map((row) => [row.teamId as string, row.rawPower as number]));
  const returnSensitivity = CFB_CALIBRATION_GRID.returningProductionWeights.map((weight) => {
    const values = new Map(candidateRows.map((row) => [row.teamId, row.performanceOffense === null ? row.rawPower : ((row.performanceOffense * (1 - weight) + (row.standardizedReturningProduction ?? row.performanceOffense) * weight) + row.rawDefense) / 2]));
    const candidateRank = rankMap(values);
    const movement = teamIds.map((id) => Math.abs((rankMap(new Map(candidateRows.map((row) => [row.teamId, (row.performanceOffense + row.rawDefense) / 2]))).get(id) as number) - (candidateRank.get(id) as number)));
    return { weight, meanAbsoluteRankMovement: movement.reduce((sum, value) => sum + value, 0) / movement.length, maximumRankMovement: Math.max(...movement) };
  });
  const forensicNames = new Set(["San Diego State", "Western Michigan", "Marshall", "Southern Miss", "Akron", "Delaware", "Oregon", "Texas", "Ohio State", "Georgia"]);
  const baselineForensics = baselineJson.rows.filter((row) => forensicNames.has(row.team as string)).map((row) => ({ team: row.team, rank: row.rank, games: row.priorSampleGames, rawPriorOffense: row.priorOffense, rawPriorDefenseAllowed: row.priorDefense, opponentAdjustedOffense: row.opponentAdjustedOffense, opponentAdjustedDefenseAllowed: row.opponentAdjustedDefense, returningProduction: row.returningProductionOffense, rawOffense: row.rawOffense, rawDefense: row.rawDefense, rawPower: row.rawPower, displayPower: row.jkbPower, ratingBreakdown: row.ratingBreakdown }));
  const candidateForensics = outputRows.filter((row) => forensicNames.has(row.team as string));
  const componentAudit = {
    distributions,
    rawScaleMixing: true,
    practicalContribution: {
      explanation: "v0.1 weights native yards/play (~4-8) and returning percentPPA (0-100) directly; weights sum to one but component units are not comparable.",
      v01NominalPriorWeight: 0.6,
      v01NominalReturningWeight: 0.25,
      v01AppliedWhenQbMissing: { prior: 0.70588235, returning: 0.29411765 },
      expectedContributionAtFieldMeans: {
        prior: (distributions.opponentAdjustedOffense.mean ?? 0) * (0.6 / 0.85),
        returning: (distributions.returningOffensiveProduction.mean ?? 0) * (0.25 / 0.85),
      },
    },
    standardizationComparison: {
      selected: "league z-score",
      rationale: "Preserves distance in league-standard-deviation units and makes heterogeneous inputs commensurate. Percentiles remain display-only; robust z-score is retained as an audit option but ordinary z-score is transparent and no extreme source outliers were found.",
    },
  };
  const candidateBacktestStrengths = buildTeamStrengths({ teamIds, performances: trainPerformances, games: split.train, strength: CFB_V02_CANDIDATE_CONFIG.opponentAdjustment.strength, iterations: CFB_V02_CANDIDATE_CONFIG.opponentAdjustment.iterations });
  const candidateBacktest = evaluate(candidateBacktestStrengths, "combined");
  const headers = ["rank", "team", "conference", "jkbPower", "jkbOffense", "jkbDefense", "sosRemainingRating", "sosRemainingRank", "rawPower", "rawOffense", "rawDefense", "games", "priorPerformanceSource", "sourceClassification", "rawYppOffense", "rawYppDefenseAllowed", "adjustedYppOffense", "adjustedYppDefenseAllowed", "rawPointsPerPlayOffense", "rawPointsPerPlayDefenseAllowed", "adjustedPointsPerPlayOffense", "adjustedPointsPerPlayDefenseAllowed", "standardizedYppOffense", "standardizedYppDefense", "standardizedPointsPerPlayOffense", "standardizedPointsPerPlayDefense", "returningProduction", "standardizedReturningProduction"];
  const csv = `${headers.join(",")}\n${outputRows.map((row) => headers.map((header) => csvCell(row[header as keyof typeof row])).join(",")).join("\n")}\n`;
  const v1CsvHeaders = ["rank", "team", "conference", "jkbPower", "jkbOffense", "jkbDefense", "sosPlayedRating", "sosPlayedRank", "sosRemainingRating", "sosRemainingRank", "rawPower", "rawOffense", "rawDefense", "games", "priorPerformanceSource", "sourceClassification", "transitionShrinkageApplied", "transitionPriorPerformanceWeight", "rawYppOffense", "rawYppDefenseAllowed", "adjustedYppOffense", "adjustedYppDefenseAllowed", "rawPointsPerPlayOffense", "rawPointsPerPlayDefenseAllowed", "adjustedPointsPerPlayOffense", "adjustedPointsPerPlayDefenseAllowed", "standardizedYppOffense", "standardizedYppDefense", "standardizedPointsPerPlayOffense", "standardizedPointsPerPlayDefense", "returningProduction", "standardizedReturningProduction", "sosProvenance"];
  const v1Csv = `${v1CsvHeaders.join(",")}\n${v1Rows.map((row) => v1CsvHeaders.map((header) => csvCell(row[header as keyof typeof row])).join(",")).join("\n")}\n`;
  const rawScheduleById = new Map(rawScheduleGames.map((game) => [String(game.id), game]));
  const v1Schedule = schedule.map((game) => {
    const source = rawScheduleById.get(game.id);
    return {
      ...game,
      awayTeamName: source?.awayTeam ?? game.awayTeamId,
      homeTeamName: source?.homeTeam ?? game.homeTeamId,
      awayClassification: source?.awayClassification ?? null,
      homeClassification: source?.homeClassification ?? null,
    };
  });
  const report = roundDeep({
    schemaVersion: "jkb-cfb-model-calibration-v1",
    baseline: { version: "cfb-preseason-v0.1", csvPath: "data/generated/cfb/2026-preseason-ratings.csv", sha256: sha256(baselineCsv), config: { priorOffense: 0.6, returningOffense: 0.25, qb: 0.15, priorDefense: 0.7, returningDefense: 0.3, offensePower: 0.5, defensePower: 0.5, opponentStrength: 0.55, opponentIterations: 12 }, rankings: baselineJson.rows.map((row) => ({ rank: row.rank, team: row.team, teamId: row.teamId })), top25: baselineJson.rows.filter((row) => (row.rank as number) <= 25).map((row) => ({ rank: row.rank, team: row.team })) },
    componentAudit,
    backtest: { methodology: { train: "2025 completed FBS-vs-FBS regular-season weeks 1-8", test: "2025 completed FBS-vs-FBS regular-season weeks 9-14", trainGames: split.train.length, testGames: split.test.length, leakageRule: "test game IDs are excluded from all training performance rows; margin translation is fit on training games only" }, baselines, v01PerformanceLayer: baselines.opponentAdjustedYardsPerPlay, candidateV02: candidateBacktest, strengthGrid, iterationGrid, recencyTests, postseasonTests },
    returningProduction: { sourceRows: returning.length, usableRows: returnByTeam.size, invalidRows: invalidReturningRows, historicalOutcomeCalibrationAvailable: false, conclusion: "2026 percentPPA cannot be validated against 2026 outcomes; 10% is a conservative provisional influence after standardization.", sensitivity: returnSensitivity },
    scheduleDataQuality: {
      teamsWithElevenCachedGames: [...scheduleCounts].filter(([, count]) => count === 11).map(([teamId]) => metadata.get(teamId)?.name),
      finding: "All eight are 2026 Pac-12 football members. The missing twelfth matchup is the conference's Week 13 home-and-home flex game, which is intentionally not fixed until at most six days before Nov. 28.",
      sosStatus: "provisional-incomplete-flex-schedule",
      officialSource: "https://pac-12.com/news/2026/5/26/pac-12s-2026-football-broadcast-schedule-and-kickoff-times-announced.aspx",
    },
    candidate: { config: CFB_V02_CANDIDATE_CONFIG, rankingStabilitySpearmanVsV01: rankCorrelation(baselineRatings, candidateRatings), top25: outputRows.slice(0, 25).map((row) => ({ rank: row.rank, team: row.team, conference: row.conference, jkbPower: row.jkbPower })), rows: outputRows },
    forensics: { v01: baselineForensics, v02: candidateForensics },
    anomalies: {
      candidateTeamCount: outputRows.length,
      missingOrNonFiniteRatings: outputRows.filter((row) => !finite(row.rawOffense) || !finite(row.rawDefense) || !finite(row.rawPower) || !finite(row.jkbPower)).map((row) => row.team),
      duplicateRanks: outputRows.length - new Set(outputRows.map((row) => row.rank)).size,
      transitionComparability: transition.map((row) => ({ team: metadata.get(row.teamId)?.name, source: "prior-fcs-fallback", games: row.sourceGameIds.length, opponentAdjusted: false, calibrationConclusionEligibility: false })),
      returningProductionInvalidRows: invalidReturningRows,
    },
  });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  writeAtomic(resolve(OUTPUT, "2026-preseason-ratings-v0.2-candidate.csv"), csv);
  writeAtomic(resolve(OUTPUT, "2026-preseason-ratings-v0.2-candidate.json"), `${JSON.stringify(roundDeep({ schemaVersion: "jkb-cfb-2026-preseason-ratings-v0.2-candidate", config: CFB_V02_CANDIDATE_CONFIG, rows: outputRows }), null, 2)}\n`);
  writeAtomic(resolve(OUTPUT, "2026-preseason-ratings-v1.csv"), v1Csv);
  writeAtomic(resolve(OUTPUT, "2026-preseason-ratings-v1.json"), `${JSON.stringify(roundDeep({
    schemaVersion: "jkb-cfb-2026-preseason-ratings-v1",
    modelVersion: CFB_V1_CONFIG.version,
    config: CFB_V1_CONFIG,
    teamCount: v1Rows.length,
    top25Count: v1Rows.filter((row) => (row.rank ?? 999) <= 25).length,
    scheduleGameCount: schedule.length,
    rows: v1Rows,
  }), null, 2)}\n`);
  writeAtomic(resolve(OUTPUT, "2026-schedule-v1.json"), `${JSON.stringify(v1Schedule, null, 2)}\n`);
  writeAtomic(resolve(OUTPUT, "model-calibration-report.json"), json);
  console.log(`[cfb:calibrate] baseline ${sha256(baselineCsv)}`);
  console.log(`[cfb:calibrate] ${split.train.length} train / ${split.test.length} test games; ${outputRows.length} candidate ratings`);
  console.log(`[cfb:calibrate] candidate CSV ${sha256(csv)}`);
  console.log(`[cfb:calibrate] production v1 CSV ${sha256(v1Csv)}`);
  if (process.argv.includes("--summary")) {
    console.log(JSON.stringify(roundDeep({ distributions, baselines, candidateBacktest, strengthGrid, iterationGrid, recencyTests, postseasonTests, returnSensitivity, invalidReturningRows, stability: rankCorrelation(baselineRatings, candidateRatings), top25: outputRows.slice(0, 25).map((row) => ({ rank: row.rank, team: row.team, power: row.jkbPower })), forensics: { v01: baselineForensics, v02: candidateForensics }, scheduleDataQuality: { eleven: [...scheduleCounts].filter(([, count]) => count === 11).map(([teamId]) => metadata.get(teamId)?.name), status: "provisional-incomplete-flex-schedule" } }), null, 2));
  }
  if (process.argv.includes("--compact-summary")) {
    console.log(JSON.stringify(roundDeep({ baselines, candidateBacktest, strengthGrid: strengthGrid.map(({ strength, straightUpAccuracy, marginCorrelation, mae }) => ({ strength, straightUpAccuracy, marginCorrelation, mae })), iterationGrid: iterationGrid.map(({ iterations, straightUpAccuracy, marginCorrelation, mae }) => ({ iterations, straightUpAccuracy, marginCorrelation, mae })), recencyTests: recencyTests.map(({ recency, straightUpAccuracy, marginCorrelation, mae }) => ({ recency, straightUpAccuracy, marginCorrelation, mae })), postseasonTests: postseasonTests.map(({ postseason, games, straightUpAccuracy, marginCorrelation, mae }) => ({ postseason, games, straightUpAccuracy, marginCorrelation, mae })), invalidReturningRows }), null, 2));
  }
}

main();
