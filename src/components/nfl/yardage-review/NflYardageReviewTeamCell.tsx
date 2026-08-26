import { useState } from "react";
import { NFL_POWER_RATINGS, nflLogoUrl } from "@/data/nflPreseason2026";

const TEAM_NAME_BY_ABBR = new Map(NFL_POWER_RATINGS.map((t) => [t.abbr, t.team]));

function TeamLogo({ abbr }: { abbr: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[7px] font-black text-white">
        {abbr.toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={nflLogoUrl(abbr)}
      alt=""
      loading="lazy"
      className="h-5 w-5 shrink-0 object-contain"
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
