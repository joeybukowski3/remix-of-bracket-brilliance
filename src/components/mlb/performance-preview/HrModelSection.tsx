import { useMemo, useState } from "react";
import type { HrModelPerformanceSummary, HrPredictionRecord } from "@/types/mlbHrModelPerformance";
import { getEtDateString, isDateInWindow, type TimeWindowId } from "@/lib/mlb/performancePreviewWindows";
import { aggregateBoxScore } from "./aggregateBoxScore";
import BoxScoreStrip from "./BoxScoreStrip";
import ExpandableGroup from "./ExpandableGroup";
import HrPerformanceTable from "./HrPerformanceTable";
import StatTile from "./StatTile";
import TimeWindowToggle from "./TimeWindowToggle";
import { pctOrDash } from "./format";

// Must stay in lockstep with SCORE_BANDS in scripts/lib/mlb-hr-performance-summary.mjs.
// "Below 50" is deliberately excluded from VISIBLE_SCORE_BANDS -- this tracker
// view is scoped to 50+ scored plays only, though the underlying summary data
// still carries the below-50 bucket for other consumers.
const SCORE_BANDS: { label: string; min: number; max: number; accent: string }[] = [
  { label: "80+", min: 80, max: Infinity, accent: "border-l-emerald-400 bg-emerald-50/60" },
  { label: "70-79.9", min: 70, max: 79.9, accent: "border-l-sky-400 bg-sky-50/60" },
  { label: "60-69.9", min: 60, max: 69.9, accent: "border-l-indigo-400 bg-indigo-50/60" },
  { label: "50-59.9", min: 50, max: 59.9, accent: "border-l-amber-400 bg-amber-50/60" },
  { label: "Below 50", min: -Infinity, max: 49.9, accent: "" },
];
const VISIBLE_SCORE_BANDS = SCORE_BANDS.filter((b) => b.label !== "Below 50");

const CONFIDENCE_ACCENTS: Record<string, string> = {
  high: "border-l-emerald-400 bg-emerald-50/60",
  medium: "border-l-sky-400 bg-sky-50/60",
  low: "border-l-amber-400 bg-amber-50/60",
  incomplete: "border-l-slate-300 bg-slate-50",
};

function bandFor(score: number | null): string | null {
  if (score == null) return null;
  return SCORE_BANDS.find((b) => score >= b.min && score <= b.max)?.label ?? null;
}

// Same eligibility rule as buildPerformanceSummary(): only graded hit/miss records count.
function isEligible(record: HrPredictionRecord): boolean {
  return record.result.status === "hit" || record.result.status === "miss";
}

// Tracker-visible: eligible AND scored 50+ -- Below 50 never surfaces in any row-level list.
function isTracked(record: HrPredictionRecord): boolean {
  return isEligible(record) && record.hrQualityScore != null && record.hrQualityScore >= 50;
}

function bucketLabel(bucket: HrModelPerformanceSummary["byScoreBand"][string]): string {
  return `${bucket.sampleSize} graded • ${pctOrDash(bucket.actualHrRate)} HR rate${bucket.flatBetRoi != null ? ` • ${bucket.flatBetRoi >= 0 ? "+" : ""}${bucket.flatBetRoi}% ROI` : ""}`;
}

export default function HrModelSection({ summary, records, referenceDate = getEtDateString() }: { summary: HrModelPerformanceSummary; records: HrPredictionRecord[]; referenceDate?: string }) {
  const [window, setWindow] = useState<TimeWindowId>("last30");

  const trackedRecords = useMemo(() => records.filter(isTracked), [records]);
  const windowedRecords = useMemo(() => trackedRecords.filter((r) => isDateInWindow(r.date, window, referenceDate)), [trackedRecords, window, referenceDate]);
  // HR count lives on result.hrCount, not on battingLine (battingLine never carries it) -- merge it in for the box score.
  const windowBoxScore = useMemo(
    () => aggregateBoxScore(windowedRecords.map((r) => (r.result.battingLine ? { ...r.result.battingLine, homeRuns: r.result.hrCount } : null))),
    [windowedRecords],
  );

  const bandRecords = useMemo(() => {
    const map = new Map<string, HrPredictionRecord[]>();
    for (const band of VISIBLE_SCORE_BANDS) map.set(band.label, []);
    for (const record of trackedRecords) {
      const label = bandFor(record.hrQualityScore);
      if (label && map.has(label)) map.get(label)!.push(record);
    }
    return map;
  }, [trackedRecords]);

  const confidenceRecords = useMemo(() => {
    const map = new Map<string, HrPredictionRecord[]>();
    for (const record of trackedRecords) {
      const level = record.confidenceLevel ?? "incomplete";
      if (!map.has(level)) map.set(level, []);
      map.get(level)!.push(record);
    }
    return map;
  }, [trackedRecords]);

  const modelKey = Object.keys(summary.byModelVersion)[0];
  const modelBucket = summary.byModelVersion[modelKey];

  return (
    <section className="space-y-4 rounded-2xl border border-sky-100 bg-gradient-to-b from-sky-50/40 to-transparent p-4 sm:p-5">
      <div className="border-l-4 border-l-sky-500 pl-3">
        <h2 className="text-lg font-black text-slate-900">HR Model Performance</h2>
        <p className="mt-1 max-w-2xl text-xs text-slate-500">{summary.note}</p>
        <p className="mt-1 text-xs font-semibold text-sky-700">Tracker view is focused on 50+ score ranges only.</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="Graded Predictions" value={String(summary.totalGradedRecords)} surfaceClassName="border-sky-100 bg-white" />
        <StatTile label="HR Hits" value={String(modelBucket?.hrHits ?? "—")} tone="positive" surfaceClassName="border-sky-100 bg-white" />
        <StatTile label="Overall HR Rate" value={pctOrDash(modelBucket?.actualHrRate)} surfaceClassName="border-sky-100 bg-white" />
        <StatTile
          label="Flat-Bet ROI"
          value={modelBucket?.flatBetRoi != null ? `${modelBucket.flatBetRoi}%` : "—"}
          tone={(modelBucket?.flatBetRoi ?? 0) >= 0 ? "positive" : "negative"}
          surfaceClassName="border-sky-100 bg-white"
        />
      </div>
      <p className="text-xs text-slate-400">
        Tracking {summary.calibrationReadiness.calendarDayCount} calendar days • {summary.calibrationReadiness.hrOutcomeCount} HR outcomes observed.
        {summary.sampleSizeWarning ? ` ${summary.sampleSizeWarning}` : ""}
      </p>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Box Score -- 50+ Scored Plays</div>
          <TimeWindowToggle value={window} onChange={setWindow} accentClassName="bg-sky-600" />
        </div>
        <BoxScoreStrip aggregate={windowBoxScore} accentClassName="border-sky-100" />
      </div>

      <div className="space-y-3">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Score Band Results</div>
        {VISIBLE_SCORE_BANDS.map((band) => {
          const bucket = summary.byScoreBand[band.label];
          const rows = bandRecords.get(band.label) ?? [];
          if (!bucket) return null;
          return (
            <ExpandableGroup key={band.label} title={band.label} summary={bucketLabel(bucket)} accentClassName={band.accent}>
              <HrPerformanceTable records={rows} />
            </ExpandableGroup>
          );
        })}
      </div>

      <div className="space-y-3">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Confidence Level</div>
        {Object.entries(summary.byConfidenceLevel).map(([level, bucket]) => {
          const rows = confidenceRecords.get(level) ?? [];
          if (bucket.sampleSize === 0) return null;
          return (
            <ExpandableGroup key={level} title={level.charAt(0).toUpperCase() + level.slice(1)} summary={bucketLabel(bucket)} accentClassName={CONFIDENCE_ACCENTS[level]}>
              <HrPerformanceTable records={rows} />
            </ExpandableGroup>
          );
        })}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Recent Graded Plays</div>
        </div>
        <ExpandableGroup title="Recent Graded Plays" summary={`${windowedRecords.length} graded plays in this window`} defaultOpen accentClassName="border-l-sky-400 bg-sky-50/40">
          <HrPerformanceTable records={windowedRecords} />
        </ExpandableGroup>
      </div>
    </section>
  );
}
