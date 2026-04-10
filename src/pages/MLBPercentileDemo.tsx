import SiteNav from "@/components/SiteNav";
import { useMLBPercentilesSample } from "@/hooks/useMLBPercentilesSample";

export default function MLBPercentileDemo() {
  const { data, isLoading, error } = useMLBPercentilesSample();

  const players = data?.players ?? [];

  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <div className="container mx-auto px-4 py-6 space-y-6">
        <h1 className="text-xl font-bold text-foreground">MLB Percentile Styling Demo</h1>
        <p className="text-sm text-muted-foreground max-w-xl">
          This demo uses a static JSON sample to show how Statcast-style percentiles will render with color coding.
        </p>

        {isLoading && <p className="text-sm text-muted-foreground">Loading sample data…</p>}
        {error && <p className="text-sm text-destructive">Failed to load sample data.</p>}

        {!isLoading && !error && players.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {players.map((p) => (
              <div key={p.id} className="bg-card border border-border rounded-lg p-4 space-y-2">
                <div className="flex items-baseline justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-foreground">{p.name}</h2>
                    <p className="text-[11px] text-muted-foreground">Team: {p.teamId.toUpperCase()}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Static sample only</p>
                </div>

                <div className="mt-2 space-y-1 text-xs">
                  {(["xwOBA", "xSLG", "barrelRate", "kPct", "bbPct"] as const).map((key) => {
                    const value = p.stats[key];
                    const pct = p.percentiles[key];

                    // Reuse the same color logic as GameDetail's percentileToClass
                    const centered = key === "kPct" ? 100 - pct : pct; // for K% lower is better
                    let bg = "bg-slate-800/40 text-slate-100";
                    if (centered >= 90) bg = "bg-red-900/70 text-red-50";
                    else if (centered >= 75) bg = "bg-red-800/60 text-red-50";
                    else if (centered >= 60) bg = "bg-red-700/40 text-red-100";
                    else if (centered >= 50) bg = "bg-red-600/30 text-red-100";
                    else if (centered >= 40) bg = "bg-slate-800/40 text-slate-100";
                    else if (centered >= 25) bg = "bg-blue-900/50 text-blue-100";
                    else if (centered >= 10) bg = "bg-blue-950/60 text-blue-100";
                    else bg = "bg-blue-950/80 text-blue-50";

                    return (
                      <div key={key} className={`flex items-center justify-between rounded-md px-2 py-1 ${bg}`}>
                        <span className="font-medium">
                          {key}
                        </span>
                        <span className="tabular-nums font-semibold">
                          {value} <span className="text-[10px] opacity-80">({pct}th %ile)</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
