import { normalizeNflTeamAbbr } from "@/lib/nfl/identity/identity";
import { aggregateScorerTouchdownsByPosition } from "./model";
import type { TouchdownOpponentGame, TouchdownPosition } from "./types";

export type TouchdownWeeklyStatForOpponentHistory = {
  gameId: string;
  team: string;
  opponent: string;
  position: TouchdownPosition;
  rushingTds: number;
  receivingTds: number;
  passingTds: number;
  specialTeamsTds: number;
};

export type TouchdownDefenseGameAggregate = {
  defense: string;
  opponent: string;
  positionTds: Record<TouchdownPosition, number>;
};

export function normalizeTouchdownTeam(value: string | null | undefined): string {
  return normalizeNflTeamAbbr(value) ?? "";
}

export function touchdownTeamGameKey(gameId: string, team: string | null | undefined): string {
  return `${gameId}|${normalizeTouchdownTeam(team)}`;
}

export function aggregateOpponentPositionTouchdowns(
  stats: readonly TouchdownWeeklyStatForOpponentHistory[],
): Map<string, TouchdownDefenseGameAggregate> {
  const byDefenseGame = new Map<string, TouchdownDefenseGameAggregate>();
  for (const row of stats) {
    const defense = normalizeTouchdownTeam(row.opponent);
    const opponent = normalizeTouchdownTeam(row.team);
    const key = touchdownTeamGameKey(row.gameId, defense);
    const aggregate = byDefenseGame.get(key) ?? {
      defense,
      opponent,
      positionTds: { QB: 0, RB: 0, WR: 0, TE: 0 },
    };
    const scorerTds = aggregateScorerTouchdownsByPosition([{
      position: row.position,
      rushingTds: row.rushingTds,
      receivingTds: row.receivingTds,
      passingTds: row.passingTds,
      specialTeamsTds: row.specialTeamsTds,
    }]);
    aggregate.positionTds[row.position] += scorerTds[row.position];
    byDefenseGame.set(key, aggregate);
  }
  return byDefenseGame;
}

export function indexOpponentGamesByDefense(
  games: readonly TouchdownOpponentGame[],
): Map<string, TouchdownOpponentGame[]> {
  const byDefense = new Map<string, TouchdownOpponentGame[]>();
  for (const game of games) {
    const defense = normalizeTouchdownTeam(game.defense);
    const normalizedGame = {
      ...game,
      defense,
      opponent: normalizeTouchdownTeam(game.opponent),
    };
    const list = byDefense.get(defense) ?? [];
    list.push(normalizedGame);
    byDefense.set(defense, list);
  }
  return byDefense;
}

export function opponentGamesForTeam(
  gamesByDefense: ReadonlyMap<string, TouchdownOpponentGame[]>,
  opponent: string | null | undefined,
): TouchdownOpponentGame[] {
  return gamesByDefense.get(normalizeTouchdownTeam(opponent)) ?? [];
}
