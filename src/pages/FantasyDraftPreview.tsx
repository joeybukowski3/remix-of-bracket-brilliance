import { useDeferredValue, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Search } from "lucide-react";
import SiteShell from "@/components/layout/SiteShell";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import { NflFilterChips } from "@/components/nfl/ui/NflFilterBar";
import { NflTableScroller } from "@/components/nfl/ui/NflTable";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import {
  FANTASY_TABLE_BODY_CELL,
  FANTASY_TABLE_HEADER_CELL,
  FANTASY_TABLE_SHELL,
  FantasyPlayerIdentity,
} from "@/components/fantasy/FantasyTable";
import { MatchupOpponentCell, PositionRankBadge } from "@/components/fantasy/ParBoardCells";
import { formatRank, formatSigned } from "@/lib/fantasy/formatBoardValue";
import { FANTASY_POSITIONS, type FantasyPosition } from "@/lib/fantasy/rankings";
import {
  DRAFT_PREVIEW_ROWS_2026,
  filterDraftPreviewRows,
  type DraftPreviewRow,
} from "@/lib/fantasy/draftPreview/draftPreviewBoard";
import {
  SNAKE_DRAFT_TEAM_COUNT,
  computeSnakeDraftSlotPicks,
  roundsToCoverRowCount,
} from "@/lib/fantasy/draftPreview/snakeDraft";

type PositionFilter = "ALL" | FantasyPosition;

const POSITION_FILTERS: readonly PositionFilter[] = ["ALL", ...FANTASY_POSITIONS];
const DRAFT_SLOTS: readonly number[] = Array.from({ length: SNAKE_DRAFT_TEAM_COUNT }, (_, i) => i + 1);
const DEFAULT_DRAFT_SLOT = 10;
const ROUND_COUNT = roundsToCoverRowCount(DRAFT_PREVIEW_ROWS_2026.length);

export default function FantasyDraftPreview() {
  const seo = getSeoMeta("fantasy-draft-preview");
  usePageSeo({
    title: seo.title,
    description: seo.description,
    path: seo.path,
    noindex: seo.noindex ?? false,
  });

  const [position, setPosition] = useState<PositionFilter>("ALL");
  const [draftSlot, setDraftSlot] = useState<number>(DEFAULT_DRAFT_SLOT);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const rows = useMemo(
    () => filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, position, deferredQuery),
    [position, deferredQuery],
  );

  const pickRoundByOverall = useMemo(() => {
    const picks = computeSnakeDraftSlotPicks(draftSlot, ROUND_COUNT);
    return new Map(picks.map((pick) => [pick.overallPick, pick.round]));
  }, [draftSlot]);

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

      <div className="mt-4 space-y-4">
        <section aria-labelledby="draft-preview-title" className={FANTASY_TABLE_SHELL}>
          <div className="border-b border-slate-200 bg-slate-950 px-4 py-4 text-white sm:px-5">
            <h2 id="draft-preview-title" className="text-base font-bold tracking-tight sm:text-lg">
              2026 Sleeper draft board
            </h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-300 sm:text-[13px]">
              {DRAFT_PREVIEW_ROWS_2026.length} players from the supplied Sleeper draft-room snapshot, joined
              (where a canonical match exists) to the existing JKB research board.
            </p>
          </div>

          <DraftPreviewGlossary />

          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <NflFilterChips label="Position" options={POSITION_FILTERS} value={position} onChange={setPosition} />
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
          </div>

          {rows.length === 0 ? (
            <EmptyState query={deferredQuery} />
          ) : (
            <DraftPreviewTable rows={rows} pickRoundByOverall={pickRoundByOverall} draftSlot={draftSlot} />
          )}
        </section>
      </div>
    </SiteShell>
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

function DraftPreviewTable({
  rows,
  pickRoundByOverall,
  draftSlot,
}: {
  rows: readonly DraftPreviewRow[];
  pickRoundByOverall: ReadonlyMap<number, number>;
  draftSlot: number;
}) {
  return (
    <NflTableScroller label="Draft preview board" className="max-h-[72vh]">
      <table className="w-full min-w-[1520px] border-collapse text-left text-xs">
        <thead className="sticky top-0 z-20 bg-slate-100 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
          <tr>
            <th className={cn(FANTASY_TABLE_HEADER_CELL, "sticky left-0 z-30 w-16 bg-slate-100 px-3 py-2 text-center")}>Sleeper Rk</th>
            <th className={cn(FANTASY_TABLE_HEADER_CELL, "sticky left-16 z-30 min-w-64 bg-slate-100 px-3 py-2")}>Player</th>
            <th title="Canonical JKB rank within the player's position" className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>Pos Rk</th>
            <th title="Sleeper projected season fantasy points" className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>Sleeper Proj</th>
            <th title="Sleeper projected fantasy points per game" className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>Sleeper PPG</th>
            <th title="Existing Joe Knows Ball projected PPG (approved PAR authority)" className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>JKB Proj PPG</th>
            <th title="Approved projected Points Above Replacement per game" className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>JKB PAR/G</th>
            <th title="Corrected F2 ROS research Model Rank (independent authority)" className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>Model Rk</th>
            <th title="FantasyPros projection rank within position" className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>Projection Rk</th>
            <th title="Workbook average of component ranks" className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>AVG Rk</th>
            <th title="Positional strength of schedule; 1 is the easiest slate" className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>SOS</th>
            <th title="2025 positional finish by total fantasy points" className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>2025 Pts Rk</th>
            <th title="2025 positional finish by fantasy points per game" className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>2025 PPG Rk</th>
            <th title="Last-eight-game total points rank within position" className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>L8 Pts Rk</th>
            {["W15", "W16", "W17"].map((week) => (
              <th key={week} className={cn(FANTASY_TABLE_HEADER_CELL, "px-3 py-2 text-center")}>{week}</th>
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
              />
            );
          })}
        </tbody>
      </table>
    </NflTableScroller>
  );
}

function FragmentRow({
  row,
  separator,
}: {
  row: DraftPreviewRow;
  separator: { round: number; slot: number; overallPick: number } | undefined;
}) {
  return (
    <>
      {separator && <DraftPickSeparator {...separator} />}
      <DraftPreviewTableRow row={row} />
    </>
  );
}

/** Presentation-only marker. Never affects row order or any ranked value. */
function DraftPickSeparator({ round, slot, overallPick }: { round: number; slot: number; overallPick: number }) {
  return (
    <tr aria-hidden={false}>
      <td colSpan={17} className="border-y-2 border-amber-400 bg-amber-100 px-3 py-1.5 text-center text-[11px] font-black uppercase tracking-wide text-amber-900">
        Your pick — Round {round} • Pick {round}.{String(slot).padStart(2, "0")} • Overall {overallPick}
      </td>
    </tr>
  );
}

function DraftPreviewTableRow({ row }: { row: DraftPreviewRow }) {
  const canonicalPosition = row.canonicalPosition;
  return (
    <tr className="group hover:bg-slate-50">
      <td className={cn(FANTASY_TABLE_BODY_CELL, "sticky left-0 z-10 bg-white px-3 py-2 text-center font-bold tabular-nums text-slate-800 group-hover:bg-slate-50")}>{row.sleeperRank}</td>
      <td className={cn(FANTASY_TABLE_BODY_CELL, "sticky left-16 z-10 bg-white px-3 py-2 group-hover:bg-slate-50")}>
        <FantasyPlayerIdentity player={row.player} team={row.team ?? undefined} />
      </td>
      <td className={cn(FANTASY_TABLE_BODY_CELL, "px-3 py-2 text-center")}>
        {canonicalPosition ? (
          <PositionRankBadge position={canonicalPosition} positionRank={row.jkb?.positionRank} />
        ) : (
          <NotAvailable />
        )}
      </td>
      <StatCell value={row.sleeperProjectedPoints.toFixed(1)} />
      <StatCell value={row.sleeperProjectedPpg.toFixed(1)} />
      <StatCell value={row.jkbProjectedPpg != null ? row.jkbProjectedPpg.toFixed(1) : "N/A"} />
      <StatCell value={row.jkbParPerGame != null ? formatSigned(row.jkbParPerGame, 2) : "N/A"} />
      <StatCell value={row.modelRank != null ? String(row.modelRank) : "N/A"} />
      <StatCell value={formatRank(row.jkb?.projectionRank)} />
      <StatCell value={formatRank(row.jkb?.averageRank)} />
      <StatCell value={formatRank(row.jkb?.strengthOfSchedule)} />
      <StatCell value={formatRank(row.seasonPointsRank2025)} />
      <StatCell value={formatRank(row.seasonPpgRank2025)} />
      <StatCell value={formatRank(row.lastEightPointsRank)} />
      {canonicalPosition ? (
        <>
          <MatchupOpponentCell opponent={row.jkb?.playoffWeek15Opponent} position={canonicalPosition} />
          <MatchupOpponentCell opponent={row.jkb?.playoffWeek16Opponent} position={canonicalPosition} />
          <MatchupOpponentCell opponent={row.jkb?.playoffWeek17Opponent} position={canonicalPosition} />
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

function StatCell({ value }: { value: string }) {
  return (
    <td className={cn(FANTASY_TABLE_BODY_CELL, "px-3 py-2 text-center font-semibold tabular-nums text-slate-700", (value === "N/A" || value === "—") && "text-slate-400")}>
      {value}
    </td>
  );
}

function NotAvailable() {
  return <span className="text-[10px] font-semibold text-slate-400">N/A</span>;
}

function NotAvailableCell() {
  return (
    <td className={cn(FANTASY_TABLE_BODY_CELL, "px-3 py-2 text-center")}>
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

const GLOSSARY_ENTRIES: ReadonlyArray<readonly [string, string]> = [
  ["SLEEPER RK", "Rank/order from the supplied Sleeper draft-board snapshot. Fixed source data — never reordered by this page."],
  ["SLEEPER PROJ", "Sleeper projected season fantasy points, from the supplied draft-board snapshot."],
  ["SLEEPER PPG", "Sleeper projected fantasy points per game, from the supplied draft-board snapshot."],
  ["JKB PROJ PPG", "Existing Joe Knows Ball projection authority (approved PAR consensus). Not generated by Sleeper."],
  ["JKB PAR/G", "Existing approved projected Points Above Replacement per game."],
  ["MODEL RK", "Existing corrected F2 ROS research rank — an authority independent of both Sleeper and JKB Rank."],
  ["POS RK", "Existing canonical JKB rank within the player's position."],
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
