import type { ClassifiedResearchPlay, CfbResearchPlayCategory, SeasonPlayTypeReport } from "../types";

const ALL_CATEGORIES: CfbResearchPlayCategory[] = [
  "rush",
  "pass",
  "sack",
  "penalty_no_play",
  "kneel",
  "spike",
  "punt",
  "kickoff",
  "field_goal",
  "pat",
  "two_point_try",
  "turnover",
  "defensive_score",
  "administrative",
  "unknown",
];

/** Builds the report from a pre-tallied rawPlayType -> {category, count} map, avoiding materializing one object per play for large seasons (Section 18 performance). */
export function buildSeasonPlayTypeReportFromTally(
  season: number,
  tally: ReadonlyMap<string, { category: CfbResearchPlayCategory; count: number }>,
): SeasonPlayTypeReport {
  const byCategory = Object.fromEntries(ALL_CATEGORIES.map((c) => [c, 0])) as Record<
    CfbResearchPlayCategory,
    number
  >;
  let totalPlays = 0;
  for (const { category, count } of tally.values()) {
    byCategory[category] += count;
    totalPlays += count;
  }

  const byRawPlayType = [...tally.entries()]
    .map(([rawPlayType, { category, count }]) => ({ rawPlayType, category, count }))
    .sort((a, b) => b.count - a.count);

  return {
    season,
    totalPlays,
    byCategory,
    byRawPlayType,
    unknownRawPlayTypes: byRawPlayType.filter((row) => row.category === "unknown").map((row) => row.rawPlayType),
  };
}

export function buildSeasonPlayTypeReport(
  season: number,
  plays: readonly ClassifiedResearchPlay[],
): SeasonPlayTypeReport {
  const tally = new Map<string, { category: CfbResearchPlayCategory; count: number }>();
  for (const play of plays) {
    const rawKey = play.rawPlayType ?? "(null)";
    const existing = tally.get(rawKey);
    if (existing) existing.count += 1;
    else tally.set(rawKey, { category: play.category, count: 1 });
  }
  return buildSeasonPlayTypeReportFromTally(season, tally);
}
