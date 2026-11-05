import { useCallback, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { LowSample } from "@/components/nba/boardCells";
import { MARKET_LABEL } from "@/components/nba/boardLabels";
import { Chip, fieldClass } from "@/components/nba/Chip";
import ColumnsMenu from "@/components/nba/ColumnsMenu";
import PropsBoardTable from "@/components/nba/PropsBoardTable";
import { useIsWide } from "@/components/nba/useIsWide";
import { COLUMN_DEFS } from "@/components/nba/boardColumnDefs";
import { browserStorage, clearColumnPreference, defaultSelection, loadColumnPreference, saveColumnPreference, visibleColumns, withColumn, withFixedColumns, type ColumnId } from "@/lib/nba/props/boardColumns";
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
  tierFilterOptions,
  type BoardFilters,
  type BoardMarket,
  type BoardSortKey,
  type PropsBoardArtifact,
  type SortDirection,
} from "@/lib/nba/props/propsBoard";

const TEXT_SORT_KEYS: readonly BoardSortKey[] = ["player", "team", "dvpRank"];
/** A board with season statistics opens on Core props in research order; one without them has no minutes to tier by and lists everyone. */
const hasSeasonStats = (board: PropsBoardArtifact): boolean => board.entries.some((e) => e.seasonStats !== undefined);
/** Without a posted line there is no edge to sort by, and most boards have none: start from the model's own projection. */
const DEFAULT_SORT: BoardSortKey = "projection";

/**
 * The sort actually applied. Sorting by a column that is not shown would order rows by something invisible, so then the
 * projection (or the first shown sortable column, or the player name) takes over. The stored sort is left alone: showing
 * the column again brings it back.
 */
function resolveSort(key: BoardSortKey, direction: SortDirection, shown: readonly ColumnId[], researchChosen: boolean): { key: BoardSortKey; direction: SortDirection } {
  // The Research order button is an explicit choice, so it stands even when the Tier column is hidden; the opening default still follows the columns.
  if (key === "research" && researchChosen) return { key, direction };
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
  const [filters, setFilters] = useState<BoardFilters>(() => ({ ...DEFAULT_FILTERS, tier: hasSeasonStats(board) ? "core" : "all" }));
  const [sortKey, setSortKey] = useState<BoardSortKey>(() => (hasSeasonStats(board) ? "research" : DEFAULT_SORT));
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [researchChosen, setResearchChosen] = useState(false);
  const [drafts, setDrafts] = useState<MinutesDrafts>(clearAllDrafts);
  // Only the list of column ids is ever remembered (see boardColumns.ts); nothing about a player or a projection is stored.
  const [selected, setSelected] = useState<ReadonlySet<ColumnId>>(() => withFixedColumns(loadColumnPreference(browserStorage) ?? defaultSelection()));
  const teams = useMemo(() => boardTeams(board), [board]);
  const applied = useMemo(() => appliedMinutes(drafts), [drafts]);
  const showSeason = useMemo(() => hasSeasonStats(board), [board]);
  const columns = useMemo(() => visibleColumns(selected, showSeason), [selected, showSeason]);
  const isWide = useIsWide();
  const sort = useMemo(() => resolveSort(sortKey, direction, columns, researchChosen), [sortKey, direction, columns, researchChosen]);
  const marketRows = useMemo(() => buildBoardRows(board, market, applied), [board, market, applied]);
  const tierOptions = useMemo(() => tierFilterOptions(marketRows), [marketRows]);
  // A board without season statistics has no tiers (and no tier controls), so a tier chosen on an earlier board must not hide its rows.
  const activeFilters = useMemo(() => (showSeason ? filters : { ...filters, tier: "all" as const }), [filters, showSeason]);
  const rows = useMemo(() => sortBoardRows(filterBoardRows(marketRows, activeFilters), sort.key, sort.direction), [marketRows, activeFilters, sort]);
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
    setResearchChosen(false);
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
      {showSeason ? (
        <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Research tier" data-testid="tier-filter">
          {tierOptions.map((option) => (
            <Chip key={option.value} active={filters.tier === option.value} onClick={() => patch({ tier: option.value })}>
              {option.label} <span className="font-normal opacity-80">({option.count})</span>
            </Chip>
          ))}
          <button
            type="button"
            data-testid="research-order"
            aria-pressed={sort.key === "research"}
            onClick={() => {
              setSortKey("research");
              setDirection("desc");
              setResearchChosen(true);
            }}
            className={cn("rounded border px-2.5 py-1 text-[11px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500", sort.key === "research" ? "border-slate-900 bg-slate-100 text-slate-900" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50")}
            title="Core, then Rotation, then Variable; within a tier the largest gap between the JKB projection and the line first. An ordering aid, not an edge estimate."
          >
            Research order
          </button>
        </div>
      ) : null}
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
      {showSeason && rows.length === 0 && filters.tier !== "all" ? (
        <p className="mb-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-700" data-testid="tier-empty">
          No {filters.tier === "core" ? "Core" : "Rotation"} players match these filters for this market.{" "}
          <button type="button" className="font-semibold text-sky-800 underline" onClick={() => patch({ tier: "all" })}>
            Show all players
          </button>
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
          <p data-testid="tier-note">
            <strong className="font-semibold text-slate-800">Tier</strong> ranks attention by role, using this season's minutes before the game: <strong className="font-semibold text-slate-800">Core</strong> is 25+ MPG with at least 4 of the last 5 games within ±20% of the five-game median minutes and no open flag, <strong className="font-semibold text-slate-800">Rotation</strong> is 20+ MPG (including a 25+ MPG player whose minutes or role just changed), and <strong className="font-semibold text-slate-800">Variable</strong> is under 20 MPG or fewer than 5 games. A ⚑ marks a flag (low sample, unsteady minutes, role or team change, return from absence, missed team games); open a row for the reasons. Last season is never used to rate a player. Tiers and <strong className="font-semibold text-slate-800">Min stable</strong> are context: they change no projection, and your own minutes still work on every row. <strong className="font-semibold text-slate-800">Research order</strong> lists Core first, then the largest gap between the JKB projection and the line; it is not an edge estimate.
          </p>
        ) : null}
        {showSeason ? (
          <p>
            MPG, per-game and per-minute figures are this season to date. <strong className="font-semibold text-slate-800">L10</strong> is the average over the player's last ten completed games this season (L5, the last five, is an optional column), all strictly before this game, with did-not-play and zero-minute games left out; early in the season the window is shorter and says so. <strong className="font-semibold text-slate-800">Opp L10</strong> is what the opponent allowed per game as a team (the official score for points; rebounds and assists summed from the listed players over a complete box score) in its own last ten completed games: ten opponent games, never ten player-games, and never a position or a single opposing player. <strong className="font-semibold text-slate-800">Opp DEF RTG</strong> is the opponent's points allowed per 100 estimated possessions before this game (lower is stronger). Open a row for both ten-game charts (oldest to newest; hover, focus or tap a bar for the exact game), the sample size and the full opposing box scores, with the opposing starter at the player's position as optional detail. A small amber dot marks a small sample (under 15 games, or fewer games than the window). Last season is shown on its own and never blended into this season. A player with no games yet shows a dash, not a guess. These figures are context: they do not change the JKB projection.
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
