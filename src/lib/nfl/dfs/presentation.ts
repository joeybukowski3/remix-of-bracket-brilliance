// WU4 DFS presentation helpers -- pure functions only, no React.
//
// Rank Diff thresholds below are V1 PROVISIONAL presentation thresholds,
// chosen conservatively from the existing site heat-tone language
// (gold/dark-green/green/light-green/neutral/light-red/red/strong-red, see
// src/lib/fantasy/weekly/researchPresentation.ts). They are NOT model
// thresholds and are not derived from any real slate distribution -- WU5
// should calibrate them once real uploaded-slate data exists. Centralized
// here specifically so no threshold value is hardcoded inside JSX.

import { normalizeNflTeamAbbr } from "@/lib/nfl/identity/identity";
import type { DfsHistoryIndex } from "./historyDelivery";
import { defenseSummary } from "./historyDelivery";
import type { FantasyMatchupEdges } from "@/lib/nfl/matchupEdges";
import type { WeeklyHeatTone } from "@/lib/fantasy/weekly/researchPresentation";
import type { DfsEnrichedAnalyzerRow } from "@/lib/nfl/dfs/slateAnalyzer";
import { isDfsCandidatePoolPlayer } from "@/lib/nfl/dfs/dfsPlayerPool";

/** V1 provisional Rank Diff heat bands. Recalibrate in WU5 against real slate distributions. */
const RANK_DIFF_BANDS: ReadonlyArray<{ min: number; tone: WeeklyHeatTone }> = [
  { min: 15, tone: "gold" },
  { min: 8, tone: "dark-green" },
  { min: 4, tone: "green" },
  { min: 1, tone: "light-green" },
  { min: 0, tone: "neutral" },
  { min: -3, tone: "light-red" },
  { min: -7, tone: "red" },
  { min: -Infinity, tone: "strong-red" },
];

export function getDfsRankDiffTone(diff: number | null | undefined): WeeklyHeatTone {
  if (diff == null || !Number.isFinite(diff)) return "missing";
  return RANK_DIFF_BANDS.find((band) => diff >= band.min)?.tone ?? "missing";
}

export function formatDfsRankDiff(diff: number | null | undefined): string {
  if (diff == null || !Number.isFinite(diff)) return "—";
  if (diff === 0) return "E";
  return diff > 0 ? `+${diff}` : `${diff}`;
}

export function formatDfsSalary(salary: number | null | undefined): string {
  if (salary == null || !Number.isFinite(salary)) return "—";
  return `$${salary.toLocaleString("en-US")}`;
}

export function formatDfsProjection(points: number | null | undefined): string {
  if (points == null || !Number.isFinite(points)) return "—";
  return points.toFixed(1);
}

export function formatDfsPointsPer1k(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

export function formatDfsRank(rank: number | null | undefined): string {
  return rank == null ? "—" : String(rank);
}

export type DfsStatusBadgeTone = "neutral" | "caution" | "danger";

export type DfsStatusBadge = { label: string; tone: DfsStatusBadgeTone };

const STATUS_BADGES: Readonly<Record<string, DfsStatusBadge>> = {
  Q: { label: "Q", tone: "caution" },
  D: { label: "D", tone: "caution" },
  OUT: { label: "OUT", tone: "danger" },
  IR: { label: "IR", tone: "danger" },
};

/** Blank status -> null (no badge). Unknown nonblank statuses still render, tone "neutral", so nothing is silently dropped. */
export function getDfsStatusBadge(status: string | null | undefined): DfsStatusBadge | null {
  if (!status) return null;
  return STATUS_BADGES[status] ?? { label: status, tone: "neutral" };
}

export const DFS_STATUS_BADGE_CLASSES: Record<DfsStatusBadgeTone, string> = {
  neutral: "border-slate-300 bg-slate-100 text-slate-700",
  caution: "border-amber-300 bg-amber-100 text-amber-900",
  danger: "border-rose-300 bg-rose-100 text-rose-900",
};

export function formatDfsFreshnessAge(ageHours: number | null | undefined): string {
  if (ageHours == null || !Number.isFinite(ageHours)) return "unknown age";
  if (ageHours < 1) return "less than 1h old";
  return `${Math.round(ageHours)}h old`;
}

export function formatDfsTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatDfsPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value)}%`;
}

/** Human-readable, non-technical summaries for the upload panel's blocking-error list. */
const DIAGNOSTIC_MESSAGES: Readonly<Record<string, string>> = {
  EMPTY_FILE: "The file is empty.",
  HEADER_ONLY_FILE: "The file has headers but no player rows.",
  MISSING_REQUIRED_COLUMN: "A required DraftKings column is missing.",
  DUPLICATE_HEADER: "A column header appears more than once.",
  INVALID_ROW_WIDTH: "A row has the wrong number of columns.",
  CSV_PARSE_ERROR: "The file could not be parsed as CSV.",
  MISSING_REQUIRED_VALUE: "A required value is missing on a row.",
  INVALID_POSITION: "A row has an unsupported position.",
  INVALID_ROSTER_POSITION: "A row has an invalid roster position.",
  INVALID_SALARY: "A row has an invalid salary.",
  INVALID_DK_ID: "A row has an invalid or missing DraftKings ID.",
  DUPLICATE_DK_ID: "A DraftKings ID appears more than once.",
  UNSUPPORTED_CONTEST_FORMAT: "This file is not a DraftKings NFL Classic salary export.",
};

export function describeDfsDiagnostic(code: string, field: string | null, row: number | null): string {
  const base = DIAGNOSTIC_MESSAGES[code] ?? "This row could not be validated.";
  const location = [field ? `"${field}"` : null, row != null ? `row ${row}` : null].filter(Boolean).join(", ");
  return location ? `${base} (${location})` : base;
}

// ---------------------------------------------------------------------------
// Presentation-only filtering/sorting for the DFS analyzer table. Never
// recomputes a domain rank/projection/diff -- these only reorder/hide the
// already-computed analyzer rows.
// ---------------------------------------------------------------------------

export type DfsBoardView = "VALUE" | "QB" | "RB" | "WR" | "TE" | "DST";

export type DfsDirectionFilter = "all" | "jkb-higher" | "dk-higher" | "agreement";

export type DfsSortKey = "player" | "teamOpp" | "rankDiff" | "proj" | "pts1k" | "salary" | "dkPosRank" | "jkbSlateRank"
  | "weeklyRank" | "matchup" | "fpaSeason" | "fpaLast5" | "epa" | "success" | "trenches" | "defenseAvg" | "dstRank" | "dstScore";
export type DfsSortDirection = "asc" | "desc";
export type DfsDisplayContext = { historyIndex?: DfsHistoryIndex | null; dstEdges?: ReadonlyMap<string, FantasyMatchupEdges> };

/** Read the already position-selected research edge. DST reverses the opponent's passing perspective. */
export function dfsMatchupValue(row: DfsEnrichedAnalyzerRow, key: "epa" | "success" | "trenches", context: DfsDisplayContext = {}): number | null {
  if (row.kind === "offense") return row.research?.status === "available" ? row.research.matchupEdges?.[key].rankDifference ?? null : null;
  const value = context.dstEdges?.get(row.dkId)?.[key].rankDifference;
  return value == null ? null : -value;
}

export function defaultDfsSortDirection(key: DfsSortKey): DfsSortDirection {
  return ["player", "teamOpp", "dkPosRank", "jkbSlateRank", "weeklyRank", "dstRank", "matchup"].includes(key) ? "asc" : "desc";
}

export type DfsTableFilters = {
  view: DfsBoardView;
  search: string;
  availableOnly: boolean;
  optimizerEligibleOnly?: boolean;
  direction: DfsDirectionFilter;
  sortKey: DfsSortKey;
};

/**
 * Board rows always pass through the canonical DFS practical-pool gate first
 * -- the same rule the optimizer candidate pool and generated-lineup
 * validation use -- so the board never shows a player the optimizer could not
 * select. See dfsPlayerPool.ts.
 */
export function selectDfsBoardRows(rows: readonly DfsEnrichedAnalyzerRow[], view: DfsBoardView): DfsEnrichedAnalyzerRow[] {
  const pool = rows.filter(isDfsCandidatePoolPlayer);
  if (view === "VALUE") return pool.filter((row) => row.kind === "offense");
  if (view === "DST") return pool.filter((row) => row.kind === "dst");
  return pool.filter((row) => row.position === view);
}

function matchesDirection(row: DfsEnrichedAnalyzerRow, direction: DfsDirectionFilter): boolean {
  if (direction === "all") return true;
  if (row.posRankDiff == null) return false;
  if (direction === "jkb-higher") return row.posRankDiff > 0;
  if (direction === "dk-higher") return row.posRankDiff < 0;
  return row.posRankDiff === 0;
}

export function filterDfsRows(
  rows: readonly DfsEnrichedAnalyzerRow[],
  { search, availableOnly, optimizerEligibleOnly, direction }: Pick<DfsTableFilters, "search" | "availableOnly" | "optimizerEligibleOnly" | "direction">,
): DfsEnrichedAnalyzerRow[] {
  const query = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (query && !row.playerName.toLowerCase().includes(query)) return false;
    if (availableOnly && (row.dkStatus === "OUT" || row.dkStatus === "IR")) return false;
    if (optimizerEligibleOnly && (row.kind === "offense" ? row.optimizerEligibility !== "eligible" : row.dstMatchup?.dstMatchupScore == null)) return false;
    if (!matchesDirection(row, direction)) return false;
    return true;
  });
}

export function dfsSortValue(row: DfsEnrichedAnalyzerRow, key: DfsSortKey, context: DfsDisplayContext = {}): number | string | null {
  const research = row.research?.status === "available" ? row.research : null;
  switch (key) {
    case "player": return row.playerName;
    case "teamOpp": return `${row.team}/${row.opponent ?? ""}`;
    case "rankDiff": return row.posRankDiff;
    case "proj": return row.projectedFantasyPoints;
    case "pts1k": return row.pointsPer1k;
    case "salary": return row.salary;
    case "dkPosRank": return row.dkPositionSalaryRank;
    case "jkbSlateRank": return row.jkbSlatePositionRank;
    case "weeklyRank": return row.jkbWeeklyPositionRank;
    case "matchup": return research?.context?.opponentFpaSeason.rank ?? null;
    case "fpaSeason": return research?.context?.opponentFpaSeason.value ?? null;
    case "fpaLast5": return research?.context?.opponentFpaLast5.value ?? null;
    case "epa": case "success": case "trenches": return dfsMatchupValue(row, key, context);
    case "defenseAvg": return defenseSummary(context.historyIndex ?? null, row).mean;
    case "dstRank": return row.kind === "dst" ? row.dstMatchup?.dstMatchupRank ?? null : null;
    case "dstScore": return row.kind === "dst" ? row.dstMatchup?.dstMatchupScore ?? null : null;
  }
}

/** Nulls always sort last; ties retain a deterministic identity order. */
export function sortDfsRows(rows: readonly DfsEnrichedAnalyzerRow[], sortKey: DfsSortKey, direction = defaultDfsSortDirection(sortKey), context: DfsDisplayContext = {}): DfsEnrichedAnalyzerRow[] {
  return [...rows].sort((a, b) => {
    const left = dfsSortValue(a, sortKey, context);
    const right = dfsSortValue(b, sortKey, context);
    if (left == null && right == null) return a.playerName.localeCompare(b.playerName) || a.dkId.localeCompare(b.dkId);
    if (left == null) return 1;
    if (right == null) return -1;
    const diff = typeof left === "string" && typeof right === "string" ? left.localeCompare(right) : Number(left) - Number(right);
    return (direction === "asc" ? diff : -diff) || a.playerName.localeCompare(b.playerName) || a.dkId.localeCompare(b.dkId);
  });
}

/** Exact selected-week team pair; repeated player copies must agree. No cross-week or substitute metric. */
export function buildDfsDstDisplayEdges(rows: readonly DfsEnrichedAnalyzerRow[], researchRows: readonly { matchupEdges: FantasyMatchupEdges }[]): Map<string, FantasyMatchupEdges> {
  const result = new Map<string, FantasyMatchupEdges>();
  for (const row of rows) {
    if (row.kind !== "dst" || row.identityStatus !== "resolved" || row.identityConflict || !row.canonicalGameId || !row.opponent) continue;
    const candidates = researchRows.map(entry => entry.matchupEdges).filter(edges => {
      const components = [edges.epa, edges.success, edges.trenches];
      return edges.mode === "pass" && components.some(edge => edge.offense && edge.defense)
        && components.every(edge => (!edge.offense || normalizeNflTeamAbbr(edge.offense.team) === normalizeNflTeamAbbr(row.opponent)) && (!edge.defense || normalizeNflTeamAbbr(edge.defense.team) === normalizeNflTeamAbbr(row.team)));
    });
    const signatures = new Set(candidates.map(edges => JSON.stringify(edges)));
    if (signatures.size === 1) result.set(row.dkId, candidates[0]);
  }
  return result;
}
