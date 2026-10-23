/**
 * hoopR (sportsdataverse/hoopR-nba-data) player box scores -> the V1 player-game import.
 *
 * hoopR season numbers are the YEAR THE SEASON ENDS: hoopR 2026 = 2025-26 and hoopR 2027 = 2026-27. The mapping is a
 * fixed table and any other season is an error, so a season can never be silently shifted.
 *
 * Every exclusion is explicit and counted in the report; nothing is repaired or invented:
 *  - rows flagged did-not-play, and rows with no minutes or zero minutes (a projection is conditional on appearing);
 *  - rows whose team is not an NBA franchise (the All-Star game's STARS, STRIPES and WORLD teams);
 *  - rows of an unrecognised season type;
 *  - every row of a game that does not have exactly two teams left after the above (the import is strict about that).
 * Player identity is the ESPN athlete id as a string (the same id Wikidata's P3685 uses). Names are display only.
 *
 * Rights: hoopR is CC BY 4.0 but ESPN is the upstream source and its reuse terms are unresolved. The registry records
 * only a private-research decision for this source, so nothing derived from it can reach the public board.
 */
import { canonicalTeamCode } from "../canonical";
import type { NbaSeasonType } from "../seasonType";
import { PLAYER_GAMES_SCHEMA, parsePlayerGameImport, type ImportedPlayerGame, type PlayerGameImport } from "./playerGameImport";

/** hoopR season (year the season ends) -> product season label. */
export const HOOPR_SEASONS: Readonly<Record<number, "2025-26" | "2026-27">> = Object.freeze({ 2026: "2025-26", 2027: "2026-27" });

/** ESPN season_type codes as they appear in hoopR box scores. */
const SEASON_TYPES: Readonly<Record<number, NbaSeasonType>> = Object.freeze({ 1: "preseason", 2: "regular", 3: "playoffs", 5: "play_in" });

export interface HooprPlayerBoxRow {
  game_id: number | string;
  season: number;
  season_type: number;
  game_date: string;
  athlete_id: number | string | null;
  athlete_display_name: string | null;
  team_abbreviation: string | null;
  opponent_team_abbreviation: string | null;
  home_away: string | null;
  minutes: number | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  starter: boolean | null;
  did_not_play: boolean | null;
  athlete_position_abbreviation: string | null;
}

export interface HooprManifestInfo {
  commit: string;
  retrievedAtUtc: string;
  files: ReadonlyArray<{ name: string; sha256: string; bytes: number }>;
}

/** One player in one season: who they played for last, how much, and ESPN's own position listing. */
export interface PlayerSeasonSummary {
  season: "2025-26" | "2026-27";
  playerId: string;
  name: string;
  /** Canonical code of the team of the player's most recent game that season. */
  team: string;
  games: number;
  starts: number;
  minutes: number;
  /** ESPN's position abbreviation counts across the player's rows (G, F, C, or occasionally a specific code). */
  espnPositions: Record<string, number>;
}

export interface HooprImportReport {
  rowsRead: Record<string, number>;
  rowsImported: Record<string, number>;
  gamesImported: Record<string, number>;
  excluded: {
    didNotPlay: number;
    noOrZeroMinutes: number;
    /** Rows missing an id, a name, a home flag or a PTS/REB/AST value. */
    unusableRows: number;
    unknownTeam: number;
    unknownTeamCodes: string[];
    unknownSeasonType: number;
    incompleteGames: number;
    incompleteGameIds: string[];
  };
  identity: { playersBySeason: Record<string, number>; namesChanged: string[]; sharedNames: string[] };
  seasonMapping: typeof HOOPR_SEASONS;
}

export interface HooprNormalization {
  imported: PlayerGameImport;
  players: PlayerSeasonSummary[];
  report: HooprImportReport;
}

const bump = (counts: Record<string, number>, key: string, by = 1): void => {
  counts[key] = (counts[key] ?? 0) + by;
};

const idOf = (value: HooprPlayerBoxRow["athlete_id"]): string | null => {
  const text = value === null || value === undefined ? "" : String(value).trim();
  return /^\d{1,12}$/.test(text) ? text : null;
};

interface Candidate {
  row: ImportedPlayerGame;
  starter: boolean;
  espnPosition: string | null;
}

function toCandidate(r: HooprPlayerBoxRow, season: "2025-26" | "2026-27", seasonType: NbaSeasonType): Candidate | "team" | "identity" {
  const team = canonicalTeamCode(r.team_abbreviation ?? "");
  const opponent = canonicalTeamCode(r.opponent_team_abbreviation ?? "");
  if (team === null || opponent === null) return "team";
  const playerId = idOf(r.athlete_id);
  const name = r.athlete_display_name?.trim();
  const home = r.home_away === "home" ? true : r.home_away === "away" ? false : null;
  if (playerId === null || !name || home === null || r.points === null || r.rebounds === null || r.assists === null || r.minutes === null) return "identity";
  return {
    row: { season, seasonType, gameId: String(r.game_id), gameDate: r.game_date, team, opponent, isHome: home, playerId, playerName: name, minutes: r.minutes, pts: r.points, reb: r.rebounds, ast: r.assists },
    starter: r.starter === true,
    espnPosition: r.athlete_position_abbreviation,
  };
}

/** Team, role and minutes come from competitive games only: a preseason stint with a team that was later cut must not decide them. */
function summarize(all: readonly Candidate[]): PlayerSeasonSummary[] {
  const candidates = all.filter((c) => c.row.seasonType !== "preseason");
  const groups = new Map<string, Candidate[]>();
  for (const c of candidates) groups.set(`${c.row.season}|${c.row.playerId}`, [...(groups.get(`${c.row.season}|${c.row.playerId}`) ?? []), c]);
  return [...groups.values()]
    .map((list): PlayerSeasonSummary => {
      const latest = [...list].sort((a, b) => b.row.gameDate.localeCompare(a.row.gameDate) || b.row.gameId.localeCompare(a.row.gameId))[0];
      const espnPositions: Record<string, number> = {};
      for (const c of list) if (c.espnPosition) bump(espnPositions, c.espnPosition);
      return {
        season: latest.row.season,
        playerId: latest.row.playerId,
        name: latest.row.playerName,
        team: latest.row.team,
        games: list.length,
        starts: list.filter((c) => c.starter).length,
        minutes: list.reduce((s, c) => s + c.row.minutes, 0),
        espnPositions,
      };
    })
    .sort((a, b) => a.season.localeCompare(b.season) || a.playerId.localeCompare(b.playerId));
}

/** Names that disagree for one id, and names that two ids share: identity warnings, never silently merged. */
function identityNotes(rows: readonly ImportedPlayerGame[]): { namesChanged: string[]; sharedNames: string[] } {
  const namesById = new Map<string, Set<string>>();
  const idsByName = new Map<string, Set<string>>();
  for (const r of rows) {
    namesById.set(r.playerId, (namesById.get(r.playerId) ?? new Set()).add(r.playerName));
    idsByName.set(r.playerName, (idsByName.get(r.playerName) ?? new Set()).add(r.playerId));
  }
  return {
    namesChanged: [...namesById].filter(([, n]) => n.size > 1).map(([id, n]) => `${id}: ${[...n].sort().join(" / ")}`).sort(),
    sharedNames: [...idsByName].filter(([, ids]) => ids.size > 1).map(([name, ids]) => `${name}: ${[...ids].sort().join(", ")}`).sort(),
  };
}

export function hooprProvenance(manifest: HooprManifestInfo): string {
  const files = manifest.files.map((f) => `${f.name} sha256 ${f.sha256.slice(0, 12)}`).join("; ");
  return `hoopR-nba-data (sportsdataverse, CC BY 4.0) commit ${manifest.commit}; ${files}. ESPN-derived: ESPN's commercial and public reuse terms are unresolved. Private analysis and preview only, under the owner's 2026-10-23 decision; this is not ESPN permission. Changes: columns selected and renamed, DNP and zero-minute rows excluded.`;
}

type Excluded = HooprImportReport["excluded"];
type SeasonFile = { hooprSeason: number; rows: readonly HooprPlayerBoxRow[] };

/** Pass 1: validate each file's season, count and set aside every row that cannot be used, keep the rest as candidates. */
function collectCandidates(files: readonly SeasonFile[], excluded: Excluded): { candidates: Candidate[]; rowsRead: Record<string, number> } {
  const rowsRead: Record<string, number> = {};
  const unknownCodes = new Set<string>();
  const candidates: Candidate[] = [];
  for (const file of files) {
    const season = HOOPR_SEASONS[file.hooprSeason];
    if (!season) throw new Error(`hoopR season ${file.hooprSeason} is not in the mapping (2026 = 2025-26, 2027 = 2026-27)`);
    for (const r of file.rows) {
      if (r.season !== file.hooprSeason) throw new Error(`a row of the hoopR ${file.hooprSeason} file carries season ${r.season}`);
      bump(rowsRead, season);
      const seasonType = SEASON_TYPES[r.season_type];
      if (!seasonType) excluded.unknownSeasonType += 1;
      else if (r.did_not_play === true) excluded.didNotPlay += 1;
      else if (r.minutes === null || !(r.minutes > 0)) excluded.noOrZeroMinutes += 1;
      else {
        const candidate = toCandidate(r, season, seasonType);
        if (candidate === "team") {
          excluded.unknownTeam += 1;
          unknownCodes.add(`${r.team_abbreviation}/${r.opponent_team_abbreviation}`);
        } else if (candidate === "identity") excluded.unusableRows += 1;
        else candidates.push(candidate);
      }
    }
  }
  excluded.unknownTeamCodes = [...unknownCodes].sort();
  return { candidates, rowsRead };
}

/** Pass 2: a game must have exactly two teams left; every row of any other game is set aside and counted. */
function dropIncompleteGames(candidates: readonly Candidate[], excluded: Excluded): Candidate[] {
  const teamsByGame = new Map<string, Set<string>>();
  for (const c of candidates) teamsByGame.set(`${c.row.season}|${c.row.gameId}`, (teamsByGame.get(`${c.row.season}|${c.row.gameId}`) ?? new Set()).add(c.row.team));
  const incomplete = new Set([...teamsByGame].filter(([, teams]) => teams.size !== 2).map(([key]) => key));
  excluded.incompleteGames = incomplete.size;
  excluded.incompleteGameIds = [...incomplete].sort().slice(0, 20);
  return candidates.filter((c) => !incomplete.has(`${c.row.season}|${c.row.gameId}`));
}

/** Pass 3: the report of what was imported. */
function reportOf(imported: PlayerGameImport, players: readonly PlayerSeasonSummary[], rowsRead: Record<string, number>, excluded: Excluded): HooprImportReport {
  const rowsImported: Record<string, number> = {};
  const gamesImported: Record<string, Set<string>> = {};
  for (const r of imported.rows) {
    bump(rowsImported, r.season);
    (gamesImported[r.season] ??= new Set()).add(r.gameId);
  }
  const playersBySeason: Record<string, number> = {};
  for (const p of players) bump(playersBySeason, p.season);
  return {
    rowsRead,
    rowsImported,
    gamesImported: Object.fromEntries(Object.entries(gamesImported).map(([s, g]) => [s, g.size])),
    excluded,
    identity: { playersBySeason, ...identityNotes(imported.rows) },
    seasonMapping: HOOPR_SEASONS,
  };
}

/**
 * Normalizes hoopR player box rows (one entry per hoopR season file) into the strict V1 import.
 * Throws if a file's season is not in the fixed mapping or a row's season disagrees with its file.
 */
export function normalizeHooprPlayerBox(files: readonly SeasonFile[], manifest: HooprManifestInfo): HooprNormalization {
  const excluded: Excluded = { didNotPlay: 0, noOrZeroMinutes: 0, unusableRows: 0, unknownTeam: 0, unknownTeamCodes: [], unknownSeasonType: 0, incompleteGames: 0, incompleteGameIds: [] };
  const { candidates, rowsRead } = collectCandidates(files, excluded);
  const kept = dropIncompleteGames(candidates, excluded);
  const rows = kept.map((c) => c.row).sort((a, b) => a.gameDate.localeCompare(b.gameDate) || a.gameId.localeCompare(b.gameId) || a.team.localeCompare(b.team) || a.playerId.localeCompare(b.playerId));
  const imported = parsePlayerGameImport({
    schemaVersion: PLAYER_GAMES_SCHEMA,
    source: { sourceId: "hoopr-espn", retrievedAtUtc: manifest.retrievedAtUtc, provenance: hooprProvenance(manifest) },
    rows,
  });
  const players = summarize(kept);
  return { imported, players, report: reportOf(imported, players, rowsRead, excluded) };
}
