export const FANTASY_PLAYER_POSITIONS = Object.freeze(["QB", "RB", "WR", "TE"]);

/** Refuses a completed-season source unless every supported position spans Weeks 1-18. */
export function validateCompletedPlayerWeekSeason(rows, season, filename = `stats_player_week_${season}.csv`) {
  const expectedWeeks = Array.from({ length: 18 }, (_, index) => index + 1);
  const coverage = {};
  for (const position of FANTASY_PLAYER_POSITIONS) {
    const positionRows = rows.filter((row) => String(row.position).toUpperCase() === position);
    const weeks = [...new Set(positionRows.map((row) => Number(row.week)))].sort((a, b) => a - b);
    if (weeks.length !== expectedWeeks.length || weeks.some((week, index) => week !== expectedWeeks[index])) {
      throw new Error(`${filename}: ${position} coverage is incomplete (${weeks.join(",") || "none"})`);
    }
    coverage[position] = {
      rows: positionRows.length,
      players: new Set(positionRows.map((row) => String(row.player_id))).size,
      weeks,
    };
  }
  const wrongSeason = rows.find((row) => Number(row.season) !== season);
  if (wrongSeason) throw new Error(`${filename}: contains a row outside season ${season}`);
  return coverage;
}
