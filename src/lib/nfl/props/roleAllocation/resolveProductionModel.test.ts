import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveReceivingV2ProductionModel } from "./resolveProductionModel";
import { allocateReceivingTargetsForTeam, type NflReceivingAllocationCandidate } from "./receivingProduction";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..", "..");
const ARTIFACT_PATH = join(ROOT, "data", "nfl", "models", "receiving-role-allocation-v2.json");

function readArtifactFixture(): unknown {
  return JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));
}

function cand(playerId: string, depthRank: number): NflReceivingAllocationCandidate {
  return {
    playerId, playerName: playerId, position: "WR", depthRank, roleSourced: true,
    priorTargetShare: 0.2, priorGamesPlayed: 8, noHistory: false, limitedHistory: false,
    teamChanged: false, rosterCompetitionCount: 5, concentration: 0.3, v1YardsPerTarget: 8, v1ProjectedTargets: 5,
  };
}

/**
 * WU4C.2 fresh-run regression: mimics the exact hosted-runner condition that
 * broke production (see the packaging bug this module fixes) -- the
 * gitignored player-level research dataset is NEVER read here, only the
 * compact committed artifact this repo ships at
 * data/nfl/models/receiving-role-allocation-v2.json.
 */
describe("resolveReceivingV2ProductionModel -- fresh-run (no research dataset)", () => {
  it("loads receiving v2 from the real committed artifact + WU4A rows, and allocates without touching the research dataset", () => {
    const artifactJson = readArtifactFixture();
    const teamOpportunityRows = [
      { team: "kc", week: 1, projectedPassAttempts: 38 },
      { team: "buf", week: 1, projectedPassAttempts: 34 },
    ];
    const resolution = resolveReceivingV2ProductionModel({ artifactJson, teamOpportunityRows, week: 1 });

    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.teamOpportunityDropbacksByTeam.size).toBe(2);

    const alloc = allocateReceivingTargetsForTeam({
      team: "kc", gameId: "2026_01_KC_X", season: 2026, week: 1, kickoffUtc: "2026-09-13T17:00:00.000Z",
      projectedDropbacks: 38,
      candidates: [cand("wr1", 1), cand("wr2", 2), cand("wr3", 3)],
      model: resolution.model,
    });
    expect(alloc.usedV1Fallback).toBe(false);
    expect(alloc.coherenceOk).toBe(true);
    expect(alloc.allocatedTargets).toBeCloseTo(alloc.projectedTargetablePool!, 6);
  });

  it("resolves ok=false when the artifact JSON is missing (hosted-runner-before-fix condition)", () => {
    const resolution = resolveReceivingV2ProductionModel({ artifactJson: null, teamOpportunityRows: [{ team: "kc", week: 1, projectedPassAttempts: 38 }], week: 1 });
    expect(resolution.ok).toBe(false);
  });

  it("resolves ok=false when the artifact is malformed (fails closed)", () => {
    const resolution = resolveReceivingV2ProductionModel({ artifactJson: { schemaVersion: "wrong" }, teamOpportunityRows: [{ team: "kc", week: 1, projectedPassAttempts: 38 }], week: 1 });
    expect(resolution.ok).toBe(false);
  });

  it("resolves ok=false when the artifact's contentHash doesn't match (tampered/corrupted, fails closed)", () => {
    const artifactJson = readArtifactFixture() as { leagueYardsPerTarget: number };
    const tampered = { ...artifactJson, leagueYardsPerTarget: artifactJson.leagueYardsPerTarget + 1 };
    const resolution = resolveReceivingV2ProductionModel({ artifactJson: tampered, teamOpportunityRows: [{ team: "kc", week: 1, projectedPassAttempts: 38 }], week: 1 });
    expect(resolution.ok).toBe(false);
    if (!resolution.ok) expect(resolution.reason).toMatch(/hash mismatch/);
  });

  it("resolves ok=false when WU4A has no rows for the target week", () => {
    const resolution = resolveReceivingV2ProductionModel({ artifactJson: readArtifactFixture(), teamOpportunityRows: [{ team: "kc", week: 2, projectedPassAttempts: 38 }], week: 1 });
    expect(resolution.ok).toBe(false);
    if (!resolution.ok) expect(resolution.reason).toMatch(/week-1/);
  });
});
