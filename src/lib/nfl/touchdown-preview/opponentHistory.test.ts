import { describe, expect, it } from "vitest";
import {
  aggregateOpponentPositionTouchdowns,
  indexOpponentGamesByDefense,
  normalizeTouchdownTeam,
  opponentGamesForTeam,
} from "./opponentHistory";
import type { TouchdownOpponentGame, TouchdownPosition } from "./types";

const weeklyStat = (opponent: string, position: TouchdownPosition, rushingTds = 0, receivingTds = 0) => ({
  gameId: "2025_01_SF_LA",
  team: "SF",
  opponent,
  position,
  rushingTds,
  receivingTds,
  passingTds: 0,
  specialTeamsTds: 0,
});

const opponentGame = (defense: string, touchdownsAllowedByPosition: TouchdownOpponentGame["touchdownsAllowedByPosition"]): TouchdownOpponentGame => ({
  gameId: "2025_01_SF_LA",
  season: 2025,
  week: 1,
  date: "2025-09-07T20:25:00.000Z",
  defense,
  opponent: "SF",
  homeAway: "home",
  defenseScore: 20,
  opponentScore: 17,
  offensiveTdsAllowed: Object.values(touchdownsAllowedByPosition).reduce((total, value) => total + value, 0),
  rzOpportunitiesAllowed: 3,
  inside10OpportunitiesAllowed: 2,
  goalLineOpportunitiesAllowed: 1,
  touchdownsAllowedByPosition,
});

describe("touchdown preview team normalization", () => {
  it.each([
    ["LA", "lar"],
    ["LAR", "lar"],
    ["WAS", "wsh"],
    ["WSH", "wsh"],
    ["AZ", "ari"],
    ["ARI", "ari"],
    ["JAC", "jax"],
    ["JAX", "jax"],
    ["BUF", "buf"],
  ])("normalizes %s to %s", (source, expected) => {
    expect(normalizeTouchdownTeam(source)).toBe(expected);
  });

  it.each([
    ["LA", "LAR"],
    ["WAS", "WSH"],
  ])("finds opponent positional TD history across the %s/%s alias boundary", (weeklyOpponent, candidateOpponent) => {
    const aggregates = aggregateOpponentPositionTouchdowns([
      weeklyStat(weeklyOpponent, "RB", 1),
      weeklyStat(weeklyOpponent, "WR", 0, 2),
    ]);
    const aggregate = [...aggregates.values()][0];
    const index = indexOpponentGamesByDefense([
      opponentGame(aggregate.defense, aggregate.positionTds),
    ]);

    const found = opponentGamesForTeam(index, candidateOpponent);
    expect(found).toHaveLength(1);
    expect(found[0].defense).toBe(normalizeTouchdownTeam(candidateOpponent));
    expect(found[0].touchdownsAllowedByPosition).toMatchObject({ RB: 1, WR: 2 });
  });
});
