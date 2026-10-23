import { useEffect, useMemo, useState } from "react";
import SiteShell from "@/components/layout/SiteShell";
import DvpMatrix from "@/components/nba/DvpMatrix";
import { DVP_VIEWS, viewLabel } from "@/components/nba/dvpViews";
import PropsBoardTable from "@/components/nba/PropsBoardTable";
import { usePageSeo } from "@/hooks/usePageSeo";
import { cn } from "@/lib/utils";
import { DVP_POSITIONS, DVP_STATS, type DvpPosition, type DvpStat, type DvpView } from "@/lib/nba/props/dvp";
import {
  BOARD_MARKETS,
  BOARD_SCHEMA_VERSION,
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

const BOARD_URL = `${import.meta.env.BASE_URL}data/nba-props-board.json`;
const DEMO_QUERY = "demo=synthetic";
const MARKET_LABEL: Record<BoardMarket, string> = { pts: "Points", reb: "Rebounds", ast: "Assists" };
type Tab = "board" | "matrix";
type LoadState = { status: "loading" } | { status: "empty"; reason: string } | { status: "ready"; board: PropsBoardArtifact };

const isBoard = (value: unknown): value is PropsBoardArtifact =>
  typeof value === "object" && value !== null && (value as { schemaVersion?: unknown }).schemaVersion === BOARD_SCHEMA_VERSION && Array.isArray((value as PropsBoardArtifact).entries) && Array.isArray((value as PropsBoardArtifact).dvpRows);

async function loadBoard(): Promise<LoadState> {
  // The invented demo board exists only on the dev server; production builds never ship it.
  if (import.meta.env.DEV && window.location.search.includes(DEMO_QUERY)) {
    const { buildDemoBoard } = await import("@/lib/nba/props/__fixtures__/boardDemo");
    return { status: "ready", board: buildDemoBoard() };
  }
  try {
    const response = await fetch(BOARD_URL, { headers: { accept: "application/json" } });
    if (!response.ok) return { status: "empty", reason: "No NBA props board has been published yet." };
    const body: unknown = await response.json();
    return isBoard(body) ? { status: "ready", board: body } : { status: "empty", reason: "The published NBA props board is not in a supported format." };
  } catch {
    // A missing file is served as the app shell (HTML), which fails JSON parsing: same as unpublished.
    return { status: "empty", reason: "No NBA props board has been published yet." };
  }
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("rounded-full border px-3 py-1 text-[12px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500", active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")}
    >
      {children}
    </button>
  );
}

const fieldClass = "rounded border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500";

function Banners({ board }: { board: PropsBoardArtifact }) {
  return (
    <div className="mb-3 space-y-2">
      {board.isSynthetic ? (
        <p role="status" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-900">
          SYNTHETIC DATA — every player, line, projection and DvP figure on this page is invented for interface review. Do not use it for betting decisions.
        </p>
      ) : null}
      {board.privatePreview ? (
        <p role="status" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-900">
          {board.privatePreview.notice} <span className="font-normal">{board.privatePreview.attribution}.</span>
        </p>
      ) : null}
      {board.entries.length === 0 ? (
        <p role="status" className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
          No qualifying props are published right now. A prop appears only with a licensed, current projection or an approved sportsbook line for a game that has not started.
        </p>
      ) : null}
      <p className="text-[11px] text-slate-500">
        Lines: {board.sources.lines.join(", ") || "not published"} · Defense vs. Position: {board.sources.dvp ?? "no source connected"}
        {board.sources.dvpUpdatedUtc ? ` (updated ${board.sources.dvpUpdatedUtc.slice(0, 10)})` : ""} · Board built {board.generatedAtUtc.slice(0, 16).replace("T", " ")} UTC
      </p>
    </div>
  );
}

function BoardView({ board }: { board: PropsBoardArtifact }) {
  const [market, setMarket] = useState<BoardMarket>("pts");
  const [filters, setFilters] = useState<BoardFilters>(DEFAULT_FILTERS);
  const [sortKey, setSortKey] = useState<BoardSortKey>("difference");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const teams = useMemo(() => boardTeams(board), [board]);
  const rows = useMemo(() => sortBoardRows(filterBoardRows(buildBoardRows(board, market), filters), sortKey, direction), [board, market, filters, sortKey, direction]);
  const onSort = (key: BoardSortKey) => {
    if (key === sortKey) setDirection((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDirection(key === "player" || key === "team" || key === "dvpRank" ? "asc" : "desc");
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
      </div>
      <PropsBoardTable rows={rows} sortKey={sortKey} direction={direction} onSort={onSort} marketLabel={MARKET_LABEL[market]} />
      <p className="mt-2 text-[11px] text-slate-500">
        Proj − line is the JKB projection minus the posted line; positive leans Over. N/A means the input is missing (hover for the reason), not zero. Positions are estimates from depth charts and rotation roles, not verified minutes at a position. DvP is the estimated primary-position view (each player's box score counts toward one estimated position, not minutes played at it); the matchup label reads the blended rank and says how much of it is last season. A projection is shown even when a line or DvP is missing. DvP is context only and does not change the projection.
      </p>
    </>
  );
}

function MatrixView({ board }: { board: PropsBoardArtifact }) {
  const [view, setView] = useState<DvpView>("blended");
  const [stat, setStat] = useState<DvpStat>("PTS");
  const [position, setPosition] = useState<DvpPosition | null>(null);
  const sourceLabel = board.sources.dvp ? `${board.sources.dvp}${board.sources.dvpUpdatedUtc ? `, updated ${board.sources.dvpUpdatedUtc.slice(0, 10)}` : ""}` : null;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Season view">
        {DVP_VIEWS.map((v) => (
          <Chip key={v} active={view === v} onClick={() => setView(v)}>
            {viewLabel(v)}
          </Chip>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
        {DVP_STATS.map((s) => (
          <Chip key={s} active={stat === s} onClick={() => setStat(s)}>
            {s}
          </Chip>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
        <Chip active={position === null} onClick={() => setPosition(null)}>
          All positions
        </Chip>
        {DVP_POSITIONS.map((p) => (
          <Chip key={p} active={position === p} onClick={() => setPosition(p)}>
            {p}
          </Chip>
        ))}
      </div>
      <DvpMatrix rows={board.dvpRows} view={view} stat={stat} position={position} sourceLabel={sourceLabel} />
    </>
  );
}

function EmptyState({ reason }: { reason: string }) {
  return (
    <section className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
      <h2 className="text-base font-bold text-slate-900">No NBA props to show yet</h2>
      <p className="mx-auto mt-2 max-w-xl text-[13px] text-slate-600">{reason}</p>
      <p className="mx-auto mt-2 max-w-xl text-[12px] text-slate-500">
        This page shows only projections built from box-score data whose license allows display, and sportsbook lines only where their terms allow it. Until such a source is connected there is nothing to show, so no player statistic, projection or line is invented or filled in.
      </p>
    </section>
  );
}

/**
 * Development only (`npm run dev`, `?private=1`): loads a private preview board from a file on this computer. The file
 * is read by the browser directly; it is never uploaded, never served, and this component is not in production builds.
 */
function PrivateBoardPicker({ onLoad }: { onLoad: (board: PropsBoardArtifact) => void }) {
  const [error, setError] = useState<string | null>(null);
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const body: unknown = JSON.parse(await file.text());
      if (!isBoard(body)) throw new Error("this file is not an NBA props board");
      if (!body.privatePreview) throw new Error("only private preview boards load this way; a public board is published to public/data instead");
      setError(null);
      onLoad(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not read the file");
    }
  };
  return (
    <section className="mb-4 rounded border border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-[12px] text-amber-900" aria-label="Private preview loader">
      <label className="flex flex-wrap items-center gap-2 font-semibold">
        Private preview (this computer only): choose data/nba/props-v1/private-preview-board.json
        <input type="file" accept="application/json,.json" data-testid="private-board-file" onChange={(e) => void onFile(e.target.files?.[0])} />
      </label>
      {error ? <p role="alert" className="mt-1 font-semibold text-red-700">{error}</p> : null}
    </section>
  );
}

export default function NbaPlayerProps() {
  usePageSeo({
    title: "NBA Player Props — Joe Knows Ball",
    description: "NBA player props with JKB projections and Defense vs. Position context.",
    path: "/nba/props",
    noindex: true,
  });
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [tab, setTab] = useState<Tab>("board");
  useEffect(() => {
    let cancelled = false;
    void loadBoard().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <SiteShell>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
        <header className="mb-4">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">NBA player props</h1>
          <p className="mt-1 text-[13px] text-slate-600">JKB projections against sportsbook lines, with how each opponent defends the player's position.</p>
        </header>
        {import.meta.env.DEV && window.location.search.includes("private=1") ? <PrivateBoardPicker onLoad={(board) => setState({ status: "ready", board })} /> : null}
        {state.status === "loading" ? <p className="text-[13px] text-slate-500">Loading…</p> : null}
        {state.status === "empty" ? <EmptyState reason={state.reason} /> : null}
        {state.status === "ready" ? (
          <>
            <Banners board={state.board} />
            <div className="mb-4 flex gap-4 border-b border-slate-200" role="tablist" aria-label="NBA props views">
              {(["board", "matrix"] as const).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("-mb-px border-b-2 px-1 pb-2 text-[13px] font-semibold", tab === t ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800")}>
                  {t === "board" ? "Props board" : "Defense vs. Position"}
                </button>
              ))}
            </div>
            {tab === "board" ? <BoardView board={state.board} /> : <MatrixView board={state.board} />}
          </>
        ) : null}
      </main>
    </SiteShell>
  );
}

