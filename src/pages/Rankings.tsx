import { useState } from "react";
import SiteNav from "@/components/SiteNav";
import StatSliders from "@/components/StatSliders";
import RankingsTable from "@/components/RankingsTable";
import { teams, DEFAULT_STAT_WEIGHTS, ELITE_8_PRESET_WEIGHTS, type StatWeight } from "@/data/ncaaTeams";

export default function Rankings() {
  const [weights, setWeights] = useState<StatWeight[]>(DEFAULT_STAT_WEIGHTS);
  const [showSliders, setShowSliders] = useState(true);

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

        <RankingsTable teams={teams} weights={weights} />
      </div>
    </div>
  );
}
