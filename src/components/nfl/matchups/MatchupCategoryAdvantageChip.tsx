import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import type { CategoryAdvantageResult } from "@/lib/nfl/matchupCategoryAdvantage";
import type { NflMatchupTeam } from "@/lib/nfl/matchups";

/**
 * The visual half of a category advantage, shared by the Team Comparison
 * accordion triggers and the category snapshot strip above them.
 *
 * Extracted so the two surfaces cannot drift into describing the same
 * `CategoryAdvantageResult` differently. Both render it inside a button and
 * both pair it with `describeCategoryAdvantage()` in an sr-only span, so this
 * is marked `aria-hidden` by its callers rather than announcing a second,
 * abbreviated version of the same result.
 *
 * A result is communicated by crest *and* abbreviation, never by logo or colour
 * alone. EVEN and N/A are muted badges and never get a crest: neither is a team
 * result. That mirrors the rule Overview's Category Advantage table follows.
 */
export default function MatchupCategoryAdvantageChip({
  result,
  away,
  home,
  crestSize = 16,
}: {
  result: CategoryAdvantageResult;
  away: NflMatchupTeam;
  home: NflMatchupTeam;
  crestSize?: number;
}) {
  const team = result.result === "away" ? away : result.result === "home" ? home : null;
  const side = result.result === "away" ? "away" : "home";

  if (!team) {
    return (
      <span className="rounded-md border border-slate-300 bg-slate-100 px-2 py-1 text-[12px] font-extrabold uppercase tracking-[0.06em] text-slate-600">
        {result.result === "even" ? "Even" : "N/A"}
      </span>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <NflTeamCrest team={team} side={side} size={crestSize} />
      <span className="text-[14px] font-extrabold uppercase tracking-wide text-emerald-700">
        {team.abbr.toUpperCase()}
      </span>
    </span>
  );
}

/**
 * The count in words: how many of the *comparable* metrics the leader leads.
 *
 * The denominator is `eligible` — metrics that could actually be compared — so a
 * category carrying N/A rows is never made to look weaker than it is. This is
 * one category's own count of the rows directly beneath it; deliberately no
 * percentage, no average rank and nothing summed across categories, per the
 * standing decision documented in matchupCategoryAdvantage.ts and
 * MatchupCategoryAdvantage.tsx.
 */
export function categoryAdvantageLeadText(result: CategoryAdvantageResult): string {
  if (result.result === "away") return `Leads ${result.awayLeads} of ${result.eligible}`;
  if (result.result === "home") return `Leads ${result.homeLeads} of ${result.eligible}`;
  if (result.result === "even") return `${result.awayLeads} each of ${result.eligible}`;
  return "No comparable metrics";
}
