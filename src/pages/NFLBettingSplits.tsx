import { useMemo, useState } from "react";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import { DenseTableScroller, DENSE_TABLE_HEAD_ROW, DENSE_TABLE_ROW } from "@/components/ui/dense-table";
import TeamLogo from "@/components/TeamLogo";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { useNflBettingSplits } from "@/hooks/useNflBettingSplits";
import { useCurrentNflWeek } from "@/hooks/useCurrentNflWeek";
import { usePageSeo } from "@/hooks/usePageSeo";
import { formatNflMetadataTimestamp } from "@/lib/nfl/provenance";
import { moneyGap, publicGap } from "@/lib/nfl/bettingSplitsData";
import { formatSplitsGap, formatSplitsLine, formatSplitsOdds, sharpSides, splitsMatchupRows, splitsRows, type SplitsMarket, type SplitsMatchupRow, type SplitsRow } from "@/lib/nfl/bettingSplitsView";
import { cn } from "@/lib/utils";

type Tab = "overview" | SplitsMarket;
type Metric = "handlePct" | "betsPct";
type RankingSort = "highest" | "lowest" | "value-high" | "value-low" | "az";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" }, { id: "spread", label: "Spread" },
  { id: "moneyline", label: "Moneyline" }, { id: "total", label: "Total" },
];

function TeamMark({ abbr }: { abbr: string }) {
  return <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap font-semibold text-slate-900"><TeamLogo name={abbr.toUpperCase()} logo={nflLogoUrl(abbr)} fallbackLabel={abbr.slice(0, 2).toUpperCase()} className="h-5 w-5 bg-transparent" /><span>{abbr.toUpperCase()}</span></span>;
}
function MatchupMark({ away, home }: { away: string; home: string }) {
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><TeamMark abbr={away} /><span className="text-slate-400">@</span><TeamMark abbr={home} /></span>;
}
function matchupNumbers(row: SplitsMatchupRow) {
  const favored = row.game.markets.spread.find((side) => side.line !== null && side.line < 0);
  const spread = favored ? `${favored.side === "away" ? row.game.away : row.game.home} ${formatSplitsLine("spread", favored.line)}` : "Spread —";
  return `${spread.toUpperCase()} · O/U ${formatSplitsLine("total", row.total.handle.line)}`;
}
function GapBadge({ gap }: { gap: number }) {
  return <span className={cn("inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums", gap > 0 ? "bg-emerald-50 text-emerald-800" : gap < 0 ? "bg-rose-50 text-rose-800" : "bg-slate-100 text-slate-700")}>{formatSplitsGap(gap)}</span>;
}
function SplitBars({ handlePct, betsPct, compact = false }: { handlePct: number; betsPct: number; compact?: boolean }) {
  return <div className={cn("space-y-1", compact ? "text-[10px]" : "text-[11px]")}>
    {([["Money", handlePct, "bg-sky-700"], ["Tickets", betsPct, "bg-sky-300"]] as const).map(([label, value, color]) => <div key={label} className="grid grid-cols-[2.6rem_minmax(0,1fr)_2rem] items-center gap-1.5"><span className="text-slate-600">{label}</span><span className="h-1.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${label} ${value}%`}><span className={cn("block h-full rounded-full", color)} style={{ width: `${value}%` }} /></span><span className="text-right font-semibold tabular-nums text-slate-800">{value}%</span></div>)}
  </div>;
}
function sideName(row: SplitsRow) {
  return row.side.side === "away" ? row.game.away.toUpperCase() : row.side.side === "home" ? row.game.home.toUpperCase() : row.side.side === "over" ? "Over" : "Under";
}
function sideValue(row: SplitsRow) {
  return row.market === "moneyline" ? formatSplitsOdds(row.side.odds) : formatSplitsLine(row.market, row.side.line);
}
function displayedSide(row: SplitsMatchupRow, market: SplitsMarket): SplitsRow {
  const side = row[market].handle;
  return { game: row.game, market, side, gap: moneyGap(side), publicGap: publicGap(side) };
}
function MarketSplit({ row, compact = false }: { row: SplitsRow; compact?: boolean }) {
  return <div className={cn("min-w-0", compact ? "grid grid-cols-[4.4rem_minmax(0,1fr)] gap-2" : "space-y-1.5")}>
    <div className={cn("flex items-center gap-1 font-semibold text-slate-900", compact ? "flex-col items-start justify-center text-[11px]" : "text-xs")}><span className="whitespace-nowrap">{sideName(row)} <span className="tabular-nums">{sideValue(row)}</span></span>{!compact && <GapBadge gap={row.gap} />}</div>
    <div className="min-w-0"><SplitBars handlePct={row.side.handlePct} betsPct={row.side.betsPct} compact={compact} />{compact && <div className="mt-1 flex justify-end"><GapBadge gap={row.gap} /></div>}</div>
  </div>;
}
function SharpSignal({ row }: { row: SplitsMatchupRow }) {
  const candidates = sharpSides((["spread", "total", "moneyline"] as const).flatMap((market) => row.game.markets[market].map((side): SplitsRow => ({ game: row.game, market, side, gap: moneyGap(side), publicGap: publicGap(side) }))));
  const signal = candidates[0];
  if (!signal) return <span className="text-xs text-slate-500">No sharp side</span>;
  return <div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-900"><span>{sideName(signal)} {signal.market === "moneyline" ? "ML" : sideValue(signal)}</span><GapBadge gap={signal.gap} /></div><p className="mt-1 text-[10px] leading-4 text-slate-600">{signal.side.handlePct}% of money on {signal.side.betsPct}% of tickets</p></div>;
}
function Overview({ rows }: { rows: readonly SplitsMatchupRow[] }) {
  return <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
    <div className="border-b border-slate-100 px-3 py-2.5"><h2 className="text-sm font-bold text-slate-900">Matchup distribution</h2><p className="text-[11px] text-slate-600">Money = handle · Tickets = bets · gap shown for the money-leading side</p></div>
    <div role="region" aria-label="Overview matchup cards" className="divide-y divide-slate-200 md:hidden">{rows.map((row) => <article key={row.game.gameId} data-splits-game-id={row.game.gameId} className="px-3 py-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><MatchupMark away={row.game.away} home={row.game.home} /><p className="mt-1 text-[10px] font-medium tabular-nums text-slate-600">{matchupNumbers(row)}</p></div><div className="max-w-[9rem] text-right"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Sharp signal</span><SharpSignal row={row} /></div></div><div className="mt-2 divide-y divide-slate-100 border-t border-slate-100">{(["spread", "total", "moneyline"] as const).map((market) => <div key={market} className="grid grid-cols-[4.3rem_minmax(0,1fr)] gap-1 py-2"><strong className="pt-0.5 text-[10px] uppercase tracking-wide text-slate-600">{market}</strong><MarketSplit row={displayedSide(row, market)} compact /></div>)}</div></article>)}</div>
    <DenseTableScroller label="Overview matchup distribution" className="hidden md:block"><table className="w-full min-w-[960px] table-fixed text-left"><colgroup><col className="w-[18%]" /><col className="w-[20%]" /><col className="w-[20%]" /><col className="w-[20%]" /><col className="w-[22%]" /></colgroup><thead><tr className={DENSE_TABLE_HEAD_ROW}>{["Matchup", "Spread", "Total", "Moneyline", "Sharp signal"].map((label) => <th key={label} scope="col" className="px-3 py-2">{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.game.gameId} data-splits-game-id={row.game.gameId} className={cn(DENSE_TABLE_ROW, "align-top")}><td className="px-3 py-3"><MatchupMark away={row.game.away} home={row.game.home} /><p className="mt-1.5 whitespace-nowrap text-[10px] tabular-nums text-slate-600">{matchupNumbers(row)}</p></td>{(["spread", "total", "moneyline"] as const).map((market) => <td key={market} className="border-l border-slate-100 px-3 py-3"><MarketSplit row={displayedSide(row, market)} /></td>)}<td className="border-l border-slate-100 px-3 py-3"><SharpSignal row={row} /></td></tr>)}</tbody></table></DenseTableScroller>
  </section>;
}
function rankingSortRows(rows: readonly SplitsRow[], metric: Metric, sort: RankingSort): SplitsRow[] {
  const identity = (row: SplitsRow) => `${sideName(row)}:${row.game.gameId}:${row.side.side}`;
  const value = (row: SplitsRow) => row.market === "moneyline" ? row.side.odds : row.side.line ?? 0;
  return [...rows].sort((a, b) => {
    const result = sort === "highest" ? b.side[metric] - a.side[metric] : sort === "lowest" ? a.side[metric] - b.side[metric] : sort === "value-high" ? value(b) - value(a) : sort === "value-low" ? value(a) - value(b) : sideName(a).localeCompare(sideName(b));
    return result || identity(a).localeCompare(identity(b));
  });
}
function RankingTable({ rows, market, metric }: { rows: readonly SplitsRow[]; market: SplitsMarket; metric: Metric }) {
  return <section aria-label={`${metric === "handlePct" ? "Money" : "Tickets"} ranking`} className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="border-b border-slate-200 bg-slate-50 px-3 py-2"><h3 className="text-xs font-bold uppercase tracking-wide text-slate-800">{metric === "handlePct" ? "Money" : "Tickets"}</h3><p className="text-[10px] text-slate-600">{metric === "handlePct" ? "Handle %" : "Bets %"} on each {market === "total" ? "total side" : "team side"}</p></div><table className="w-full table-fixed text-left text-xs"><colgroup><col className="w-7 md:w-9" /><col className="w-[30%] md:w-[34%]" /><col className="w-[19%]" /><col /><col className="w-10 md:w-12" /></colgroup><thead><tr className={DENSE_TABLE_HEAD_ROW}><th scope="col" className="px-1.5 py-2 text-center">#</th><th scope="col" className="px-1 py-2">{market === "total" ? "Matchup / side" : "Team"}</th><th scope="col" className="px-1 py-2">{market === "spread" ? "Spread" : market === "moneyline" ? "ML" : "Total"}</th><th scope="col" className="px-1 py-2">Share</th><th scope="col" className="px-1.5 py-2 text-right">%</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.game.gameId}:${row.side.side}`} data-splits-game-id={row.game.gameId} className={DENSE_TABLE_ROW}><td className="px-1.5 py-2 text-center tabular-nums text-slate-500">{index + 1}</td><td className="overflow-hidden px-1 py-2"><div className="flex min-w-0 items-center gap-1">{market !== "total" && <TeamLogo name={sideName(row)} logo={nflLogoUrl(row.side.side === "away" ? row.game.away : row.game.home)} fallbackLabel={sideName(row).slice(0, 2)} className="h-4 w-4 bg-transparent" />}<span className="truncate font-semibold text-slate-900" title={market === "total" ? `${row.game.away.toUpperCase()} @ ${row.game.home.toUpperCase()} ${sideName(row)}` : sideName(row)}>{market === "total" ? <>{row.game.away.toUpperCase()} @ {row.game.home.toUpperCase()} <span className="text-sky-800">{sideName(row)}</span></> : <>{sideName(row)} <span className="hidden text-[10px] font-normal text-slate-500 lg:inline">{row.side.side === "away" ? `@ ${row.game.home.toUpperCase()}` : `vs ${row.game.away.toUpperCase()}`}</span></>}</span></div></td><td className="whitespace-nowrap px-1 py-2 font-medium tabular-nums text-slate-700">{sideValue(row)}</td><td className="px-1 py-2"><span role="img" aria-label={`${metric === "handlePct" ? "Money" : "Tickets"} ${row.side[metric]}%`} className="block h-2 overflow-hidden rounded-full bg-slate-100"><span className={cn("block h-full rounded-full", metric === "handlePct" ? "bg-sky-700" : "bg-sky-300")} style={{ width: `${row.side[metric]}%` }} /></span></td><td className="whitespace-nowrap px-1.5 py-2 text-right font-bold tabular-nums text-slate-900">{row.side[metric]}%</td></tr>)}</tbody></table></section>;
}
function Rankings({ rows, market }: { rows: readonly SplitsRow[]; market: SplitsMarket }) {
  const [sort, setSort] = useState<RankingSort>("highest");
  const [mobileMetric, setMobileMetric] = useState<Metric>("handlePct");
  const valueLabel = market === "spread" ? "spread" : market === "moneyline" ? "ML price" : "total";
  const options: { value: RankingSort; label: string }[] = [{ value: "highest", label: "Highest %" }, { value: "lowest", label: "Lowest %" }, { value: "value-high", label: `Highest ${valueLabel}` }, { value: "value-low", label: `Lowest ${valueLabel}` }, { value: "az", label: "A-Z" }];
  return <div className="min-w-0 space-y-3"><div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-sm font-bold text-slate-900">{market === "spread" ? "Spread" : market === "moneyline" ? "Moneyline" : "Total"} rankings</h2><p className="text-[11px] text-slate-600">Both source sides of each matchup, ranked independently by share.</p></div><label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">Sort by <select aria-label="Sort ranking rows" value={sort} onChange={(event) => setSort(event.target.value as RankingSort)} className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">{options.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label></div><div role="group" aria-label="Ranking share" className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-0.5 md:hidden">{([["handlePct", "Money"], ["betsPct", "Tickets"]] as const).map(([metric, label]) => <button key={metric} type="button" aria-pressed={mobileMetric === metric} onClick={() => setMobileMetric(metric)} className={cn("min-h-8 rounded px-4 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500", mobileMetric === metric ? "bg-white text-slate-900 shadow-sm" : "text-slate-600")}>{label}</button>)}</div><div className="grid min-w-0 gap-3 md:grid-cols-2"><div className={mobileMetric === "handlePct" ? "min-w-0" : "hidden min-w-0 md:block"}><RankingTable rows={rankingSortRows(rows, "handlePct", sort)} market={market} metric="handlePct" /></div><div className={mobileMetric === "betsPct" ? "min-w-0" : "hidden min-w-0 md:block"}><RankingTable rows={rankingSortRows(rows, "betsPct", sort)} market={market} metric="betsPct" /></div></div></div>;
}
function BettingSplitsContent({ week }: { week: number }) {
  const data = useNflBettingSplits({ season: 2026, week });
  const [tab, setTab] = useState<Tab>("overview");
  const overview = useMemo(() => data.artifact ? splitsMatchupRows(data.artifact) : [], [data.artifact]);
  const captured = data.sourceCapturedAt ? formatNflMetadataTimestamp(data.sourceCapturedAt) : null;
  return <>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600" role="status"><span className={cn("font-bold", data.loading ? "text-slate-600" : data.freshness === "fresh" ? "text-emerald-700" : data.freshness === "stale" ? "text-amber-800" : "text-rose-700")}>{data.loading ? "Loading" : data.freshness === "fresh" ? "Fresh" : data.freshness === "stale" ? "Stale" : "Unavailable"}</span><span>Week {data.week ?? week}</span><span>{data.source ?? "DraftKings Network / DraftKings Sportsbook"}</span>{captured && <span>Captured {captured}</span>}</div>
    {data.loading ? <div aria-label="Loading betting splits" className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">{[0, 1, 2, 3].map((n) => <div key={n} className="h-8 animate-pulse rounded bg-slate-100" />)}</div>
      : data.freshness === "unavailable" || !data.artifact ? <section className="rounded-lg border border-slate-200 bg-white p-5"><h2 className="text-sm font-bold text-slate-900">Betting splits unavailable</h2><p className="mt-1 text-xs leading-5 text-slate-600">Source data for the current week is currently unavailable. Check back after the next DraftKings capture.</p></section>
      : <>{data.freshness === "stale" && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">Stale betting splits. These figures were captured {captured} and may not reflect the current market{data.reason === "week_mismatch" ? ` (source Week ${data.week}; current Week ${week})` : ""}.</div>}<div role="tablist" aria-label="Betting splits markets" className="grid w-full grid-cols-4 border-b border-slate-200">{TABS.map(({ id, label }) => <button key={id} type="button" role="tab" aria-label={label} id={`splits-tab-${id}`} aria-selected={tab === id} aria-controls={`splits-panel-${id}`} onClick={() => setTab(id)} className={cn("min-w-0 border-b-2 px-1.5 py-2 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:text-xs", tab === id ? "border-slate-900 text-slate-900" : "border-transparent text-slate-600 hover:text-slate-900")}>{id === "moneyline" ? <><span className="sm:hidden">ML</span><span className="hidden sm:inline">Moneyline</span></> : label}</button>)}</div><div role="tabpanel" id={`splits-panel-${tab}`} aria-labelledby={`splits-tab-${tab}`} className="min-w-0">{tab === "overview" ? <Overview rows={overview} /> : <Rankings key={tab} rows={splitsRows(data.artifact, tab)} market={tab} />}</div><details className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-600"><summary className="cursor-pointer font-semibold text-slate-800">How these labels work</summary><p className="mt-2 leading-5">Money Gap = Handle % − Bets %. Strong Money Gap is +20 points or more; Money Lean is +10 to +19; Balanced is −9 to +9; Public Heavy is −10 or lower. “Sharp Side” is a JKB heuristic based on handle-vs-ticket imbalance. DraftKings does not identify professional bettors. These labels describe distribution, not predictive advantage.</p></details></>}
  </>;
}
export default function NFLBettingSplits() {
  usePageSeo({ title: "NFL Betting Splits | Joe Knows Ball", description: "DraftKings Network NFL spread, moneyline and total betting distribution by handle and bets.", path: "/nfl/betting-splits", noindex: false });
  const current = useCurrentNflWeek(2026);
  return <><NflPageHeader eyebrow="NFL · Markets & Predictions" title="NFL Betting Splits" description="DraftKings Network betting distribution across spread, moneyline and total markets." />{current.loading ? <div role="status" className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading current NFL week…</div> : current.week === null ? <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">Current NFL week unavailable.</section> : <BettingSplitsContent week={current.week} />}</>;
}
