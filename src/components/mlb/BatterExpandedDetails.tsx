import type { BvpHistoryEntry } from "@/hooks/useMlbBvpHistory";
import {
  SAMPLE_MINIMUMS,
  buildPercentileLookup,
  lookupPercentile,
  resolvePercentileDisplay,
  resolveSampleSize,
  type PercentileDirection,
} from "@/lib/mlb/percentileColorScale";
import { cn } from "@/lib/utils";

export type SeasonProfileMetricKey =
  | "xba"
  | "hardHitRate"
  | "barrelRate"
  | "kRate"
  | "bbRate"
  | "iso"
  | "exitVelo"
  | "last7HR"
  | "last30HR";

export type BatterSeasonProfileData = {
  atBats?: number | null;
  plateAppearances?: number | null;
} & Partial<Record<SeasonProfileMetricKey, number | null>>;

export type SeasonProfilePercentileLookups = Record<SeasonProfileMetricKey, Map<number, number>>;

type SeasonMetricDef = {
  key: SeasonProfileMetricKey | "atBats" | "plateAppearances";
  label: string;
  format: (value: number) => string;
  direction?: PercentileDirection;
  colorEligible: boolean;
};

const SEASON_METRIC_DEFS: SeasonMetricDef[] = [
  { key: "plateAppearances", label: "PA", format: (v) => String(Math.round(v)), colorEligible: false },
  { key: "atBats", label: "AB", format: (v) => String(Math.round(v)), colorEligible: false },
  { key: "xba", label: "xBA", format: (v) => v.toFixed(3).replace(/^0\./, "."), colorEligible: true },
  { key: "hardHitRate", label: "HH%", format: (v) => `${v.toFixed(1)}%`, colorEligible: true },
  { key: "barrelRate", label: "Barrel%", format: (v) => `${v.toFixed(1)}%`, colorEligible: true },
  { key: "kRate", label: "K%", format: (v) => `${v.toFixed(1)}%`, direction: "lowerBetter", colorEligible: true },
  { key: "bbRate", label: "BB%", format: (v) => `${v.toFixed(1)}%`, colorEligible: true },
  { key: "iso", label: "ISO", format: (v) => v.toFixed(3).replace(/^0\./, "."), colorEligible: true },
  { key: "exitVelo", label: "EV", format: (v) => v.toFixed(1), colorEligible: true },
  { key: "last7HR", label: "L7 HR", format: (v) => String(Math.round(v)), colorEligible: true },
  { key: "last30HR", label: "L30 HR", format: (v) => String(Math.round(v)), colorEligible: true },
];

const CONTACT_QUALITY_METRICS = new Set<SeasonProfileMetricKey>(["xba", "hardHitRate", "barrelRate"]);

function finiteMetric(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value;
}

export function buildSeasonProfilePercentileLookups(
  rows: readonly BatterSeasonProfileData[],
): SeasonProfilePercentileLookups {
  const lookups = {} as SeasonProfilePercentileLookups;
  for (const def of SEASON_METRIC_DEFS) {
    if (!def.colorEligible) continue;
    const key = def.key as SeasonProfileMetricKey;
    lookups[key] = buildPercentileLookup(rows.map((row) => row[key]));
  }
  return lookups;
}

type SeasonMetric = {
  key: SeasonMetricDef["key"];
  label: string;
  display: string;
  percentileTier: string | null;
  sampleConfidence: string | null;
  style: { backgroundColor: string; color: string; border: string } | null;
};

function collectSeasonMetrics(
  row: BatterSeasonProfileData,
  percentileLookups: SeasonProfilePercentileLookups | null,
): SeasonMetric[] {
  const sampleSize = resolveSampleSize({
    atBats: row.atBats,
    plateAppearances: row.plateAppearances,
  });

  return SEASON_METRIC_DEFS.flatMap((def) => {
    const raw = finiteMetric(row[def.key]);
    if (raw == null) return [];

    if (!def.colorEligible || !percentileLookups) {
      return [{
        key: def.key,
        label: def.label,
        display: def.format(raw),
        percentileTier: null,
        sampleConfidence: null,
        style: null,
      }];
    }

    const key = def.key as SeasonProfileMetricKey;
    const resolved = resolvePercentileDisplay({
      value: raw,
      percentile: lookupPercentile(raw, percentileLookups[key]),
      direction: def.direction ?? "higherBetter",
      sampleSize,
      sampleMinimum: CONTACT_QUALITY_METRICS.has(key)
        ? SAMPLE_MINIMUMS.contactQuality
        : SAMPLE_MINIMUMS.seasonRate,
    });

    return [{
      key,
      label: def.label,
      display: def.format(raw),
      percentileTier: resolved.tier?.id ?? null,
      sampleConfidence: resolved.confidence,
      style: resolved.style,
    }];
  });
}

function SeasonMetricTile({ metric, compact = false }: { metric: SeasonMetric; compact?: boolean }) {
  return (
    <div className={cn("min-w-[3.25rem] rounded-md bg-slate-50 px-1.5 py-1 text-center", compact && "min-w-0")}>
      <div className="text-[8px] font-black uppercase tracking-wide text-slate-400">{metric.label}</div>
      <span
        className="mt-0.5 inline-block rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-slate-800"
        style={metric.style ?? undefined}
        data-season-metric={metric.key}
        data-percentile-tier={metric.percentileTier ?? "neutral"}
        data-sample-confidence={metric.sampleConfidence ?? "none"}
      >
        {metric.display}
      </span>
    </div>
  );
}

export function BatterSeasonProfile({
  row,
  percentileLookups = null,
}: {
  row: BatterSeasonProfileData;
  percentileLookups?: SeasonProfilePercentileLookups | null;
}) {
  const metrics = collectSeasonMetrics(row, percentileLookups);
  if (metrics.length === 0) return null;

  return (
    <div data-testid="batter-season-profile">
      <div className="hidden rounded-lg border border-slate-200 bg-white px-2.5 py-2 sm:block" data-testid="bvp-season-stats-row">
        <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-600">2026 Season Profile</div>
        <div className="flex flex-wrap gap-1.5" data-testid="bvp-season-stats-metrics">
          {metrics.map((metric) => <SeasonMetricTile key={metric.key} metric={metric} />)}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 sm:hidden" data-testid="bvp-season-stats-card">
        <div className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-slate-500">2026 Season Profile</div>
        <div className="grid grid-cols-3 gap-1.5">
          {metrics.map((metric) => <SeasonMetricTile key={metric.key} metric={metric} compact />)}
        </div>
      </div>
    </div>
  );
}

type BvpMetric = { key: string; label: string; display: string };

function collectBvpMetrics(entry: BvpHistoryEntry | undefined): BvpMetric[] | null {
  if (!entry || entry.status === "no_matchups") return null;
  const split = entry.career ?? entry.last5y;
  if (!split) return null;
  const pa = finiteMetric(split.pa);
  if (pa == null || pa <= 0) return null;

  const metrics: BvpMetric[] = [{ key: "pa", label: "PA", display: String(Math.round(pa)) }];
  const h = finiteMetric(split.h);
  if (h != null) metrics.push({ key: "h", label: "H", display: String(Math.round(h)) });
  const hr = finiteMetric(split.hr);
  if (hr != null) metrics.push({ key: "hr", label: "HR", display: String(Math.round(hr)) });
  const avg = finiteMetric(split.avg);
  if (avg != null) metrics.push({ key: "avg", label: "AVG", display: avg.toFixed(3).replace(/^0\./, ".") });
  return metrics;
}

function BvpMetricTile({ metric }: { metric: BvpMetric }) {
  return (
    <div className="min-w-[3.25rem] rounded-md bg-white/80 px-1.5 py-1 text-center">
      <div className="text-[8px] font-black uppercase tracking-wide text-sky-500">{metric.label}</div>
      <div className="text-[11px] font-bold tabular-nums text-sky-900">{metric.display}</div>
    </div>
  );
}

export function BatterVsPitcherSummary({
  opposingPitcher,
  bvpEntry,
  bvpLoading,
  bvpUnavailable = false,
}: {
  opposingPitcher: string;
  bvpEntry: BvpHistoryEntry | undefined;
  bvpLoading: boolean;
  bvpUnavailable?: boolean;
}) {
  const metrics = collectBvpMetrics(bvpEntry);
  const showNoAbsNote = !bvpLoading && bvpEntry?.status === "no_matchups";
  const showUnavailable =
    !bvpLoading
    && !showNoAbsNote
    && (bvpUnavailable || !bvpEntry || bvpEntry.status === "unavailable" || bvpEntry.status === "inconsistent");

  return (
    <div data-testid="batter-vs-pitcher-summary">
      {metrics ? (
        <>
          <div className="hidden rounded-lg border border-sky-100 bg-sky-50/70 px-2.5 py-2 sm:block" data-testid="bvp-pitcher-stats-row">
            <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-sky-700">vs {opposingPitcher}</div>
            <div className="flex flex-wrap gap-1.5" data-testid="bvp-pitcher-stats-metrics">
              {metrics.map((metric) => <BvpMetricTile key={metric.key} metric={metric} />)}
            </div>
          </div>
          <div className="rounded-lg border border-sky-100 bg-sky-50/60 px-2.5 py-2 sm:hidden" data-testid="bvp-pitcher-stats-card">
            <div className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-sky-700">vs {opposingPitcher}</div>
            <div className="grid grid-cols-4 gap-1.5">
              {metrics.map((metric) => <BvpMetricTile key={metric.key} metric={metric} />)}
            </div>
          </div>
        </>
      ) : null}

      {showNoAbsNote ? (
        <div className="rounded-lg border border-sky-100 bg-sky-50/60 px-2.5 py-2">
          <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-sky-700">vs {opposingPitcher}</div>
          <p className="text-[11px] text-slate-400" data-testid="bvp-no-abs-note">No ABs vs this pitcher.</p>
        </div>
      ) : null}
      {bvpLoading && !bvpEntry ? (
        <p className="text-[11px] text-slate-400">Loading matchup history…</p>
      ) : null}
      {showUnavailable ? (
        <p className="text-[11px] text-slate-400" data-testid="bvp-history-unavailable">
          Matchup history unavailable.
        </p>
      ) : null}
    </div>
  );
}
