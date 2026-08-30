import { useMemo } from "react";
import { useNflCurrentRating2026 } from "@/hooks/useNflCurrentRating2026";
import { useNflSeasonData } from "@/hooks/useNflSeasonData";
import { useNflV03PublicPowerRatings } from "@/hooks/useNflV03PublicPowerRatings";
import { useNflMatchupEpa } from "@/hooks/useNflMatchupEpa";
import { useNflMatchupMetrics } from "@/hooks/useNflMatchupMetrics";
import { useNflSuccessRates } from "@/hooks/useNflSuccessRates";
import {
  buildLast8FormRatings,
  buildOverallRatings,
  buildSosBoard,
  type Last8FormMethod,
  type OverallRating,
} from "@/lib/nfl/powerRatingsEfficiency";
import {
  efficiencyWindowId,
  successPeriodKey,
  type PowerRatingsPeriod,
} from "@/lib/nfl/powerRatingsPeriod";
import { recordOverGameIds, formatWinLossTie } from "@/lib/nfl/standings";
import type { NflResultRecord, WinLossTie } from "@/lib/nfl/standings";

const SEASON_2025 = 2025 as const;
const SEASON_2026 = 2026 as const;

export type PowerMetricCell = { value: number | null; rank: number | null };
export type PowerSosCell = { value: number | null; rank: number | null };

export type PowerRatingsRow = {
  abbr: string;
  name: string;
  slug: string | null;
  color: string;
  /** Far-left row rank: JKB OVR rank for 2025/2026, Last-8 Form OVR rank for Last 8. */
  rank: number | null;
  off: PowerMetricCell;
  def: PowerMetricCell;
  ovr: PowerMetricCell;
  ypp: PowerMetricCell;
  epa: PowerMetricCell;
  success: PowerMetricCell;
  sos: PowerSosCell;
  /** Formatted W-L-T for display. */
  record: string | null;
  /** Underlying W-L-T for the selected period, for sorting. Null = no games. */
  recordStats: WinLossTie | null;
};

export type PowerRatingsBoard = {
  period: PowerRatingsPeriod;
  rows: PowerRatingsRow[];
  provenance: { ovr: string; efficiency: string; success: string; sos: string; record: string };
  notes: string[];
  /** Far-left column heading + supporting title/aria text for the current period. */
  rankColumn: { label: string; title: string };
  /** Last-8 Form Rating mode, or null for the 2025 / 2026 periods. */
  formMethod: Last8FormMethod | null;
};

type State = { loading: boolean; error: string | null; board: PowerRatingsBoard | null };

const EMPTY_CELL: PowerMetricCell = { value: null, rank: null };

/** `[value, rank]` tuple → cell, guarding non-finite values. */
function tupleCell(tuple: [number | null, number | null] | undefined): PowerMetricCell {
  if (!tuple) return EMPTY_CELL;
  const [value, rank] = tuple;
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY_CELL;
  return { value, rank: rank ?? null };
}

function overallCell(rating: OverallRating | null | undefined): PowerMetricCell {
  if (!rating) return EMPTY_CELL;
  return { value: rating.value, rank: rating.rank };
}

/** Parse "12-5" or "12-5-1" into a W-L-T; null for anything else. */
function parseWinLossTie(text: string | null): WinLossTie | null {
  if (!text) return null;
  const parts = text.split("-").map((p) => Number.parseInt(p, 10));
  if (parts.length < 2 || parts.length > 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return { wins: parts[0], losses: parts[1], ties: parts[2] ?? 0 };
}

/** gameId → { home, away } across every loaded season's results. */
function buildGameIndex(...resultSets: (readonly NflResultRecord[] | undefined)[]) {
  const index = new Map<string, { home: string; away: string }>();
  for (const set of resultSets) {
    for (const r of set ?? []) {
      index.set(r.gameId, { home: r.homeAbbr, away: r.awayAbbr });
    }
  }
  return index;
}

function opponentOf(
  index: Map<string, { home: string; away: string }>,
  gameId: string,
  teamAbbr: string
): string | null {
  const game = index.get(gameId);
  if (!game) return null;
  if (game.home === teamAbbr) return game.away;
  if (game.away === teamAbbr) return game.home;
  return null;
}

/**
 * The one board hook for /nfl/power-ratings. Loads every artifact the three
 * periods need, then assembles the selected period's rows through the shared
 * period resolver and efficiency domain. All period-specific selection lives
 * here or in powerRatingsPeriod.ts — the page never touches an artifact.
 */
export function useNflPowerRatingsBoard(period: PowerRatingsPeriod): State {
  const registry = useNflSeasonData(SEASON_2026);
  const data2025 = useNflSeasonData(SEASON_2025);
  const current = useNflCurrentRating2026();
  const board2025 = useNflV03PublicPowerRatings(SEASON_2025);
  const epa = useNflMatchupEpa();
  const metrics = useNflMatchupMetrics();
  const success = useNflSuccessRates();

  return useMemo<State>(() => {
    if (registry.loading) return { loading: true, error: null, board: null };
    if (registry.error) return { loading: false, error: registry.error, board: null };
    const teams = registry.data?.teams ?? [];
    if (teams.length === 0) {
      return { loading: false, error: "NFL team registry unavailable.", board: null };
    }

    // Period spine still loading / errored? OVR/OFF/DEF is page-defining for
    // the 2025 and 2026 tabs, so a hard failure there blocks the board rather
    // than rendering a table of dashes.
    const spineLoading =
      (period === "2025" && board2025.loading) ||
      (period === "2026" && current.loading) ||
      (period === "last8" && epa.loading) ||
      data2025.loading;
    if (spineLoading) return { loading: true, error: null, board: null };
    if (period === "2025" && board2025.error) {
      return { loading: false, error: board2025.error, board: null };
    }
    if (period === "2026" && current.error) {
      return { loading: false, error: current.error, board: null };
    }

    const results2025 = data2025.data?.results ?? [];
    const results2026 = registry.data?.results ?? [];
    const gameIndex = buildGameIndex(results2025, results2026);
    const completed2026Games = results2026.filter(
      (r) => r.final && r.seasonType === "REG"
    ).length;

    // --- efficiency windows ----------------------------------------------
    const windowId = efficiencyWindowId(period);
    const epaWindow = epa.artifact?.windows?.[windowId]?.teams ?? {};
    const metricsWindow = metrics.artifact?.windows?.[windowId]?.teams ?? {};
    const successKey = successPeriodKey(period, completed2026Games);
    const successPeriod = successKey ? success.artifact?.periods?.[successKey] ?? null : null;

    // EPA Overall (also the SoS opponent yardstick).
    const epaOff = new Map<string, number | null>();
    const epaDef = new Map<string, number | null>();
    for (const [abbr, team] of Object.entries(epaWindow)) {
      epaOff.set(abbr, team.metrics?.["off.epaPerPlay"]?.[0] ?? null);
      epaDef.set(abbr, team.metrics?.["def.epaPerPlayAllowed"]?.[0] ?? null);
    }
    const epaOverall = buildOverallRatings(epaOff, epaDef, { defenseLowerIsBetter: true });

    // YPP Overall.
    const yppOff = new Map<string, number | null>();
    const yppDef = new Map<string, number | null>();
    for (const [abbr, team] of Object.entries(metricsWindow)) {
      yppOff.set(abbr, team.metrics?.["off.yardsPerPlay"]?.[0] ?? null);
      yppDef.set(abbr, team.metrics?.["def.yardsPerPlayAllowed"]?.[0] ?? null);
    }
    const yppOverall = buildOverallRatings(yppOff, yppDef, { defenseLowerIsBetter: true });

    // Success Overall.
    const successOff = new Map<string, number | null>();
    const successDef = new Map<string, number | null>();
    for (const [abbr, team] of Object.entries(successPeriod ?? {})) {
      successOff.set(abbr, team.metrics?.["off.successRate"]?.raw ?? null);
      successDef.set(abbr, team.metrics?.["def.successRateAllowed"]?.raw ?? null);
    }
    const successOverall = buildOverallRatings(successOff, successDef, {
      defenseLowerIsBetter: true,
    });

    // --- Strength of Schedule ------------------------------------------
    const epaOverallRankByAbbr = new Map<string, number>();
    for (const [abbr, rating] of epaOverall) {
      if (rating) epaOverallRankByAbbr.set(abbr, rating.rank);
    }
    const opponentsByAbbr = new Map<string, string[]>();
    for (const [abbr, team] of Object.entries(epaWindow)) {
      const opponents: string[] = [];
      for (const gameId of team.gameIds ?? []) {
        const opponent = opponentOf(gameIndex, gameId, abbr);
        if (opponent) opponents.push(opponent);
      }
      opponentsByAbbr.set(abbr, opponents);
    }
    const sosBoard = buildSosBoard(epaOverallRankByAbbr, opponentsByAbbr);

    // --- OVR / OFF / DEF ----------------------------------------------
    const ovrByAbbr = new Map<string, { ovr: PowerMetricCell; off: PowerMetricCell; def: PowerMetricCell; rank: number | null }>();
    if (period === "2025") {
      for (const team of board2025.data?.teams ?? []) {
        ovrByAbbr.set(team.abbr, {
          ovr: { value: team.publicRating, rank: team.rank },
          off: { value: team.offenseRating, rank: team.offRank },
          def: { value: team.defenseRating, rank: team.defRank },
          rank: team.rank,
        });
      }
    } else if (period === "2026") {
      for (const team of current.data?.teams ?? []) {
        ovrByAbbr.set(team.abbr, {
          ovr: { value: team.rating, rank: team.rank },
          off: { value: team.offenseRating, rank: team.offenseRank },
          def: { value: team.defenseRating, rank: team.defenseRank },
          rank: team.rank,
        });
      }
    }

    // Last 8: OFF/DEF/OVR come from the Last-8 Form Rating — a recent two-way
    // efficiency composite, NOT the JKB power formula (which has no rolling
    // cross-season definition). See powerRatingsEfficiency.buildLast8FormRatings.
    let formMethod: Last8FormMethod | null = null;
    if (period === "last8") {
      const successAvailable = successPeriod != null;
      const form = buildLast8FormRatings(
        {
          offEpaPerPlay: epaOff,
          defEpaPerPlayAllowed: epaDef,
          offYardsPerPlay: yppOff,
          defYardsPerPlayAllowed: yppDef,
          offSuccessRate: successOff,
          defSuccessRateAllowed: successDef,
        },
        { successAvailable }
      );
      formMethod = successAvailable ? "epa-ypp-success" : "epa-ypp";
      for (const [abbr, rating] of form) {
        ovrByAbbr.set(abbr, {
          off: rating.off ? { value: rating.off.rating, rank: rating.off.rank } : EMPTY_CELL,
          def: rating.def ? { value: rating.def.rating, rank: rating.def.rank } : EMPTY_CELL,
          ovr: rating.ovr ? { value: rating.ovr.rating, rank: rating.ovr.rank } : EMPTY_CELL,
          rank: rating.ovr?.rank ?? null,
        });
      }
    }

    // --- rows --------------------------------------------------------
    const rows: PowerRatingsRow[] = teams.map((team) => {
      const abbr = team.abbr;
      const ovrEntry = ovrByAbbr.get(abbr);
      const epaCell = overallCell(epaOverall.get(abbr));
      const sos = sosBoard.get(abbr) ?? null;

      const gameIds = epaWindow[abbr]?.gameIds ?? [];
      let record: string | null;
      let recordStats: WinLossTie | null;
      if (period === "2026" && completed2026Games === 0) {
        record = "0-0";
        recordStats = { wins: 0, losses: 0, ties: 0 };
      } else if (gameIds.length > 0) {
        recordStats = recordOverGameIds([...results2025, ...results2026], abbr, gameIds);
        record = formatWinLossTie(recordStats);
      } else {
        const sourceRecord =
          period === "2025"
            ? board2025.data?.teams.find((t) => t.abbr === abbr)?.sourceRecord ?? null
            : null;
        record = sourceRecord;
        recordStats = parseWinLossTie(sourceRecord);
      }

      // 2025 / 2026: JKB OVR rank. Last 8: Last-8 Form OVR rank.
      const rowRank = ovrEntry?.rank ?? null;

      return {
        abbr,
        name: team.name,
        slug: team.slug ?? null,
        color: team.primaryColor,
        rank: rowRank,
        off: ovrEntry?.off ?? EMPTY_CELL,
        def: ovrEntry?.def ?? EMPTY_CELL,
        ovr: ovrEntry?.ovr ?? EMPTY_CELL,
        ypp: overallCell(yppOverall.get(abbr)),
        epa: epaCell,
        success: overallCell(successOverall.get(abbr)),
        sos: sos ? { value: sos.avgOpponentRank, rank: sos.rank } : EMPTY_CELL,
        record,
        recordStats,
      };
    });

    rows.sort((a, b) => {
      if (a.rank === null && b.rank === null) return a.name.localeCompare(b.name);
      if (a.rank === null) return 1;
      if (b.rank === null) return -1;
      return a.rank - b.rank || a.name.localeCompare(b.name);
    });

    const notes: string[] = [];
    if (period === "last8") {
      notes.push(
        formMethod === "epa-ypp-success"
          ? "Last 8 Form combines recent EPA, yards/play and success-rate performance across each team's most recent 8 completed regular-season games."
          : "Last 8 Form combines recent EPA and yards/play across each team's most recent 8 completed regular-season games. Success Rate cannot span the current cross-season Last-8 sample, so Form Rating uses EPA + YPP."
      );
    }
    if (period === "2026" && completed2026Games === 0) {
      notes.push("No completed 2026 regular-season games yet — period efficiency, SoS and record wait for real results and are never filled from 2025.");
    }
    if (successKey && !successPeriod) {
      notes.push(`Success Rate for this period requires re-running the RBSDM generator (period "${successKey}" not present in the current artifact).`);
    }

    const efficiencyProvenance =
      period === "2025"
        ? "nflverse play-by-play (EPA) and stats_team weekly release (YPP), full 2025 regular season"
        : period === "2026"
          ? "nflverse, completed 2026 regular-season games only"
          : "nflverse, rolling 8 completed games per team (crosses the 2025/2026 boundary)";

    const board: PowerRatingsBoard = {
      period,
      rows,
      provenance: {
        ovr:
          period === "2025"
            ? "2025 v0.3.1 EPA-composite power board (existing methodology, unchanged)"
            : period === "2026"
              ? current.data?.state === "live"
                ? "Current 2026 JKB board — blended preseason projection + 2026 performance"
                : "Current 2026 JKB board — preseason projection (no 2026 games played yet)"
              : formMethod === "epa-ypp-success"
                ? "Last 8 Form Rating — recent two-way efficiency composite (EPA .40 / YPP .30 / Success .30 per side, OVR = 50% OFF + 50% DEF). Not the JKB power formula."
                : "Last 8 Form Rating — recent two-way efficiency composite (EPA .60 / YPP .40 per side; Success unavailable for the cross-season window). Not the JKB power formula.",
        efficiency: efficiencyProvenance,
        success: successPeriod
          ? "RBSDM / Ben Baldwin, published rates consumed verbatim"
          : "Unavailable for this period",
        sos: "Mean of period opponents' EPA Overall rank (this feature's own rank, same period); lower = harder. Display only.",
        record:
          period === "2025"
            ? "2025 regular-season W-L-T"
            : period === "2026"
              ? "Completed 2026 regular-season games"
              : "Exactly the resolved last-8 games",
      },
      notes,
      rankColumn:
        period === "last8"
          ? { label: "Form Rank", title: "Last 8 Form Rating rank" }
          : { label: "Rank", title: "JKB Power Rank" },
      formMethod,
    };

    return { loading: false, error: null, board };
  }, [
    period,
    registry.loading,
    registry.error,
    registry.data,
    data2025.loading,
    data2025.data,
    current.loading,
    current.error,
    current.data,
    board2025.loading,
    board2025.error,
    board2025.data,
    epa.loading,
    epa.artifact,
    metrics.artifact,
    success.artifact,
  ]);
}
