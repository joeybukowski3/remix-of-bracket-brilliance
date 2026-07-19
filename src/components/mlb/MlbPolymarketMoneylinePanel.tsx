import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { ExternalLink, MapPin } from "lucide-react";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import { usePolymarketMlbMoneylines } from "@/hooks/usePolymarketMlbMoneylines";
import { usePitcherRegression } from "@/hooks/usePitcherRegression";
import { formatCents } from "@/lib/mlb/polymarketMoneylines";
import { getEdgeTierLabel } from "@/lib/mlb/mlbModelEdge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import type { MoneylineGame } from "@/lib/mlb/polymarketMoneylines";
import type { PitcherRegressionData } from "@/lib/mlb/mlbPitcherRegression";

// ---------------------------------------------------------------------------
// Shared layout constants
// ---------------------------------------------------------------------------
// Fixed-column grid for every team row: logo | team | pitcher (flex) | YES | NO
// Only the pitcher-information column is allowed to flex/truncate.
const TEAM_ROW_GRID = "grid-cols-[20px_34px_minmax(0,1fr)_50px_50px]";

// ML edge data keyed by gamePk, computed in the parent from detailPreviews.
// PER MODEL AUDIT (Phase 1 correctness fix): this no longer carries a
// "value edge" percentage derived from treating `confidence` as a win
// probability. `marketAligned` reports whether the model's pick matches
// the side Polymarket currently favors; `marketPrice` is the raw
// Polymarket YES price for the model's pick (real market data).
export type PanelMlEdge = {
  pickAbbr: string;          // model lean, e.g. "NYY"
  confidence: number;        // 50–82 edge strength index, NOT a probability
  differential: number;      // raw factor differential the model computed
  marketAligned: boolean | null;  // null = no market price to compare against
  marketPrice: number | null;     // Polymarket YES price (0–1) for pickAbbr
};

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

function statusLabel(status: string): string | null {
  const s = status.toLowerCase();
  if (s.includes("final")) return "Final";
  if (s.includes("progress") || s.includes("live")) return "Live";
  if (s.includes("postpone")) return "PPD";
  if (s.includes("suspend")) return "Susp";
  return null; // Scheduled — venue is shown instead
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
  label: "YES" | "NO";
  price: number | null;
  tone: "higher" | "lower" | "neutral";
  ariaTeam: string;
}) {
  const display = formatCents(price);
  const bg =
    tone === "higher"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "lower"
      ? "bg-red-50 text-red-700 border-red-200"
      : "bg-slate-50 text-slate-600 border-slate-200";
  const word = label === "YES" ? "YES" : "NO";
  return (
    <span
      className={`inline-flex h-6 w-[50px] shrink-0 items-center justify-center gap-0.5 rounded-md border text-[10px] font-bold tabular-nums leading-none whitespace-nowrap ${bg}`}
      aria-label={`${ariaTeam} ${word} price: ${display}`}
    >
      <span className="text-[8px] font-semibold opacity-70">{label}</span>
      {display}
    </span>
  );
}

function GameCard({
  game,
  mlEdge,
  onOpenGame,
  getPitcherXera,
}: {
  game: MoneylineGame;
  mlEdge: PanelMlEdge | null;
  onOpenGame?: (gamePk: number) => void;
  getPitcherXera: (name: string | null) => number | null;
}) {
  const time = formatGameTime(game.gameDate);
  const status = statusLabel(game.status);
  const hasVenue = Boolean(game.venue && game.venue !== "Unknown");

  // Edge badge styling — shows the model's own tier label plus market
  // agreement (aligned / contrarian), never a derived probability edge.
  const edgeBadge = mlEdge ? (() => {
    const tierLabel = getEdgeTierLabel(mlEdge.confidence);
    if (mlEdge.marketAligned == null) {
      return { bg: "bg-slate-100 text-slate-600", label: `${mlEdge.pickAbbr} ${tierLabel}` };
    }
    return mlEdge.marketAligned
      ? { bg: "bg-emerald-100 text-emerald-800", label: `${mlEdge.pickAbbr} ${tierLabel} · Aligned` }
      : { bg: "bg-amber-100 text-amber-800", label: `${mlEdge.pickAbbr} ${tierLabel} · Contrarian` };
  })() : null;

  const handleClick = () => {
    if (onOpenGame) {
      onOpenGame(game.gamePk);
    } else {
      window.location.hash = `#game-${game.gamePk}`;
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="box-border block w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition hover:border-sky-300 hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
    >
      {/* Top metadata row */}
      <div className="flex h-4 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 text-[10px] text-slate-400">
          <span className="shrink-0 whitespace-nowrap">{time}{status && ` · ${status}`}</span>
          {hasVenue && (
            <span className="flex min-w-0 items-center gap-0.5 overflow-hidden">
              <span className="shrink-0">·</span>
              <MapPin className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate" title={game.venue}>{game.venue}</span>
            </span>
          )}
        </span>
        {game.marketUrl ? (
          <a
            href={game.marketUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex h-4 w-4 shrink-0 items-center justify-center text-sky-500 transition hover:text-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500"
            aria-label={`View ${game.away.name || game.away.abbreviation} vs ${game.home.name || game.home.abbreviation} on Polymarket`}
          >
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        ) : (
          <span className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
      </div>

      {/* Matchup + edge badge row */}
      <div className="mt-1.5 mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold tracking-wide text-slate-500">
          {game.away.abbreviation} @ {game.home.abbreviation}
        </span>
        {edgeBadge && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold leading-none ${edgeBadge.bg}`}>
            {edgeBadge.label}
          </span>
        )}
      </div>

      {/* Team rows */}
      {game.matched ? (
        <div className="space-y-1.5">
          <TeamRow
            team={game.away}
            pitcherXera={getPitcherXera(game.away.probablePitcher)}
            isModelPick={mlEdge?.pickAbbr === game.away.abbreviation}
          />
          <TeamRow
            team={game.home}
            pitcherXera={getPitcherXera(game.home.probablePitcher)}
            isModelPick={mlEdge?.pickAbbr === game.home.abbreviation}
          />
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
  pitcherXera,
  isModelPick = false,
}: {
  team: MoneylineGame["away"] | MoneylineGame["home"];
  pitcherXera: number | null;
  isModelPick?: boolean;
}) {
  // Within this team's own YES/NO pair, the lower price is red, the higher is green
  const yesTone: "higher" | "lower" | "neutral" =
    team.yesPrice == null || team.noPrice == null || team.yesPrice === team.noPrice
      ? "neutral"
      : team.yesPrice > team.noPrice
      ? "higher"
      : "lower";
  const noTone: "higher" | "lower" | "neutral" =
    team.yesPrice == null || team.noPrice == null || team.yesPrice === team.noPrice
      ? "neutral"
      : team.noPrice > team.yesPrice
      ? "higher"
      : "lower";

  const teamLabel = team.name || team.abbreviation;
  const pitcherTitle = team.probablePitcher
    ? pitcherXera != null
      ? `${team.probablePitcher} — ${pitcherXera.toFixed(2)} xERA`
      : team.probablePitcher
    : undefined;

  return (
    <div className={`grid min-h-[22px] ${TEAM_ROW_GRID} items-center gap-1.5 py-0.5`}>
      <div className="flex h-5 w-5 shrink-0 items-center justify-center">
        <MlbTeamLogo team={team.abbreviation} size={18} />
      </div>

      <span className={`shrink-0 text-left text-[11px] font-extrabold ${isModelPick ? "text-slate-950" : "text-slate-400"}`}>
        {team.abbreviation}
      </span>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_58px] items-center gap-1">
        {team.probablePitcher ? (
          <span
            className="block truncate whitespace-nowrap text-[9.5px] font-medium leading-tight text-slate-400"
            title={pitcherTitle}
          >
            {team.probablePitcher}
          </span>
        ) : (
          <span className="block truncate text-[9px] text-slate-300">—</span>
        )}
        {pitcherXera != null ? (
          <span
            className="inline-flex h-5 w-[58px] items-center justify-center whitespace-nowrap rounded bg-slate-100 px-1 text-[9px] font-semibold tabular-nums text-slate-600"
            title={`${pitcherXera.toFixed(2)} expected ERA`}
          >
            {pitcherXera.toFixed(2)} xERA
          </span>
        ) : (
          <span aria-hidden="true" className="invisible h-5 w-[58px]">—</span>
        )}
      </div>

      <PriceChip label="YES" price={team.yesPrice} tone={yesTone} ariaTeam={teamLabel} />
      <PriceChip label="NO" price={team.noPrice} tone={noTone} ariaTeam={teamLabel} />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-[88px] w-full animate-pulse rounded-xl border border-slate-100 bg-slate-50"
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export default function MlbPolymarketMoneylinePanel({
  onOpenGame,
  mlEdges = {},
}: {
  onOpenGame?: (gamePk: number) => void;
  mlEdges?: Record<number, PanelMlEdge>;
} = {}) {
  const { data, isLoading, isError } = usePolymarketMlbMoneylines();
  const { data: pitcherRegressionData } = usePitcherRegression();
  const location = useLocation();
  const panelRef = useRef<HTMLDivElement>(null);
  const [mobileOpen, setMobileOpen] = useState<string>("");

  // #moneylines deep-links (e.g. from the sidebar "Game Matchups" flow)
  // must reveal this panel even when its mobile accordion starts closed.
  useEffect(() => {
    if (location.hash === "#moneylines") {
      setMobileOpen("polymarket");
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [location.hash]);

  const getPitcherXera = (name: string | null): number | null => {
    if (!name) return null;
    const match = pitcherRegressionData.find((p: PitcherRegressionData) => p.name === name);
    return match?.xera ?? null;
  };

  // Sort games by the model's own differential descending — strongest
  // convictions first, unmatched last. PER MODEL AUDIT: previously sorted
  // by a fabricated "value edge" derived from treating confidence as a
  // probability; differential is the model's own (unmodified) output.
  const sortedGames = data?.games ? [...data.games].sort((a, b) => {
    const diffA = mlEdges[a.gamePk]?.differential ?? null;
    const diffB = mlEdges[b.gamePk]?.differential ?? null;
    // Games with no edge data go to the bottom
    if (diffA == null && diffB == null) return 0;
    if (diffA == null) return 1;
    if (diffB == null) return -1;
    return diffB - diffA;
  }) : [];

  const hasEdges = Object.keys(mlEdges).length > 0;

  const headerNode = (
    <div className="rounded-xl bg-[#031635] px-3 py-2.5 text-left">
      <div className="text-[11px] font-extrabold leading-tight tracking-wide text-white">
        Polymarket Moneylines
      </div>
      <div className="mt-0.5 text-[10px] leading-tight text-sky-300/80">
        {hasEdges ? "Sorted by model edge strength" : "Live YES / NO prices for today's games"}
      </div>
      {data && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[9px] tabular-nums text-slate-400">
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
  );

  const bodyNode = isLoading ? (
    <LoadingSkeleton />
  ) : isError ? (
    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-[11px] text-red-700">
      Unable to load Polymarket data. The MLB page is unaffected.
    </div>
  ) : sortedGames.length > 0 ? (
    <div className="space-y-2">
      {sortedGames.map((game) => (
        <GameCard
          key={game.gamePk}
          game={game}
          mlEdge={mlEdges[game.gamePk] ?? null}
          onOpenGame={onOpenGame}
          getPitcherXera={getPitcherXera}
        />
      ))}
    </div>
  ) : data && data.totalGames === 0 ? (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-[11px] text-slate-400">
      <p>No MLB games are scheduled today.</p>
      <p className="mt-1.5">Today&apos;s models and projections will automatically return when the next MLB slate becomes available.</p>
    </div>
  ) : (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-[11px] text-slate-400">
      No active Polymarket moneyline markets found.
    </div>
  );

  const footerNode = (
    <div className="mt-2 text-center text-[8px] text-slate-400">
      Prices reflect Polymarket prediction market bids · Not sportsbook odds
    </div>
  );

  return (
    <div ref={panelRef} className="polymarket-panel box-border w-full min-w-0 pr-1.5">
      {/* Mobile: collapsible, collapsed by default (unless #moneylines is deep-linked) */}
      <Accordion type="single" collapsible className="md:hidden" value={mobileOpen} onValueChange={setMobileOpen}>
        <AccordionItem value="polymarket" className="border-none">
          <AccordionTrigger className="p-0 hover:no-underline">{headerNode}</AccordionTrigger>
          <AccordionContent className="px-0 pb-0 pt-2">
            {bodyNode}
            {footerNode}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Desktop: always expanded, unchanged */}
      <div className="hidden md:block">
        <div className="mb-2.5">{headerNode}</div>
        {bodyNode}
        {footerNode}
      </div>
    </div>
  );
}
