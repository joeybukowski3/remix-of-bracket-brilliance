import { describe, expect, it } from "vitest";
import { computeCfbV2CandidateRatings } from "./candidateRatings";
import type { CfbV2MetricName, CfbV2Observation } from "./ratingInputs";
import { componentSizeRegularizationMultiplier } from "./connectivity";
import { CFB_V2_CONNECTIVITY_CONFIG } from "./config";
import { computeCandidateTeamRatings } from "../../research/phase8/candidateRatings";
import type { WeekGraphSnapshot } from "../../research/phase8/types";
import type { PriorRatings } from "../../research/phase3/types";
import type { GameObservation, CfbMetricName } from "../../research/phase2/types";

const TEAMS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];

function pseudoRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function fixtureRows(metricSeed: number) {
  const rand = pseudoRandom(metricSeed);
  const rows: { home: string; away: string; homeValue: number; awayValue: number }[] = [];
  for (let i = 0; i < TEAMS.length; i += 1) {
    for (let j = i + 1; j < TEAMS.length; j += 1) {
      if (rand() > 0.6) continue; // sparse, disconnected-ish schedule
      rows.push({ home: TEAMS[i], away: TEAMS[j], homeValue: 4 + rand() * 4, awayValue: 4 + rand() * 4 });
    }
  }
  return rows;
}

function productionObs(metricSeed: number): CfbV2Observation[] {
  const obs: CfbV2Observation[] = [];
  fixtureRows(metricSeed).forEach((row, i) => {
    const gameId = `g${metricSeed}-${i}`;
    obs.push({ gameId, teamId: row.home, opponentTeamId: row.away, teamClassification: "fbs", opponentClassification: "fbs", isHome: true, isNeutral: false, offenseValue: row.homeValue, defenseAllowedValue: row.awayValue, weight: 1 });
    obs.push({ gameId, teamId: row.away, opponentTeamId: row.home, teamClassification: "fbs", opponentClassification: "fbs", isHome: false, isNeutral: false, offenseValue: row.awayValue, defenseAllowedValue: row.homeValue, weight: 1 });
  });
  return obs;
}

function researchObs(metricSeed: number): GameObservation[] {
  const obs: GameObservation[] = [];
  fixtureRows(metricSeed).forEach((row, i) => {
    const gameId = `g${metricSeed}-${i}`;
    obs.push({ gameId, season: 2025, week: 3, teamExternalId: row.home, opponentExternalId: row.away, teamClassification: "fbs", opponentClassification: "fbs", isHome: true, isNeutral: false, offenseValue: row.homeValue, defenseAllowedValue: row.awayValue, weight: 1, actualTeamScore: null, actualOpponentScore: null });
    obs.push({ gameId, season: 2025, week: 3, teamExternalId: row.away, opponentExternalId: row.home, teamClassification: "fbs", opponentClassification: "fbs", isHome: false, isNeutral: false, offenseValue: row.awayValue, defenseAllowedValue: row.homeValue, weight: 1, actualTeamScore: null, actualOpponentScore: null });
  });
  return obs;
}

describe("computeCfbV2CandidateRatings parity with research computeCandidateTeamRatings (COMPONENT_SIZE finalist, no staleness)", () => {
  it("matches offense/defense ratings exactly for an identical fixture", () => {
    const componentSizeByTeam = new Map([
      ["alpha", 6],
      ["bravo", 6],
      ["charlie", 6],
      ["delta", 6],
      ["echo", 2],
      ["foxtrot", 1],
    ]);
    const priorOffenseByTeam = new Map(TEAMS.map((id, i) => [id, 0.1 * i]));
    const priorDefenseByTeam = new Map(TEAMS.map((id, i) => [id, -0.05 * i]));

    // production lambda: baseLambda * componentSizeRegularizationMultiplier
    const lambdaByTeam = new Map(
      TEAMS.map((id) => [id, CFB_V2_CONNECTIVITY_CONFIG.baseLambda * componentSizeRegularizationMultiplier(componentSizeByTeam.get(id)!)]),
    );

    const metricSet: readonly CfbV2MetricName[] = ["ypp", "ppp"];
    const observationsByMetric = new Map<CfbV2MetricName, readonly CfbV2Observation[]>([
      ["ypp", productionObs(11)],
      ["ppp", productionObs(23)],
    ]);
    const production = computeCfbV2CandidateRatings(TEAMS, metricSet, observationsByMetric, priorOffenseByTeam, priorDefenseByTeam, lambdaByTeam);

    // research equivalent
    const priors = new Map<string, PriorRatings>(
      TEAMS.map((id) => [id, { teamExternalId: id, priorOffense: priorOffenseByTeam.get(id)!, priorDefense: priorDefenseByTeam.get(id)!, offenseTier: "PRIOR_D", defenseTier: "PRIOR_D" }]),
    );
    const graphSnapshot: WeekGraphSnapshot = {
      season: 2025,
      week: 3,
      componentCount: 3,
      byTeam: new Map(
        TEAMS.map((id) => [
          id,
          { teamExternalId: id, componentId: 0, componentSize: componentSizeByTeam.get(id)!, uniqueOpponents: 0, weightedDegree: 0, crossConferenceOpponents: 0 },
        ]),
      ),
    };
    const researchMetricSet: readonly CfbMetricName[] = ["ypp", "ppp"];
    const researchObsByMetric = new Map<CfbMetricName, readonly GameObservation[]>([
      ["ypp", researchObs(11)],
      ["ppp", researchObs(23)],
    ]);
    const researchResult = computeCandidateTeamRatings(TEAMS, researchMetricSet, researchObsByMetric, priors, graphSnapshot, {
      id: "COMPONENT_SIZE_L10",
      label: "test",
      baseLambda: CFB_V2_CONNECTIVITY_CONFIG.baseLambda,
      connectivity: "COMPONENT_SIZE",
      staleness: "NONE",
    });

    for (const teamId of TEAMS) {
      const p = production.get(teamId);
      const r = researchResult.ratings.get(teamId);
      if (r === undefined) {
        expect(p).toBeUndefined();
        continue;
      }
      expect(p).toBeDefined();
      expect(p!.offenseRating).toBeCloseTo(r.offense, 8);
      expect(p!.defenseRating).toBeCloseTo(r.defense, 8);
    }
  });

  it("returns an empty map with zero observations (no current-season evidence)", () => {
    const empty = new Map<CfbV2MetricName, readonly CfbV2Observation[]>([
      ["ypp", []],
      ["ppp", []],
    ]);
    const result = computeCfbV2CandidateRatings(TEAMS, ["ypp", "ppp"], empty, new Map(), new Map(), new Map());
    expect(result.size).toBe(0);
  });
});
