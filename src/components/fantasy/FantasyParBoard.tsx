import { useDeferredValue, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import PositionParBoard from "@/components/fantasy/PositionParBoard";
import LegacyPositionBoard from "@/components/fantasy/LegacyPositionBoard";
import { MatchupOpponentCell, PositionRankBadge } from "@/components/fantasy/ParBoardCells";
import { getPositionTone, POSITION_TONES, POSITION_TONE_NAMES, type PositionTone } from "@/lib/fantasy/positionTone";
import { getOverallRowContext } from "@/lib/fantasy/overallRowContext";
import { formatRank, formatSigned } from "@/lib/fantasy/formatBoardValue";
import { NflFilterChips } from "@/components/nfl/ui/NflFilterBar";
import { NflTableScroller } from "@/components/nfl/ui/NflTable";
import { cn } from "@/lib/utils";
import {
  FANTASY_TABLE_BODY_CELL,
  FANTASY_TABLE_HEADER_CELL,
  FANTASY_TABLE_SHELL,
  FantasyExpandControl,
  FantasyPlayerIdentity,
} from "@/components/fantasy/FantasyTable";
import {
  FANTASY_POSITION_RESEARCH_BOARDS,
  PAR_POSITIONS,
} from "@/lib/fantasy/parRankings";
import {
  FANTASY_RANKINGS,
  type FantasyPosition,
  type FantasyRankingRow,
} from "@/lib/fantasy/rankings";

type PositionFilter = "ALL" | FantasyPosition;
/** Temporary review switch between the PAR-first board and the pre-redesign one. */
type BoardVariant = "par" | "legacy";

const POSITION_FILTERS: readonly PositionFilter[] = ["ALL", ...PAR_POSITIONS];
const BOARD_VARIANTS: ReadonlyArray<{ value: BoardVariant; label: string }> = [
  { value: "par", label: "PAR board" },
  { value: "legacy", label: "Legacy board" },
];

export default function FantasyParBoard() {
  const [position, setPosition] = useState<PositionFilter>("ALL");
  const [query, setQuery] = useState("");
  const [variant, setVariant] = useState<BoardVariant>("par");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const positionCounts = useMemo(
    () => Object.fromEntries(PAR_POSITIONS.map((item) => [item, FANTASY_POSITION_RESEARCH_BOARDS[item].jkbRowCount])),
    [],
  ) as Record<FantasyPosition, number>;

  return (
    <section aria-labelledby="fantasy-board-title" className={FANTASY_TABLE_SHELL}>
      <div className="border-b border-slate-200 bg-slate-950 px-4 py-4 text-white sm:px-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="fantasy-board-title" className="text-base font-bold tracking-tight sm:text-lg">2026 rest-of-season research board</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-300 sm:text-[13px]">
              Season Projection and Projected PPG, with draft-pool tiers derived from approved projected PAR/G.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs font-semibold tabular-nums text-slate-200">{FANTASY_RANKINGS.rows.length} JKB-ranked players</span>
            <Link
              to="/fantasy-football/points-allowed"
              className="text-xs font-semibold text-sky-300 underline hover:text-sky-200"
            >
              2025 Points Allowed by Position →
            </Link>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <NflFilterChips
            label="Position"
            options={POSITION_FILTERS}
            value={position}
            onChange={setPosition}
            className="[&>button]:min-h-11 lg:[&>button]:min-h-0"
            formatOption={(item) => item === "ALL" ? `Overall ${FANTASY_RANKINGS.rows.length}` : `${item} ${positionCounts[item]}`}
          />
          <div className="relative w-full lg:max-w-xs">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              aria-label="Search fantasy rankings"
              placeholder="Search player or team"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500 lg:h-10 lg:text-sm"
            />
          </div>
        </div>
        {position === "ALL" && <PositionLegend />}
        {position !== "ALL" && (
          <BoardVariantToggle variant={variant} onChange={setVariant} />
        )}
      </div>

      {position === "ALL" && <OverallBoard query={deferredQuery} />}
      {position !== "ALL" && variant === "par" && (
        <PositionParBoard position={position} query={deferredQuery} />
      )}
      {position !== "ALL" && variant === "legacy" && (
        <LegacyPositionBoard position={position} query={deferredQuery} mobileGroup="Metrics" />
      )}
    </section>
  );
}

/**
 * Side-by-side review switch. Temporary: remove this along with
 * `LegacyPositionBoard` once one board is chosen.
 */
function BoardVariantToggle({
  variant,
  onChange,
}: {
  variant: BoardVariant;
  onChange: (value: BoardVariant) => void;
}) {
  return (
    <div className="mt-3 flex items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Review</span>
      <div className="inline-flex gap-1 rounded-lg bg-slate-200 p-1" role="group" aria-label="Board layout">
        {BOARD_VARIANTS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={variant === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-8 rounded-md px-2.5 text-[11px] font-semibold",
              variant === option.value ? "bg-white text-slate-950 shadow-sm" : "text-slate-600",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Overall stat cell: flat categorical tint by the row's position, never a
 * value-based gradient. Cross-position comparability is the reason — see
 * `positionTone`. Bold slate text keeps contrast against the light tint.
 */
function OverallStatCell({ tone, value }: { tone: PositionTone; value: string }) {
  return (
    <td
      className={cn(
        FANTASY_TABLE_BODY_CELL,
        "px-3 py-2 text-center text-[11px] font-bold tabular-nums text-slate-800",
        tone.cell,
        value === "—" && "font-semibold text-slate-400",
      )}
    >
      {value}
    </td>
  );
}

/** One-time key for the Overall board's position tints. */
function PositionLegend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5" aria-label="Position colour key">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Position colours
      </span>
      {PAR_POSITIONS.map((position) => (
        <span key={position} className="inline-flex items-center gap-1.5">
          {/* Split swatch: the saturated badge tone over the lighter cell wash,
              since both appear on a row. A plain border rather than the badge's
              ring, whose two `ring-1` declarations merge away to nothing. */}
          <span
            aria-hidden
            className="inline-flex h-3.5 w-6 overflow-hidden rounded-sm border border-slate-300"
          >
            <span className={cn("h-full w-1/2", POSITION_TONES[position].badge)} />
            <span className={cn("h-full w-1/2", POSITION_TONES[position].cell)} />
          </span>
          <span className="text-[11px] font-semibold text-slate-700">{position}</span>
          <span className="text-[10px] text-slate-400">{POSITION_TONE_NAMES[position]}</span>
        </span>
      ))}
    </div>
  );
}

function OverallBoard({ query }: { query: string }) {
  const rows = FANTASY_RANKINGS.rows.filter((row) => matchesQuery(row.player, row.team, query));
  if (rows.length === 0) return <EmptyState query={query} />;

  return (
    <NflTableScroller label="Overall fantasy rankings" className="max-h-[72vh]">
      <table className="w-full min-w-[1240px] border-collapse text-left text-xs">
        <thead className="sticky top-0 z-20 bg-slate-100 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
          <tr>
            <th className={cn(FANTASY_TABLE_HEADER_CELL, "sticky left-0 z-30 w-14 bg-slate-100 px-3 py-2 text-center")}>Rank</th>
            <th className={cn(FANTASY_TABLE_HEADER_CELL, "sticky left-14 z-30 min-w-64 bg-slate-100 px-3 py-2")}>Player</th>
            <th className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>Pos Rk</th>
            <th className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>Rd / Pick</th>
            <th title="Approved projected PAR per game" className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>PAR/G</th>
            <th title="FantasyPros projection rank within position" className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>Projection Rk</th>
            <th className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>AVG Rk</th>
            <th title="Positional strength of schedule; 1 is the easiest slate" className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>SOS</th>
            {["Pts", "PPG"].map((basis) => (
              <th
                key={basis}
                title={`2025 positional finish by ${basis === "Pts" ? "total fantasy points" : "points per game"}`}
                className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center leading-tight")}
              >
                2025 Rk
                <span className="block text-[8px] font-medium normal-case tracking-normal text-slate-400">
                  {basis}
                </span>
              </th>
            ))}
            {["W15", "W16", "W17"].map((week) => (
              <th
                key={week}
                title={`${week} opponent. Hover a cell for that defense's 2025 fantasy points allowed to the player's position.`}
                className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center leading-tight")}
              >
                {week}
                <span className="block text-[8px] font-medium normal-case tracking-normal text-slate-400">
                  2025 PA
                </span>
              </th>
            ))}
            <th className={cn(FANTASY_TABLE_HEADER_CELL, "w-12 px-3 py-2")}><span className="sr-only">Details</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => <OverallRow key={row.overallRank} row={row} />)}
        </tbody>
      </table>
    </NflTableScroller>
  );
}

function OverallRow({ row }: { row: FantasyRankingRow }) {
  const [expanded, setExpanded] = useState(false);
  // Overall mixes positions, so cells are tinted by *which* position the row is
  // rather than by rank quality — see `positionTone`.
  const tone = getPositionTone(row.position);
  // PAR/G and the 2025 finish come from the approved PAR rows; players outside
  // that universe resolve to undefined and render a dash.
  const context = getOverallRowContext(row.overallRank);
  return (
    <>
      <tr className="group hover:bg-slate-50">
        <td className={cn(FANTASY_TABLE_BODY_CELL, "sticky left-0 z-10 bg-white px-3 py-2 text-center font-bold tabular-nums text-slate-800 group-hover:bg-slate-50")}>{row.overallRank}</td>
        <td className={cn(FANTASY_TABLE_BODY_CELL, "sticky left-14 z-10 bg-white px-3 py-2 group-hover:bg-slate-50")}><FantasyPlayerIdentity player={row.player} team={row.team} /></td>
        <td className={cn(FANTASY_TABLE_BODY_CELL, "px-3 py-2 text-center")}>
          <PositionRankBadge position={row.position} positionRank={row.positionRank} />
        </td>
        <td className={cn(FANTASY_TABLE_BODY_CELL, "px-3 py-2 text-center tabular-nums")}>{row.draftRound && row.roundPick ? `${row.draftRound}.${row.roundPick}` : "—"}</td>
        <OverallStatCell tone={tone} value={formatSigned(context.parPerGame, 2)} />
        <OverallStatCell tone={tone} value={formatRank(row.projectionRank)} />
        <OverallStatCell tone={tone} value={formatRank(row.averageRank)} />
        <OverallStatCell tone={tone} value={formatRank(row.strengthOfSchedule)} />
        <OverallStatCell tone={tone} value={formatRank(context.seasonRank2025?.byPoints)} />
        <OverallStatCell tone={tone} value={formatRank(context.seasonRank2025?.byPpg)} />
        <MatchupOpponentCell opponent={row.playoffWeek15Opponent} position={row.position} tintClass={tone.cell} />
        <MatchupOpponentCell opponent={row.playoffWeek16Opponent} position={row.position} tintClass={tone.cell} />
        <MatchupOpponentCell opponent={row.playoffWeek17Opponent} position={row.position} tintClass={tone.cell} />
        <td className={cn(FANTASY_TABLE_BODY_CELL, "px-3 py-2 text-center")}><FantasyExpandControl label={`${expanded ? "Hide" : "Show"} details for ${row.player}`} expanded={expanded} onClick={() => setExpanded((value) => !value)} /></td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50">
          <td colSpan={15} className="border-b border-slate-200 px-4 py-3 text-xs text-slate-600">
            Late / Last 8: <strong>{formatRank(row.lateSeasonRank)}</strong> · Projection: <strong>{formatRank(row.projectionRank)}</strong> · SOS: <strong>{formatRank(row.strengthOfSchedule)}</strong> · O-Line: <strong>{formatRank(row.offensiveLineRank)}</strong>
          </td>
        </tr>
      )}
    </>
  );
}

function EmptyState({ query }: { query: string }) {
  return <div className="px-4 py-12 text-center text-sm font-semibold text-slate-700">No players match “{query}”</div>;
}

function matchesQuery(player: string, team: string | undefined, query: string): boolean {
  return !query || player.toLowerCase().includes(query) || team?.toLowerCase().includes(query) === true;
}


