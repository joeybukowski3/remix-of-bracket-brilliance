// Canonical DFS analyzer-board column registry.
//
// One list drives:
//   - the desktop main table column set + order + sort wiring
//   - the mobile compact row-detail (same labels, same values, no fork)
//   - the "Columns" visibility dropdown (which columns are optional per view)
//   - localStorage persistence (see hooks/useDfsColumnVisibility)
//
// The desktop cell *rendering* still lives in NflDfsAnalyzerTable (`renderMetric`)
// and the shared cell components in DfsTableCells -- the registry owns identity,
// labels, sort semantics, scope, alignment, help text and default visibility,
// not JSX. Nothing here recomputes a projection, rank, Rank Diff or matchup.

import type { DfsBoardView, DfsSortKey } from "./presentation";

export type DfsColumnId =
  | "player"
  | "teamOpp"
  | "salary"
  | "dkPosRank"
  | "dstRank"
  | "dstScore"
  | "jkbSlateRank"
  | "rankDiff"
  | "proj"
  | "pts1k"
  | "fantasyPpg"
  | "fantasyPpgL5"
  | "matchup"
  | "fpaSeason"
  | "fpaLast5"
  | "epa"
  | "success"
  | "trenches"
  | "defenseAvg"
  | "defRank"
  | "oppOffRank"
  | "targetsPerGame"
  | "targetsPerGameL5"
  | "tdScore"
  | "oppSlotPct"
  | "oppWidePct"
  | "slotPpgAllowed"
  | "widePpgAllowed";

/** Which board views a column belongs to. `all` = every view; `wr` = the WR tab only (not VALUE/QB/RB/TE); the rest gate on row kind. */
export type DfsColumnScope = "all" | "offense" | "dst" | "wr";

export type DfsColumnLayout = "desktop" | "mobile";

/**
 * Grouping for the Player Review panel only (NflDfsAnalyzerTable). Columns
 * without a `reviewGroup` (identity columns) are never shown in the review
 * body -- they're already the panel's header. This does not affect table
 * rendering, sorting, or visibility.
 */
export type DfsColumnReviewGroup = "projection" | "usage" | "matchup" | "scoring" | "wrAlignment" | "dst";

export type DfsColumnDef = {
  id: DfsColumnId;
  label: string;
  /** Column is a sort target. When true, `sortKey` is the key handed to sortDfsRows. */
  sortable: boolean;
  sortKey: DfsSortKey | null;
  scope: DfsColumnScope;
  /** Mandatory columns are always visible and never appear in the "Columns" dropdown. */
  mandatory: boolean;
  /** In the initial visible set on a desktop-width first load (no saved config). */
  desktopDefault: boolean;
  /** In the initial visible set on a mobile-width first load, and the target of "Reset" on mobile. */
  mobileDefault: boolean;
  align: "left" | "right";
  /** Optional self-contained `title=` help for the header cell. */
  headerHelp?: string;
  /** Which Player Review section this column appears in. Omitted for identity columns. */
  reviewGroup?: DfsColumnReviewGroup;
};

const PPG_HELP =
  "Player fantasy points per game (JKB Full PPR) from the canonical weekly research history — the same metric the Weekly Fantasy Rankings use. Requires a compatible weekly research artifact.";

const DEF_RANK_HELP =
  "This DST's overall JKB defense rank (1 = best) from the universal current-season Power Board — the same OFF/DEF ratings the matchup hero shows, blended from the preseason model and live Team Performance Rating.";
const OPP_OFF_RANK_HELP =
  "The opponent's overall JKB offense rank (1 = best) from the same universal current-season Power Board.";
const TARGETS_HELP =
  "Season targets/game from the canonical weekly research history (WR/TE). Same sample the Fantasy PPG cells use.";
const TARGETS_L5_HELP =
  "Targets/game over the same trailing-five-game sample as Fantasy PPG L5 (WR/TE).";
const TD_SCORE_HELP =
  "JKB TD Score (0-100) from the Touchdown Preview artifact's default window — the same score shown on the TD Scorer board. Never recalculated here.";
const OPP_SLOT_PCT_HELP =
  "Share of receiving production the opponent's DEFENSE has allowed to the slot (Razzball, defense-level) — not this player's own alignment.";
const OPP_WIDE_PCT_HELP =
  "Share of receiving production the opponent's DEFENSE has allowed to wide alignments (Razzball, defense-level) — not this player's own alignment.";
const SLOT_PPG_ALLOWED_HELP =
  "Fantasy PPG the opponent's defense has allowed to slot receivers (Razzball). Higher favors this receiver.";
const WIDE_PPG_ALLOWED_HELP =
  "Fantasy PPG the opponent's defense has allowed to wide receivers (Razzball). Higher favors this receiver.";

/**
 * Ordered canonical column list. Array order is the on-screen order after a
 * scope filter; `dstRank`/`dstScore` sit between `dkPosRank` and the offense
 * block so the DST view reads `... DK Pos RK | DST Matchup RK | DST Score | EPA ...`
 * and the offense view reads `... DK Pos RK | JKB Slate RK | ...`.
 */
export const DFS_COLUMN_REGISTRY: readonly DfsColumnDef[] = [
  { id: "player", label: "Player", sortable: true, sortKey: "player", scope: "all", mandatory: true, desktopDefault: true, mobileDefault: true, align: "left" },
  { id: "teamOpp", label: "Team/Opp", sortable: true, sortKey: "teamOpp", scope: "all", mandatory: true, desktopDefault: true, mobileDefault: true, align: "left" },
  { id: "salary", label: "Salary", sortable: true, sortKey: "salary", scope: "all", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right", reviewGroup: "projection" },
  { id: "dkPosRank", label: "DK Pos RK", sortable: true, sortKey: "dkPosRank", scope: "all", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right", reviewGroup: "projection" },
  { id: "dstRank", label: "DST Matchup RK", sortable: true, sortKey: "dstRank", scope: "dst", mandatory: false, desktopDefault: true, mobileDefault: true, align: "right", reviewGroup: "dst" },
  { id: "dstScore", label: "DST Score", sortable: true, sortKey: "dstScore", scope: "dst", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right", reviewGroup: "dst" },
  { id: "defRank", label: "Def Rank", sortable: true, sortKey: "defRank", scope: "dst", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right", headerHelp: DEF_RANK_HELP, reviewGroup: "dst" },
  { id: "oppOffRank", label: "Off Rank", sortable: true, sortKey: "oppOffRank", scope: "dst", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right", headerHelp: OPP_OFF_RANK_HELP, reviewGroup: "dst" },
  { id: "jkbSlateRank", label: "JKB Slate RK", sortable: true, sortKey: "jkbSlateRank", scope: "offense", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right", reviewGroup: "projection" },
  { id: "rankDiff", label: "Rank Diff", sortable: true, sortKey: "rankDiff", scope: "offense", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right", reviewGroup: "projection" },
  { id: "proj", label: "JKB Proj", sortable: true, sortKey: "proj", scope: "offense", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right", reviewGroup: "projection" },
  { id: "pts1k", label: "JKB Pts/$1K", sortable: true, sortKey: "pts1k", scope: "offense", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right", reviewGroup: "projection" },
  { id: "fantasyPpg", label: "Fantasy PPG", sortable: true, sortKey: "fantasyPpg", scope: "offense", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right", headerHelp: PPG_HELP, reviewGroup: "projection" },
  { id: "fantasyPpgL5", label: "Fantasy PPG L5", sortable: true, sortKey: "fantasyPpgL5", scope: "offense", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right", headerHelp: `${PPG_HELP} L5 = mean over the 5 most recent completed games entering the slate.`, reviewGroup: "projection" },
  { id: "matchup", label: "Matchup", sortable: true, sortKey: "matchup", scope: "offense", mandatory: false, desktopDefault: true, mobileDefault: true, align: "right", reviewGroup: "matchup" },
  { id: "fpaSeason", label: "FPA SZN", sortable: true, sortKey: "fpaSeason", scope: "offense", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right", reviewGroup: "matchup" },
  { id: "fpaLast5", label: "FPA L5", sortable: true, sortKey: "fpaLast5", scope: "offense", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right", reviewGroup: "matchup" },
  { id: "epa", label: "EPA ADV", sortable: true, sortKey: "epa", scope: "all", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right", reviewGroup: "matchup" },
  { id: "success", label: "SUCCESS ADV", sortable: true, sortKey: "success", scope: "all", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right", reviewGroup: "matchup" },
  { id: "trenches", label: "TRENCHES", sortable: true, sortKey: "trenches", scope: "all", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right", reviewGroup: "matchup" },
  { id: "defenseAvg", label: "DEF VS AVG", sortable: true, sortKey: "defenseAvg", scope: "offense", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right", reviewGroup: "matchup" },
  { id: "targetsPerGame", label: "TGT/G", sortable: true, sortKey: "targetsPerGame", scope: "offense", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right", headerHelp: TARGETS_HELP, reviewGroup: "usage" },
  { id: "targetsPerGameL5", label: "TGT/G L5", sortable: true, sortKey: "targetsPerGameL5", scope: "offense", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right", headerHelp: TARGETS_L5_HELP, reviewGroup: "usage" },
  { id: "tdScore", label: "TD Score", sortable: true, sortKey: "tdScore", scope: "offense", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right", headerHelp: TD_SCORE_HELP, reviewGroup: "scoring" },
  { id: "oppSlotPct", label: "Opp Slot %", sortable: true, sortKey: "oppSlotPct", scope: "wr", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right", headerHelp: OPP_SLOT_PCT_HELP, reviewGroup: "wrAlignment" },
  { id: "oppWidePct", label: "Opp Wide %", sortable: true, sortKey: "oppWidePct", scope: "wr", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right", headerHelp: OPP_WIDE_PCT_HELP, reviewGroup: "wrAlignment" },
  { id: "slotPpgAllowed", label: "Slot PPG Allowed", sortable: true, sortKey: "slotPpgAllowed", scope: "wr", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right", headerHelp: SLOT_PPG_ALLOWED_HELP, reviewGroup: "wrAlignment" },
  { id: "widePpgAllowed", label: "Wide PPG Allowed", sortable: true, sortKey: "widePpgAllowed", scope: "wr", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right", headerHelp: WIDE_PPG_ALLOWED_HELP, reviewGroup: "wrAlignment" },
];

const REGISTRY_BY_ID: ReadonlyMap<string, DfsColumnDef> = new Map(DFS_COLUMN_REGISTRY.map((column) => [column.id, column]));

/** True when `id` is a real registry column id. */
export function isDfsColumnId(id: string): id is DfsColumnId {
  return REGISTRY_BY_ID.has(id);
}

/** Columns for a board view, in canonical order. DST view drops offense-only columns and vice versa; `wr`-scoped columns appear only on the WR tab. */
export function dfsColumnsForView(view: DfsBoardView): DfsColumnDef[] {
  const isDst = view === "DST";
  return DFS_COLUMN_REGISTRY.filter((column) => {
    if (column.scope === "all") return true;
    if (isDst) return column.scope === "dst";
    if (column.scope === "wr") return view === "WR";
    return column.scope === "offense";
  });
}

/** The hideable (non-mandatory) columns for a view — i.e. the "Columns" dropdown contents. */
export function dfsOptionalColumnsForView(view: DfsBoardView): DfsColumnDef[] {
  return dfsColumnsForView(view).filter((column) => !column.mandatory);
}

/** The canonical column for a sort key, if any. */
export function dfsColumnForSortKey(sortKey: DfsSortKey): DfsColumnDef | undefined {
  return DFS_COLUMN_REGISTRY.find((column) => column.sortKey === sortKey);
}

const DFS_REVIEW_GROUP_LABELS: Record<DfsColumnReviewGroup, string> = {
  projection: "Projection & Value",
  usage: "Usage",
  matchup: "Matchup",
  scoring: "Scoring",
  wrAlignment: "WR Alignment / Defense",
  dst: "DST Matchup",
};

const DFS_REVIEW_GROUP_ORDER: readonly DfsColumnReviewGroup[] = ["projection", "usage", "matchup", "scoring", "wrAlignment", "dst"];

/**
 * The Player Review panel's field groups for a view, in canonical display
 * order, using every registry column applicable to that scope regardless of
 * the user's current visibility choices -- the review always shows the full
 * applicable field set, not just the visible board columns.
 */
export function dfsReviewGroupsForView(view: DfsBoardView): { group: DfsColumnReviewGroup; label: string; columns: DfsColumnDef[] }[] {
  const columns = dfsColumnsForView(view).filter((column): column is DfsColumnDef & { reviewGroup: DfsColumnReviewGroup } => column.reviewGroup != null);
  return DFS_REVIEW_GROUP_ORDER
    .map((group) => ({ group, label: DFS_REVIEW_GROUP_LABELS[group], columns: columns.filter((column) => column.reviewGroup === group) }))
    .filter((entry) => entry.columns.length > 0);
}

// ---------------------------------------------------------------------------
// Visibility resolution (persistence-model-agnostic).
//
// The persisted unit is a set of HIDDEN column ids. An empty set means "every
// column visible", so a column added to the registry later is visible for
// existing users automatically unless they explicitly hide it. A first load
// with no saved config starts from the layout default set.
// ---------------------------------------------------------------------------

/** The hidden-id set that reproduces the layout's default visible set (optional columns only). */
export function dfsDefaultHiddenIds(layout: DfsColumnLayout): DfsColumnId[] {
  return DFS_COLUMN_REGISTRY.filter(
    (column) => !column.mandatory && !(layout === "mobile" ? column.mobileDefault : column.desktopDefault),
  ).map((column) => column.id);
}

/** Drop unknown ids and any mandatory id (mandatory columns can never be hidden). */
export function sanitizeHiddenIds(ids: readonly string[]): DfsColumnId[] {
  const seen = new Set<DfsColumnId>();
  for (const id of ids) {
    const column = REGISTRY_BY_ID.get(id);
    if (column && !column.mandatory) seen.add(column.id);
  }
  return [...seen];
}

/** Apply a hidden-id set to a view's columns, preserving canonical order. Mandatory columns always survive. */
export function applyDfsColumnVisibility(view: DfsBoardView, hiddenIds: ReadonlySet<string>): DfsColumnDef[] {
  return dfsColumnsForView(view).filter((column) => column.mandatory || !hiddenIds.has(column.id));
}
