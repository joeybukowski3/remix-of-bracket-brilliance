/**
 * Source-independent identity for games and players.
 *
 * Datasets stay source-native (types.ts); this layer lets two providers be
 * compared, or one replace another, without re-keying history:
 *   game   = Eastern calendar date + franchise codes (no provider game id),
 *   player = an opaque canonical id linked explicitly per source.
 * Nothing here guesses: unknown team codes and unlinked players are reported.
 */
import type { NbaSeasonType } from "./seasonType";
import type { NbaSourceId } from "./sources/types";
import type { NbaPlayerGame } from "./types";

export const CANONICAL_TEAM_CODES = [
  "ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DAL", "DEN", "DET", "GSW", "HOU", "IND", "LAC", "LAL", "MEM", "MIA", "MIL", "MIN", "NOP", "NYK",
  "OKC", "ORL", "PHI", "PHX", "POR", "SAC", "SAS", "TOR", "UTA", "WAS",
] as const;

/** Alternate spellings seen across providers for the current franchises. */
const TEAM_CODE_ALIASES: Readonly<Record<string, string>> = {
  PHO: "PHX", BRK: "BKN", GS: "GSW", NO: "NOP", SA: "SAS", WSH: "WAS", UTAH: "UTA", CHO: "CHA", NY: "NYK",
};

const KNOWN_CODES: ReadonlySet<string> = new Set(CANONICAL_TEAM_CODES);

/**
 * Canonical three-letter franchise code, or null when unknown. Limited to the
 * current 30 franchises: older relocations (e.g. a pre-2014 "CHA") are
 * ambiguous and are never mapped by guess.
 */
export function canonicalTeamCode(code: string): string | null {
  const upper = code.trim().toUpperCase();
  const resolved = TEAM_CODE_ALIASES[upper] ?? upper;
  return KNOWN_CODES.has(resolved) ? resolved : null;
}

const ET_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });

/** The Eastern-time calendar date of an instant. NBA game dates are ET; providers that report UTC start times disagree by a day on late games. */
export function etGameDate(instantIso: string): string {
  // Date-only and zone-less strings parse as UTC midnight or machine-local time, which silently shifts games by a day.
  if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/i.test(instantIso)) throw new Error(`etGameDate needs a full ISO instant with an explicit UTC offset, got "${instantIso}"`);
  const instant = new Date(instantIso);
  if (Number.isNaN(instant.getTime())) throw new Error(`etGameDate got an invalid instant "${instantIso}"`);
  return ET_DATE.format(instant);
}

export interface GameKeyInput {
  /** Eastern calendar date, YYYY-MM-DD. */
  gameDate: string;
  homeCode: string | null;
  awayCode: string | null;
  /** Both participants for a neutral-site game (no home team). */
  neutralCodes?: readonly [string, string];
}

/** `YYYY-MM-DD|AWY@HOM`, or `YYYY-MM-DD|AAA-BBB` for neutral sites; null when any code is unknown. */
export function canonicalGameKey(input: GameKeyInput): string | null {
  if (input.neutralCodes) {
    const codes = input.neutralCodes.map(canonicalTeamCode);
    if (codes.some((c) => c === null)) return null;
    return `${input.gameDate}|${(codes as string[]).sort().join("-")}`;
  }
  const home = input.homeCode === null ? null : canonicalTeamCode(input.homeCode);
  const away = input.awayCode === null ? null : canonicalTeamCode(input.awayCode);
  return home && away ? `${input.gameDate}|${away}@${home}` : null;
}

export interface PlayerLink {
  sourceId: NbaSourceId;
  nativeId: string;
  canonicalId: string;
  /** How the link was established (name+birthdate match, vendor crosswalk table, manual review). */
  evidence: string;
}

export interface LinkConflict {
  code: "native_id_relinked" | "canonical_id_duplicated_in_source";
  link: PlayerLink;
  existing: PlayerLink;
}

/** Adds links. A link that contradicts an existing one is reported and not applied; nothing is overwritten. */
export function linkPlayers(existing: readonly PlayerLink[], incoming: readonly PlayerLink[]): { links: PlayerLink[]; conflicts: LinkConflict[] } {
  const links = [...existing];
  const conflicts: LinkConflict[] = [];
  for (const link of incoming) {
    const sameNative = links.find((l) => l.sourceId === link.sourceId && l.nativeId === link.nativeId);
    if (sameNative) {
      if (sameNative.canonicalId !== link.canonicalId) conflicts.push({ code: "native_id_relinked", link, existing: sameNative });
      continue;
    }
    const sameCanonical = links.find((l) => l.sourceId === link.sourceId && l.canonicalId === link.canonicalId);
    if (sameCanonical) {
      conflicts.push({ code: "canonical_id_duplicated_in_source", link, existing: sameCanonical });
      continue;
    }
    links.push(link);
  }
  return { links, conflicts };
}

export function resolvePlayer(links: readonly PlayerLink[], sourceId: NbaSourceId, nativeId: string): string | null {
  return links.find((l) => l.sourceId === sourceId && l.nativeId === nativeId)?.canonicalId ?? null;
}

export interface CanonicalPlayerGame {
  sourceId: NbaSourceId;
  sourceGameId: string;
  sourcePlayerId: string;
  canonicalGameKey: string;
  canonicalPlayerId: string;
  teamCode: string;
  season: string;
  seasonType: NbaSeasonType;
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
}

export interface CanonicalizeResult {
  rows: CanonicalPlayerGame[];
  /** Native player ids with no link, ascending. */
  unmappedPlayerIds: string[];
  /** Source game ids whose teams could not be resolved, ascending. */
  unresolvedGames: string[];
}

export function canonicalizePlayerGames(rows: readonly NbaPlayerGame[], sourceId: NbaSourceId, links: readonly PlayerLink[]): CanonicalizeResult {
  const unmapped = new Set<string>();
  const unresolved = new Set<string>();
  const out: CanonicalPlayerGame[] = [];
  for (const row of rows) {
    const home = row.isHome ? row.teamAbbr : row.opponentAbbr;
    const away = row.isHome ? row.opponentAbbr : row.teamAbbr;
    const gameKey = canonicalGameKey({ gameDate: row.gameDate, homeCode: home, awayCode: away });
    const teamCode = canonicalTeamCode(row.teamAbbr);
    const playerId = resolvePlayer(links, sourceId, String(row.playerId));
    if (gameKey === null || teamCode === null) unresolved.add(row.gameId);
    if (playerId === null) unmapped.add(String(row.playerId));
    if (gameKey === null || teamCode === null || playerId === null) continue;
    out.push({
      sourceId, sourceGameId: row.gameId, sourcePlayerId: String(row.playerId), canonicalGameKey: gameKey, canonicalPlayerId: playerId, teamCode,
      season: row.season, seasonType: row.seasonType, minutes: row.minutes, pts: row.pts, reb: row.reb, ast: row.ast,
    });
  }
  return { rows: out, unmappedPlayerIds: [...unmapped].sort(), unresolvedGames: [...unresolved].sort() };
}

export interface SourceComparison {
  sharedPlayerGames: number;
  onlyInA: number;
  onlyInB: number;
  mismatches: { pts: number; reb: number; ast: number; minutes: number };
  /** Share of shared player-games with no mismatch; null when nothing is shared. */
  agreementRate: number | null;
}

/** Agreement between two providers on the same canonical player-games: the evidence needed before one replaces another. */
export function compareSources(a: readonly CanonicalPlayerGame[], b: readonly CanonicalPlayerGame[], options: { minutesTolerance: number }): SourceComparison {
  const keyOf = (r: CanonicalPlayerGame) => `${r.canonicalGameKey}#${r.canonicalPlayerId}`;
  const bByKey = new Map(b.map((r) => [keyOf(r), r]));
  const mismatches = { pts: 0, reb: 0, ast: 0, minutes: 0 };
  let shared = 0;
  let agreeing = 0;
  for (const rowA of a) {
    const rowB = bByKey.get(keyOf(rowA));
    if (!rowB) continue;
    shared += 1;
    const diffs = {
      pts: rowA.pts !== rowB.pts,
      reb: rowA.reb !== rowB.reb,
      ast: rowA.ast !== rowB.ast,
      minutes: Math.abs(rowA.minutes - rowB.minutes) > options.minutesTolerance,
    };
    for (const stat of Object.keys(diffs) as (keyof typeof diffs)[]) if (diffs[stat]) mismatches[stat] += 1;
    if (!Object.values(diffs).some(Boolean)) agreeing += 1;
  }
  const aKeys = new Set(a.map(keyOf));
  return {
    sharedPlayerGames: shared,
    onlyInA: a.length - shared,
    onlyInB: b.filter((r) => !aKeys.has(keyOf(r))).length,
    mismatches,
    agreementRate: shared === 0 ? null : agreeing / shared,
  };
}
