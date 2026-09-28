import type { NflMatchup } from "@/lib/nfl/matchups";
import { NFL_MATCHUPS_BASE_PATH, nflMatchupPath, nflMatchupsWeekPath } from "@/lib/nfl/matchupRoutes";
import { NFL_TEAM_CANONICAL_ORIGIN } from "@/lib/nfl/teamPageSeo";

/**
 * Metadata and JSON-LD for the matchup page at
 * /nfl/matchups/:season/week-:week/:gameSlug. Every value comes from the
 * schedule record the route resolved; nothing (venue, status, odds) is filled
 * in when the record lacks it.
 */

/** Mirrors CANONICAL_BASE in usePageSeo (asserted equal in tests); not imported so page tests can mock that hook. */
const CANONICAL_BASE = NFL_TEAM_CANONICAL_ORIGIN;

type MatchupSeoFields = Pick<
  NflMatchup,
  "slug" | "season" | "week" | "kickoffUtc" | "stadium" | "neutralSite" | "away" | "home"
>;

export const NFL_MATCHUP_FALLBACK_TITLE = "NFL Weekly Matchup | Joe Knows Ball";
export const NFL_MATCHUP_FALLBACK_DESCRIPTION = "NFL weekly matchup preview.";

export function nflMatchupCanonicalUrl(matchup: Pick<NflMatchup, "season" | "week" | "slug">): string {
  return `${CANONICAL_BASE}${nflMatchupPath(matchup)}`;
}

/** "at" for a home game, "vs" at a neutral site -- the same rule as the slug joiner. */
function versus(matchup: Pick<NflMatchup, "neutralSite">): string {
  return matchup.neutralSite ? "vs" : "at";
}

export function buildNflMatchupName(matchup: MatchupSeoFields): string {
  return `${matchup.away.teamName} ${versus(matchup)} ${matchup.home.teamName}`;
}

export function buildNflMatchupTitle(matchup: MatchupSeoFields): string {
  return `${buildNflMatchupName(matchup)} — ${matchup.season} Week ${matchup.week} Matchup | Joe Knows Ball`;
}

export function buildNflMatchupDescription(matchup: MatchupSeoFields): string {
  const venue = matchup.neutralSite && matchup.stadium ? ` at ${matchup.stadium}` : "";
  return `${matchup.away.teamName} vs ${matchup.home.teamName} ${matchup.season} NFL Week ${matchup.week} preview${venue}: power ratings, side-by-side comparison, model advantages and matchup angles.`;
}

export function buildNflMatchupStructuredData(matchup: MatchupSeoFields): Array<Record<string, unknown>> {
  const url = nflMatchupCanonicalUrl(matchup);
  const name = buildNflMatchupName(matchup);
  const event: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name,
    url,
    sport: "American Football",
    homeTeam: { "@type": "SportsTeam", name: matchup.home.teamName },
    awayTeam: { "@type": "SportsTeam", name: matchup.away.teamName },
  };
  if (matchup.kickoffUtc) event.startDate = matchup.kickoffUtc;
  if (matchup.stadium) event.location = { "@type": "Place", name: matchup.stadium };

  return [
    event,
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${CANONICAL_BASE}/` },
        { "@type": "ListItem", position: 2, name: "NFL", item: `${CANONICAL_BASE}/nfl` },
        { "@type": "ListItem", position: 3, name: "Matchups", item: `${CANONICAL_BASE}${NFL_MATCHUPS_BASE_PATH}` },
        { "@type": "ListItem", position: 4, name: `Week ${matchup.week}`, item: `${CANONICAL_BASE}${nflMatchupsWeekPath(matchup.week)}` },
        { "@type": "ListItem", position: 5, name, item: url },
      ],
    },
  ];
}
