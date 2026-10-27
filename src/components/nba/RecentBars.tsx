import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { shortDate, type RecentPoint } from "@/lib/nba/props/recentForm";

/** The plot area (container height 92px less its 16px top padding) and the share of it a full-height bar uses, leaving room for the value above. */
const PLOT_HEIGHT_PX = 75;
const BAR_SHARE = 0.8;

const fmt = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(1));
const pointLabel = (p: RecentPoint, stat: string): string => `${shortDate(p.date)}, ${p.versus}: ${p.value === null ? "no figure" : `${fmt(p.value)} ${stat}`}`;

interface RecentBarsProps {
  /** Oldest to newest. */
  points: readonly RecentPoint[];
  /** "PTS", "REB" or "AST". */
  stat: string;
  /** Mean of the bars that carry a figure; drawn as a dashed line. */
  average: number | null;
  /** Names the chart for assistive technology, e.g. "Player last 10 results". */
  label: string;
  tone: "player" | "opponent";
  testId: string;
}

const TONE = {
  player: { bar: "bg-blue-700", selected: "bg-blue-950", text: "text-blue-900" },
  opponent: { bar: "bg-slate-600", selected: "bg-slate-900", text: "text-slate-900" },
} as const;

/**
 * Compact chronological bar chart: one bar per game, oldest at the left and newest at the right, each with its exact value
 * above it. Hovering, focusing or tapping a bar writes that game's date, opponent and figure underneath, so the exact result
 * never depends on hover alone. A tap keeps its game shown (a touch screen has no pointer to leave) until another bar is
 * chosen or the chart loses focus. A game with no figure is a dashed gap, not a zero.
 */
export default function RecentBars({ points, stat, average, label, tone, testId }: RecentBarsProps) {
  const readoutId = useId();
  const [active, setActive] = useState<number | null>(null);
  const colors = TONE[tone];
  const known = points.flatMap((p) => (p.value === null ? [] : [p.value]));
  const top = Math.max(1, ...known);
  const selected = active !== null ? points[active] : undefined;
  return (
    <div data-testid={testId}>
      <div role="group" aria-label={`${label}, oldest to newest`} aria-describedby={readoutId} className="relative flex h-[92px] items-end gap-1 border-b border-slate-300 pt-4" onMouseLeave={(event) => {
          // A keyboard-focused bar keeps its readout when the pointer merely crosses the chart.
          if (!event.currentTarget.contains(document.activeElement)) setActive(null);
        }}>
        {average !== null ? (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-dashed border-slate-500" style={{ bottom: `${((average / top) * BAR_SHARE * PLOT_HEIGHT_PX).toFixed(1)}px` }} data-testid={`${testId}-average-line`} />
        ) : null}
        {points.map((p, i) => (
          <button
            key={`${p.date}-${i}`}
            type="button"
            aria-label={pointLabel(p, stat)}
            aria-current={active === i ? "true" : undefined}
            data-testid={`${testId}-bar`}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            onClick={() => setActive(i)}
            className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
          >
            <span className={cn("relative z-10 mb-0.5 rounded-sm bg-white px-px text-[9px] font-semibold leading-none tabular-nums", p.value === null ? "text-slate-500" : colors.text)}>{p.value === null ? "–" : fmt(p.value)}</span>
            {p.value === null ? (
              <span className="w-full rounded-t-sm border border-dashed border-slate-400" style={{ height: "6px" }} />
            ) : (
              <span className={cn("w-full rounded-t-sm transition-colors", active === i ? colors.selected : colors.bar, "group-hover:opacity-90")} style={{ height: `${Math.max(4, (p.value / top) * BAR_SHARE * 100)}%` }} />
            )}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[9px] font-semibold uppercase tracking-wider text-slate-500" aria-hidden>
        <span>← oldest{points[0] ? ` · ${shortDate(points[0].date)}` : ""}</span>
        <span>{points.length > 1 ? `${shortDate(points[points.length - 1].date)} · ` : ""}newest →</span>
      </div>
      <p id={readoutId} aria-live="polite" className="mt-1 min-h-[2.2em] text-[11px] leading-snug text-slate-700" data-testid={`${testId}-readout`}>
        {selected ? (
          <>
            <strong className="font-semibold text-slate-900">{shortDate(selected.date)}</strong> · {selected.versus} · <strong className="font-semibold text-slate-900">{selected.value === null ? "no figure" : `${fmt(selected.value)} ${stat}`}</strong>
            {selected.detail ? <span className="text-slate-600"> · {selected.detail}</span> : null}
          </>
        ) : (
          <span className="text-slate-500">Hover, focus or tap a bar for the exact game.</span>
        )}
      </p>
    </div>
  );
}
