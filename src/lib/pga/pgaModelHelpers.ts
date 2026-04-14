import type { PlayerModelRow, PgaTopProjection, PgaTournamentMeta, PgaWeightKey, PgaWeights, RawPgaPlayer } from "@/lib/pga/pgaTypes";

const FALLBACK_FIELD_SIZE = 83;

const RANK_FIELD_MAP: Record<Exclude<PgaWeightKey, "courseTrueSg">, keyof RawPgaPlayer> = {
  sgApproach: "SG: Approach the Green_rank",
  par4: "Par 4 Scoring Average_rank",
  drivingAccuracy: "Driving Accuracy %_rank",
  bogeyAvoidance: "Bogey Avoidance_rank",
  sgAroundGreen: "SG: Around the Green_rank",
  trendRank: "TrendRank",
  birdie125150: "Birdie or Better 125-150 yds_rank",
  sgPutting: "SG: Putting_rank",
  birdieUnder125: "Birdie or Better <125 yds_rank",
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

export function calculateCompositeScore(player: RawPgaPlayer, weights: PgaWeights, fieldSize: number) {
  const normalizedWeights = normalizeWeights(weights);
  let score = 0;

  (Object.entries(RANK_FIELD_MAP) as [Exclude<PgaWeightKey, "courseTrueSg">, keyof RawPgaPlayer][]).forEach(([weightKey, rankField]) => {
    const rank = player[rankField] as number | null;
    const weight = normalizedWeights[weightKey];
    if (rank == null || weight <= 0) return;
    score += ((fieldSize + 1 - rank) / fieldSize) * weight;
  });

  const courseWeight = normalizedWeights.courseTrueSg;
  if (player["Course True SG"] != null && courseWeight > 0) {
    score += Math.min(Math.max((player["Course True SG"] + 2) / 5, 0), 1) * courseWeight;
  }

  return score;
}

function buildCutsLast5(player: RawPgaPlayer) {
  const finishes = [player["2025"], player["2024"], player["2023"], player["2022"], player["2021"]];
  const cuts = finishes.filter((finish) => finish && finish !== "CUT").length;
  return `${cuts}/5`;
}

export function rankPlayersByScore(players: RawPgaPlayer[], weights: PgaWeights) {
  const fieldSize = Math.max(players.length, FALLBACK_FIELD_SIZE);
  const sorted = [...players]
    .map((player) => ({
      raw: player,
      score: calculateCompositeScore(player, weights, fieldSize),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.raw["Player Name"].localeCompare(b.raw["Player Name"]);
    });

  let lastScore: number | null = null;
  let lastRank = 0;

  return sorted.map(({ raw, score }, index): PlayerModelRow => {
    const rank = lastScore !== null && score === lastScore ? lastRank : index + 1;
    lastScore = score;
    lastRank = rank;

    return {
      id: raw["Player Name"],
      player: raw["Player Name"],
      score,
      rank,
      trendRank: raw.TrendRank,
      htRounds: raw["HT # Rounds"],
      cutsLast5: buildCutsLast5(raw),
      finish2025: raw["2025"],
      finish2024: raw["2024"],
      finish2023: raw["2023"],
      finish2022: raw["2022"],
      finish2021: raw["2021"],
      masters2026: raw["Masters 2026"],
      sgApproachRank: raw["SG: Approach the Green_rank"],
      par4Rank: raw["Par 4 Scoring Average_rank"],
      drivingAccuracyRank: raw["Driving Accuracy %_rank"],
      bogeyAvoidanceRank: raw["Bogey Avoidance_rank"],
      sgAroundGreenRank: raw["SG: Around the Green_rank"],
      birdie125150Rank: raw["Birdie or Better 125-150 yds_rank"],
      sgPuttingRank: raw["SG: Putting_rank"],
      birdieUnder125Rank: raw["Birdie or Better <125 yds_rank"],
      courseTrueSg: raw["Course True SG"],
    };
  });
}

export function getTopProjections(rows: PlayerModelRow[]): PgaTopProjection[] {
  return rows.slice(0, 5).map((row) => ({
    id: row.id,
    player: row.player,
    rank: row.rank,
    score: row.score,
    note:
      row.sgApproachRank != null && row.sgApproachRank <= 10
        ? "Elite approach profile this week"
        : row.courseTrueSg != null && row.courseTrueSg > 0.8
          ? "Strong Harbour Town history"
          : "Model-backed balance across key stats",
  }));
}

export function buildTournamentMeta(fieldSize: number): PgaTournamentMeta {
  return {
    title: "CURRENT TOURNAMENT",
    tournament: "RBC Heritage 2026",
    venue: "Harbour Town Golf Links, Hilton Head Island",
    fieldSize,
    fieldAverage: "70.4",
    cutLine: "-1",
    eventType: "Signature Event",
  };
}
