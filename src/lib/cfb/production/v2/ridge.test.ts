import { describe, expect, it } from "vitest";
import { computeCfbV2Ridge, computeCfbV2RidgeWithPerTeamLambda } from "./ridge";
import type { CfbV2Observation } from "./ratingInputs";
import { computeRidgeAdjustment } from "../../research/phase2/ridgeAdjustment";
import { computeRidgeAdjustmentWithPerTeamLambda } from "../../research/phase8/ridgeWithPerTeamLambda";
import type { GameObservation } from "../../research/phase2/types";

// Small synthetic 6-team round-robin, deterministic pseudo-random YPP values.
const TEAMS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];

function pseudoRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function buildFixtureRows(): { home: string; away: string; homeValue: number; awayValue: number; isNeutral: boolean }[] {
  const rand = pseudoRandom(99);
  const rows: { home: string; away: string; homeValue: number; awayValue: number; isNeutral: boolean }[] = [];
  for (let i = 0; i < TEAMS.length; i += 1) {
    for (let j = i + 1; j < TEAMS.length; j += 1) {
      rows.push({
        home: TEAMS[i],
        away: TEAMS[j],
        homeValue: 5 + rand() * 3,
        awayValue: 5 + rand() * 3,
        isNeutral: rand() > 0.85,
      });
    }
  }
  return rows;
}

function toProductionObservations(): CfbV2Observation[] {
  const rows = buildFixtureRows();
  const obs: CfbV2Observation[] = [];
  rows.forEach((row, i) => {
    const gameId = `g${i}`;
    obs.push({ gameId, teamId: row.home, opponentTeamId: row.away, teamClassification: "fbs", opponentClassification: "fbs", isHome: true, isNeutral: row.isNeutral, offenseValue: row.homeValue, defenseAllowedValue: row.awayValue, weight: 1 });
    obs.push({ gameId, teamId: row.away, opponentTeamId: row.home, teamClassification: "fbs", opponentClassification: "fbs", isHome: false, isNeutral: row.isNeutral, offenseValue: row.awayValue, defenseAllowedValue: row.homeValue, weight: 1 });
  });
  return obs;
}

function toResearchObservations(): GameObservation[] {
  const rows = buildFixtureRows();
  const obs: GameObservation[] = [];
  rows.forEach((row, i) => {
    const gameId = `g${i}`;
    obs.push({ gameId, season: 2025, week: 1, teamExternalId: row.home, opponentExternalId: row.away, teamClassification: "fbs", opponentClassification: "fbs", isHome: true, isNeutral: row.isNeutral, offenseValue: row.homeValue, defenseAllowedValue: row.awayValue, weight: 1, actualTeamScore: null, actualOpponentScore: null });
    obs.push({ gameId, season: 2025, week: 1, teamExternalId: row.away, opponentExternalId: row.home, teamClassification: "fbs", opponentClassification: "fbs", isHome: false, isNeutral: row.isNeutral, offenseValue: row.awayValue, defenseAllowedValue: row.homeValue, weight: 1, actualTeamScore: null, actualOpponentScore: null });
  });
  return obs;
}

describe("computeCfbV2Ridge parity with research computeRidgeAdjustment", () => {
  it("matches offense/defense/leagueMean exactly for the same fixture", () => {
    const production = computeCfbV2Ridge(TEAMS, toProductionObservations(), 5, true);
    const research = computeRidgeAdjustment(TEAMS, toResearchObservations(), { lambda: 5, includeHfa: true });

    expect(production.leagueMean).toBeCloseTo(research.leagueMean as number, 10);
    for (const teamId of TEAMS) {
      const p = production.teams.find((t) => t.teamId === teamId)!;
      const r = research.teams.find((t) => t.teamExternalId === teamId)!;
      expect(p.offense).toBeCloseTo(r.offense as number, 10);
      expect(p.defense).toBeCloseTo(r.defense as number, 10);
      expect(p.gamesCount).toBe(r.gamesCount);
    }
  });

  it("returns all-null teams with zero observations", () => {
    const result = computeCfbV2Ridge(TEAMS, [], 5, true);
    expect(result.leagueMean).toBeNull();
    for (const team of result.teams) {
      expect(team.offense).toBeNull();
      expect(team.defense).toBeNull();
    }
  });
});

describe("computeCfbV2RidgeWithPerTeamLambda parity with research computeRidgeAdjustmentWithPerTeamLambda", () => {
  it("matches offense/defense exactly for the same fixture, priors, and per-team lambda", () => {
    const lambdaByTeam = new Map(TEAMS.map((id, i) => [id, 10 + i * 5]));
    const priorOffenseByTeam = new Map(TEAMS.map((id, i) => [id, 6 + i * 0.2]));
    const priorDefenseByTeam = new Map(TEAMS.map((id, i) => [id, 5.5 + i * 0.1]));

    const production = computeCfbV2RidgeWithPerTeamLambda(TEAMS, toProductionObservations(), lambdaByTeam, true, priorOffenseByTeam, priorDefenseByTeam);
    const research = computeRidgeAdjustmentWithPerTeamLambda(TEAMS, toResearchObservations(), lambdaByTeam, true, priorOffenseByTeam, priorDefenseByTeam);

    for (const teamId of TEAMS) {
      const p = production.teams.find((t) => t.teamId === teamId)!;
      const r = research.teams.find((t) => t.teamExternalId === teamId)!;
      expect(p.offense).toBeCloseTo(r.offense as number, 10);
      expect(p.defense).toBeCloseTo(r.defense as number, 10);
    }
  });
});
