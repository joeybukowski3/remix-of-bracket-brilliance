import { useEffect, useState } from "react";
import { TDS_ALLOWED_ARTIFACT_PATH, type TdsAllowedArtifact } from "@/lib/nfl/tdsAllowed/types";

type State = {
  loading: boolean;
  error: string | null;
  artifact: TdsAllowedArtifact | null;
};

/** Loads the generated Touchdowns Allowed by Position artifact. */
export function useNflTdsAllowedByPosition(): State {
  const [state, setState] = useState<State>({ loading: true, error: null, artifact: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, artifact: null });

    fetch(TDS_ALLOWED_ARTIFACT_PATH, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Touchdowns allowed data unavailable (${response.status}).`);
        const json = (await response.json()) as TdsAllowedArtifact;
        if (!json || typeof json !== "object" || !Array.isArray(json.rows)) {
          throw new Error("Touchdowns allowed artifact is malformed.");
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
