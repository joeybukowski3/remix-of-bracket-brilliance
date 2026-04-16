import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import SeoFooterBlock from "@/components/SeoFooterBlock";
import StatSliders from "@/components/StatSliders";
import RankingsTable from "@/components/RankingsTable";
import {
  buildCanonicalTeams,
  dedupeTeamsByCanonicalId,
  teams,
  DEFAULT_STAT_WEIGHTS,
  ELITE_8_PRESET_WEIGHTS,
  type StatWeight,
  type ModelScoreOptions,
} from "@/data/ncaaTeams";
import { useLiveTeams } from "@/hooks/useLiveTeams";
import { usePageSeo } from "@/hooks/usePageSeo";
import { NCAA_BRACKET_PATH, NCAA_MATCHUP_PATH, NCAA_SCHEDULE_PATH } from "@/lib/routes";

export default function Rankings() {
  const [weights, setWeights] = useState<StatWeight[]>(DEFAULT_STAT_WEIGHTS);
  const [showSliders, setShowSliders] = useState(true);
  const [mode, setMode] = useState<"all" | "field">("all");
  const [homeInflationPenaltyWeight, setHomeInflationPenaltyWeight] = useState(0);
  const [q1BonusWeight, setQ1BonusWeight] = useState(0);
  const [showModelAdjSliders, setShowModelAdjSliders] = useState(false);
  const { data: liveTeams = [] } = useLiveTeams();

  const allTeams = useMemo(() => dedupeTeamsByCanonicalId(buildCanonicalTeams(liveTeams)), [liveTeams]);
  const rankingTeams = useMemo(
    () => (mode === "all" ? allTeams : dedupeTeamsByCanonicalId(teams)),
    [allTeams, mode],
  );

  const modelOpts: ModelScoreOptions = useMemo(() => ({
    homeInflationPenaltyWeight,
    q1BonusWeight,
  }), [homeInflationPenaltyWeight, q1BonusWeight]);

  usePageSeo({
    title: "Joe Knows Ball | NCAA Analytics, Custom Rankings & March Madness Analysis",
    description:
      "Explore NCAA basketball analytics including custom rankings, matchup analysis, advanced team metrics, and March Madness bracket breakdowns.",
    path: "/ncaa",
  });

  const handleWeightChange = (key: string, value: number) => {
    setWeights((prev) => prev.map((weight) => (weight.key === key ? { ...weight, weight: value } : weight)));
  };

  const resetWeights = () => setWeights(DEFAULT_STAT_WEIGHTS);

  return (
    <SiteShell>
      <div className="site-container site-stack py-6">
        <div>
          <h1 className="page-title text-foreground">NCAA Basketball Analytics &amp; Custom Rankings</h1>
          <p className="mt-2 page-copy">
            Build custom NCAA power rankings with advanced metrics, model weights, and tournament-focused team analysis.
          </p>
          <p className="mt-3 max-w-3xl page-copy text-sm">
            Joe Knows Ball combines NCAA analytics, team breakdowns, and March Madness analysis into one rankings tool
            so you can compare the full Division I landscape or isolate the tournament field.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            <Link to={NCAA_SCHEDULE_PATH} className="text-primary hover:underline">
              NCAA Schedule
            </Link>
            <Link to={NCAA_MATCHUP_PATH} className="text-primary hover:underline">
              Matchup Analyzer
            </Link>
            <Link to={NCAA_BRACKET_PATH} className="text-primary hover:underline">
              Bracket Predictor
            </Link>
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="surface-card-muted">
            <h2 className="text-lg font-semibold text-foreground">Advanced NCAA Team Metrics</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Re-rank teams using offense rating, defense rating, strength of schedule, pace, shooting, and rebounding
              signals that matter in NCAA basketball analytics.
            </p>
          </div>
          <div className="surface-card-muted">
            <h2 className="text-lg font-semibold text-foreground">Custom NCAA Power Rankings</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Switch between all teams and the tournament field, adjust custom metrics, and create your own NCAA model
              rankings without changing the existing workflow.
            </p>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setMode("all")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            All Teams
          </button>
          <button
            onClick={() => setMode("field")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "field"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            NCAA Tournament Field
          </button>
          <span className="text-xs text-muted-foreground">{rankingTeams.length} teams</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => setShowSliders(!showSliders)} className="text-sm font-medium text-primary hover:underline">
            {showSliders ? "Hide" : "Show"} Weight Controls
          </button>
          <button onClick={resetWeights} className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Reset Defaults
          </button>
          <button
            onClick={() => setWeights(ELITE_8_PRESET_WEIGHTS)}
            className="rounded-md bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/80"
          >
            2025 Elite 8 Team Rank Preset
          </button>
          <button
            onClick={() => setShowModelAdjSliders((v) => !v)}
            className="rounded-md bg-secondary px-3 py-1 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            {showModelAdjSliders ? "Hide" : "Show"} Resume & Regression Adjustments
          </button>
        </div>

        {showSliders ? <StatSliders weights={weights} onWeightChange={handleWeightChange} /> : null}

        {showModelAdjSliders && (
          <div className="surface-card space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">Resume &amp; Home Regression Model Adjustments</h3>
              <p className="text-xs text-muted-foreground">
                These adjustments layer on top of the core stat weights. The neutral-site efficiency blend (80% away /
                20% home) is always applied to efficiency stats when these are active.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Home Inflation Penalty
                  </label>
                  <span className="text-sm font-bold text-primary tabular-nums">{homeInflationPenaltyWeight}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={homeInflationPenaltyWeight}
                  onChange={(e) => setHomeInflationPenaltyWeight(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Penalizes teams whose ranking may be home-inflated (score &gt; +5 vs Top-50 avg drop-off). At 100, −1 pt per +1 inflation score.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Q1 Win Rate Bonus
                  </label>
                  <span className="text-sm font-bold text-primary tabular-nums">{q1BonusWeight}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={q1BonusWeight}
                  onChange={(e) => setQ1BonusWeight(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Rewards teams with strong Q1 records (games vs top-50 opponents). At 100, a perfect Q1 record adds +2 pts.
                </p>
              </div>
            </div>

            <button
              onClick={() => { setHomeInflationPenaltyWeight(0); setQ1BonusWeight(0); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Reset adjustments
            </button>
          </div>
        )}

        <RankingsTable teams={rankingTeams} weights={weights} teamPool={allTeams} modelOpts={modelOpts} />

        <SeoFooterBlock />
      </div>
    </SiteShell>
  );
}
