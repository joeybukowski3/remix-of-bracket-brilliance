import { useCallback, useEffect, useRef, useState } from "react";
import type { WeeklyFantasyProjectionProductionRow } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import { generateLineups } from "@/lib/nfl/dfs/optimizer/generateLineups";
import type { GeneratedLineupSet } from "@/lib/nfl/dfs/optimizer/contracts";
import type { DfsEnrichedAnalyzerRow } from "@/lib/nfl/dfs/slateAnalyzer";

export type NflDfsOptimizerState = {
  status: "idle" | "generating" | "done";
  result: GeneratedLineupSet | null;
  generate: () => void;
};

/**
 * Runs the WU8 lineup optimizer entirely in the browser, on explicit user
 * request. Nothing is uploaded anywhere.
 *
 * Generation is fully synchronous and measured in the low hundreds of
 * milliseconds on a full ~800-row NFL Classic slate, so it does not need a Web
 * Worker. Any previously generated set is discarded as soon as the slate or
 * the as-of timestamp changes, so a new CSV upload can never show stale
 * lineups.
 */
export function useNflDfsOptimizer(input: {
  rows: readonly DfsEnrichedAnalyzerRow[] | null;
  projectionRows: readonly WeeklyFantasyProjectionProductionRow[];
  asOf: string;
}): NflDfsOptimizerState {
  const { rows, projectionRows, asOf } = input;
  const [state, setState] = useState<{ status: "idle" | "generating" | "done"; result: GeneratedLineupSet | null }>({
    status: "idle",
    result: null,
  });

  // A generation request that is still pending when the slate changes is dropped.
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    setState({ status: "idle", result: null });
  }, [rows, asOf]);

  const generate = useCallback(() => {
    if (!rows) return;
    const token = generation.current;
    setState({ status: "generating", result: null });
    // Yield one frame so the pending state paints before the solver blocks.
    window.setTimeout(() => {
      if (token !== generation.current) return;
      const result = generateLineups({ rows, projectionRows, asOf });
      if (token !== generation.current) return;
      setState({ status: "done", result });
    }, 0);
  }, [rows, projectionRows, asOf]);

  return { ...state, generate };
}
