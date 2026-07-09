import { useEffect, useState } from "react";

export type NumerologyXPlaySummary = {
  player: string;
  team: string;
  opponent: string;
  matchup: string;
  numerologyScore: number | null;
  modelRating: number | null;
  matchType: string;
  chips: string[];
};

export type NumerologyXOtherPlay = {
  player: string;
  team: string;
  matchup: string;
  numerologyScore: number | null;
  matchType: string;
  reason: string | null;
};

export type NumerologyXPreview = {
  date: string;
  generatedAt: string;
  scoreThreshold: number | null;
  livePageUrl: string;
  dayNumbers: {
    universalDayLabel: string | null;
    universalDayCompound: number | null;
    universalDayRoot: number | null;
    primaryFamily: number[];
    secondaryFamily: number[];
    balancingComplement: number | null;
    countercurrent: number | null;
  };
  topPlay: NumerologyXPlaySummary | null;
  secondPlay: NumerologyXPlaySummary | null;
  thirdPlay: NumerologyXPlaySummary | null;
  othersOver50: NumerologyXOtherPlay[];
  othersOver50TotalCount: number;
  othersOver50TruncatedCount: number;
  totalQualifiedCount: number;
};

type State = {
  loading: boolean;
  fileUnavailable: boolean;
  preview: NumerologyXPreview | null;
};

export function useMlbNumerologyXPreview() {
  const [state, setState] = useState<State>({ loading: true, fileUnavailable: false, preview: null });

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch("/data/mlb/numerology/x-post-preview.json", { cache: "no-store" });
        if (!active) return;
        if (!response.ok) {
          setState({ loading: false, fileUnavailable: true, preview: null });
          return;
        }
        const payload = (await response.json()) as NumerologyXPreview;
        if (!active) return;
        setState({ loading: false, fileUnavailable: false, preview: payload });
      } catch {
        if (!active) return;
        setState({ loading: false, fileUnavailable: true, preview: null });
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  return state;
}
