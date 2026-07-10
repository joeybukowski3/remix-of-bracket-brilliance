/**
 * Weekly Matchups data layer.
 *
 * Joins the generated schedule (public/data/nfl/<season>/games.json, loaded via
 * useNflSeasonData) with the normalized guide/power-rating source
 * (getNflSeasonGuide) to produce typed matchups for the /nfl/matchups pages.
 *
 * Design rules (see feature brief):
 *  - Never invent schedule, team, rating, or spread data. Every field traces to
 *    existing repository data; genuinely missing values stay null/undefined.
 *  - Slugs are deterministic and built from canonical team slugs so they stay
 *    consistent with the team dashboard route (/nfl/guide/team/:teamSlug).
 *  - Spread is structural only. The repository intentionally does not ingest
 *    betting lines, so no matchup carries a spread yet — the optional shape lets
 *    a future phase attach one without reshaping the pages.
 */

import type { NflGameRecord } from "@/lib/nfl/standings";
import type { NflSeasonGuide, NflGuideTeamNormalized } from "@/lib/nfl/guideData";

/** One side of a matchup: the resolved guide/power-rating team for a schedule slot. */
export type NflMatchupTeam = NflGuideTeamNormalized;

/**
 * Optional point-spread representation. Kept fully optional and unused for now:
 * the repository has no ingested lines, so pages render "N/A". A future odds
 * phase can populate this without changing consumers.
 */
export type NflMatchupSpread = {
  /** Canonical slug of the favored team. */
  favoriteSlug: string;
  /** Spread magnitude for the favorite (e.g. 3.5 means favorite -3.5). */
  value: number;
  /** Sportsbook / source name. */
  bookmaker?: string;
  /** ISO timestamp the line was fetched. */
  fetchedAt?: string;
  /** Provenance/state so stale or partial lines can be labeled. */
  status?: "live" | "stale" | "unavailable";
};

export type NflMatchup = {
  /** Deterministic, URL-safe id: `<away-slug>-at-<home-slug>` (or `-vs-` for neutral). */
  slug: string;
  gameId: string;
  season: number;
  week: number;
  /** REG | WC | DIV | CON | SB — mirrors the schedule record. */
  seasonType: string;
  /** ISO kickoff in UTC, or null when the schedule has no time yet. */
  kickoffUtc: string | null;
  stadium: string | null;
  away: NflMatchupTeam;
  home: NflMatchupTeam;
  /** True when the game is not played at the home team's venue (future use). */
  neutralSite: boolean;
  /** Structural only; null until a real line is ingested. */
  spread: NflMatchupSpread | null;
};

/**
 * Build a stable matchup slug from canonical team slugs.
 * `-at-` for standard home/away; `-vs-` for neutral-site games.
 * Uniqueness within a week is guaranteed because each team plays once per week.
 */
export function buildMatchupSlug(awaySlug: string, homeSlug: string, neutralSite = false): string {
  const joiner = neutralSite ? "-vs-" : "-at-";
  return `${awaySlug}${joiner}${homeSlug}`.toLowerCase();
}

/** Regular-season week numbers present in the schedule, ascending. */
export function getAvailableWeeks(games: NflGameRecord[]): number[] {
  const weeks = new Set<number>();
  for (const game of games) {
    if (game.seasonType === "REG") weeks.add(game.week);
  }
  return [...weeks].sort((a, b) => a - b);
}

/** Comparable kickoff time; games without a time sort last but keep a stable order. */
function kickoffSortKey(game: NflGameRecord): number {
  if (!game.dateUtc) return Number.POSITIVE_INFINITY;
  const t = Date.parse(game.dateUtc);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/**
 * Resolve one schedule record into a matchup, or null when either team cannot be
 * mapped to guide data (malformed row — skipped rather than rendered blank).
 */
export function buildMatchupFromGame(game: NflGameRecord, guide: NflSeasonGuide): NflMatchup | null {
  const away = guide.teamByAbbr.get(game.awayAbbr);
  const home = guide.teamByAbbr.get(game.homeAbbr);
  if (!away || !home) return null;

  return {
    slug: buildMatchupSlug(away.slug, home.slug, false),
    gameId: game.gameId,
    season: game.season,
    week: game.week,
    seasonType: game.seasonType,
    kickoffUtc: game.dateUtc,
    stadium: game.stadium,
    away,
    home,
    neutralSite: false,
    spread: null,
  };
}

/**
 * All regular-season matchups for a week, chronologically ordered.
 * Malformed rows (unresolvable teams) are skipped; a dev warning is emitted so
 * a single bad game never blanks the page.
 */
export function buildWeekMatchups(
  games: NflGameRecord[],
  guide: NflSeasonGuide,
  week: number
): NflMatchup[] {
  const weekGames = games
    .filter((game) => game.seasonType === "REG" && game.week === week)
    .sort((a, b) => kickoffSortKey(a) - kickoffSortKey(b) || a.gameId.localeCompare(b.gameId));

  const matchups: NflMatchup[] = [];
  for (const game of weekGames) {
    const matchup = buildMatchupFromGame(game, guide);
    if (matchup) {
      matchups.push(matchup);
    } else if (import.meta.env?.DEV) {
      console.warn(`[matchups] skipped ${game.gameId}: unresolved team (${game.awayAbbr} @ ${game.homeAbbr})`);
    }
  }
  return matchups;
}

/**
 * Find a single matchup by slug across the regular season.
 * Returns null for unknown/invalid slugs so the page can redirect safely.
 */
export function getMatchupBySlug(
  games: NflGameRecord[],
  guide: NflSeasonGuide,
  slug: string
): NflMatchup | null {
  const target = slug.toLowerCase();
  for (const game of games) {
    if (game.seasonType !== "REG") continue;
    const matchup = buildMatchupFromGame(game, guide);
    if (matchup && matchup.slug === target) return matchup;
  }
  return null;
}
