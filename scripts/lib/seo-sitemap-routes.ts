/**
 * Sitemap route registry.
 *
 * Decides WHICH canonical URLs are exposed to search engines and in which
 * child sitemap. Rendering lives in seo-sitemap-xml.ts.
 *
 * Inclusion rule: a URL is listed only when its page renders
 * `index, follow` with a self-referencing canonical (see usePageSeo and each
 * page's noindex flag). Tools, uploads, exports, internal/debug pages,
 * redirect-only routes, client aliases that canonicalize elsewhere and
 * query-string states are never listed; EXCLUDED_ROUTES documents the known
 * ones and the sitemap tests enforce both lists.
 *
 * Static routes are listed explicitly because the router is JSX (src/App.tsx)
 * and cannot be introspected safely. Dynamic routes are derived from the same
 * data and slug/path builders the pages use to resolve them, so a URL can only
 * appear here if its page would find a valid record for it.
 *
 * lastmod: omitted for every entry. See LASTMOD_POLICY below.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getNflSeasonGuide } from "@/lib/nfl/guideData";
import { buildMatchupFromGame } from "@/lib/nfl/matchups";
import type { NflGameRecord } from "@/lib/nfl/standings";
import { getAllTeams, getTeamsByConference } from "@/data/cfb";
import { CFB_CONFERENCES, CFB_CONFERENCE_ORDER } from "@/data/cfb/conferences";
import {
  CFB_BASE_PATH,
  CFB_RANKINGS_PATH,
  CFB_SCHEDULE_PATH,
  getCfbConferencePath,
  getCfbTeamPath,
} from "@/lib/cfb/routes";
import { researchStudies, researchStudyPath } from "@/data/researchStudies";
import { rbcHeritage2026Tournament } from "@/data/pga/tournaments/rbc-heritage-2026";
import { wellsFargoChampionship2026Tournament } from "@/data/pga/tournaments/wells-fargo-championship-2026";
import { GENERATED_PGA_TOURNAMENTS } from "@/data/pga/generated/registry";
import { getTournamentPicksPath, type PgaTournamentConfig } from "@/lib/pga/tournamentConfig";
import type { SitemapUrlEntry } from "./seo-sitemap-xml";

/**
 * lastmod policy (honest or absent):
 *  1. A real per-URL content modification date from a source artifact, or
 *  2. a stable, meaningful date from the relevant data source,
 *  3. otherwise no <lastmod> at all.
 * Never the build date, today's date, file-system timestamps or hard-coded
 * dates. No source currently qualifies: the NFL/MLB/PGA artifacts behind these
 * pages expose only `generatedAt` stamps that change on every scheduled
 * regeneration whether or not page content changed (games.json is rewritten
 * daily), research studies and PGA configs carry no modification date, and
 * CFB_PROVENANCE.generatedAt is a hand-maintained constant. Omitting lastmod
 * also keeps generated output deterministic, which the committed-file sync
 * check depends on.
 */
export const LASTMOD_POLICY = "omit-unless-trustworthy-source" as const;

/** Season whose team dashboards and matchup pages are live (see NFLTeamGuide2026 / NFLMatchupDetail). */
export const NFL_SITEMAP_SEASON = 2026;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export type SitemapSection = {
  file: string;
  description: string;
  entries: SitemapUrlEntry[];
};

function toEntries(paths: readonly string[]): SitemapUrlEntry[] {
  return paths.map((path) => ({ path }));
}

// ── Static routes ────────────────────────────────────────────────────────────

/** Home, MLB, PGA, World Cup, 16-0, research and support pages. */
export const STATIC_PAGE_PATHS = [
  "/",
  "/mlb",
  "/mlb/props",
  "/mlb/hr-props",
  "/mlb/strikeout-props",
  "/mlb/batter-vs-pitcher",
  "/mlb/sin-city",
  "/mlb/numerology",
  "/mlb/power-rankings",
  "/mlb/vulnerable-pitchers",
  "/pga",
  "/pga/best-bets",
  "/pga/model",
  "/pga/top-40-golf-picks",
  "/world-cup",
  // Every /16-0/* screen canonicalizes to /16-0.
  "/16-0",
  "/research-studies",
  "/support",
] as const;

/** NFL hub, league pages, guide and fantasy football pages. */
export const STATIC_NFL_PATHS = [
  "/nfl",
  "/nfl/power-ratings",
  "/nfl/standings",
  "/nfl/schedule",
  "/nfl/matchups",
  "/nfl/trends",
  "/nfl/analytics",
  "/nfl/yardage-props-review",
  "/nfl/td-scorer",
  "/nfl/fantasy-points-allowed",
  "/nfl/tds-allowed-by-position",
  "/nfl/super-bowl",
  "/nfl/betting-splits",
  "/nfl/coach-of-year",
  "/nfl/guide",
  "/nfl/guide/regression",
  "/fantasy-football/weekly-rankings",
  "/fantasy-football/points-allowed",
  "/fantasy-football/draft-preview",
] as const;

export const STATIC_CFB_PATHS = [CFB_BASE_PATH, CFB_RANKINGS_PATH, CFB_SCHEDULE_PATH] as const;

/**
 * Known routes that must never appear in a sitemap, with the reason. Prefix
 * entries (ending in "/*") exclude every path underneath.
 */
export const EXCLUDED_ROUTES: Readonly<Record<string, string>> = {
  "/nfl/dfs": "noindex upload tool",
  "/nfl/team-schedules": "noindex duplicate of team dashboards",
  "/nfl/team-schedules/*": "noindex duplicate of team dashboards",
  "/nfl/performance": "client redirect to /nfl/performance/overview",
  "/nfl/performance/*": "tab URLs canonicalize to /nfl/performance, which itself redirects",
  "/nfl/fantasy-position-matchups": "client redirect",
  "/nfl/2026-guide": "client redirect to /nfl/guide",
  "/fantasy-football":
    "renders the weekly board (getDefaultFantasyRankingMode() is 'weekly') and canonicalizes to /fantasy-football/weekly-rankings",
  "/fantasy-football/start-sit": "user-specific Sleeper lineup tool",
  "/pga/the-open-2026-picks-best-bets-odds":
    "sets only document.title: no canonical or robots metadata; list once it uses usePageSeo",
  "/pga/custom": "noindex weight builder",
  "/pga/dfs": "noindex salary upload tool",
  "/pga/legacy": "canonicalizes to /pga",
  "/pga/model/table": "noindex table view",
  "/pga/the-open-2026-model-value-bets": "client redirect",
  "/pga/wells-fargo-championship-2026-picks": "tournament marked indexable: false",
  "/world-cup/analyzer": "noindex query-driven tool",
  "/mlb-demo": "noindex demo",
  "/mlb/performance-preview": "noindex internal review page",
  "/mlb/hr-props/x-export": "noindex export page",
  "/mlb/strikeout-props/x-export": "noindex export page",
  "/mlb/numerology/x-export": "noindex export page",
  "/internal/*": "internal pages",
  "/walter": "noindex private research",
  "/steve": "noindex private dashboard",
  "/ncaa": "noindex legacy placeholder",
  "/ncaa/*": "noindex legacy NCAA pages",
  "/rankings": "redirect to /ncaa",
  "/schedule": "redirect to /ncaa/schedule",
  "/schedule/*": "redirect",
  "/matchup": "redirect",
  "/matchup/*": "redirect",
  "/betting-edge": "redirect",
  "/bracket": "redirect",
  "/march-madness": "redirect",
  "/team/*": "noindex legacy NCAA team pages",
  "/nba": "noindex coming-soon placeholder",
  "/odds-tracker": "noindex",
  "/public-betting": "client redirect to /odds-tracker",
  "/donate": "301 redirect to /support",
  "/mlb-daily-analysis": "301 redirect to /mlb",
  "/rbc-heritage-2026-picks": "legacy alias redirect",
  "/wells-fargo-championship-2026-picks": "legacy alias redirect",
  "/16-0/*": "sub-screens canonicalize to /16-0",
};

// ── Data-derived routes ──────────────────────────────────────────────────────

/** 2026 NFL team dashboards: /nfl/guide/team/:teamSlug from the season guide. */
export function buildNflTeamPaths(): string[] {
  const guide = getNflSeasonGuide(NFL_SITEMAP_SEASON);
  if (!guide) throw new Error(`No NFL season guide for ${NFL_SITEMAP_SEASON}`);
  return guide.teams.map((team) => `/nfl/guide/team/${team.slug}`);
}

export function loadNflSeasonGames(season = NFL_SITEMAP_SEASON): NflGameRecord[] {
  const file = resolve(REPO_ROOT, "public", "data", "nfl", String(season), "games.json");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { games?: NflGameRecord[] };
  if (!Array.isArray(parsed.games)) throw new Error(`${file} has no games array`);
  return parsed.games;
}

/**
 * Regular-season matchup pages: /nfl/matchups/:gameSlug.
 *
 * Mirrors getMatchupBySlug (the page's resolver): only REG games resolve, so
 * postseason/preseason rows are excluded by policy, and rows whose teams do not
 * map to the guide are skipped exactly as the page would fail to find them.
 */
export function buildNflMatchupPaths(games: readonly NflGameRecord[] = loadNflSeasonGames()): string[] {
  const guide = getNflSeasonGuide(NFL_SITEMAP_SEASON);
  if (!guide) throw new Error(`No NFL season guide for ${NFL_SITEMAP_SEASON}`);
  const paths: string[] = [];
  for (const game of games) {
    if (game.seasonType !== "REG" || game.season !== NFL_SITEMAP_SEASON) continue;
    const matchup = buildMatchupFromGame(game, guide);
    if (matchup) paths.push(`/nfl/matchups/${matchup.slug}`);
  }
  return paths;
}

export function buildCfbTeamPaths(): string[] {
  return getAllTeams().map((team) => getCfbTeamPath(team.slug));
}

/** Conferences in display order; a conference with no member teams would render empty, so it is skipped. */
export function buildCfbConferencePaths(): string[] {
  return CFB_CONFERENCE_ORDER.filter((id) => getTeamsByConference(id).length > 0).map((id) =>
    getCfbConferencePath(CFB_CONFERENCES[id].slug)
  );
}

export function buildResearchStudyPaths(): string[] {
  return researchStudies.map((study) => researchStudyPath(study.slug));
}

/**
 * Indexable PGA tournament picks pages (/pga/:tournamentSlug). Same source
 * arrays and first-wins de-duplication as PGA_TOURNAMENTS in
 * src/lib/pga/tournaments.ts, which cannot be imported outside Vite because it
 * reads import.meta.env at module load.
 */
export function buildPgaTournamentPaths(): string[] {
  const seen = new Set<string>();
  const tournaments: PgaTournamentConfig[] = [];
  for (const tournament of [rbcHeritage2026Tournament, wellsFargoChampionship2026Tournament, ...GENERATED_PGA_TOURNAMENTS]) {
    if (seen.has(tournament.slug)) continue;
    seen.add(tournament.slug);
    tournaments.push(tournament);
  }
  return tournaments.filter((tournament) => tournament.indexable !== false).map(getTournamentPicksPath);
}

// ── Assembly ─────────────────────────────────────────────────────────────────

export function buildSitemapSections(): SitemapSection[] {
  return [
    {
      file: "sitemap-pages.xml",
      description: "Home, MLB, PGA, World Cup, 16-0, research studies and support",
      entries: toEntries([...STATIC_PAGE_PATHS, ...buildPgaTournamentPaths(), ...buildResearchStudyPaths()]),
    },
    {
      file: "sitemap-nfl.xml",
      description: "NFL hub, league pages, 2026 guide and fantasy football",
      entries: toEntries(STATIC_NFL_PATHS),
    },
    {
      file: "sitemap-nfl-teams.xml",
      description: `${NFL_SITEMAP_SEASON} NFL team dashboards`,
      entries: toEntries(buildNflTeamPaths()),
    },
    {
      file: "sitemap-nfl-matchups.xml",
      description: `${NFL_SITEMAP_SEASON} NFL regular-season matchups`,
      entries: toEntries(buildNflMatchupPaths()),
    },
    {
      file: "sitemap-cfb.xml",
      description: "College football hub, rankings, schedule, conferences and teams",
      entries: toEntries([...STATIC_CFB_PATHS, ...buildCfbConferencePaths(), ...buildCfbTeamPaths()]),
    },
  ];
}

/** Returns the EXCLUDED_ROUTES key matching `path`, if any. */
export function matchExcludedRoute(path: string): string | undefined {
  return Object.keys(EXCLUDED_ROUTES).find((rule) =>
    rule.endsWith("/*") ? path.startsWith(rule.slice(0, -1)) : path === rule
  );
}
