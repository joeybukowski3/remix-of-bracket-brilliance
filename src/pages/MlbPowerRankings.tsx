import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import SiteShell from "@/components/layout/SiteShell";
import MlbNavHero from "@/components/mlb/MlbNavHero";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useMlbPowerRankings, type PowerRankingTeam, type PowerRankingMetric } from "@/hooks/useMlbPowerRankings";

type SortKey = "seasonRank" | "last30Rank" | "seasonScore" | "last30Score" | "currentSos" | "next30Sos" | "rosSos";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "seasonRank",  label: "Season Rank" },
  { value: "last30Rank",  label: "Last 30 Rank" },
  { value: "seasonScore", label: "Season Score" },
  { value: "last30Score", label: "Last 30 Score" },
  { value: "currentSos",  label: "Current SOS" },
  { value: "next30Sos",   label: "Next 30 SOS" },
  { value: "rosSos",      label: "Rest of Season SOS" },
];

function sortValue(team: PowerRankingTeam, key: SortKey): number {
  switch (key) {
    case "seasonRank":  return team.seasonRank ?? 999;
    case "last30Rank":  return team.last30Rank ?? 999;
    case "seasonScore": return -(team.seasonCompositeScore ?? -1);
    case "last30Score": return -(team.last30CompositeScore ?? -1);
    case "currentSos":  return -(team.currentSos ?? -1);
    case "next30Sos":   return -(team.next30Sos ?? -1);
    case "rosSos":      return -(team.restOfSeasonSos ?? -1);
  }
}

function rankBand(rank: number | null): string {
  if (rank == null) return "bg-slate-100 text-slate-500";
  if (rank <= 5) return "bg-emerald-100 text-emerald-800";
  if (rank <= 10) return "bg-emerald-50 text-emerald-700";
  if (rank >= 26) return "bg-rose-100 text-rose-700";
  if (rank >= 21) return "bg-rose-50 text-rose-600";
  return "bg-slate-100 text-slate-600";
}

function scoreColor(score: number | null): string {
  if (score == null) return "text-slate-400";
  if (score >= 70) return "text-emerald-700";
  if (score >= 55) return "text-emerald-600";
  if (score <= 30) return "text-rose-600";
  if (score <= 45) return "text-rose-500";
  return "text-slate-700";
}

function fmt1(v: number | null | undefined): string {
  return v != null && Number.isFinite(v) ? v.toFixed(1) : "—";
}
function fmt3(v: number | null | undefined): string {
  return v != null && Number.isFinite(v) ? v.toFixed(3) : "—";
}

function MetricRow({ label, metric, decimals = 2 }: { label: string; metric: PowerRankingMetric; decimals?: number }) {
  const valStr = metric.value == null ? "—" : decimals === 3 ? fmt3(metric.value) : metric.value.toFixed(decimals);
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded-lg border border-slate-100 bg-white px-2.5 py-1.5 text-xs">
      <span className="font-semibold text-slate-600">{label}</span>
      <span className="font-mono tabular-nums text-slate-900">{valStr}</span>
      <span className="font-mono tabular-nums text-slate-400">#{metric.rank ?? "—"}</span>
      <span className={`w-10 text-right font-mono tabular-nums font-bold ${scoreColor(metric.normalizedScore)}`}>
        {metric.normalizedScore != null ? metric.normalizedScore.toFixed(0) : "—"}
      </span>
    </div>
  );
}

function MetricHeader() {
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-2.5 text-[9px] font-bold uppercase tracking-wide text-slate-400">
      <span>Metric</span><span>Value</span><span>Rank</span><span className="text-right">Score</span>
    </div>
  );
}

function SosPanel({ label, score, rank, games }: { label: string; score: number | null; rank: number | null; games: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="font-mono text-lg font-bold text-slate-900">{fmt1(score)}</span>
        <span className="text-[10px] text-slate-400">#{rank ?? "—"}</span>
      </div>
      <p className="text-[10px] text-slate-400">{games} games</p>
    </div>
  );
}

function NextMonthOpponents({ team }: { team: PowerRankingTeam }) {
  const games = team.nextMonthGames;
  if (games.length === 0) {
    return <p className="p-3 text-xs text-slate-400">No July games scheduled.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4">
      {games.map((g, i) => (
        <div key={`${g.date}-${i}`} className="flex items-center gap-1.5 rounded-lg border border-slate-100 bg-white px-2 py-1.5">
          <MlbTeamLogo team={g.opponent} size={20} />
          <div className="min-w-0">
            <p className="truncate text-[11px] font-bold text-slate-700">
              {g.home ? "vs" : "@"} {g.opponent}
            </p>
            <p className="text-[9px] text-slate-400">{g.date.slice(5).replace("-", "/")}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

type ExpandedTab = "season" | "last30" | "schedule" | "nextMonth";

function ExpandedTeamRow({ team }: { team: PowerRankingTeam }) {
  const [tab, setTab] = useState<ExpandedTab>("season");

  return (
    <div className="border-t border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex flex-wrap gap-1">
        {([
          ["season", "Season Metrics"],
          ["last30", "Last 30 Metrics"],
          ["schedule", "Schedule"],
          ["nextMonth", "Next Month Opponents"],
        ] as [ExpandedTab, string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={(e) => { e.stopPropagation(); setTab(key); }}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-bold transition ${
              tab === key ? "border-[#031635] bg-[#031635] text-white" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "season" && (
        <div className="space-y-1">
          <MetricHeader />
          <MetricRow label="ERA" metric={team.seasonMetrics.era} decimals={2} />
          <MetricRow label="FIP" metric={team.seasonMetrics.fip} decimals={2} />
          <MetricRow label="xBA" metric={team.seasonMetrics.xba} decimals={3} />
          <MetricRow label="OPS" metric={team.seasonMetrics.ops} decimals={3} />
          <MetricRow label="wRC+" metric={team.seasonMetrics.wrcPlus} decimals={0} />
          <MetricRow label="Run Diff / Game" metric={team.seasonMetrics.runDifferential} decimals={2} />
          <MetricRow label="Schedule-Adj Performance" metric={team.seasonMetrics.scheduleAdjPerformance} decimals={2} />
        </div>
      )}

      {tab === "last30" && (
        <div className="space-y-1">
          <MetricHeader />
          <MetricRow label="ERA" metric={team.last30Metrics.era} decimals={2} />
          <MetricRow label="FIP" metric={team.last30Metrics.fip} decimals={2} />
          <MetricRow label="xBA" metric={team.last30Metrics.xba} decimals={3} />
          <MetricRow label="OPS" metric={team.last30Metrics.ops} decimals={3} />
          <MetricRow label="wRC+" metric={team.last30Metrics.wrcPlus} decimals={0} />
          <MetricRow label="Run Diff / Game" metric={team.last30Metrics.runDifferential} decimals={2} />
          <MetricRow label="Schedule-Adj Performance" metric={team.last30Metrics.scheduleAdjPerformance} decimals={2} />
        </div>
      )}

      {tab === "schedule" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <SosPanel label="Current SOS" score={team.currentSos} rank={team.currentSosRank} games={team.gamesPlayed} />
          <SosPanel label="Next 30 Days SOS" score={team.next30Sos} rank={team.next30SosRank} games={team.next30GamesCount} />
          <SosPanel label="Rest of Season SOS" score={team.restOfSeasonSos} rank={team.restOfSeasonSosRank} games={team.restOfSeasonGamesCount} />
        </div>
      )}

      {tab === "nextMonth" && <NextMonthOpponents team={team} />}
    </div>
  );
}

function TeamRow({ team, open, onToggle }: { team: PowerRankingTeam; open: boolean; onToggle: () => void }) {
  const diff = (team.last30Rank ?? 0) - (team.seasonRank ?? 0);
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50" aria-expanded={open}>
        <td className="px-2 py-2">
          <span className={`inline-flex h-6 w-7 items-center justify-center rounded-md text-xs font-black tabular-nums ${rankBand(team.seasonRank)}`}>
            {team.seasonRank ?? "—"}
          </span>
        </td>
        <td className="px-2 py-2">
          <div className="flex items-center gap-2">
            <MlbTeamLogo team={team.team} size={28} />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900">{team.teamName}</p>
              <p className="text-[10px] text-slate-400">{team.record} · {team.division}</p>
            </div>
          </div>
        </td>
        <td className={`px-2 py-2 text-right font-mono text-sm font-bold tabular-nums ${scoreColor(team.seasonCompositeScore)}`}>
          {fmt1(team.seasonCompositeScore)}
        </td>
        <td className="px-2 py-2 text-right">
          <div className={`font-mono text-sm font-bold tabular-nums ${scoreColor(team.last30CompositeScore)}`}>{fmt1(team.last30CompositeScore)}</div>
          {diff !== 0 && Number.isFinite(diff) && (
            <div className={`text-[9px] font-bold ${diff < 0 ? "text-emerald-600" : "text-rose-500"}`}>{diff < 0 ? "▲" : "▼"} {Math.abs(diff)}</div>
          )}
        </td>
        <td className="hidden px-2 py-2 text-right font-mono text-sm tabular-nums text-slate-600 sm:table-cell">{fmt1(team.currentSos)}</td>
        <td className="hidden px-2 py-2 text-right font-mono text-sm tabular-nums text-slate-600 md:table-cell">{fmt1(team.next30Sos)}</td>
        <td className="hidden px-2 py-2 text-right font-mono text-sm tabular-nums text-slate-600 lg:table-cell">{fmt1(team.restOfSeasonSos)}</td>
        <td className="px-2 py-2 text-right">
          <ChevronDown className={`ml-auto h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={8} className="p-0"><ExpandedTeamRow team={team} /></td>
        </tr>
      )}
    </>
  );
}

function MethodologyPanel({ weights, generatedAt }: { weights: Record<string, number>; generatedAt: string }) {
  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
      <h2 className="mb-2 text-sm font-bold text-slate-900">Methodology</h2>
      <p className="mb-2">
        Each team gets a 0–100 composite score from seven weighted metrics, normalized across all 30 teams using
        5th–95th percentile winsorization. ERA and FIP are inverted (lower raw value → higher score) since lower
        pitching numbers are better. Season and Last 30 Days composites are calculated independently from their
        own period data — Last 30 is not just a recency multiplier on the season score.
      </p>
      <div className="mb-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        <span>ERA: {(weights.era * 100).toFixed(0)}%</span>
        <span>FIP: {(weights.fip * 100).toFixed(0)}%</span>
        <span>xBA: {(weights.xba * 100).toFixed(0)}%</span>
        <span>OPS: {(weights.ops * 100).toFixed(0)}%</span>
        <span>wRC+: {(weights.wrcPlus * 100).toFixed(0)}%</span>
        <span>Run Diff: {(weights.runDifferential * 100).toFixed(0)}%</span>
        <span>Sched-Adj: {(weights.scheduleAdjPerformance * 100).toFixed(0)}%</span>
      </div>
      <p className="mb-2">
        <b>Schedule-Adjusted Performance</b> compares a team's actual win% to an expected win% derived from the
        league-average composite gap, rewarding teams that outperform against quality competition rather than
        padding records against weak schedules.
      </p>
      <p className="mb-2">
        <b>Strength of Schedule</b> is the average season composite score of opponents faced (Current SOS), scheduled
        in the next 30 calendar days (Next 30 SOS), or remaining through the end of the regular season (Rest of
        Season SOS) — each weighted by number of games.
      </p>
      <p className="mb-2">
        <b>Last 30 Days</b> samples under 10 games are shrunk toward the season composite proportional to games
        played, preventing small-sample noise from distorting short-term rankings.
      </p>
      <p className="text-slate-400">Generated {new Date(generatedAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })} ET</p>
    </section>
  );
}

export default function MlbPowerRankings() {
  usePageSeo({
    title: "MLB Power Rankings | Joe Knows Ball",
    description: "Transparent MLB team power rankings using xERA, xFIP, xBA, OPS, wRC+, run differential, and schedule-adjusted performance.",
    path: "/mlb/power-rankings",
  });

  const { data, loading, error } = useMlbPowerRankings();
  const [query, setQuery] = useState("");
  const [league, setLeague] = useState<"all" | "AL" | "NL">("all");
  const [sortKey, setSortKey] = useState<SortKey>("seasonRank");
  const [openTeam, setOpenTeam] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!data) return [];
    let rows = data.teams;
    if (league !== "all") {
      rows = rows.filter((t) => (league === "AL" ? t.league.includes("American") : t.league.includes("National")));
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      rows = rows.filter((t) => t.teamName.toLowerCase().includes(q) || t.team.toLowerCase().includes(q));
    }
    return [...rows].sort((a, b) => sortValue(a, sortKey) - sortValue(b, sortKey));
  }, [data, league, query, sortKey]);

  return (
    <SiteShell>
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-4 sm:px-6">
        <MlbNavHero />

        <header>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">MLB Power Rankings</h1>
          <p className="mt-1 text-sm text-slate-500">
            Transparent composite scoring across pitching, offense, results, and schedule strength for all 30 teams.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search teams"
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-sm"
            />
          </div>
          <select value={league} onChange={(e) => setLeague(e.target.value as typeof league)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="all">All Leagues</option>
            <option value="AL">American League</option>
            <option value="NL">National League</option>
          </select>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {loading && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">Loading power rankings…</div>}
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}

        {data && (
          <>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    <th className="px-2 py-2">Rank</th>
                    <th className="px-2 py-2">Team</th>
                    <th className="px-2 py-2 text-right">Season</th>
                    <th className="px-2 py-2 text-right">Last 30</th>
                    <th className="hidden px-2 py-2 text-right sm:table-cell">Cur SOS</th>
                    <th className="hidden px-2 py-2 text-right md:table-cell">Next 30 SOS</th>
                    <th className="hidden px-2 py-2 text-right lg:table-cell">ROS SOS</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((team) => (
                    <TeamRow
                      key={team.team}
                      team={team}
                      open={openTeam === team.team}
                      onToggle={() => setOpenTeam((prev) => (prev === team.team ? null : team.team))}
                    />
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} className="p-8 text-center text-sm text-slate-400">No teams match the current filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <MethodologyPanel weights={data.weights} generatedAt={data.generatedAt} />
          </>
        )}
      </div>
    </SiteShell>
  );
}
