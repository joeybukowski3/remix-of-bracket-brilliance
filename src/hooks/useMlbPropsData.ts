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
import { deriveMlbDataStatus, type MlbDataStatus } from "@/lib/mlb/mlbDataStatus";

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

// User-safe, stable error strings -- no stack traces, raw URLs, or
// exception internals ever reach the hook's return value. The original
// exception is logged via console.error only, matching how the rest of
// this hook already handles shadow/range-artifact failures (console.warn).
const DASHBOARD_LOAD_ERROR_MESSAGE = "Unable to load MLB model data.";
const DASHBOARD_REFRESH_ERROR_MESSAGE = "Unable to refresh MLB model data.";
const BEST_BETS_PARTIAL_ERROR_MESSAGE = "MLB model data loaded, but best bets could not be refreshed.";

type FetchOutcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

/**
 * Fetches and normalizes the HR dashboard payload as one unit, catching
 * both the network/HTTP failure case and any JSON-parse failure in a
 * single result type. A non-OK HTTP response is treated as a fetch
 * failure, never silently normalized as an empty/null success.
 */
async function fetchDashboardOutcome(): Promise<FetchOutcome<HrDashboardPayload | null>> {
  try {
    const response = await fetch("/data/mlb/hr-props-raw.json", { cache: "no-store" });
    if (!response.ok) return { ok: false, error: new Error(`HTTP ${response.status}`) };
    const rawPayload = await response.json();
    return { ok: true, value: normalizeHrDashboardPayload(rawPayload) };
  } catch (error: unknown) {
    return { ok: false, error };
  }
}

/** Same shape as fetchDashboardOutcome, for the independent best-bets file. */
async function fetchBestBetsOutcome(): Promise<FetchOutcome<HrBestBetsPayload | null>> {
  try {
    const response = await fetch("/data/mlb/hr-props-best-bets.json", { cache: "no-store" });
    if (!response.ok) return { ok: false, error: new Error(`HTTP ${response.status}`) };
    const rawPayload = await response.json();
    return { ok: true, value: normalizeHrBestBetsPayload(rawPayload) };
  } catch (error: unknown) {
    return { ok: false, error };
  }
}

export function useMlbPropsData() {
  const [dashboard, setDashboard] = useState<HrDashboardPayload | null>(null);
  const [bestBets, setBestBets] = useState<HrBestBetsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasCompletedInitialFetch, setHasCompletedInitialFetch] = useState(false);
  const lastGeneratedAt = useRef<string | null>(null);
  const rangeArtifactRef = useRef<ReferenceRangeArtifact | null>(null);
  // Monotonic: true once any successful dashboard has ever been set. Used
  // only to pick the initial-load vs. refresh error wording -- dashboard
  // state itself is never cleared on a later failure, so this never needs
  // to flip back to false during the hook's lifetime.
  const hasEverHadDashboardRef = useRef(false);

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
      // Each resource resolves independently -- a single Promise.all
      // rejection must never discard a valid dashboard just because the
      // secondary best-bets file (or the range artifact) failed.
      const [dashboardOutcome, bestBetsOutcome, rangeArtifact] = await Promise.all([
        fetchDashboardOutcome(),
        fetchBestBetsOutcome(),
        fetchRangeArtifact(),
      ]);
      if (!active) return;

      if (!dashboardOutcome.ok) {
        // The dashboard is the primary shared payload: if it fails, the
        // whole round is an error and best-bets is left untouched this
        // round (neither applied nor blamed) -- previously retained
        // dashboard/bestBets state is preserved exactly as-is.
        console.error("[mlb-props-data] dashboard fetch failed:", dashboardOutcome.error);
        setError(hasEverHadDashboardRef.current ? DASHBOARD_REFRESH_ERROR_MESSAGE : DASHBOARD_LOAD_ERROR_MESSAGE);
        setHasCompletedInitialFetch(true);
        setLoading(false);
        return;
      }

      const normalizedDashboard = dashboardOutcome.value;
      const newGeneratedAt = normalizedDashboard?.generatedAt ?? null;
      // Skip re-render when generatedAt hasn't changed, but this must
      // never suppress the error-clearing / best-bets-update logic below
      // -- only the dashboard state write itself is skipped.
      const isDuplicateGeneratedAt = Boolean(newGeneratedAt) && newGeneratedAt === lastGeneratedAt.current;

      if (!isDuplicateGeneratedAt) {
        lastGeneratedAt.current = newGeneratedAt;
        const enriched = withShadowScores(normalizedDashboard, rangeArtifact);
        setDashboard(enriched);
        if (enriched != null) hasEverHadDashboardRef.current = true;
      }

      if (bestBetsOutcome.ok) {
        setBestBets(bestBetsOutcome.value);
        // Fully successful round (dashboard ok, whether or not it changed,
        // plus best bets ok): clear any previously surfaced error,
        // including after a same-generatedAt recovery poll.
        setError(null);
      } else {
        console.error("[mlb-props-data] best-bets fetch failed:", bestBetsOutcome.error);
        setError(BEST_BETS_PARTIAL_ERROR_MESSAGE);
        // Do not clear bestBets -- preserve the previous value if any.
      }

      setHasCompletedInitialFetch(true);
      setLoading(false);
    }

    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => { active = false; clearInterval(interval); };
  }, []);

  // Pure derivation, recomputed only when hook state actually changes --
  // not on a wall-clock timer. `new Date()` is read once per memo
  // evaluation (mount, and whenever dashboard/loading/error/
  // hasCompletedInitialFetch change), so `status` stays stable between
  // renders rather than drifting continuously as real time passes.
  const status: MlbDataStatus = useMemo(
    () => deriveMlbDataStatus(dashboard, { loading, error, hasCompletedInitialFetch }, new Date()),
    [dashboard, loading, error, hasCompletedInitialFetch],
  );

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
      error,
      status,
      hasCompletedInitialFetch,
      stale: status.kind === "stale",
      propDate: dashboard?.date ?? null,
      games,
      pitchers,
      batters,
      batterVsPitcherRows,
      strikeoutDetailRows,
      strikeoutRows,
      tbdFootnotes: buildTbdFootnotes(tbdGameKeys, allGames, allPitchers, allBatters),
      pendingGames: dashboard?.pendingGames ?? [],
      nextRunAt: dashboard?.nextRunAt ?? null,
    };
  }, [bestBets, dashboard, error, hasCompletedInitialFetch, loading, status]);
}
