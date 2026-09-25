/**
 * Weekly Matchups matrix — whole-league board builder.
 *
 * Ratings mode needs a league mean/SD per metric, and ranks need to be
 * computed (or read) across all 32 teams, so the board is built once per
 * page render for the whole league — not per matchup card — and each row
 * component just looks up its two teams' cells from it.
 *
 * Metric -> source mapping (see MatchupMatrixControls for the user-facing
 * explanation of what's window-sensitive):
 *   OVR          currentRating2026 board (blended value already there;
 *                2026-only reads the board's own raw performanceRating; Last 8
 *                has no canonical rolling-8 OVR and reuses the 2026-only value)
 *   Off/Def EPA  matchup-epa.json (nflverse), Blended/2026-Only/Last-8 all real
 *   Off/Def YPP  matchup-metrics.json (TeamRankings), same three windows
 *   Off/Def SR   matchup-success-rates.json (RBSDM) — season-to-date only,
 *                ignores the Data Window toggle entirely
 *   Pass/Run     matchup-trench-metrics.json (ESPN) — season-to-date only,
 *   trenches     ignores the Data Window toggle entirely; Rankings mode uses
 *                ESPN's own published rank verbatim, never a recomputed one
 */

import type { CurrentRatingBoard } from "@/lib/nfl/currentRating2026";
import { rankByDescending } from "@/lib/nfl/publicPowerRatings";
import {
  blendMatrixMetricValue,
  sampleSettingsForMatrixWindow,
  type NflMatrixDataWindowMode,
} from "@/lib/nfl/matchupMatrixWindow";
import { epaWindowId, formatEpa, type EpaArtifact } from "@/lib/nfl/epaData";
import { artifactWindowId, formatMetricValue, type MatchupMetricsArtifact } from "@/lib/nfl/matchupMetricsData";
import {
  formatSuccessRate,
  type SuccessMetricValue,
  type SuccessPeriodKey,
  type SuccessRatesArtifact,
} from "@/lib/nfl/successRateData";
import { TRENCH_CURRENT_SEASON, TRENCH_PRIOR_SEASON, type TrenchMetricsArtifact } from "@/lib/nfl/trenchMetricsData";

const PRIOR_SEASON_FULL_WINDOW_ID = "prior-season-full";

export type NflMatrixMetricDirection = "higher-is-better" | "lower-is-better";

export type NflMatrixMetricId =
  | "ovr"
  | "offEpa"
  | "offYpp"
  | "offSr"
  | "passBlock"
  | "runBlock"
  | "defEpa"
  | "defYpp"
  | "defSr"
  | "passRush"
  | "runStop";

export type NflMatrixCell = {
  value: number | null;
  formattedValue: string;
  /** Canonical/published rank (1-32) where one exists; a newly computed rank for the Blended composite otherwise. */
  rank: number | null;
  /** False for Success Rate and the four trench metrics — those never move with the Data Window toggle. */
  windowSensitive: boolean;
};

const UNAVAILABLE_CELL: NflMatrixCell = {
  value: null,
  formattedValue: "N/A",
  rank: null,
  windowSensitive: true,
};

export type NflMatrixBoard = {
  getCell(abbr: string, metricId: NflMatrixMetricId): NflMatrixCell;
  /** True once at least OVR data resolved for at least one team — lets the page show a real empty state. */
  hasData: boolean;
};

type EpaLikeArtifact = EpaArtifact | null;
type ConventionalLikeArtifact = MatchupMetricsArtifact | null;

function readEpaTuple(artifact: EpaLikeArtifact, windowId: string, abbr: string, metricKey: string): readonly [number | null, number | null] | null {
  return artifact?.windows?.[windowId]?.teams?.[abbr]?.metrics?.[metricKey] ?? null;
}

function readConventionalTuple(artifact: ConventionalLikeArtifact, windowId: string, abbr: string, metricKey: string): readonly [number, number | null] | null {
  return artifact?.windows?.[windowId]?.teams?.[abbr]?.metrics?.[metricKey] ?? null;
}

/**
 * Picks the most-current published Success Rate period for one team,
 * independent of any opponent. Probes the artifact directly rather than
 * inferring from completed-game count alone: the RBSDM pipeline can lag a
 * team's first current-season completed game by a cycle, and guessing
 * "2026-season" before that period is actually populated would render every
 * SR cell N/A instead of falling back to the still-current 2025 Last 8 figure.
 */
function successPeriodFor(artifact: SuccessRatesArtifact | null, abbr: string): SuccessPeriodKey {
  if (artifact?.periods?.["2026-season"]?.[abbr]) return "2026-season";
  return "2025-last8";
}

/**
 * Picks the most-current published trench period for one team, independent
 * of any opponent. The artifact keys its `seasons` map by bare season number
 * ("2025" / "2026"), not by TrenchPeriodKey's own "2025-season" spelling —
 * see PERIOD_SEASON in trenchMetricsData.ts, which this mirrors.
 */
function trenchSeasonKeyFor(artifact: TrenchMetricsArtifact | null, abbr: string): string {
  if (artifact?.seasons?.[String(TRENCH_CURRENT_SEASON)]?.teams?.[abbr]) return String(TRENCH_CURRENT_SEASON);
  return String(TRENCH_PRIOR_SEASON);
}

function rankMapDirectionAware(
  valuesByAbbr: ReadonlyMap<string, number | null>,
  direction: NflMatrixMetricDirection
): Map<string, number | null> {
  const rows = [...valuesByAbbr.entries()]
    .filter((entry): entry is [string, number] => entry[1] != null && Number.isFinite(entry[1]))
    .map(([abbr, value]) => ({
      key: abbr,
      value: direction === "lower-is-better" ? -value : value,
      name: abbr,
      teamId: abbr,
    }));
  const ranks = rankByDescending(rows);
  const out = new Map<string, number | null>();
  for (const abbr of valuesByAbbr.keys()) out.set(abbr, ranks.get(abbr) ?? null);
  return out;
}

export type BuildMatchupMatrixBoardInput = {
  teamAbbrs: readonly string[];
  mode: NflMatrixDataWindowMode;
  currentRating: CurrentRatingBoard | null;
  epaArtifact: EpaLikeArtifact;
  conventionalArtifact: ConventionalLikeArtifact;
  successArtifact: SuccessRatesArtifact | null;
  trenchArtifact: TrenchMetricsArtifact | null;
};

const EPA_YPP_METRIC_KEYS: Record<"offEpa" | "offYpp" | "defEpa" | "defYpp", { key: string; direction: NflMatrixMetricDirection; kind: "epa" | "conventional" }> = {
  offEpa: { key: "off.epaPerPlay", direction: "higher-is-better", kind: "epa" },
  defEpa: { key: "def.epaPerPlayAllowed", direction: "lower-is-better", kind: "epa" },
  offYpp: { key: "off.yardsPerPlay", direction: "higher-is-better", kind: "conventional" },
  defYpp: { key: "def.yardsPerPlayAllowed", direction: "lower-is-better", kind: "conventional" },
};

const SUCCESS_METRIC_KEYS: Record<"offSr" | "defSr", { key: string; direction: NflMatrixMetricDirection }> = {
  offSr: { key: "off.successRate", direction: "higher-is-better" },
  defSr: { key: "def.successRateAllowed", direction: "lower-is-better" },
};

const TRENCH_METRIC_KEYS: Record<"passBlock" | "runBlock" | "passRush" | "runStop", string> = {
  passBlock: "off.passBlockWinRate",
  runBlock: "off.runBlockWinRate",
  passRush: "def.passRushWinRate",
  runStop: "def.runStopWinRate",
};

/** Builds the whole-league board once; row components then do pure lookups. */
export function buildMatchupMatrixBoard(input: BuildMatchupMatrixBoardInput): NflMatrixBoard {
  const { teamAbbrs, mode, currentRating, epaArtifact, conventionalArtifact, successArtifact, trenchArtifact } = input;

  const ratingRowByAbbr = new Map((currentRating?.teams ?? []).map((row) => [row.abbr, row]));
  const gamesPlayedByAbbr = new Map<string, number>();
  for (const abbr of teamAbbrs) gamesPlayedByAbbr.set(abbr, ratingRowByAbbr.get(abbr)?.gamesPlayed ?? 0);

  const cache = new Map<string, NflMatrixCell>();

  // ---- OVR ----------------------------------------------------------------
  function buildOvrCells(): Map<string, NflMatrixCell> {
    const values = new Map<string, number | null>();
    for (const abbr of teamAbbrs) {
      const row = ratingRowByAbbr.get(abbr);
      if (!row) {
        values.set(abbr, null);
        continue;
      }
      // Blended: the board's own blended rating. 2026-Only and Last 8 both read
      // the raw, unblended performanceRating — Last 8 has no canonical rolling-8
      // OVR composite, so it deliberately falls back to the same 2026-to-date
      // value rather than inventing one (surfaced in the UI, not just here).
      values.set(abbr, mode === "blended" ? row.rating : row.performanceRating);
    }

    const out = new Map<string, NflMatrixCell>();
    for (const abbr of teamAbbrs) {
      const row = ratingRowByAbbr.get(abbr);
      const value = values.get(abbr) ?? null;
      const rank = mode === "blended" ? (row?.rank ?? null) : (row?.performanceRank ?? null);
      out.set(abbr, {
        value,
        formattedValue: value == null ? "N/A" : value.toFixed(1),
        rank,
        windowSensitive: mode !== "last8",
      });
    }
    return out;
  }

  // ---- EPA / YPP ------------------------------------------------------------
  function buildEpaYppCells(metricId: "offEpa" | "offYpp" | "defEpa" | "defYpp"): Map<string, NflMatrixCell> {
    const config = EPA_YPP_METRIC_KEYS[metricId];
    const currentWindowId = config.kind === "epa" ? epaWindowId(sampleSettingsForMatrixWindow("2026-only")) : artifactWindowId(sampleSettingsForMatrixWindow("2026-only"));
    const last8WindowId = config.kind === "epa" ? epaWindowId(sampleSettingsForMatrixWindow("last8")) : artifactWindowId(sampleSettingsForMatrixWindow("last8"));

    const readTuple = (windowId: string, abbr: string) =>
      config.kind === "epa"
        ? readEpaTuple(epaArtifact, windowId, abbr, config.key)
        : readConventionalTuple(conventionalArtifact, windowId, abbr, config.key);

    const values = new Map<string, number | null>();
    const publishedRanks = new Map<string, number | null>();

    for (const abbr of teamAbbrs) {
      if (mode === "last8") {
        const tuple = readTuple(last8WindowId, abbr);
        values.set(abbr, tuple?.[0] ?? null);
        publishedRanks.set(abbr, tuple?.[1] ?? null);
        continue;
      }
      const currentTuple = readTuple(currentWindowId, abbr);
      if (mode === "2026-only") {
        values.set(abbr, currentTuple?.[0] ?? null);
        publishedRanks.set(abbr, currentTuple?.[1] ?? null);
        continue;
      }
      // Blended: no canonical artifact window for this composite, so both the
      // value and its rank are computed here.
      const priorTuple = readTuple(PRIOR_SEASON_FULL_WINDOW_ID, abbr);
      const blended = blendMatrixMetricValue(priorTuple?.[0] ?? null, currentTuple?.[0] ?? null, gamesPlayedByAbbr.get(abbr) ?? 0);
      values.set(abbr, blended);
    }

    const ranks = mode === "blended" ? rankMapDirectionAware(values, config.direction) : publishedRanks;
    const format = config.kind === "epa" ? formatEpa : (value: number) => formatMetricValue(config.key, value);

    const out = new Map<string, NflMatrixCell>();
    for (const abbr of teamAbbrs) {
      const value = values.get(abbr) ?? null;
      out.set(abbr, {
        value,
        formattedValue: value == null ? "N/A" : format(value),
        rank: ranks.get(abbr) ?? null,
        windowSensitive: true,
      });
    }
    return out;
  }

  // ---- Success Rate (season-to-date only) ------------------------------------
  function buildSuccessCells(metricId: "offSr" | "defSr"): Map<string, NflMatrixCell> {
    const config = SUCCESS_METRIC_KEYS[metricId];
    const entries = new Map<string, SuccessMetricValue | null>();

    for (const abbr of teamAbbrs) {
      const period = successPeriodFor(successArtifact, abbr);
      const entry = successArtifact?.periods?.[period]?.[abbr]?.metrics?.[config.key] ?? null;
      entries.set(abbr, entry);
    }

    const out = new Map<string, NflMatrixCell>();
    for (const abbr of teamAbbrs) {
      const entry = entries.get(abbr) ?? null;
      out.set(abbr, {
        value: entry?.pct ?? null,
        formattedValue: formatSuccessRate(entry),
        rank: entry?.rank ?? null,
        windowSensitive: false,
      });
    }
    return out;
  }

  // ---- ESPN trenches (season-to-date only) ----------------------------------
  function buildTrenchCells(metricId: keyof typeof TRENCH_METRIC_KEYS): Map<string, NflMatrixCell> {
    const metricKey = TRENCH_METRIC_KEYS[metricId];
    const entries = new Map<string, { valuePct: number; espnRank: number } | null>();

    for (const abbr of teamAbbrs) {
      const seasonKey = trenchSeasonKeyFor(trenchArtifact, abbr);
      const season = trenchArtifact?.seasons?.[seasonKey];
      const entry = season?.teams?.[abbr]?.metrics?.[metricKey] ?? null;
      entries.set(abbr, entry);
    }

    const out = new Map<string, NflMatrixCell>();
    for (const abbr of teamAbbrs) {
      const entry = entries.get(abbr) ?? null;
      out.set(abbr, {
        value: entry?.valuePct ?? null,
        formattedValue: entry ? `${entry.valuePct}%` : "N/A",
        rank: entry?.espnRank ?? null,
        windowSensitive: false,
      });
    }
    return out;
  }

  const buildersByMetric: Record<NflMatrixMetricId, () => Map<string, NflMatrixCell>> = {
    ovr: buildOvrCells,
    offEpa: () => buildEpaYppCells("offEpa"),
    offYpp: () => buildEpaYppCells("offYpp"),
    offSr: () => buildSuccessCells("offSr"),
    passBlock: () => buildTrenchCells("passBlock"),
    runBlock: () => buildTrenchCells("runBlock"),
    defEpa: () => buildEpaYppCells("defEpa"),
    defYpp: () => buildEpaYppCells("defYpp"),
    defSr: () => buildSuccessCells("defSr"),
    passRush: () => buildTrenchCells("passRush"),
    runStop: () => buildTrenchCells("runStop"),
  };

  const boardByMetric = new Map<NflMatrixMetricId, Map<string, NflMatrixCell>>();
  function metricBoard(metricId: NflMatrixMetricId): Map<string, NflMatrixCell> {
    let board = boardByMetric.get(metricId);
    if (!board) {
      board = buildersByMetric[metricId]();
      boardByMetric.set(metricId, board);
    }
    return board;
  }

  return {
    hasData: ratingRowByAbbr.size > 0,
    getCell(abbr: string, metricId: NflMatrixMetricId): NflMatrixCell {
      const cacheKey = `${abbr}:${metricId}`;
      const cached = cache.get(cacheKey);
      if (cached) return cached;
      const cell = metricBoard(metricId).get(abbr) ?? UNAVAILABLE_CELL;
      cache.set(cacheKey, cell);
      return cell;
    },
  };
}
