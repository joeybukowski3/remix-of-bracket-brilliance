import type { PgaTournamentConfig } from "@/lib/pga/tournamentConfig";
import type { PgaPlayerInput, PgaWeightKey, PgaWeights, PlayerModelRow, PgaTopProjection, RawPgaPlayer } from "@/lib/pga/pgaTypes";

const FALLBACK_FIELD_SIZE = 83;

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
    salary: player.Salary ?? null,
    courseHistoryRounds: player["HT # Rounds"],
    courseHistoryScore: player["Course True SG"],
    cutsLastFive: buildCutsLastFive(player),
    relatedEventFinish: player["Masters 2026"],
    recentFinishes: [player["2025"], player["2024"], player["2023"], player["2022"], player["2021"]],
    statRanks: {
      trendRank: player.TrendRank,
      sgApproachRank: player["SG: Approach the Green_rank"],
      par4Rank: player["Par 4 Scoring Average_rank"],
      drivingAccuracyRank: player["Driving Accuracy %_rank"],
      bogeyAvoidanceRank: player["Bogey Avoidance_rank"],
      sgAroundGreenRank: player["SG: Around the Green_rank"],
      birdie125150Rank: player["Birdie or Better 125-150 yds_rank"],
      sgPuttingRank: player["SG: Putting_rank"],
      birdieUnder125Rank: player["Birdie or Better <125 yds_rank"],
    },
  }));
}

export function calculateCompositeScore(player: PgaPlayerInput, weights: PgaWeights, fieldSize: number) {
  const normalizedWeights = normalizeWeights(weights);
  let score = 0;

  (Object.entries(RANK_FIELD_MAP) as [Exclude<PgaWeightKey, "courseTrueSg">, keyof PgaPlayerInput["statRanks"]][])
    .forEach(([weightKey, rankField]) => {
      const rank = player.statRanks[rankField];
      const weight = normalizedWeights[weightKey];
      if (rank == null || weight <= 0) return;
      score += ((fieldSize + 1 - rank) / fieldSize) * weight;
    });

  const courseWeight = normalizedWeights.courseTrueSg;
  if (player.courseHistoryScore != null && courseWeight > 0) {
    score += Math.min(Math.max((player.courseHistoryScore + 2) / 5, 0), 1) * courseWeight;
  }

  return score;
}

export function rankPlayersByScore(players: PgaPlayerInput[], weights: PgaWeights) {
  const fieldSize = Math.max(players.length, FALLBACK_FIELD_SIZE);
  const sorted = [...players]
    .map((player) => ({
      raw: player,
      score: calculateCompositeScore(player, weights, fieldSize),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.raw.player.localeCompare(b.raw.player);
    });

  let lastScore: number | null = null;
  let lastRank = 0;

  return sorted.map(({ raw, score }, index): PlayerModelRow => {
    const rank = lastScore !== null && score === lastScore ? lastRank : index + 1;
    lastScore = score;
    lastRank = rank;

    return {
      id: raw.id,
      player: raw.player,
      score,
      rank,
      trendRank: raw.statRanks.trendRank,
      courseHistoryRounds: raw.courseHistoryRounds,
      cutsLastFive: raw.cutsLastFive,
      recentFinishes: raw.recentFinishes,
      relatedEventFinish: raw.relatedEventFinish,
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
  const cuts = finishes.filter((finish) => finish && finish !== "CUT").length;
  return `${cuts}/5`;
}
