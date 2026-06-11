import { useEffect, useMemo, useRef, useState } from "react";
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

// Re-fetch prop data every 10 minutes so the page auto-updates when
// the workflow deploys new data without requiring a manual refresh.
const POLL_INTERVAL_MS = 10 * 60 * 1000;

export function useMlbPropsData() {
  const [dashboard, setDashboard] = useState<HrDashboardPayload | null>(null);
  const [bestBets, setBestBets] = useState<HrBestBetsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const lastGeneratedAt = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    async function fetchData() {
      try {
        const [rawResponse, bestResponse] = await Promise.all([
          fetch(`/data/mlb/hr-props-raw.json`, { cache: "no-store" }),
          fetch(`/data/mlb/hr-props-best-bets.json`, { cache: "no-store" }),
        ]);
        if (!active) return;

        const rawPayload = rawResponse.ok ? await rawResponse.json() : null;
        const bestPayload = bestResponse.ok ? await bestResponse.json() : null;
        if (!active) return;

        // Only update state if data actually changed (avoids unnecessary re-renders)
        const newGeneratedAt = rawPayload?.generatedAt ?? null;
        if (newGeneratedAt && newGeneratedAt === lastGeneratedAt.current) return;
        lastGeneratedAt.current = newGeneratedAt;

        setDashboard(normalizeHrDashboardPayload(rawPayload));
        setBestBets(normalizeHrBestBetsPayload(bestPayload));
      } catch {
        if (!active) return;
        setDashboard(null);
        setBestBets(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    // Initial fetch
    fetchData();

    // Poll every 10 minutes — detects when workflow deploys new data
    const interval = setInterval(fetchData, POLL_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(interval);
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
      pendingGames: (dashboard as any)?.pendingGames ?? [],
      nextRunAt: (dashboard as any)?.nextRunAt ?? null,
    };
  }, [bestBets, dashboard, loading]);
}

