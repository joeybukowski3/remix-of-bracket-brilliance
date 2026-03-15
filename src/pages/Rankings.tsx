import { useState } from "react";
import { Link } from "react-router-dom";
import SeoFooterBlock from "@/components/SeoFooterBlock";
import SiteNav from "@/components/SiteNav";
import StatSliders from "@/components/StatSliders";
import RankingsTable from "@/components/RankingsTable";
import { buildCanonicalTeams, teams, DEFAULT_STAT_WEIGHTS, ELITE_8_PRESET_WEIGHTS, type StatWeight } from "@/data/ncaaTeams";
import { useLiveTeams } from "@/hooks/useLiveTeams";
import { usePageSeo } from "@/hooks/usePageSeo";

export default function Rankings() {
  const [weights, setWeights] = useState<StatWeight[]>(DEFAULT_STAT_WEIGHTS);
  const [showSliders, setShowSliders] = useState(true);
  const [mode, setMode] = useState<"all" | "field">("all");
  const { data: liveTeams = [] } = useLiveTeams();

  const allTeams = buildCanonicalTeams(liveTeams);
  const rankingTeams = mode === "all" ? allTeams : teams;

  usePageSeo({
    title: "Joe Knows Ball | NCAA Analytics, Custom Rankings & March Madness Analysis",
    description:
      "Explore NCAA basketball analytics including custom rankings, matchup analysis, advanced team metrics, and March Madness bracket breakdowns.",
    canonical: "https://joeknowsball.com/",
  });

  const handleWeightChange = (key: string, value: number) => {
    setWeights((prev) =>
      prev.map((w) => (w.key === key ? { ...w, weight: value } : w))
    );
  };

  const resetWeights = () => setWeights(DEFAULT_STAT_WEIGHTS);

  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">NCAA Basketball Analytics &amp; Custom Rankings</h1>
          <p className="mt-1 text-muted-foreground">
            Build custom NCAA power rankings with advanced metrics, model weights, and tournament-focused team analysis.
          </p>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Joe Knows Ball combines NCAA analytics, team breakdowns, and March Madness analysis into one rankings tool
            so you can compare the full Division I landscape or isolate the tournament field.
          </p>
          <div className="flex items-center gap-4 flex-wrap mt-3 text-sm">
            <Link to="/schedule" className="text-primary hover:underline">
              NCAA Schedule
            </Link>
            <Link to="/matchup" className="text-primary hover:underline">
              Matchup Analyzer
            </Link>
            <Link to="/bracket" className="text-primary hover:underline">
              Bracket Predictor
            </Link>
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card/90 p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">Advanced NCAA Team Metrics</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Re-rank teams using offense rating, defense rating, strength of schedule, pace, shooting, and rebounding
              signals that matter in NCAA basketball analytics.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card/90 p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">Custom NCAA Power Rankings</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Switch between all teams and the tournament field, adjust custom metrics, and create your own NCAA model
              rankings without changing the existing workflow.
            </p>
          </div>
        </section>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setMode("all")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            All Teams
          </button>
          <button
            onClick={() => setMode("field")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === "field"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            NCAA Tournament Field
          </button>
          <span className="text-xs text-muted-foreground">
            {rankingTeams.length} teams
          </span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setShowSliders(!showSliders)}
            className="text-sm font-medium text-primary hover:underline"
          >
            {showSliders ? "Hide" : "Show"} Weight Controls
          </button>
          <button
            onClick={resetWeights}
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Reset Defaults
          </button>
          <button
            onClick={() => setWeights(ELITE_8_PRESET_WEIGHTS)}
            className="text-sm font-semibold px-3 py-1 rounded-md bg-accent text-accent-foreground hover:bg-accent/80 transition-colors"
          >
            🏆 2024 Elite 8 Preset
          </button>
        </div>

        {showSliders && (
          <StatSliders weights={weights} onWeightChange={handleWeightChange} />
        )}

        <RankingsTable teams={rankingTeams} weights={weights} />

        <SeoFooterBlock />
      </div>
    </div>
  );
}
