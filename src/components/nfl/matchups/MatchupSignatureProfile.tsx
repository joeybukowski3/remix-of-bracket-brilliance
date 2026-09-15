import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import MatchupVisualMetricDetail from "@/components/nfl/matchups/MatchupVisualMetricDetail";
import { useSwipeOverflow } from "@/components/nfl/matchups/useSwipeOverflow";
import type { MatchupVisualMetric } from "@/lib/nfl/matchupVisualizationModel";
import type { NflMatchupTeam } from "@/lib/nfl/matchups";
import { cn } from "@/lib/utils";

const MIN_COLUMN_WIDTH = 92;
const TIER_LABEL_WIDTH = 66;
const PLOT_TOP = 10;
const PLOT_HEIGHT = 176;
const PLOT_BOTTOM = PLOT_TOP + PLOT_HEIGHT;
/** Reserved lane below the rank scale for a missing value — kept off the 1-32 axis entirely so it cannot read as a rank. */
const NA_LANE_HEIGHT = 28;
const TOTAL_HEIGHT = PLOT_BOTTOM + NA_LANE_HEIGHT;
const MARKER_RADIUS = 4;
/** Marker y-offset within the N/A lane, leaving room for the shared "N/A" label beneath it. */
const NA_MARKER_Y = PLOT_BOTTOM + 9;
const NA_LABEL_Y = TOTAL_HEIGHT - 4;
/** Horizontal offset applied to each side's marker so away and home don't fully overlap when both are missing. */
const NA_MARKER_DX = 5;
/** Only annotate a column once the rank gap is a meaningful fraction of the league — matches Rank Towers' own floor so the two views never disagree about what counts as "selective". */
const ADVANTAGE_ANNOTATION_RANK_THRESHOLD = 8;

type Point = { x: number; y: number | null };

function toPoints(metrics: readonly MatchupVisualMetric[], columnWidth: number, side: "away" | "home"): Point[] {
  return metrics.map((metric, index) => {
    const percentile = side === "away" ? metric.away.percentile : metric.home.percentile;
    const x = TIER_LABEL_WIDTH + index * columnWidth + columnWidth / 2;
    return { x, y: percentile == null ? null : PLOT_TOP + percentile * PLOT_HEIGHT };
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

function TierBands({ width }: { width: number }) {
  const bandHeight = PLOT_HEIGHT / 4;
  const bands = [
    { label: "Top 8", range: "#1–8", className: "is-top" },
    { label: "Upper", range: "#9–16", className: "is-upper" },
    { label: "Lower", range: "#17–24", className: "is-lower" },
    { label: "Bottom 8", range: "#25–32", className: "is-bottom" },
  ] as const;
  return (
    <g aria-hidden="true">
      {bands.map((band, index) => {
        const y = PLOT_TOP + index * bandHeight;
        return (
          <g key={band.label}>
            <rect
              x={0}
              y={y}
              width={width}
              height={bandHeight}
              className={`matchup-signature-profile__tier-band ${band.className}`}
            />
            <text x={8} y={y + 13} className="matchup-signature-profile__tier-label">
              <tspan>{band.label}</tspan>
              <tspan x={8} dy={10}>{band.range}</tspan>
            </text>
            <line
              x1={TIER_LABEL_WIDTH}
              x2={width}
              y1={y + 14}
              y2={y + 14}
              className="matchup-signature-profile__tier-rule"
            />
          </g>
        );
      })}
      <line
        x1={TIER_LABEL_WIDTH}
        x2={width}
        y1={PLOT_BOTTOM}
        y2={PLOT_BOTTOM}
        className="matchup-signature-profile__tier-rule is-bottom"
      />
    </g>
  );
}

/** Dashed, unfilled marker echoing each side's real-data shape (circle for away, triangle for home) so a missing value still reads as "this side", just with no data — never a bare gap. */
function MissingMarker({ x, dx, shape }: { x: number; dx: number; shape: "circle" | "triangle" }) {
  return (
    <g transform={`translate(${x + dx}, ${NA_MARKER_Y})`}>
      {shape === "circle" ? (
        <circle r={MARKER_RADIUS} className="matchup-signature-profile__missing-marker" strokeWidth={1.25} strokeDasharray="2,1.5" />
      ) : (
        <polygon
          points={`0,${-MARKER_RADIUS} ${MARKER_RADIUS},${MARKER_RADIUS} ${-MARKER_RADIUS},${MARKER_RADIUS}`}
          className="matchup-signature-profile__missing-marker"
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
    <text x={x} y={NA_LABEL_Y} textAnchor="middle" className="matchup-signature-profile__missing-label" dominantBaseline="middle">
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
  const y = Math.max(Math.min(a.y, h.y) - 18, PLOT_TOP + 2);
  return (
    <g className={cn("matchup-signature-profile__annotation", `is-${metric.leader}`)}>
      <rect x={a.x - 23} y={y} width={46} height={14} rx={2} />
      <text x={a.x} y={y + 9.5} textAnchor="middle">
        {abbr.toUpperCase()} +{metric.rankGap}
      </text>
    </g>
  );
}

/** Fill the available desktop plot while retaining a minimum per-metric lane that creates internal swipe on phones. */
function useProfileWidth(ref: React.RefObject<HTMLDivElement | null>, metricCount: number): number {
  const [viewportWidth, setViewportWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setViewportWidth(node.clientWidth);
    measure();

    const cleanups: Array<() => void> = [];
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      cleanups.push(() => window.removeEventListener("resize", measure));
    } else {
      const observer = new ResizeObserver(measure);
      observer.observe(node);
      cleanups.push(() => observer.disconnect());
    }

    const tabpanel = node.closest<HTMLElement>('[role="tabpanel"]');
    if (tabpanel && typeof MutationObserver !== "undefined") {
      const mutationObserver = new MutationObserver(measure);
      mutationObserver.observe(tabpanel, { attributes: true, attributeFilter: ["hidden"] });
      cleanups.push(() => mutationObserver.disconnect());
    }

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [ref, metricCount]);

  return viewportWidth;
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
  const viewportWidth = useProfileWidth(trackRef, metrics.length);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeMetric = metrics.find((m) => m.id === activeId) ?? null;

  const minimumWidth = TIER_LABEL_WIDTH + Math.max(metrics.length, 1) * MIN_COLUMN_WIDTH;
  const width = Math.max(viewportWidth, minimumWidth);
  const columnWidth = (width - TIER_LABEL_WIDTH) / Math.max(metrics.length, 1);
  const hasOverflow = useSwipeOverflow(trackRef, [metrics.length, width]);

  const awayPoints = useMemo(() => toPoints(metrics, columnWidth, "away"), [metrics, columnWidth]);
  const homePoints = useMemo(() => toPoints(metrics, columnWidth, "home"), [metrics, columnWidth]);
  const awaySegments = useMemo(() => linePathSegments(awayPoints), [awayPoints]);
  const homeSegments = useMemo(() => linePathSegments(homePoints), [homePoints]);
  const ribbonQuads = useMemo(() => buildRibbonQuads(awayPoints, homePoints), [awayPoints, homePoints]);
  const profileStyle = {
    "--profile-away": awayColor,
    "--profile-home": homeColor,
    "--profile-away-stroke": `color-mix(in srgb, ${awayColor} 76%, white)`,
    "--profile-home-stroke": `color-mix(in srgb, ${homeColor} 76%, white)`,
  } as CSSProperties;

  return (
    <div className="matchup-signature-profile" style={profileStyle}>
      <div className="matchup-viz-chart-heading">
        <div>
          <h3>Signature Profile</h3>
          <p>Selected {metrics.length === 1 ? "metric" : "metrics"} · shared league-rank scale</p>
        </div>
        <div className="matchup-signature-profile__legend" aria-label="Team legend">
          <span className="is-away"><i aria-hidden />{away.abbr.toUpperCase()}</span>
          <span className="is-home"><i aria-hidden />{home.abbr.toUpperCase()}</span>
        </div>
      </div>

      <div className="matchup-signature-profile__plot relative min-w-0">
        <div ref={trackRef} className="matchup-signature-profile__viewport min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <svg width={width} height={TOTAL_HEIGHT + 30} role="img" aria-label="Signature profile comparing both teams across selected metrics by league rank">
            <TierBands width={width} />
            {ribbonQuads.map((quad) => (
              <path key={quad.key} d={quad.d} className="matchup-signature-profile__ribbon" />
            ))}
            {awaySegments.map((segment, index) => (
              <polyline key={`away-${index}`} points={segment} className="matchup-signature-profile__line is-away" />
            ))}
            {homeSegments.map((segment, index) => (
              <polyline key={`home-${index}`} points={segment} className="matchup-signature-profile__line is-home" />
            ))}
            {metrics.map((metric, index) => {
              const a = awayPoints[index];
              const h = homePoints[index];
              const isActive = metric.id === activeId;
              return (
                <g key={metric.id}>
                  {isActive && (
                    <rect
                      x={TIER_LABEL_WIDTH + index * columnWidth + 3}
                      y={PLOT_TOP}
                      width={columnWidth - 6}
                      height={PLOT_HEIGHT}
                      className="matchup-signature-profile__active-column"
                    />
                  )}
                  {a.y == null ? (
                    <MissingMarker x={a.x} dx={h.y == null ? -NA_MARKER_DX : 0} shape="circle" />
                  ) : (
                    <circle cx={a.x} cy={a.y} r={isActive ? MARKER_RADIUS + 1.5 : MARKER_RADIUS} className="matchup-signature-profile__marker is-away" />
                  )}
                  {h.y == null ? (
                    <MissingMarker x={h.x} dx={a.y == null ? NA_MARKER_DX : 0} shape="triangle" />
                  ) : (
                    <polygon
                      points={`${h.x},${h.y - (isActive ? MARKER_RADIUS + 2 : MARKER_RADIUS)} ${h.x + (isActive ? MARKER_RADIUS + 2 : MARKER_RADIUS)},${h.y + (isActive ? MARKER_RADIUS + 2 : MARKER_RADIUS)} ${h.x - (isActive ? MARKER_RADIUS + 2 : MARKER_RADIUS)},${h.y + (isActive ? MARKER_RADIUS + 2 : MARKER_RADIUS)}`}
                      className="matchup-signature-profile__marker is-home"
                    />
                  )}
                  {(a.y == null || h.y == null) && <MissingLabel x={a.x} />}
                  <AdvantageAnnotation metric={metric} a={a} h={h} awayAbbr={away.abbr} homeAbbr={home.abbr} />
                  <rect
                    x={TIER_LABEL_WIDTH + index * columnWidth}
                    y={0}
                    width={columnWidth}
                    height={TOTAL_HEIGHT}
                    fill="transparent"
                    className="matchup-signature-profile__hitbox cursor-pointer"
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
                    x={TIER_LABEL_WIDTH + index * columnWidth + columnWidth / 2}
                    y={TOTAL_HEIGHT + 14}
                    textAnchor="middle"
                    className={cn(
                      "matchup-signature-profile__metric-label",
                      isActive && "is-active"
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
            className="matchup-viz-swipe-fade pointer-events-none absolute inset-y-0 right-0 w-8"
          />
        )}
      </div>
      {hasOverflow && (
        <p className="matchup-viz-swipe-hint">Swipe to see more metrics</p>
      )}
      {activeMetric && (
        <MatchupVisualMetricDetail metric={activeMetric} away={away} home={home} className="mt-2" />
      )}
    </div>
  );
}
