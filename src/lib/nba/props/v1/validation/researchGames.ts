/**
 * hoopR player box scores -> player-game rows for private research, for any of three seasons (2024-25, 2025-26, 2026-27).
 *
 * The production import (hooprAdapter.ts) is deliberately limited to the two seasons the board shows, so 2024-25 cannot
 * reach the board, its positions or its DvP. This module is the research-only counterpart: same exclusions and the same
 * identity rule, a wider season table, and no connection to the board. It is used by the validation script only.
 *
 * hoopR season numbers are the year the season ends: 2025 = 2024-25, 2026 = 2025-26, 2027 = 2026-27. Every exclusion is
 * counted; nothing is repaired or invented. Rights: ESPN-derived, private research only (docs/nba-props-v1.md).
 */
import { canonicalTeamCode } from "../../canonical";
import type { NbaSeasonType } from "../../seasonType";
import { seasonStartYear } from "../../seasonType";
import type { HooprPlayerBoxRow } from "../hooprAdapter";

export const RESEARCH_SEASONS: Readonly<Record<number, string>> = Object.freeze({ 2025: "2024-25", 2026: "2025-26", 2027: "2026-27" });
const SEASON_TYPES: Readonly<Record<number, NbaSeasonType>> = Object.freeze({ 1: "preseason", 2: "regular", 3: "playoffs", 5: "play_in" });

export interface ResearchGame {
  season: string;
  seasonType: NbaSeasonType;
  gameId: string;
  gameDate: string;
  team: string;
  opponent: string;
  isHome: boolean;
  playerId: string;
  playerName: string;
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
}

export interface ResearchReport {
  rowsRead: Record<string, number>;
  rowsKept: Record<string, number>;
  gamesKept: Record<string, number>;
  excluded: { unknownSeasonType: number; didNotPlay: number; noOrZeroMinutes: number; unknownTeam: number; unusable: number; incompleteGames: number };
}

const idOf = (value: HooprPlayerBoxRow["athlete_id"]): string | null => {
  const text = value === null || value === undefined ? "" : String(value).trim();
  return /^\d{1,12}$/.test(text) ? text : null;
};

/** A game date must fall between 1 September of the season's first year and 31 August of its second. */
function inSeasonWindow(season: string, date: string): boolean {
  const start = seasonStartYear(season);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= `${start}-09-01` && date <= `${start + 1}-08-31`;
}

export function normalizeResearchPlayerBox(files: ReadonlyArray<{ hooprSeason: number; rows: readonly HooprPlayerBoxRow[] }>): { rows: ResearchGame[]; report: ResearchReport } {
  const report: ResearchReport = { rowsRead: {}, rowsKept: {}, gamesKept: {}, excluded: { unknownSeasonType: 0, didNotPlay: 0, noOrZeroMinutes: 0, unknownTeam: 0, unusable: 0, incompleteGames: 0 } };
  const candidates: ResearchGame[] = [];
  for (const file of files) {
    const season = RESEARCH_SEASONS[file.hooprSeason];
    if (!season) throw new Error(`hoopR season ${file.hooprSeason} is not in the research mapping (2025 = 2024-25, 2026 = 2025-26, 2027 = 2026-27)`);
    for (const r of file.rows) {
      if (r.season !== file.hooprSeason) throw new Error(`a row of the hoopR ${file.hooprSeason} file carries season ${r.season}`);
      report.rowsRead[season] = (report.rowsRead[season] ?? 0) + 1;
      const seasonType = SEASON_TYPES[r.season_type];
      if (!seasonType) report.excluded.unknownSeasonType += 1;
      else if (r.did_not_play === true) report.excluded.didNotPlay += 1;
      else if (r.minutes === null || !(r.minutes > 0)) report.excluded.noOrZeroMinutes += 1;
      else {
        const team = canonicalTeamCode(r.team_abbreviation ?? "");
        const opponent = canonicalTeamCode(r.opponent_team_abbreviation ?? "");
        const playerId = idOf(r.athlete_id);
        const name = r.athlete_display_name?.trim();
        const home = r.home_away === "home" ? true : r.home_away === "away" ? false : null;
        if (team === null || opponent === null) report.excluded.unknownTeam += 1;
        else if (playerId === null || !name || home === null || r.points === null || r.rebounds === null || r.assists === null) report.excluded.unusable += 1;
        else {
          if (!inSeasonWindow(season, r.game_date)) throw new Error(`a ${season} row is dated ${r.game_date}, outside the season's window`);
          candidates.push({ season, seasonType, gameId: String(r.game_id), gameDate: r.game_date, team, opponent, isHome: home, playerId, playerName: name, minutes: r.minutes, pts: r.points, reb: r.rebounds, ast: r.assists });
        }
      }
    }
  }
  const teamsByGame = new Map<string, Set<string>>();
  for (const c of candidates) teamsByGame.set(`${c.season}|${c.gameId}`, (teamsByGame.get(`${c.season}|${c.gameId}`) ?? new Set()).add(c.team));
  const complete = new Set([...teamsByGame].filter(([, teams]) => teams.size === 2).map(([key]) => key));
  const rows = candidates.filter((c) => complete.has(`${c.season}|${c.gameId}`));
  report.excluded.incompleteGames = candidates.length - rows.length;
  const seen = new Set<string>();
  let duplicates = 0;
  for (const r of rows) {
    const key = `${r.season}|${r.gameId}|${r.playerId}`;
    if (seen.has(key)) duplicates += 1;
    seen.add(key);
    report.rowsKept[r.season] = (report.rowsKept[r.season] ?? 0) + 1;
  }
  // Only the count is reported: the message reaches the console, which never carries ids.
  if (duplicates > 0) throw new Error(`${duplicates} player-game row(s) appear twice in one game: the hoopR file is not usable`);
  for (const key of complete) {
    const season = key.split("|")[0];
    report.gamesKept[season] = (report.gamesKept[season] ?? 0) + 1;
  }
  return { rows, report };
}
