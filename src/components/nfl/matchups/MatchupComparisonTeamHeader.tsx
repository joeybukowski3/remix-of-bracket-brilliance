import type { CSSProperties } from "react";
import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import { useIsCompactLayout } from "@/hooks/useIsCompactLayout";
import { cn } from "@/lib/utils";
import { nflTeamColorFor } from "@/lib/nfl/nflTeamColor";
import type { NflMatchup } from "@/lib/nfl/matchups";

/**
 * Two-team header for the Team Comparison area — away on the left, home on the
 * right, everywhere, at every width and regardless of offense/defense role.
 *
 * `variant="detail"` (default) is the approved split team-colour header above
 * the large Statistical Comparison / Success Rate / Unit / Trenches tables:
 * each side tinted with that team's canonical colour, a thin top accent in the
 * same colour, and a neutral "VS" divider between. Sub-labels default to
 * "Away" / "Home" but a caller can pass contextual roles ("Attacking" /
 * "Defending") for the possession tables, optionally tinted in the team colour.
 *
 * `variant="compact"` is the small header that tops each Overview → Snapshot
 * bento card, deliberately left as the dense, colour-neutral treatment.
 *
 * `sticky` keeps the header pinned within its own section while that section is
 * scrolled on a phone (CSS in `nflMatchupSheet.css`) — never a page-level
 * sticky header.
 *
 * Colours come from the canonical `nflTeamColorFor` resolver; when a team has no
 * resolvable colour the sheet's neutral away/home tokens stand in.
 */
type Unit = "Offense" | "Defense";

export default function MatchupComparisonTeamHeader({
  matchup,
  variant = "detail",
  sticky = false,
  context,
  roleAccent = false,
  unit,
  possession,
  className,
}: {
  matchup: NflMatchup;
  variant?: "detail" | "compact";
  sticky?: boolean;
  className?: string;
  /** Contextual sub-labels. Defaults to Away / Home. */
  context?: { away: string; home: string };
  /** Tint the sub-label in the team colour (used for Attacking / Defending). */
  roleAccent?: boolean;
  /**
   * Possession context for Unit by Unit / Trenches. When set, the team name
   * gains its unit ("… 49ers Offense") and the sub-label becomes
   * Attacking / Defending, tinted in the team colour. Away stays left, home
   * stays right regardless of which side has the ball.
   */
  unit?: { away: Unit; home: Unit };
  /** Screen-reader-only possession announcement, e.g. "… has the ball". */
  possession?: string;
}) {
  const isMobile = useIsCompactLayout("(max-width: 639px)");
  const { away, home } = matchup;

  if (variant === "compact") {
    const crestSize = 20;
    return (
      <div
        className={cn(
          "matchup-comparison-team-header matchup-snapshot__card-header grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 border-b border-slate-200",
          sticky && "matchup-comparison-team-header--sticky"
        )}
      >
        <div className="flex min-w-0 items-center justify-end gap-1.5">
          <div className="min-w-0 text-right">
            <div className="text-[11px] font-black uppercase leading-none tracking-tight text-slate-900">
              {away.abbr.toUpperCase()}
            </div>
            <div className="sr-only">{away.teamName}</div>
          </div>
          <NflTeamCrest team={away} side="away" size={crestSize} label={`${away.teamName} (away)`} />
        </div>
        <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-slate-400">vs</span>
        <div className="flex min-w-0 items-center justify-start gap-1.5">
          <NflTeamCrest team={home} side="home" size={crestSize} label={`${home.teamName} (home)`} />
          <div className="min-w-0 text-left">
            <div className="text-[11px] font-black uppercase leading-none tracking-tight text-slate-900">
              {home.abbr.toUpperCase()}
            </div>
            <div className="sr-only">{home.teamName}</div>
          </div>
        </div>
      </div>
    );
  }

  const crestSize = isMobile ? 30 : 40;
  const awayColor = nflTeamColorFor(away);
  const homeColor = nflTeamColorFor(home);
  const style = {
    ...(awayColor ? { "--team-away": awayColor } : {}),
    ...(homeColor ? { "--team-home": homeColor } : {}),
  } as CSSProperties;

  const unitShort = (u: Unit) => (u === "Offense" ? "Off" : "Def");
  const unitRole = (u: Unit) => (u === "Offense" ? "Attacking" : "Defending");
  const roleTinted = roleAccent || !!unit;

  const awayRole = unit ? unitRole(unit.away) : context?.away ?? "Away";
  const homeRole = unit ? unitRole(unit.home) : context?.home ?? "Home";
  const awayName = isMobile
    ? `${away.abbr.toUpperCase()}${unit ? ` ${unitShort(unit.away)}` : ""}`
    : `${away.teamName}${unit ? ` ${unit.away}` : ""}`;
  const homeName = isMobile
    ? `${home.abbr.toUpperCase()}${unit ? ` ${unitShort(unit.home)}` : ""}`
    : `${home.teamName}${unit ? ` ${unit.home}` : ""}`;

  return (
    <div
      className={cn(
        "matchup-comparison-team-header matchup-team-split mb-3 sm:mb-4",
        sticky && "matchup-comparison-team-header--sticky",
        className
      )}
      style={style}
    >
      {possession && <span className="sr-only">{possession}</span>}
      <div className="matchup-team-split__side matchup-team-split__side--away">
        <NflTeamCrest team={away} side="away" size={crestSize} label={`${away.teamName} (away)`} />
        <div className="matchup-team-split__body">
          <div className="matchup-team-split__name" title={away.teamName}>
            {awayName}
          </div>
          {!isMobile && <span className="sr-only">{away.abbr.toUpperCase()}</span>}
          <div className={cn("matchup-team-split__role", roleTinted && "matchup-team-split__role--accent")}>
            {awayRole}
          </div>
        </div>
      </div>

      <span className="matchup-team-split__vs" aria-hidden="true">
        VS
      </span>

      <div className="matchup-team-split__side matchup-team-split__side--home">
        <NflTeamCrest team={home} side="home" size={crestSize} label={`${home.teamName} (home)`} />
        <div className="matchup-team-split__body">
          <div className="matchup-team-split__name" title={home.teamName}>
            {homeName}
          </div>
          {!isMobile && <span className="sr-only">{home.abbr.toUpperCase()}</span>}
          <div className={cn("matchup-team-split__role", roleTinted && "matchup-team-split__role--accent")}>
            {homeRole}
          </div>
        </div>
      </div>
    </div>
  );
}
