import { AlertCircle, ClipboardList, Gauge, ShieldCheck, Target, Trophy } from "lucide-react";
import SiteShell from "@/components/layout/SiteShell";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import NflSection from "@/components/nfl/ui/NflSection";
import {
  DENSE_TABLE_HEAD_ROW,
  DENSE_TABLE_ROW,
  DenseTableScroller,
} from "@/components/ui/dense-table";
import { useChatGptPoolData } from "@/hooks/useChatGptPoolData";
import { usePageSeo } from "@/hooks/usePageSeo";
import { cn } from "@/lib/utils";
import type {
  ChatGptPoolData,
  MainPoolStatus,
  MainPoolWager,
  PerformanceBreakdownRow,
  SidePoolStatus,
  SidePoolWeek,
  WagerResult,
} from "@/lib/nfl/chatGptPool";

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

function formatNumber(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : numberFormatter.format(value);
}

function formatSigned(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  return `${value > 0 ? "+" : "−"}${numberFormatter.format(Math.abs(value))}`;
}

function formatSpread(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value === 0 ? "PK" : formatSigned(value);
}

function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(date);
}

const statusStyles: Record<MainPoolStatus, string> = {
  LEAN: "border-slate-200 bg-slate-50 text-slate-600",
  OFFICIAL: "border-sky-200 bg-sky-50 text-sky-800",
  LOCKED: "border-indigo-200 bg-indigo-50 text-indigo-800",
  FINAL: "border-slate-300 bg-slate-800 text-white",
};

const resultStyles: Record<WagerResult, string> = {
  WIN: "border-emerald-200 bg-emerald-50 text-emerald-800",
  LOSS: "border-rose-200 bg-rose-50 text-rose-800",
  PUSH: "border-amber-200 bg-amber-50 text-amber-800",
  PENDING: "border-slate-200 bg-white text-slate-600",
};

const sideStatusStyles: Record<SidePoolStatus, string> = {
  ACTIVE: "border-sky-200 bg-sky-50 text-sky-800",
  ADVANCED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  ELIMINATED: "border-rose-200 bg-rose-50 text-rose-800",
  PENDING: "border-slate-200 bg-white text-slate-600",
};

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide", className)}>
      {label}
    </span>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-5 py-9 text-center" role="status">
      <ClipboardList className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
      <p className="mt-2 text-sm font-semibold text-slate-800">{title}</p>
      <p className="mx-auto mt-1 max-w-xl text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}

function MainPoolScoreboard({ data }: { data: ChatGptPoolData }) {
  const { mainPool } = data;
  const record = `${mainPool.atsWins}-${mainPool.atsLosses}-${mainPool.atsPushes}`;
  const metrics = [
    { label: "Bankroll", value: formatNumber(mainPool.currentBankroll), detail: `Started ${formatNumber(mainPool.startingBankroll)}` },
    { label: "Current Rank", value: formatNumber(mainPool.currentRank), detail: mainPool.totalEntries ? `of ${formatNumber(mainPool.totalEntries)}` : "TBD" },
    { label: "Distance to 1st", value: formatSigned(mainPool.distanceFromLeader), detail: mainPool.leaderBankroll == null ? "Leader TBD" : `Leader ${formatNumber(mainPool.leaderBankroll)}` },
    { label: "Distance to Top 10", value: formatSigned(mainPool.distanceFromTop10), detail: mainPool.tenthPlaceBankroll == null ? "Cutoff TBD" : `10th ${formatNumber(mainPool.tenthPlaceBankroll)}` },
    { label: "ATS Record", value: record, detail: `${formatPercent(mainPool.atsWinPct)} win rate` },
    { label: "Net Points", value: formatSigned(mainPool.netPoints), detail: `${formatNumber(mainPool.totalPointsWagered)} wagered` },
  ];

  return (
    <section aria-labelledby="main-pool-status" className="overflow-hidden rounded-xl bg-[#031635] text-white shadow-[0_8px_24px_rgba(3,22,53,0.14)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3 sm:px-5">
        <div>
          <h2 id="main-pool-status" className="text-base font-semibold tracking-tight">Main Pool Status</h2>
          <p className="mt-0.5 text-[11px] text-slate-300">Season bankroll and placement position</p>
        </div>
        <Badge label="2026 · ACTIVE" className="border-sky-300/30 bg-sky-300/10 text-sky-100" />
      </div>
      <dl className="grid grid-cols-2 divide-x divide-y divide-white/10 sm:grid-cols-3 xl:grid-cols-6 xl:divide-y-0">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0 px-4 py-4 sm:px-5">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{metric.label}</dt>
            <dd className="mt-1 text-xl font-bold tabular-nums tracking-tight sm:text-2xl">{metric.value}</dd>
            <p className="mt-1 truncate text-[10px] text-slate-400">{metric.detail}</p>
          </div>
        ))}
      </dl>
    </section>
  );
}

const headCell = "whitespace-nowrap px-3 py-2 text-left";
const numberHeadCell = "whitespace-nowrap px-3 py-2 text-right";
const bodyCell = "whitespace-nowrap px-3 py-2.5 text-xs text-slate-700";
const numberBodyCell = "whitespace-nowrap px-3 py-2.5 text-right text-xs tabular-nums text-slate-700";

function CurrentMainPoolTable({ wagers }: { wagers: MainPoolWager[] }) {
  if (wagers.length === 0) {
    return <EmptyState title="No Week 1 wagers yet" description="Current selections will appear here after the pool lines are posted and decisions are recorded." />;
  }

  return (
    <DenseTableScroller label="Current week main pool wagers" className="-mx-3 sm:-mx-4">
      <table className="min-w-[980px] w-full border-separate border-spacing-0">
        <thead><tr className={DENSE_TABLE_HEAD_ROW}>
          {['Pick', 'Pool Line', 'Market', 'JKB', 'Est. Cover %', 'Confidence', 'Wager', 'Status', 'Result'].map((label) => (
            <th key={label} scope="col" className={label === 'Pick' ? headCell : numberHeadCell}>{label}</th>
          ))}
        </tr></thead>
        <tbody>{wagers.map((wager, index) => (
          <tr key={`${wager.week}-${wager.selection}-${index}`} className={DENSE_TABLE_ROW}>
            <td className={cn(bodyCell, "font-semibold text-slate-900")}>{wager.selection}</td>
            <td className={numberBodyCell}>{formatSpread(wager.poolLine)}</td>
            <td className={numberBodyCell}>{formatSpread(wager.marketLineAtDecision)}</td>
            <td className={numberBodyCell}>{formatSpread(wager.jkbProjectedSpread)}</td>
            <td className={numberBodyCell}>{formatPercent(wager.chatgptEstimatedCoverProbability)}</td>
            <td className={numberBodyCell}>{wager.confidence}</td>
            <td className={cn(numberBodyCell, "font-semibold")}>{formatNumber(wager.wager)}</td>
            <td className={numberBodyCell}><Badge label={wager.status} className={statusStyles[wager.status]} /></td>
            <td className={numberBodyCell}><Badge label={wager.result} className={resultStyles[wager.result]} /></td>
          </tr>
        ))}</tbody>
      </table>
    </DenseTableScroller>
  );
}

function MainPoolLedger({ wagers, data }: { wagers: MainPoolWager[]; data: ChatGptPoolData }) {
  if (wagers.length === 0) {
    return <EmptyState title="The season ledger is ready" description="Every official wager will be preserved here with the frozen pool line, decision-time market, closing line, rationale, and bankroll result." />;
  }

  return (
    <>
      <DenseTableScroller label="Full season main pool wager ledger" className="-mx-3 sm:-mx-4">
        <table className="min-w-[1280px] w-full border-separate border-spacing-0">
          <thead><tr className={DENSE_TABLE_HEAD_ROW}>
            {['Week', 'Pick', 'Pool Line', 'Market @ Pick', 'Close', 'JKB', 'Cover %', 'Confidence', 'Wager', 'Result', 'Pts +/−', 'Bankroll'].map((label) => (
              <th key={label} scope="col" className={label === 'Pick' ? headCell : numberHeadCell}>{label}</th>
            ))}
          </tr></thead>
          <tbody>{wagers.map((wager, index) => (
            <tr key={`${wager.week}-${wager.selection}-${index}`} className={DENSE_TABLE_ROW}>
              <td className={numberBodyCell}>{wager.week}</td>
              <td className={cn(bodyCell, "min-w-[210px]")}>
                <div className="font-semibold text-slate-900">{wager.selection}</div>
                <div className="mt-0.5 text-[10px] text-slate-500">{wager.matchup} · {wager.date}</div>
                <details className="mt-1 max-w-[300px] whitespace-normal text-[10px] text-slate-500">
                  <summary className="cursor-pointer font-semibold text-sky-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">Decision notes</summary>
                  <p className="mt-1 leading-4">{wager.decisionReason}{wager.notes ? ` ${wager.notes}` : ""}</p>
                  {wager.finalScore && <p className="mt-1 font-semibold text-slate-700">Final: {wager.finalScore}</p>}
                </details>
              </td>
              <td className={numberBodyCell}>{formatSpread(wager.poolLine)}</td>
              <td className={numberBodyCell}>{formatSpread(wager.marketLineAtDecision)}</td>
              <td className={numberBodyCell}>{formatSpread(wager.closingMarketLine)}</td>
              <td className={numberBodyCell}>{formatSpread(wager.jkbProjectedSpread)}</td>
              <td className={numberBodyCell}>{formatPercent(wager.chatgptEstimatedCoverProbability)}</td>
              <td className={numberBodyCell}>{wager.confidence}</td>
              <td className={cn(numberBodyCell, "font-semibold")}>{formatNumber(wager.wager)}</td>
              <td className={numberBodyCell}><Badge label={wager.result} className={resultStyles[wager.result]} /></td>
              <td className={cn(numberBodyCell, wager.pointsResult != null && wager.pointsResult > 0 ? "text-emerald-700" : wager.pointsResult != null && wager.pointsResult < 0 ? "text-rose-700" : "")}>{formatSigned(wager.pointsResult)}</td>
              <td className={cn(numberBodyCell, "font-semibold")}>{formatNumber(wager.bankrollAfter)}</td>
            </tr>
          ))}</tbody>
        </table>
      </DenseTableScroller>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 pt-3 text-[11px] text-slate-600">
        <span>Total wagered <strong className="text-slate-900">{formatNumber(data.mainPool.totalPointsWagered)}</strong></span>
        <span>Net <strong className="text-slate-900">{formatSigned(data.mainPool.netPoints)}</strong></span>
        <span>Record <strong className="text-slate-900">{data.mainPool.atsWins}-{data.mainPool.atsLosses}-{data.mainPool.atsPushes}</strong></span>
        <span>ROI <strong className="text-slate-900">{formatPercent(data.mainPool.roiOnPointsWagered)}</strong></span>
      </div>
    </>
  );
}

function SidePoolScoreboard({ data }: { data: ChatGptPoolData }) {
  const { sidePool } = data;
  const metrics = [
    ["Cumulative Score", formatNumber(sidePool.cumulativeScore)],
    ["Rank", formatNumber(sidePool.currentRank)],
    ["Next Cut", sidePool.nextCutWeek == null ? "—" : `Week ${sidePool.nextCutWeek}`],
    ["Cut Line", formatNumber(sidePool.currentCutLine)],
    ["Distance From Cut", formatSigned(sidePool.distanceFromCut)],
    ["Players Remaining", formatNumber(sidePool.totalRemaining)],
  ];

  return (
    <div className="rounded-lg bg-slate-100 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-semibold text-slate-700"><Gauge className="h-4 w-4 text-sky-700" aria-hidden="true" /> Lower score is better</p>
        <Badge label={sidePool.status} className={sideStatusStyles[sidePool.status]} />
      </div>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-3 xl:grid-cols-6">
        {metrics.map(([label, value]) => (
          <div key={label} className="bg-white px-3 py-3">
            <dt className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</dt>
            <dd className="mt-1 text-lg font-bold tabular-nums text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function predictionLabel(winner: string | null, margin: number | null): string {
  return winner && margin != null ? `${winner} by ${formatNumber(margin)}` : "—";
}

function SidePoolLedger({ weeks }: { weeks: SidePoolWeek[] }) {
  if (weeks.length === 0) {
    return <EmptyState title="No Side Pool prediction yet" description="Week 1 will be recorded once the designated game and frozen pool spread are available." />;
  }

  return (
    <DenseTableScroller label="Side pool weekly ledger" className="-mx-3 sm:-mx-4">
      <table className="min-w-[1120px] w-full border-separate border-spacing-0">
        <thead><tr className={DENSE_TABLE_HEAD_ROW}>
          {['Week', 'Game', 'Pool Spread', 'Prediction', 'Actual', 'Error', 'Bonus', 'Week Score', 'Cumulative', 'Rank', 'Status'].map((label) => (
            <th key={label} scope="col" className={label === 'Game' ? headCell : numberHeadCell}>{label}</th>
          ))}
        </tr></thead>
        <tbody>{weeks.map((week) => (
          <tr key={week.week} className={DENSE_TABLE_ROW}>
            <td className={numberBodyCell}>{week.week}</td>
            <td className={cn(bodyCell, "font-semibold text-slate-900")}>{week.matchup}</td>
            <td className={numberBodyCell}>{week.favorite} {formatSpread(-Math.abs(week.postedPoolSpread))}</td>
            <td className={numberBodyCell}>{predictionLabel(week.chatgptPredictedWinner, week.chatgptPredictedMargin)}</td>
            <td className={numberBodyCell}>{predictionLabel(week.actualWinner, week.actualMargin)}</td>
            <td className={numberBodyCell}>{formatNumber(week.rawPredictionError)}</td>
            <td className={numberBodyCell}>{formatSigned(week.underdogBonus)}</td>
            <td className={cn(numberBodyCell, "font-semibold")}>{formatNumber(week.weeklyScore)}</td>
            <td className={numberBodyCell}>{formatNumber(week.cumulativeScore)}</td>
            <td className={numberBodyCell}>{formatNumber(week.rankAfterWeek)}</td>
            <td className={numberBodyCell}><Badge label={week.status} className={sideStatusStyles[week.status]} /></td>
          </tr>
        ))}</tbody>
      </table>
    </DenseTableScroller>
  );
}

function PerformanceGroup({ title, rows }: { title: string; rows: PerformanceBreakdownRow[] }) {
  return (
    <div className="border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold text-slate-800">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-1 text-[11px] leading-4 text-slate-500">No graded wagers yet.</p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {rows.map((row) => (
            <div key={row.label} className="grid grid-cols-[1fr_auto_auto] gap-3 text-[11px] text-slate-600">
              <span>{row.label}</span>
              <span className="tabular-nums">{row.wins}-{row.losses}-{row.pushes}</span>
              <span className="font-semibold tabular-nums text-slate-900">{formatSigned(row.netPoints)} pts</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StrategyChangelog({ data }: { data: ChatGptPoolData }) {
  return (
    <div className="space-y-3">
      {data.strategyChangelog.map((change) => (
        <article key={`${change.version}-${change.weekImplemented}`} className="rounded-lg bg-slate-50 p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-[100px_130px_1fr]">
            <div><p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Version</p><p className="mt-1 text-sm font-bold text-slate-900">{change.version}</p></div>
            <div><p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Implemented</p><p className="mt-1 text-sm font-semibold text-slate-900">Week {change.weekImplemented}</p></div>
            <div><p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Reason</p><p className="mt-1 text-sm font-semibold text-slate-900">{change.reason}</p><p className="mt-0.5 text-[11px] text-slate-500">Evidence: {change.evidence}</p></div>
          </div>
          <div className="mt-3 border-t border-slate-200 pt-3">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Exact Change</p>
            <ul className="mt-2 grid gap-x-6 gap-y-1.5 text-xs leading-5 text-slate-700 md:grid-cols-2">
              {change.exactChanges.map((item) => <li key={item} className="flex gap-2"><span className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-sky-700" aria-hidden="true" />{item}</li>)}
            </ul>
          </div>
        </article>
      ))}
    </div>
  );
}

export function StevePoolDashboardContent({ data }: { data: ChatGptPoolData }) {
  const currentWagers = data.mainPoolWagers.filter((wager) => wager.week === data.currentWeek);
  const performance = data.performanceBreakdowns;

  return (
    <div className="space-y-5">
      <NflPageHeader
        eyebrow={`${data.season} ${data.entryName} Entry`}
        title="ChatGPT Pool Entry"
        description="Season ledger, weekly decisions, results, and strategy record for the Main Pool and Side Elimination Pool."
        actions={<div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600"><ShieldCheck className="h-4 w-4 text-sky-700" aria-hidden="true" /><span>Ledger active</span></div>}
      >
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500">
          <div className="flex gap-1"><dt>Current Week</dt><dd className="font-semibold text-slate-800">{data.currentWeek}</dd></div>
          <div className="flex gap-1"><dt>Strategy</dt><dd className="font-semibold text-slate-800">v{data.strategyVersion}</dd></div>
          <div className="flex gap-1"><dt>Last Updated</dt><dd className="font-semibold text-slate-800">{formatDate(data.lastUpdated)}</dd></div>
        </dl>
      </NflPageHeader>

      <MainPoolScoreboard data={data} />

      <NflSection title={`Week ${data.currentWeek} · Main Pool`} subtitle="Current decisions against the permanently frozen pool lines">
        <CurrentMainPoolTable wagers={currentWagers} />
      </NflSection>

      <NflSection title="Main Pool Wager Ledger" subtitle="Every wager, decision snapshot, closing-line comparison, and bankroll result">
        <MainPoolLedger wagers={data.mainPoolWagers} data={data} />
      </NflSection>

      <NflSection title="Side Elimination Pool" subtitle="Margin-prediction ledger · lower cumulative score is better">
        <SidePoolScoreboard data={data} />
        <div className="mt-4"><SidePoolLedger weeks={data.sidePoolWeeks} /></div>
      </NflSection>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <NflSection title="Performance & Process" subtitle="Graded splits will populate as the wager ledger grows">
          <div className="space-y-3">
            <PerformanceGroup title="By confidence" rows={performance.byConfidence} />
            <PerformanceGroup title="Favorite vs underdog" rows={performance.favoriteVsUnderdog} />
            <PerformanceGroup title="Home vs away" rows={performance.homeVsAway} />
            <PerformanceGroup title="When beating the closing line" rows={performance.closingLineValue} />
            <PerformanceGroup title="Agreeing vs disagreeing with JKB" rows={performance.jkbAlignment} />
          </div>
        </NflSection>

        <NflSection title="Strategy Changelog" subtitle="Versioned record of process changes and the evidence behind them">
          <StrategyChangelog data={data} />
        </NflSection>
      </div>

      <NflSection title="Pool Rules Reference" subtitle="Scoring, wagering, and elimination rules" collapse="always" defaultOpen={false}>
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-900"><Target className="h-4 w-4 text-sky-700" aria-hidden="true" />Main Pool</h3>
            <ul className="mt-2 space-y-1.5 text-xs leading-5 text-slate-600">{data.poolRules.mainPool.map((rule) => <li key={rule} className="flex gap-2"><span className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />{rule}</li>)}</ul>
          </div>
          <div>
            <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-900"><Trophy className="h-4 w-4 text-sky-700" aria-hidden="true" />Side Pool</h3>
            <ul className="mt-2 space-y-1.5 text-xs leading-5 text-slate-600">{data.poolRules.sidePool.map((rule) => <li key={rule} className="flex gap-2"><span className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />{rule}</li>)}</ul>
          </div>
        </div>
      </NflSection>
    </div>
  );
}

export default function StevePoolDashboard() {
  usePageSeo({
    title: "ChatGPT Pool Entry",
    description: "2026 JoeKnowsBall.com NFL pool entry ledger.",
    path: "/steve",
    noindex: true,
    nofollow: true,
  });
  const { loading, error, data } = useChatGptPoolData();

  return (
    <SiteShell>
      <main className="min-h-[70vh] bg-slate-50">
        <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          {loading && <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600" role="status">Loading the 2026 pool ledger…</div>}
          {!loading && error && (
            <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div><p className="font-semibold">The pool ledger could not be loaded.</p><p className="mt-1 text-xs leading-5">{error} Check the canonical season data and reload this page.</p></div>
            </div>
          )}
          {!loading && data && <StevePoolDashboardContent data={data} />}
        </div>
      </main>
    </SiteShell>
  );
}
