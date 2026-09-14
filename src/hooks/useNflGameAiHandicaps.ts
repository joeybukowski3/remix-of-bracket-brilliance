import { useEffect, useState } from "react";
import { nflAiHandicapArtifactPath, type NflAiHandicapPresentation } from "@/lib/nfl/aiHandicapPresentation";

type State = {
  loading: boolean;
  error: string | null;
  presentation: NflAiHandicapPresentation | null;
};

/**
 * Loads the per-game sanitized AI-handicap presentation artifact
 * (public/data/nfl/<season>/ai-handicaps/<gameId>.json), produced by
 * scripts/generate-nfl-ai-handicap-presentation.ts.
 *
 * Independent optional enrichment, like every other matchup-page artifact:
 * a game that has not had this artifact generated yet (404) is not an
 * error -- the AI Picks tab renders both handicappers as unavailable and
 * every other tab keeps working.
 */
export function useNflGameAiHandicaps(season: number, gameId: string | null): State {
  const [state, setState] = useState<State>({ loading: true, error: null, presentation: null });

  useEffect(() => {
    if (!gameId) {
      setState({ loading: false, error: null, presentation: null });
      return;
    }
    let cancelled = false;
    setState({ loading: true, error: null, presentation: null });

    fetch(nflAiHandicapArtifactPath(season, gameId), { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 404) {
          if (!cancelled) setState({ loading: false, error: null, presentation: null });
          return;
        }
        if (!response.ok) throw new Error(`AI handicap data unavailable (${response.status}).`);
        const json = (await response.json()) as NflAiHandicapPresentation;
        if (!json || typeof json !== "object" || !json.handicappers) {
          throw new Error("AI handicap artifact is malformed.");
        }
        if (!cancelled) setState({ loading: false, error: null, presentation: json });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "AI handicap data failed to load.";
        if (!cancelled) setState({ loading: false, error: message, presentation: null });
      });

    return () => {
      cancelled = true;
    };
  }, [season, gameId]);

  return state;
}
