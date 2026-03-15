import { useState } from "react";
import { Link } from "react-router-dom";
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
    title: "NCAA Basketball Rankings",
    description: "Explore NCAA basketball team rankings, compare the full field or tournament teams, and customize power ratings with advanced stat weights.",
    path: "/",
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
          <h1 className="text-3xl font-bold text-foreground">NCAA Team Rankings</h1>
          <p className="text-muted-foreground mt-1">
            Adjust stat weights to create your own custom power rankings
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
      </div>
    </div>
  );
}
