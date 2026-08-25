import type { SeasonRank2025 } from "@/lib/fantasy/seasonRanks2025";
import { cn } from "@/lib/utils";
import {
  FANTASY_TABLE_BODY_CELL,
  FantasyExpandControl,
  FantasyPlayerIdentity,
} from "@/components/fantasy/FantasyTable";
import type { FantasyResearchBoardRow } from "@/lib/fantasy/parRankings";
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import { getPositionTone } from "@/lib/fantasy/positionTone";
import { formatRank, formatSigned } from "@/lib/fantasy/formatBoardValue";
import {
  POINTS_ALLOWED_TEAM_COUNT,
  getOpponentPointsAllowed,
  type PointsAllowedPosition,
} from "@/lib/fantasy/pointsAllowed2025";
import {
  weeklyHeatStyle,
  weeklyRankHeatTone,
} from "@/lib/fantasy/weekly/researchPresentation";
import {
  getParPerGameTone,
  getRankGradientColor,
  type ParPerGameThresholds,
  type ParPerGameTone,
} from "@/lib/fantasy/parPresentation";

/**
 * Light separator on every body cell. Deliberately thinner and paler than the
 * tier break (`border-t-2 border-t-slate-300`), which must stay readable as a
 * structural divider rather than blending into these.
 */
export const BODY_CELL_BORDER = FANTASY_TABLE_BODY_CELL;

const PAR_TONE_CLASS: Record<ParPerGameTone, string> = {
  elite: "bg-emerald-100 text-emerald-800 font-bold text-[13px]",
  positive: "bg-emerald-50 text-emerald-700 font-semibold text-[12px]",
  near: "bg-slate-50 text-slate-600 font-semibold text-[12px]",
  below: "bg-rose-50 text-rose-700 font-semibold text-[12px]",
  missing: "bg-white text-slate-400 font-semibold text-[12px]",
};

/**
 * Merged position + position-rank badge, e.g. "WR3". Coloured by the fixed
 * per-position palette so a mixed table reads by position at a glance.
 */
export function PositionRankBadge({
  position,
  positionRank,
}: {
  position: FantasyPosition;
  positionRank: number | undefined;
}) {
  const tone = getPositionTone(position);
  return (
    <span
      className={cn(
        "inline-flex min-w-10 justify-center rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
        tone.badge,
      )}
    >
      {position}
      {Number.isFinite(positionRank) ? positionRank : ""}
    </span>
  );
}

/** Inline tier chip. Rendered on every row at every breakpoint. */
export function TierBadge({ tier }: { tier?: number }) {
  if (!tier) return <span className="text-[10px] font-semibold text-slate-400">—</span>;
  return (
    <span className="inline-flex rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-700">
      T{tier}
    </span>
  );
}

/** The headline PAR/G value, bucketed against the position's own distribution. */
export function ParPerGameValue({
  value,
  thresholds,
  size = "table",
}: {
  value: number | undefined;
  thresholds: ParPerGameThresholds | null;
  size?: "table" | "mobile";
}) {
  const tone = getParPerGameTone(value, thresholds);
  return (
    <span
      className={cn(
        "inline-flex rounded px-1.5 py-0.5 tabular-nums",
        PAR_TONE_CLASS[tone],
        size === "mobile" && "px-2 py-1 text-[15px]",
      )}
    >
      {formatSigned(value, 2)}
    </span>
  );
}

/**
 * Season PAR, both years stacked. The 2026 projection keeps its existing
 * weight; the joined 2025 actual sits under it, smaller and muted. Players with
 * no 2025 data render the 2026 line alone — no placeholder second line.
 */
export function SeasonParStack({
  projectedSeasonPar,
  actualSeasonPar,
  className,
}: {
  projectedSeasonPar: number | undefined;
  actualSeasonPar: number | undefined;
  className?: string;
}) {
  // Untiered rows have neither year; keep their existing bare placeholder
  // rather than labelling an empty value.
  if (!Number.isFinite(projectedSeasonPar) && !Number.isFinite(actualSeasonPar)) {
    return <div className={cn("text-center text-[10px] text-slate-400", className)}>—</div>;
  }

  return (
    <div className={cn("flex flex-col items-end gap-0.5", className)}>
      <span className="flex w-full items-baseline justify-between gap-1.5 whitespace-nowrap">
        <span className="text-[9px] font-medium uppercase tracking-wide text-slate-400">'26 proj</span>
        <span className="text-[10px] tabular-nums text-slate-500">
          {formatSigned(projectedSeasonPar, 1)}
        </span>
      </span>
      {Number.isFinite(actualSeasonPar) && (
        <span className="flex w-full items-baseline justify-between gap-1.5 whitespace-nowrap">
          <span className="text-[9px] font-medium uppercase tracking-wide text-slate-400">'25 actual</span>
          <span className="text-[9px] tabular-nums text-slate-400">
            {formatSigned(actualSeasonPar, 1)}
          </span>
        </span>
      )}
    </div>
  );
}

/** Rank cell with a continuous emerald → slate → rose heat-map background. */
export function GradientRankCell({
  value,
  maxRank,
  className,
}: {
  value: number | undefined;
  maxRank: number | null;
  className?: string;
}) {
  const background = getRankGradientColor(value, maxRank);
  return (
    <td
      style={background ? { backgroundColor: background } : undefined}
      className={cn(
        // 11px/bold: at the previous 10px/semibold these read as regular weight
        // against the gradient. PAR/G stays dominant at 13px plus its pill.
        BODY_CELL_BORDER,
        "px-2 py-1.5 text-center text-[11px] font-bold tabular-nums text-slate-800",
        !background && "font-semibold text-slate-400",
        className,
      )}
    >
      {formatRank(value)}
    </td>
  );
}

/**
 * Playoff-week opponent, shaded by that defense's 2025 fantasy points allowed
 * to the row's own position. Rank 1 allowed the most points, so it receives the
 * established gold/easiest fantasy-player tone without inverting direction.
 *
 * Deliberately separate from the Strength of Schedule column: that is JKB's
 * composite metric, this is a direct position-specific 2025 matchup read.
 */
export function MatchupOpponentCell({
  opponent,
  position,
  className,
}: {
  opponent: string | undefined;
  position: PointsAllowedPosition;
  className?: string;
}) {
  const allowed = getOpponentPointsAllowed(opponent, position);
  const tone = weeklyRankHeatTone(allowed?.rank, POINTS_ALLOWED_TEAM_COUNT);
  const heatStyle = tone === "missing" ? undefined : weeklyHeatStyle(tone);
  return (
    <td
      style={heatStyle}
      data-heat-tone={tone}
      title={
        allowed
          ? `${allowed.team.name} allowed ${allowed.pointsAllowed.toFixed(1)} ${position} pts/gm in 2025 (${allowed.rank} of ${POINTS_ALLOWED_TEAM_COUNT})`
          : undefined
      }
      className={cn(
        BODY_CELL_BORDER,
        "px-2 py-1.5 text-center text-[11px] font-bold",
        tone === "missing" && "font-semibold",
        className,
      )}
    >
      {opponent || "—"}
    </td>
  );
}

/** Inline (non-cell) variant of the same shading, for the mobile detail list. */
export function MatchupOpponentChip({
  opponent,
  position,
}: {
  opponent: string | undefined;
  position: PointsAllowedPosition;
}) {
  const allowed = getOpponentPointsAllowed(opponent, position);
  const tone = weeklyRankHeatTone(allowed?.rank, POINTS_ALLOWED_TEAM_COUNT);
  return (
    <span
      style={tone === "missing" ? undefined : weeklyHeatStyle(tone)}
      data-heat-tone={tone}
      title={
        allowed
          ? `${allowed.team.name} allowed ${allowed.pointsAllowed.toFixed(1)} ${position} pts/gm in 2025 (${allowed.rank} of ${POINTS_ALLOWED_TEAM_COUNT})`
          : undefined
      }
      className={cn(
        "inline-flex rounded px-1.5 py-0.5 font-semibold tabular-nums",
        tone === "missing" && "text-slate-500",
      )}
    >
      {opponent || "—"}
    </span>
  );
}

export const PlayerIdentity = FantasyPlayerIdentity;

/**
 * Expand affordance and the row's real keyboard-operable control.
 *
 * Clicks are stopped from bubbling: an enclosing row may also toggle on click,
 * and letting the event through would fire both handlers and cancel out.
 */
export const ExpandControl = FantasyExpandControl;

/**
 * 2025 positional finish on both bases. Total points and PPG diverge whenever a
 * player missed games, so both are shown. Omitted entirely with no 2025 data.
 */
export function SeasonFinish2025({ rank }: { rank: SeasonRank2025 | undefined }) {
  if (!rank) return null;
  return (
    <div className="mb-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-slate-200 pb-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        2025 finish
      </span>
      <span>
        <strong className="text-slate-900">
          {rank.position}
          {rank.byPoints}
        </strong>{" "}
        by total points
      </span>
      <span>
        <strong className="text-slate-900">
          {rank.position}
          {rank.byPpg}
        </strong>{" "}
        by PPG
      </span>
      <span className="text-slate-400">of {rank.poolSize} ranked {rank.position}s</span>
    </div>
  );
}

/** PAR provenance shown when a row is expanded on either breakpoint. */
export function ParDetail({ row }: { row: FantasyResearchBoardRow }) {
  if (!row.par) {
    return (
      <span>
        {row.position} remains in JKB position-rank order and is outside the approved PAR tier
        universe.
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1">
      <span>
        PAR rank <strong className="text-slate-900">#{row.par.parRank}</strong>
      </span>
      <span>
        Historical replacement{" "}
        <strong className="text-slate-900">{row.par.replacementPpg.toFixed(2)}</strong>
      </span>
      <span>
        Projected points{" "}
        <strong className="text-slate-900">{row.par.projectedFantasyPoints.toFixed(1)}</strong>
      </span>
      <span>
        Projected games <strong className="text-slate-900">{row.par.projectedGames}</strong>
      </span>
    </div>
  );
}
