import { useEffect, useState } from "react";
import {
  BETTING_LINES_CURRENT_PATH,
  bettingLinesHistoryPath,
  buildCurrentMarketView,
  buildLineMovementView,
  parseBettingLinesCurrentArtifact,
  parseBettingLinesHistoryArtifact,
  type CurrentMarketView,
  type LineMovementView,
} from "@/lib/nfl/bettingLinesView";

export interface NflBettingLinesState {
  loading: boolean;
  error: string | null;
  /** Current sportsbook-specific line + freshness, or null if unavailable. */
  current: CurrentMarketView | null;
  /** Spread/total movement for the selected sportsbook, or null if no history. */
  movement: LineMovementView | null;
}

const IDLE: NflBettingLinesState = {
  loading: false,
  error: null,
  current: null,
  movement: null,
};

/**
 * Loads the browser-safe The Odds API betting-lines view for one matchup.
 *
 * The canonical JKB game id (e.g. `2026_01_NE_SEA`) is the only join key. The
 * current artifact is required; the per-game history file is optional and
 * degrades to `movement: null` when missing or malformed.
 *
 * This is a distinct dataset from `useNflMatchupMarket` (nflverse ATS/market
 * profile) and never replaces it.
 */
export function useNflBettingLines(
  jkbGameId: string | null | undefined,
): NflBettingLinesState {
  const [state, setState] = useState<NflBettingLinesState>({
    ...IDLE,
    loading: Boolean(jkbGameId),
  });

  useEffect(() => {
    if (!jkbGameId) {
      setState(IDLE);
      return;
    }

    let cancelled = false;
    setState({ ...IDLE, loading: true });

    async function load(id: string): Promise<{
      current: CurrentMarketView | null;
      movement: LineMovementView | null;
    }> {
      const currentResponse = await fetch(BETTING_LINES_CURRENT_PATH, {
        cache: "no-store",
      });
      if (!currentResponse.ok) {
        throw new Error(`Betting lines unavailable (${currentResponse.status}).`);
      }
      const currentArtifact = parseBettingLinesCurrentArtifact(
        await currentResponse.json(),
      );
      if (!currentArtifact) {
        throw new Error("Betting lines artifact is malformed.");
      }

      const current = buildCurrentMarketView({
        artifact: currentArtifact,
        jkbGameId: id,
      });

      let movement: LineMovementView | null = null;
      if (current) {
        try {
          const historyResponse = await fetch(bettingLinesHistoryPath(id), {
            cache: "no-store",
          });
          if (historyResponse.ok) {
            const historyArtifact = parseBettingLinesHistoryArtifact(
              await historyResponse.json(),
            );
            if (historyArtifact) {
              movement = buildLineMovementView({
                history: historyArtifact,
                sportsbookId: current.sportsbook.id,
              });
            }
          }
        } catch {
          movement = null;
        }
      }

      return { current, movement };
    }

    load(jkbGameId)
      .then((result) => {
        if (!cancelled) setState({ loading: false, error: null, ...result });
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setState({ loading: false, error: error.message, current: null, movement: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [jkbGameId]);

  return state;
}
