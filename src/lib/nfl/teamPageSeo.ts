import type { NflGuideTeamNormalized } from "@/lib/nfl/guideData";
import { nflTeamPath } from "@/lib/nfl/teamRoutes";

/**
 * Metadata, intro copy and JSON-LD for the permanent team page at
 * /nfl/teams/:teamSlug. Every claim here is backed by a section the page
 * renders (header metric strip, current model trend, market comparison,
 * schedule, offseason moves, 2025 team statistics).
 */

/**
 * Mirrors CANONICAL_BASE in usePageSeo (asserted equal in tests). Not imported
 * so page tests that mock usePageSeo wholesale can still render the team page.
 */
export const NFL_TEAM_CANONICAL_ORIGIN = "https://www.joeknowsball.com";
const CANONICAL_BASE = NFL_TEAM_CANONICAL_ORIGIN;

type TeamSeoFields = Pick<
  NflGuideTeamNormalized,
  | "slug"
  | "teamName"
  | "division"
  | "record2025"
  | "projectedWins"
  | "marketWinTotal"
  | "powerRank"
  | "offenseRank"
  | "defenseRank"
  | "scheduleRank"
>;

export const NFL_TEAM_FALLBACK_TITLE = "2026 NFL Team Dashboard | Joe Knows Ball";
export const NFL_TEAM_FALLBACK_DESCRIPTION = "2026 NFL team rankings, statistics, schedule and odds.";

export function nflTeamCanonicalUrl(slug: string): string {
  return `${CANONICAL_BASE}${nflTeamPath(slug)}`;
}

export function buildNflTeamTitle(team: Pick<TeamSeoFields, "teamName">): string {
  return `${team.teamName} 2026 Team Rankings, Stats & Schedule | Joe Knows Ball`;
}

export function buildNflTeamDescription(team: Pick<TeamSeoFields, "teamName">): string {
  return `${team.teamName} 2026 team page: current power rating, offense and defense rankings, week-by-week schedule with matchup edges, win-total and futures odds, roster changes and 2025 team statistics.`;
}

/** 2-3 factual sentences built only from figures shown in the page header strip. */
export function buildNflTeamIntro(team: TeamSeoFields): string {
  const market = team.marketWinTotal == null ? "" : ` against a market win total of ${team.marketWinTotal.toFixed(1)}`;
  const schedule = team.scheduleRank == null ? "" : `, and rates their schedule #${team.scheduleRank} in difficulty (#1 = hardest)`;
  return [
    `The ${team.teamName} went ${team.record2025} in 2025 and play in the ${team.division}.`,
    `The Joe Knows Ball preseason guide projects ${team.projectedWins.toFixed(1)} wins${market}, ranks them #${team.powerRank} overall, #${team.offenseRank} on offense and #${team.defenseRank} on defense${schedule}.`,
    "The sections below track the current model rating, each 2026 matchup, market odds, roster changes and 2025 team statistics.",
  ].join(" ");
}

export function buildNflTeamStructuredData(team: Pick<TeamSeoFields, "slug" | "teamName">): Array<Record<string, unknown>> {
  const url = nflTeamCanonicalUrl(team.slug);
  return [
    {
      "@context": "https://schema.org",
      "@type": "SportsTeam",
      name: team.teamName,
      url,
      sport: "American Football",
      memberOf: { "@type": "SportsOrganization", name: "National Football League" },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${CANONICAL_BASE}/` },
        { "@type": "ListItem", position: 2, name: "NFL", item: `${CANONICAL_BASE}/nfl` },
        { "@type": "ListItem", position: 3, name: team.teamName, item: url },
      ],
    },
  ];
}
