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
import { biggestMoneyGap, consensusSides, contrarianSides, publicSides, sharpSides, sortSplitsRows, splitsRows, splitsSignal, type SplitsMarket, type SplitsRow, type SplitsSortKey } from "@/lib/nfl/bettingSplitsView";
import { cn } from "@/lib/utils";

type Tab = "overview" | SplitsMarket;
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" }, { id: "spread", label: "Spread" },
  { id: "moneyline", label: "Moneyline" }, { id: "total", label: "Total" },
];
const SIGNAL_LABEL = { strong: "Strong Money Gap", lean: "Money Lean", balanced: "Balanced", public: "Public Heavy" };
const SIGNAL_CLASS = { strong: "bg-emerald-50 text-emerald-800", lean: "bg-emerald-50 text-emerald-700", balanced: "bg-slate-100 text-slate-600", public: "bg-amber-50 text-amber-800" };

function TeamMark({ abbr }: { abbr: string }) {
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-semibold text-slate-900"><span className="h-5 w-0.5 rounded" style={{ backgroundColor: nflTeamColor(abbr) ?? "#64748b" }} aria-hidden /><TeamLogo name="" logo={nflLogoUrl(abbr)} fallbackLabel="" className="h-5 w-5 bg-transparent" /><span>{abbr.toUpperCase()}</span></span>;
}

function SideCell({ row }: { row: SplitsRow }) {
  if (row.market === "total") return <span className="font-semibold text-slate-900">{row.side.side === "over" ? "Over" : "Under"}</span>;
  const abbr = row.side.team ?? (row.side.side === "away" ? row.game.away : row.game.home);
  return <span className="inline-flex items-center gap-2"><TeamMark abbr={abbr} /><span className="text-[10px] uppercase text-slate-500">{row.side.side}</span></span>;
}

function GapCell({ gap }: { gap: number }) {
  return <span className={cn("font-bold tabular-nums", gap > 0 ? "text-emerald-700" : gap < 0 ? "text-rose-700" : "text-slate-600")}>{gap > 0 ? "+" : ""}{gap} pp</span>;
}

function formatLine(row: SplitsRow) {
  if (row.side.line === null) return "—";
  return `${row.market === "total" ? "" : row.side.line > 0 ? "+" : ""}${row.side.line}`;
}
function formatOdds(odds: number) { return odds > 0 ? `+${odds}` : String(odds); }

function MobileSplitsRows({ rows, label }: { rows: readonly SplitsRow[]; label: string }) {
  return <div role="region" aria-label={`${label} mobile`} className="divide-y divide-slate-100 sm:hidden">
    {rows.map((row) => <div key={`${row.game.gameId}:${row.market}:${row.side.side}`} className="px-3 py-2.5 text-xs">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate"><TeamMark abbr={row.game.away} /><span className="px-1 text-slate-400">@</span><TeamMark abbr={row.game.home} /></span>
        <span className="shrink-0 text-[10px] uppercase text-slate-500">{row.market}</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2"><SideCell row={row} /><span className="whitespace-nowrap tabular-nums text-slate-600">{formatLine(row)} · {formatOdds(row.side.odds)}</span></div>
      <div className="mt-2 grid grid-cols-3 gap-1 rounded bg-slate-50 px-2 py-1.5 text-right tabular-nums"><span><span className="block text-[9px] uppercase text-slate-500">Handle</span><strong className="text-slate-900">{row.side.handlePct}%</strong></span><span><span className="block text-[9px] uppercase text-slate-500">Bets</span><strong className="text-slate-900">{row.side.betsPct}%</strong></span><span><span className="block text-[9px] uppercase text-slate-500">Money Gap</span><GapCell gap={row.gap} /></span></div>
    </div>)}
  </div>;
}

function SplitsTable({ rows, label, market, compact = false }: { rows: readonly SplitsRow[]; label: string; market?: SplitsMarket; compact?: boolean }) {
  const [sort, setSort] = useState<{ key: SplitsSortKey; direction: "asc" | "desc" }>({ key: "gap", direction: "desc" });
  const shown = market ? sortSplitsRows(rows, sort.key, sort.direction) : rows;
  const sortButton = (key: SplitsSortKey, text: string) => market && !(market === "moneyline" && key === "line") ? <button type="button" onClick={() => setSort((current) => ({ key, direction: current.key === key && current.direction === "desc" ? "asc" : "desc" }))} aria-label={`Sort by ${text}`} className="whitespace-nowrap hover:text-sky-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">{text}{sort.key === key ? sort.direction === "desc" ? " ↓" : " ↑" : ""}</button> : text;
  return <>{market && <div className="px-3 py-2 sm:hidden"><label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">Sort by <select aria-label="Sort market rows" value={`${sort.key}:${sort.direction}`} onChange={(event) => { const [key, direction] = event.target.value.split(":") as [SplitsSortKey, "asc" | "desc"]; setSort({ key, direction }); }} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"><option value="gap:desc">Money Gap ↓</option><option value="gap:asc">Money Gap ↑</option><option value="handlePct:desc">Handle % ↓</option><option value="handlePct:asc">Handle % ↑</option><option value="betsPct:desc">Bets % ↓</option><option value="betsPct:asc">Bets % ↑</option>{market !== "moneyline" && <><option value="line:desc">Line ↓</option><option value="line:asc">Line ↑</option></>}<option value="odds:desc">Odds ↓</option><option value="odds:asc">Odds ↑</option></select></label></div>}
    <MobileSplitsRows rows={shown} label={label} /><DenseTableScroller label={label} className="hidden w-full sm:block">
    <table className={cn("w-full text-xs", compact ? "min-w-[660px]" : "min-w-[700px]")}>
      <thead><tr className={DENSE_TABLE_HEAD_ROW}>
        <th scope="col" className="px-3 py-2 text-left">Matchup</th><th scope="col" className="px-3 py-2 text-left">Side</th>
        <th scope="col" className="px-2 py-2 text-right">{sortButton("line", "Line")}</th><th scope="col" className="px-2 py-2 text-right">{sortButton("odds", "Odds")}</th>
        <th scope="col" className="px-2 py-2 text-right">{sortButton("handlePct", "Handle %")}</th><th scope="col" className="px-2 py-2 text-right">{sortButton("betsPct", "Bets %")}</th><th scope="col" className="px-3 py-2 text-right">{sortButton("gap", "Money Gap")}</th>
        <th scope="col" className="px-3 py-2 text-left">Signal</th>
      </tr></thead>
      <tbody>{shown.map((row) => { const signal = splitsSignal(row.gap); return <tr key={`${row.game.gameId}:${row.market}:${row.side.side}`} className={DENSE_TABLE_ROW}>
        <td className="whitespace-nowrap px-3 py-2 font-semibold"><span className="inline-flex items-center gap-1"><TeamMark abbr={row.game.away} /><span className="px-0.5 text-slate-400">@</span><TeamMark abbr={row.game.home} /></span><span className="ml-1.5 text-[10px] font-normal uppercase text-slate-500">{row.market}</span></td>
        <td className="px-3 py-2"><SideCell row={row} /></td>
        <td className="px-2 py-2 text-right tabular-nums text-slate-700">{formatLine(row)}</td><td className="px-2 py-2 text-right tabular-nums text-slate-700">{formatOdds(row.side.odds)}</td>
        <td className="px-2 py-2 text-right font-semibold tabular-nums text-slate-900">{row.side.handlePct}%</td><td className="px-2 py-2 text-right tabular-nums text-slate-700">{row.side.betsPct}%</td>
        <td className="px-3 py-2 text-right"><GapCell gap={row.gap} /></td><td className="px-3 py-2"><span className={cn("whitespace-nowrap rounded px-1.5 py-1 text-[10px] font-semibold", SIGNAL_CLASS[signal])}>{SIGNAL_LABEL[signal]}</span></td>
      </tr>; })}</tbody>
    </table>
  </DenseTableScroller></>;
}

function OverviewSection({ title, detail, rows }: { title: string; detail: string; rows: SplitsRow[] }) {
  return <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-slate-100 px-3 py-2.5"><h2 className="text-sm font-bold text-slate-900">{title}</h2><p className="text-[11px] text-slate-600">{detail}</p></div>{rows.length ? <SplitsTable rows={rows.slice(0, 5)} label={title} compact /> : <p className="px-3 py-4 text-xs text-slate-600">No sides meet this definition in the current slate.</p>}</section>;
}

function BettingSplitsContent({ week }: { week: number }) {
  const data = useNflBettingSplits({ season: 2026, week });
  const [tab, setTab] = useState<Tab>("overview");
  const allRows = useMemo(() => data.artifact ? splitsRows(data.artifact) : [], [data.artifact]);
  const captured = data.sourceCapturedAt ? formatNflMetadataTimestamp(data.sourceCapturedAt) : null;
  return <>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600" role="status">
      <span className={cn("font-bold", data.loading ? "text-slate-600" : data.freshness === "fresh" ? "text-emerald-700" : data.freshness === "stale" ? "text-amber-800" : "text-rose-700")}>{data.loading ? "Loading" : data.freshness === "fresh" ? "Fresh" : data.freshness === "stale" ? "Stale" : "Unavailable"}</span>
      <span>Week {data.week ?? week}</span><span>{data.source ?? "DraftKings Network / DraftKings Sportsbook"}</span>{captured && <span>Captured {captured}</span>}
    </div>
    {data.loading ? <div aria-label="Loading betting splits" className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">{[0, 1, 2, 3].map((n) => <div key={n} className="h-8 animate-pulse rounded bg-slate-100" />)}</div>
      : data.freshness === "unavailable" || !data.artifact ? <section className="rounded-lg border border-slate-200 bg-white p-5"><h2 className="text-sm font-bold text-slate-900">Betting splits unavailable</h2><p className="mt-1 text-xs leading-5 text-slate-600">Source data for the current week is currently unavailable. Check back after the next DraftKings capture.</p></section>
      : <>
        {data.freshness === "stale" && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">Stale betting splits. These figures were captured {captured} and may not reflect the current market{data.reason === "week_mismatch" ? ` (source Week ${data.week}; current Week ${week})` : ""}.</div>}
        <div role="tablist" aria-label="Betting splits markets" className="flex w-full gap-1 overflow-x-auto border-b border-slate-200">
          {TABS.map(({ id, label }) => <button key={id} type="button" role="tab" id={`splits-tab-${id}`} aria-selected={tab === id} aria-controls={`splits-panel-${id}`} onClick={() => setTab(id)} className={cn("shrink-0 border-b-2 px-3 py-2 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500", tab === id ? "border-slate-900 text-slate-900" : "border-transparent text-slate-600 hover:text-slate-900")}>{label}</button>)}
        </div>
        <div role="tabpanel" id={`splits-panel-${tab}`} aria-labelledby={`splits-tab-${tab}`} className="min-w-0">
          {tab === "overview" ? <div className="grid min-w-0 gap-3">
            <OverviewSection title="Biggest Money Gap" detail="Largest handle and bets disagreement · one side per game and market" rows={biggestMoneyGap(allRows)} />
            <OverviewSection title="Public Side" detail="Highest share of bets" rows={publicSides(allRows)} />
            <OverviewSection title="JKB Sharp Side" detail="Handle exceeds bets by 10+ points · JKB heuristic" rows={sharpSides(allRows)} />
            <OverviewSection title="Contrarian" detail="Bets below 40% · handle above 50%" rows={contrarianSides(allRows)} />
            <OverviewSection title="Consensus" detail="Bets and handle at least 70%" rows={consensusSides(allRows)} />
          </div> : <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="border-b border-slate-100 px-3 py-2.5"><h2 className="text-sm font-bold text-slate-900">{TABS.find((item) => item.id === tab)?.label} distribution</h2><p className="text-[11px] text-slate-600">Both sides of every eligible Week {data.week} game · select a column to sort</p></div><SplitsTable key={tab} rows={splitsRows(data.artifact, tab)} market={tab} label={`${tab} betting splits`} /></section>}
        </div>
        <details className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-600"><summary className="cursor-pointer font-semibold text-slate-800">How these labels work</summary><p className="mt-2 leading-5">Money Gap = Handle % − Bets %. Strong Money Gap is +20 points or more; Money Lean is +10 to +19; Balanced is −9 to +9; Public Heavy is −10 or lower. Public Gap = Bets % − Handle %. “Sharp Side” is a JKB heuristic inferred from handle-vs-ticket imbalance. DraftKings does not identify professional bettors. Contrarian means bets below 40% with handle above 50%; Consensus means both shares are at least 70%. These labels describe distribution, not predictive advantage.</p></details>
      </>}
  </>;
}

export default function NFLBettingSplits() {
  usePageSeo({ title: "NFL Betting Splits | Joe Knows Ball", description: "DraftKings Network NFL spread, moneyline and total betting distribution by handle and bets.", path: "/nfl/betting-splits", noindex: false });
  const current = useCurrentNflWeek(2026);
  return <><NflPageHeader eyebrow="NFL · Markets & Predictions" title="NFL Betting Splits" description="DraftKings Network betting distribution across spread, moneyline and total markets." />{current.loading ? <div role="status" className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading current NFL week…</div> : current.week === null ? <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">Current NFL week unavailable.</section> : <BettingSplitsContent week={current.week} />}</>;
}
