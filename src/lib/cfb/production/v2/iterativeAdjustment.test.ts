import { describe, expect, it } from "vitest";
import { computeCfbV2IterativeAdjustment } from "./iterativeAdjustment";
import type { CfbV2Observation } from "./ratingInputs";
import { computeIterativeAdjustment } from "../../research/phase2/iterativeAdjustment";
import type { GameObservation } from "../../research/phase2/types";
import { CFB_V2_PREV_SEASON_RATING_CONFIG } from "./prevSeasonRating";

const TEAMS = ["alpha", "bravo", "charlie", "delta"];

function pseudoRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function fixtureRows() {
  const rand = pseudoRandom(17);
  const rows: { home: string; away: string; homeValue: number; awayValue: number }[] = [];
  for (let i = 0; i < TEAMS.length; i += 1) {
    for (let j = i + 1; j < TEAMS.length; j += 1) {
      rows.push({ home: TEAMS[i], away: TEAMS[j], homeValue: 4 + rand() * 4, awayValue: 4 + rand() * 4 });
    }
  }
  return rows;
}

function productionObs(): CfbV2Observation[] {
  const obs: CfbV2Observation[] = [];
  fixtureRows().forEach((row, i) => {
    const gameId = `g${i}`;
    obs.push({ gameId, teamId: row.home, opponentTeamId: row.away, teamClassification: "fbs", opponentClassification: "fbs", isHome: true, isNeutral: false, offenseValue: row.homeValue, defenseAllowedValue: row.awayValue, weight: 1 });
    obs.push({ gameId, teamId: row.away, opponentTeamId: row.home, teamClassification: "fbs", opponentClassification: "fbs", isHome: false, isNeutral: false, offenseValue: row.awayValue, defenseAllowedValue: row.homeValue, weight: 1 });
  });
  return obs;
}

function researchObs(): GameObservation[] {
  const obs: GameObservation[] = [];
  fixtureRows().forEach((row, i) => {
    const gameId = `g${i}`;
    obs.push({ gameId, season: 2025, week: 1, teamExternalId: row.home, opponentExternalId: row.away, teamClassification: "fbs", opponentClassification: "fbs", isHome: true, isNeutral: false, offenseValue: row.homeValue, defenseAllowedValue: row.awayValue, weight: 1, actualTeamScore: null, actualOpponentScore: null });
    obs.push({ gameId, season: 2025, week: 1, teamExternalId: row.away, opponentExternalId: row.home, teamClassification: "fbs", opponentClassification: "fbs", isHome: false, isNeutral: false, offenseValue: row.awayValue, defenseAllowedValue: row.homeValue, weight: 1, actualTeamScore: null, actualOpponentScore: null });
  });
  return obs;
}

describe("computeCfbV2IterativeAdjustment parity with research computeIterativeAdjustment", () => {
  it("matches offense/defense exactly using the frozen prior-season config (strength=1.0, iterations=20)", () => {
    const config = { strength: CFB_V2_PREV_SEASON_RATING_CONFIG.strength, iterations: CFB_V2_PREV_SEASON_RATING_CONFIG.iterations, minimumGames: CFB_V2_PREV_SEASON_RATING_CONFIG.minimumGames };
    const production = computeCfbV2IterativeAdjustment(TEAMS, productionObs(), config);
    const research = computeIterativeAdjustment(TEAMS, researchObs(), config);

    for (const teamId of TEAMS) {
      const p = production.teams.find((t) => t.teamId === teamId)!;
      const r = research.teams.find((t) => t.teamExternalId === teamId)!;
      expect(p.offense).toBeCloseTo(r.offense as number, 10);
      expect(p.defense).toBeCloseTo(r.defense as number, 10);
    }
  });
});
