import { useEffect, useState } from "react";
import type { PitcherRegressionData } from "@/lib/mlb/mlbPitcherRegression";
import { buildRegressionData } from "@/lib/mlb/mlbPitcherRegression";

type RegressionJson = {
  generatedAt: string;
  date: string;
  pitchers: Array<{
    pitcherId: number | null;
    name: string;
    team: string;
    era: number | null;
    xfip: number | null;
    xera: number | null;
    kbb: number | null;
    strandRate: number | null;
    hrfb: number | null;
    babip: number | null;
    regressionScore: number;
    regressionTier: PitcherRegressionData["regressionTier"];
    summary: string;
  }>;
};

export function usePitcherRegression() {
  const [data, setData] = useState<PitcherRegressionData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/data/mlb/pitcher-regression.json")
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((json: RegressionJson) => {
        const pitchers: PitcherRegressionData[] = json.pitchers.map(p => ({
          pitcherId: p.pitcherId,
          name: p.name,
          team: p.team,
          era: p.era,
          xfip: p.xfip ?? null,
          siera: null,
          kbb: p.kbb,
          strandRate: p.strandRate,
          hrfb: p.hrfb,
          babip: p.babip,
          regressionScore: p.regressionScore,
          regressionTier: p.regressionTier,
          summary: p.summary,
        }));
        setData(pitchers);
      })
      .catch(() => {
        // Fall back to empty — static data file no longer needed
        setData([]);
      })
      .finally(() => setLoading(false));
  }, []);

  return { data, loading };
}
