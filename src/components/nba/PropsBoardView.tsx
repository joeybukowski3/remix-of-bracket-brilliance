import { useCallback, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { LowSample } from "@/components/nba/boardCells";
import { MARKET_LABEL } from "@/components/nba/boardLabels";
import { Chip, fieldClass } from "@/components/nba/Chip";
import ColumnsMenu from "@/components/nba/ColumnsMenu";
import PropsBoardTable from "@/components/nba/PropsBoardTable";
import { useIsWide } from "@/components/nba/useIsWide";
import { COLUMN_DEFS } from "@/components/nba/boardColumnDefs";
import { browserStorage, clearColumnPreference, defaultSelection, loadColumnPreference, saveColumnPreference, visibleColumns, withColumn, type ColumnId } from "@/lib/nba/props/boardColumns";
import { DVP_POSITIONS, PRIOR_LED_BELOW_GAMES, type DvpPosition } from "@/lib/nba/props/dvp";
import { appliedMinutes, clearAllDrafts, clearDraft, setDraft, type MinutesDrafts } from "@/lib/nba/props/minutesOverride";
import {
  BOARD_MARKETS,
  DEFAULT_FILTERS,
  boardTeams,
  buildBoardRows,
  dvpCurrentSampleRange,
  dvpPositionCoverage,
  filterBoardRows,
  sortBoardRows,
  type BoardFilters,
  type BoardMarket,
  type BoardSortKey,
  type PropsBoardArtifact,
  type SortDirection,
} from "@/lib/nba/props/propsBoard";

const TEXT_SORT_KEYS: readonly BoardSortKey[] = ["player", "team", "dvpRank"];
/** Without a posted line there is no edge to sort by, and most boards have none: start from the model's own projection. */
const DEFAULT_SORT: BoardSortKey = "projection";

/**
 * The sort actually applied. Sorting by a column that is not shown would order rows by something invisible, so then the
 * projection (or the first shown sortable column, or the player name) takes over. The stored sort is left alone: showing
 * the column again brings it back.
 */
function resolveSort(key: BoardSortKey, direction: SortDirection, shown: readonly ColumnId[]): { key: BoardSortKey; direction: SortDirection } {
  const owner = Object.values(COLUMN_DEFS).find((def) => def.sortKey === key);
  if (!owner || shown.includes(owner.id)) return { key, direction };
  const fallback = shown.includes("jkbProjection") ? DEFAULT_SORT : shown.map((id) => COLUMN_DEFS[id].sortKey).find((k) => k !== undefined) ?? "player";
  return { key: fallback, direction: TEXT_SORT_KEYS.includes(fallback) ? "asc" : "desc" };
}

/**
 * The props table with its controls. Minutes overrides live in this component's state only: they are never written to
 * storage, to the server or to the board, and reloading the page clears them. They are keyed by player and game, so an
 * override follows the player when the market changes.
 */
export default function PropsBoardView({ board }: { board: PropsBoardArtifact }) {
  const [market, setMarket] = useState<BoardMarket>("pts");
  const [filters, setFilters] = useState<BoardFilters>(DEFAULT_FILTERS);
  const [sortKey, setSortKey] = useState<BoardSortKey>(DEFAULT_SORT);
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [drafts, setDrafts] = useState<MinutesDrafts>(clearAllDrafts);
  // Only the list of column ids is ever remembered (see boardColumns.ts); nothing about a player or a projection is stored.
  const [selected, setSelected] = useState<ReadonlySet<ColumnId>>(() => loadColumnPreference(browserStorage) ?? defaultSelection());
  const teams = useMemo(() => boardTeams(board), [board]);
  const applied = useMemo(() => appliedMinutes(drafts), [drafts]);
  const showSeason = useMemo(() => board.entries.some((e) => e.seasonStats !== undefined), [board]);
  const columns = useMemo(() => visibleColumns(selected, showSeason), [selected, showSeason]);
  const isWide = useIsWide();
  const sort = useMemo(() => resolveSort(sortKey, direction, columns), [sortKey, direction, columns]);
  const rows = useMemo(() => sortBoardRows(filterBoardRows(buildBoardRows(board, market, applied), filters), sort.key, sort.direction), [board, market, applied, filters, sort]);
  const draftCount = Object.keys(drafts).length;
  const coverage = useMemo(() => dvpPositionCoverage(board.dvpRows), [board]);
  const dvpSample = useMemo(() => dvpCurrentSampleRange(board.dvpRows), [board]);
  const dvpPriorLed = dvpSample !== null && dvpSample.max < PRIOR_LED_BELOW_GAMES;
  const onToggleColumn = useCallback(
    (id: ColumnId, on: boolean) => {
      const next = withColumn(selected, id, on);
      setSelected(next);
      saveColumnPreference(browserStorage, next);
    },
    [selected],
  );
  const onResetColumns = useCallback(() => {
    setSelected(defaultSelection());
    clearColumnPreference(browserStorage);
  }, []);
  const onSort = (key: BoardSortKey) => {
    if (key === sort.key) {
      setSortKey(sort.key);
      setDirection(sort.direction === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setDirection(TEXT_SORT_KEYS.includes(key) ? "asc" : "desc");
    }
  };
  const patch = (next: Partial<BoardFilters>) => setFilters((current) => ({ ...current, ...next }));
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Market">
        {BOARD_MARKETS.map((m) => (
          <Chip key={m} active={market === m} onClick={() => setMarket(m)}>
            {MARKET_LABEL[m]}
          </Chip>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-end gap-3 text-[11px] text-slate-600">
        <label className="flex flex-col gap-1">
          Player
          <input type="search" value={filters.search} onChange={(e) => patch({ search: e.target.value })} placeholder="Search" className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1">
          Team
          <select value={filters.team ?? ""} onChange={(e) => patch({ team: e.target.value || null })} className={fieldClass}>
            <option value="">All</option>
            {teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Position
          <select value={filters.position ?? ""} onChange={(e) => patch({ position: (e.target.value || null) as DvpPosition | null })} className={fieldClass}>
            <option value="">All</option>
            {DVP_POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 pb-1">
          <input type="checkbox" checked={filters.onlyWithLine} onChange={(e) => patch({ onlyWithLine: e.target.checked })} /> Has line
        </label>
        <label className="flex items-center gap-1.5 pb-1">
          <input type="checkbox" checked={filters.onlyWithProjection} onChange={(e) => patch({ onlyWithProjection: e.target.checked })} /> Has projection
        </label>
        <span className="pb-1" aria-live="polite">
          {rows.length} {rows.length === 1 ? "prop" : "props"}
        </span>
        <div className="ml-auto hidden md:block">
          <ColumnsMenu market={market} selected={selected} hasSeasonStats={showSeason} onToggle={onToggleColumn} onReset={onResetColumns} />
        </div>
        <button
          type="button"
          data-testid="reset-all-minutes"
          onClick={() => {
            if (draftCount > 0) setDrafts(clearAllDrafts());
          }}
          aria-disabled={draftCount === 0}
          className={cn("max-md:ml-auto rounded border border-slate-300 bg-white px-2.5 py-1 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500", draftCount === 0 && "cursor-not-allowed opacity-40")}
        >
          Reset all minutes{draftCount > 0 ? ` (${draftCount})` : ""}
        </button>
      </div>
      {dvpPriorLed && dvpSample ? (
        <p className="mb-2 text-[11px] text-slate-600" data-testid="dvp-sample-note">
          <LowSample why="Small current-season DvP sample" />
          Small sample: this season's DvP rests on {dvpSample.min === dvpSample.max ? `${dvpSample.max}` : `${dvpSample.min}–${dvpSample.max}`} {dvpSample.max === 1 ? "game" : "games"} per team, so Opp allows and Matchup lean mostly on last season.
        </p>
      ) : null}
      <PropsBoardTable
        rows={rows}
        sortKey={sort.key}
        direction={sort.direction}
        onSort={onSort}
        market={market}
        marketLabel={MARKET_LABEL[market]}
        drafts={drafts}
        onDraftChange={(key, text) => setDrafts((current) => setDraft(current, key, text))}
        onReset={(key) => setDrafts((current) => clearDraft(current, key))}
        showSeason={showSeason}
        columns={columns}
        isWide={isWide}
      />
      <div className="mt-2 space-y-1.5 text-[11px] text-slate-600">
        <p>
          <strong className="font-semibold text-slate-800">JKB proj</strong> and <strong className="font-semibold text-slate-800">JKB − line</strong> are the model's own and never change. Open a row (the arrow beside the player) to type your own minutes (0–48, one decimal) and see two separate estimates:{" "}
          <strong className="font-semibold text-indigo-900">Adj proj</strong> is the JKB projection × your minutes ÷ the JKB minutes (the model's rate at your minutes), and <strong className="font-semibold text-teal-900">Season-rate est</strong> is your minutes × this season's stat per minute (no model involved). Both are compared with the line. Your minutes stay in this page only: they are not saved, shared or sent anywhere, and reloading clears them.
        </p>
        {showSeason ? (
          <p>
            MPG, per-game and per-minute figures are this season to date. <strong className="font-semibold text-slate-800">L10</strong> is the average over the player's last ten completed games this season (L5, the last five, is an optional column), all strictly before this game, with did-not-play and zero-minute games left out; early in the season the window is shorter and says so. <strong className="font-semibold text-slate-800">Opp L10</strong> is what the opponent allowed per game to the player's estimated position over the opponent's own last ten completed games, summed one opposing game at a time: ten opponent games, never ten player-games. Open a row for both ten-game charts (oldest to newest; hover, focus or tap a bar for the exact game), the sample size and how much of the opposing minutes had an estimated position. A small amber dot marks a small sample (under 15 games, or fewer games than the window). Last season is shown on its own and never blended into this season. A player with no games yet shows a dash, not a guess. These figures are context: they do not change the JKB projection.
          </p>
        ) : null}
        <p>
          <strong className="font-semibold text-slate-800">Opp allows</strong> (optional column) is the estimated primary-position Defense vs. Position (DvP): what the opponent gives up per game in this stat to players at the player's estimated position, with its rank (1 = allows the most), blended with last season early in the year. Position coverage is incomplete
          {coverage.length > 0 ? ` (${coverage.map((c) => `${Math.round(c.coverage * 100)}% of minutes in ${c.season}`).join(", ")})` : ""}: each player counts toward one estimated position, not the minutes actually played there, and a player with no estimated position shows N/A. <strong className="font-semibold text-slate-800">Matchup</strong> reads that rank: Favorable 1–10, Neutral 11–20, Tough 21–30. DvP is context only and does not change the projection. N/A means the input is missing (hover for the reason), not zero. A projection is shown even when a line or DvP is missing.
        </p>
      </div>
    </>
  );
}
