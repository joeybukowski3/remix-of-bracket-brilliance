import { useEffect, useMemo, useState } from "react";
import {
  buildPitcherStrikeoutMatchupRows,
  buildPitcherStrikeoutRows,
  buildPitcherVsBatterRows,
  buildTbdGameKeySet,
  buildTbdFootnotes,
  normalizeHrBestBetsPayload,
  normalizeHrDashboardPayload,
  type HrBestBetsPayload,
  type HrDashboardPayload,
} from "@/pages/MlbHrProps";

function isStarterPlaceholder(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return !normalized || normalized === "TBD" || normalized === "TBA" || normalized === "TO BE ANNOUNCED" || normalized === "TO BE DETERMINED";
}

export function useMlbPropsData() {
  const [dashboard, setDashboard] = useState<HrDashboardPayload | null>(null);
  const [bestBets, setBestBets] = useState<HrBestBetsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      fetch("/data/mlb/hr-props-raw.json", { cache: "no-store" }),
      fetch("/data/mlb/hr-props-best-bets.json", { cache: "no-store" }),
    ])
      .then(async ([rawResponse, bestResponse]) => {
        if (!active) return;
        const rawPayload = rawResponse.ok ? await rawResponse.json() : null;
        const bestPayload = bestResponse.ok ? await bestResponse.json() : null;
        if (!active) return;
        setDashboard(normalizeHrDashboardPayload(rawPayload));
        setBestBets(normalizeHrBestBetsPayload(bestPayload));
      })
      .catch(() => {
        if (!active) return;
        setDashboard(null);
        setBestBets(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return useMemo(() => {
    const allGames = dashboard?.games ?? [];
    const allPitchers = dashboard?.pitchers ?? [];
    const allBatters = dashboard?.batters ?? [];
    const tbdGameKeys = buildTbdGameKeySet(allPitchers, allBatters);
    const games = allGames.filter((game) => !tbdGameKeys.has(game.gameKey));
    const pitchers = allPitchers.filter((pitcher) => !tbdGameKeys.has(pitcher.gameKey) && !isStarterPlaceholder(pitcher.pitcher));
    const batters = allBatters.filter((batter) => !tbdGameKeys.has(batter.gameKey) && !isStarterPlaceholder(batter.opposingPitcher));
    const batterVsPitcherRows = buildPitcherVsBatterRows(batters, games, pitchers);
    const strikeoutDetailRows = buildPitcherStrikeoutRows(batters, games, pitchers);
    const strikeoutRows = buildPitcherStrikeoutMatchupRows(pitchers, batters, games);

    return {
      dashboard,
      bestBets,
      loading,
      games,
      pitchers,
      batters,
      batterVsPitcherRows,
      strikeoutDetailRows,
      strikeoutRows,
      tbdFootnotes: buildTbdFootnotes(tbdGameKeys, allGames, allPitchers, allBatters),
    };
  }, [bestBets, dashboard, loading]);
}
