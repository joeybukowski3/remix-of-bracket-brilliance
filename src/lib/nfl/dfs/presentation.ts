// WU4 DFS presentation helpers -- pure functions only, no React.
//
// Rank Diff thresholds below are V1 PROVISIONAL presentation thresholds,
// chosen conservatively from the existing site heat-tone language
// (gold/dark-green/green/light-green/neutral/light-red/red/strong-red, see
// src/lib/fantasy/weekly/researchPresentation.ts). They are NOT model
// thresholds and are not derived from any real slate distribution -- WU5
// should calibrate them once real uploaded-slate data exists. Centralized
// here specifically so no threshold value is hardcoded inside JSX.

import type { WeeklyHeatTone } from "@/lib/fantasy/weekly/researchPresentation";
import type { DfsEnrichedAnalyzerRow } from "@/lib/nfl/dfs/slateAnalyzer";

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

export type DfsSortKey = "rankDiff" | "proj" | "pts1k" | "salary" | "dkPosRank" | "jkbSlateRank";

export type DfsTableFilters = {
  view: DfsBoardView;
  search: string;
  availableOnly: boolean;
  direction: DfsDirectionFilter;
  sortKey: DfsSortKey;
};

export function selectDfsBoardRows(rows: readonly DfsEnrichedAnalyzerRow[], view: DfsBoardView): DfsEnrichedAnalyzerRow[] {
  if (view === "VALUE") return rows.filter((row) => row.kind === "offense");
  if (view === "DST") return rows.filter((row) => row.kind === "dst");
  return rows.filter((row) => row.position === view);
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
  { search, availableOnly, direction }: Pick<DfsTableFilters, "search" | "availableOnly" | "direction">,
): DfsEnrichedAnalyzerRow[] {
  const query = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (query && !row.playerName.toLowerCase().includes(query)) return false;
    if (availableOnly && (row.dkStatus === "OUT" || row.dkStatus === "IR")) return false;
    if (!matchesDirection(row, direction)) return false;
    return true;
  });
}

const SORT_ACCESSORS: Record<DfsSortKey, (row: DfsEnrichedAnalyzerRow) => number | null> = {
  rankDiff: (row) => row.posRankDiff,
  proj: (row) => row.projectedFantasyPoints,
  pts1k: (row) => row.pointsPer1k,
  salary: (row) => row.salary,
  dkPosRank: (row) => row.dkPositionSalaryRank,
  jkbSlateRank: (row) => row.jkbSlatePositionRank,
};

/** Nulls always sort last, regardless of direction. */
export function sortDfsRows(rows: readonly DfsEnrichedAnalyzerRow[], sortKey: DfsSortKey): DfsEnrichedAnalyzerRow[] {
  const accessor = SORT_ACCESSORS[sortKey];
  const ascending = sortKey === "dkPosRank" || sortKey === "jkbSlateRank";
  return [...rows].sort((a, b) => {
    const left = accessor(a);
    const right = accessor(b);
    if (left == null && right == null) return a.playerName.localeCompare(b.playerName);
    if (left == null) return 1;
    if (right == null) return -1;
    const diff = ascending ? left - right : right - left;
    return diff !== 0 ? diff : a.playerName.localeCompare(b.playerName);
  });
}
