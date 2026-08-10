import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUTPUT_DIR = resolve(ROOT, "data", "generated", "cfb");

type RatingRow = {
  rank: number | null;
  team: string;
  conference: string;
  teamId: string;
  jkbPower: number | null;
  jkbOffense: number | null;
  jkbDefense: number | null;
  sosRemainingRating: number | null;
  sosRemainingRank: number | null;
  sosPlayedRating: number | null;
  sosPlayedRank: number | null;
  priorOffense: number | null;
  priorDefense: number | null;
  opponentAdjustedOffense: number | null;
  opponentAdjustedDefense: number | null;
  returningProductionOffense: number | null;
  returningProductionDefense: number | null;
  returningQb: boolean | null;
  rosterTalentComposite: number | null;
  priorPerformanceSource: string | null;
  priorSampleGames: number;
  priorSourceClassification: string | null;
  inputProvenance: unknown;
  priorQa: { games: number };
  ratingBreakdown: {
    priorPerformanceContribution: unknown | null;
    returningProductionContribution: unknown | null;
    qbContinuityContribution: unknown | null;
  };
};

type GeneratedRatings = {
  insufficientDataTeams: string[];
  rows: RatingRow[];
};

type GeneratedScheduleGame = {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
};

const ratings = JSON.parse(
  readFileSync(resolve(OUTPUT_DIR, "2026-preseason-ratings.json"), "utf8"),
) as GeneratedRatings;
const schedule = JSON.parse(
  readFileSync(resolve(OUTPUT_DIR, "2026-schedule.json"), "utf8"),
) as GeneratedScheduleGame[];

const ranks = ratings.rows.map((row) => row.rank).filter((rank): rank is number => rank !== null);
const scheduleIds = schedule.map((game) => game.id);
const scheduleCounts = new Map<string, number>();
for (const game of schedule) {
  scheduleCounts.set(game.homeTeamId, (scheduleCounts.get(game.homeTeamId) ?? 0) + 1);
  scheduleCounts.set(game.awayTeamId, (scheduleCounts.get(game.awayTeamId) ?? 0) + 1);
}

const top25 = ratings.rows
  .filter((row) => row.rank !== null && row.rank <= 25)
  .sort((a, b) => (a.rank as number) - (b.rank as number))
  .map((row) => ({
    rank: row.rank,
    team: row.team,
    conference: row.conference,
    jkbPower: row.jkbPower,
    jkbOffense: row.jkbOffense,
    jkbDefense: row.jkbDefense,
    sosRemainingRank: row.sosRemainingRank,
  }));
const sosTop10 = [...ratings.rows]
  .filter((row) => row.sosRemainingRank !== null)
  .sort((a, b) => (a.sosRemainingRank as number) - (b.sosRemainingRank as number))
  .slice(0, 10)
  .map((row) => ({
    rank: row.sosRemainingRank,
    team: row.team,
    rating: row.sosRemainingRating,
  }));
const transitionTeams = ratings.rows
  .filter((row) => row.teamId === "ndsu" || row.teamId === "sac")
  .map((row) => ({
    team: row.team,
    conference: row.conference,
    priorGames: row.priorSampleGames,
    priorSourceClassification: row.priorSourceClassification,
    priorPerformanceSource: row.priorPerformanceSource,
    rawOffense: row.priorOffense,
    rawDefense: row.priorDefense,
    opponentAdjustedOffense: row.opponentAdjustedOffense,
    opponentAdjustedDefense: row.opponentAdjustedDefense,
    returningProductionOffense: row.returningProductionOffense,
    returningProductionDefense: row.returningProductionDefense,
    returningQb: row.returningQb,
    talent: row.rosterTalentComposite,
    jkbOffense: row.jkbOffense,
    jkbDefense: row.jkbDefense,
    jkbPower: row.jkbPower,
    jkbRank: row.rank,
    provenance: row.inputProvenance,
  }));

console.log(JSON.stringify({
  ratedTeams: ratings.rows.length - ratings.insufficientDataTeams.length,
  insufficientDataTeams: ratings.insufficientDataTeams,
  transitionTeams,
  top25,
  sosTop10,
  anomalies: {
    duplicateRanks: ranks.length - new Set(ranks).size,
    missingRanks: ratings.rows.filter((row) => row.rank === null).map((row) => row.team),
    missingRatings: ratings.rows.filter((row) =>
      row.jkbPower === null || row.jkbOffense === null || row.jkbDefense === null,
    ).map((row) => row.team),
    missingRemainingSos: ratings.rows.filter((row) => row.sosRemainingRank === null).map((row) => row.team),
    nonNullPlayedSos: ratings.rows.filter((row) =>
      row.sosPlayedRating !== null || row.sosPlayedRank !== null,
    ).map((row) => row.team),
    duplicateScheduleGameIds: scheduleIds.length - new Set(scheduleIds).size,
    scheduleCountsBelowTwelve: [...scheduleCounts].filter(([teamId, count]) =>
      !teamId.startsWith("cfbd:") && count < 12,
    ),
    scheduleCountsAboveThirteen: [...scheduleCounts].filter(([teamId, count]) =>
      !teamId.startsWith("cfbd:") && count > 13,
    ),
    tinyPriorSamplesUnderFive: ratings.rows.filter((row) => row.priorQa.games < 5).map((row) => ({
      team: row.team,
      games: row.priorQa.games,
    })),
    offenseDrivenOnlyByPrior: ratings.rows.filter((row) =>
      row.ratingBreakdown.priorPerformanceContribution !== null &&
      row.ratingBreakdown.returningProductionContribution === null &&
      row.ratingBreakdown.qbContinuityContribution === null,
    ).map((row) => row.team),
    defenseDrivenOnlyByPriorCount: ratings.rows.filter((row) =>
      row.returningProductionDefense === null,
    ).length,
  },
}, null, 2));
