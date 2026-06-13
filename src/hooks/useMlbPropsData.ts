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

// Operational date in ET — same logic the live matchup cards use.
function getOperationalDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Fetch the live MLB schedule for today — the SAME source the matchup
// cards use, so prop tables can be validated against the real slate.
async function fetchLiveGameKeys(date: string): Promise<Set<string>> {
  try {
    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=team`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return new Set();
    const json = await res.json();
    const games = json?.dates?.[0]?.games ?? [];
    const keys = new Set<string>();
    for (const g of games) {
      const away = g?.teams?.away?.team?.abbreviation;
      const home = g?.teams?.home?.team?.abbreviation;
      if (away && home) keys.add(`${away}@${home}`);
    }
    return keys;
  } catch {
    return new Set();
  }
}

export function useMlbPropsData() {
  const [dashboard, setDashboard] = useState<HrDashboardPayload | null>(null);
  const [bestBets, setBestBets] = useState<HrBestBetsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveGameKeys, setLiveGameKeys] = useState<Set<string>>(new Set());
  const [propDate, setPropDate] = useState<string | null>(null);
  const lastGeneratedAt = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    async function fetchData() {
      try {
        const today = getOperationalDate();

        const [rawResponse, bestResponse, liveKeys] = await Promise.all([
          fetch(`/data/mlb/hr-props-raw.json`, { cache: "no-store" }),
          fetch(`/data/mlb/hr-props-best-bets.json`, { cache: "no-store" }),
          fetchLiveGameKeys(today),
        ]);
        if (!active) return;

        const rawPayload = rawResponse.ok ? await rawResponse.json() : null;
        const bestPayload = bestResponse.ok ? await bestResponse.json() : null;
        if (!active) return;

        // Always update the live keys + prop date so staleness can be detected
        setLiveGameKeys(liveKeys);
        setPropDate(rawPayload?.date ?? null);

        // Only update prop state if data actually changed (avoids re-renders)
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
    const today = getOperationalDate();
    // Stale = the prop file is for a different date than today (ET).
    const stale = propDate != null && propDate !== today;

    const allGames = dashboard?.games ?? [];
    const allPitchers = dashboard?.pitchers ?? [];
    const allBatters = dashboard?.batters ?? [];
    const tbdGameKeys = buildTbdGameKeySet(allPitchers, allBatters);

    // Cross-validate against the live schedule: a prop game only counts if
    // it's on today's actual MLB slate. This guarantees the prop tables can
    // NEVER show a game the matchup cards don't, even if the file is stale.
    // When liveGameKeys is empty (API hiccup) we fall back to showing all,
    // so a transient fetch failure doesn't blank the tables.
    const hasLive = liveGameKeys.size > 0;
    const onSlate = (gameKey: string) => !hasLive || liveGameKeys.has(gameKey);

    // If the file is stale AND we have a live schedule, suppress everything —
    // better to show "updating" than yesterday's games.
    const suppress = stale && hasLive;

    const games = suppress ? [] : allGames.filter((game) => !tbdGameKeys.has(game.gameKey) && onSlate(game.gameKey));
    const pitchers = suppress ? [] : allPitchers.filter((pitcher) => !tbdGameKeys.has(pitcher.gameKey) && onSlate(pitcher.gameKey) && !isStarterPlaceholder(pitcher.pitcher));
    const batters = suppress ? [] : allBatters.filter((batter) => !tbdGameKeys.has(batter.gameKey) && onSlate(batter.gameKey) && !isStarterPlaceholder(batter.opposingPitcher));
    const batterVsPitcherRows = buildPitcherVsBatterRows(batters, games, pitchers);
    const strikeoutDetailRows = buildPitcherStrikeoutRows(batters, games, pitchers);
    const strikeoutRows = buildPitcherStrikeoutMatchupRows(pitchers, batters, games);

    return {
      dashboard,
      bestBets,
      loading,
      stale,
      propDate,
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
  }, [bestBets, dashboard, loading, liveGameKeys, propDate]);
}

