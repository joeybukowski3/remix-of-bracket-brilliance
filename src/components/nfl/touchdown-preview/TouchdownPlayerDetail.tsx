import type { ReactNode } from "react";
import TeamLogo from "@/components/TeamLogo";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { sportsbookDisplayName } from "@/lib/nfl/bettingLinesView";
import {
  computeOpponentHistoryAverages,
  computePlayerHistoryAverages,
  deltaTone,
  formatOpportunityDelta,
  historyAverageRowLabel,
  opportunityDelta,
  type DeltaTone,
} from "@/lib/nfl/touchdown-preview/historyAverages";
import { OPPONENT_POSITION_TD_ALLOWED_LABEL } from "@/lib/nfl/touchdown-preview/presentation";
import type { TouchdownPreviewPlayer, TouchdownWindowKey } from "@/lib/nfl/touchdown-preview/types";
import { getPercentileTier } from "@/lib/shared/jkbHeat";
import { cn } from "@/lib/utils";

const number = (value: number | null, digits = 1) => value == null ? "N/A" : value.toFixed(digits);
const pct1 = (value: number | null) => value == null ? "N/A" : `${(value * 100).toFixed(1)}%`;
const fmtOdds = (value: number) => (value > 0 ? `+${value}` : `${value}`);
const fmtUpdatedAt = (value: string | null | undefined) => {
  if (!value) return "N/A";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "N/A" : parsed.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};
const score = (a: number | null, b: number | null) => a == null || b == null ? "N/A" : `${a}–${b}`;
const badge = (homeAway: "home" | "away") => <span className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase ${homeAway === "home" ? "bg-sky-100 text-sky-800" : "bg-slate-200 text-slate-700"}`}>{homeAway === "home" ? "H" : "A"}</span>;

const DELTA_TONE_CLASS: Record<DeltaTone, string> = { positive: "text-emerald-700", negative: "text-rose-700", neutral: "text-slate-400" };

/** Team abbreviation with its logo, compact and inline -- not a separate wide column. */
function OpponentCell({ team }: { team: string }) {
  return <span className="flex items-center justify-center gap-1 font-semibold uppercase"><TeamLogo name={team} logo={nflLogoUrl(team)} className="h-3.5 w-3.5" />{team}</span>;
}

/** A cell value plus a compact, muted delta vs. the displayed-sample average, e.g. "4 (+1.2)". */
function DeltaCell({ value, average: sampleAverage, digits = 0 }: { value: number | null; average: number | null; digits?: number }) {
  if (value == null) return <span className="text-slate-400">N/A</span>;
  const delta = opportunityDelta(value, sampleAverage);
  const formatted = formatOpportunityDelta(delta);
  return <>{value.toFixed(digits)}{formatted && <span className={cn("ml-1 font-normal tabular-nums", DELTA_TONE_CLASS[deltaTone(delta)])}>{formatted}</span>}</>;
}

function ordinal(n: number): string {
  const rounded = Math.round(n);
  const mod100 = rounded % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${rounded}th`;
  switch (rounded % 10) {
    case 1: return `${rounded}st`;
    case 2: return `${rounded}nd`;
    case 3: return `${rounded}rd`;
    default: return `${rounded}th`;
  }
}

/**
 * "62nd pctile" context, heat-colored with the shared JKB percentile scale
 * (`getPercentileTier`, the same 8-tier gold->green->slate->red ramp the board
 * cells use). The percentile passed in is ALREADY a favorable percentile from
 * `components.*` -- higher is better for every metric surfaced here -- so
 * `"higherBetter"` applies it directly and never double-inverts. Raw text is
 * preserved; only the cell treatment changes. `null` -> plain em dash, no wash.
 */
function PercentileContext({ percentile }: { percentile: number | null }) {
  if (percentile == null || !Number.isFinite(percentile)) return <span className="text-slate-400">—</span>;
  const tier = getPercentileTier(percentile, "higherBetter");
  const style = tier
    ? { backgroundColor: tier.style.backgroundColor, color: tier.style.color, boxShadow: tier.style.border.replace("1px solid ", "inset 0 0 0 1px ") }
    : undefined;
  return (
    <span className="inline-flex items-center justify-center rounded px-1.5 py-0.5 font-semibold tabular-nums" style={style}>
      {ordinal(percentile)} pctile
    </span>
  );
}

type ProfileRow = { label: ReactNode; value: string; context: number | null };

/**
 * Compact "Metric | Player | Context" table. Full width, no minimum width, so it
 * stacks cleanly at ~390px instead of forcing a horizontal scroll. Outer spacing
 * and width are owned by the caller's layout wrapper, not this component.
 */
function ProfileTable({ id, title, accent, rows }: { id: string; title: string; accent: string; rows: readonly ProfileRow[] }) {
  return (
    <section className="overflow-hidden rounded border border-slate-200 bg-white" aria-labelledby={id}>
      <h3 id={id} className={cn("px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white", accent)}>{title}</h3>
      <table className="w-full text-[10px]">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-2.5 py-1 text-left font-semibold uppercase tracking-wide">Metric</th>
            <th className="px-2 py-1 text-right font-semibold uppercase tracking-wide">Player</th>
            <th className="px-2.5 py-1 text-right font-semibold uppercase tracking-wide">Context</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-slate-100">
              <td className="px-2.5 py-1 text-left text-slate-600">{row.label}</td>
              <td className="px-2 py-1 text-right font-semibold tabular-nums text-slate-800">{row.value}</td>
              <td className="px-2.5 py-1 text-right tabular-nums"><PercentileContext percentile={row.context} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function TouchdownPlayerDetail({ player, window }: { player: TouchdownPreviewPlayer; window: TouchdownWindowKey }) {
  const metrics = player.windows[window];
  const playerGames = player.playerHistory.filter((game) => window === "last8" || game.season === Number(window)).slice(0, window === "last8" ? 8 : 10);
  const opponentGames = player.opponentHistory.filter((game) => window === "last8" || game.season === Number(window)).slice(0, window === "last8" ? 8 : 10);
  const playerAverages = computePlayerHistoryAverages(playerGames);
  const opponentAverages = computeOpponentHistoryAverages(opponentGames, player.position);
  const positionTdAllowedLabel = OPPONENT_POSITION_TD_ALLOWED_LABEL[player.position];
  const components = metrics.components;

  const scoringProfile: ProfileRow[] = [
    { label: "TD/Game", value: number(metrics.tdPerGame, 2), context: components.tdSuccess.percentile },
    { label: "TD/Game Last 5", value: number(metrics.tdLast5PerGame, 2), context: components.tdSuccess.percentile },
    { label: "Usage/G", value: number(metrics.usagePerGame, 1), context: components.playerUsage.percentile },
    { label: "Team Usage %", value: pct1(metrics.teamUsageShare), context: components.teamUsage.percentile },
    { label: "RZ Opp/G", value: number(metrics.rzOpportunitiesPerGame, 2), context: components.tdOpportunities.percentile },
    { label: "Inside 10 Opp/G", value: number(metrics.inside10OpportunitiesPerGame, 2), context: components.tdOpportunities.percentile },
    { label: "Goal Line Opp/G", value: number(metrics.goalLineOpportunitiesPerGame, 2), context: components.tdOpportunities.percentile },
    { label: "RZ Share", value: pct1(metrics.rzOpportunityShare), context: components.teamUsage.percentile },
    { label: "Goal Line Share", value: pct1(metrics.goalLineOpportunityShare), context: components.teamUsage.percentile },
  ];

  const matchupMarket: ProfileRow[] = [
    { label: "Team Implied Points", value: number(metrics.impliedTeamPoints, 1), context: components.impliedTeamPoints.percentile },
    { label: "Opp TD Opp/G", value: number(metrics.opponentTdOpportunitiesPerGame, 2), context: components.opponentTdOpportunities.percentile },
    { label: "Opp TD/Game vs Pos SZN", value: number(metrics.opponentPositionTdsAllowedPerGameSeason, 2), context: metrics.opponentPositionTdsAllowedPerGameSeasonPercentile },
    { label: "Opp TD/Game vs Pos Last 5", value: number(metrics.opponentPositionTdsAllowedPerGameLast5, 2), context: metrics.opponentPositionTdsAllowedPerGameLast5Percentile },
    { label: "Anytime TD Odds", value: player.anytimeTdOdds == null ? "Unavailable" : fmtOdds(player.anytimeTdOdds), context: null },
    { label: "Book", value: player.anytimeTdBook == null ? "Unavailable" : sportsbookDisplayName(player.anytimeTdBook), context: null },
    { label: "Market Implied %", value: player.marketImpliedProbability == null ? "Unavailable" : pct1(player.marketImpliedProbability), context: null },
    { label: "Odds Updated", value: player.oddsUpdatedAt == null ? "Unavailable" : fmtUpdatedAt(player.oddsUpdatedAt), context: null },
  ];

  return <div className="bg-slate-50 px-2 py-2.5 sm:px-4" data-testid="touchdown-player-detail">
    {/* Scoring Profile and Matchup & Market sit side by side from lg up; below
        lg they stack (Scoring Profile first). `items-start` keeps each panel at
        its natural height so the shorter one is not stretched. */}
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 lg:items-start" data-testid="touchdown-detail-panels">
      <ProfileTable id={`scoring-profile-${player.playerId}`} title="Scoring profile" accent="bg-slate-700" rows={scoringProfile} />
      <ProfileTable id={`matchup-market-${player.playerId}`} title="Matchup & market" accent="bg-emerald-700" rows={matchupMarket} />
    </div>
    <section className="mt-2 overflow-hidden rounded border border-sky-200 bg-white" aria-labelledby={`player-history-${player.playerId}`}>
      <h3 id={`player-history-${player.playerId}`} className="bg-sky-700 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white">Player game history</h3>
      <div className="min-w-0 overflow-x-auto"><table className="w-full min-w-[760px] text-[10px]"><thead className="bg-sky-50 text-sky-900"><tr>{["Week","Opp","H/A","Score","TD","Rush TD","Rec TD","RZ Opps","Inside 10 Opps","Goal Line Opps","Usage"].map((head) => <th key={head} className="px-2 py-1 text-center">{head}</th>)}</tr></thead>
        <tbody>{playerGames.length ? <>{playerGames.map((game) => <tr key={game.gameId} className="border-t border-slate-100"><td className="px-2 py-1 text-center">{game.season} W{game.week}</td><td className="px-2 py-1 text-center"><OpponentCell team={game.opponent} /></td><td className="px-2 py-1 text-center">{badge(game.homeAway)}</td><td className="px-2 py-1 text-center">{score(game.teamScore, game.opponentScore)}</td><td className="px-2 py-1 text-center font-bold">{game.touchdowns}</td><td className="px-2 py-1 text-center">{game.rushingTds}</td><td className="px-2 py-1 text-center">{game.receivingTds}</td><td className="px-2 py-1 text-center"><DeltaCell value={game.rzOpportunities} average={playerAverages.rzOpportunities} /></td><td className="px-2 py-1 text-center"><DeltaCell value={game.inside10Opportunities} average={playerAverages.inside10Opportunities} /></td><td className="px-2 py-1 text-center"><DeltaCell value={game.goalLineOpportunities} average={playerAverages.goalLineOpportunities} /></td><td className="px-2 py-1 text-center">{game.scorerOpportunities ?? "N/A"}</td></tr>)}
          <tr className="border-t-2 border-sky-200 bg-sky-50/60 font-semibold text-sky-900"><td colSpan={4} className="px-2 py-1 text-right uppercase tracking-wide text-[9px]">{historyAverageRowLabel(playerGames.length)}</td><td className="px-2 py-1 text-center">{number(playerAverages.touchdowns, 2)}</td><td className="px-2 py-1 text-center">{number(playerAverages.rushingTds, 2)}</td><td className="px-2 py-1 text-center">{number(playerAverages.receivingTds, 2)}</td><td className="px-2 py-1 text-center">{number(playerAverages.rzOpportunities, 2)}</td><td className="px-2 py-1 text-center">{number(playerAverages.inside10Opportunities, 2)}</td><td className="px-2 py-1 text-center">{number(playerAverages.goalLineOpportunities, 2)}</td><td className="px-2 py-1 text-center">{number(playerAverages.scorerOpportunities, 2)}</td></tr>
        </> : <tr><td colSpan={11} className="px-3 py-3 text-center text-slate-500">No applicable player games in this window.</td></tr>}</tbody></table></div>
    </section>
    <section className="mt-2 overflow-hidden rounded border border-violet-200 bg-white" aria-labelledby={`opponent-history-${player.playerId}`}>
      <h3 id={`opponent-history-${player.playerId}`} className="bg-violet-700 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white">Opponent game history</h3>
      <div className="min-w-0 overflow-x-auto"><table className="w-full min-w-[760px] text-[10px]"><thead className="bg-violet-50 text-violet-900"><tr>{["Week","Opp","H/A","Score","Off TD Allowed","RZ Opps Allowed","Inside 10 Opps Allowed","Goal Line Opps Allowed",positionTdAllowedLabel].map((head) => <th key={head} className="px-2 py-1 text-center">{head}</th>)}</tr></thead>
        <tbody>{opponentGames.length ? <>{opponentGames.map((game) => <tr key={`${game.gameId}-${game.defense}`} className="border-t border-slate-100"><td className="px-2 py-1 text-center">{game.season} W{game.week}</td><td className="px-2 py-1 text-center"><OpponentCell team={game.opponent} /></td><td className="px-2 py-1 text-center">{badge(game.homeAway)}</td><td className="px-2 py-1 text-center">{score(game.defenseScore, game.opponentScore)}</td><td className="px-2 py-1 text-center font-bold">{game.offensiveTdsAllowed}</td><td className="px-2 py-1 text-center"><DeltaCell value={game.rzOpportunitiesAllowed} average={opponentAverages.rzOpportunitiesAllowed} /></td><td className="px-2 py-1 text-center"><DeltaCell value={game.inside10OpportunitiesAllowed} average={opponentAverages.inside10OpportunitiesAllowed} /></td><td className="px-2 py-1 text-center"><DeltaCell value={game.goalLineOpportunitiesAllowed} average={opponentAverages.goalLineOpportunitiesAllowed} /></td><td className="px-2 py-1 text-center"><DeltaCell value={game.touchdownsAllowedByPosition[player.position]} average={opponentAverages.positionTdsAllowed} /></td></tr>)}
          <tr className="border-t-2 border-violet-200 bg-violet-50/60 font-semibold text-violet-900"><td colSpan={4} className="px-2 py-1 text-right uppercase tracking-wide text-[9px]">{historyAverageRowLabel(opponentGames.length)}</td><td className="px-2 py-1 text-center">{number(opponentAverages.offensiveTdsAllowed, 2)}</td><td className="px-2 py-1 text-center">{number(opponentAverages.rzOpportunitiesAllowed, 2)}</td><td className="px-2 py-1 text-center">{number(opponentAverages.inside10OpportunitiesAllowed, 2)}</td><td className="px-2 py-1 text-center">{number(opponentAverages.goalLineOpportunitiesAllowed, 2)}</td><td className="px-2 py-1 text-center">{number(opponentAverages.positionTdsAllowed, 2)}</td></tr>
        </> : <tr><td colSpan={9} className="px-3 py-3 text-center text-slate-500">No applicable opponent games in this window.</td></tr>}</tbody></table></div>
    </section>
  </div>;
}
