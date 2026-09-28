import { useEffect, useState } from "react";
import {
  YARDS_VS_AVERAGE_ARTIFACT_PATH,
  YARDS_VS_AVERAGE_METRIC_KEYS,
  YARDS_VS_AVERAGE_SAMPLE_KEYS,
  YARDS_VS_AVERAGE_SCHEMA_VERSION,
  type YardsVsAverageArtifact,
} from "@/lib/nfl/yardsVsAverage/types";

type State = {
  loading: boolean;
  error: string | null;
  artifact: YardsVsAverageArtifact | null;
};

function isWellFormed(json: unknown): json is YardsVsAverageArtifact {
  const artifact = json as YardsVsAverageArtifact | null;
  return Boolean(artifact) && typeof artifact === "object" && artifact!.schemaVersion === YARDS_VS_AVERAGE_SCHEMA_VERSION
    && Array.isArray(artifact!.rows) && Array.isArray(artifact!.games)
    && artifact!.rows.every((row) => YARDS_VS_AVERAGE_SAMPLE_KEYS.every((sample) =>
      YARDS_VS_AVERAGE_METRIC_KEYS.every((metric) => row.samples?.[sample]?.[metric] != null)));
}

/** Loads the generated Yards vs Avg by Position artifact. */
export function useNflYardsVsAverage(): State {
  const [state, setState] = useState<State>({ loading: true, error: null, artifact: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, artifact: null });

    fetch(YARDS_VS_AVERAGE_ARTIFACT_PATH, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Yards vs average data unavailable (${response.status}).`);
        const json: unknown = await response.json();
        if (!isWellFormed(json)) throw new Error("Yards vs average artifact is malformed.");
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
