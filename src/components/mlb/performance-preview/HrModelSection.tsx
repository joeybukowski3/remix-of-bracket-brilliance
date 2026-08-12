import { useMemo } from "react";
import type { HrModelPerformanceSummary, HrPredictionRecord } from "@/types/mlbHrModelPerformance";
import ExpandableGroup from "./ExpandableGroup";
import HrPerformanceTable from "./HrPerformanceTable";
import StatTile from "./StatTile";
import { pctOrDash } from "./format";

// Must stay in lockstep with SCORE_BANDS in scripts/lib/mlb-hr-performance-summary.mjs.
const SCORE_BANDS: { label: string; min: number; max: number }[] = [
  { label: "80+", min: 80, max: Infinity },
  { label: "70-79.9", min: 70, max: 79.9 },
  { label: "60-69.9", min: 60, max: 69.9 },
  { label: "50-59.9", min: 50, max: 59.9 },
  { label: "Below 50", min: -Infinity, max: 49.9 },
];

function bandFor(score: number | null): string | null {
  if (score == null) return null;
  return SCORE_BANDS.find((b) => score >= b.min && score <= b.max)?.label ?? null;
}

// Same eligibility rule as buildPerformanceSummary(): only graded hit/miss records count.
function isEligible(record: HrPredictionRecord): boolean {
  return record.result.status === "hit" || record.result.status === "miss";
}

function bucketLabel(bucketKey: string, bucket: HrModelPerformanceSummary["byScoreBand"][string]): string {
  return `${bucket.sampleSize} graded • ${pctOrDash(bucket.actualHrRate)} HR rate${bucket.flatBetRoi != null ? ` • ${bucket.flatBetRoi >= 0 ? "+" : ""}${bucket.flatBetRoi}% ROI` : ""}`;
}

export default function HrModelSection({ summary, records }: { summary: HrModelPerformanceSummary; records: HrPredictionRecord[] }) {
  const recentRecords = useMemo(() => records.filter(isEligible), [records]);

  const bandRecords = useMemo(() => {
    const map = new Map<string, HrPredictionRecord[]>();
    for (const band of SCORE_BANDS) map.set(band.label, []);
    for (const record of records) {
      if (!isEligible(record)) continue;
      const label = bandFor(record.hrQualityScore);
      if (label && map.has(label)) map.get(label)!.push(record);
    }
    return map;
  }, [records]);

  const confidenceRecords = useMemo(() => {
    const map = new Map<string, HrPredictionRecord[]>();
    for (const record of records) {
      if (!isEligible(record)) continue;
      const level = record.confidenceLevel ?? "incomplete";
      if (!map.has(level)) map.set(level, []);
      map.get(level)!.push(record);
    }
    return map;
  }, [records]);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-slate-900">HR Model Performance</h2>
        <p className="mt-1 text-xs text-slate-500 max-w-2xl">{summary.note}</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="Graded Predictions" value={String(summary.totalGradedRecords)} />
        <StatTile label="HR Hits" value={String(summary.byModelVersion[Object.keys(summary.byModelVersion)[0]]?.hrHits ?? "—")} tone="positive" />
        <StatTile label="Overall HR Rate" value={pctOrDash(summary.byModelVersion[Object.keys(summary.byModelVersion)[0]]?.actualHrRate)} />
        <StatTile
          label="Flat-Bet ROI"
          value={summary.byModelVersion[Object.keys(summary.byModelVersion)[0]]?.flatBetRoi != null ? `${summary.byModelVersion[Object.keys(summary.byModelVersion)[0]].flatBetRoi}%` : "—"}
          tone={(summary.byModelVersion[Object.keys(summary.byModelVersion)[0]]?.flatBetRoi ?? 0) >= 0 ? "positive" : "negative"}
        />
      </div>
      <p className="text-xs text-slate-400">
        Tracking {summary.calibrationReadiness.calendarDayCount} calendar days • {summary.calibrationReadiness.hrOutcomeCount} HR outcomes observed.
        {summary.sampleSizeWarning ? ` ${summary.sampleSizeWarning}` : ""}
      </p>

      <div className="space-y-3">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Score Band Results</div>
        {SCORE_BANDS.map((band) => {
          const bucket = summary.byScoreBand[band.label];
          const rows = bandRecords.get(band.label) ?? [];
          if (!bucket) return null;
          return (
            <ExpandableGroup key={band.label} title={band.label} summary={bucketLabel(band.label, bucket)}>
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
            <ExpandableGroup key={level} title={level.charAt(0).toUpperCase() + level.slice(1)} summary={bucketLabel(level, bucket)}>
              <HrPerformanceTable records={rows} />
            </ExpandableGroup>
          );
        })}
      </div>

      <div className="space-y-3">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Recent Graded Plays</div>
        <ExpandableGroup title="All Graded Plays" summary={`${recentRecords.length} graded plays`} defaultOpen>
          <HrPerformanceTable records={recentRecords} />
        </ExpandableGroup>
      </div>
    </section>
  );
}
