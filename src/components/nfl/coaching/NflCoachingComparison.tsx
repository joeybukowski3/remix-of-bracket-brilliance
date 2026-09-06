import { cn } from "@/lib/utils";
import {
  COACHING_ATS_NOTE,
  FIRST_YEAR_LABEL,
  NO_NFL_HC_RECORD_LABEL,
  buildCoachingComparisonView,
  type CoachingComparisonView,
  type CoachingSideView,
} from "@/lib/nfl/performance/coachingPresentation";
import type { CoachingContext } from "@/types/nfl/performance";

/**
 * Reusable Coaching Rating v1 comparison — Sides, Totals and the matchup
 * analyzer all render this one component so the contract is read identically
 * everywhere.
 *
 * ANALYSIS CONTEXT ONLY. It shows two coaches, their ratings and their
 * historical records, plus which side the rating differential favors. It never
 * implies a pick, a total direction, or a causal claim, and the ATS records it
 * shows are explicitly labeled as unweighted.
 *
 * Layout is a two-row stack rather than a side-by-side table: at 375px a
 * two-column record grid wraps "102-63" and "89-72-4" onto separate lines,
 * which reads as four numbers instead of two records.
 */

function Badge({ tone, children }: { tone: "slate" | "amber"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-px text-[9px] font-bold uppercase tracking-wide",
        tone === "amber"
          ? "border-amber-300 bg-amber-50 text-amber-800"
          : "border-slate-300 bg-slate-100 text-slate-600",
      )}
    >
      {children}
    </span>
  );
}

/**
 * One coach. An unrated side still renders its team and the word "Unrated"
 * rather than disappearing or showing a fabricated rating of 0.
 */
function CoachRow({ side, advantaged }: { side: CoachingSideView; advantaged: boolean }) {
  const hasRecord = side.careerWl != null || side.careerAts != null;

  return (
    <div
      data-testid={`nfl-coaching-${side.side}`}
      className={cn(
        "flex flex-col gap-0.5 rounded-md border px-2.5 py-2",
        advantaged ? "border-slate-300 bg-white" : "border-slate-200 bg-slate-50/70",
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{side.teamLabel}</span>
        <span className="text-[13px] font-semibold leading-tight text-slate-900">
          {side.coachName ?? "Coach unavailable"}
        </span>
        {side.firstYear && <Badge tone="slate">{FIRST_YEAR_LABEL}</Badge>}
        {side.smallSample && !side.firstYear && <Badge tone="amber">Small sample</Badge>}
        {side.interim && <Badge tone="slate">Interim</Badge>}
      </div>

      <div className="text-[12px] leading-5 text-slate-700">
        <span className="text-slate-500">Rating </span>
        <span className="font-semibold tabular-nums text-slate-900">
          {side.rating != null ? side.rating : "Unrated"}
        </span>
      </div>

      {hasRecord ? (
        <div className="text-[11px] leading-4 text-slate-600">
          {side.careerWl != null && (
            <div className="tabular-nums">
              {side.careerWl} <span className="text-slate-400">career</span>
            </div>
          )}
          {side.careerAts != null && (
            <div className="tabular-nums">
              {side.careerAts} <span className="text-slate-400">ATS</span>
            </div>
          )}
        </div>
      ) : (
        <div className="text-[11px] leading-4 text-slate-500">{NO_NFL_HC_RECORD_LABEL}</div>
      )}
    </div>
  );
}

export type NflCoachingComparisonProps = {
  /** Either the raw shared contract... */
  coaching?: CoachingContext | null;
  /** ...or an already-built projection (matchup analyzer passes this). */
  view?: CoachingComparisonView;
  /** Required when passing `coaching`: team codes live on the row, not the block. */
  homeTeam?: string;
  awayTeam?: string;
  /** Renders a compact heading row; off when the host already has one. */
  showHeading?: boolean;
  headingLabel?: string;
  className?: string;
};

export default function NflCoachingComparison({
  coaching,
  view,
  homeTeam = "",
  awayTeam = "",
  showHeading = true,
  headingLabel = "Coaching advantage",
  className = "",
}: NflCoachingComparisonProps) {
  const resolved = view ?? buildCoachingComparisonView(coaching, homeTeam, awayTeam);

  if (resolved.unavailable) {
    return (
      <div
        data-testid="nfl-coaching-comparison"
        className={cn("rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2", className)}
      >
        {showHeading && (
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{headingLabel}</h4>
        )}
        <p className="mt-0.5 text-[12px] text-slate-600">Coaching context unavailable</p>
      </div>
    );
  }

  return (
    <section
      data-testid="nfl-coaching-comparison"
      aria-label="Coaching advantage"
      className={cn("@container space-y-1.5", className)}
    >
      {showHeading && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{headingLabel}</h4>
          <span
            data-testid="nfl-coaching-advantage"
            className="text-[12px] font-bold tabular-nums tracking-wide text-slate-900"
          >
            {resolved.advantageLabel}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-1.5 @[420px]:grid-cols-2">
        <CoachRow side={resolved.home} advantaged={resolved.advantage === "home"} />
        <CoachRow side={resolved.away} advantaged={resolved.advantage === "away"} />
      </div>

      <p data-testid="nfl-coaching-ats-note" className="text-[10px] leading-4 text-slate-500">
        {COACHING_ATS_NOTE}
      </p>
    </section>
  );
}
