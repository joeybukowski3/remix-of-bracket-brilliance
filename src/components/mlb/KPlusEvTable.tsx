import { Fragment, useMemo, useState, type KeyboardEvent } from "react";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import { useIsCompactLayout } from "@/hooks/useIsCompactLayout";
import { cn } from "@/lib/utils";
import {
  compareKPlusEvRows,
  formatAmericanOdds,
  formatEvPercent,
  type KPlusEvValuation,
  type KPlusEvValueLabel,
} from "@/lib/mlb/kPlusEvModel";

export type KPlusEvSortKey = "pitcher" | "kLine" | "seasonKPerIP" | "trend" | "matchup" | "jkbProjectedK" | "jkbOverProbability" | "ev" | "label";

export type KPlusEvValueFilter = "all" | KPlusEvValueLabel;

function labelTone(label: KPlusEvValueLabel): string {
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

function fmtNum(value: number | null | undefined, digits = 2): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function fmtInt(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value)) : "—";
}

function fmtPct(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";
}

function fmtMultiplier(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}x` : "—";
}

function ValueBadge({ label }: { label: KPlusEvValueLabel }) {
  return (
    <span data-k-plus-ev-label={label} className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold", labelTone(label))}>
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

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">{title}</div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">{children}</div>
    </div>
  );
}

function KPlusEvDetails({ row }: { row: KPlusEvValuation }) {
  const { seasonBaseline, trend, workload, location, matchup, projection, market } = row;
  return (
    <div data-k-plus-ev-details={row.pitcher} className="space-y-3">
      <DetailSection title="A. Season Baseline">
        <DetailItem label="Season K" value={fmtInt(seasonBaseline.seasonStrikeouts)} />
        <DetailItem label="Season IP" value={fmtNum(seasonBaseline.seasonDecimalIP, 3)} />
        <DetailItem label="Season K/IP" value={fmtNum(seasonBaseline.seasonKPerIP)} />
        <DetailItem label="Season starts" value={fmtInt(seasonBaseline.seasonStarts)} />
        <DetailItem label="K/start" value={fmtNum(seasonBaseline.seasonKPerStart)} />
        <DetailItem label="Pitches/start" value={fmtNum(seasonBaseline.seasonPitchesPerStart, 1)} />
        <DetailItem label="Pitches/IP" value={fmtNum(seasonBaseline.seasonPitchesPerInning)} />
      </DetailSection>

      <DetailSection title="B. Recent K Trend">
        <DetailItem label="L8 K/IP" value={fmtNum(trend.l8KPerIP)} note={trend.l8KPerIP == null ? "L8 window unavailable — neutral ratio used." : trend.r8 >= 1 ? "↑ vs season" : "↓ vs season"} />
        <DetailItem label="L4 K/IP" value={fmtNum(trend.l4KPerIP)} note={trend.l4KPerIP == null ? "L4 window unavailable — neutral ratio used." : trend.r4 >= 1 ? "↑ vs season" : "↓ vs season"} />
        <DetailItem label="r8 (L8 / Season)" value={fmtNum(trend.r8, 3)} />
        <DetailItem label="r4 (L4 / Season)" value={fmtNum(trend.r4, 3)} />
        <DetailItem label="TrendFactor" value={fmtNum(trend.trendFactor, 3)} note="Clamped 0.90–1.10" />
      </DetailSection>

      <DetailSection title="C. Workload Projection">
        <DetailItem
          label="Expected pitch count"
          value={fmtNum(workload.expectedPitchCount, 1)}
          note={workload.expectedPitchCountFellBackToSeason ? "L4 pitches/start unavailable — season pitches/start used." : "70% season / 30% L4 pitches/start"}
        />
        <DetailItem
          label="Projected pitches/inning"
          value={fmtNum(workload.projectedPitchesPerInning)}
          note={
            workload.l8PitchesPerInningFellBackToSeason || workload.l4PitchesPerInningFellBackToSeason
              ? "One or more recent windows unavailable — season P/IP substituted."
              : "70% season / 20% L8 / 10% L4"
          }
        />
        <DetailItem label="Expected IP (raw)" value={fmtNum(workload.expectedIPRaw)} />
        <DetailItem label="Expected IP" value={fmtNum(workload.expectedIP)} note="Clamped 3.0–7.0" />
      </DetailSection>

      <DetailSection title="D. Home / Away">
        <DetailItem label="Today" value={row.isHome == null ? "—" : row.isHome ? "Home" : "Away"} />
        <DetailItem label="Split K" value={fmtInt(location.relevantSplitKs)} />
        <DetailItem label="Split IP" value={fmtNum(location.relevantSplitDecimalIP, 3)} />
        <DetailItem label="Split starts" value={fmtInt(location.relevantSplitStarts)} />
        <DetailItem label="Split K/IP" value={fmtNum(location.relevantSplitKPerIP)} />
        <DetailItem
          label="LocationRatio"
          value={fmtNum(location.locationRatio, 3)}
          note={location.samplePassed ? "Sample gate passed (≥8 starts or ≥40 IP)." : "Sample gate not met — neutral 1.00 used."}
        />
      </DetailSection>

      <DetailSection title="E. Matchup">
        <DetailItem label="Pitcher hand" value={row.pitcherHand ?? "—"} />
        <DetailItem label="Opponent source" value={matchup.opponentKRatioSource} note="LINEUP → TEAM_FALLBACK → NEUTRAL" />
        <DetailItem label="OpponentKRatio" value={fmtNum(matchup.opponentKRatio, 3)} />
        <DetailItem label="MatchupMultiplier" value={fmtMultiplier(matchup.matchupMultiplier)} note="Clamped 0.92–1.08" />
      </DetailSection>

      <DetailSection title="F. JKB Projection">
        <DetailItem label="Season K/IP" value={fmtNum(projection?.seasonKPerIP ?? null)} />
        <DetailItem label="TrendFactor" value={fmtNum(projection?.trendFactor ?? null, 3)} />
        <DetailItem label="Trend-adjusted K/IP" value={fmtNum(projection?.trendAdjustedKPerIP ?? null)} />
        <DetailItem label="MatchupMultiplier" value={fmtMultiplier(projection?.matchupMultiplier ?? null)} />
        <DetailItem label="Final JKB K/IP" value={fmtNum(projection?.jkbKPerIP ?? null)} />
        <DetailItem label="Projected IP" value={fmtNum(projection?.expectedIP ?? null)} />
        <DetailItem label="CurrentProjectedK" value={fmtNum(projection?.currentProjectedK ?? null)} />
        <DetailItem label="JKBProjectedK" value={fmtNum(projection?.jkbProjectedK ?? null)} />
        <DetailItem label="Current Over %" value={fmtPct(market.currentOverProbability)} />
        <DetailItem label="JKB Over %" value={fmtPct(market.jkbOverProbability)} />
      </DetailSection>

      <DetailSection title="G. Market / Value">
        <DetailItem
          label="K line"
          value={market.requiredKsOver != null ? String(market.requiredKsOver - (market.isWholeNumberLine ? 1 : 0.5)) : "—"}
          note={market.requiredKsOver != null ? `Over requires ${market.requiredKsOver}+ Ks` : null}
        />
        <DetailItem label="Book Over odds" value={formatAmericanOdds(market.bookOverOdds)} />
        <DetailItem label="Book Under odds" value={formatAmericanOdds(market.bookUnderOdds)} />
        <DetailItem label="Book implied %" value={fmtPct(market.bookImpliedProbability)} />
        <DetailItem label="Current Rate Fair" value={formatAmericanOdds(market.currentRateFairOdds)} />
        <DetailItem label="JKB Fair" value={formatAmericanOdds(market.jkbFairOdds)} />
        <DetailItem label="Probability edge" value={market.probabilityEdge == null ? "—" : `${market.probabilityEdge >= 0 ? "+" : ""}${(market.probabilityEdge * 100).toFixed(1)} pp`} />
        <DetailItem label="+EV" value={formatEvPercent(market.ev)} />
        <DetailItem label="Value" value={row.label} />
        {market.isWholeNumberLine ? <DetailItem label="Push %" value={fmtPct(market.pushProbability)} note="Whole-number line — push-aware EV path" /> : null}
      </DetailSection>

      {row.unavailableReasons.length ? <p className="text-[11px] leading-5 text-slate-500">{row.unavailableReasons.join(" ")}</p> : null}
    </div>
  );
}

const VALUE_FILTERS: Array<{ key: KPlusEvValueFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "STRONG +EV", label: "Strong +EV" },
  { key: "MODERATE +EV", label: "Moderate +EV" },
  { key: "FAIR", label: "Fair" },
  { key: "OVERPRICED", label: "Overpriced" },
];

function sortRows(rows: KPlusEvValuation[], key: KPlusEvSortKey, direction: "asc" | "desc"): KPlusEvValuation[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const pick = (row: KPlusEvValuation): number | string | null => {
      if (key === "pitcher") return row.pitcher;
      if (key === "kLine") return row.market.requiredKsOver;
      if (key === "seasonKPerIP") return row.seasonBaseline.seasonKPerIP;
      if (key === "trend") return row.trend.trendFactor;
      if (key === "matchup") return row.matchup.matchupMultiplier;
      if (key === "jkbProjectedK") return row.projection?.jkbProjectedK ?? null;
      if (key === "jkbOverProbability") return row.market.jkbOverProbability;
      if (key === "label") return row.label;
      return row.market.ev;
    };
    const leftValue = pick(left);
    const rightValue = pick(right);
    if (typeof leftValue === "string" && typeof rightValue === "string") return sign * leftValue.localeCompare(rightValue);
    const leftNum = typeof leftValue === "number" ? leftValue : null;
    const rightNum = typeof rightValue === "number" ? rightValue : null;
    if (leftNum == null && rightNum == null) return left.pitcher.localeCompare(right.pitcher);
    if (leftNum == null) return 1;
    if (rightNum == null) return -1;
    if (leftNum !== rightNum) return sign * (leftNum - rightNum);
    return left.pitcher.localeCompare(right.pitcher);
  });
}

export default function KPlusEvTable({ rows, compact }: { rows: KPlusEvValuation[]; compact?: boolean }) {
  const hookCompact = useIsCompactLayout();
  const isCompact = compact ?? hookCompact;
  const [sortKey, setSortKey] = useState<KPlusEvSortKey>("ev");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [valueFilter, setValueFilter] = useState<KPlusEvValueFilter>("all");

  const pricedTotal = useMemo(() => rows.filter((row) => row.available).length, [rows]);
  const filtered = useMemo(
    () => (valueFilter === "all" ? rows : rows.filter((row) => row.label === valueFilter)),
    [rows, valueFilter],
  );
  const sorted = useMemo(() => {
    if (sortKey === "ev" && sortDirection === "desc") return [...filtered].sort(compareKPlusEvRows);
    return sortRows(filtered, sortKey, sortDirection);
  }, [filtered, sortDirection, sortKey]);
  const pricedVisible = sorted.filter((row) => row.available).length;

  const handleSort = (key: KPlusEvSortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "pitcher" || key === "label" ? "asc" : "desc");
  };

  const toggleRow = (row: KPlusEvValuation) => {
    const key = `${row.pitcher}|${row.team}|${row.opponent}`;
    setExpandedKey((current) => (current === key ? null : key));
  };

  const sortMark = (key: KPlusEvSortKey) => (sortKey === key ? (sortDirection === "desc" ? " ↓" : " ↑") : "");

  const toolbar = (
    <div data-k-plus-ev-filters="true" className="space-y-2 border-b border-slate-200 px-3 py-2.5">
      <div className="flex gap-1 overflow-x-auto pb-0.5" role="group" aria-label="Value">
        {VALUE_FILTERS.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={valueFilter === option.key}
            onClick={() => setValueFilter(option.key)}
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition",
              valueFilter === option.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div data-k-plus-ev-count="true" className="text-[11px] text-slate-500">
        {pricedVisible} of {pricedTotal} priced starters
        {valueFilter === "all" && rows.length > pricedTotal ? ` · ${rows.length - pricedTotal} unavailable` : ""}
      </div>
    </div>
  );

  const emptyMessage = rows.length ? "No +EV rows match the current filter." : "No eligible starters for today's slate.";

  if (isCompact) {
    return (
      <div data-k-plus-ev-table="mobile">
        {toolbar}
        {sorted.length ? (
          <div className="divide-y divide-slate-100">
            {sorted.map((row, index) => {
              const key = `${row.pitcher}|${row.team}|${row.opponent}`;
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
                    aria-label={`${expanded ? "Hide" : "Show"} +EV details for ${row.pitcher}`}
                    onClick={() => toggleRow(row)}
                    onKeyDown={onKeyDown}
                    className="flex cursor-pointer items-center gap-2 px-3 py-2.5"
                  >
                    <span aria-hidden="true" className={cn("shrink-0 text-[10px] text-slate-400 transition-transform", expanded && "rotate-90")}>▶</span>
                    <MlbTeamLogo team={row.team} size={22} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-slate-900">{row.pitcher}</div>
                      <div className="truncate text-[11px] text-slate-400">
                        vs {row.opponent} · K {row.market.requiredKsOver != null ? row.market.requiredKsOver - (row.market.isWholeNumberLine ? 1 : 0.5) : "—"}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <div className="flex items-center gap-1 text-[10px] font-bold tabular-nums text-slate-600">
                        <span>{formatAmericanOdds(row.market.bookOverOdds)}</span>
                        <span className="text-slate-300">/</span>
                        <span>{formatAmericanOdds(row.market.jkbFairOdds)}</span>
                      </div>
                      <span className={cn("text-[12px] font-black tabular-nums", evTone(row.market.ev))}>{formatEvPercent(row.market.ev)}</span>
                      <ValueBadge label={row.label} />
                    </div>
                  </div>
                  {expanded ? (
                    <div className="bg-slate-50 px-3 pb-3 pt-1">
                      <KPlusEvDetails row={row} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div data-k-plus-ev-empty="true" className="px-3 py-6 text-center text-sm text-slate-500">{emptyMessage}</div>
        )}
      </div>
    );
  }

  return (
    <div data-k-plus-ev-table="desktop">
      {toolbar}
      {sorted.length ? (
        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-separate border-spacing-0 text-xs">
            <thead className="sticky top-0 z-20">
              <tr className="text-[10px] uppercase tracking-[0.08em] text-slate-500">
                {([
                  ["pitcher", "Pitcher"],
                  ["kLine", "K Line"],
                  ["bookOdds" as KPlusEvSortKey, "Book Odds"],
                  ["seasonKPerIP", "Season K/IP"],
                  ["currentFair" as KPlusEvSortKey, "Current Rate Fair"],
                  ["jkbFair" as KPlusEvSortKey, "JKB Fair"],
                  ["trend", "K Trend"],
                  ["projIP" as KPlusEvSortKey, "Proj IP"],
                  ["matchup", "Matchup"],
                  ["jkbProjectedK", "JKB Proj K"],
                  ["jkbOverProbability", "JKB Over %"],
                  ["ev", "+EV"],
                  ["label", "Value"],
                ] as Array<[KPlusEvSortKey, string]>).map(([key, label]) => (
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
                const key = `${row.pitcher}|${row.team}|${row.opponent}`;
                const expanded = expandedKey === key;
                const rowBg = index % 2 === 0 ? "bg-white" : "bg-slate-50/70";
                const onKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleRow(row);
                  }
                };
                const line = row.market.requiredKsOver != null ? row.market.requiredKsOver - (row.market.isWholeNumberLine ? 1 : 0.5) : null;
                return (
                  <Fragment key={key}>
                    <tr
                      role="button"
                      tabIndex={0}
                      aria-expanded={expanded}
                      aria-label={`${expanded ? "Hide" : "Show"} +EV details for ${row.pitcher}`}
                      onClick={() => toggleRow(row)}
                      onKeyDown={onKeyDown}
                      className={cn("cursor-pointer", rowBg)}
                    >
                      <td className="border-b border-slate-100 px-2 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span aria-hidden="true" className={cn("text-[10px] text-slate-400 transition-transform", expanded && "rotate-90")}>▶</span>
                          <MlbTeamLogo team={row.team} size={18} />
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-slate-900">{row.pitcher}</div>
                            <div className="truncate text-[10px] text-slate-400">vs {row.opponent}</div>
                          </div>
                        </div>
                      </td>
                      <td className="border-b border-slate-100 px-2 py-2 font-semibold tabular-nums text-slate-700">{line ?? "—"}</td>
                      <td className="border-b border-slate-100 px-2 py-2 font-semibold tabular-nums text-slate-800">{formatAmericanOdds(row.market.bookOverOdds)}</td>
                      <td className="border-b border-slate-100 px-2 py-2 tabular-nums text-slate-700">{fmtNum(row.seasonBaseline.seasonKPerIP)}</td>
                      <td className="border-b border-slate-100 px-2 py-2 font-semibold tabular-nums text-slate-800">{formatAmericanOdds(row.market.currentRateFairOdds)}</td>
                      <td className="border-b border-slate-100 px-2 py-2 font-semibold tabular-nums text-slate-800">{formatAmericanOdds(row.market.jkbFairOdds)}</td>
                      <td className="border-b border-slate-100 px-2 py-2 tabular-nums text-slate-700">{fmtNum(row.trend.trendFactor, 3)}</td>
                      <td className="border-b border-slate-100 px-2 py-2 tabular-nums text-slate-700">{fmtNum(row.workload.expectedIP)}</td>
                      <td className="border-b border-slate-100 px-2 py-2 tabular-nums text-slate-700">{fmtMultiplier(row.matchup.matchupMultiplier)}</td>
                      <td className="border-b border-slate-100 px-2 py-2 font-semibold tabular-nums text-slate-800">{fmtNum(row.projection?.jkbProjectedK ?? null)}</td>
                      <td className="border-b border-slate-100 px-2 py-2 tabular-nums text-slate-700">{fmtPct(row.market.jkbOverProbability)}</td>
                      <td className={cn("border-b border-slate-100 px-2 py-2 font-black tabular-nums", evTone(row.market.ev))}>{formatEvPercent(row.market.ev)}</td>
                      <td className="border-b border-slate-100 px-2 py-2">
                        <ValueBadge label={row.label} />
                      </td>
                    </tr>
                    {expanded ? (
                      <tr className="bg-slate-50">
                        <td colSpan={13} className="border-b border-slate-100 px-3 py-3">
                          <KPlusEvDetails row={row} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div data-k-plus-ev-empty="true" className="px-3 py-6 text-center text-sm text-slate-500">{emptyMessage}</div>
      )}
    </div>
  );
}
