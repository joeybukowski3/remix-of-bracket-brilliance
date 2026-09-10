import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import { useIsCompactLayout } from "@/hooks/useIsCompactLayout";
import type { NflMatchup } from "@/lib/nfl/matchups";

/**
 * Prominent two-team header for the Team Comparison area.
 *
 * Symmetrical: the away team resolves toward the centre from the left, the home
 * team from the right, with a quiet "vs" between. Logos and abbreviations are
 * the dominant elements — substantially larger than the former one-line crest
 * strip — and the unit compresses rather than stacks on a phone so both teams
 * stay side by side above the table they head.
 *
 * Uses the existing `NflTeamCrest` / `nflLogoUrl` infrastructure; no new assets.
 */
export default function MatchupComparisonTeamHeader({
  matchup,
}: {
  matchup: NflMatchup;
}) {
  const isMobile = useIsCompactLayout("(max-width: 639px)");
  const crestSize = isMobile ? 40 : 56;
  const { away, home } = matchup;

  return (
    <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-slate-200 pb-3 sm:mb-4 sm:gap-6 sm:pb-4">
      <div className="flex min-w-0 items-center justify-end gap-2.5 sm:gap-3.5">
        <div className="min-w-0 text-right">
          <div className="text-xl font-black uppercase leading-none tracking-tight text-slate-900 sm:text-3xl">
            {away.abbr.toUpperCase()}
          </div>
          <div className="mt-1 truncate text-[11px] font-semibold leading-tight text-slate-500 sm:text-sm">
            {away.teamName}
          </div>
        </div>
        <NflTeamCrest
          team={away}
          side="away"
          size={crestSize}
          label={`${away.teamName} (away)`}
        />
      </div>

      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 sm:text-xs">
        vs
      </span>

      <div className="flex min-w-0 items-center justify-start gap-2.5 sm:gap-3.5">
        <NflTeamCrest
          team={home}
          side="home"
          size={crestSize}
          label={`${home.teamName} (home)`}
        />
        <div className="min-w-0 text-left">
          <div className="text-xl font-black uppercase leading-none tracking-tight text-slate-900 sm:text-3xl">
            {home.abbr.toUpperCase()}
          </div>
          <div className="mt-1 truncate text-[11px] font-semibold leading-tight text-slate-500 sm:text-sm">
            {home.teamName}
          </div>
        </div>
      </div>
    </div>
  );
}
