import { useEffect, useRef, useState } from "react";
// @ts-expect-error -- plain JS module, no type declarations
import { buildStrikeoutPropDetailKey } from "../../scripts/lib/mlb-strikeout-prop-details-core.mjs";

export type StrikeoutPropStartRow = {
  date: string | null;
  opponent: string | null;
  inningsPitched: number | string | null;
  strikeouts: number | null;
};

export type StrikeoutPropOpponentGameRow = {
  date: string | null;
  opponent: string | null;
  opposingStartingPitcher: string | null;
  opposingStarterInningsPitched: number | string | null;
  opposingStarterStrikeouts: number | null;
  teamTotalStrikeouts: number | null;
};

export type StrikeoutPropDetail = {
  key: string;
  pitcher: string;
  team: string;
  opponent: string;
  gameDate: string | null;
  pitcherLastFiveStarts: StrikeoutPropStartRow[];
  opponentLastFiveGames: StrikeoutPropOpponentGameRow[];
  generatedAt: string;
  source: string;
};

type DetailsPayload = {
  generatedAt?: string;
  source?: string;
  date?: string;
  details?: StrikeoutPropDetail[];
};

type State = {
  loading: boolean;
  /** true only when the file itself could not be loaded at all (missing/malformed) */
  fileUnavailable: boolean;
  detailsByKey: Map<string, StrikeoutPropDetail>;
};

const POLL_INTERVAL_MS = 10 * 60 * 1000;

/** Builds the same key used by the generator, from a strikeout-prop table row. */
export function keyForStrikeoutPropRow(row: { pitcher: string; team: string; opponent: string }, gameDate: string | null) {
  return buildStrikeoutPropDetailKey({ pitcher: row.pitcher, team: row.team, opponent: row.opponent, gameDate });
}

export function useMlbStrikeoutPropDetails() {
  const [state, setState] = useState<State>({ loading: true, fileUnavailable: false, detailsByKey: new Map() });
  const lastGeneratedAt = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch("/data/mlb/strikeout-prop-details.json", { cache: "no-store" });
        if (!active) return;
        if (!response.ok) {
          setState({ loading: false, fileUnavailable: true, detailsByKey: new Map() });
          return;
        }
        const payload = (await response.json()) as DetailsPayload;
        if (!active) return;
        const generatedAt = payload?.generatedAt ?? null;
        if (generatedAt && generatedAt === lastGeneratedAt.current) return;
        lastGeneratedAt.current = generatedAt;
        const details = Array.isArray(payload?.details) ? payload.details : [];
        setState({
          loading: false,
          fileUnavailable: false,
          detailsByKey: new Map(details.map((detail) => [detail.key, detail])),
        });
      } catch {
        if (!active) return;
        setState({ loading: false, fileUnavailable: true, detailsByKey: new Map() });
      }
    }

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return state;
}
