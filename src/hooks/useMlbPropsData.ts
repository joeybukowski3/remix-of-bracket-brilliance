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
import { HR_BRIDGE_RANGE_ARTIFACT_VERSION } from "@/lib/mlb/analytics/hrBridgeModel";
import {
  parseReferenceRangeArtifact,
  referenceRangeArtifactPath,
} from "@/lib/mlb/analytics/referenceRanges";
import { enrichHrPayloadWithShadow } from "@/lib/mlb/analytics/shadow";
import type { ReferenceRangeArtifact } from "@/lib/mlb/analytics/types";

/**
 * Shadow-only enrichment (Phase 1): attach bridge Absolute Score fields to
 * batter rows. A shadow failure must never block the production dashboard —
 * the payload is returned unenriched instead.
 */
function withShadowScores(
  payload: HrDashboardPayload | null,
  rangeArtifact: ReferenceRangeArtifact | null,
): HrDashboardPayload | null {
  if (!payload || !rangeArtifact) return payload;
  try {
    return enrichHrPayloadWithShadow(payload, rangeArtifact);
  } catch (error: unknown) {
    console.warn("[mlb-hr-shadow] bridge shadow scoring skipped:", error);
    return payload;
  }
}

function isStarterPlaceholder(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return !normalized || normalized === "TBD" || normalized === "TBA" || normalized === "TO BE ANNOUNCED" || normalized === "TO BE DETERMINED";
}

// Poll every 10 minutes so the page auto-updates when the workflow deploys new data.
const POLL_INTERVAL_MS = 10 * 60 * 1000;

export function useMlbPropsData() {
  const [dashboard, setDashboard] = useState<HrDashboardPayload | null>(null);
  const [bestBets, setBestBets] = useState<HrBestBetsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const lastGeneratedAt = useRef<string | null>(null);
  const rangeArtifactRef = useRef<ReferenceRangeArtifact | null>(null);

  useEffect(() => {
    let active = true;

    async function fetchRangeArtifact(): Promise<ReferenceRangeArtifact | null> {
      if (rangeArtifactRef.current) return rangeArtifactRef.current;
      try {
        const response = await fetch(referenceRangeArtifactPath(HR_BRIDGE_RANGE_ARTIFACT_VERSION));
        if (!response.ok) return null;
        rangeArtifactRef.current = parseReferenceRangeArtifact(await response.json());
        return rangeArtifactRef.current;
      } catch (error: unknown) {
        console.warn("[mlb-hr-shadow] reference-range artifact unavailable:", error);
        return null;
      }
    }

    async function fetchData() {
      try {
        const [rawResponse, bestResponse, rangeArtifact] = await Promise.all([
          fetch(`/data/mlb/hr-props-raw.json`, { cache: "no-store" }),
          fetch(`/data/mlb/hr-props-best-bets.json`, { cache: "no-store" }),
          fetchRangeArtifact(),
        ]);
        if (!active) return;

        const rawPayload = rawResponse.ok ? await rawResponse.json() : null;
        const bestPayload = bestResponse.ok ? await bestResponse.json() : null;
        if (!active) return;

        // Skip re-render if data hasn't changed
        const newGeneratedAt = rawPayload?.generatedAt ?? null;
        if (newGeneratedAt && newGeneratedAt === lastGeneratedAt.current) return;
        lastGeneratedAt.current = newGeneratedAt;

        setDashboard(withShadowScores(normalizeHrDashboardPayload(rawPayload), rangeArtifact));
        setBestBets(normalizeHrBestBetsPayload(bestPayload));
      } catch {
        if (!active) return;
        setDashboard(null);
        setBestBets(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => { active = false; clearInterval(interval); };
  }, []);

  return useMemo(() => {
    const allGames = dashboard?.games ?? [];
    const allPitchers = dashboard?.pitchers ?? [];
    const allBatters = dashboard?.batters ?? [];
    const tbdGameKeys = buildTbdGameKeySet(allPitchers, allBatters);
    const games = allGames.filter((game) => !tbdGameKeys.has(game.gameKey));
    const pitchers = allPitchers.filter((p) => !tbdGameKeys.has(p.gameKey) && !isStarterPlaceholder(p.pitcher));
    const batters = allBatters.filter((b) => !tbdGameKeys.has(b.gameKey) && !isStarterPlaceholder(b.opposingPitcher));
    const batterVsPitcherRows = buildPitcherVsBatterRows(batters, games, pitchers);
    const strikeoutDetailRows = buildPitcherStrikeoutRows(batters, games, pitchers);
    const strikeoutRows = buildPitcherStrikeoutMatchupRows(pitchers, batters, games);

    return {
      dashboard,
      bestBets,
      loading,
      stale: false,
      propDate: dashboard ? (dashboard as any)?.date ?? null : null,
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
