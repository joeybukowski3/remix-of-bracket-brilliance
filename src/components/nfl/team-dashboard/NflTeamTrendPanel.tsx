import {
  NFL_TREND_CLASSIFICATION_LABELS,
  buildNflTeamTrendSummary,
  classificationTone,
  confidenceTone,
  formatTrendRank,
  movementArrow,
  movementLabel,
  movementTone,
  rankMovementArrow,
  rankMovementLabel,
} from "@/lib/nfl/teamTrendPresentation";
import {
  getNflTrendRecord,
  type NflTrendClassification,
  type NflTrendConfidenceLevel,
  type NflTrendRecord,
} from "@/lib/nfl/teamTrends";
import type { NflGuideTeamNormalized } from "@/lib/nfl/guideData";

type TrendTeamIdentity = Pick<NflGuideTeamNormalized, "abbr" | "teamName">;

type NflTeamTrendPanelProps = {
  team: TrendTeamIdentity;
  trendRecord?: NflTrendRecord | null;
};

type Tone = "up" | "down" | "neutral" | "low";

const toneClasses: Record<Tone, string> = {
  up: "border-emerald-200 bg-emerald-50 text-emerald-800",
  down: "border-red-200 bg-red-50 text-red-700",
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
  low: "border-amber-200 bg-amber-50 text-amber-800",
};

const valueToneClasses: Record<"up" | "down" | "neutral", string> = {
  up: "text-emerald-700",
  down: "text-red-600",
  neutral: "text-slate-700",
};

export default function NflTeamTrendPanel({ team, trendRecord }: NflTeamTrendPanelProps) {
  const record = trendRecord === undefined ? getNflTrendRecord(team.abbr) : trendRecord;

  if (!record) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="nfl-team-trend-panel">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">NFL v0.3 2025 Performance Trend</div>
        <h2 className="mt-1 text-2xl font-black text-slate-900">2025 Late-Season Trend</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Trend data is unavailable for this team. No movement values are inferred.
        </p>
      </section>
    );
  }

  const classification = NFL_TREND_CLASSIFICATION_LABELS[record.classification];
  const summary = buildNflTeamTrendSummary(record);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid="nfl-team-trend-panel">
      <div className="border-b border-slate-100 bg-slate-50 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">NFL v0.3 2025 Performance Trend</div>
            <h2 className="mt-1 text-2xl font-black text-slate-900">2025 Late-Season Trend</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Full-season performance compared with the final eight completed games. This panel does not replace the legacy 2026 preseason rating.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <TrendBadge classification={record.classification} label={classification} />
            <ConfidenceBadge level={record.confidence.level} />
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-800">
              Stage-1
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[1.15fr_.85fr]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <ComparisonTile
              label="Full-season rank"
              value={formatTrendRank(record.fullSeason.rank)}
              sublabel="All 2025 completed games"
            />
            <ComparisonTile
              label="Final-eight rank"
              value={formatTrendRank(record.finalEight.rank)}
              sublabel={`${record.finalEight.windowSize} completed games`}
            />
            <MovementTile
              label="Rank movement"
              value={rankMovementArrow(record.deltas.rank)}
              description={rankMovementLabel(record.deltas.rank)}
              tone={movementTone(record.deltas.rank)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <ComparisonTile
              label="Full-season rating"
              value={record.fullSeason.comparableRating?.toFixed(1) ?? "—"}
              sublabel="Public scale"
            />
            <ComparisonTile
              label="Final-eight rating"
              value={record.finalEight.comparableRating?.toFixed(1) ?? "—"}
              sublabel="Public scale"
            />
            <MovementTile
              label="Rating movement"
              value={movementArrow(record.deltas.rating, 1)}
              description={movementLabel(record.deltas.rating, "public-scale rating points")}
              tone={movementTone(record.deltas.rating)}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Unit movement</div>
          <div className="mt-3 grid gap-2">
            <UnitMovement label="Offense movement" value={record.deltas.offense} unit="offense z-score" digits={2} />
            <UnitMovement label="Defense movement" value={record.deltas.defense} unit="defense z-score" digits={2} />
            {record.deltas.netEpa !== null && (
              <UnitMovement label="Net EPA movement" value={record.deltas.netEpa} unit="net EPA z-score" digits={2} />
            )}
            {record.deltas.pointDiff !== null && (
              <UnitMovement label="Point differential movement" value={record.deltas.pointDiff} unit="point-differential z-score" digits={2} />
            )}
          </div>
        </div>
      </div>

      {summary && (
        <div className="border-t border-slate-100 px-5 py-4">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Factual trend summary</div>
          <p className="mt-2 text-sm leading-6 text-slate-700">{summary}</p>
        </div>
      )}

      <div className="border-t border-slate-100 bg-slate-50 px-5 py-4 text-xs leading-5 text-slate-600">
        <p>
          Full-season means all 2025 completed games. Final-eight means each team's final eight completed games. Both use the same NFL v0.3 public-scale transform. Positive movement means stronger late-season performance. Classification is relative to the 32-team distribution. This does not project 2026 performance. NFL v0.3 remains Stage-1.
        </p>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="NFL team trend source metadata">
          <SourcePill label={`Source season ${record.sourceSeason}`} />
          <SourcePill label={record.sources.modelVersion} />
          <SourcePill label={`Generated ${record.sources.generatedAt || "Unknown"}`} />
          <SourcePill label={`Validation ${record.sources.validationStatus === "stage-1" ? "Stage-1" : record.sources.validationStatus}`} />
        </div>
        {record.confidence.missingReasons.length > 0 && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
            <div className="font-black">Missing-data notes</div>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {record.confidence.missingReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function TrendBadge({ classification, label }: { classification: NflTrendClassification; label: string }) {
  const tone = classificationTone(classification);
  return (
    <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${toneClasses[tone]}`}>
      {label}
    </span>
  );
}

function ConfidenceBadge({ level }: { level: NflTrendConfidenceLevel }) {
  const tone = confidenceTone(level);
  return (
    <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${toneClasses[tone]}`}>
      {level} confidence
    </span>
  );
}

function ComparisonTile({ label, value, sublabel }: { label: string; value: string; sublabel: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-black text-slate-900">{value}</div>
      <div className="mt-1 text-[11px] font-bold text-slate-500">{sublabel}</div>
    </div>
  );
}

function MovementTile({
  label,
  value,
  description,
  tone,
}: {
  label: string;
  value: string;
  description: string;
  tone: "up" | "down" | "neutral";
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-black ${valueToneClasses[tone]}`} aria-hidden>
        {value}
      </div>
      <div className="sr-only">{description}</div>
      <div className="mt-1 text-[11px] font-bold text-slate-500">{description}</div>
    </div>
  );
}

function UnitMovement({
  label,
  value,
  unit,
  digits,
}: {
  label: string;
  value: number | null;
  unit: string;
  digits: number;
}) {
  if (value === null) return null;
  const tone = movementTone(value);
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div>
        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div>
        <div className="text-[11px] font-bold text-slate-500">{movementLabel(value, unit, digits)}</div>
      </div>
      <div className={`text-lg font-black ${valueToneClasses[tone]}`} aria-hidden>
        {movementArrow(value, digits)}
      </div>
    </div>
  );
}

function SourcePill({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-black text-slate-600">
      {label}
    </span>
  );
}
