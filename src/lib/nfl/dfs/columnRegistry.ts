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
  | "defenseAvg";

/** Which board views a column belongs to. `all` = every view; the rest gate on row kind. */
export type DfsColumnScope = "all" | "offense" | "dst";

export type DfsColumnLayout = "desktop" | "mobile";

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
};

const PPG_HELP =
  "Player fantasy points per game (JKB Full PPR) from the canonical weekly research history — the same metric the Weekly Fantasy Rankings use. Requires a compatible weekly research artifact.";

/**
 * Ordered canonical column list. Array order is the on-screen order after a
 * scope filter; `dstRank`/`dstScore` sit between `dkPosRank` and the offense
 * block so the DST view reads `... DK Pos RK | DST Matchup RK | DST Score | EPA ...`
 * and the offense view reads `... DK Pos RK | JKB Slate RK | ...`.
 */
export const DFS_COLUMN_REGISTRY: readonly DfsColumnDef[] = [
  { id: "player", label: "Player", sortable: true, sortKey: "player", scope: "all", mandatory: true, desktopDefault: true, mobileDefault: true, align: "left" },
  { id: "teamOpp", label: "Team/Opp", sortable: true, sortKey: "teamOpp", scope: "all", mandatory: true, desktopDefault: true, mobileDefault: true, align: "left" },
  { id: "salary", label: "Salary", sortable: true, sortKey: "salary", scope: "all", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right" },
  { id: "dkPosRank", label: "DK Pos RK", sortable: true, sortKey: "dkPosRank", scope: "all", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right" },
  { id: "dstRank", label: "DST Matchup RK", sortable: true, sortKey: "dstRank", scope: "dst", mandatory: false, desktopDefault: true, mobileDefault: true, align: "right" },
  { id: "dstScore", label: "DST Score", sortable: true, sortKey: "dstScore", scope: "dst", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right" },
  { id: "jkbSlateRank", label: "JKB Slate RK", sortable: true, sortKey: "jkbSlateRank", scope: "offense", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right" },
  { id: "rankDiff", label: "Rank Diff", sortable: true, sortKey: "rankDiff", scope: "offense", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right" },
  { id: "proj", label: "JKB Proj", sortable: true, sortKey: "proj", scope: "offense", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right" },
  { id: "pts1k", label: "JKB Pts/$1K", sortable: true, sortKey: "pts1k", scope: "offense", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right" },
  { id: "fantasyPpg", label: "Fantasy PPG", sortable: true, sortKey: "fantasyPpg", scope: "offense", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right", headerHelp: PPG_HELP },
  { id: "fantasyPpgL5", label: "Fantasy PPG L5", sortable: true, sortKey: "fantasyPpgL5", scope: "offense", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right", headerHelp: `${PPG_HELP} L5 = mean over the 5 most recent completed games entering the slate.` },
  { id: "matchup", label: "Matchup", sortable: true, sortKey: "matchup", scope: "offense", mandatory: false, desktopDefault: true, mobileDefault: true, align: "right" },
  { id: "fpaSeason", label: "FPA SZN", sortable: true, sortKey: "fpaSeason", scope: "offense", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right" },
  { id: "fpaLast5", label: "FPA L5", sortable: true, sortKey: "fpaLast5", scope: "offense", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right" },
  { id: "epa", label: "EPA ADV", sortable: true, sortKey: "epa", scope: "all", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right" },
  { id: "success", label: "SUCCESS ADV", sortable: true, sortKey: "success", scope: "all", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right" },
  { id: "trenches", label: "TRENCHES", sortable: true, sortKey: "trenches", scope: "all", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right" },
  { id: "defenseAvg", label: "DEF VS AVG", sortable: true, sortKey: "defenseAvg", scope: "offense", mandatory: false, desktopDefault: true, mobileDefault: false, align: "right" },
];

const REGISTRY_BY_ID: ReadonlyMap<string, DfsColumnDef> = new Map(DFS_COLUMN_REGISTRY.map((column) => [column.id, column]));

/** True when `id` is a real registry column id. */
export function isDfsColumnId(id: string): id is DfsColumnId {
  return REGISTRY_BY_ID.has(id);
}

/** Columns for a board view, in canonical order. DST view drops offense-only columns and vice versa. */
export function dfsColumnsForView(view: DfsBoardView): DfsColumnDef[] {
  const isDst = view === "DST";
  return DFS_COLUMN_REGISTRY.filter((column) => column.scope === "all" || column.scope === (isDst ? "dst" : "offense"));
}

/** The hideable (non-mandatory) columns for a view — i.e. the "Columns" dropdown contents. */
export function dfsOptionalColumnsForView(view: DfsBoardView): DfsColumnDef[] {
  return dfsColumnsForView(view).filter((column) => !column.mandatory);
}

/** The canonical column for a sort key, if any. */
export function dfsColumnForSortKey(sortKey: DfsSortKey): DfsColumnDef | undefined {
  return DFS_COLUMN_REGISTRY.find((column) => column.sortKey === sortKey);
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
