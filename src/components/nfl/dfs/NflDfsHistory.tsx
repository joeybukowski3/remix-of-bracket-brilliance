import { useEffect, useState } from "react";
import { DenseTableScroller } from "@/components/ui/dense-table";
import type { DfsEnrichedAnalyzerRow } from "@/lib/nfl/dfs/slateAnalyzer";
import { adaptDfsFantasyPointsAllowed } from "@/lib/nfl/dfs/history";
import { defenseSummary, dfsHistoryLoader, historyKeys, historyNumber, historySigned, summarizeHistoryRows,
  type DfsHistoryDetail, type DfsHistoryIndex, type HistoryTarget } from "@/lib/nfl/dfs/historyDelivery";

export const HISTORY_NOTE = "Historical averages are reconstructed using only games before each matchup; underlying stat corrections may reflect later official revisions.";
export const DEF_AVG_HELP = "Average yardage allowed by this defense versus each opposing player's own entering-game trailing-10 average. QB: passing; RB: rushing; WR/TE: receiving. Above/below counts use valid comparisons only.";
export const FPA_HELP = "Canonical weekly research fantasy points allowed to this position: Season and Last 5 (L5), with source season, games and rank. Prior-season samples are labeled explicitly.";

export function FpaSignal({ row }: { row: DfsEnrichedAnalyzerRow }) {
  if (row.kind === "dst") return <>N/A</>;
  const fpa = adaptDfsFantasyPointsAllowed(row.research ?? null);
  return <div className="text-[10px] tabular-nums leading-tight" title={FPA_HELP}>
    {([['Season', fpa.opponentFpaSeason], ['L5', fpa.opponentFpaLast5]] as const).map(([label, metric]) =>
      <div key={label} title={`${label}: ${metric?.sampleSize ?? 0} games; rank ${metric?.rank ?? "unavailable"} of ${metric?.poolSize ?? 0}`}>
        <span className="text-slate-500">{label} </span><strong>{historyNumber(metric?.value)}</strong>
        {metric?.value != null && <span> {metric.rank == null ? "" : `#${metric.rank}`} <span className="text-slate-500">({metric.sampleSeason ?? "mixed seasons"})</span></span>}
      </div>)}
  </div>;
}

export function DefenseSignal({ row, index, loading }: { row: DfsEnrichedAnalyzerRow; index: DfsHistoryIndex | null; loading: boolean }) {
  if (row.kind === "dst") return <>N/A</>;
  const summary = defenseSummary(index, row);
  return <div className="text-[10px] leading-tight" title={`${DEF_AVG_HELP} ${HISTORY_NOTE}`}>
    {loading ? "Loading…" : !index ? "History unavailable" : !summary.comparisonCount ? "No historical sample" : <>
      <strong className="tabular-nums">{historySigned(summary.mean)}</strong>
      <div>{summary.aboveCount}/{summary.comparisonCount} Above</div>
    </>}
  </div>;
}

export default function NflDfsHistory({ row, target, index }: { row: DfsEnrichedAnalyzerRow; target?: HistoryTarget; index: DfsHistoryIndex | null }) {
  const [view, setView] = useState<"player" | "opponent">("player");
  const [loaded, setLoaded] = useState<{ key: string; data: DfsHistoryDetail | null } | null>(null);
  const keys = historyKeys(row);
  const position = keys?.position;
  const loadKey = `${target?.season}/${target?.week}/${target?.firstKickoff}/${index?.asOf}/${position}`;
  useEffect(() => {
    let active = true;
    if (target && index && position) {
      void dfsHistoryLoader.detail(target, index, position).then(
        (data) => { if (active) setLoaded({ key: loadKey, data }); },
        () => { if (active) setLoaded({ key: loadKey, data: null }); },
      );
    }
    return () => { active = false; };
  }, [target, index, position, loadKey]);
  if (!keys) return null;
  const detail = loaded?.key === loadKey ? loaded : null;
  const rows = view === "player" ? (keys.player ? detail?.data?.players[keys.player] ?? [] : []) : (keys.defense ? detail?.data?.defenseMatchups[keys.defense] ?? [] : []);
  const summary = summarizeHistoryRows(rows);
  const delta = summary.delta;
  return <section aria-label="Historical yardage context" className="mt-3 min-w-0 space-y-2 border-t border-slate-200 pt-3 text-[11px]">
    <div role="tablist" aria-label="Historical view" className="flex gap-1">
      {([['player', 'Player Last 10'], ['opponent', 'Opponent Last 10']] as const).map(([value, label]) =>
        <button type="button" role="tab" aria-selected={view === value} key={value} onClick={() => setView(value)} className={`min-h-9 rounded px-3 font-bold ${view === value ? "bg-slate-950 text-white" : "bg-white text-slate-600"}`}>{label}</button>)}
    </div>
    <p className="text-slate-600">{keys.market} yards · {view === "player" ? "Opponent allowance covers the entire position group per defense game, entering that matchup." : "Individual recorded offensive appearances at this position; multiple players from one game can appear. Each baseline is that player's entering-game trailing-10 average."}</p>
    {!target || !index ? <p role="status">History unavailable for this week.</p> : !detail ? <p role="status">Loading history…</p> : !detail.data ? <p role="status">History unavailable for this week.</p> : !rows.length ? <p role="status">No historical sample</p> : <>
      <div className="flex flex-wrap gap-x-3 gap-y-1 rounded bg-white p-2 font-semibold">
        <span>Mean {historySigned(delta.mean)} · Median {historySigned(delta.median)}</span>
        <span>{delta.aboveCount}/{delta.comparisonCount} above {view === "player" ? "opponent positional allowance" : "own player average"}</span>
        <span>{delta.belowCount} below · {delta.equalCount} equal · {delta.missingCount} missing comparison</span>
        <span>Archived lines: {summary.over} over / {summary.under} under / {summary.push} push ({summary.lines}/{rows.length} available)</span>
      </div>
      <DenseTableScroller label={`${view === "player" ? "Player" : "Opponent"} Last 10 yardage`} className="max-w-full overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full min-w-[600px] border-collapse text-left text-[10px] tabular-nums">
          <thead className="bg-slate-100 text-slate-600"><tr>{["Date", ...(view === "player" ? ["Opp", "H/A"] : ["Opposing player", "Team"]), "Yards", view === "player" ? "Pos. allowance" : "Player avg", "Δ Yds", "Archived line", "O/U"].map((label) => <th scope="col" key={label} className="px-2 py-2">{label}</th>)}</tr></thead>
          <tbody>{rows.map((game) => {
            const player = "actualMinusOpponentAllowance" in game;
            const line = game.historicalSportsbookLine;
            return <tr key={game.rowId} className="border-t border-slate-100">
              <td className="whitespace-nowrap px-2 py-1.5">{game.dateUtc.slice(0, 10)}</td>
              <td className="px-2 py-1.5">{player ? game.opponent.toUpperCase() : game.playerName}</td>
              <td className="px-2 py-1.5">{player ? game.homeAway : game.team.toUpperCase()}</td>
              <td className="px-2 py-1.5 font-bold">{historyNumber(game.actualYards)}</td>
              <td className="px-2 py-1.5" title={`${player ? game.opponentPregamePositionalAllowanceSampleSize : game.playerReferenceSampleSize} prior games`}>{historyNumber(player ? game.opponentPregamePositionalAllowance : game.playerPregameTrailing10Average)}</td>
              <td className="px-2 py-1.5 font-semibold">{historySigned(player ? game.actualMinusOpponentAllowance : game.actualMinusPlayerAverage)}</td>
              <td className="px-2 py-1.5" title={line ? `${line.bookmaker}; observed ${line.observedAt}; selected pre-kickoff observation` : "No archived line"}>{line ? <>{historyNumber(line.point)} <span className="text-slate-500">{line.bookmaker}</span></> : "—"}</td>
              <td className="px-2 py-1.5">{game.lineResult === "unavailable" ? "—" : game.lineResult}</td>
            </tr>;
          })}</tbody>
        </table>
      </DenseTableScroller>
    </>}
    <p className="text-[10px] text-slate-500">{HISTORY_NOTE} {index && `As of ${index.asOf}.`} No archived line means no historical O/U comparison.</p>
  </section>;
}
