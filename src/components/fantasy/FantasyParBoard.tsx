import { useDeferredValue, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import PositionParBoard from "@/components/fantasy/PositionParBoard";
import LegacyPositionBoard from "@/components/fantasy/LegacyPositionBoard";
import RosStatsGlossary from "@/components/fantasy/RosStatsGlossary";
import { MatchupOpponentCell, PositionRankBadge } from "@/components/fantasy/ParBoardCells";
import { getPositionTone, POSITION_TONES, POSITION_TONE_NAMES, type PositionTone } from "@/lib/fantasy/positionTone";
import { getOverallRowContext } from "@/lib/fantasy/overallRowContext";
import { formatAdp, formatRank, formatSigned } from "@/lib/fantasy/formatBoardValue";
import { NflFilterChips } from "@/components/nfl/ui/NflFilterBar";
import {
  DENSE_TABLE_HEAD_ROW,
  DENSE_TABLE_ROW,
  DenseTableScroller,
  stickyDenseHeader,
} from "@/components/ui/dense-table";
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
import {
  getShadowModelRankRow,
  type ShadowModelRankRow,
} from "@/lib/fantasy/rosResearch/shadowModelRankJoin";

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
              to="/fantasy-football/draft-preview"
              className="text-xs font-semibold text-sky-300 underline hover:text-sky-200"
            >
              Fantasy Draft Preview →
            </Link>
            <Link
              to="/fantasy-football/points-allowed"
              className="text-xs font-semibold text-sky-300 underline hover:text-sky-200"
            >
              2025 Points Allowed by Position →
            </Link>
          </div>
        </div>
      </div>

      <RosStatsGlossary />

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

/**
 * Presentation-only sort toggle for the Model Rk column. Never mutates
 * `FANTASY_RANKINGS`; default (`false`) keeps the board in JKB RANK order.
 */
function OverallBoard({ query }: { query: string }) {
  const [modelRankSortActive, setModelRankSortActive] = useState(false);
  const baseRows = useMemo(
    () => FANTASY_RANKINGS.rows.filter((row) => matchesQuery(row.player, row.team, query)),
    [query],
  );
  const rows = useMemo(() => {
    if (!modelRankSortActive) return baseRows;
    // N/A (no Model Rank) always sorts to the bottom, ascending Model Rank above it.
    return [...baseRows].sort((a, b) => {
      const aRank = getShadowModelRankRow(a.overallRank)?.modelRank ?? null;
      const bRank = getShadowModelRankRow(b.overallRank)?.modelRank ?? null;
      if (aRank == null && bRank == null) return a.overallRank - b.overallRank;
      if (aRank == null) return 1;
      if (bRank == null) return -1;
      return aRank - bRank;
    });
  }, [modelRankSortActive, baseRows]);
  if (rows.length === 0) return <EmptyState query={query} />;

  return (
    <DenseTableScroller label="Overall fantasy rankings" className="max-h-[72vh]">
      <table className="w-full min-w-[1420px] border-collapse text-left text-xs">
        <thead className={stickyDenseHeader("bg-slate-100 text-[10px] font-semibold uppercase tracking-wider text-slate-600")}>
          <tr className={DENSE_TABLE_HEAD_ROW}>
            <th className={cn(FANTASY_TABLE_HEADER_CELL, "sticky left-0 z-30 w-14 bg-slate-100 px-3 py-2 text-center")}>Rank</th>
            <th className={cn(FANTASY_TABLE_HEADER_CELL, "sticky left-14 z-30 min-w-64 bg-slate-100 px-3 py-2")}>Player</th>
            <th className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>Pos Rk</th>
            <th title="FantasyPros Real-Time ADP — Redraft PPR, 12-team, Aug. 25, 2026 snapshot" className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>ADP</th>
            <th title="Approved projected PAR per game" className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>PAR/G</th>
            <th title="FantasyPros projection rank within position" className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>Projection Rk</th>
            <th className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>AVG Rk</th>
            <th className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>
              <button
                type="button"
                title="Independent quantitative Model Rank (research authority). Click to sort by Model Rank; click again to return to JKB RANK order."
                aria-pressed={modelRankSortActive}
                onClick={() => setModelRankSortActive((value) => !value)}
                className={cn(
                  "inline-flex min-h-6 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
                  modelRankSortActive && "bg-slate-200 text-slate-700",
                )}
              >
                Model Rk{modelRankSortActive ? " ▲" : ""}
              </button>
            </th>
            <th title="Positional strength of schedule; 1 is the easiest slate" className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>SOS</th>
            <th title="2025 positional finish by total fantasy points" className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>2025 Pts Rk</th>
            <th title="2025 positional finish by fantasy points per game" className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>2025 PPG Rk</th>
            <th title="Total points over the last eight eligible regular-season games, ranked within position" className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>L8 Pts Rk</th>
            {["W15", "W16", "W17"].map((week) => (
              <th
                key={week}
                title={`${week} opponent. Cell heat is that defense's 2025 fantasy points allowed to the player's position.`}
                className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center leading-tight")}
              >
                {week}
              </th>
            ))}
            <th className={cn(FANTASY_TABLE_HEADER_CELL, "w-12 px-3 py-2")}><span className="sr-only">Details</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => <OverallRow key={row.overallRank} row={row} />)}
        </tbody>
      </table>
    </DenseTableScroller>
  );
}

/**
 * Secondary/independent-authority cell for the SHADOW Model Rk column.
 * Deliberately lighter (outlined pill, muted slate) than the primary Rank
 * column's bold plain text, so it never reads as equal or dominant to the
 * JKB RANK authority it sits beside. `modelRank` is a cross-position rank
 * (see `shadowModelRankJoin.ts`), so this is deliberately NOT a heat-map
 * gradient cell -- exported so other boards showing the same Model Rank
 * authority (e.g. Draft Preview) reuse this exact canonical treatment
 * instead of inventing a separate one.
 */
export function ModelRankCell({ rank }: { rank: number | null }) {
  if (rank == null) {
    return (
      <td className={cn(FANTASY_TABLE_BODY_CELL, "px-3 py-2 text-center")}>
        <span className="text-[10px] font-semibold text-slate-400">N/A</span>
      </td>
    );
  }
  return (
    <td className={cn(FANTASY_TABLE_BODY_CELL, "px-3 py-2 text-center")}>
      <span className="inline-flex min-w-9 justify-center rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600">
        {rank}
      </span>
    </td>
  );
}

function PositionalHistoryCell({
  tone,
  position,
  rank,
}: {
  tone: PositionTone;
  position: FantasyPosition;
  rank: number | undefined;
}) {
  return (
    <td className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-2 text-center", tone.cell)}>
      {Number.isFinite(rank) ? (
        <PositionRankBadge position={position} positionRank={rank} />
      ) : (
        <span className="text-[10px] font-semibold text-slate-400">N/A</span>
      )}
    </td>
  );
}

function OverallRow({ row }: { row: FantasyRankingRow }) {
  const [expanded, setExpanded] = useState(false);
  // Overall mixes positions, so cells are tinted by *which* position the row is
  // rather than by rank quality — see `positionTone`.
  const tone = getPositionTone(row.position);
  // Context values are prepared outside React; filtering never recomputes ranks.
  const context = getOverallRowContext(row.overallRank);
  const model = getShadowModelRankRow(row.overallRank);
  return (
    <>
      <tr className={cn(DENSE_TABLE_ROW, "group")}>
        <td className={cn(FANTASY_TABLE_BODY_CELL, "sticky left-0 z-10 bg-white px-3 py-2 text-center font-bold tabular-nums text-slate-800 group-hover:bg-slate-50")}>{row.overallRank}</td>
        <td className={cn(FANTASY_TABLE_BODY_CELL, "sticky left-14 z-10 bg-white px-3 py-2 group-hover:bg-slate-50")}><FantasyPlayerIdentity player={row.player} team={row.team} /></td>
        <td className={cn(FANTASY_TABLE_BODY_CELL, "px-3 py-2 text-center")}>
          <PositionRankBadge position={row.position} positionRank={row.positionRank} />
        </td>
        <td className={cn(FANTASY_TABLE_BODY_CELL, "px-3 py-2 text-center font-semibold tabular-nums text-slate-500")}>{formatAdp(context.adp)}</td>
        <OverallStatCell tone={tone} value={formatSigned(context.parPerGame, 2)} />
        <OverallStatCell tone={tone} value={formatRank(row.projectionRank)} />
        <OverallStatCell tone={tone} value={formatRank(row.averageRank)} />
        <ModelRankCell rank={model?.modelRank ?? null} />
        <OverallStatCell tone={tone} value={formatRank(row.strengthOfSchedule)} />
        <PositionalHistoryCell tone={tone} position={row.position} rank={context.seasonRank2025?.byPoints} />
        <PositionalHistoryCell tone={tone} position={row.position} rank={context.seasonRank2025?.byPpg} />
        <PositionalHistoryCell tone={tone} position={row.position} rank={context.lastEightRank?.rank} />
        <MatchupOpponentCell opponent={row.playoffWeek15Opponent} position={row.position} />
        <MatchupOpponentCell opponent={row.playoffWeek16Opponent} position={row.position} />
        <MatchupOpponentCell opponent={row.playoffWeek17Opponent} position={row.position} />
        <td className={cn(FANTASY_TABLE_BODY_CELL, "px-3 py-2 text-center")}><FantasyExpandControl label={`${expanded ? "Hide" : "Show"} details for ${row.player}`} expanded={expanded} onClick={() => setExpanded((value) => !value)} /></td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50">
          <td colSpan={16} className="border-b border-slate-200 px-4 py-3 text-xs text-slate-600">
            <p>
              2025 sample: <strong>{context.seasonActual2025 ? `${context.seasonActual2025.gamesPlayed} games` : "N/A"}</strong> · L8 sample: <strong>{context.lastEightRank ? `${context.lastEightRank.sampleSize} game${context.lastEightRank.sampleSize === 1 ? "" : "s"}` : "N/A"}</strong> · L8 total: <strong>{context.lastEightRank ? context.lastEightRank.totalPoints.toFixed(1) : "N/A"}</strong> · ADP source: <strong>{context.adp != null ? "FantasyPros Real-Time ADP, Redraft PPR · 12-team · Aug. 25, 2026" : "no FantasyPros Real-Time ADP match"}</strong> · Projection: <strong>{formatRank(row.projectionRank)}</strong> · SOS: <strong>{formatRank(row.strengthOfSchedule)}</strong> · O-Line: <strong>{formatRank(row.offensiveLineRank)}</strong>
            </p>
            <ModelProvenance model={model} />
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Model/Research provenance for the expanded row. Every value here is a
 * SHADOW research value, never presented as a live canonical field — see
 * the "Model Rk" glossary note. Disputed statuses (e.g. a released-vs-rostered
 * conflict) are surfaced verbatim, never silently resolved.
 */
function ModelProvenance({ model }: { model: ShadowModelRankRow | undefined }) {
  if (!model) {
    return (
      <p className="mt-2 border-t border-slate-200 pt-2 text-slate-500">
        Model (research): <strong>N/A</strong> — no shadow research row for this player.
      </p>
    );
  }
  return (
    <p className="mt-2 border-t border-slate-200 pt-2 text-slate-500">
      Model Rank (research): <strong>{model.modelRank ?? "N/A"}</strong>
      {model.modelPositionRank != null && <> (pos <strong>{model.modelPositionRank}</strong>)</>}
      {" "}· Model PPG (research, not live PPG): <strong>{model.modelProjectedPpg != null ? model.modelProjectedPpg.toFixed(2) : "N/A"}</strong>
      {" "}· Model PAR/G (research, not live PAR/G): <strong>{model.modelParPerGame != null ? model.modelParPerGame.toFixed(2) : "N/A"}</strong>
      {" "}· Source: <strong>{model.projectionSource === "historical-model" ? "historical baseline" : "rookie/no-history fallback"}</strong>
      {" "}· Confidence: <strong>{model.confidence}</strong>
      {" "}· Availability: <strong>{model.availabilityStatus}</strong> ({model.availabilitySource}, as of {model.availabilityAsOf})
      {" "}· Rank eligibility: <strong>{model.rankEligible ? "eligible" : `withheld — ${model.rankEligibilityReason ?? "not eligible"}`}</strong>
      {model.statusConflict && (
        <> · <strong className="text-amber-700">Status conflict:</strong> {model.statusConflictReason}</>
      )}
    </p>
  );
}

function EmptyState({ query }: { query: string }) {
  return <div className="px-4 py-12 text-center text-sm font-semibold text-slate-700">No players match “{query}”</div>;
}

function matchesQuery(player: string, team: string | undefined, query: string): boolean {
  return !query || player.toLowerCase().includes(query) || team?.toLowerCase().includes(query) === true;
}


