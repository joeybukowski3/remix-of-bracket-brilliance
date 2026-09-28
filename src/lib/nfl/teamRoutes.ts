/**
 * Permanent NFL team dashboard URLs.
 *
 * `/nfl/teams/:teamSlug` is the canonical, indexable team page. The former
 * `/nfl/guide/team/:teamSlug` path permanently redirects here (vercel.json
 * 301 + a client-side <Navigate> for in-app and non-Vercel navigation).
 * Slugs come from the 2026 season guide (getNflSeasonGuide(2026).teamBySlug).
 */
export const NFL_TEAMS_BASE_PATH = "/nfl/teams";

export function nflTeamPath(teamSlug: string): string {
  return `${NFL_TEAMS_BASE_PATH}/${teamSlug}`;
}
