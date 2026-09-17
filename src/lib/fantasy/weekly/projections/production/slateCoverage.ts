import { normalizeNflTeamAbbr } from "@/lib/nfl/identity/identity";

/** Publication gate; no identity, ranking, or projection calculation changes. */
export function assertFantasySlateCoverage(
  rows: readonly { team: string; opponent: string }[],
  games: readonly { season: number; week: number; seasonType: string; homeAbbr: string; awayAbbr: string }[],
  season: number,
  week: number,
): void {
  const pairs = new Set(games.filter((game) => game.season === season && game.week === week && game.seasonType === "REG").flatMap((game) => {
    const home = normalizeNflTeamAbbr(game.homeAbbr), away = normalizeNflTeamAbbr(game.awayAbbr);
    return [`${home}|${away}`, `${away}|${home}`];
  }));
  const covered = new Set(rows.map((row) => `${row.team}|${row.opponent}`));
  if (!rows.length || !pairs.size || [...pairs].some((pair) => !covered.has(pair)) || [...covered].some((pair) => !pairs.has(pair))) {
    throw new Error(`Week ${week} ${season} fantasy candidate coverage is incomplete or outside the current slate; refresh the weekly roster cache.`);
  }
}
