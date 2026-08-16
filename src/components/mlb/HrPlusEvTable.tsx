import { Fragment, useMemo, useState, type KeyboardEvent } from "react";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import { useIsCompactLayout } from "@/hooks/useIsCompactLayout";
import { cn } from "@/lib/utils";
import {
  comparePlusEvRows,
  formatAmericanOdds,
  formatEvPercent,
  formatHrPaRate,
  formatMultiplier,
  formatProbabilityPercent,
  type HrPlusEvValuation,
  type MatchupFactorKey,
} from "@/lib/mlb/hrPlusEvModel";

export type PlusEvSortKey =
  | "player"
  | "bookOdds"
  | "seasonHrPa"
  | "trend"
  | "matchup"
  | "jkbHrProbability"
  | "fairOdds"
  | "ev"
  | "label";

const FACTOR_ORDER: MatchupFactorKey[] = [
  "starter",
  "hitterHandedness",
  "pitcherHandedness",
  "bullpen",
  "park",
  "weather",
  "recentTrend",
];

function labelTone(label: HrPlusEvValuation["label"]): string {
  if (label === "STRONG +EV") return "bg-emerald-100 text-emerald-800";
  if (label === "MODERATE +EV") return "bg-sky-100 text-sky-800";
  if (label === "FAIR") return "bg-slate-100 text-slate-700";
  if (label === "OVERPRICED") return "bg-rose-100 text-rose-800";
  return "bg-slate-200 text-slate-500";
}

function evTone(ev: number | null): string {
  if (ev == null) return "text-slate-400";
  if (ev >= 0.15) return "text-emerald-700";
  if (ev >= 0.05) return "text-sky-700";
  if (ev > -0.05) return "text-slate-700";
  return "text-rose-700";
}

function trendDisplay(row: HrPlusEvValuation): string {
  if (row.last50HrPa != null) return formatHrPaRate(row.last50HrPa);
  if (row.last100HrPa != null) return formatHrPaRate(row.last100HrPa);
  return "—";
}

function sortRows(rows: HrPlusEvValuation[], key: PlusEvSortKey, direction: "asc" | "desc"): HrPlusEvValuation[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const numeric = (value: number | null): number | null => value;
    const pick = (row: HrPlusEvValuation): number | string | null => {
      if (key === "player") return row.player;
      if (key === "bookOdds") return row.bookOddsAmerican;
      if (key === "seasonHrPa") return row.seasonHrPa;
      if (key === "trend") return row.last50HrPa ?? row.last100HrPa;
      if (key === "matchup") return row.totalMatchupMultiplier;
      if (key === "jkbHrProbability") return row.jkbHrProbability;
      if (key === "fairOdds") return row.fairOddsAmerican;
      if (key === "label") return row.label;
      return row.ev;
    };
    const leftValue = pick(left);
    const rightValue = pick(right);
    if (typeof leftValue === "string" && typeof rightValue === "string") {
      return sign * leftValue.localeCompare(rightValue);
    }
    const leftNum = typeof leftValue === "number" ? numeric(leftValue) : null;
    const rightNum = typeof rightValue === "number" ? numeric(rightValue) : null;
    if (leftNum == null && rightNum == null) return left.player.localeCompare(right.player);
    if (leftNum == null) return 1;
    if (rightNum == null) return -1;
    if (leftNum !== rightNum) return sign * (leftNum - rightNum);
    return left.player.localeCompare(right.player);
  });
}

function ValueBadge({ label }: { label: HrPlusEvValuation["label"] }) {
  return (
    <span
      data-plus-ev-label={label}
      className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold", labelTone(label))}
    >
      {label}
    </span>
  );
}

function DetailItem({ label, value, note }: { label: string; value: string; note?: string | null }) {
  return (
    <div className="rounded-md bg-white px-2 py-1.5">
      <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-[12px] font-semibold tabular-nums text-slate-800">{value}</div>
      {note ? <div className="mt-0.5 text-[10px] leading-4 text-slate-500">{note}</div> : null}
    </div>
  );
}

function PlusEvDetails({ row }: { row: HrPlusEvValuation }) {
  return (
    <div data-plus-ev-details={row.player} className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        <DetailItem
          label="Season HR/PA"
          value={row.seasonHrPa == null ? "—" : `${row.seasonHomeRuns}/${row.seasonPlateAppearances} (${formatHrPaRate(row.seasonHrPa)})`}
        />
        <DetailItem
          label="Last 100 PA HR/PA"
          value={row.last100HrPa == null ? "—" : `${row.last100HomeRuns}/${row.last100PlateAppearances} (${formatHrPaRate(row.last100HrPa)})`}
          note={row.last100HrPa == null ? "Unavailable — no completed last-100-PA window." : null}
        />
        <DetailItem
          label="Last 50 PA HR/PA"
          value={row.last50HrPa == null ? "—" : `${row.last50HomeRuns}/${row.last50PlateAppearances} (${formatHrPaRate(row.last50HrPa)})`}
          note={row.last50HrPa == null ? "Unavailable — no completed last-50-PA window." : null}
        />
        <DetailItem
          label="Batting order / expected PA"
          value={`${row.battingOrder ?? "—"} / ${row.expectedPa.toFixed(1)}`}
          note={row.expectedPaSource === "fallback" ? "Order unavailable; fallback 4.2 PA used." : null}
        />
        <DetailItem
          label="Hitter handedness"
          value={`${row.bats ?? "—"} vs ${row.pitcherHand ?? "—"}HP`}
          note={row.hitterHandHrPa == null ? "Matching split unavailable." : `${row.hitterHandSplitHomeRuns}/${row.hitterHandSplitPlateAppearances} (${formatHrPaRate(row.hitterHandHrPa)})`}
        />
        <DetailItem label="Total multiplier" value={formatMultiplier(row.totalMatchupMultiplier)} />
        <DetailItem
          label="Pitching exposure"
          value={formatMultiplier(row.pitchingExposure)}
          note="65% starter / 35% bullpen"
        />
        <DetailItem label="Adjusted HR/PA" value={formatHrPaRate(row.adjustedHrPa)} />
        <DetailItem label="JKB HR%" value={formatProbabilityPercent(row.jkbHrProbability)} />
        <DetailItem label="Book implied %" value={formatProbabilityPercent(row.bookImpliedProbability)} />
        <DetailItem
          label="Probability edge"
          value={row.probabilityEdge == null ? "—" : `${row.probabilityEdge >= 0 ? "+" : ""}${(row.probabilityEdge * 100).toFixed(1)} pp`}
        />
        <DetailItem label="Fair odds" value={formatAmericanOdds(row.fairOddsAmerican)} />
        <DetailItem label="Book odds" value={row.bookOddsRaw ?? formatAmericanOdds(row.bookOddsAmerican)} />
        <DetailItem label="+EV" value={formatEvPercent(row.ev)} />
        <DetailItem label="Value" value={row.label} />
      </div>

      <div>
        <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Matchup factors</div>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {FACTOR_ORDER.map((key) => {
            const factor = row.factors[key];
            return (
              <div key={key} className="rounded-md bg-white px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-slate-700">{factor.label}</span>
                  <span className="text-[11px] font-bold tabular-nums text-slate-800">
                    {formatMultiplier(factor.multiplier)}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] text-slate-400">
                  Weight {(factor.weight * 100).toFixed(0)}%
                  {factor.status === "neutral-missing" ? " · defaulted to 1.00x" : ""}
                </div>
                {factor.reason ? <div className="mt-0.5 text-[10px] leading-4 text-slate-500">{factor.reason}</div> : null}
              </div>
            );
          })}
        </div>
      </div>

      {row.unavailableReasons.length ? (
        <p className="text-[11px] leading-5 text-slate-500">{row.unavailableReasons.join(" ")}</p>
      ) : null}
    </div>
  );
}

export default function HrPlusEvTable({
  rows,
  compact,
}: {
  rows: HrPlusEvValuation[];
  compact?: boolean;
}) {
  const hookCompact = useIsCompactLayout();
  const isCompact = compact ?? hookCompact;
  const [sortKey, setSortKey] = useState<PlusEvSortKey>("ev");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const sorted = useMemo(() => {
    if (sortKey === "ev" && sortDirection === "desc") {
      return [...rows].sort(comparePlusEvRows);
    }
    return sortRows(rows, sortKey, sortDirection);
  }, [rows, sortDirection, sortKey]);

  const handleSort = (key: PlusEvSortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "player" || key === "label" ? "asc" : "desc");
  };

  const toggleRow = (row: HrPlusEvValuation) => {
    const key = `${row.player}|${row.team}|${row.opponent}`;
    setExpandedKey((current) => (current === key ? null : key));
  };

  const sortMark = (key: PlusEvSortKey) => (sortKey === key ? (sortDirection === "desc" ? " ↓" : " ↑") : "");

  if (!sorted.length) {
    return (
      <div data-plus-ev-table="empty" className="px-3 py-6 text-center text-sm text-slate-500">
        No batters match the current search or game filter.
      </div>
    );
  }

  if (isCompact) {
    return (
      <div data-plus-ev-table="mobile" className="divide-y divide-slate-100">
        {sorted.map((row, index) => {
          const key = `${row.player}|${row.team}|${row.opponent}`;
          const expanded = expandedKey === key;
          const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              toggleRow(row);
            }
          };
          return (
            <div key={key} className={index % 2 === 0 ? "bg-white" : "bg-slate-50/70"}>
              <div
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
                aria-label={`${expanded ? "Hide" : "Show"} +EV details for ${row.player}`}
                onClick={() => toggleRow(row)}
                onKeyDown={onKeyDown}
                className="flex cursor-pointer items-center gap-2 px-3 py-2.5"
              >
                <span aria-hidden="true" className={cn("shrink-0 text-[10px] text-slate-400 transition-transform", expanded && "rotate-90")}>▶</span>
                <MlbTeamLogo team={row.team} size={22} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-slate-900">{row.player}</div>
                  <div className="truncate text-[11px] text-slate-400">vs {row.opposingPitcher}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <div className="flex items-center gap-1 text-[10px] font-bold tabular-nums text-slate-600">
                    <span>{row.bookOddsRaw ?? "—"}</span>
                    <span className="text-slate-300">/</span>
                    <span>{formatAmericanOdds(row.fairOddsAmerican)}</span>
                  </div>
                  <span className={cn("text-[12px] font-black tabular-nums", evTone(row.ev))}>{formatEvPercent(row.ev)}</span>
                  <ValueBadge label={row.label} />
                </div>
              </div>
              {expanded ? (
                <div className="bg-slate-50 px-3 pb-3 pt-1">
                  <PlusEvDetails row={row} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div data-plus-ev-table="desktop" className="overflow-x-auto">
      <table className="w-full table-fixed border-separate border-spacing-0 text-xs">
        <thead className="sticky top-0 z-20">
          <tr className="text-[10px] uppercase tracking-[0.08em] text-slate-500">
            {([
              ["player", "Batter"],
              ["bookOdds", "Book Odds"],
              ["seasonHrPa", "HR/PA"],
              ["trend", "HR Trend"],
              ["matchup", "Matchup"],
              ["jkbHrProbability", "JKB HR%"],
              ["fairOdds", "Fair Odds"],
              ["ev", "+EV"],
              ["label", "Value"],
            ] as Array<[PlusEvSortKey, string]>).map(([key, label]) => (
              <th key={key} className="border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-left font-bold">
                <button type="button" onClick={() => handleSort(key)} className="hover:text-slate-900">
                  {label}{sortMark(key)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, index) => {
            const key = `${row.player}|${row.team}|${row.opponent}`;
            const expanded = expandedKey === key;
            const rowBg = index % 2 === 0 ? "bg-white" : "bg-slate-50/70";
            const onKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggleRow(row);
              }
            };
            return (
              <Fragment key={key}>
                <tr
                  role="button"
                  tabIndex={0}
                  aria-expanded={expanded}
                  aria-label={`${expanded ? "Hide" : "Show"} +EV details for ${row.player}`}
                  onClick={() => toggleRow(row)}
                  onKeyDown={onKeyDown}
                  className={cn("cursor-pointer", rowBg)}
                >
                  <td className="border-b border-slate-100 px-2 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span aria-hidden="true" className={cn("text-[10px] text-slate-400 transition-transform", expanded && "rotate-90")}>▶</span>
                      <MlbTeamLogo team={row.team} size={18} />
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-900">{row.player}</div>
                        <div className="truncate text-[10px] text-slate-400">vs {row.opposingPitcher}</div>
                      </div>
                    </div>
                  </td>
                  <td className="border-b border-slate-100 px-2 py-2 font-semibold tabular-nums text-slate-700">
                    {row.bookOddsRaw ?? "—"}
                  </td>
                  <td className="border-b border-slate-100 px-2 py-2 tabular-nums text-slate-700">
                    {formatHrPaRate(row.seasonHrPa)}
                  </td>
                  <td className="border-b border-slate-100 px-2 py-2 tabular-nums text-slate-700">
                    {trendDisplay(row)}
                  </td>
                  <td className="border-b border-slate-100 px-2 py-2 font-semibold tabular-nums text-slate-800">
                    {formatMultiplier(row.totalMatchupMultiplier)}
                  </td>
                  <td className="border-b border-slate-100 px-2 py-2 tabular-nums text-slate-700">
                    {formatProbabilityPercent(row.jkbHrProbability)}
                  </td>
                  <td className="border-b border-slate-100 px-2 py-2 tabular-nums text-slate-700">
                    {formatAmericanOdds(row.fairOddsAmerican)}
                  </td>
                  <td className={cn("border-b border-slate-100 px-2 py-2 font-black tabular-nums", evTone(row.ev))}>
                    {formatEvPercent(row.ev)}
                  </td>
                  <td className="border-b border-slate-100 px-2 py-2">
                    <ValueBadge label={row.label} />
                  </td>
                </tr>
                {expanded ? (
                  <tr className="bg-slate-50">
                    <td colSpan={9} className="border-b border-slate-100 px-3 py-3">
                      <PlusEvDetails row={row} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
