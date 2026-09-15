import { useMemo, useRef, useState } from "react";
import MatchupVisualMetricDetail from "@/components/nfl/matchups/MatchupVisualMetricDetail";
import { useSwipeOverflow } from "@/components/nfl/matchups/useSwipeOverflow";
import type { MatchupVisualMetric } from "@/lib/nfl/matchupVisualizationModel";
import type { NflMatchupTeam } from "@/lib/nfl/matchups";
import { cn } from "@/lib/utils";

/** Initial target — tune per the 390/430px responsive pass if points/labels collide. */
const MIN_COLUMN_WIDTH = 88;
const PLOT_HEIGHT = 190;
/** Reserved lane below the rank scale for a missing value — kept off the 1-32 axis entirely so it cannot read as a rank. */
const NA_LANE_HEIGHT = 30;
const TOTAL_HEIGHT = PLOT_HEIGHT + NA_LANE_HEIGHT;
const MARKER_RADIUS = 4;
/** Marker y-offset within the N/A lane, leaving room for the shared "N/A" label beneath it. */
const NA_MARKER_Y = PLOT_HEIGHT + 9;
const NA_LABEL_Y = PLOT_HEIGHT + NA_LANE_HEIGHT - 4;
/** Horizontal offset applied to each side's marker so away and home don't fully overlap when both are missing. */
const NA_MARKER_DX = 5;
/** Only annotate a column once the rank gap is a meaningful fraction of the league — matches Rank Towers' own floor so the two views never disagree about what counts as "selective". */
const ADVANTAGE_ANNOTATION_RANK_THRESHOLD = 8;

type Point = { x: number; y: number | null };

function toPoints(metrics: readonly MatchupVisualMetric[], columnWidth: number, side: "away" | "home"): Point[] {
  return metrics.map((metric, index) => {
    const percentile = side === "away" ? metric.away.percentile : metric.home.percentile;
    const x = index * columnWidth + columnWidth / 2;
    return { x, y: percentile == null ? null : percentile * PLOT_HEIGHT };
  });
}

/** Splits points into contiguous runs (breaking at every null) and renders each as its own polyline — a missing value creates a real gap, never an interpolated guess. */
function linePathSegments(points: readonly Point[]): string[] {
  const segments: string[] = [];
  let current: string[] = [];
  for (const point of points) {
    if (point.y == null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      continue;
    }
    current.push(`${point.x},${point.y}`);
  }
  if (current.length > 1) segments.push(current.join(" "));
  return segments;
}

/** A restrained fill between the two series, only across runs where both sides have a value at both ends. */
function buildRibbonQuads(
  away: readonly Point[],
  home: readonly Point[]
): { key: string; d: string }[] {
  const quads: { key: string; d: string }[] = [];
  for (let i = 0; i < away.length - 1; i += 1) {
    const a0 = away[i];
    const a1 = away[i + 1];
    const h0 = home[i];
    const h1 = home[i + 1];
    if (a0.y == null || a1.y == null || h0.y == null || h1.y == null) continue;
    quads.push({
      key: `${i}`,
      d: `M ${a0.x},${a0.y} L ${a1.x},${a1.y} L ${h1.x},${h1.y} L ${h0.x},${h0.y} Z`,
    });
  }
  return quads;
}

const TIER_BAND_RANK_STEP = 8;

function TierBands({ width }: { width: number }) {
  const bandHeight = (PLOT_HEIGHT * TIER_BAND_RANK_STEP) / 32;
  const bands = [0, 1, 2, 3];
  return (
    <>
      {bands.map((band) => (
        <rect
          key={band}
          x={0}
          y={band * bandHeight}
          width={width}
          height={bandHeight}
          className={band % 2 === 0 ? "fill-slate-100/80" : "fill-white"}
        />
      ))}
    </>
  );
}

/** Dashed, unfilled marker echoing each side's real-data shape (circle for away, triangle for home) so a missing value still reads as "this side", just with no data — never a bare gap. */
function MissingMarker({ x, dx, shape }: { x: number; dx: number; shape: "circle" | "triangle" }) {
  return (
    <g transform={`translate(${x + dx}, ${NA_MARKER_Y})`}>
      {shape === "circle" ? (
        <circle r={MARKER_RADIUS} className="fill-white stroke-slate-400" strokeWidth={1.25} strokeDasharray="2,1.5" />
      ) : (
        <polygon
          points={`0,${-MARKER_RADIUS} ${MARKER_RADIUS},${MARKER_RADIUS} ${-MARKER_RADIUS},${MARKER_RADIUS}`}
          className="fill-white stroke-slate-400"
          strokeWidth={1.25}
          strokeDasharray="2,1.5"
        />
      )}
    </g>
  );
}

/** One shared "N/A" label per column, beneath whichever marker(s) are missing — avoids stamping the same text twice when both sides lack data. */
function MissingLabel({ x }: { x: number }) {
  return (
    <text x={x} y={NA_LABEL_Y} textAnchor="middle" className="fill-slate-400 text-[7px] font-bold" dominantBaseline="middle">
      N/A
    </text>
  );
}

/** Selective rank-gap annotation, shown only once the gap clears the threshold — mirrors Rank Towers' advantage chip so the two views never disagree about which columns are worth calling out. */
function AdvantageAnnotation({
  metric,
  a,
  h,
  awayAbbr,
  homeAbbr,
}: {
  metric: MatchupVisualMetric;
  a: Point;
  h: Point;
  awayAbbr: string;
  homeAbbr: string;
}) {
  if (metric.rankGap == null || metric.rankGap < ADVANTAGE_ANNOTATION_RANK_THRESHOLD) return null;
  if (metric.leader !== "away" && metric.leader !== "home") return null;
  if (a.y == null || h.y == null) return null;
  const abbr = metric.leader === "away" ? awayAbbr : homeAbbr;
  const y = Math.min(a.y, h.y) - 7;
  return (
    <text x={a.x} y={Math.max(y, 8)} textAnchor="middle" className="fill-slate-600 text-[7px] font-bold uppercase tracking-wide">
      {abbr.toUpperCase()} +{metric.rankGap}
    </text>
  );
}

/**
 * Signature Profile — the alternate Team Comparison chart. Both teams
 * plotted on the same rank scale (1 at top, 32 at bottom), connected line
 * per team, restrained fill between them. Scrolls horizontally inside its
 * own track only.
 */
export default function MatchupSignatureProfile({
  metrics,
  away,
  home,
  awayColor,
  homeColor,
}: {
  metrics: readonly MatchupVisualMetric[];
  away: NflMatchupTeam;
  home: NflMatchupTeam;
  awayColor: string;
  homeColor: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const hasOverflow = useSwipeOverflow(trackRef, [metrics.length]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeMetric = metrics.find((m) => m.id === activeId) ?? null;

  const columnWidth = MIN_COLUMN_WIDTH;
  const width = Math.max(metrics.length * columnWidth, columnWidth);

  const awayPoints = useMemo(() => toPoints(metrics, columnWidth, "away"), [metrics, columnWidth]);
  const homePoints = useMemo(() => toPoints(metrics, columnWidth, "home"), [metrics, columnWidth]);
  const awaySegments = useMemo(() => linePathSegments(awayPoints), [awayPoints]);
  const homeSegments = useMemo(() => linePathSegments(homePoints), [homePoints]);
  const ribbonQuads = useMemo(() => buildRibbonQuads(awayPoints, homePoints), [awayPoints, homePoints]);

  return (
    <div className="matchup-signature-profile">
      <div className="mb-1.5 flex items-center gap-3 px-1 text-[10px] font-semibold text-slate-600">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: awayColor }} />
          {away.teamName}
        </span>
        <span className="inline-flex items-center gap-1">
          <svg width={10} height={10} aria-hidden>
            <polygon points="5,0 10,9 0,9" fill={homeColor} />
          </svg>
          {home.teamName}
        </span>
      </div>

      <div className="relative min-w-0">
        <div ref={trackRef} className="min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <svg width={width} height={TOTAL_HEIGHT + 30} role="img" aria-label="Signature profile comparing both teams across selected metrics by league rank">
            <TierBands width={width} />
            {ribbonQuads.map((quad) => (
              <path key={quad.key} d={quad.d} className="fill-slate-400/10" />
            ))}
            {awaySegments.map((segment, index) => (
              <polyline key={`away-${index}`} points={segment} fill="none" stroke={awayColor} strokeWidth={2} />
            ))}
            {homeSegments.map((segment, index) => (
              <polyline key={`home-${index}`} points={segment} fill="none" stroke={homeColor} strokeWidth={2} strokeDasharray="5,3" />
            ))}
            {metrics.map((metric, index) => {
              const a = awayPoints[index];
              const h = homePoints[index];
              const isActive = metric.id === activeId;
              return (
                <g key={metric.id}>
                  {a.y == null ? (
                    <MissingMarker x={a.x} dx={h.y == null ? -NA_MARKER_DX : 0} shape="circle" />
                  ) : (
                    <circle cx={a.x} cy={a.y} r={isActive ? MARKER_RADIUS + 1.5 : MARKER_RADIUS} fill={awayColor} stroke="white" strokeWidth={1.5} />
                  )}
                  {h.y == null ? (
                    <MissingMarker x={h.x} dx={a.y == null ? NA_MARKER_DX : 0} shape="triangle" />
                  ) : (
                    <polygon
                      points={`${h.x},${h.y - (isActive ? MARKER_RADIUS + 2 : MARKER_RADIUS)} ${h.x + (isActive ? MARKER_RADIUS + 2 : MARKER_RADIUS)},${h.y + (isActive ? MARKER_RADIUS + 2 : MARKER_RADIUS)} ${h.x - (isActive ? MARKER_RADIUS + 2 : MARKER_RADIUS)},${h.y + (isActive ? MARKER_RADIUS + 2 : MARKER_RADIUS)}`}
                      fill={homeColor}
                      stroke="white"
                      strokeWidth={1.5}
                    />
                  )}
                  {(a.y == null || h.y == null) && <MissingLabel x={a.x} />}
                  <AdvantageAnnotation metric={metric} a={a} h={h} awayAbbr={away.abbr} homeAbbr={home.abbr} />
                  <rect
                    x={index * columnWidth}
                    y={0}
                    width={columnWidth}
                    height={TOTAL_HEIGHT}
                    fill="transparent"
                    className="cursor-pointer"
                    role="button"
                    tabIndex={0}
                    aria-pressed={isActive}
                    aria-label={`${metric.label}: ${away.teamName} ${metric.away.formatted}, ${home.teamName} ${metric.home.formatted}`}
                    onClick={() => setActiveId((prev) => (prev === metric.id ? null : metric.id))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setActiveId((prev) => (prev === metric.id ? null : metric.id));
                      }
                    }}
                  />
                  <text
                    x={index * columnWidth + columnWidth / 2}
                    y={TOTAL_HEIGHT + 14}
                    textAnchor="middle"
                    className={cn(
                      "text-[8px] font-semibold uppercase tracking-[0.02em]",
                      isActive ? "fill-emerald-700" : "fill-slate-600"
                    )}
                  >
                    {metric.shortLabel.length > 14 ? `${metric.shortLabel.slice(0, 13)}…` : metric.shortLabel}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        {hasOverflow && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent"
          />
        )}
      </div>
      {hasOverflow && (
        <p className="mt-1 px-1 text-[10px] font-medium text-slate-500">Swipe to see more metrics</p>
      )}
      {activeMetric && (
        <MatchupVisualMetricDetail metric={activeMetric} away={away} home={home} className="mt-2" />
      )}
    </div>
  );
}
