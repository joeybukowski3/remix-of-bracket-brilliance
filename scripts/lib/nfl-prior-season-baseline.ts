/**
 * AI Picks v2 -- compact PRIOR-SEASON baseline for both teams, so Stage A has a
 * defensive and record/scoring anchor next to the (small) current-season
 * sample. Deterministic and descriptive only: built from artifacts the packet
 * already reads (matchup-epa / matchup-metrics `prior-season-full` windows and
 * the prior season's results). No new cache, no derivation beyond a W-L-T
 * count. Success rate is NOT available in those artifacts, so it is omitted
 * (never estimated).
 */
import type { EpaPriorSeasonWindow, MetricsPriorSeasonWindow } from "./nfl-game-context";

export interface PriorSeasonResultRow {
  homeAbbr: string;
  awayAbbr: string;
  homeScore?: number | null;
  awayScore?: number | null;
  seasonType?: string | null;
  final?: boolean | null;
}

export interface PriorSeasonTeamBaseline {
  /** W-L or W-L-T over the prior regular season; null when results were unavailable. */
  record: string | null;
  gamesPlayed: number | null;
  offEpaPerPlay: number | null;
  /** EPA per play the team's defense ALLOWED (lower is better). */
  defEpaAllowedPerPlay: number | null;
  offPointsPerGame: number | null;
  defPointsAllowedPerGame: number | null;
  offYardsPerPlay: number | null;
  defYardsPerPlayAllowed: number | null;
}

export interface PriorSeasonBaseline {
  season: number | null;
  home: PriorSeasonTeamBaseline | null;
  away: PriorSeasonTeamBaseline | null;
  provenance_status: "available" | "unavailable";
}

type MetricMap = Record<string, [number, number]> | undefined;

function metric(map: MetricMap, key: string): number | null {
  const value = map?.[key]?.[0];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recordFor(team: string, results: readonly PriorSeasonResultRow[]): { record: string | null; games: number | null } {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  for (const g of results) {
    if (g.seasonType !== "REG" || g.final !== true || typeof g.homeScore !== "number" || typeof g.awayScore !== "number") continue;
    const isHome = g.homeAbbr === team;
    if (!isHome && g.awayAbbr !== team) continue;
    const own = isHome ? g.homeScore : g.awayScore;
    const opp = isHome ? g.awayScore : g.homeScore;
    if (own > opp) wins += 1;
    else if (own < opp) losses += 1;
    else ties += 1;
  }
  const games = wins + losses + ties;
  if (games === 0) return { record: null, games: null };
  return { record: ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`, games };
}

function teamBaseline(
  team: string,
  epaMetrics: MetricMap,
  yppMetrics: MetricMap,
  results: readonly PriorSeasonResultRow[]
): PriorSeasonTeamBaseline {
  const { record, games } = recordFor(team, results);
  return {
    record,
    gamesPlayed: games,
    offEpaPerPlay: metric(epaMetrics, "off.epaPerPlay"),
    defEpaAllowedPerPlay: metric(epaMetrics, "def.epaPerPlayAllowed"),
    offPointsPerGame: metric(yppMetrics, "off.pointsPerGame"),
    defPointsAllowedPerGame: metric(yppMetrics, "def.pointsAllowedPerGame"),
    offYardsPerPlay: metric(yppMetrics, "off.yardsPerPlay"),
    defYardsPerPlayAllowed: metric(yppMetrics, "def.yardsPerPlayAllowed"),
  };
}

export function buildPriorSeasonBaseline(input: {
  epaWindow: EpaPriorSeasonWindow | null;
  yppWindow: MetricsPriorSeasonWindow | null;
  priorSeasonResults?: readonly PriorSeasonResultRow[];
  homeTeam: string;
  awayTeam: string;
}): PriorSeasonBaseline {
  const results = input.priorSeasonResults ?? [];
  const side = (team: string): PriorSeasonTeamBaseline | null => {
    const epaTeam = input.epaWindow?.teams[team];
    const yppTeam = input.yppWindow?.teams[team];
    if (!epaTeam && !yppTeam) return null;
    return teamBaseline(team, epaTeam?.metrics, yppTeam?.metrics, results);
  };
  const home = side(input.homeTeam);
  const away = side(input.awayTeam);
  const season = input.epaWindow?.teams[input.homeTeam]?.through?.season ?? input.yppWindow?.teams[input.homeTeam]?.through?.season ?? null;
  return { season, home, away, provenance_status: home && away ? "available" : "unavailable" };
}
