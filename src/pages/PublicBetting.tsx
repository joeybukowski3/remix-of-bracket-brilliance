import { useEffect, useMemo, useState } from "react";
import SiteShell from "@/components/layout/SiteShell";
import { usePageSeo } from "@/hooks/usePageSeo";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Snapshot {
  time: string;
  awayPrice: number;
  homePrice: number;
  volume24hr: number;
  liquidity: number;
  source: string;
}

interface OpenPrice {
  away: number;
  home: number;
}

interface TrackedGame {
  gameId: string;
  eventId: string | null;
  awayAbbr: string;
  homeAbbr: string;
  awayName: string;
  homeName: string;
  gameTime: string | null;
  openPrice: OpenPrice;
  openTime: string;
  snapshots: Snapshot[];
  graded: boolean;
  result: GradeResult | null;
  movement?: Movement | null;
}

interface Movement {
  openHomePrice: number;
  openAwayPrice: number;
  closeHomePrice: number;
  closeAwayPrice: number;
  delta: number;
  movedToward: "home" | "away" | "none";
  qualifies5c: boolean;
  qualifies10c: boolean;
  lateMoveDelta: number | null;
  maxSingleHourMove: number;
  closeVolume24hr: number;
  closeLiquidity: number;
  snapshotCount: number;
}

interface GradeResult {
  winner: "home" | "away";
  resultSource: string;
  movementCorrect: boolean | null;
  result5c: boolean | null;
  result10c: boolean | null;
}

interface SnapshotData {
  date: string;
  updatedAt: string | null;
  fetchedCount: number;
  games: TrackedGame[];
}

interface HistoryGame {
  date: string;
  gameId: string;
  awayAbbr: string;
  homeAbbr: string;
  gameTime: string | null;
  movement: Movement;
  result: GradeResult;
}

interface HistoryData {
  updatedAt: string | null;
  games: HistoryGame[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getEtDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit",
      timeZone: "America/New_York", hour12: true,
    });
  } catch { return "—"; }
}

function fmtPrice(p: number | null | undefined) {
  if (p == null) return "—";
  return `${Math.round(p * 100)}¢`;
}

function fmtDelta(delta: number) {
  const cents = Math.round(delta * 100);
  return cents >= 0 ? `+${cents}¢` : `${cents}¢`;
}

/** Compute live movement from today's snapshot data */
function computeMovement(game: TrackedGame): Movement | null {
  const snaps = game.snapshots || [];
  if (snaps.length < 1) return null;
  const open = game.openPrice;
  if (!open?.home) return null;

  const gameStartMs = game.gameTime ? new Date(game.gameTime).getTime() : Infinity;
  const preGameSnaps = snaps.filter(s => new Date(s.time).getTime() < gameStartMs);
  const closeSnap = preGameSnaps.at(-1) || snaps.at(-1)!;

  const openHomePrice = open.home;
  const closeHomePrice = closeSnap.homePrice;
  const delta = Math.round((closeHomePrice - openHomePrice) * 1000) / 1000;
  const movedToward: "home" | "away" | "none" =
    Math.abs(delta) < 0.005 ? "none" : delta > 0 ? "home" : "away";
  const absDelta = Math.abs(delta);

  const twoHrBeforeMs = gameStartMs - 2 * 60 * 60 * 1000;
  const lateSnaps = preGameSnaps.filter(s => new Date(s.time).getTime() >= twoHrBeforeMs);
  const lateMoveDelta = lateSnaps.length >= 2
    ? Math.round((lateSnaps.at(-1)!.homePrice - lateSnaps[0].homePrice) * 1000) / 1000
    : null;

  let maxSingleHourMove = 0;
  for (let i = 1; i < snaps.length; i++) {
    const move = Math.abs(snaps[i].homePrice - snaps[i - 1].homePrice);
    if (move > maxSingleHourMove) maxSingleHourMove = move;
  }

  return {
    openHomePrice,
    openAwayPrice: open.away,
    closeHomePrice,
    closeAwayPrice: Math.round((1 - closeHomePrice) * 1000) / 1000,
    delta,
    movedToward,
    qualifies5c: absDelta >= 0.05,
    qualifies10c: absDelta >= 0.10,
    lateMoveDelta,
    maxSingleHourMove: Math.round(maxSingleHourMove * 1000) / 1000,
    closeVolume24hr: closeSnap.volume24hr || 0,
    closeLiquidity: closeSnap.liquidity || 0,
    snapshotCount: snaps.length,
  };
}

/** Compute win/loss record from history for a given threshold */
function computeRecord(games: HistoryGame[], threshold: "5c" | "10c") {
  const key = threshold === "5c" ? "result5c" : "result10c";
  const qualified = games.filter(g => g.result?.[key] != null);
  const wins = qualified.filter(g => g.result[key] === true).length;
  const losses = qualified.filter(g => g.result[key] === false).length;
  return { wins, losses, total: qualified.length };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RecordBadge({ wins, losses, total, label }: { wins: number; losses: number; total: number; label: string }) {
  const pct = total > 0 ? Math.round((wins / total) * 100) : null;
  const color = pct == null ? "text-slate-400"
    : pct >= 60 ? "text-emerald-700" : pct >= 50 ? "text-amber-700" : "text-rose-700";
  return (
    <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">{label}</span>
      <span className={cn("mt-1 text-2xl font-extrabold tabular-nums", color)}>
        {total === 0 ? "—" : `${wins}-${losses}`}
      </span>
      {pct != null && (
        <span className={cn("text-[11px] font-semibold", color)}>{pct}%</span>
      )}
      <span className="mt-0.5 text-[9px] text-slate-400">{total} games</span>
    </div>
  );
}

function MovementChip({ delta, movedToward, movedAbbr }: {
  delta: number; movedToward: "home" | "away" | "none"; movedAbbr: string;
}) {
  if (movedToward === "none" || Math.abs(delta) < 0.005) {
    return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-400">Flat</span>;
  }
  const absCents = Math.round(Math.abs(delta) * 100);
  const qualifies10 = absCents >= 10;
  const qualifies5 = absCents >= 5;
  const bgColor = qualifies10 ? "bg-violet-100 text-violet-800" : qualifies5 ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-500";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", bgColor)}>
      {movedAbbr} {fmtDelta(delta)}
    </span>
  );
}

function GameRow({ game }: { game: TrackedGame }) {
  const movement = game.movement ?? computeMovement(game);
  const latest = game.snapshots.at(-1);
  const movedAbbr = movement?.movedToward === "home" ? game.homeAbbr
    : movement?.movedToward === "away" ? game.awayAbbr : "";

  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      {/* Teams */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex items-center gap-1">
          <MlbTeamLogo team={game.awayAbbr} size={18} />
          <span className="text-[11px] font-bold text-slate-700">{game.awayAbbr}</span>
        </div>
        <span className="text-[9px] text-slate-300 font-bold">@</span>
        <div className="flex items-center gap-1">
          <MlbTeamLogo team={game.homeAbbr} size={18} />
          <span className="text-[11px] font-bold text-slate-700">{game.homeAbbr}</span>
        </div>
        <span className="text-[10px] text-slate-400">{fmtTime(game.gameTime)}</span>
      </div>

      {/* Current prices */}
      <div className="flex flex-col items-center text-center">
        <span className="text-[9px] text-slate-400">Now</span>
        <span className="text-[11px] font-bold tabular-nums text-slate-700">
          {fmtPrice(latest?.awayPrice)} / {fmtPrice(latest?.homePrice)}
        </span>
        <span className="text-[9px] text-slate-400">A / H</span>
      </div>

      {/* Movement */}
      <div className="flex flex-col items-end gap-0.5">
        {movement ? (
          <MovementChip delta={movement.delta} movedToward={movement.movedToward} movedAbbr={movedAbbr} />
        ) : (
          <span className="text-[10px] text-slate-300">—</span>
        )}
        {movement?.lateMoveDelta != null && Math.abs(movement.lateMoveDelta) >= 0.03 && (
          <span className="text-[9px] text-orange-600 font-semibold">
            Late {fmtDelta(movement.lateMoveDelta)}
          </span>
        )}
        {latest?.volume24hr != null && latest.volume24hr > 0 && (
          <span className="text-[9px] text-slate-300">
            ${Math.round(latest.volume24hr).toLocaleString()} vol
          </span>
        )}
      </div>
    </div>
  );
}

function HistoryRow({ game }: { game: HistoryGame }) {
  const { movement, result } = game;
  const movedAbbr = movement.movedToward === "home" ? game.homeAbbr
    : movement.movedToward === "away" ? game.awayAbbr : "";
  const winnerAbbr = result.winner === "home" ? game.homeAbbr : game.awayAbbr;
  const correct = result.movementCorrect;

  return (
    <div className="flex items-center gap-2 border-b border-slate-100 py-2 last:border-0">
      {/* Date + Teams */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <MlbTeamLogo team={game.awayAbbr} size={14} />
          <span className="text-[10px] font-bold text-slate-700">{game.awayAbbr}</span>
          <span className="text-[9px] text-slate-300">@</span>
          <MlbTeamLogo team={game.homeAbbr} size={14} />
          <span className="text-[10px] font-bold text-slate-700">{game.homeAbbr}</span>
        </div>
        <span className="text-[9px] text-slate-400">{game.date}</span>
      </div>

      {/* Movement */}
      <div className="flex flex-col items-center gap-0.5">
        <MovementChip delta={movement.delta} movedToward={movement.movedToward} movedAbbr={movedAbbr} />
        <span className="text-[9px] text-slate-400">
          {fmtPrice(movement.openHomePrice)} → {fmtPrice(movement.closeHomePrice)} H
        </span>
      </div>

      {/* Result */}
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-[10px] font-bold text-slate-700">W: {winnerAbbr}</span>
        <div className="flex items-center gap-1">
          {result.result5c != null && (
            <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-bold",
              result.result5c ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
            )}>5¢ {result.result5c ? "✓" : "✗"}</span>
          )}
          {result.result10c != null && (
            <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-bold",
              result.result10c ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
            )}>10¢ {result.result10c ? "✓" : "✗"}</span>
          )}
          {correct == null && movement.movedToward !== "none" && (
            <span className="text-[9px] text-slate-300">flat</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PublicBetting() {
  usePageSeo({ title: "Odds Tracker | JoeKnowsBall", description: "Polymarket MLB odds movement tracker" });

  const [today, setToday] = useState<SnapshotData | null>(null);
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyFilter, setHistoryFilter] = useState<"all" | "5c" | "10c">("all");

  const todayDate = getEtDate();

  useEffect(() => {
    setLoading(true);
    const opts = { cache: "no-store" as RequestCache };
    Promise.all([
      fetch(`/data/polymarket/snapshots-${todayDate}.json`, opts).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/data/polymarket/history.json", opts).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([t, h]) => {
      setToday(t);
      setHistory(h);
      setLoading(false);
    });
  }, [todayDate]);

  const record5c = useMemo(() => computeRecord(history?.games ?? [], "5c"), [history]);
  const record10c = useMemo(() => computeRecord(history?.games ?? [], "10c"), [history]);

  const todayGames = useMemo(() => {
    if (!today?.games) return [];
    return [...today.games].sort((a, b) => {
      const aTime = a.gameTime ? new Date(a.gameTime).getTime() : Infinity;
      const bTime = b.gameTime ? new Date(b.gameTime).getTime() : Infinity;
      return aTime - bTime;
    });
  }, [today]);

  const filteredHistory = useMemo(() => {
    const games = history?.games ?? [];
    if (historyFilter === "5c") return games.filter(g => g.movement.qualifies5c);
    if (historyFilter === "10c") return games.filter(g => g.movement.qualifies10c);
    return games;
  }, [history, historyFilter]);

  const lastUpdated = today?.updatedAt
    ? new Date(today.updatedAt).toLocaleTimeString("en-US", {
        hour: "numeric", minute: "2-digit", timeZone: "America/New_York", hour12: true,
      })
    : null;

  return (
    <SiteShell>
      <div className="mx-auto max-w-xl px-4 py-6">
        {/* Header */}
        <div className="mb-5">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Polymarket · MLB</p>
          <h1 className="text-2xl font-extrabold text-slate-950">Odds Tracker</h1>
          <p className="mt-1 text-[12px] text-slate-500">
            Hourly Polymarket price snapshots. Tracks movement from opening price and grades results the following morning.
          </p>
          {lastUpdated && (
            <p className="mt-1 text-[10px] text-slate-400">Last snapshot: {lastUpdated} ET</p>
          )}
        </div>

        {/* Record cards */}
        <div className="mb-5 grid grid-cols-2 gap-3">
          <RecordBadge wins={record5c.wins} losses={record5c.losses} total={record5c.total} label="≥5¢ Move" />
          <RecordBadge wins={record10c.wins} losses={record10c.losses} total={record10c.total} label="≥10¢ Move" />
        </div>

        {/* Legend */}
        <div className="mb-4 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
          <span className="rounded-full bg-violet-100 px-2 py-0.5 font-bold text-violet-800">TM +12¢</span>
          <span>≥10¢ move</span>
          <span className="rounded-full bg-sky-100 px-2 py-0.5 font-bold text-sky-800">TM +6¢</span>
          <span>≥5¢ move</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-400">Flat</span>
          <span>&lt;5¢</span>
        </div>

        {/* Today's games */}
        <div className="mb-6">
          <h2 className="mb-2 text-[13px] font-extrabold uppercase tracking-wide text-slate-700">
            Today · {todayDate}
          </h2>
          {loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : todayGames.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-[12px] text-slate-400">
              No games found yet for today. First snapshot runs at 7am ET.
            </div>
          ) : (
            <div className="space-y-2">
              {todayGames.map(game => (
                <GameRow key={game.gameId} game={game} />
              ))}
            </div>
          )}
        </div>

        {/* Historical results */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[13px] font-extrabold uppercase tracking-wide text-slate-700">
              Historical Results
            </h2>
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-[10px] font-semibold">
              {(["all", "5c", "10c"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setHistoryFilter(f)}
                  className={cn("rounded-md px-2.5 py-1 transition",
                    historyFilter === f ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  {f === "all" ? "All" : `≥${f}`}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
          ) : filteredHistory.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-[12px] text-slate-400">
              {history?.games?.length === 0
                ? "Historical results will appear here after the first graded day."
                : "No games match this filter."}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-1">
              {[...filteredHistory].reverse().map((game, i) => (
                <HistoryRow key={`${game.date}-${game.gameId}-${i}`} game={game} />
              ))}
            </div>
          )}
        </div>
      </div>
    </SiteShell>
  );
}
