import type { ScheduleGame } from "@/hooks/useSchedule";
import type { Team } from "@/data/ncaaTeams";
import { formatRoundedPercent, roundToTenth } from "@/lib/numberFormat";

export interface VegasProbabilityComparison {
  sportsbook: string | null;
  teamA: {
    moneyline: number | null;
    impliedProbability: number | null;
  };
  teamB: {
    moneyline: number | null;
    impliedProbability: number | null;
  };
  edge: {
    team: "teamA" | "teamB" | "even";
    points: number | null;
  };
}

export type ModelEdgeIntensity = "none" | "low" | "medium" | "high";

export function americanOddsToImpliedProbability(odds: number | null | undefined): number | null {
  if (odds === null || odds === undefined || Number.isNaN(odds) || odds === 0) return null;
  if (odds < 0) return (-odds) / (-odds + 100);
  return 100 / (odds + 100);
}

export function normalizeImpliedProbabilities(
  teamA: number | null,
  teamB: number | null,
): { teamA: number | null; teamB: number | null } {
  if (teamA === null || teamB === null) {
    return { teamA, teamB };
  }

  const total = teamA + teamB;
  if (!total) {
    return { teamA, teamB };
  }

  return {
    teamA: teamA / total,
    teamB: teamB / total,
  };
}

function normalizeMoneyline(value: number | null): number | null {
  if (value === null || Number.isNaN(value) || value === 0) return null;
  return value;
}

function inferOpposingMoneyline(odds: number | null): number | null {
  if (odds === null) return null;
  if (odds < 0) return Math.round((10000 / Math.abs(odds)) / 5) * 5;
  return -Math.round((100 * odds) / (odds - 100));
}

export function buildVegasProbabilityComparison(params: {
  modelProbA: number;
  modelProbB: number;
  moneylineA: number | null;
  moneylineB: number | null;
  sportsbook?: string | null;
}): VegasProbabilityComparison | null {
  let moneylineA = normalizeMoneyline(params.moneylineA);
  let moneylineB = normalizeMoneyline(params.moneylineB);

  if (moneylineA === null && moneylineB !== null) {
    moneylineA = inferOpposingMoneyline(moneylineB);
  } else if (moneylineB === null && moneylineA !== null) {
    moneylineB = inferOpposingMoneyline(moneylineA);
  }

  const impliedA = americanOddsToImpliedProbability(moneylineA);
  const impliedB = americanOddsToImpliedProbability(moneylineB);

  if (impliedA === null || impliedB === null) {
    return null;
  }

  const normalized = normalizeImpliedProbabilities(impliedA, impliedB);
  const diffA = (params.modelProbA - normalized.teamA) * 100;
  const diffB = (params.modelProbB - normalized.teamB) * 100;
  const magnitude = roundToTenth(Math.max(diffA, diffB));

  if (magnitude === null) {
    return null;
  }

  const team =
    Math.abs(diffA - diffB) < 0.2
      ? "even"
      : diffA > diffB
        ? "teamA"
        : "teamB";

  return {
    sportsbook: params.sportsbook ?? null,
    teamA: {
      moneyline: moneylineA,
      impliedProbability: normalized.teamA,
    },
    teamB: {
      moneyline: moneylineB,
      impliedProbability: normalized.teamB,
    },
    edge: {
      team,
      points: team === "even" ? 0 : magnitude,
    },
  };
}

export function findScheduledGameForTeams(
  games: ScheduleGame[] | undefined,
  teamA: Team,
  teamB: Team,
  teamPool: Team[],
  findTeamByEspn: (name: string, abbreviation: string | undefined, pool: Team[]) => Team | null,
): ScheduleGame | null {
  if (!games?.length) return null;

  return (
    games.find((game) => {
      if (!game.homeTeam || !game.awayTeam) return false;
      const home = findTeamByEspn(game.homeTeam.name, game.homeTeam.abbreviation, teamPool);
      const away = findTeamByEspn(game.awayTeam.name, game.awayTeam.abbreviation, teamPool);
      if (!home || !away) return false;

      return (
        (home.canonicalId === teamA.canonicalId && away.canonicalId === teamB.canonicalId) ||
        (home.canonicalId === teamB.canonicalId && away.canonicalId === teamA.canonicalId)
      );
    }) ?? null
  );
}

export function resolveScheduledGameMoneylines(
  game: ScheduleGame | null,
  teamA: Team,
  teamB: Team,
  teamPool: Team[],
  findTeamByEspn: (name: string, abbreviation: string | undefined, pool: Team[]) => Team | null,
): { moneylineA: number | null; moneylineB: number | null; sportsbook: string | null } {
  if (!game?.odds || !game.homeTeam || !game.awayTeam) {
    return { moneylineA: null, moneylineB: null, sportsbook: null };
  }

  const away = findTeamByEspn(game.awayTeam.name, game.awayTeam.abbreviation, teamPool);
  const home = findTeamByEspn(game.homeTeam.name, game.homeTeam.abbreviation, teamPool);

  if (!away || !home) {
    return { moneylineA: null, moneylineB: null, sportsbook: game.odds.provider };
  }

  const teamAIsAway = away.canonicalId === teamA.canonicalId;
  const teamAIsHome = home.canonicalId === teamA.canonicalId;
  const teamBIsAway = away.canonicalId === teamB.canonicalId;
  const teamBIsHome = home.canonicalId === teamB.canonicalId;

  return {
    moneylineA: teamAIsAway ? game.odds.awayMoneyline : teamAIsHome ? game.odds.homeMoneyline : null,
    moneylineB: teamBIsAway ? game.odds.awayMoneyline : teamBIsHome ? game.odds.homeMoneyline : null,
    sportsbook: game.odds.provider,
  };
}

export function formatMoneyline(odds: number | null): string {
  if (odds === null) return "--";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function formatProbabilityValue(probability: number | null): string {
  if (probability === null) return "--";
  return formatRoundedPercent(probability * 100);
}

export function getModelEdgeIntensity(points: number | null | undefined): ModelEdgeIntensity {
  if (points === null || points === undefined || points < 0.2) return "none";
  if (points >= 8) return "high";
  if (points >= 4) return "medium";
  return "low";
}
