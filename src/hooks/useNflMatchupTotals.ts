import { useEffect, useState } from "react";
import { TEAM_TOTALS_ARTIFACT_PATH, type TeamTotalsArtifact } from "@/lib/nfl/totalsProjectionData";

type State = {
  loading: boolean;
  error: string | null;
  artifact: TeamTotalsArtifact | null;
};

/**
 * Loads the generated JKB team-total projections artifact
 * (jkb-nfl-total-ridge-v1.0.0).
 *
 * Optional enrichment loaded independently of every other NFL artifact: if
 * this file is missing, not yet generated for a future week, or malformed,
 * the projected-score surface reports itself unavailable and every other
 * section of the matchup page keeps working. No modelling runs in the
 * browser.
 */
export function useNflMatchupTotals(): State {
  const [state, setState] = useState<State>({ loading: true, error: null, artifact: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, artifact: null });

    fetch(TEAM_TOTALS_ARTIFACT_PATH, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Team total data unavailable (${response.status}).`);
        const json = (await response.json()) as TeamTotalsArtifact;
        if (!json || typeof json !== "object" || !json.projections) {
          throw new Error("Team total artifact is malformed.");
        }
        if (!cancelled) setState({ loading: false, error: null, artifact: json });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ loading: false, error: err.message, artifact: null });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
