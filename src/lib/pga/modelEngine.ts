import type { PgaTournamentConfig } from "@/lib/pga/tournamentConfig";
import type { PgaPlayerInput, PgaWeightKey, PgaWeights, PlayerModelRow, PgaTopProjection, RawPgaPlayer } from "@/lib/pga/pgaTypes";
import type { PgaTournamentPlayerAdjustment } from "@/lib/pga/tournamentOverrides";

const FALLBACK_FIELD_SIZE = 83;
const MIN_AVAILABLE_WEIGHTED_METRICS_RATIO = 0.5;
const MIN_AVAILABLE_WEIGHTED_METRICS_ABSOLUTE = 4;

const RANK_FIELD_MAP: Record<Exclude<PgaWeightKey, "courseTrueSg">, keyof PgaPlayerInput["statRanks"]> = {
  sgApproach: "sgApproachRank",
  par4: "par4Rank",
  drivingAccuracy: "drivingAccuracyRank",
  bogeyAvoidance: "bogeyAvoidanceRank",
  sgAroundGreen: "sgAroundGreenRank",
  trendRank: "trendRank",
  birdie125150: "birdie125150Rank",
  sgPutting: "sgPuttingRank",
  birdieUnder125: "birdieUnder125Rank",
};

export function formatCompositeScore(score: number) {
  return score.toFixed(2);
}

export function getWeightTotal(weights: PgaWeights) {
  return Object.values(weights).reduce((sum, value) => sum + value, 0);
}

export function areWeightsEqual(left: PgaWeights, right: PgaWeights) {
  return (Object.keys(left) as (keyof PgaWeights)[]).every((key) => left[key] === right[key]);
}

export function normalizeWeights(weights: PgaWeights) {
  const total = getWeightTotal(weights);
  if (total <= 0) return weights;

  return Object.fromEntries(Object.entries(weights).map(([key, value]) => [key, value / total])) as PgaWeights;
}

export function normalizeTournamentPlayerData(players: RawPgaPlayer[]): PgaPlayerInput[] {
  return players.map((player) => ({
    id: player["Player Name"],
    player: player["Player Name"],
    salary: sanitizeNullableNumber(player.Salary),
    courseHistoryRounds: sanitizeNullableNumber(player["HT # Rounds"]),
    courseHistoryScore: sanitizeNullableNumber(player["Course True SG"]),
    cutsLastFive: buildCutsLastFive(player),
    recentFinishes: [player["2025"], player["2024"], player["2023"], player["2022"], player["2021"]],
    statRanks: {
      trendRank: sanitizeNullableRank(player.TrendRank),
      sgApproachRank: sanitizeRankWithRawStat(player["SG: Approach the Green_rank"], player["SG: Approach the Green"]),
      par4Rank: sanitizeRankWithRawStat(player["Par 4 Scoring Average_rank"], player["Par 4 Scoring Average"]),
      drivingAccuracyRank: sanitizeRankWithRawStat(player["Driving Accuracy %_rank"], player["Driving Accuracy %"]),
      bogeyAvoidanceRank: sanitizeRankWithRawStat(player["Bogey Avoidance_rank"], player["Bogey Avoidance"]),
      sgAroundGreenRank: sanitizeRankWithRawStat(player["SG: Around the Green_rank"], player["SG: Around the Green"]),
      birdie125150Rank: sanitizeRankWithRawStat(player["Birdie or Better 125-150 yds_rank"], player["Birdie or Better 125-150 yds"]),
      sgPuttingRank: sanitizeRankWithRawStat(player["SG: Putting_rank"], player["SG: Putting"]),
      birdieUnder125Rank: sanitizeRankWithRawStat(player["Birdie or Better <125 yds_rank"], player["Birdie or Better <125 yds"]),
    },
  }));
}

export function calculateCompositeScore(player: PgaPlayerInput, weights: PgaWeights, fieldSize: number) {
  let weightedScore = 0;
  let availableWeightTotal = 0;
  let availableMetricCount = 0;
  let totalWeightedMetricCount = 0;

  (Object.entries(RANK_FIELD_MAP) as [Exclude<PgaWeightKey, "courseTrueSg">, keyof PgaPlayerInput["statRanks"]][])
    .forEach(([weightKey, rankField]) => {
      const rank = player.statRanks[rankField];
      const weight = weights[weightKey];
      if (weight <= 0) return;

      totalWeightedMetricCount += 1;
      if (rank == null) return;

      availableMetricCount += 1;
      availableWeightTotal += weight;
      weightedScore += ((fieldSize + 1 - rank) / fieldSize) * weight;
    });

  const courseWeight = weights.courseTrueSg;
  if (player.courseHistoryScore != null && courseWeight > 0) {
    availableMetricCount += 1;
    availableWeightTotal += courseWeight;
    weightedScore += Math.min(Math.max((player.courseHistoryScore + 2) / 5, 0), 1) * courseWeight;
  }
  if (courseWeight > 0) {
    totalWeightedMetricCount += 1;
  }

  const requiredMetricCount = Math.min(
    totalWeightedMetricCount,
    Math.max(MIN_AVAILABLE_WEIGHTED_METRICS_ABSOLUTE, Math.ceil(totalWeightedMetricCount * MIN_AVAILABLE_WEIGHTED_METRICS_RATIO)),
  );
  const isEligible = availableMetricCount >= requiredMetricCount && availableWeightTotal > 0;
  const score = availableWeightTotal > 0 ? weightedScore / availableWeightTotal : 0;

  return { score, isEligible };
}

export function rankPlayersByScore(players: PgaPlayerInput[], weights: PgaWeights, playerAdjustments: PgaTournamentPlayerAdjustment[] = []) {
  const fieldSize = Math.max(players.length, FALLBACK_FIELD_SIZE);
  const adjustmentMap = new Map(
    playerAdjustments.map((adjustment) => [normalizePlayerAdjustmentName(adjustment.player), adjustment]),
  );
  const sorted = [...players]
    .map((player) => ({
      raw: player,
      ...calculateCompositeScore(player, weights, fieldSize),
      scoreDelta: adjustmentMap.get(normalizePlayerAdjustmentName(player.player))?.scoreDelta ?? 0,
    }))
    .filter((player) => player.isEligible)
    .sort((a, b) => {
      const leftScore = a.score + a.scoreDelta;
      const rightScore = b.score + b.scoreDelta;
      if (rightScore !== leftScore) return rightScore - leftScore;
      return a.raw.player.localeCompare(b.raw.player);
    });

  let lastScore: number | null = null;
  let lastRank = 0;

  return sorted.map(({ raw, score, scoreDelta }, index): PlayerModelRow => {
    const adjustedScore = score + scoreDelta;
    const rank = lastScore !== null && adjustedScore === lastScore ? lastRank : index + 1;
    lastScore = adjustedScore;
    lastRank = rank;

    return {
      id: raw.id,
      player: raw.player,
      score: adjustedScore,
      rank,
      trendRank: raw.statRanks.trendRank,
      courseHistoryRounds: raw.courseHistoryRounds,
      cutsLastFive: raw.cutsLastFive,
      recentFinishes: raw.recentFinishes,
      sgApproachRank: raw.statRanks.sgApproachRank,
      par4Rank: raw.statRanks.par4Rank,
      drivingAccuracyRank: raw.statRanks.drivingAccuracyRank,
      bogeyAvoidanceRank: raw.statRanks.bogeyAvoidanceRank,
      sgAroundGreenRank: raw.statRanks.sgAroundGreenRank,
      birdie125150Rank: raw.statRanks.birdie125150Rank,
      sgPuttingRank: raw.statRanks.sgPuttingRank,
      birdieUnder125Rank: raw.statRanks.birdieUnder125Rank,
      courseHistoryScore: raw.courseHistoryScore,
    };
  });
}

function normalizePlayerAdjustmentName(player: string) {
  return player.trim().toLowerCase();
}

export function getTopProjections(rows: PlayerModelRow[], tournament: PgaTournamentConfig): PgaTopProjection[] {
  return rows.slice(0, 5).map((row) => {
    const primaryRank = row[tournament.model.topProjectionPrimaryStatKey];
    return {
      id: row.id,
      player: row.player,
      rank: row.rank,
      score: row.score,
      note:
        typeof primaryRank === "number" && primaryRank <= 10
          ? `Elite ${tournament.model.topProjectionPrimaryStatLabel.toLowerCase()} profile`
          : row.courseHistoryScore != null && row.courseHistoryScore > 0.8
            ? `Strong ${tournament.model.courseHistoryDisplay} history`
            : "Model-backed balance across key stats",
    };
  });
}

export function buildTournamentMeta(tournament: PgaTournamentConfig, fieldSize: number) {
  return {
    title: "Current Tournament",
    tournament: `${tournament.name} ${tournament.season}`,
    venue: `${tournament.courseName}, ${tournament.location}`,
    fieldSize,
    fieldAverage: tournament.model.fieldAverage,
    cutLine: tournament.model.cutLine,
    eventType: tournament.model.eventType,
    noCutLabel: tournament.model.noCutLabel,
    picksPath: `/pga/${tournament.slug}`,
  };
}

function buildCutsLastFive(player: RawPgaPlayer) {
  const finishes = [player["2025"], player["2024"], player["2023"], player["2022"], player["2021"]];
  const hasHistory = finishes.some((finish) => Boolean(finish));
  if (!hasHistory) return null;
  const cuts = finishes.filter((finish) => finish && finish !== "CUT").length;
  return `${cuts}/5`;
}

function sanitizeNullableNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function sanitizeNullableRank(value: unknown) {
  const numericValue = sanitizeNullableNumber(value);
  if (numericValue == null || numericValue <= 0) return null;
  return numericValue;
}

function sanitizeRankWithRawStat(rankValue: unknown, rawStatValue: unknown) {
  if (sanitizeNullableNumber(rawStatValue) == null) return null;
  return sanitizeNullableRank(rankValue);
}
