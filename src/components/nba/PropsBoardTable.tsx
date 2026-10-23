import { ArrowDown, ArrowUp } from "lucide-react";
import { DENSE_TABLE_HEAD_ROW, DENSE_TABLE_ROW, DenseTableScroller, frozenDenseColumn } from "@/components/ui/dense-table";
import { cn } from "@/lib/utils";
import { SEASON_LABEL, type DvpRow, type MatchupTier, type SampleBasis } from "@/lib/nba/props/dvp";
import { formatAmerican, type BoardRow, type BoardSortKey, type DvpState, type SortDirection } from "@/lib/nba/props/propsBoard";

const TIER_CLASS: Record<MatchupTier, string> = {
  favorable: "bg-emerald-100 text-emerald-800",
  neutral: "bg-slate-100 text-slate-700",
  tough: "bg-rose-100 text-rose-800",
};
const TIER_LABEL: Record<MatchupTier, string> = { favorable: "Allows a lot", neutral: "Middle", tough: "Allows little" };
const BASIS_LABEL: Record<SampleBasis, string> = {
  none: "no sample",
  "prior-led": "mostly last season",
  blending: "blending seasons",
  "current-led": "mostly this season",
};

const NA = ({ why }: { why: string }) => (
  <span className="text-slate-400" title={why}>
    N/A
  </span>
);

const signed = (n: number): string => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;
const etTime = (utc: string): string =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(utc));

function DvpSeasonCell({ row, why }: { row: DvpRow | null | undefined; why: string }) {
  if (!row) return <NA why={why} />;
  return (
    <span title={`${row.gamesSampled} games sampled · ${Math.round(row.minutesCoverage * 100)}% of minutes attributed to a position`}>
      {row.allowedPerGame.toFixed(1)}
      <span className="ml-1 text-slate-500">{row.rank === null ? "#–" : `#${row.rank}`}</span>
    </span>
  );
}

const dvpWhy = (dvp: DvpState): string => {
  switch (dvp.kind) {
    case "no-position":
      return `No usable position: ${dvp.reason}`;
    case "no-opponent":
      return "Opponent unknown";
    case "no-dvp-data":
      return "No Defense vs. Position data for this opponent";
    case "ok":
      return "No data for this season";
  }
};

function HeaderButton({ label, sortKey, active, direction, onSort, align = "left" }: { label: string; sortKey: BoardSortKey; active: boolean; direction: SortDirection; onSort: (key: BoardSortKey) => void; align?: "left" | "right" }) {
  return (
    <button type="button" onClick={() => onSort(sortKey)} className={cn("inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500", align === "right" && "w-full justify-end")}>
      {label}
      {active ? direction === "asc" ? <ArrowUp size={10} aria-hidden /> : <ArrowDown size={10} aria-hidden /> : null}
    </button>
  );
}

export interface PropsBoardTableProps {
  rows: BoardRow[];
  sortKey: BoardSortKey;
  direction: SortDirection;
  onSort: (key: BoardSortKey) => void;
  marketLabel: string;
}

export default function PropsBoardTable({ rows, sortKey, direction, onSort, marketLabel }: PropsBoardTableProps) {
  const ariaSort = (key: BoardSortKey) => (sortKey === key ? (direction === "asc" ? "ascending" : "descending") : "none");
  const header = "border-b border-slate-200 px-3 py-2";
  const num = "px-3 py-1.5 text-right tabular-nums";
  return (
    <DenseTableScroller label={`${marketLabel} player props with sportsbook lines, JKB projections and Defense vs. Position`} className="rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[920px] border-separate border-spacing-0 text-[11px] sm:text-[12px]">
        <thead>
          <tr className={DENSE_TABLE_HEAD_ROW}>
            <th scope="col" aria-sort={ariaSort("player")} className={frozenDenseColumn({ isHeader: true, surface: "bg-slate-100", className: `${header} border-r text-left` })}>
              <HeaderButton label="Player" sortKey="player" active={sortKey === "player"} direction={direction} onSort={onSort} />
            </th>
            <th scope="col" aria-sort={ariaSort("line")} className={`${header} text-right`}>
              <HeaderButton label="Line" sortKey="line" active={sortKey === "line"} direction={direction} onSort={onSort} align="right" />
            </th>
            <th scope="col" aria-sort={ariaSort("projection")} className={`${header} text-right`}>
              <HeaderButton label="JKB proj" sortKey="projection" active={sortKey === "projection"} direction={direction} onSort={onSort} align="right" />
            </th>
            <th scope="col" aria-sort={ariaSort("difference")} className={`${header} text-right`}>
              <HeaderButton label="Proj − line" sortKey="difference" active={sortKey === "difference"} direction={direction} onSort={onSort} align="right" />
            </th>
            <th scope="col" className={`${header} text-right`}>
              {SEASON_LABEL["2025-26"]} DvP
            </th>
            <th scope="col" className={`${header} text-right`}>
              {SEASON_LABEL["2026-27"]} DvP
            </th>
            <th scope="col" className={`${header} text-right`} title="Games sampled: last season / this season">
              GP {SEASON_LABEL["2025-26"].slice(2)}/{SEASON_LABEL["2026-27"].slice(2)}
            </th>
            <th scope="col" aria-sort={ariaSort("dvpRank")} className={`${header} text-left`}>
              <HeaderButton label="Matchup" sortKey="dvpRank" active={sortKey === "dvpRank"} direction={direction} onSort={onSort} />
            </th>
            <th scope="col" className={`${header} text-left`}>
              Source
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                No {marketLabel} props match these filters.
              </td>
            </tr>
          ) : null}
          {rows.map(({ entry, difference, dvp }) => {
            const comparison = dvp.kind === "ok" ? dvp.comparison : null;
            const tier = comparison?.tier ?? null;
            return (
              <tr key={entry.entryKey} className={DENSE_TABLE_ROW}>
                <th scope="row" className={frozenDenseColumn({ surface: "bg-white", className: "border-r border-slate-100 px-3 py-1.5 text-left font-medium text-slate-900" })}>
                  <div className="whitespace-nowrap">{entry.playerName}</div>
                  <div className="whitespace-nowrap text-[10px] font-normal text-slate-500">
                    {entry.team ?? "—"} {entry.opponent ? `vs ${entry.opponent}` : ""} ·{" "}
                    {entry.positionLabel ? (
                      <span title={dvp.kind === "ok" && dvp.isMultiPosition ? `Multi-position label; DvP uses ${dvp.position}. Estimated, not verified minutes at a position.` : "Estimated position from depth charts and rotation roles, not verified minutes at a position."}>
                        {entry.positionLabel}
                        {dvp.kind === "ok" && dvp.isMultiPosition ? ` → ${dvp.position}` : ""} <span className="text-slate-400">(est.)</span>
                      </span>
                    ) : (
                      <span title="No estimated position for this player">pos N/A</span>
                    )}
                  </div>
                </th>
                <td className={num}>
                  {entry.line ? (
                    <>
                      <div className="font-semibold text-slate-900">{entry.line.line.toFixed(1)}</div>
                      <div className="whitespace-nowrap text-[10px] text-slate-500">
                        O {formatAmerican(entry.line.overPrice)} / U {formatAmerican(entry.line.underPrice)}
                      </div>
                    </>
                  ) : (
                    <NA why={entry.lineWithheldReason ?? "No line"} />
                  )}
                </td>
                <td className={num}>
                  {entry.projection ? (
                    <>
                      <div className="font-semibold text-slate-900">{entry.projection.value.toFixed(1)}</div>
                      {entry.projection.minutes !== null ? <div className="text-[10px] text-slate-500">{entry.projection.minutes.toFixed(0)} min</div> : null}
                    </>
                  ) : (
                    <NA why={entry.projectionUnavailableReason ?? "No projection"} />
                  )}
                </td>
                <td className={cn(num, "font-semibold", difference === null ? "" : difference > 0 ? "text-emerald-700" : difference < 0 ? "text-rose-700" : "text-slate-600")}>
                  {difference === null ? <NA why="Needs both a line and a projection" /> : signed(difference)}
                </td>
                <td className={num}>
                  <DvpSeasonCell row={comparison?.prior} why={dvpWhy(dvp)} />
                </td>
                <td className={num}>
                  <DvpSeasonCell row={comparison?.current} why={dvp.kind === "ok" ? "No games sampled this season yet" : dvpWhy(dvp)} />
                </td>
                <td className={cn(num, "text-slate-600")}>{comparison ? `${comparison.prior?.gamesSampled ?? 0}/${comparison.current?.gamesSampled ?? 0}` : <NA why={dvpWhy(dvp)} />}</td>
                <td className="px-3 py-1.5 text-left">
                  {comparison?.blended && tier ? (
                    <span title={`Blended allowed ${comparison.blended.allowedPerGame.toFixed(1)} (${Math.round(comparison.blended.currentWeight * 100)}% this season). ${BASIS_LABEL[comparison.sampleBasis]}.`}>
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", TIER_CLASS[tier])}>{TIER_LABEL[tier]}</span>
                      <span className="ml-1 tabular-nums text-slate-600">#{comparison.blended.rank}</span>
                      <span className="ml-1 text-[10px] text-slate-500">{BASIS_LABEL[comparison.sampleBasis]}</span>
                    </span>
                  ) : (
                    <NA why={dvpWhy(dvp)} />
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-left text-[10px] text-slate-500">
                  {entry.line ? (
                    <>
                      {entry.line.sportsbook} · {etTime(entry.line.capturedAtUtc)} ET
                      {entry.line.freshness === "stale" ? <span className="ml-1 rounded bg-amber-100 px-1 font-semibold text-amber-800">stale</span> : null}
                    </>
                  ) : (
                    <span title={entry.lineWithheldReason ?? undefined}>{entry.lineWithheldReason ?? "no line"}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </DenseTableScroller>
  );
}
