import type { CSSProperties } from "react";
import { TeamLogo } from "@/components/nfl/history/NflTeamLogo";
import { nflTeamColor } from "@/lib/nfl/nflTeamColor";

export function TeamIdentity({ abbr, compact = false }: { abbr: string; compact?: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5" title={abbr.toUpperCase()}>
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded border border-slate-200 bg-white" style={{ borderBottomColor: nflTeamColor(abbr) ?? undefined } as CSSProperties}>
        <TeamLogo abbr={abbr} size="sm" />
      </span>
      <span className={compact ? "text-[10px] font-semibold uppercase text-slate-600" : "text-xs font-semibold uppercase text-slate-700"}>{abbr.toUpperCase()}</span>
    </span>
  );
}

export function MatchupIdentity({ away, home }: { away: string; home: string }) {
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><TeamIdentity abbr={away} compact /><span className="text-slate-400">@</span><TeamIdentity abbr={home} compact /></span>;
}
