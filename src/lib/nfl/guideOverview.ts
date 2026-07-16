import { NFL_GUIDE_RECORDS, type NflGuideRecord } from "@/lib/nfl/guideRecord";

const LEADERBOARD_SIZE = 5;

export type NflGuideLeader = {
  team: NflGuideRecord;
  value: string;
  detail: string;
};

/**
 * Standard competition ranking (1, 2, 2, 4) over a descending numeric key.
 * Used to rank teams by market win total so the model and the market can be
 * compared on the same footing.
 */
function competitionRankDescending<T>(items: T[], valueOf: (item: T) => number): Map<T, number> {
  const sorted = [...items].sort((a, b) => valueOf(b) - valueOf(a));
  const ranks = new Map<T, number>();
  let lastValue: number | null = null;
  let lastRank = 0;
  sorted.forEach((item, index) => {
    const value = valueOf(item);
    const rank = lastValue !== null && value === lastValue ? lastRank : index + 1;
    ranks.set(item, rank);
    lastValue = value;
    lastRank = rank;
  });
  return ranks;
}

const ratedTeams = NFL_GUIDE_RECORDS.filter((team) => team.model !== null);
const marketTeams = ratedTeams.filter((team) => team.market !== null);

const marketRankByTeam = competitionRankDescending(marketTeams, (team) => team.market!.winTotal);

export type NflGuideMarketDisagreement = {
  team: NflGuideRecord;
  modelRank: number;
  marketRank: number;
  /** Positive: the model is higher on the team than the market. */
  rankGap: number;
};

/**
 * Model-versus-market expressed as a rank disagreement. The v0.3 artifact
 * publishes a 0-100 rating, not a projected win total, so ranks are the only
 * shared scale available without inventing a wins projection.
 */
export const NFL_GUIDE_MARKET_DISAGREEMENTS: NflGuideMarketDisagreement[] = marketTeams
  .map((team) => {
    const modelRank = team.model!.rank;
    const marketRank = marketRankByTeam.get(team)!;
    return { team, modelRank, marketRank, rankGap: marketRank - modelRank };
  })
  .sort((a, b) => Math.abs(b.rankGap) - Math.abs(a.rankGap) || a.modelRank - b.modelRank);

export const NFL_GUIDE_TOP_OVERALL: NflGuideLeader[] = ratedTeams
  .slice(0, LEADERBOARD_SIZE)
  .map((team) => ({
    team,
    value: team.model!.publicRating.toFixed(1),
    detail: `Model rank #${team.model!.rank}`,
  }));

export const NFL_GUIDE_TOP_OFFENSES: NflGuideLeader[] = [...ratedTeams]
  .sort((a, b) => b.model!.offenseRating - a.model!.offenseRating)
  .slice(0, LEADERBOARD_SIZE)
  .map((team, index) => ({
    team,
    value: team.model!.offenseRating.toFixed(1),
    detail: `Offense #${index + 1}`,
  }));

export const NFL_GUIDE_TOP_DEFENSES: NflGuideLeader[] = [...ratedTeams]
  .sort((a, b) => b.model!.defenseRating - a.model!.defenseRating)
  .slice(0, LEADERBOARD_SIZE)
  .map((team, index) => ({
    team,
    value: team.model!.defenseRating.toFixed(1),
    detail: `Defense #${index + 1}`,
  }));

const scheduledTeams = NFL_GUIDE_RECORDS.filter((team) => team.schedule !== null);

/** Warren Sharp strength of schedule, #1 = hardest. */
export const NFL_GUIDE_HARDEST_SCHEDULES: NflGuideLeader[] = [...scheduledTeams]
  .sort(
    (a, b) =>
      a.schedule!.strengthOfSchedule.hardestFirstRank - b.schedule!.strengthOfSchedule.hardestFirstRank,
  )
  .slice(0, LEADERBOARD_SIZE)
  .map((team) => ({
    team,
    value: `#${team.schedule!.strengthOfSchedule.hardestFirstRank}`,
    detail: "Hardest schedule",
  }));

export const NFL_GUIDE_EASIEST_SCHEDULES: NflGuideLeader[] = [...scheduledTeams]
  .sort(
    (a, b) =>
      b.schedule!.strengthOfSchedule.hardestFirstRank - a.schedule!.strengthOfSchedule.hardestFirstRank,
  )
  .slice(0, LEADERBOARD_SIZE)
  .map((team) => ({
    team,
    value: `#${team.schedule!.strengthOfSchedule.hardestFirstRank}`,
    detail: "Easiest schedule",
  }));
