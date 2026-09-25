import { matchupRankDifference } from "@/lib/nfl/matchupEdges";
import {
  createCurrentFirstTrenchResolver,
  trenchSampleLabel,
  type TrenchMetricsArtifact,
  type TrenchPeriodKey,
} from "@/lib/nfl/trenchMetricsData";

export type DstTrenchComponent = {
  value: number | null;
  source: string;
  asOf: string | null;
  detail: string;
  maxAgeHours: number | null;
};

/**
 * DST trenches component: opponent PBWR rank minus the DST's PRWR rank, negated.
 * Uses the shared current-first policy, so each side takes its 2026 ESPN value
 * when present and falls back to 2025 independently. Prior-season-only inputs
 * have no freshness bound; any 2026 input is held to `maxCurrentAgeHours`.
 */
export function buildDstTrenchComponent(
  trench: TrenchMetricsArtifact,
  opponent: string,
  team: string,
  maxCurrentAgeHours: number,
  source = "public/data/nfl/matchup-trench-metrics.json"
): DstTrenchComponent {
  const resolve = createCurrentFirstTrenchResolver(trench);
  const passBlock = resolve(opponent, "off.passBlockWinRate", "2026-season");
  const passRush = resolve(team, "def.passRushWinRate", "2026-season");
  const edge = matchupRankDifference(passBlock?.espnRank, passRush?.espnRank);
  const periods = [passBlock?.period, passRush?.period].filter((p): p is TrenchPeriodKey => p != null);
  const newest: TrenchPeriodKey | null = periods.includes("2026-season") ? "2026-season" : (periods[0] ?? null);
  const label = trenchSampleLabel(trench, [
    { name: "Opponent PBWR", period: passBlock?.period ?? null },
    { name: "DST PRWR", period: passRush?.period ?? null },
  ], "2025-season");
  return {
    value: edge == null ? null : -edge,
    source,
    asOf: newest ? (trench.seasons[newest.slice(0, 4)]?.sourceLastModified ?? null) : null,
    detail: `${label}; opponent PBWR rank ${passBlock?.espnRank ?? "unknown"} minus DST PRWR rank ${passRush?.espnRank ?? "unknown"}`,
    maxAgeHours: newest === "2026-season" ? maxCurrentAgeHours : null,
  };
}
