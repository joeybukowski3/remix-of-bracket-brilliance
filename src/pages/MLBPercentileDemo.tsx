import SiteShell from "@/components/layout/SiteShell";
import { PercentileCell } from "@/components/mlb/MlbPercentileScoreCell";
import { useMLBPercentilesSample, type MLBStatKey } from "@/hooks/useMLBPercentilesSample";
import { PERCENTILE_TIER_LEGEND } from "@/lib/mlb/percentileColorScale";

const METRIC_KEYS: readonly MLBStatKey[] = ["xwOBA", "xSLG", "barrelRate", "kPct", "bbPct"];

/**
 * K% is the only lower-is-better rate here; every other metric reads
 * higher-is-better. Matches the original demo's `100 - pct` inversion for K%.
 */
function directionFor(key: MLBStatKey): "higherBetter" | "lowerBetter" {
  return key === "kPct" ? "lowerBetter" : "higherBetter";
}

/** Compact color-scale legend — same tier definitions the cells use. */
function PercentileColorLegend() {
  return (
    <div
      className="rounded-md border border-slate-200/80 bg-white/90 px-3 py-2 shadow-sm"
      aria-label="Percentile color scale legend"
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {PERCENTILE_TIER_LEGEND.map((tier) => (
          <span key={tier.id} className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: tier.style.backgroundColor, border: tier.style.border }}
            />
            {tier.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function MLBPercentileDemo() {
  const { data, isLoading, error } = useMLBPercentilesSample();

  const players = data?.players ?? [];

  return (
    <SiteShell>
      <div className="site-container site-stack py-6">
        <h1 className="text-2xl font-semibold text-foreground">MLB Percentile Styling Demo</h1>
        <p className="text-sm text-muted-foreground max-w-xl">
          This demo uses a static JSON sample to show how Statcast-style percentiles will render with the shared
          JKB Heat scale. The sample carries no live sample sizes, so the sample-confidence gate is intentionally
          bypassed here to show the full band range.
        </p>

        {isLoading && <p className="text-sm text-muted-foreground">Loading sample data…</p>}
        {error && <p className="text-sm text-destructive">Failed to load sample data.</p>}

        {!isLoading && !error && players.length > 0 && (
          <>
            <PercentileColorLegend />
            <div className="grid gap-4 md:grid-cols-2">
              {players.map((p) => (
                <div key={p.id} className="surface-card space-y-2 p-4">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-foreground">{p.name}</h2>
                      <p className="text-[11px] text-muted-foreground">Team: {p.teamId.toUpperCase()}</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Static sample only</p>
                  </div>

                  <div className="mt-2 space-y-1 text-xs">
                    {METRIC_KEYS.map((key) => {
                      const value = p.stats[key];
                      const pct = p.percentiles[key];

                      return (
                        <div key={key} className="flex items-center justify-between rounded-md px-2 py-1">
                          <span className="font-medium text-foreground">{key}</span>
                          <span className="flex items-baseline gap-1.5">
                            <PercentileCell
                              value={value}
                              display={String(value)}
                              percentile={pct}
                              direction={directionFor(key)}
                              bypassSampleGate
                            />
                            <span className="text-[10px] tabular-nums text-muted-foreground">({pct}th %ile)</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </SiteShell>
  );
}
