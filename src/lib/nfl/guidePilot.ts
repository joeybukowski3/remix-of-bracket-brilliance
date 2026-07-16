/**
 * Slugs rendered with the expanded team-chapter layout (GuideTeamChapter)
 * instead of the compact league-guide card (GuideTeamSection).
 *
 * This is the pilot mechanism for the chapter redesign: adding a slug here is
 * the only step needed to opt a team into the new layout. The eventual
 * league-wide rollout is expected to replace this allowlist with the default
 * for every team once the chapter format is validated, rather than growing
 * this set to 32 entries.
 */
export const NFL_GUIDE_PILOT_SLUGS: ReadonlySet<string> = new Set(["seattle-seahawks"]);

export function isNflGuidePilotTeam(slug: string): boolean {
  return NFL_GUIDE_PILOT_SLUGS.has(slug);
}
