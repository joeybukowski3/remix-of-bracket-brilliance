import { useCallback, useEffect, useRef, useState } from "react";
import type { WeeklyFantasyProjectionProductionRow } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import { generateLineups } from "@/lib/nfl/dfs/optimizer/generateLineups";
import type { GeneratedLineupSet } from "@/lib/nfl/dfs/optimizer/contracts";
import type { DfsEnrichedAnalyzerRow } from "@/lib/nfl/dfs/slateAnalyzer";

export type NflDfsOptimizerState = {
  status: "idle" | "generating" | "done";
  result: GeneratedLineupSet | null;
  snapshot?: { rows: readonly DfsEnrichedAnalyzerRow[]; projectionRows: readonly WeeklyFantasyProjectionProductionRow[] };
  generate: () => void;
};

/**
 * Runs the WU8 lineup optimizer entirely in the browser, on explicit user
 * request. Nothing is uploaded anywhere.
 *
 * Generation is fully synchronous and measured in the low hundreds of
 * milliseconds on a full ~800-row NFL Classic slate, so it does not need a Web
 * Worker. Results are snapshots: background research and clock refreshes do
 * not discard them. Only a material uploaded-slate or selected-week change
 * invalidates a generation.
 */
export function useNflDfsOptimizer(input: {
  rows: readonly DfsEnrichedAnalyzerRow[] | null;
  projectionRows: readonly WeeklyFantasyProjectionProductionRow[];
  asOf: string;
  slateKey?: string;
}): NflDfsOptimizerState {
  const { rows, projectionRows, asOf } = input;
  // Compare uploaded fields, never derived projections, eligibility or freshness.
  const slateKey = JSON.stringify([input.slateKey, rows?.map(row => [row.dkId, row.playerName, row.position,
    row.rosterPosition, row.salary, row.team, row.gameInfoRaw, row.dkStatus, row.dkAvgPointsPerGame])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]))) ?? null]);
  const [state, setState] = useState<Omit<NflDfsOptimizerState, "generate"> & { key?: string }>({
    status: "idle",
    result: null,
  });

  // A generation request that is still pending when the slate changes is dropped.
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    setState({ status: "idle", result: null });
    return () => { generation.current += 1; };
  }, [slateKey]);

  const generate = useCallback(() => {
    if (!rows) return;
    const token = ++generation.current;
    setState({ key: slateKey, status: "generating", result: null });
    // Yield one frame so the pending state paints before the solver blocks.
    window.setTimeout(() => {
      if (token !== generation.current) return;
      const result = generateLineups({ rows, projectionRows, asOf });
      if (token !== generation.current) return;
      setState({ key: slateKey, status: "done", result, snapshot: { rows, projectionRows } });
    }, 0);
  }, [rows, projectionRows, asOf, slateKey]);

  return { ...(state.key === slateKey ? state : { status: "idle" as const, result: null }), generate };
}
