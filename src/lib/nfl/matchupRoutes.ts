/**
 * Permanent NFL matchup detail URLs.
 *
 * `/nfl/matchups/:season/week-:week/:gameSlug` is the canonical, indexable
 * matchup page. Season and week come from the authoritative schedule record
 * (public/data/nfl/<season>/games.json) and the slug from buildMatchupSlug, so
 * a URL names exactly one game even though the same `away-at-home` slug recurs
 * every season (divisional games) and can in principle recur within a season.
 *
 * The former season-agnostic `/nfl/matchups/:gameSlug` path always resolved
 * against the 2026 schedule (the page was hard-wired to 2026). It permanently
 * redirects to the new URL: vercel.json carries generated 301 rules for every
 * 2026 slug (see buildLegacyNflMatchupRedirects), and NFLMatchupLegacyRedirect
 * is the client-side fallback for in-app and non-Vercel navigation.
 */
import type { NflGameRecord } from "@/lib/nfl/standings";
import type { NflSeasonGuide } from "@/lib/nfl/guideData";
import { buildMatchupFromGame, type NflMatchup } from "@/lib/nfl/matchups";

export const NFL_MATCHUPS_BASE_PATH = "/nfl/matchups";

/** The only season any legacy `/nfl/matchups/:gameSlug` URL ever referred to. */
export const LEGACY_NFL_MATCHUP_SEASON = 2026;

export type NflMatchupRouteKey = { season: number; week: number; slug: string };

const SEASON_SEGMENT = /^(\d{4})$/;
const WEEK_SEGMENT = /^week-([1-9]\d?)$/;
const SLUG_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Canonical matchup path: `/nfl/matchups/2026/week-4/los-angeles-chargers-at-buffalo-bills`. */
export function nflMatchupPath({ season, week, slug }: NflMatchupRouteKey): string {
  return `${NFL_MATCHUPS_BASE_PATH}/${season}/week-${week}/${slug}`;
}

/** Legacy season-agnostic path. Only redirects and their tests should build it. */
export function legacyNflMatchupPath(slug: string): string {
  return `${NFL_MATCHUPS_BASE_PATH}/${slug}`;
}

/** The matchup landing page filtered to one week (canonicalizes to /nfl/matchups). */
export function nflMatchupsWeekPath(week: number): string {
  return `${NFL_MATCHUPS_BASE_PATH}?week=${week}`;
}

/**
 * Strictly parse the three route segments. Returns null for anything that is
 * not exactly the canonical shape (e.g. `week-04`, `Week-4`, `26`), so a
 * malformed URL can never be treated as a valid, indexable page. The slug is
 * lowercased because the legacy resolver always accepted mixed case.
 */
export function parseNflMatchupRoute(params: {
  season?: string;
  weekSegment?: string;
  gameSlug?: string;
}): NflMatchupRouteKey | null {
  const season = SEASON_SEGMENT.exec(params.season ?? "");
  const week = WEEK_SEGMENT.exec(params.weekSegment ?? "");
  const slug = (params.gameSlug ?? "").toLowerCase();
  if (!season || !week || !SLUG_SEGMENT.test(slug)) return null;
  return { season: Number(season[1]), week: Number(week[1]), slug };
}

/** Every resolvable regular-season matchup in `season` whose slug is `slug`. */
export function findNflMatchupsBySlug(
  games: readonly NflGameRecord[],
  guide: NflSeasonGuide,
  season: number,
  slug: string
): NflMatchup[] {
  const target = slug.toLowerCase();
  const found: NflMatchup[] = [];
  for (const game of games) {
    if (game.seasonType !== "REG" || game.season !== season) continue;
    const matchup = buildMatchupFromGame(game, guide);
    if (matchup && matchup.slug === target) found.push(matchup);
  }
  return found;
}

/** The single game a canonical season/week/slug URL names, or null. */
export function findNflMatchup(
  games: readonly NflGameRecord[],
  guide: NflSeasonGuide,
  key: NflMatchupRouteKey
): NflMatchup | null {
  const matches = findNflMatchupsBySlug(games, guide, key.season, key.slug).filter(
    (matchup) => matchup.week === key.week
  );
  // Each team plays once per week, so more than one hit means corrupt data.
  return matches.length === 1 ? matches[0] : null;
}

/**
 * The game a season-scoped slug unambiguously names, or null when the slug is
 * unknown or matches more than one game (e.g. a same-venue rematch). Used by the
 * legacy redirect and to correct a valid slug requested under the wrong week;
 * an ambiguous slug is never guessed.
 */
export function resolveUniqueNflMatchup(
  games: readonly NflGameRecord[],
  guide: NflSeasonGuide,
  season: number,
  slug: string
): NflMatchup | null {
  const matches = findNflMatchupsBySlug(games, guide, season, slug);
  return matches.length === 1 ? matches[0] : null;
}

export type LegacyNflMatchupRedirect = { source: string; destination: string; permanent: true };

/**
 * Server-side (vercel.json) 301 rules for every unambiguous legacy slug, one
 * rule per week: `/nfl/matchups/:gameSlug(a-at-b|c-vs-d|…)` →
 * `/nfl/matchups/<season>/week-<n>/:gameSlug`. Each source matches only a single
 * path segment drawn from an explicit list, so it can never match a canonical
 * three-segment URL (no loop) or send an unknown or ambiguous slug anywhere.
 * Output is deterministic (week order, then kickoff/gameId order within a week).
 */
export function buildLegacyNflMatchupRedirects(
  games: readonly NflGameRecord[],
  guide: NflSeasonGuide,
  season: number = LEGACY_NFL_MATCHUP_SEASON
): LegacyNflMatchupRedirect[] {
  const bySlug = new Map<string, NflMatchup[]>();
  const ordered = [...games].sort((a, b) => a.week - b.week || a.gameId.localeCompare(b.gameId));
  for (const game of ordered) {
    if (game.seasonType !== "REG" || game.season !== season) continue;
    const matchup = buildMatchupFromGame(game, guide);
    if (!matchup) continue;
    bySlug.set(matchup.slug, [...(bySlug.get(matchup.slug) ?? []), matchup]);
  }

  const slugsByWeek = new Map<number, string[]>();
  for (const [slug, matchups] of bySlug) {
    if (matchups.length !== 1) continue; // ambiguous: left to the client fallback, which refuses to guess
    const week = matchups[0].week;
    slugsByWeek.set(week, [...(slugsByWeek.get(week) ?? []), slug]);
  }

  return [...slugsByWeek.entries()]
    .sort(([a], [b]) => a - b)
    .map(([week, slugs]) => ({
      source: `${NFL_MATCHUPS_BASE_PATH}/:gameSlug(${slugs.join("|")})`,
      destination: nflMatchupPath({ season, week, slug: ":gameSlug" }),
      permanent: true as const,
    }));
}
