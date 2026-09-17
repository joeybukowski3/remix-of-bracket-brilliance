import { NFL_POWER_RATINGS } from "@/data/nflPreseason2026";
import { TeamLogo } from "@/components/nfl/history/NflTeamLogo";

export { TeamLogo };

const TEAM_NAME_BY_ABBR = new Map(NFL_POWER_RATINGS.map((t) => [t.abbr, t.team]));

/** Compact team-with-logo cell shared by the yardage props review table and mobile cards. */
export default function NflYardageReviewTeamCell({ abbr }: { abbr: string }) {
  const name = TEAM_NAME_BY_ABBR.get(abbr);
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={name ?? abbr.toUpperCase()}>
      <TeamLogo abbr={abbr} />
      <span className="text-[11px] font-semibold uppercase text-slate-700">{abbr.toUpperCase()}</span>
    </span>
  );
}
