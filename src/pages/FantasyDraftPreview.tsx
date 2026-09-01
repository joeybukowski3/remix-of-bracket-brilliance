import { useDeferredValue, useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, Minus, Plus, Search, Star } from "lucide-react";
import SiteShell from "@/components/layout/SiteShell";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import { NflFilterChips } from "@/components/nfl/ui/NflFilterBar";
import {
  DENSE_TABLE_HEAD_ROW,
  DENSE_TABLE_ROW,
  DenseTableScroller,
  stickyDenseHeader,
} from "@/components/ui/dense-table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import {
  FANTASY_TABLE_BODY_CELL,
  FANTASY_TABLE_HEADER_CELL,
  FANTASY_TABLE_SHELL,
  FantasyPlayerIdentity,
} from "@/components/fantasy/FantasyTable";
import {
  GradientRankCell,
  MatchupOpponentCell,
  ParPerGameValue,
  PositionRankBadge,
} from "@/components/fantasy/ParBoardCells";
import { formatSigned } from "@/lib/fantasy/formatBoardValue";
import { getMaxRank, getParPerGameThresholds, getRankGradientColor } from "@/lib/fantasy/parPresentation";
import { FANTASY_POSITIONS, type FantasyPosition } from "@/lib/fantasy/rankings";
import {
  DRAFT_PREVIEW_ROWS_2026,
  filterDraftPreviewRows,
  type DraftPreviewRow,
} from "@/lib/fantasy/draftPreview/draftPreviewBoard";
import {
  SNAKE_DRAFT_TEAM_COUNT,
  computeSnakeDraftSlotPicks,
  computeSnakeOverallPick,
  roundsToCoverRowCount,
} from "@/lib/fantasy/draftPreview/snakeDraft";
import {
  addPlayerToRound,
  computeMyDraftTotals,
  createEmptyMyDraftState,
  draftedRoundForPlayer,
  isPlayerDrafted,
  removePlayerFromRound,
  resetMyDraftState,
  type MyDraftState,
} from "@/lib/fantasy/draftPreview/myDraft";
import {
  computeStartingRoster,
  computeStartingRosterTotals,
  type RosterSlotAssignment,
  type RosterSlotId,
} from "@/lib/fantasy/draftPreview/startingRoster";
import {
  addTarget,
  countTargetsByRound,
  getRoundsForPlayer,
  getTargetsForRound,
  loadDraftTargetsState,
  moveTargetDown,
  moveTargetUp,
  removeTarget,
  saveDraftTargetsState,
  type DraftTargetsState,
} from "@/lib/fantasy/draftPreview/draftTargets";

type PositionFilter = "ALL" | FantasyPosition;
type BoardView = "BOARD" | "BY_ROUND";

const POSITION_FILTERS: readonly PositionFilter[] = ["ALL", ...FANTASY_POSITIONS];
const DRAFT_SLOTS: readonly number[] = Array.from({ length: SNAKE_DRAFT_TEAM_COUNT }, (_, i) => i + 1);
const DEFAULT_DRAFT_SLOT = 10;
const ROUND_COUNT = roundsToCoverRowCount(DRAFT_PREVIEW_ROWS_2026.length);
const ROUND_OPTIONS: readonly number[] = Array.from({ length: ROUND_COUNT }, (_, i) => i + 1);

/**
 * Canonical/global row pool the board's colour scales are derived from: the
 * whole deduplicated 267-player board, independent of the position-focus
 * and search state. Matches how the Fantasy rankings PAR board derives its
 * scales from a position's full pool before the user's text search narrows
 * what's rendered (`PositionParBoard.tsx`'s `buildScales(tiered)`) -- a
 * scale must not shrink/shift just because fewer rows are currently shown.
 */
const HEAT_SCALE_ROWS: readonly DraftPreviewRow[] = filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "ALL", "");

/** Sleeper Rank -> row, for resolving a saved target's presentation data. */
const DRAFT_PREVIEW_ROW_BY_RANK: ReadonlyMap<number, DraftPreviewRow> = new Map(
  DRAFT_PREVIEW_ROWS_2026.map((row) => [row.sleeperRank, row]),
);

/**
 * Fluid, viewport-scaled cell sizing (Draft Preview only): `clamp()` lets the
 * board pack materially more columns into view on desktop/laptop widths
 * without breakpoint jumps, while never shrinking body text/padding below a
 * readable floor on narrow viewports. Scoped to this page's constants only --
 * no other fantasy board's typography is touched.
 */
const CELL_PAD = "px-[clamp(4px,0.35vw,10px)] py-[clamp(3px,0.22vw,7px)]";
const CELL_TEXT = "text-[clamp(8px,0.58vw,11px)]";
const HEADER_CELL_TEXT = "text-[clamp(7px,0.50vw,10px)]";
const PLAYER_NAME_TEXT = "text-[clamp(9px,0.64vw,12px)]";
const TEAM_ABBR_TEXT = "text-[clamp(7px,0.48vw,9px)]";
const POSITION_BADGE_TEXT = "text-[clamp(8px,0.55vw,11px)] min-w-[clamp(1.75rem,3vw,2.5rem)]";

/** Site header clears at 73px (see `SiteHeader`'s min-h-[72px] + 1px border) -- every sticky header cell shares this same offset so the board header stacks directly beneath it, never overlapping. */
const STICKY_HEADER_TOP = "top-[73px]";
/** Ordinary sticky header cells: below the pinned Rank/Player header corner, above the sticky Rank/Player body cells. */
const STICKY_HEADER_CELL = cn("sticky", STICKY_HEADER_TOP, "z-20 bg-slate-100");
/** Rank/Player header cells stick on both axes (top AND left) and must out-rank every other header cell so the corner never disappears under a plain column header while the board scrolls both ways. */
const STICKY_HEADER_PINNED_CELL = cn("sticky", STICKY_HEADER_TOP, "z-30 bg-slate-100");

export default function FantasyDraftPreview() {
  const seo = getSeoMeta("fantasy-draft-preview");
  usePageSeo({
    title: seo.title,
    description: seo.description,
    path: seo.path,
    noindex: seo.noindex ?? false,
  });

  const [view, setView] = useState<BoardView>("BOARD");
  const [position, setPosition] = useState<PositionFilter>("ALL");
  const [draftSlot, setDraftSlot] = useState<number>(DEFAULT_DRAFT_SLOT);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const [myDraft, setMyDraft] = useState<MyDraftState>(createEmptyMyDraftState);
  const [hideDrafted, setHideDrafted] = useState(false);
  const [targets, setTargets] = useState<DraftTargetsState>(() => loadDraftTargetsState());
  const [selectedTargetRound, setSelectedTargetRound] = useState(1);

  useEffect(() => {
    saveDraftTargetsState(targets);
  }, [targets]);

  // Position is a highlight-only control now (see DraftPreviewTableRow's
  // emphasis logic) -- it is deliberately never passed to
  // `filterDraftPreviewRows` here, so the board never removes or reorders a
  // row when a position chip is clicked. Search and "hide drafted" remain
  // real filters.
  const rows = useMemo(() => {
    const filtered = filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "ALL", deferredQuery);
    return hideDrafted ? filtered.filter((row) => !isPlayerDrafted(myDraft, row.sleeperRank)) : filtered;
  }, [deferredQuery, hideDrafted, myDraft]);

  const picks = useMemo(() => computeSnakeDraftSlotPicks(draftSlot, ROUND_COUNT), [draftSlot]);

  const pickRoundByOverall = useMemo(
    () => new Map(picks.map((pick) => [pick.overallPick, pick.round])),
    [picks],
  );

  const nextOpenRound = useMemo(() => {
    const openPick = picks.find((pick) => !myDraft.has(pick.round));
    return openPick?.round ?? null;
  }, [picks, myDraft]);

  const handleToggleTeam = (row: DraftPreviewRow) => {
    const currentRound = draftedRoundForPlayer(myDraft, row.sleeperRank);
    if (currentRound != null) {
      setMyDraft((previous) => removePlayerFromRound(previous, currentRound));
      return;
    }
    if (nextOpenRound == null) return;
    setMyDraft((previous) => addPlayerToRound(previous, nextOpenRound, row));
  };

  const handleRemoveFromTeam = (round: number) => {
    setMyDraft((previous) => removePlayerFromRound(previous, round));
  };

  const handleResetTeam = () => {
    setMyDraft(resetMyDraftState());
  };

  const handleToggleTargetRound = (sleeperRank: number, round: number) => {
    setTargets((previous) => {
      const alreadyTargeted = getTargetsForRound(previous, round).includes(sleeperRank);
      return alreadyTargeted ? removeTarget(previous, round, sleeperRank) : addTarget(previous, round, sleeperRank);
    });
  };

  const handleRemoveTarget = (round: number, sleeperRank: number) => {
    setTargets((previous) => removeTarget(previous, round, sleeperRank));
  };

  const handleMoveTargetUp = (round: number, sleeperRank: number) => {
    setTargets((previous) => moveTargetUp(previous, round, sleeperRank));
  };

  const handleMoveTargetDown = (round: number, sleeperRank: number) => {
    setTargets((previous) => moveTargetDown(previous, round, sleeperRank));
  };

  const targetCountsByRound = useMemo(() => countTargetsByRound(targets), [targets]);

  return (
    <SiteShell>
      <div className="site-container pt-6">
        <Link
          to="/fantasy-football"
          className="text-xs font-semibold text-sky-600 underline hover:text-sky-700"
        >
          ← Back to Fantasy Football
        </Link>
      </div>
      <NflPageHeader
        eyebrow="Fantasy Football"
        title="Fantasy Draft Preview"
        description="The Sleeper 2026 draft board, compared against Joe Knows Ball rest-of-season projections, PAR/G and Model Rank. Sleeper Rank is the fixed default order and is never recomputed on this page."
      />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start xl:grid-cols-[minmax(0,1fr)_380px]">
        {/*
          `overflow-visible` deliberately overrides `FANTASY_TABLE_SHELL`'s
          `overflow-hidden` (rounded-corner clipping) for this section only.
          `overflow-hidden` on an ancestor establishes a scroll-container
          containing block for `position: sticky` descendants, which is what
          was silently defeating the board header's page-scroll stickiness --
          removing it here (Draft Preview only; the shared shell/other boards
          are untouched) is the root-cause fix, not a workaround layered on
          top.
        */}
        <section aria-labelledby="draft-preview-title" className={cn(FANTASY_TABLE_SHELL, "overflow-visible min-w-0")}>
          <div className="border-b border-slate-200 bg-slate-950 px-4 py-4 text-white sm:px-5">
            <h2 id="draft-preview-title" className="text-base font-bold tracking-tight sm:text-lg">
              2026 Sleeper draft board
            </h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-300 sm:text-[13px]">
              {DRAFT_PREVIEW_ROWS_2026.length} players from the supplied Sleeper draft-room snapshot, joined
              (where a canonical match exists) to the existing JKB research board.
            </p>
          </div>

          <ViewTabs view={view} onChange={setView} />

          {view === "BOARD" ? (
            <>
              <DraftPreviewGlossary />

              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <NflFilterChips label="Position focus" options={POSITION_FILTERS} value={position} onChange={setPosition} />
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">
                      Highlights that position -- every row stays on the board in the same Sleeper Rank order.
                    </p>
                  </div>
                  <div className="relative w-full lg:max-w-xs">
                    <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      aria-label="Search draft preview"
                      placeholder="Search player or team"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500 lg:h-10 lg:text-sm"
                    />
                  </div>
                </div>
                <DraftSlotControl draftSlot={draftSlot} onChange={setDraftSlot} />
                <label className="mt-3 flex w-fit items-center gap-2 text-[11px] font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={hideDrafted}
                    onChange={(event) => setHideDrafted(event.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300"
                  />
                  Hide drafted players
                </label>
              </div>

              {rows.length === 0 ? (
                <EmptyState query={deferredQuery} />
              ) : (
                <DraftPreviewTable
                  rows={rows}
                  pickRoundByOverall={pickRoundByOverall}
                  draftSlot={draftSlot}
                  positionFocus={position}
                  myDraft={myDraft}
                  canAddToTeam={nextOpenRound != null}
                  onToggleTeam={handleToggleTeam}
                  targets={targets}
                  onToggleTargetRound={handleToggleTargetRound}
                />
              )}
            </>
          ) : (
            <ByRoundView
              selectedRound={selectedTargetRound}
              onSelectRound={setSelectedTargetRound}
              targetCountsByRound={targetCountsByRound}
              targetedRanks={getTargetsForRound(targets, selectedTargetRound)}
              myDraft={myDraft}
              canAddToTeam={nextOpenRound != null}
              onToggleTeam={handleToggleTeam}
              onRemoveTarget={handleRemoveTarget}
              onMoveUp={handleMoveTargetUp}
              onMoveDown={handleMoveTargetDown}
            />
          )}
        </section>

        <MyDraftSidebar
          draftSlot={draftSlot}
          myDraft={myDraft}
          onRemove={handleRemoveFromTeam}
          onReset={handleResetTeam}
        />
      </div>
    </SiteShell>
  );
}

function ViewTabs({ view, onChange }: { view: BoardView; onChange: (view: BoardView) => void }) {
  return (
    <div className="flex gap-2 border-b border-slate-200 bg-white px-4 py-2 sm:px-5" role="tablist" aria-label="Draft preview view">
      <ViewTabButton active={view === "BOARD"} onClick={() => onChange("BOARD")}>
        Board
      </ViewTabButton>
      <ViewTabButton active={view === "BY_ROUND"} onClick={() => onChange("BY_ROUND")}>
        By Round
      </ViewTabButton>
    </div>
  );
}

function ViewTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide",
        active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
      )}
    >
      {children}
    </button>
  );
}

function DraftSlotControl({
  draftSlot,
  onChange,
}: {
  draftSlot: number;
  onChange: (slot: number) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        12-Team Snake Draft — Draft Position
      </span>
      <NflFilterChips
        label="Draft position"
        options={DRAFT_SLOTS}
        value={draftSlot}
        onChange={onChange}
        size="sm"
      />
    </div>
  );
}

const PICK_COLUMN_COUNT = 17;

/**
 * Board-wide heat scales: only for the two raw-VALUE columns (Sleeper PPG,
 * JKB Proj PPG) that are meant to compare across every position on one
 * mixed board -- always derived from `HEAT_SCALE_ROWS` (the full canonical
 * board), never from whatever subset is currently rendered by search.
 */
const DRAFT_PREVIEW_HEAT_SCALES = {
  sleeperPpgRank: buildDescendingRankMap(HEAT_SCALE_ROWS, (row) => row.sleeperProjectedPpg),
  jkbPpgRank: buildDescendingRankMap(HEAT_SCALE_ROWS, (row) => row.jkbProjectedPpg),
  poolSize: HEAT_SCALE_ROWS.length,
};

/**
 * Per-position heat scales for every genuinely position-relative rank/PAR
 * column (JKB PAR/G, Projection Rk, AVG Rk, SOS, 2025 Pts Rk, 2025 PPG Rk,
 * L8 Pts Rk). These fields are already position-relative VALUES in the
 * source data (see `FantasyRankingRow`'s field docs -- "rank within
 * position"), and the canonical single-position Fantasy board
 * (`PositionParBoard.tsx`'s `buildScales`) scales its identical
 * `GradientRankCell`/`ParPerGameValue` columns from that position's own
 * pool, never a cross-position blend. Scoping Draft Preview's mixed
 * 4-position board to one shared scale was the root cause of the
 * washed-out colors -- a WR's rank 20 (near the bottom of a ~60-deep WR
 * pool) and a QB's rank 20 (near the bottom of a ~30-deep QB pool) were
 * being placed at very different, wrong positions on one combined ~220-deep
 * ramp. Scoping per position, using the exact same canonical helpers,
 * restores the same strong tier separation the source page shows.
 *
 * Model Rk is deliberately excluded from this per-position map:
 * `shadowModelRankJoin.ts` documents `modelRank` itself as a genuinely
 * cross-position authority, so it cannot be grouped into one position's raw
 * value pool the way the position-relative fields above can. Its own
 * DISPLAY-ONLY position-relative heat scale (derived without mutating that
 * authority) is built separately by `MODEL_POSITION_RANK_BY_SLEEPER_RANK`
 * below.
 */
const HEAT_SCALE_ROWS_BY_POSITION: Readonly<Record<FantasyPosition, readonly DraftPreviewRow[]>> = (() => {
  const groups: Record<FantasyPosition, DraftPreviewRow[]> = { QB: [], RB: [], WR: [], TE: [] };
  for (const row of HEAT_SCALE_ROWS) {
    if (row.canonicalPosition) groups[row.canonicalPosition].push(row);
  }
  return groups;
})();

type PositionHeatScale = {
  parThresholds: ReturnType<typeof getParPerGameThresholds>;
  projectionRankMax: number | null;
  avgRankMax: number | null;
  sosMax: number | null;
  seasonPointsRankMax: number | null;
  seasonPpgRankMax: number | null;
  lastEightPointsRankMax: number | null;
};

function buildPositionHeatScale(rows: readonly DraftPreviewRow[]): PositionHeatScale {
  return {
    parThresholds: getParPerGameThresholds(rows.map((row) => row.jkbParPerGame)),
    projectionRankMax: getMaxRank(rows.map((row) => row.jkb?.projectionRank)),
    avgRankMax: getMaxRank(rows.map((row) => row.jkb?.averageRank)),
    sosMax: getMaxRank(rows.map((row) => row.jkb?.strengthOfSchedule)),
    seasonPointsRankMax: getMaxRank(rows.map((row) => row.seasonPointsRank2025)),
    seasonPpgRankMax: getMaxRank(rows.map((row) => row.seasonPpgRank2025)),
    lastEightPointsRankMax: getMaxRank(rows.map((row) => row.lastEightPointsRank)),
  };
}

const DRAFT_PREVIEW_HEAT_SCALES_BY_POSITION: Readonly<Record<FantasyPosition, PositionHeatScale>> = {
  QB: buildPositionHeatScale(HEAT_SCALE_ROWS_BY_POSITION.QB),
  RB: buildPositionHeatScale(HEAT_SCALE_ROWS_BY_POSITION.RB),
  WR: buildPositionHeatScale(HEAT_SCALE_ROWS_BY_POSITION.WR),
  TE: buildPositionHeatScale(HEAT_SCALE_ROWS_BY_POSITION.TE),
};

/** DEF/K rows have no JKB position scope at all -- every field renders N/A regardless, so an all-null scale is correct here, never a guess. */
const NEUTRAL_POSITION_HEAT_SCALE: PositionHeatScale = {
  parThresholds: null,
  projectionRankMax: null,
  avgRankMax: null,
  sosMax: null,
  seasonPointsRankMax: null,
  seasonPpgRankMax: null,
  lastEightPointsRankMax: null,
};

/**
 * Display-only positional rank prefix, e.g. "RB6" for `position=RB,
 * value=6`. Purely presentational -- callers still pass the untouched raw
 * rank value to the heat-map helpers; this only changes the rendered text.
 */
function positionPrefixedRank(position: FantasyPosition | undefined, value: number | undefined): string | undefined {
  if (!position || !Number.isFinite(value)) return undefined;
  return `${position}${value}`;
}

type ModelPositionRankEntry = { positionRank: number; poolSize: number };

/**
 * DISPLAY-ONLY position-relative Model Rank, derived (never written back) by:
 * grouping the canonical full board by position, sorting each group by the
 * existing Model Rank authority (ascending -- lower Model Rank is better),
 * tie-breaking deterministically on Sleeper Rank, then numbering 1..n within
 * that position. `row.modelRank` itself -- the cross-position authority
 * documented in `shadowModelRankJoin.ts` -- is never mutated or reordered;
 * this map only supplies a friendlier label ("RB4") and a same-position pool
 * size for a matching heat-map scale.
 */
const MODEL_POSITION_RANK_BY_SLEEPER_RANK: ReadonlyMap<number, ModelPositionRankEntry> = (() => {
  const map = new Map<number, ModelPositionRankEntry>();
  for (const position of FANTASY_POSITIONS) {
    const eligible = HEAT_SCALE_ROWS_BY_POSITION[position]
      .filter((row) => Number.isFinite(row.modelRank))
      .sort((a, b) => (a.modelRank as number) - (b.modelRank as number) || a.sleeperRank - b.sleeperRank);
    eligible.forEach((row, index) => {
      map.set(row.sleeperRank, { positionRank: index + 1, poolSize: eligible.length });
    });
  }
  return map;
})();

/** Best-value-first rank (1 = highest) for a raw stat, used only to drive heat-map colour -- never displayed or sorted on. */
function buildDescendingRankMap(
  rows: readonly DraftPreviewRow[],
  select: (row: DraftPreviewRow) => number | undefined,
): ReadonlyMap<number, number> {
  const withValues = rows
    .map((row) => ({ sleeperRank: row.sleeperRank, value: select(row) }))
    .filter((entry): entry is { sleeperRank: number; value: number } => Number.isFinite(entry.value))
    .sort((a, b) => b.value - a.value);
  return new Map(withValues.map((entry, index) => [entry.sleeperRank, index + 1]));
}

function DraftPreviewTable({
  rows,
  pickRoundByOverall,
  draftSlot,
  positionFocus,
  myDraft,
  canAddToTeam,
  onToggleTeam,
  targets,
  onToggleTargetRound,
}: {
  rows: readonly DraftPreviewRow[];
  pickRoundByOverall: ReadonlyMap<number, number>;
  draftSlot: number;
  positionFocus: PositionFilter;
  myDraft: MyDraftState;
  canAddToTeam: boolean;
  onToggleTeam: (row: DraftPreviewRow) => void;
  targets: DraftTargetsState;
  onToggleTargetRound: (sleeperRank: number, round: number) => void;
}) {
  return (
    <DenseTableScroller label="Draft preview board" className="overflow-y-visible">
      {/*
        `border-separate` (never `border-collapse`) is load-bearing: collapsed
        table borders merge every cell's border into one shared line owned by
        the table itself, which breaks `position: sticky` on individual `th`
        cells in this exact combination (horizontal-scroll ancestor + a table
        that also needs to stick vertically against page scroll) -- borders
        and backgrounds detach from the sticky cell as it pins, which is what
        rendered as a header row "floating" mid-table while scrolling. Every
        cell here only declares its own bottom/right border (see
        `FANTASY_TABLE_HEADER_CELL`/`FANTASY_TABLE_BODY_CELL`), so
        `border-spacing-0` reproduces the exact same hairline grid with zero
        gaps -- this is a visual no-op, purely the sticky-header fix.
      */}
      <table className={cn("w-full min-w-[1500px] border-separate border-spacing-0 text-left", CELL_TEXT)}>
        {/*
          Sticky positioning lives on every individual `<th>`, never on
          `<thead>` itself: `position: sticky` on a table-header-group
          (`<thead>`) is unreliable across browsers once the table also
          scrolls horizontally in an ancestor -- cells can stick independently
          of the row, producing overlapping/duplicated header rows. Per-`<th>`
          sticky is the standard fix and is exactly as sticky against page
          scroll; `top-[73px]` clears SiteHeader's sticky nav bar (min-h-[72px]
          + 1px border, see src/components/layout/SiteHeader.tsx).
        */}
        <thead className={cn(HEADER_CELL_TEXT, "font-semibold uppercase tracking-wider text-slate-600")}>
          <tr>
            <th className={cn(FANTASY_TABLE_HEADER_CELL, CELL_PAD, STICKY_HEADER_PINNED_CELL, "left-0 w-10 text-center")}>Rk</th>
            <th className={cn(FANTASY_TABLE_HEADER_CELL, CELL_PAD, STICKY_HEADER_PINNED_CELL, "left-10 min-w-[150px] sm:min-w-56 md:min-w-64")}>Player</th>
            <th title="Canonical JKB rank within the player's position" className={cn(FANTASY_TABLE_HEADER_CELL, CELL_PAD, STICKY_HEADER_CELL, "text-center")}>Pos Rk</th>
            <th title="Sleeper projected season fantasy points" className={cn(FANTASY_TABLE_HEADER_CELL, CELL_PAD, STICKY_HEADER_CELL, "text-center")}>Sleeper Proj</th>
            <th title="Sleeper projected fantasy points per game" className={cn(FANTASY_TABLE_HEADER_CELL, CELL_PAD, STICKY_HEADER_CELL, "text-center")}>Sleeper PPG</th>
            <th title="Existing Joe Knows Ball projected PPG (approved PAR authority)" className={cn(FANTASY_TABLE_HEADER_CELL, CELL_PAD, STICKY_HEADER_CELL, "text-center")}>JKB Proj PPG</th>
            <th title="Approved projected Points Above Replacement per game" className={cn(FANTASY_TABLE_HEADER_CELL, CELL_PAD, STICKY_HEADER_CELL, "text-center")}>JKB PAR/G</th>
            <th title="Model Rank shown as position-relative rank for display. Underlying F2 Model Rank authority is unchanged." className={cn(FANTASY_TABLE_HEADER_CELL, CELL_PAD, STICKY_HEADER_CELL, "text-center")}>Model Rk</th>
            <th title="Projection rank within position." className={cn(FANTASY_TABLE_HEADER_CELL, CELL_PAD, STICKY_HEADER_CELL, "text-center")}>Projection Rk</th>
            <th title="Average rank within position." className={cn(FANTASY_TABLE_HEADER_CELL, CELL_PAD, STICKY_HEADER_CELL, "text-center")}>AVG Rk</th>
            <th title="Positional strength of schedule within position; 1 is the easiest slate" className={cn(FANTASY_TABLE_HEADER_CELL, CELL_PAD, STICKY_HEADER_CELL, "text-center")}>SOS</th>
            <th title="2025 positional finish by total fantasy points" className={cn(FANTASY_TABLE_HEADER_CELL, CELL_PAD, STICKY_HEADER_CELL, "text-center")}>2025 Pts Rk</th>
            <th title="2025 positional finish by fantasy points per game" className={cn(FANTASY_TABLE_HEADER_CELL, CELL_PAD, STICKY_HEADER_CELL, "text-center")}>2025 PPG Rk</th>
            <th title="Last-eight-game total points rank within position" className={cn(FANTASY_TABLE_HEADER_CELL, CELL_PAD, STICKY_HEADER_CELL, "text-center")}>L8 Pts Rk</th>
            {["W15", "W16", "W17"].map((week) => (
              <th key={week} className={cn(FANTASY_TABLE_HEADER_CELL, CELL_PAD, STICKY_HEADER_CELL, "text-center")}>{week}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const round = pickRoundByOverall.get(row.sleeperRank);
            return (
              <FragmentRow
                key={row.sleeperRank}
                row={row}
                separator={round != null ? { round, slot: draftSlot, overallPick: row.sleeperRank } : undefined}
                focusState={
                  positionFocus === "ALL"
                    ? "neutral"
                    : row.rosterPosition === positionFocus
                      ? "match"
                      : "dim"
                }
                selected={isPlayerDrafted(myDraft, row.sleeperRank)}
                canAddToTeam={canAddToTeam}
                onToggleTeam={onToggleTeam}
                targetRounds={getRoundsForPlayer(targets, row.sleeperRank)}
                onToggleTargetRound={onToggleTargetRound}
              />
            );
          })}
        </tbody>
      </table>
    </DenseTableScroller>
  );
}

type PositionFocusState = "neutral" | "match" | "dim";

function FragmentRow({
  row,
  separator,
  focusState,
  selected,
  canAddToTeam,
  onToggleTeam,
  targetRounds,
  onToggleTargetRound,
}: {
  row: DraftPreviewRow;
  separator: { round: number; slot: number; overallPick: number } | undefined;
  focusState: PositionFocusState;
  selected: boolean;
  canAddToTeam: boolean;
  onToggleTeam: (row: DraftPreviewRow) => void;
  targetRounds: readonly number[];
  onToggleTargetRound: (sleeperRank: number, round: number) => void;
}) {
  return (
    <>
      {separator && <DraftPickSeparator {...separator} />}
      <DraftPreviewTableRow
        row={row}
        focusState={focusState}
        selected={selected}
        canAddToTeam={canAddToTeam}
        onToggleTeam={onToggleTeam}
        targetRounds={targetRounds}
        onToggleTargetRound={onToggleTargetRound}
      />
    </>
  );
}

/** Presentation-only marker. Never affects row order or any ranked value. */
function DraftPickSeparator({ round, slot, overallPick }: { round: number; slot: number; overallPick: number }) {
  return (
    <tr aria-hidden={false}>
      <td colSpan={PICK_COLUMN_COUNT} className="border-y-2 border-amber-400 bg-amber-100 px-2 py-1 text-center text-[10px] font-black uppercase tracking-wide text-amber-900 sm:px-3 sm:py-1.5 sm:text-[11px]">
        Your pick — Round {round} • Pick {round}.{String(slot).padStart(2, "0")} • Overall {overallPick}
      </td>
    </tr>
  );
}

function DraftPreviewTableRow({
  row,
  focusState,
  selected,
  canAddToTeam,
  onToggleTeam,
  targetRounds,
  onToggleTargetRound,
}: {
  row: DraftPreviewRow;
  focusState: PositionFocusState;
  selected: boolean;
  canAddToTeam: boolean;
  onToggleTeam: (row: DraftPreviewRow) => void;
  targetRounds: readonly number[];
  onToggleTargetRound: (sleeperRank: number, round: number) => void;
}) {
  const canonicalPosition = row.canonicalPosition;
  const heat = DRAFT_PREVIEW_HEAT_SCALES;
  const positionHeat = canonicalPosition ? DRAFT_PREVIEW_HEAT_SCALES_BY_POSITION[canonicalPosition] : NEUTRAL_POSITION_HEAT_SCALE;
  const modelPositionRank = MODEL_POSITION_RANK_BY_SLEEPER_RANK.get(row.sleeperRank);
  const isTargeted = targetRounds.length > 0;
  return (
    <tr
      data-focus-state={focusState}
      data-targeted={isTargeted}
      className={cn(
        DENSE_TABLE_ROW,
        "group",
        selected && "bg-emerald-50/60",
        !selected && isTargeted && "outline outline-1 -outline-offset-1 outline-amber-300",
        focusState === "match" && "bg-sky-50/70 ring-1 ring-inset ring-sky-200",
        // Opacity only, no grayscale filter: grayscale would desaturate the
        // very red/green hue distinction the heat-map cells exist to show,
        // which defeats "heat-map values remain visible enough to interpret"
        // for de-emphasized rows.
        focusState === "dim" && "opacity-60 hover:opacity-100",
      )}
    >
      <td className={cn(FANTASY_TABLE_BODY_CELL, CELL_PAD, "sticky left-0 z-10 bg-white text-center font-bold tabular-nums text-slate-800 group-hover:bg-slate-50", selected && "bg-emerald-50/60 group-hover:bg-emerald-50/60")}>{row.sleeperRank}</td>
      <td className={cn(FANTASY_TABLE_BODY_CELL, CELL_PAD, "sticky left-10 z-10 bg-white group-hover:bg-slate-50", selected && "bg-emerald-50/60 group-hover:bg-emerald-50/60")}>
        <div className="flex min-w-0 items-center justify-between gap-1">
          <FantasyPlayerIdentity
            player={row.player}
            team={row.displayTeam ?? undefined}
            compact
            nameClassName={PLAYER_NAME_TEXT}
            teamClassName={TEAM_ABBR_TEXT}
          />
          <div className="flex shrink-0 items-center gap-0.5">
            <TargetButton row={row} targetRounds={targetRounds} onToggleRound={onToggleTargetRound} />
            <AddRemoveButton row={row} selected={selected} disabled={!selected && !canAddToTeam} onToggleTeam={onToggleTeam} />
          </div>
        </div>
        {isTargeted && (
          <div className="mt-0.5 text-[9px] font-black uppercase tracking-wide text-amber-600">
            {targetRounds.map((round) => `R${round}`).join(", ")}
          </div>
        )}
      </td>
      <td className={cn(FANTASY_TABLE_BODY_CELL, CELL_PAD, "text-center")}>
        {canonicalPosition ? (
          <PositionRankBadge position={canonicalPosition} positionRank={row.jkb?.positionRank} className={POSITION_BADGE_TEXT} />
        ) : (
          <NotAvailable />
        )}
      </td>
      <StatCell value={row.sleeperProjectedPoints.toFixed(1)} />
      <HeatValueCell value={row.sleeperProjectedPpg} text={row.sleeperProjectedPpg.toFixed(1)} rank={heat.sleeperPpgRank.get(row.sleeperRank)} poolSize={heat.poolSize} />
      <HeatValueCell value={row.jkbProjectedPpg} text={row.jkbProjectedPpg != null ? row.jkbProjectedPpg.toFixed(1) : "N/A"} rank={heat.jkbPpgRank.get(row.sleeperRank)} poolSize={heat.poolSize} />
      <td className={cn(FANTASY_TABLE_BODY_CELL, CELL_PAD, "text-center")}>
        <ParPerGameValue value={row.jkbParPerGame} thresholds={positionHeat.parThresholds} />
      </td>
      {canonicalPosition && row.modelRank != null && modelPositionRank ? (
        <GradientRankCell
          value={modelPositionRank.positionRank}
          maxRank={modelPositionRank.poolSize}
          displayText={`${canonicalPosition}${modelPositionRank.positionRank}`}
          title={`Model Rank: ${row.modelRank} overall\nModel positional rank: ${canonicalPosition}${modelPositionRank.positionRank}`}
          className={CELL_PAD}
        />
      ) : (
        <NotAvailableCell />
      )}
      <GradientRankCell value={row.jkb?.projectionRank} maxRank={positionHeat.projectionRankMax} className={CELL_PAD} displayText={positionPrefixedRank(canonicalPosition, row.jkb?.projectionRank)} />
      <GradientRankCell value={row.jkb?.averageRank} maxRank={positionHeat.avgRankMax} className={CELL_PAD} displayText={positionPrefixedRank(canonicalPosition, row.jkb?.averageRank)} />
      <GradientRankCell value={row.jkb?.strengthOfSchedule} maxRank={positionHeat.sosMax} className={CELL_PAD} displayText={positionPrefixedRank(canonicalPosition, row.jkb?.strengthOfSchedule)} />
      <GradientRankCell value={row.seasonPointsRank2025} maxRank={positionHeat.seasonPointsRankMax} className={CELL_PAD} displayText={positionPrefixedRank(canonicalPosition, row.seasonPointsRank2025)} />
      <GradientRankCell value={row.seasonPpgRank2025} maxRank={positionHeat.seasonPpgRankMax} className={CELL_PAD} displayText={positionPrefixedRank(canonicalPosition, row.seasonPpgRank2025)} />
      <GradientRankCell value={row.lastEightPointsRank} maxRank={positionHeat.lastEightPointsRankMax} className={CELL_PAD} displayText={positionPrefixedRank(canonicalPosition, row.lastEightPointsRank)} />
      {canonicalPosition ? (
        <>
          <MatchupOpponentCell opponent={row.jkb?.playoffWeek15Opponent} position={canonicalPosition} className={CELL_PAD} />
          <MatchupOpponentCell opponent={row.jkb?.playoffWeek16Opponent} position={canonicalPosition} className={CELL_PAD} />
          <MatchupOpponentCell opponent={row.jkb?.playoffWeek17Opponent} position={canonicalPosition} className={CELL_PAD} />
        </>
      ) : (
        <>
          <NotAvailableCell />
          <NotAvailableCell />
          <NotAvailableCell />
        </>
      )}
    </tr>
  );
}

/** Compact add/remove control living directly beside the player's identity, so it never requires horizontal scrolling to reach on mobile. */
function AddRemoveButton({
  row,
  selected,
  disabled,
  onToggleTeam,
}: {
  row: DraftPreviewRow;
  selected: boolean;
  disabled: boolean;
  onToggleTeam: (row: DraftPreviewRow) => void;
}) {
  const label = selected ? `Remove ${row.player} from team` : `Add ${row.player} to team`;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={!selected && disabled}
      onClick={() => onToggleTeam(row)}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border",
        selected
          ? "border-rose-300 bg-rose-50 text-rose-700 hover:border-rose-400 hover:bg-rose-100"
          : "border-slate-300 bg-white text-slate-600 hover:border-sky-500 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40",
      )}
    >
      {selected ? <Minus className="h-3.5 w-3.5" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
    </button>
  );
}

/** Compact target-star control: opens a checklist popover of every supported round so a player can be saved to one or more rounds' personal target lists. */
function TargetButton({
  row,
  targetRounds,
  onToggleRound,
}: {
  row: DraftPreviewRow;
  targetRounds: readonly number[];
  onToggleRound: (sleeperRank: number, round: number) => void;
}) {
  const isTargeted = targetRounds.length > 0;
  const label = isTargeted ? `Edit ${row.player}'s round targets` : `Target ${row.player} for a round`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className={cn(
            "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border",
            isTargeted
              ? "border-amber-400 bg-amber-50 text-amber-600"
              : "border-slate-300 bg-white text-slate-400 hover:border-amber-400 hover:text-amber-500",
          )}
        >
          <Star className="h-3.5 w-3.5" aria-hidden fill={isTargeted ? "currentColor" : "none"} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-2">
        <div className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Target {row.player} for round
        </div>
        <div className="max-h-64 overflow-y-auto">
          {ROUND_OPTIONS.map((round) => (
            <label key={round} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs text-slate-700 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={targetRounds.includes(round)}
                onChange={() => onToggleRound(row.sleeperRank, round)}
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              Round {round}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function StatCell({ value }: { value: string }) {
  return (
    <td
      className={cn(
        FANTASY_TABLE_BODY_CELL,
        CELL_PAD,
        "text-center font-semibold tabular-nums text-slate-700",
        (value === "N/A" || value === "—") && "text-slate-400",
      )}
    >
      {value}
    </td>
  );
}

/** Raw-value heat cell (Sleeper PPG / JKB Proj PPG): keeps the real number on screen, coloured by its rank within the canonical board-wide scale. */
function HeatValueCell({
  value,
  text,
  rank,
  poolSize,
}: {
  value: number | undefined;
  text: string;
  rank: number | undefined;
  poolSize: number;
}) {
  const background = value != null && rank != null ? getRankGradientColor(rank, poolSize) : undefined;
  return (
    <td
      style={background ? { backgroundColor: background } : undefined}
      className={cn(
        FANTASY_TABLE_BODY_CELL,
        CELL_PAD,
        "text-center font-semibold tabular-nums text-slate-800",
        !background && "text-slate-400",
      )}
    >
      {text}
    </td>
  );
}

function NotAvailable() {
  return <span className="text-[9px] font-semibold text-slate-400 sm:text-[10px]">N/A</span>;
}

function NotAvailableCell() {
  return (
    <td className={cn(FANTASY_TABLE_BODY_CELL, CELL_PAD, "text-center")}>
      <NotAvailable />
    </td>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="px-4 py-12 text-center text-sm font-semibold text-slate-700">
      {query ? `No players match "${query}"` : "No players match this filter"}
    </div>
  );
}

/**
 * BY ROUND view: the personal manual target board. Round chips (with
 * saved-target counts) select which round's list is shown; the list itself
 * is purely `getTargetsForRound` in its saved manual order -- never
 * constrained by Sleeper Rank or availability.
 */
function ByRoundView({
  selectedRound,
  onSelectRound,
  targetCountsByRound,
  targetedRanks,
  myDraft,
  canAddToTeam,
  onToggleTeam,
  onRemoveTarget,
  onMoveUp,
  onMoveDown,
}: {
  selectedRound: number;
  onSelectRound: (round: number) => void;
  targetCountsByRound: ReadonlyMap<number, number>;
  targetedRanks: readonly number[];
  myDraft: MyDraftState;
  canAddToTeam: boolean;
  onToggleTeam: (row: DraftPreviewRow) => void;
  onRemoveTarget: (round: number, sleeperRank: number) => void;
  onMoveUp: (round: number, sleeperRank: number) => void;
  onMoveDown: (round: number, sleeperRank: number) => void;
}) {
  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto border-b border-slate-200 bg-slate-50 px-4 py-2 sm:px-5" role="tablist" aria-label="Target round">
        {ROUND_OPTIONS.map((round) => {
          const count = targetCountsByRound.get(round) ?? 0;
          const active = round === selectedRound;
          return (
            <button
              key={round}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelectRound(round)}
              className={cn(
                "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold tabular-nums",
                active ? "border-sky-500 bg-sky-50 text-sky-700" : "border-slate-300 bg-white text-slate-600 hover:border-slate-400",
              )}
            >
              R{round}
              {count > 0 && ` (${count})`}
            </button>
          );
        })}
      </div>

      {targetedRanks.length === 0 ? (
        <div className="px-4 py-10 text-center text-xs font-semibold text-slate-500 sm:px-5">
          No saved targets for Round {selectedRound} yet.
        </div>
      ) : (
        <ul>
          {targetedRanks.map((sleeperRank, index) => {
            const row = DRAFT_PREVIEW_ROW_BY_RANK.get(sleeperRank);
            if (!row) return null;
            return (
              <TargetCard
                key={sleeperRank}
                index={index}
                row={row}
                round={selectedRound}
                isLast={index === targetedRanks.length - 1}
                selected={isPlayerDrafted(myDraft, row.sleeperRank)}
                canAddToTeam={canAddToTeam}
                onToggleTeam={onToggleTeam}
                onRemoveTarget={onRemoveTarget}
                onMoveUp={onMoveUp}
                onMoveDown={onMoveDown}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TargetCard({
  index,
  row,
  round,
  isLast,
  selected,
  canAddToTeam,
  onToggleTeam,
  onRemoveTarget,
  onMoveUp,
  onMoveDown,
}: {
  index: number;
  row: DraftPreviewRow;
  round: number;
  isLast: boolean;
  selected: boolean;
  canAddToTeam: boolean;
  onToggleTeam: (row: DraftPreviewRow) => void;
  onRemoveTarget: (round: number, sleeperRank: number) => void;
  onMoveUp: (round: number, sleeperRank: number) => void;
  onMoveDown: (round: number, sleeperRank: number) => void;
}) {
  return (
    <li className={cn("border-b border-slate-100 px-4 py-2.5 sm:px-5", selected && "bg-emerald-50/60")}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[10px] font-black tabular-nums text-slate-400">{index + 1}.</span>
          <FantasyPlayerIdentity player={row.player} team={row.displayTeam ?? undefined} compact />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ReorderButton
            direction="up"
            disabled={index === 0}
            label={`Move ${row.player} up in Round ${round} targets`}
            onClick={() => onMoveUp(round, row.sleeperRank)}
          />
          <ReorderButton
            direction="down"
            disabled={isLast}
            label={`Move ${row.player} down in Round ${round} targets`}
            onClick={() => onMoveDown(round, row.sleeperRank)}
          />
          <AddRemoveButton row={row} selected={selected} disabled={!selected && !canAddToTeam} onToggleTeam={onToggleTeam} />
          <button
            type="button"
            aria-label={`Remove ${row.player} from Round ${round} targets`}
            title={`Remove ${row.player} from Round ${round} targets`}
            onClick={() => onRemoveTarget(round, row.sleeperRank)}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-slate-300 bg-white text-slate-500 hover:border-rose-400 hover:text-rose-600"
          >
            <Star className="h-3.5 w-3.5" aria-hidden fill="currentColor" />
          </button>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-600 sm:text-[11px]">
        <StatChip label="Pos" value={row.rosterPosition ?? "N/A"} />
        <StatChip label="Slp Rk" value={String(row.sleeperRank)} />
        <StatChip label="Slp PPG" value={row.sleeperProjectedPpg.toFixed(1)} />
        <StatChip label="JKB PPG" value={row.jkbProjectedPpg != null ? row.jkbProjectedPpg.toFixed(1) : "N/A"} />
        <StatChip label="PAR/G" value={row.jkbParPerGame != null ? formatSigned(row.jkbParPerGame, 2) : "N/A"} />
        <StatChip label="Model Rk" value={row.modelRank != null ? String(row.modelRank) : "N/A"} />
      </div>
    </li>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 tabular-nums">
      <span className="font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="font-bold text-slate-700">{value}</span>
    </span>
  );
}

function ReorderButton({
  direction,
  disabled,
  label,
  onClick,
}: {
  direction: "up" | "down";
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  const Icon = direction === "up" ? ChevronUp : ChevronDown;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-30"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

const STARTING_SLOT_LABELS: Record<RosterSlotId, string> = {
  QB: "QB",
  RB1: "RB1",
  RB2: "RB2",
  WR1: "WR1",
  WR2: "WR2",
  FLEX1: "FLEX1",
  FLEX2: "FLEX2",
  K: "K",
  DST: "DST",
  BENCH1: "Bench 1",
  BENCH2: "Bench 2",
  BENCH3: "Bench 3",
  BENCH4: "Bench 4",
  BENCH5: "Bench 5",
  BENCH6: "Bench 6",
  BENCH7: "Bench 7",
};

/**
 * Sticky "My Draft" sidebar: Starting Roster (explicit 16-slot lineup),
 * totals, and the full drafted-player list. Stays pinned in view while the
 * board scrolls on desktop; stacks under the board on mobile/tablet widths.
 * Visible in both the BOARD and BY ROUND views.
 */
function MyDraftSidebar({
  draftSlot,
  myDraft,
  onRemove,
  onReset,
}: {
  draftSlot: number;
  myDraft: MyDraftState;
  onRemove: (round: number) => void;
  onReset: () => void;
}) {
  const totals = useMemo(() => computeMyDraftTotals(myDraft), [myDraft]);
  const roster = useMemo(() => computeStartingRoster(myDraft), [myDraft]);
  const startingTotals = useMemo(() => computeStartingRosterTotals(roster), [roster]);
  const draftedEntries = useMemo(
    () =>
      [...myDraft.entries()]
        .sort(([roundA], [roundB]) => roundA - roundB)
        .map(([round, row]) => ({ round, row, overallPick: computeSnakeOverallPick(round, draftSlot) })),
    [myDraft, draftSlot],
  );

  return (
    <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
      <section aria-labelledby="my-draft-title" className={FANTASY_TABLE_SHELL}>
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-950 px-4 py-4 text-white">
          <div>
            <h2 id="my-draft-title" className="text-base font-bold tracking-tight">
              My draft
            </h2>
            <p className="mt-1 text-[11px] leading-4 text-slate-300">Manual only — add players from the board.</p>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="shrink-0 rounded border border-slate-600 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-200 hover:border-rose-400 hover:text-rose-300"
          >
            Clear
          </button>
        </div>

        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Starting lineup totals</div>
          <p className="mt-0.5 text-[10px] leading-4 text-slate-400">1 QB • 2 RB • 2 WR • 2 FLEX • K • DST (best JKB Proj PPG)</p>
          <div className="mt-2 grid grid-cols-2 gap-px bg-slate-200">
            <TotalCard
              label="Starting Proj PPG"
              value={startingTotals.startingLineupProjectedPpg != null ? startingTotals.startingLineupProjectedPpg.toFixed(1) : "N/A"}
            />
            <TotalCard
              label="Starting Total PAR"
              value={startingTotals.startingLineupTotalPar != null ? formatSigned(startingTotals.startingLineupTotalPar, 1) : "N/A"}
            />
          </div>
        </div>

        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Entire team totals</div>
          <div className="mt-2 grid grid-cols-3 gap-px bg-slate-200">
            <TotalCard label="Players" value={String(totals.playersDrafted)} />
            <TotalCard label="QB" value={String(totals.countsByPosition.QB)} />
            <TotalCard label="RB" value={String(totals.countsByPosition.RB)} />
            <TotalCard label="WR" value={String(totals.countsByPosition.WR)} />
            <TotalCard label="TE" value={String(totals.countsByPosition.TE)} />
            <TotalCard label="Team PPG" value={totals.totalJkbProjectedPpg != null ? totals.totalJkbProjectedPpg.toFixed(1) : "N/A"} />
          </div>
          <div className="mt-px grid grid-cols-1 gap-px bg-slate-200">
            <TotalCard label="Total Team PAR" value={totals.totalJkbParPerGame != null ? formatSigned(totals.totalJkbParPerGame, 1) : "N/A"} />
          </div>
        </div>

        <StartingRosterTable roster={roster} />

        <div className="border-t border-slate-200 bg-slate-50 px-4 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">All drafted players</div>
        </div>

        {draftedEntries.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs font-semibold text-slate-500">
            No players drafted yet. Use Add to team on the board.
          </div>
        ) : (
          <DenseTableScroller label="My draft roster" className="max-h-[45vh]">
            <table className="w-full min-w-[420px] border-collapse text-left text-[11px]">
              <thead className={stickyDenseHeader("bg-slate-100 text-[9px] font-semibold uppercase tracking-wider text-slate-600")}>
                <tr className={DENSE_TABLE_HEAD_ROW}>
                  <th className={cn(FANTASY_TABLE_HEADER_CELL, "px-2 py-1.5 text-center")}>Rd</th>
                  <th className={cn(FANTASY_TABLE_HEADER_CELL, "px-2 py-1.5")}>Player</th>
                  <th className={cn(FANTASY_TABLE_HEADER_CELL, "px-2 py-1.5 text-center")}>Pos</th>
                  <th className={cn(FANTASY_TABLE_HEADER_CELL, "px-2 py-1.5 text-center")}>Slp Rk</th>
                  <th className={cn(FANTASY_TABLE_HEADER_CELL, "px-2 py-1.5 text-center")}>PPG</th>
                  <th className={cn(FANTASY_TABLE_HEADER_CELL, "px-2 py-1.5 text-center")}>PAR/G</th>
                  <th className={cn(FANTASY_TABLE_HEADER_CELL, "px-2 py-1.5 text-center")}>Remove</th>
                </tr>
              </thead>
              <tbody>
                {draftedEntries.map(({ round, row, overallPick }) => (
                  <tr key={round} className={DENSE_TABLE_ROW}>
                    <td className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1.5 text-center")}>
                      <div className="font-bold tabular-nums text-slate-800">R{round}</div>
                      <div className="text-[9px] tabular-nums text-slate-400">#{overallPick}</div>
                    </td>
                    <td className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1.5 font-semibold text-slate-800")}>{row.player}</td>
                    <td className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1.5 text-center")}>{row.rosterPosition ?? <NotAvailable />}</td>
                    <td className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1.5 text-center tabular-nums")}>{row.sleeperRank}</td>
                    <td className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1.5 text-center tabular-nums")}>{row.jkbProjectedPpg != null ? row.jkbProjectedPpg.toFixed(1) : "N/A"}</td>
                    <td className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1.5 text-center tabular-nums")}>{row.jkbParPerGame != null ? formatSigned(row.jkbParPerGame, 2) : "N/A"}</td>
                    <td className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1.5 text-center")}>
                      <button
                        type="button"
                        onClick={() => onRemove(round)}
                        className="rounded border border-slate-300 px-1.5 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-600 hover:border-rose-400 hover:text-rose-600"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DenseTableScroller>
        )}
      </section>
    </aside>
  );
}

/**
 * Explicit 16-slot Starting Roster: QB, RB1/RB2, WR1/WR2, FLEX1/FLEX2, K,
 * DST, then BENCH1-7. Every row comes straight from `computeStartingRoster`
 * -- this component only formats slot assignments it does not compute.
 */
function StartingRosterTable({ roster }: { roster: readonly RosterSlotAssignment[] }) {
  return (
    <div className="border-t border-slate-200">
      <div className="bg-slate-50 px-4 py-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Starting roster</div>
      </div>
      <DenseTableScroller label="Starting roster" className="max-h-[50vh]">
        <table className="w-full min-w-[420px] border-collapse text-left text-[11px]">
          <thead className={stickyDenseHeader("bg-slate-100 text-[9px] font-semibold uppercase tracking-wider text-slate-600")}>
            <tr className={DENSE_TABLE_HEAD_ROW}>
              <th className={cn(FANTASY_TABLE_HEADER_CELL, "px-2 py-1.5 text-center")}>Slot</th>
              <th className={cn(FANTASY_TABLE_HEADER_CELL, "px-2 py-1.5")}>Player</th>
              <th className={cn(FANTASY_TABLE_HEADER_CELL, "px-2 py-1.5 text-center")}>Pos</th>
              <th className={cn(FANTASY_TABLE_HEADER_CELL, "px-2 py-1.5 text-center")}>PPG</th>
              <th className={cn(FANTASY_TABLE_HEADER_CELL, "px-2 py-1.5 text-center")}>PAR/G</th>
            </tr>
          </thead>
          <tbody>
            {roster.map(({ slot, row }) => (
              <tr key={slot} className={cn(DENSE_TABLE_ROW, slot.startsWith("BENCH") && "bg-slate-50/60")}>
                <td className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1.5 text-center font-bold tabular-nums text-slate-800")}>
                  {STARTING_SLOT_LABELS[slot]}
                </td>
                <td className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1.5 font-semibold text-slate-800")}>
                  {row ? row.player : <span className="text-slate-300">—</span>}
                </td>
                <td className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1.5 text-center")}>
                  {row ? (row.rosterPosition ?? <NotAvailable />) : <span className="text-slate-300">—</span>}
                </td>
                <td className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1.5 text-center tabular-nums")}>
                  {row ? (row.jkbProjectedPpg != null ? row.jkbProjectedPpg.toFixed(1) : "N/A") : "—"}
                </td>
                <td className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1.5 text-center tabular-nums")}>
                  {row ? (row.jkbParPerGame != null ? formatSigned(row.jkbParPerGame, 2) : "N/A") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DenseTableScroller>
    </div>
  );
}

function TotalCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white p-2.5" data-testid={`my-draft-total-${label}`}>
      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 text-base font-black tabular-nums text-slate-900">{value}</div>
    </div>
  );
}

const GLOSSARY_ENTRIES: ReadonlyArray<readonly [string, string]> = [
  ["SLEEPER RK", "Rank/order from the supplied Sleeper draft-board snapshot. Fixed source data — never reordered by this page."],
  ["SLEEPER PROJ", "Sleeper projected season fantasy points, from the supplied draft-board snapshot."],
  ["SLEEPER PPG", "Sleeper projected fantasy points per game, from the supplied draft-board snapshot."],
  ["JKB PROJ PPG", "Existing Joe Knows Ball projection authority (approved PAR consensus). Not generated by Sleeper."],
  ["JKB PAR/G", "Existing approved projected Points Above Replacement per game."],
  ["MODEL RK", "Existing corrected F2 ROS research rank — an authority independent of both Sleeper and JKB Rank."],
  ["POS RK", "Existing canonical JKB rank within the player's position."],
  ["TEAM / POS (DISPLAY)", "Player identity, team and position are shown using the audited canonical 2026 nflverse roster where a correction was confirmed (see the identity audit report); Sleeper's own Rank and projections are never altered."],
  ["TARGET (★)", "A personal manual watchlist you save yourself, by round -- not a calculated recommendation. Saved locally in this browser only."],
] as const;

function DraftPreviewGlossary() {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  return (
    <section aria-label="Draft preview provenance key" className="border-b border-slate-200 bg-white">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((value) => !value)}
        className="flex min-h-10 w-full items-center justify-between gap-3 px-4 py-2 text-left text-xs font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 sm:px-5"
      >
        <span>Sleeper vs. JKB — what each column means</span>
        <ChevronDown aria-hidden className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
      </button>
      <div id={contentId} hidden={!expanded} className="border-t border-slate-200 px-4 py-3 sm:px-5">
        <dl className="grid gap-x-6 gap-y-2 text-[11px] leading-4 text-slate-600 md:grid-cols-2">
          {GLOSSARY_ENTRIES.map(([term, meaning]) => (
            <div key={term} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2">
              <dt className="font-black text-slate-900">{term}</dt>
              <dd>{meaning}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 border-t border-slate-200 pt-3 text-[10px] text-slate-500">
          Sleeper Rank and Sleeper projections come from the supplied Sleeper draft-room snapshot — they are not
          generated or modified by Joe Knows Ball. JKB Proj, JKB PAR/G and Model Rk are separate, existing JKB
          authorities shown for comparison only.
        </p>
      </div>
    </section>
  );
}
