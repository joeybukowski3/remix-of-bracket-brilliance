import { useEffect, useMemo, useState } from "react";
import SiteShell from "@/components/layout/SiteShell";
import { usePageSeo } from "@/hooks/usePageSeo";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";

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
}

interface MostBetSide {
  rank: number;
  awayAbbr: string;
  homeAbbr: string;
  awayName: string;
  homeName: string;
  side: "away" | "home";
  impliedPercent: number;
  volume24hr: number;
  conviction: number;
  gameTime: string | null;
}

interface SnapshotData {
  date: string;
  updatedAt: string | null;
  fetchedCount: number;
  games: TrackedGame[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getEtDate(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

function formatTime(isoString: string | null): string {
  if (!isoString) return "TBD";
  const dt = new Date(isoString);
  return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York", hour12: true });
}

function formatDollars(val: number): string {
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

/** Compute the latest snapshot's price and volume for a game */
function getLatestSnapshot(game: TrackedGame): Snapshot | null {
  if (!game.snapshots || game.snapshots.length === 0) return null;
  return game.snapshots[game.snapshots.length - 1];
}

/** Compute public conviction score: how far from 50/50, weighted by volume */
function computeConvictionScore(game: TrackedGame): { away: number; home: number } {
  const latest = getLatestSnapshot(game);
  if (!latest) return { away: 0, home: 0 };

  const vol = latest.volume24hr || 1;
  const awayConviction = Math.abs(latest.awayPrice - 0.5) * 2 * vol;  // -100..+100 scale, then weight by volume
  const homeConviction = Math.abs(latest.homePrice - 0.5) * 2 * vol;

  return { away: awayConviction, home: homeConviction };
}

/** Get top 3 most bet sides (strongest public conviction x volume) */
function getTopMostBetSides(games: TrackedGame[]): MostBetSide[] {
  const allSides: MostBetSide[] = [];

  for (const game of games) {
    const latest = getLatestSnapshot(game);
    if (!latest) continue;

    const { away: awayConviction, home: homeConviction } = computeConvictionScore(game);

    // Away side
    allSides.push({
      rank: 0,
      awayAbbr: game.awayAbbr,
      homeAbbr: game.homeAbbr,
      awayName: game.awayName,
      homeName: game.homeName,
      side: "away",
      impliedPercent: Math.round(latest.awayPrice * 100),
      volume24hr: latest.volume24hr,
      conviction: awayConviction,
      gameTime: game.gameTime,
    });

    // Home side
    allSides.push({
      rank: 0,
      awayAbbr: game.awayAbbr,
      homeAbbr: game.homeAbbr,
      awayName: game.awayName,
      homeName: game.homeName,
      side: "home",
      impliedPercent: Math.round(latest.homePrice * 100),
      volume24hr: latest.volume24hr,
      conviction: homeConviction,
      gameTime: game.gameTime,
    });
  }

  // Sort by conviction score descending, take top 3
  return allSides
    .sort((a, b) => b.conviction - a.conviction)
    .slice(0, 3)
    .map((side, i) => ({ ...side, rank: i + 1 }));
}

// ─── Components ───────────────────────────────────────────────────────────────

function MostBetSideCard({ side }: { side: MostBetSide }) {
  const sideTeam = side.side === "away" ? side.awayAbbr : side.homeAbbr;
  const sideOpponent = side.side === "away" ? side.homeAbbr : side.awayAbbr;
  const isHeavilyFavored = side.impliedPercent >= 65;
  const isClose = side.impliedPercent >= 45 && side.impliedPercent <= 55;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      {/* Rank badge */}
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 font-bold text-white text-sm">
          {side.rank}
        </span>
        <span className={`text-[11px] font-extrabold uppercase tracking-wide ${
          isHeavilyFavored ? "text-green-600" : isClose ? "text-amber-600" : "text-blue-600"
        }`}>
          {isHeavilyFavored ? "Strong Public Lean" : isClose ? "Public Split" : "Public Lean"}
        </span>
      </div>

      {/* Teams */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <MlbTeamLogo abbreviation={side.awayAbbr} size={28} />
          <span className="text-xs font-semibold text-slate-600">{side.awayAbbr}</span>
        </div>
        <span className="text-xs text-slate-300">@</span>
        <div className="flex items-center gap-2">
          <MlbTeamLogo abbreviation={side.homeAbbr} size={28} />
          <span className="text-xs font-semibold text-slate-600">{side.homeAbbr}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="space-y-2 border-t border-slate-100 pt-4">
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-500">Public on {sideTeam}</span>
          <span className="font-bold text-sm text-slate-900">{side.impliedPercent}%</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-500">24h Volume</span>
          <span className="font-semibold text-sm text-slate-700">{formatDollars(side.volume24hr)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-500">Game Time</span>
          <span className="font-mono text-sm text-slate-700">{formatTime(side.gameTime)}</span>
        </div>
      </div>

      {/* Conviction bar */}
      <div className="mt-4 rounded-lg bg-slate-100 h-2 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-violet-500 to-violet-600"
          style={{ width: `${Math.min(100, (side.conviction / 100000) * 100)}%` }}
        />
      </div>
      <p className="mt-1 text-[10px] text-slate-400">Conviction (volume × lean)</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PublicBetting() {
  usePageSeo({ title: "Public Splits | JoeKnowsBall", description: "Top 3 most-bet MLB sides from Polymarket" });

  const [today, setToday] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(true);

  const todayDate = getEtDate();

  useEffect(() => {
    setLoading(true);
    const opts = { cache: "no-store" as RequestCache };
    fetch(`/data/polymarket/snapshots-${todayDate}.json`, opts)
      .then(r => r.ok ? r.json() : null)
      .catch(() => null)
      .then((t) => {
        setToday(t);
        setLoading(false);
      });
  }, [todayDate]);

  const topMostBetSides = useMemo(() => {
    if (!today?.games) return [];
    return getTopMostBetSides(today.games);
  }, [today]);

  const lastUpdated = today?.updatedAt
    ? new Date(today.updatedAt).toLocaleTimeString("en-US", {
        hour: "numeric", minute: "2-digit", timeZone: "America/New_York", hour12: true,
      })
    : null;

  return (
    <SiteShell>
      <div className="mx-auto max-w-2xl px-4 py-6">
        {/* Header */}
        <div className="mb-8">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Polymarket · MLB</p>
          <h1 className="text-3xl font-extrabold text-slate-950">Public Splits</h1>
          <p className="mt-2 text-sm text-slate-600">
            Top 3 most-bet sides based on Polymarket volume and implied probability. Updated hourly.
          </p>
          {lastUpdated && (
            <p className="mt-2 text-xs text-slate-400">Last snapshot: {lastUpdated} ET</p>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : topMostBetSides.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-12 text-center">
            <p className="text-sm text-slate-500">
              No games with Polymarket data yet. First snapshot runs at 7am ET.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-1 lg:grid-cols-3">
            {topMostBetSides.map(side => (
              <MostBetSideCard key={`${side.awayAbbr}-${side.homeAbbr}-${side.side}`} side={side} />
            ))}
          </div>
        )}

        {/* Footer note */}
        {topMostBetSides.length > 0 && (
          <div className="mt-8 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-600">
              <strong>How to read this:</strong> Conviction combines Polymarket volume with how far the implied probability moved from 50/50. A higher conviction score means more money is backing this side with stronger confidence.
            </p>
          </div>
        )}
      </div>
    </SiteShell>
  );
}
