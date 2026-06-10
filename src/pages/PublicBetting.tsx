import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import { usePageSeo } from "@/hooks/usePageSeo";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BettingSide {
  id: string;
  sport: string;
  sportKey: string;
  gameId: string;
  awayTeam: string;
  homeTeam: string;
  awayAbbr: string;
  homeAbbr: string;
  betType: "ML" | "Spread";
  side: "away" | "home";
  teamName: string;
  teamAbbr: string;
  publicBetPct: number | null;
  publicMoneyPct: number | null;
  line: string | null;
  gameTime: string | null;
  status: string;
  highPublic: boolean;
  result: "win" | "loss" | "push" | null;
  pnl: number | null;
  gameKey: string;
  date: string;
}

interface TodayData {
  fetchedAt: string | null;
  date: string | null;
  sides: BettingSide[];
}

interface HistoryData {
  updatedAt: string | null;
  sides: BettingSide[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", timeZone: "America/New_York", hour12: true,
    });
  } catch { return "—"; }
}

function pctColor(pct: number | null): string {
  if (pct == null) return "text-slate-400";
  if (pct >= 80) return "text-rose-500 font-bold";
  if (pct >= 75) return "text-orange-500 font-bold";
  if (pct >= 65) return "text-amber-500";
  return "text-slate-600";
}

function ResultBadge({ result }: { result: BettingSide["result"] }) {
  if (!result) return <span className="text-slate-400 text-xs">Pending</span>;
  const map = {
    win:  "bg-emerald-100 text-emerald-700 border border-emerald-200",
    loss: "bg-rose-100 text-rose-700 border border-rose-100",
    push: "bg-slate-100 text-slate-600 border border-slate-200",
  };
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold uppercase ${map[result]}`}>
      {result}
    </span>
  );
}

function SportBadge({ sport }: { sport: string }) {
  const map: Record<string, string> = {
    MLB:        "bg-blue-50 text-blue-700 border border-blue-100",
    NBA:        "bg-purple-50 text-purple-700 border border-purple-100",
    NFL:        "bg-green-50 text-green-700 border border-green-100",
    "World Cup":"bg-amber-50 text-amber-700 border border-amber-100",
  };
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${map[sport] ?? "bg-slate-100 text-slate-600"}`}>
      {sport}
    </span>
  );
}

function PnlBadge({ pnl }: { pnl: number | null }) {
  if (pnl == null) return <span className="text-slate-400 text-xs">—</span>;
  const positive = pnl >= 0;
  return (
    <span className={`text-xs font-bold ${positive ? "text-emerald-600" : "text-rose-600"}`}>
      {positive ? "+" : ""}{pnl.toFixed(2)}u
    </span>
  );
}

function MatchupCell({ side }: { side: BettingSide }) {
  const matchup = `${side.awayAbbr} @ ${side.homeAbbr}`;
  if (side.sportKey === "mlb") {
    return (
      <Link
        to={`/mlb#game-${side.gameKey}`}
        className="font-semibold text-sky-700 hover:underline text-sm"
      >
        {matchup}
      </Link>
    );
  }
  return <span className="font-semibold text-slate-800 text-sm">{matchup}</span>;
}

// ─── Summary Stats ────────────────────────────────────────────────────────────

function SummaryStats({ sides, label }: { sides: BettingSide[]; label: string }) {
  const resolved = sides.filter(s => s.result && s.result !== "push");
  const wins   = resolved.filter(s => s.result === "win").length;
  const losses = resolved.filter(s => s.result === "loss").length;
  const pushes = sides.filter(s => s.result === "push").length;
  const totalPnl = sides.reduce((acc, s) => acc + (s.pnl ?? 0), 0);
  const pctStr = resolved.length > 0 ? `${Math.round((wins / resolved.length) * 100)}%` : "—";

  return (
    <div className="flex flex-wrap gap-4 text-sm">
      <div>
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">{label}</div>
        <div className="font-bold text-slate-900">
          {wins}-{losses}{pushes > 0 ? `-${pushes}` : ""}
          <span className="ml-2 font-normal text-slate-500">{pctStr}</span>
        </div>
      </div>
      <div>
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">P/L</div>
        <div className={`font-bold ${totalPnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
          {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)} units
        </div>
      </div>
    </div>
  );
}

// ─── Today's Table ────────────────────────────────────────────────────────────

function TodayTable({ sides }: { sides: BettingSide[] }) {
  if (sides.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-10 text-center text-slate-500 text-sm">
        No data available yet for today. Check back after the morning data refresh.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <th className="px-4 py-3 text-left font-semibold border-b border-slate-200">Sport</th>
            <th className="px-4 py-3 text-left font-semibold border-b border-slate-200">Matchup</th>
            <th className="px-4 py-3 text-left font-semibold border-b border-slate-200">Backed Side</th>
            <th className="px-4 py-3 text-left font-semibold border-b border-slate-200">Type</th>
            <th className="px-4 py-3 text-center font-semibold border-b border-slate-200">Bet%</th>
            <th className="px-4 py-3 text-center font-semibold border-b border-slate-200">Money%</th>
            <th className="px-4 py-3 text-center font-semibold border-b border-slate-200">Line</th>
            <th className="px-4 py-3 text-center font-semibold border-b border-slate-200">Time (ET)</th>
            <th className="px-4 py-3 text-center font-semibold border-b border-slate-200">Result</th>
            <th className="px-4 py-3 text-center font-semibold border-b border-slate-200">P/L</th>
          </tr>
        </thead>
        <tbody>
          {sides.map((side, i) => {
            const rowBg = side.highPublic
              ? i % 2 === 0 ? "bg-amber-50/60" : "bg-amber-50/40"
              : i % 2 === 0 ? "bg-white" : "bg-slate-50/50";
            return (
              <tr key={side.id} className={`${rowBg} hover:bg-slate-50 transition-colors`}>
                <td className="px-4 py-3 border-b border-slate-100">
                  <SportBadge sport={side.sport} />
                </td>
                <td className="px-4 py-3 border-b border-slate-100 whitespace-nowrap">
                  <MatchupCell side={side} />
                </td>
                <td className="px-4 py-3 border-b border-slate-100 whitespace-nowrap">
                  <span className="font-semibold text-slate-900">{side.teamAbbr}</span>
                  {side.highPublic && (
                    <span className="ml-1.5 inline-block rounded bg-orange-100 px-1 py-0.5 text-[9px] font-bold text-orange-600 uppercase">Hot</span>
                  )}
                </td>
                <td className="px-4 py-3 border-b border-slate-100">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                    {side.betType}
                  </span>
                </td>
                <td className={`px-4 py-3 border-b border-slate-100 text-center ${pctColor(side.publicBetPct)}`}>
                  {side.publicBetPct != null ? `${side.publicBetPct}%` : "—"}
                </td>
                <td className={`px-4 py-3 border-b border-slate-100 text-center ${pctColor(side.publicMoneyPct)}`}>
                  {side.publicMoneyPct != null ? `${side.publicMoneyPct}%` : "—"}
                </td>
                <td className="px-4 py-3 border-b border-slate-100 text-center text-slate-600 font-mono text-xs">
                  {side.line ?? "—"}
                </td>
                <td className="px-4 py-3 border-b border-slate-100 text-center text-slate-500 text-xs whitespace-nowrap">
                  {formatTime(side.gameTime)}
                </td>
                <td className="px-4 py-3 border-b border-slate-100 text-center">
                  <ResultBadge result={side.result} />
                </td>
                <td className="px-4 py-3 border-b border-slate-100 text-center">
                  <PnlBadge pnl={side.pnl} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── History Table ────────────────────────────────────────────────────────────

function HistoryTable({ sides }: { sides: BettingSide[] }) {
  const [sportFilter, setSportFilter] = useState("All");
  const [betFilter, setBetFilter] = useState("All");
  const [pctFilter, setPctFilter] = useState("75+");

  const sports = useMemo(() => ["All", ...Array.from(new Set(sides.map(s => s.sport))).sort()], [sides]);

  const filtered = useMemo(() => {
    return sides.filter(s => {
      if (sportFilter !== "All" && s.sport !== sportFilter) return false;
      if (betFilter !== "All" && s.betType !== betFilter) return false;
      if (pctFilter === "75+" && (s.publicBetPct ?? 0) < 75) return false;
      if (pctFilter === "80+" && (s.publicBetPct ?? 0) < 80) return false;
      if (pctFilter === "85+" && (s.publicBetPct ?? 0) < 85) return false;
      return s.result != null; // only resolved
    });
  }, [sides, sportFilter, betFilter, pctFilter]);

  const last7 = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    return filtered.filter(s => new Date(s.date) >= cutoff);
  }, [filtered]);

  if (sides.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-10 text-center text-slate-500 text-sm">
        Historical results will appear here as games are resolved.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 font-medium">Sport</label>
          <select
            value={sportFilter}
            onChange={e => setSportFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 outline-none focus:border-sky-300"
          >
            {sports.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 font-medium">Bet type</label>
          <select
            value={betFilter}
            onChange={e => setBetFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 outline-none focus:border-sky-300"
          >
            {["All", "ML", "Spread"].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 font-medium">Min public%</label>
          <select
            value={pctFilter}
            onChange={e => setPctFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 outline-none focus:border-sky-300"
          >
            {["All", "75+", "80+", "85+"].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Summary row */}
      <div className="flex flex-wrap gap-8 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
        <SummaryStats sides={filtered} label="Overall" />
        <div className="w-px bg-slate-200 self-stretch" />
        <SummaryStats sides={last7} label="Last 7 days" />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-8 text-center text-slate-500 text-sm">
          No resolved results match the current filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 text-left font-semibold border-b border-slate-200">Date</th>
                <th className="px-4 py-3 text-left font-semibold border-b border-slate-200">Sport</th>
                <th className="px-4 py-3 text-left font-semibold border-b border-slate-200">Matchup</th>
                <th className="px-4 py-3 text-left font-semibold border-b border-slate-200">Backed Side</th>
                <th className="px-4 py-3 text-left font-semibold border-b border-slate-200">Type</th>
                <th className="px-4 py-3 text-center font-semibold border-b border-slate-200">Bet%</th>
                <th className="px-4 py-3 text-center font-semibold border-b border-slate-200">Money%</th>
                <th className="px-4 py-3 text-center font-semibold border-b border-slate-200">Line</th>
                <th className="px-4 py-3 text-center font-semibold border-b border-slate-200">Result</th>
                <th className="px-4 py-3 text-center font-semibold border-b border-slate-200">P/L</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((side, i) => {
                const rowBg = i % 2 === 0 ? "bg-white" : "bg-slate-50/50";
                return (
                  <tr key={side.id} className={`${rowBg} hover:bg-slate-50 transition-colors`}>
                    <td className="px-4 py-2.5 border-b border-slate-100 text-xs text-slate-500 whitespace-nowrap">
                      {side.date}
                    </td>
                    <td className="px-4 py-2.5 border-b border-slate-100">
                      <SportBadge sport={side.sport} />
                    </td>
                    <td className="px-4 py-2.5 border-b border-slate-100 whitespace-nowrap">
                      <MatchupCell side={side} />
                    </td>
                    <td className="px-4 py-2.5 border-b border-slate-100 font-semibold text-slate-800 whitespace-nowrap">
                      {side.teamAbbr}
                    </td>
                    <td className="px-4 py-2.5 border-b border-slate-100">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                        {side.betType}
                      </span>
                    </td>
                    <td className={`px-4 py-2.5 border-b border-slate-100 text-center ${pctColor(side.publicBetPct)}`}>
                      {side.publicBetPct != null ? `${side.publicBetPct}%` : "—"}
                    </td>
                    <td className={`px-4 py-2.5 border-b border-slate-100 text-center ${pctColor(side.publicMoneyPct)}`}>
                      {side.publicMoneyPct != null ? `${side.publicMoneyPct}%` : "—"}
                    </td>
                    <td className="px-4 py-2.5 border-b border-slate-100 text-center text-slate-600 font-mono text-xs">
                      {side.line ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 border-b border-slate-100 text-center">
                      <ResultBadge result={side.result} />
                    </td>
                    <td className="px-4 py-2.5 border-b border-slate-100 text-center">
                      <PnlBadge pnl={side.pnl} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PublicBetting() {
  usePageSeo({
    title: "Public Betting Tracker — High-Backed Sides & Results",
    description: "Track today's most publicly backed sides (75%+) across MLB, NBA, NFL, and World Cup. See live results and historical P/L performance.",
    path: "/public-betting",
  });

  const [today, setToday] = useState<TodayData>({ fetchedAt: null, date: null, sides: [] });
  const [history, setHistory] = useState<HistoryData>({ updatedAt: null, sides: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const opts: RequestInit = { cache: "no-store" };
    Promise.all([
      fetch("/data/betting-splits/today.json", opts).then(r => r.ok ? r.json() : null),
      fetch("/data/betting-splits/history.json", opts).then(r => r.ok ? r.json() : null),
    ]).then(([t, h]) => {
      if (t) setToday(t);
      if (h) setHistory(h);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const highPublicToday = useMemo(
    () => today.sides.filter(s => s.highPublic),
    [today.sides]
  );

  return (
    <SiteShell>
      {/* Hero */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-1">
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
              Betting Tracker
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Public Betting Splits
            </h1>
            <p className="mt-2 max-w-[60ch] text-[15px] leading-7 text-slate-500">
              Tracking sides with ≥75% public backing across MLB, NBA, NFL, and World Cup.
              Data sourced from public betting consensus, updated with each morning refresh.
            </p>
          </div>
          {today.fetchedAt && (
            <p className="mt-3 text-xs text-slate-400">
              Last updated {new Date(today.fetchedAt).toLocaleString("en-US", { timeZone: "America/New_York" })} ET
            </p>
          )}
        </div>
      </section>

      {/* Today */}
      <section className="bg-white">
        <div className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-5 flex items-baseline justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Today's Slate</h2>
              <p className="mt-1 text-sm text-slate-500">
                All sides for {today.date ?? "today"}
                {highPublicToday.length > 0 && (
                  <> — <span className="font-semibold text-orange-600">{highPublicToday.length} at ≥75%</span></>
                )}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-10 text-center text-slate-400 text-sm animate-pulse">
              Loading today's splits…
            </div>
          ) : (
            <TodayTable sides={today.sides} />
          )}
        </div>
      </section>

      {/* History */}
      <section className="border-t border-slate-100 bg-slate-50/50">
        <div className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-5">
            <h2 className="text-xl font-bold text-slate-900">Historical Results</h2>
            <p className="mt-1 text-sm text-slate-500">
              All resolved sides from prior days with W/L results and P/L tracking.
              {history.updatedAt && (
                <span className="ml-2 text-xs text-slate-400">
                  Updated {new Date(history.updatedAt).toLocaleString("en-US", { timeZone: "America/New_York" })} ET
                </span>
              )}
            </p>
          </div>

          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center text-slate-400 text-sm animate-pulse">
              Loading history…
            </div>
          ) : (
            <HistoryTable sides={history.sides} />
          )}
        </div>
      </section>
    </SiteShell>
  );
}
