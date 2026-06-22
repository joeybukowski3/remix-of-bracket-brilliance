import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import PgaHistoryModelTable from "@/components/pga/PgaHistoryModelTable";
import {
  findCourseWeightEntry,
  getCurrentAndNextEvents,
  type RawPlayerStat,
  usePgaHubData,
} from "@/components/pga/PgaHubShared";
import { usePgaPlayerHistory } from "@/hooks/usePgaPlayerHistory";
import {
  buildCourseFitWeights,
  buildMetricPercentiles,
  calculateCourseFit,
  calculateTournamentModelScore,
  calculateTrend,
  findEventHistory,
  normalizePlayerKey,
  resolveMajorType,
  scoreFourResultHistory,
  scoreRecentResults,
  selectAllMajorHistory,
  selectSpecificMajorHistory,
  type PgaTournamentModelRow,
} from "@/lib/pga/historyModel";
import { SPORTSBOOKS } from "@/lib/sportsbooks";

const BASE_WEIGHTS = { sgTotal: .55, sgApp: .12, sgPutt: .06, sgAtG: .10, sgOTT: .07, drivingAccuracy: .05, bogeyAvoidance: .05 };

type CurrentField = { tournament: string; players: string[]; source: string };

export default function PgaHistoryModel() {
  const { schedule, courseWeights, playerStats, loading } = usePgaHubData();
  const { playerHistoryMap, majorHistoryMap, loading: historyLoading, error: historyError } = usePgaPlayerHistory();
  const [field, setField] = useState<CurrentField | null>(null);
  const [fieldOnly, setFieldOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [statView, setStatView] = useState<"percentile" | "raw">("percentile");

  useEffect(() => {
    fetch("/data/pga/current-field.json", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then(setField)
      .catch(() => setField(null));
  }, []);

  const { active, current } = useMemo(() => getCurrentAndNextEvents(schedule), [schedule]);
  const event = active ?? current;
  const eventSlug = event?.slug ?? "travelers-championship";
  const eventName = event?.shortName || event?.name || "Current Tournament";
  const majorType = resolveMajorType(eventName, eventSlug);
  const isMajor = event?.category === "major" || majorType != null;
  const activeWeights = useMemo(
    () => event ? findCourseWeightEntry(courseWeights, event.name, event.courseName)?.weights : null,
    [courseWeights, event],
  );

  const fieldSet = useMemo(() => new Set((field?.players ?? []).map(normalizePlayerKey)), [field]);

  const modelRows = useMemo(() => {
    const merged = playerStats.map((player) => {
      const key = normalizePlayerKey(player.player);
      const history = playerHistoryMap.get(key);
      return {
        ...player,
        drivingDistance: history?.stats?.drivingDistance ?? null,
        drivingAccuracy: history?.stats?.drivingAccuracy ?? player.drivingAccuracy,
      };
    });
    const percentiles = buildMetricPercentiles(merged);
    const baseScores = buildBaseScores(merged);
    const fitWeights = buildCourseFitWeights(activeWeights, {
      slug: eventSlug,
      name: eventName,
      category: event?.category,
      yardage: event?.yardage,
    });

    const rows = merged.map((player) => {
      const key = normalizePlayerKey(player.player);
      const history = playerHistoryMap.get(key);
      const majorHistory = majorHistoryMap.get(key)?.results ?? [];
      const recentResults = history?.recentResults.slice(0, 8) ?? [];
      const eventResults = findEventHistory(history, eventSlug, eventName);
      const specificMajorResults = selectSpecificMajorHistory(majorHistory, majorType);
      const allMajorResults = selectAllMajorHistory(majorHistory);
      const displayPercentiles = percentiles.get(key) ?? {};
      const courseFit = calculateCourseFit(displayPercentiles, fitWeights);
      const recentScore = scoreRecentResults(recentResults);
      const eventHistoryScore = scoreFourResultHistory(eventResults);
      const specificMajorScore = scoreFourResultHistory(specificMajorResults);
      const allMajorScore = scoreRecentResults(allMajorResults);
      const trend = calculateTrend(recentResults);
      const baseScore = baseScores.get(key) ?? 50;
      const modelScore = calculateTournamentModelScore({
        baseScore,
        recentScore,
        courseFit,
        eventHistoryScore,
        specificMajorScore,
        allMajorScore,
        trendScore: trend.score,
        isMajor,
      });
      return {
        ...player,
        baseScore,
        modelScore,
        modelRank: 0,
        recentResults,
        eventResults,
        specificMajorResults,
        allMajorResults,
        recentScore,
        eventHistoryScore,
        specificMajorScore,
        allMajorScore,
        courseFit,
        trend,
        displayPercentiles,
      } satisfies PgaTournamentModelRow;
    });

    return rows.sort((a, b) => b.modelScore - a.modelScore || a.player.localeCompare(b.player)).map((row, index) => ({ ...row, modelRank: index + 1 }));
  }, [playerStats, playerHistoryMap, majorHistoryMap, activeWeights, eventSlug, eventName, event, majorType, isMajor]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return modelRows.filter((row) => {
      if (fieldOnly && fieldSet.size && !fieldSet.has(normalizePlayerKey(row.player))) return false;
      return !query || row.player.toLowerCase().includes(query);
    });
  }, [modelRows, fieldOnly, fieldSet, search]);

  return (
    <SiteShell>
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 px-4 py-8 text-center text-white">
        <div className="mx-auto max-w-[1800px]"><div className="text-xs font-black uppercase tracking-widest text-emerald-400">Joe Knows Ball</div><h1 className="mt-1 text-3xl font-black">PGA Tournament Model</h1><p className="mt-1 text-sm text-slate-300">{eventName} · recent form, course history, course fit and trend</p></div>
      </div>
      <div className="mx-auto flex w-full max-w-[1800px] gap-6 px-4 py-6 sm:px-6 xl:px-8">
        <aside className="hidden w-60 shrink-0 lg:block"><div className="sticky top-4 overflow-hidden rounded-xl border bg-white shadow-sm"><div className="bg-slate-900 px-4 py-3 text-sm font-black text-white">2026 PGA Tour</div><div className="max-h-[72vh] divide-y overflow-y-auto">{schedule.filter((entry) => entry.startDate >= new Date().toISOString().slice(0, 10)).slice(0, 12).map((entry) => <div key={entry.id} className={`px-3 py-2 ${entry.id === event?.id ? "bg-emerald-50" : ""}`}><div className="text-xs font-bold">{entry.shortName || entry.name}</div><div className="text-[10px] text-slate-400">{entry.dateLabel}</div>{entry.dataFile && <Link to={`/pga/${entry.slug}/model`} className="mt-1 inline-block text-[10px] font-bold text-emerald-700">View model →</Link>}</div>)}</div></div></aside>
        <main className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap gap-2"><Link to="/pga/best-bets" className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">Best Bets</Link><Link to="/pga/dfs" className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">DFS Upload</Link></div>
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3 shadow-sm"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search player..." className="min-w-52 flex-1 rounded-lg border px-3 py-2 text-sm" /><button onClick={() => setFieldOnly((value) => !value)} className={`rounded-full px-3 py-1.5 text-xs font-black ${fieldOnly ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"}`}>{fieldOnly ? `Field only (${filtered.length})` : "All players"}</button><div className="inline-flex rounded-full border p-0.5 text-xs font-bold"><button onClick={() => setStatView("percentile")} className={`rounded-full px-3 py-1 ${statView === "percentile" ? "bg-emerald-600 text-white" : ""}`}>Percentile</button><button onClick={() => setStatView("raw")} className={`rounded-full px-3 py-1 ${statView === "raw" ? "bg-emerald-600 text-white" : ""}`}>Raw</button></div></div>
          {historyError && <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">History data is partially unavailable: {historyError}</div>}
          {loading || historyLoading ? <div className="py-16 text-center text-sm text-slate-400">Loading tournament model…</div> : <PgaHistoryModelTable rows={filtered} statView={statView} isMajor={isMajor} eventLabel={eventName} />}
          <p className="mt-3 text-[11px] text-slate-400">Regular events use core stats, last eight starts, course fit, same-event history and trend. Majors replace event history with the last four starts in that major plus the last eight major starts overall.</p>
        </main>
        <aside className="hidden w-48 shrink-0 xl:block"><div className="sticky top-4 rounded-xl border bg-white p-3 shadow-sm"><div className="mb-2 text-[10px] font-black uppercase text-slate-500">Bet with our partners</div><div className="space-y-1">{SPORTSBOOKS.map((book) => <a key={book.name} href={book.referralUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded px-2 py-1.5 text-[11px] font-bold" style={{ backgroundColor: book.bgColor, color: book.textColor }}>{book.name}</a>)}</div></div></aside>
      </div>
    </SiteShell>
  );
}

function buildBaseScores(players: Array<RawPlayerStat & { drivingDistance: number | null }>) {
  const metrics = Object.keys(BASE_WEIGHTS) as Array<keyof typeof BASE_WEIGHTS>;
  const ranges = new Map(metrics.map((key) => {
    const values = players.map((player) => Number(player[key])).filter(Number.isFinite);
    return [key, { min: Math.min(...values), max: Math.max(...values) }];
  }));
  return new Map(players.map((player) => {
    let total = 0, weight = 0;
    metrics.forEach((key) => {
      const value = Number(player[key]); const range = ranges.get(key); const metricWeight = BASE_WEIGHTS[key];
      if (!Number.isFinite(value) || !range || range.max === range.min) return;
      const percentile = key === "bogeyAvoidance" ? ((range.max - value) / (range.max - range.min)) * 100 : ((value - range.min) / (range.max - range.min)) * 100;
      total += percentile * metricWeight; weight += metricWeight;
    });
    return [normalizePlayerKey(player.player), weight ? total / weight : 50];
  }));
}
