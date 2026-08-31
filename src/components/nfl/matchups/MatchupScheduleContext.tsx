import { useState } from "react";
import { ChevronDown } from "lucide-react";
import MatchupSectionCard from "@/components/nfl/matchups/MatchupSectionCard";
import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import type { CompletedSeasonSosReference } from "@/components/nfl/matchups/completedSeasonSosReference";
import { formatRankOrdinal } from "@/components/nfl/matchups/rankOrdinal";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";
import { cn } from "@/lib/utils";

export const SCHEDULE_CONTEXT_DISCLAIMER =
  "Completed-season opponent records are shown for reference only and do not adjust any 2026 rating, projection, category advantage, or rank.";

function formatWinPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return value.toFixed(3).replace(/^0/, "");
}

function TeamScheduleReference({ team, side, reference }: {
  team: NflMatchupTeam;
  side: "away" | "home";
  reference: CompletedSeasonSosReference | null;
}) {
  return (
    <div className="matchup-sos-reference">
      <div className="matchup-sos-reference__team">
        <NflTeamCrest team={team} side={side} size={22} />
        <strong>{team.abbr.toUpperCase()}</strong>
      </div>
      <dl>
        <div><dt>Opp win %</dt><dd>{formatWinPct(reference?.opponentWinPct ?? null)}</dd></div>
        <div><dt>SOS rank</dt><dd>{formatRankOrdinal(reference?.rank ?? null) || "N/A"}</dd></div>
      </dl>
    </div>
  );
}

/** Presentation-only reference sourced from completed 2025 regular-season results. */
export default function MatchupScheduleContext({
  matchup,
  awayReference,
  homeReference,
  defaultOpen = true,
}: {
  matchup: NflMatchup;
  awayReference: CompletedSeasonSosReference | null;
  homeReference: CompletedSeasonSosReference | null;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <MatchupSectionCard
      eyebrow="2025 Results Reference"
      title="Strength of Schedule"
      titleId="schedule-context-heading"
      subtitle="Opponent win percentage from completed 2025 regular-season results. Harder schedules rank higher."
      bodyClassName={open ? undefined : "hidden"}
      headerAside={
        <button
          type="button"
          aria-expanded={open}
          aria-controls="schedule-context-body"
          onClick={() => setOpen((current) => !current)}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded border border-slate-300 px-3 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          {open ? "Hide" : "Show"}
          <ChevronDown aria-hidden className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
        </button>
      }
    >
      <div id="schedule-context-body">
        <div className="grid grid-cols-2 gap-1.5">
          <TeamScheduleReference team={matchup.away} side="away" reference={awayReference} />
          <TeamScheduleReference team={matchup.home} side="home" reference={homeReference} />
        </div>
        <p className="mt-2 text-[10px] leading-4 text-slate-600">{SCHEDULE_CONTEXT_DISCLAIMER}</p>
      </div>
    </MatchupSectionCard>
  );
}
