import { useState } from "react";
import { NFL_POWER_RATINGS, nflLogoUrl } from "@/data/nflPreseason2026";
import { cn } from "@/lib/utils";

const TEAM_NAME_BY_ABBR = new Map(NFL_POWER_RATINGS.map((t) => [t.abbr, t.team]));

const SIZE_CLASS = { sm: "h-4 w-4", md: "h-5 w-5" } as const;

/** Shared team-logo badge with a lettered fallback -- reused by the matchup filter pills. `size` defaults to the original "md" (20px); "sm" (16px) is for denser contexts like the Opponent Last 10 table's Opp Player cell. */
export function TeamLogo({ abbr, size = "md" }: { abbr: string; size?: keyof typeof SIZE_CLASS }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-slate-700 text-[7px] font-black text-white", SIZE_CLASS[size])}>
        {abbr.toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={nflLogoUrl(abbr)}
      alt=""
      loading="lazy"
      className={cn("shrink-0 object-contain", SIZE_CLASS[size])}
      onError={() => setFailed(true)}
    />
  );
}

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
