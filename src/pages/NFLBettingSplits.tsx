import { useMemo, useState } from "react";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import { DenseTableScroller, DENSE_TABLE_HEAD_ROW, DENSE_TABLE_ROW } from "@/components/ui/dense-table";
import TeamLogo from "@/components/TeamLogo";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { useNflBettingSplits } from "@/hooks/useNflBettingSplits";
import { useCurrentNflWeek } from "@/hooks/useCurrentNflWeek";
import { usePageSeo } from "@/hooks/usePageSeo";
import { nflTeamColor } from "@/lib/nfl/nflTeamColor";
import { formatNflMetadataTimestamp } from "@/lib/nfl/provenance";
import { formatSplitsGap, formatSplitsLine, formatSplitsOdds, sortSplitsMatchupRows, sortSplitsRows, splitsMatchupRows, splitsRows, splitsSignal, SPLITS_SIGNAL_CLASS, SPLITS_SIGNAL_LABEL, type SplitsMarket, type SplitsMatchupRow, type SplitsMatchupSortKey, type SplitsRow, type SplitsSortKey } from "@/lib/nfl/bettingSplitsView";
import { cn } from "@/lib/utils";

type Tab = "overview" | SplitsMarket;
type SortDirection = "asc" | "desc";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" }, { id: "spread", label: "Spread" },
  { id: "moneyline", label: "Moneyline" }, { id: "total", label: "Total" },
];

function TeamMark({ abbr }: { abbr: string }) {
  return <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-slate-900"><span className="h-4 w-0.5 rounded" style={{ backgroundColor: nflTeamColor(abbr) ?? "#64748b" }} aria-hidden /><TeamLogo name="" logo={nflLogoUrl(abbr)} fallbackLabel="" className="h-4 w-4 bg-transparent" /><span>{abbr.toUpperCase()}</span></span>;
}

function MatchupMark({ away, home }: { away: string; home: string }) {
  return <span className="inline-flex items-center gap-1 whitespace-nowrap"><TeamMark abbr={away} /><span className="text-slate-400">@</span><TeamMark abbr={home} /></span>;
}

function SignalBadge({ gap }: { gap: number }) {
  const signal = splitsSignal(gap);
  return <span className={cn("inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold", SPLITS_SIGNAL_CLASS[signal])}>{SPLITS_SIGNAL_LABEL[signal]}</span>;
}

function GapCell({ gap }: { gap: number }) {
  return <span className={cn("font-bold tabular-nums", gap > 0 ? "text-emerald-700" : gap < 0 ? "text-rose-700" : "text-slate-600")}>{formatSplitsGap(gap)}</span>;
}

function strongestLabel(row: SplitsRow) {
  const side = row.side.side;
  return `${side === "away" ? row.game.away.toUpperCase() : side === "home" ? row.game.home.toUpperCase() : side === "over" ? "Over" : "Under"} ${row.market === "moneyline" ? "Moneyline" : row.market === "spread" ? "Spread" : "Total"}`;
}

function Distribution({ first, second, firstLabel, secondLabel, title }: { first: { handlePct: number; betsPct: number }; second: { handlePct: number; betsPct: number }; firstLabel: string; secondLabel: string; title: string }) {
  return <div className="border-t border-slate-100 py-1.5 first:border-0"><div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">{title}</div><div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 text-[11px] tabular-nums"><span>{firstLabel}</span><span>{first.handlePct}% H / {first.betsPct}% B</span><span>{secondLabel}</span><span>{second.handlePct}% H / {second.betsPct}% B</span></div></div>;
}

const overviewOptions: { key: SplitsMatchupSortKey; label: string }[] = [
  { key: "gap", label: "Money Gap" }, { key: "matchup", label: "Matchup" },
  { key: "handlePct", label: "Strongest Handle %" }, { key: "betsPct", label: "Strongest Bets %" },
];

function OverviewTable({ rows }: { rows: readonly SplitsMatchupRow[] }) {
  const [sort, setSort] = useState<{ key: SplitsMatchupSortKey; direction: SortDirection }>({ key: "gap", direction: "desc" });
  const shown = sortSplitsMatchupRows(rows, sort.key, sort.direction);
  const toggle = (key: SplitsMatchupSortKey) => setSort((current) => ({ key, direction: current.key === key && current.direction === "desc" ? "asc" : "desc" }));
  const sortButton = (key: SplitsMatchupSortKey, label: string) => <button type="button" onClick={() => toggle(key)} aria-label={`Sort by ${label}`} className="whitespace-nowrap hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">{label}{sort.key === key ? sort.direction === "desc" ? " ↓" : " ↑" : ""}</button>;
  return <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-slate-100 px-3 py-2.5"><h2 className="text-sm font-bold text-slate-900">Matchup distribution</h2><p className="text-[11px] text-slate-600">One row per game · H = Handle · B = Bets</p></div>
    <div className="px-3 py-2 md:hidden"><label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">Sort by <select aria-label="Sort overview rows" value={`${sort.key}:${sort.direction}`} onChange={(event) => { const [key, direction] = event.target.value.split(":") as [SplitsMatchupSortKey, SortDirection]; setSort({ key, direction }); }} className="min-w-0 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900">{overviewOptions.flatMap(({ key, label }) => ([<option key={`${key}:desc`} value={`${key}:desc`}>{label} ↓</option>, <option key={`${key}:asc`} value={`${key}:asc`}>{label} ↑</option>]))}</select></label></div>
    <div role="region" aria-label="Overview matchup cards" className="divide-y divide-slate-200 md:hidden">{shown.map((row) => <article key={row.game.gameId} data-splits-game-id={row.game.gameId} className="px-3 py-2.5"><div className="flex flex-wrap items-center justify-between gap-1.5"><MatchupMark away={row.game.away} home={row.game.home} /><SignalBadge gap={row.strongest.gap} /></div><div className="mt-1.5"><Distribution title="Spread" firstLabel={row.game.away.toUpperCase()} secondLabel={row.game.home.toUpperCase()} first={row.spread.away} second={row.spread.home} /><Distribution title="Total" firstLabel="Over" secondLabel="Under" first={row.total.over} second={row.total.under} /><Distribution title="Moneyline" firstLabel={row.game.away.toUpperCase()} secondLabel={row.game.home.toUpperCase()} first={row.moneyline.away} second={row.moneyline.home} /></div><div className="flex flex-wrap items-center justify-between gap-1 border-t border-slate-100 pt-1.5 text-[11px]"><span className="text-slate-600">Top Gap · {strongestLabel(row.strongest)}</span><GapCell gap={row.strongest.gap} /></div></article>)}</div>
    <DenseTableScroller label="Overview matchup distribution" className="hidden w-full md:block"><table className="min-w-[1080px] w-full text-[11px]"><thead><tr className={DENSE_TABLE_HEAD_ROW}><th rowSpan={2} scope="col" className="px-2 py-2 text-left">{sortButton("matchup", "Matchup")}</th><th colSpan={4} scope="colgroup" className="border-l border-slate-200 px-2 py-1.5 text-center">Spread betting splits</th><th colSpan={4} scope="colgroup" className="border-l border-slate-200 px-2 py-1.5 text-center">Total betting splits</th><th colSpan={4} scope="colgroup" className="border-l border-slate-200 px-2 py-1.5 text-center">Moneyline betting splits</th><th rowSpan={2} scope="col" className="border-l border-slate-200 px-2 py-2 text-right">{sortButton("gap", "Money Gap")}</th><th rowSpan={2} scope="col" className="px-2 py-2 text-left">Signal</th></tr><tr className={DENSE_TABLE_HEAD_ROW}>{["Away H", "Away B", "Home H", "Home B", "Over H", "Over B", "Under H", "Under B", "Away H", "Away B", "Home H", "Home B"].map((label, index) => <th key={`${label}-${index}`} scope="col" className={cn("px-1.5 py-1.5 text-right", index % 4 === 0 && "border-l border-slate-200")}>{label}</th>)}</tr></thead><tbody>{shown.map((row) => <tr key={row.game.gameId} data-splits-game-id={row.game.gameId} className={DENSE_TABLE_ROW}><td className="whitespace-nowrap px-2 py-2"><MatchupMark away={row.game.away} home={row.game.home} /></td>{[row.spread.away, row.spread.home, row.total.over, row.total.under, row.moneyline.away, row.moneyline.home].flatMap((side, index) => ([<td key={`${index}-h`} className={cn("px-1.5 py-2 text-right font-semibold tabular-nums", index % 2 === 0 && "border-l border-slate-200")}>{side.handlePct}%</td>, <td key={`${index}-b`} className="px-1.5 py-2 text-right tabular-nums text-slate-600">{side.betsPct}%</td>]))}<td className="border-l border-slate-200 px-2 py-2 text-right whitespace-nowrap"><div className="text-[10px] text-slate-600">{strongestLabel(row.strongest)}</div><GapCell gap={row.strongest.gap} /></td><td className="px-2 py-2"><SignalBadge gap={row.strongest.gap} /></td></tr>)}</tbody></table></DenseTableScroller>
    <div className="hidden border-t border-slate-100 px-3 py-1.5 text-[10px] text-slate-600 md:block">Sort by strongest Handle % or Bets %: {sortButton("handlePct", "Handle %")} · {sortButton("betsPct", "Bets %")}</div>
  </section>;
}

function MarketTable({ rows, market }: { rows: readonly SplitsRow[]; market: SplitsMarket }) {
  const [sort, setSort] = useState<{ key: SplitsSortKey; direction: SortDirection }>({ key: "gap", direction: "desc" });
  const shown = sortSplitsRows(rows, sort.key, sort.direction);
  const keys: { key: SplitsSortKey; label: string }[] = [{ key: "handlePct", label: "Handle" }, { key: "betsPct", label: "Bets" }, { key: "gap", label: "Money Gap" }, ...(market === "moneyline" ? [] : [{ key: "line" as const, label: market === "total" ? "Total" : "Line" }]), { key: "odds", label: "Odds" }];
  const toggle = (key: SplitsSortKey) => setSort((current) => ({ key, direction: current.key === key && current.direction === "desc" ? "asc" : "desc" }));
  const sortButton = (key: SplitsSortKey, label: string) => <button type="button" onClick={() => toggle(key)} aria-label={`Sort by ${label}`} className="whitespace-nowrap hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">{label}{sort.key === key ? sort.direction === "desc" ? " ↓" : " ↑" : ""}</button>;
  const sideLabel = (row: SplitsRow) => row.side.side === "away" ? row.game.away : row.side.side === "home" ? row.game.home : null;
  return <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="border-b border-slate-100 px-3 py-2.5"><h2 className="text-sm font-bold text-slate-900">{market === "moneyline" ? "Moneyline" : market === "spread" ? "Spread" : "Total"} distribution</h2><p className="text-[11px] text-slate-600">Both sides of every eligible game · select a column to sort</p></div>
    <div className="px-3 py-2 md:hidden"><label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">Sort by <select aria-label="Sort market rows" value={`${sort.key}:${sort.direction}`} onChange={(event) => { const [key, direction] = event.target.value.split(":") as [SplitsSortKey, SortDirection]; setSort({ key, direction }); }} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900">{keys.flatMap(({ key, label }) => ([<option key={`${key}:desc`} value={`${key}:desc`}>{label} ↓</option>, <option key={`${key}:asc`} value={`${key}:asc`}>{label} ↑</option>]))}</select></label></div>
    <div role="region" aria-label={`${market} mobile rows`} className="divide-y divide-slate-200 md:hidden">{shown.map((row) => <article key={`${row.game.gameId}:${row.side.side}`} data-splits-game-id={row.game.gameId} className="px-3 py-2.5 text-xs"><div className="flex flex-wrap items-center justify-between gap-1"><span className="text-[11px]"><MatchupMark away={row.game.away} home={row.game.home} /></span><SignalBadge gap={row.gap} /></div><div className="mt-1.5 flex flex-wrap items-center justify-between gap-1"><span>{sideLabel(row) ? <TeamMark abbr={sideLabel(row)!} /> : <strong>{row.side.side === "over" ? "Over" : "Under"}</strong>}{sideLabel(row) && <span className="ml-1 text-[10px] text-slate-500">vs {row.side.side === "away" ? row.game.home.toUpperCase() : row.game.away.toUpperCase()}</span>}</span><span className="tabular-nums text-slate-700">{market !== "moneyline" && <>{formatSplitsLine(market, row.side.line)} · </>}{formatSplitsOdds(row.side.odds)}</span></div><div className="mt-1.5 flex items-center justify-between rounded bg-slate-50 px-2 py-1.5 tabular-nums"><span>Handle <strong>{row.side.handlePct}%</strong></span><span>Bets <strong>{row.side.betsPct}%</strong></span><GapCell gap={row.gap} /></div></article>)}</div>
    <DenseTableScroller label={`${market} betting splits`} className="hidden w-full md:block"><table className="min-w-[690px] w-full text-xs"><thead><tr className={DENSE_TABLE_HEAD_ROW}><th scope="col" className="px-3 py-2 text-left">{market === "total" ? "Matchup" : "Team"}</th>{market === "total" && <th scope="col" className="px-2 py-2 text-left">Side</th>}{market !== "total" && <th scope="col" className="px-2 py-2 text-left">Opp</th>}{market !== "moneyline" && <th scope="col" className="px-2 py-2 text-right">{sortButton("line", market === "total" ? "Total" : "Line")}</th>}<th scope="col" className="px-2 py-2 text-right">{sortButton("odds", "Odds")}</th><th scope="col" className="px-2 py-2 text-right">{sortButton("handlePct", "Handle")}</th><th scope="col" className="px-2 py-2 text-right">{sortButton("betsPct", "Bets")}</th><th scope="col" className="px-2 py-2 text-right">{sortButton("gap", "Money Gap")}</th><th scope="col" className="px-3 py-2 text-left">Signal</th></tr></thead><tbody>{shown.map((row) => <tr key={`${row.game.gameId}:${row.side.side}`} data-splits-game-id={row.game.gameId} className={DENSE_TABLE_ROW}><td className="whitespace-nowrap px-3 py-2">{market === "total" ? <MatchupMark away={row.game.away} home={row.game.home} /> : <TeamMark abbr={sideLabel(row)!} />}</td><td className="px-2 py-2">{market === "total" ? <strong>{row.side.side === "over" ? "Over" : "Under"}</strong> : <TeamMark abbr={row.side.side === "away" ? row.game.home : row.game.away} />}</td>{market !== "moneyline" && <td className="px-2 py-2 text-right tabular-nums">{formatSplitsLine(market, row.side.line)}</td>}<td className="px-2 py-2 text-right tabular-nums">{formatSplitsOdds(row.side.odds)}</td><td className="px-2 py-2 text-right font-semibold tabular-nums">{row.side.handlePct}%</td><td className="px-2 py-2 text-right tabular-nums">{row.side.betsPct}%</td><td className="px-2 py-2 text-right whitespace-nowrap"><GapCell gap={row.gap} /></td><td className="px-3 py-2"><SignalBadge gap={row.gap} /></td></tr>)}</tbody></table></DenseTableScroller>
  </section>;
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
      : <>{data.freshness === "stale" && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">Stale betting splits. These figures were captured {captured} and may not reflect the current market{data.reason === "week_mismatch" ? ` (source Week ${data.week}; current Week ${week})` : ""}.</div>}<div role="tablist" aria-label="Betting splits markets" className="flex w-full gap-1 overflow-x-auto border-b border-slate-200">{TABS.map(({ id, label }) => <button key={id} type="button" role="tab" id={`splits-tab-${id}`} aria-selected={tab === id} aria-controls={`splits-panel-${id}`} onClick={() => setTab(id)} className={cn("shrink-0 border-b-2 px-3 py-2 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500", tab === id ? "border-slate-900 text-slate-900" : "border-transparent text-slate-600 hover:text-slate-900")}>{label}</button>)}</div><div role="tabpanel" id={`splits-panel-${tab}`} aria-labelledby={`splits-tab-${tab}`} className="min-w-0">{tab === "overview" ? <OverviewTable rows={overview} /> : <MarketTable key={tab} rows={splitsRows(data.artifact, tab)} market={tab} />}</div><details className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-600"><summary className="cursor-pointer font-semibold text-slate-800">How these labels work</summary><p className="mt-2 leading-5">Money Gap = Handle % − Bets %. Strong Money Gap is +20 points or more; Money Lean is +10 to +19; Balanced is −9 to +9; Public Heavy is −10 or lower. “Sharp Side” is a JKB heuristic based on handle-vs-ticket imbalance. DraftKings does not identify professional bettors. These labels describe distribution, not predictive advantage.</p></details></>}
  </>;
}

export default function NFLBettingSplits() {
  usePageSeo({ title: "NFL Betting Splits | Joe Knows Ball", description: "DraftKings Network NFL spread, moneyline and total betting distribution by handle and bets.", path: "/nfl/betting-splits", noindex: false });
  const current = useCurrentNflWeek(2026);
  return <><NflPageHeader eyebrow="NFL · Markets & Predictions" title="NFL Betting Splits" description="DraftKings Network betting distribution across spread, moneyline and total markets." />{current.loading ? <div role="status" className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading current NFL week…</div> : current.week === null ? <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">Current NFL week unavailable.</section> : <BettingSplitsContent week={current.week} />}</>;
}
