import { useEffect, useState } from "react";
import {
  COACHING_RATINGS_ARTIFACT_PATH,
  isCoachingRatingsArtifact,
  type CoachingRatingsArtifact,
} from "@/lib/nfl/coachingRatingsView";

type State = {
  loading: boolean;
  error: string | null;
  artifact: CoachingRatingsArtifact | null;
};

/**
 * Loads the published current-season coaching-ratings artifact.
 *
 * Optional enrichment, fetched independently of every other matchup artifact:
 * if it is missing or malformed the coaching section renders its
 * "Coaching context unavailable" state and nothing else on the page changes.
 */
export function useNflCoachingRatings(): State {
  const [state, setState] = useState<State>({ loading: true, error: null, artifact: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, artifact: null });

    fetch(COACHING_RATINGS_ARTIFACT_PATH, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Coaching ratings unavailable (${response.status}).`);
        const json: unknown = await response.json();
        if (!isCoachingRatingsArtifact(json)) throw new Error("Coaching ratings artifact is malformed.");
        if (!cancelled) setState({ loading: false, error: null, artifact: json });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Coaching ratings failed to load.";
        if (!cancelled) setState({ loading: false, error: message, artifact: null });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
