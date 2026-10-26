import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { MARKET_LABEL } from "@/components/nba/boardLabels";
import { Chip, fieldClass } from "@/components/nba/Chip";
import PropsBoardTable from "@/components/nba/PropsBoardTable";
import { DVP_POSITIONS, type DvpPosition } from "@/lib/nba/props/dvp";
import { appliedMinutes, clearAllDrafts, clearDraft, setDraft, type MinutesDrafts } from "@/lib/nba/props/minutesOverride";
import {
  BOARD_MARKETS,
  DEFAULT_FILTERS,
  boardTeams,
  buildBoardRows,
  filterBoardRows,
  sortBoardRows,
  type BoardFilters,
  type BoardMarket,
  type BoardSortKey,
  type PropsBoardArtifact,
  type SortDirection,
} from "@/lib/nba/props/propsBoard";

const TEXT_SORT_KEYS: readonly BoardSortKey[] = ["player", "team", "dvpRank"];

/**
 * The props table with its controls. Minutes overrides live in this component's state only: they are never written to
 * storage, to the server or to the board, and reloading the page clears them. They are keyed by player and game, so an
 * override follows the player when the market changes.
 */
export default function PropsBoardView({ board }: { board: PropsBoardArtifact }) {
  const [market, setMarket] = useState<BoardMarket>("pts");
  const [filters, setFilters] = useState<BoardFilters>(DEFAULT_FILTERS);
  const [sortKey, setSortKey] = useState<BoardSortKey>("difference");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [drafts, setDrafts] = useState<MinutesDrafts>(clearAllDrafts);
  const teams = useMemo(() => boardTeams(board), [board]);
  const applied = useMemo(() => appliedMinutes(drafts), [drafts]);
  const showSeason = useMemo(() => board.entries.some((e) => e.seasonStats !== undefined), [board]);
  const rows = useMemo(() => sortBoardRows(filterBoardRows(buildBoardRows(board, market, applied), filters), sortKey, direction), [board, market, applied, filters, sortKey, direction]);
  const draftCount = Object.keys(drafts).length;
  const onSort = (key: BoardSortKey) => {
    if (key === sortKey) setDirection((d) => (d === "asc" ? "desc" : "asc"));
    else {
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
        <button
          type="button"
          data-testid="reset-all-minutes"
          onClick={() => {
            if (draftCount > 0) setDrafts(clearAllDrafts());
          }}
          aria-disabled={draftCount === 0}
          className={cn("ml-auto rounded border border-slate-300 bg-white px-2.5 py-1 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500", draftCount === 0 && "cursor-not-allowed opacity-40")}
        >
          Reset all minutes{draftCount > 0 ? ` (${draftCount})` : ""}
        </button>
      </div>
      <PropsBoardTable
        rows={rows}
        sortKey={sortKey}
        direction={direction}
        onSort={onSort}
        market={market}
        marketLabel={MARKET_LABEL[market]}
        drafts={drafts}
        onDraftChange={(key, text) => setDrafts((current) => setDraft(current, key, text))}
        onReset={(key) => setDrafts((current) => clearDraft(current, key))}
        showSeason={showSeason}
      />
      <div className="mt-2 space-y-1.5 text-[11px] text-slate-500">
        <p>
          <strong className="font-semibold text-slate-700">JKB proj</strong> and <strong className="font-semibold text-slate-700">JKB − line</strong> are the model's own and never change. Type minutes in <strong className="font-semibold text-slate-700">Your min</strong> (0–48, one decimal) to see two separate estimates:{" "}
          <strong className="font-semibold text-indigo-900">Adj proj</strong> is the JKB projection × your minutes ÷ the JKB minutes (the model's rate at your minutes), and <strong className="font-semibold text-amber-900">Season-rate est</strong> is your minutes × this season's stat per minute (no model involved). Both are compared with the line. Your minutes stay in this page only: they are not saved, shared or sent anywhere, and reloading clears them.
        </p>
        {showSeason ? (
          <p>
            Season figures cover completed games before the matchup, with did-not-play and zero-minute appearances excluded; the sample column names the season and the number of games. Early in a season, last season is shown beside this season in small type, separately and never blended. A player with no games this season yet shows a dash, not a guess.
          </p>
        ) : null}
        <p>
          Proj − line is the JKB projection minus the posted line; positive leans Over. N/A means the input is missing (hover for the reason), not zero. Positions are estimates from depth charts and rotation roles, not verified minutes at a position. DvP is the estimated primary-position view (each player's box score counts toward one estimated position, not minutes played at it); the matchup label reads the blended rank and says how much of it is last season. A projection is shown even when a line or DvP is missing. DvP is context only and does not change the projection.
        </p>
      </div>
    </>
  );
}
