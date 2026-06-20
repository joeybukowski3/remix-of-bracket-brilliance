import { ExternalLink } from "lucide-react";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import { usePolymarketMlbMoneylines } from "@/hooks/usePolymarketMlbMoneylines";
import { formatCents } from "@/lib/mlb/polymarketMoneylines";
import type { MoneylineGame } from "@/lib/mlb/polymarketMoneylines";

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

function formatGameTime(gameDate: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
      hour12: true,
    })
      .format(new Date(gameDate))
      .replace(" ", " ")
      + " ET";
  } catch {
    return "";
  }
}

function formatUpdatedAgo(updatedAt: string): string {
  const diff = Date.now() - new Date(updatedAt).getTime();
  const mins = Math.max(0, Math.floor(diff / 60_000));
  if (mins < 1) return "Just updated";
  if (mins === 1) return "Updated 1 min ago";
  return `Updated ${mins} min ago`;
}

function statusLabel(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("final")) return "Final";
  if (s.includes("progress") || s.includes("live")) return "Live";
  if (s.includes("postpone")) return "PPD";
  if (s.includes("suspend")) return "Susp";
  return "Sched";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PriceChip({
  label,
  price,
  tone,
  ariaTeam,
}: {
  label: string;
  price: number | null;
  tone: "yes" | "no";
  ariaTeam: string;
}) {
  const display = formatCents(price);
  const bg =
    tone === "yes"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-slate-50 text-slate-600 border-slate-200";
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${bg}`}
      aria-label={`${ariaTeam} ${label} price: ${display}`}
    >
      <span className="text-[9px] font-semibold opacity-70">{label}</span>
      {display}
    </span>
  );
}

function GameCard({ game, onOpenGame }: { game: MoneylineGame; onOpenGame?: (gamePk: number) => void }) {
  const time = formatGameTime(game.gameDate);
  const status = statusLabel(game.status);

  const handleClick = () => {
    if (onOpenGame) {
      onOpenGame(game.gamePk);
    } else {
      // Fallback: navigate via hash if no callback
      window.location.hash = `#game-${game.gamePk}`;
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition hover:border-sky-300 hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
    >
      {/* Header row: time + status + external link */}
      <div className="mb-1.5 flex items-center justify-between text-[10px] text-slate-400">
        <span>
          {time}{time && " · "}{status}
        </span>
        {game.marketUrl && (
          <a
            href={game.marketUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-0.5 text-sky-500 transition hover:text-sky-700"
            aria-label={`View ${game.away.abbreviation} vs ${game.home.abbreviation} on Polymarket`}
          >
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>

      {/* Matchup label */}
      <div className="mb-1.5 text-[10px] font-bold tracking-wide text-slate-500">
        {game.away.abbreviation} @ {game.home.abbreviation}
      </div>

      {game.matched ? (
        <div className="space-y-1">
          <TeamRow team={game.away} />
          <TeamRow team={game.home} />
        </div>
      ) : (
        <div className="rounded-md bg-slate-50 px-2 py-1.5 text-[10px] text-slate-400">
          No Polymarket moneyline found
        </div>
      )}
    </button>
  );
}

function TeamRow({
  team,
}: {
  team: MoneylineGame["away"] | MoneylineGame["home"];
}) {
  return (
    <div className="flex items-center gap-1.5">
      <MlbTeamLogo team={team.abbreviation} size={18} />
      <span className="w-8 text-[11px] font-extrabold text-slate-800">
        {team.abbreviation}
      </span>
      <div className="flex flex-1 items-center justify-end gap-1">
        <PriceChip label="YES" price={team.yesPrice} tone="yes" ariaTeam={team.name || team.abbreviation} />
        <PriceChip label="NO" price={team.noPrice} tone="no" ariaTeam={team.name || team.abbreviation} />
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-[72px] animate-pulse rounded-xl border border-slate-100 bg-slate-50"
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export default function MlbPolymarketMoneylinePanel({ onOpenGame }: { onOpenGame?: (gamePk: number) => void } = {}) {
  const { data, isLoading, isError } = usePolymarketMlbMoneylines();

  return (
    <div className="polymarket-panel">
      {/* Header */}
      <div className="mb-3 rounded-xl bg-[#031635] px-4 py-3">
        <div className="text-[11px] font-extrabold tracking-wide text-white">
          Polymarket Moneylines
        </div>
        <div className="mt-0.5 text-[10px] text-sky-300/80">
          Live YES / NO prices for today's games
        </div>
        {data && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[9px] text-slate-400">
            <span>{formatUpdatedAgo(data.updatedAt)}</span>
            <span>
              {data.matchedCount} of {data.totalGames} games matched
            </span>
            {data.stale && (
              <span className="rounded bg-amber-500/20 px-1 py-0.5 text-amber-300">
                Stale
              </span>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-[11px] text-red-700">
          Unable to load Polymarket data. The MLB page is unaffected.
        </div>
      ) : data && data.games.length > 0 ? (
        <div className="space-y-2">
          {data.games.map((game) => (
            <GameCard key={game.gamePk} game={game} onOpenGame={onOpenGame} />
          ))}
        </div>
      ) : data && data.totalGames === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-[11px] text-slate-400">
          No MLB games scheduled today.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-[11px] text-slate-400">
          No active Polymarket moneyline markets found.
        </div>
      )}

      {/* Footer */}
      <div className="mt-2 text-center text-[8px] text-slate-400">
        Prices reflect Polymarket prediction market bids · Not sportsbook odds
      </div>
    </div>
  );
}
