import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import { useIsCompactLayout } from "@/hooks/useIsCompactLayout";
import { cn } from "@/lib/utils";
import type { NflMatchup } from "@/lib/nfl/matchups";

/**
 * Two-team header for the Team Comparison area — away on the left, home on the
 * right, everywhere, at every width.
 *
 * `variant="detail"` (default) is the prominent header above the large
 * Statistical Comparison / Success Rate / Unit / Trenches tables: big logos and
 * abbreviations resolving toward a centred "vs".
 *
 * `variant="compact"` is the small header that tops each Overview → Snapshot
 * bento card, sized for the smaller surface.
 *
 * `sticky` keeps the header pinned within its own section while that section is
 * scrolled on a phone (CSS in `nflMatchupSheet.css`, below the page's sticky
 * tab bar) — never a global page-level sticky header.
 *
 * Uses the existing `NflTeamCrest` / `nflLogoUrl` infrastructure; no new assets.
 */
export default function MatchupComparisonTeamHeader({
  matchup,
  variant = "detail",
  sticky = false,
}: {
  matchup: NflMatchup;
  variant?: "detail" | "compact";
  sticky?: boolean;
}) {
  const isMobile = useIsCompactLayout("(max-width: 639px)");
  const { away, home } = matchup;
  const compact = variant === "compact";
  const crestSize = compact ? 20 : isMobile ? 40 : 56;

  const wrapClass = cn(
    "matchup-comparison-team-header grid items-center",
    sticky && "matchup-comparison-team-header--sticky",
    compact
      ? "matchup-snapshot__card-header grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-1.5 border-b border-slate-200"
      : "mb-3 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-3 border-b border-slate-200 pb-3 sm:mb-4 sm:gap-6 sm:pb-4"
  );

  const abbrClass = compact
    ? "text-[11px] font-black uppercase leading-none tracking-tight text-slate-900"
    : "text-xl font-black uppercase leading-none tracking-tight text-slate-900 sm:text-3xl";

  const nameClass = compact
    ? "sr-only"
    : "mt-1 truncate text-[11px] font-semibold leading-tight text-slate-500 sm:text-sm";

  const vsClass = compact
    ? "text-[8px] font-bold uppercase tracking-[0.2em] text-slate-400"
    : "text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 sm:text-xs";

  return (
    <div className={wrapClass}>
      <div className={cn("flex min-w-0 items-center justify-end", compact ? "gap-1.5" : "gap-2.5 sm:gap-3.5")}>
        <div className="min-w-0 text-right">
          <div className={abbrClass}>{away.abbr.toUpperCase()}</div>
          <div className={nameClass}>{away.teamName}</div>
        </div>
        <NflTeamCrest team={away} side="away" size={crestSize} label={`${away.teamName} (away)`} />
      </div>

      <span className={vsClass}>vs</span>

      <div className={cn("flex min-w-0 items-center justify-start", compact ? "gap-1.5" : "gap-2.5 sm:gap-3.5")}>
        <NflTeamCrest team={home} side="home" size={crestSize} label={`${home.teamName} (home)`} />
        <div className="min-w-0 text-left">
          <div className={abbrClass}>{home.abbr.toUpperCase()}</div>
          <div className={nameClass}>{home.teamName}</div>
        </div>
      </div>
    </div>
  );
}
