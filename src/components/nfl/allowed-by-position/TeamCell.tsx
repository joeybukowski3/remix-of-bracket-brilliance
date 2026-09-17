import TeamLogo from "@/components/TeamLogo";
import { nflLogoUrl } from "@/data/nflPreseason2026";

/**
 * Shared Team-column identity cell for "N Allowed by Position" tables. On
 * mobile the abbreviation text is visually dropped (`hidden sm:inline`) to
 * reclaim width, leaving only the centered logo. The `role="group"` +
 * `aria-label` on the wrapper preserves the team name for assistive tech at
 * every breakpoint, independent of whether the text happens to be visible.
 */
export function renderAllowedByPositionTeamCell(team: string) {
  const abbreviation = team.toUpperCase();
  return (
    <span
      role="group"
      aria-label={abbreviation}
      className="flex w-full items-center justify-center gap-1.5 sm:justify-start"
    >
      <TeamLogo name={abbreviation} logo={nflLogoUrl(team)} className="h-5 w-5 shrink-0" />
      <span className="hidden sm:inline">{abbreviation}</span>
    </span>
  );
}
