import { useDeferredValue, useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { NflFilterChips } from "@/components/nfl/ui/NflFilterBar";
import { cn } from "@/lib/utils";
import {
  FANTASY_PAR_RANKINGS,
  PAR_POSITION_LIMITS,
  PAR_POSITIONS,
  PAR_TIER_BOUNDARIES,
  filterFantasyParRankings,
  type FantasyParRankingRow,
} from "@/lib/fantasy/parRankings";
import type { FantasyPosition } from "@/lib/fantasy/rankings";

type PositionFilter = "ALL" | FantasyPosition;

const POSITION_FILTERS: readonly PositionFilter[] = ["ALL", ...PAR_POSITIONS];

const POSITION_NAMES: Record<FantasyPosition, string> = {
  QB: "Quarterbacks",
  RB: "Running backs",
  WR: "Wide receivers",
  TE: "Tight ends",
};

const DESKTOP_COLUMNS =
  "md:grid md:grid-cols-[3.5rem_minmax(10rem,1.4fr)_4.25rem_4.5rem_4.75rem_5.25rem_5.25rem_5.5rem] md:items-center";

export default function FantasyParBoard() {
  const [position, setPosition] = useState<PositionFilter>("ALL");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const visiblePositions = useMemo(
    () => (position === "ALL" ? PAR_POSITIONS : [position]),
    [position],
  );
  const filteredByPosition = useMemo(
    () =>
      Object.fromEntries(
        visiblePositions.map((currentPosition) => [
          currentPosition,
          filterFantasyParRankings(FANTASY_PAR_RANKINGS[currentPosition], deferredQuery),
        ]),
      ) as Partial<Record<FantasyPosition, readonly FantasyParRankingRow[]>>,
    [visiblePositions, deferredQuery],
  );
  const visibleCount = visiblePositions.reduce(
    (total, currentPosition) => total + (filteredByPosition[currentPosition]?.length ?? 0),
    0,
  );

  return (
    <section aria-labelledby="par-board-title" className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="border-b border-slate-200 bg-slate-950 px-4 py-4 text-white sm:px-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="par-board-title" className="text-base font-bold tracking-tight sm:text-lg">
              2026 PAR tier board
            </h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-300 sm:text-[13px]">
              PAR/G measures projected fantasy points per game above the historical replacement baseline for each position.
            </p>
          </div>
          <div className="text-right text-xs text-slate-300">
            <span className="block font-semibold tabular-nums text-white">180 validated players</span>
            QB · RB · WR · TE only
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
            formatOption={(option) =>
              option === "ALL" ? "All positions" : `${option} ${PAR_POSITION_LIMITS[option]}`
            }
          />
          <div className="relative w-full lg:max-w-xs">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              aria-label="Search PAR rankings"
              placeholder="Search player or team"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500 lg:h-10 lg:text-sm"
            />
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-4 text-slate-500">
          Tier membership follows PAR/G rank. Inside each tier, verified JKB position rank sets the board order; unranked JKB rows follow by PAR rank.
        </p>
      </div>

      {visibleCount === 0 ? (
        <div className="px-4 py-12 text-center">
          <p className="text-sm font-semibold text-slate-800">No players match “{deferredQuery.trim()}”</p>
          <p className="mt-1 text-sm text-slate-500">Try a surname, team abbreviation, or another position.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {visiblePositions.map((currentPosition) => {
            const rows = filteredByPosition[currentPosition] ?? [];
            if (rows.length === 0) return null;
            return <PositionBoard key={currentPosition} position={currentPosition} rows={rows} />;
          })}
        </div>
      )}
    </section>
  );
}

function PositionBoard({
  position,
  rows,
}: {
  position: FantasyPosition;
  rows: readonly FantasyParRankingRow[];
}) {
  const tierNumbers = PAR_TIER_BOUNDARIES[position]
    .map(({ tier }) => tier)
    .filter((tier) => rows.some((row) => row.tier === tier));

  return (
    <section
      aria-labelledby={`${position.toLowerCase()}-rankings-heading`}
      className="[content-visibility:auto] [contain-intrinsic-size:auto_1200px]"
    >
      <div className="flex items-baseline justify-between gap-3 bg-white px-4 py-3 sm:px-5">
        <div className="flex items-baseline gap-2">
          <h3 id={`${position.toLowerCase()}-rankings-heading`} className="text-sm font-bold text-slate-950 sm:text-base">
            {POSITION_NAMES[position]}
          </h3>
          <span className="text-xs font-semibold text-slate-500">{position}</span>
        </div>
        <span className="text-xs tabular-nums text-slate-500">
          {rows.length} of {PAR_POSITION_LIMITS[position]}
        </span>
      </div>

      <div className={cn(DESKTOP_COLUMNS, "hidden border-y border-slate-200 bg-slate-100 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600 sm:px-5 md:grid")}>
        <span>JKB</span>
        <span>Player</span>
        <span className="text-right">PAR rank</span>
        <span className="text-right">PAR/G</span>
        <span className="text-right">Proj PPG</span>
        <span className="text-right">Replacement</span>
        <span className="text-right">Season PAR</span>
        <span className="text-right">Proj pts</span>
      </div>

      <div className="divide-y divide-slate-200">
        {tierNumbers.map((tier) => {
          const tierRows = rows.filter((row) => row.tier === tier);
          const boundary = PAR_TIER_BOUNDARIES[position].find((item) => item.tier === tier)!;
          return (
            <section key={tier} aria-labelledby={`${position.toLowerCase()}-tier-${tier}`}>
              <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-2 sm:px-5">
                <h4
                  id={`${position.toLowerCase()}-tier-${tier}`}
                  aria-label={`Tier ${tier}, PAR ${boundary.start === boundary.end ? `rank ${boundary.start}` : `ranks ${boundary.start} through ${boundary.end}`}`}
                  className="flex items-center gap-2 text-xs font-bold text-slate-800"
                >
                  <span className={cn("inline-flex min-w-14 items-center justify-center rounded px-2 py-1", tierBadgeClass(tier))}>
                    Tier {tier}
                  </span>
                  <span className="font-medium text-slate-500">
                    PAR {boundary.start === boundary.end ? `#${boundary.start}` : `#${boundary.start}–${boundary.end}`}
                  </span>
                </h4>
                <span className="text-[11px] tabular-nums text-slate-500">{tierRows.length} players</span>
              </div>
              <div className="divide-y divide-slate-100">
                {tierRows.map((row) => (
                  <PlayerRow key={row.sourceId} row={row} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function PlayerRow({ row }: { row: FantasyParRankingRow }) {
  return (
    <article className={cn(DESKTOP_COLUMNS, "px-4 py-3 transition-colors hover:bg-slate-50 sm:px-5 md:py-2.5")}>
      <div className="flex items-start justify-between gap-4 md:contents">
        <div className="hidden text-xs font-semibold tabular-nums text-slate-500 md:block">
          {row.jkbPositionRank ? `#${row.jkbPositionRank}` : "—"}
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-2">
            <h5 className="truncate text-sm font-semibold text-slate-950">{row.player}</h5>
            <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-slate-500">{row.team}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500 md:hidden">
            {row.jkbPositionRank ? `JKB ${row.position}${row.jkbPositionRank}` : "JKB rank unavailable"} · PAR rank #{row.parRank}
          </p>
        </div>
        <div className="shrink-0 text-right md:hidden">
          <div className={cn("text-base font-bold tabular-nums", parValueClass(row.parPerGame))}>
            {formatSigned(row.parPerGame, 2)}
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">PAR/G</div>
        </div>
      </div>

      <div className="hidden text-right text-xs font-semibold tabular-nums text-slate-700 md:block">#{row.parRank}</div>
      <div className={cn("hidden text-right text-sm font-bold tabular-nums md:block", parValueClass(row.parPerGame))}>
        {formatSigned(row.parPerGame, 2)}
      </div>
      <div className="hidden text-right text-xs font-semibold tabular-nums text-slate-800 md:block">{formatNumber(row.projectedPpg, 2)}</div>
      <div className="hidden text-right text-xs tabular-nums text-slate-600 md:block">{formatNumber(row.replacementPpg, 2)}</div>
      <div className={cn("hidden text-right text-xs font-semibold tabular-nums md:block", parValueClass(row.projectedSeasonPar))}>
        {formatSigned(row.projectedSeasonPar, 1)}
      </div>
      <div className="hidden text-right text-xs font-semibold tabular-nums text-slate-800 md:block">{formatNumber(row.projectedFantasyPoints, 1)}</div>

      <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-slate-200 ring-1 ring-slate-200 md:hidden">
        <MobileMetric label="Proj PPG" value={formatNumber(row.projectedPpg, 2)} />
        <MobileMetric label="Replacement" value={formatNumber(row.replacementPpg, 2)} />
        <MobileMetric label="Season PAR" value={formatSigned(row.projectedSeasonPar, 1)} valueClass={parValueClass(row.projectedSeasonPar)} />
      </div>
      <details className="group mt-2 md:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-md px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 [&::-webkit-details-marker]:hidden">
          Projection details
          <ChevronDown aria-hidden className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
        </summary>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 px-2 pt-3 text-xs">
          <Detail label="Projected games" value={formatNumber(row.projectedGames, 2)} />
          <Detail label="Projected points" value={formatNumber(row.projectedFantasyPoints, 1)} />
          <Detail label="PAR rank" value={`#${row.parRank}`} />
          <Detail label="Projection basis" value={projectionBasis(row.projectionStatus)} />
        </dl>
      </details>
    </article>
  );
}

function MobileMetric({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-slate-50 px-2 py-2 text-center">
      <div className={cn("text-xs font-bold tabular-nums text-slate-900", valueClass)}>{value}</div>
      <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">{value}</dd>
    </div>
  );
}

function tierBadgeClass(tier: number): string {
  if (tier === 1) return "bg-amber-200 text-amber-950";
  if (tier === 2) return "bg-sky-200 text-sky-950";
  if (tier <= 4) return "bg-emerald-100 text-emerald-900";
  return "bg-slate-200 text-slate-700";
}

function parValueClass(value: number): string {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-rose-700";
  return "text-slate-700";
}

function formatSigned(value: number, digits: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function formatNumber(value: number, digits: number): string {
  return value.toFixed(digits);
}

function projectionBasis(status: string): string {
  return status.startsWith("authoritative-derived") ? "Consensus source" : status;
}
