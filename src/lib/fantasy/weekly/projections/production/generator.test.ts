import { describe, expect, it } from "vitest";
import { buildProductionProjectionArtifact, type ProductionProjectionCandidate } from "./generator";
import { buildWeeklyFantasyProjectionDeploymentBundle } from "../model/deploymentFit";
import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";

const PROVENANCE = [{ source: "test", sourceVersion: "test-v1", sourceHash: "abc123", inputAsOf: "2026-08-01T00:00:00.000Z" }];

function historyRow(overrides: Partial<HistoricalPlayerWeek> & { playerId: string; season: number; week: number; position: HistoricalPlayerWeek["position"] }): HistoricalPlayerWeek {
  return {
    playerName: "Test Player", team: "buf", opponent: "hou",
    externalIds: { gsisId: overrides.playerId.replace("gsis:", ""), pfrId: null, sleeperId: null, espnId: null },
    actualFantasyPoints: 12,
    stats: {
      passAttempts: 0, completions: 0, passingYards: 0, passingTouchdowns: 0, interceptions: 0,
      rushAttempts: 15, rushingYards: 70, rushingTouchdowns: 1, receptions: 3, targets: 4,
      receivingYards: 20, receivingTouchdowns: 0, sackFumblesLost: 0, rushingFumblesLost: 0,
      receivingFumblesLost: 0, fumblesLost: 0, passingTwoPointConversions: 0, rushingTwoPointConversions: 0,
      receivingTwoPointConversions: 0, specialTeamsTouchdowns: 0,
    },
    usage: { targetShare: 0.18, receivingAirYards: 30, airYardsShare: 0.12 },
    provenance: { source: "nflverse stats_player weekly", sourceSeason: overrides.season, sourceWeek: overrides.week, scoringVersion: "jkb-full-ppr-v1.0.0", snapSource: null },
    ...overrides,
  };
}

// A minimal, well-formed 2023-2025 training set: one RB row per season is
// enough for fitPositionDeploymentBundle to produce a usable (if degenerate)
// bundle for this test's purposes.
function trainingRows() {
  const base = {
    schemaVersion: "weekly-fantasy-projection-training-row-v2" as const,
    playerId: "gsis:train-1", playerName: "Train Runner", position: "RB" as const, team: "buf", opponent: "mia",
    homeAway: "home" as const, kickoff: null, historicalUniverseEligible: true, projectionCandidate: true,
    actualFantasyPoints: 14, hasPriorSeason: true, rookieOrNoPriorHistory: false, priorSeasonPpg: 10,
    priorSeasonGames: 16, priorSeasonAttempts: null, priorSeasonCarries: 15, priorSeasonTargets: 3,
    priorSeasonReceptions: 2, priorSeasonSnapRate: null, gamesPlayedPrior: 3, weeksSinceLastAppearance: 1,
    seasonPpgPrior: 12, last3PpgPrior: 12, last5PpgPrior: 12, teamChangedFromPriorSeason: false,
    passAttemptsSeasonPrior: null, passAttemptsLast3: null, passingYardsSeasonPrior: null, passingTdsSeasonPrior: null,
    interceptionsSeasonPrior: null, carriesSeasonPrior: 15, rushingYardsSeasonPrior: 65, rushingTdsSeasonPrior: 0.5,
    carriesLast3: 15, targetsSeasonPrior: 3, targetsLast3: 3, receptionsSeasonPrior: 2, rushYardsSeasonPrior: 65,
    receivingYardsSeasonPrior: 15, targetShareSeasonPrior: 0.1, receivingAirYardsSeasonPrior: 20, airYardsShareSeasonPrior: 0.08,
    snapShareSeasonPrior: 0.6, snapShareLast3: 0.6, snapCoverageAvailable: true,
    teamOffensiveEpaPrior: 0.02, teamPassEpaPrior: 0.05, teamRushEpaPrior: 0.01, teamOffensivePlaysPrior: 64, teamPassRatePrior: 0.58,
    opponentDefensiveEpaPrior: -0.01, opponentPassDefenseEpaPrior: -0.02, opponentRushDefenseEpaPrior: 0.0,
    opponentPositionFpaPrior: 20, opponentPositionFpaGamesPrior: 3, opponentPositionFpaPriorSeason: 19,
    shortWeek: false, byeReturn: false, restDays: 7, starterStatus: "unknown" as const,
    provenance: { generatedAt: "2026-01-01T00:00:00.000Z", sourceManifests: [], scheduleSource: { url: "", retrievedAtUtc: "", sha256: "" } },
  };
  return [2023, 2024, 2025].flatMap((season) => [{ ...base, season, week: 5 }]);
}

function bundle() {
  return buildWeeklyFantasyProjectionDeploymentBundle(trainingRows(), { generatedAt: "2026-08-01T00:00:00.000Z", inputFingerprint: "fp" });
}

describe("buildProductionProjectionArtifact", () => {
  it("Week 1: all positions equal baseline (no current-season history exists yet)", () => {
    const candidates: ProductionProjectionCandidate[] = [
      { playerId: "gsis:qb-1", playerName: "QB One", position: "QB", team: "buf", opponent: "hou", homeAway: "home", rosProjectedPpg: 20 },
      { playerId: "gsis:rb-1", playerName: "RB One", position: "RB", team: "buf", opponent: "hou", homeAway: "home", rosProjectedPpg: 15 },
      { playerId: "gsis:wr-1", playerName: "WR One", position: "WR", team: "buf", opponent: "hou", homeAway: "home", rosProjectedPpg: 12 },
      { playerId: "gsis:te-1", playerName: "TE One", position: "TE", team: "buf", opponent: "hou", homeAway: "home", rosProjectedPpg: 8 },
    ];
    const artifact = buildProductionProjectionArtifact({
      season: 2026, week: 1, generatedAt: "2026-09-01T00:00:00.000Z", inputAsOf: "2026-09-01T00:00:00.000Z",
      candidates, history: [], deploymentBundle: bundle(), provenance: PROVENANCE,
    });
    for (const position of ["QB", "RB", "WR", "TE"] as const) {
      for (const row of artifact.rows[position]) {
        expect(row.projectedFantasyPoints).toBe(row.baselineFantasyPoints);
        expect(row.residualActivated).toBe(false);
      }
    }
    expect(artifact.status).toBe("production");
  });

  it("QB never activates a residual, even with current-season history present", () => {
    const history: HistoricalPlayerWeek[] = [historyRow({ playerId: "gsis:qb-1", position: "QB", season: 2026, week: 1 })];
    const candidates: ProductionProjectionCandidate[] = [
      { playerId: "gsis:qb-1", playerName: "QB One", position: "QB", team: "buf", opponent: "hou", homeAway: "home", rosProjectedPpg: 20 },
    ];
    const artifact = buildProductionProjectionArtifact({
      season: 2026, week: 2, generatedAt: "2026-09-08T00:00:00.000Z", inputAsOf: "2026-09-08T00:00:00.000Z",
      candidates, history, deploymentBundle: bundle(), provenance: PROVENANCE,
    });
    const row = artifact.rows.QB[0];
    expect(row.modelAuthority.state).toBe("BASELINE_ONLY");
    expect(row.residualActivated).toBe(false);
    expect(row.residualActivationReason).toBe("model-state-baseline-only");
    expect(row.components.usageAdjustment).toBe(0);
  });

  it("synthetic Week 2: RB residual activates once a selected current-season feature is observed", () => {
    const history: HistoricalPlayerWeek[] = [historyRow({ playerId: "gsis:rb-1", position: "RB", season: 2026, week: 1 })];
    const candidates: ProductionProjectionCandidate[] = [
      { playerId: "gsis:rb-1", playerName: "RB One", position: "RB", team: "buf", opponent: "hou", homeAway: "home", rosProjectedPpg: 15 },
    ];
    const artifact = buildProductionProjectionArtifact({
      season: 2026, week: 2, generatedAt: "2026-09-08T00:00:00.000Z", inputAsOf: "2026-09-08T00:00:00.000Z",
      candidates, history, deploymentBundle: bundle(), provenance: PROVENANCE,
    });
    const row = artifact.rows.RB[0];
    expect(row.residualActivated).toBe(true);
    expect(row.residualActivationReason).toBe("selected-current-season-feature-observed");
    expect(row.modelAuthority.state).toBe("READY_FOR_2026_SHADOW");
    // Component reconciliation: baseline + usage + teamContext + opponent + other === projected.
    const sum = row.components.baseline + row.components.usageAdjustment + row.components.teamContextAdjustment
      + row.components.opponentAdjustment + row.components.otherAdjustment;
    expect(sum).toBeCloseTo(row.projectedFantasyPoints, 6);
  });

  it("rejects duplicate GSIS ids across the candidate universe", () => {
    const candidates: ProductionProjectionCandidate[] = [
      { playerId: "gsis:dup-1", playerName: "A", position: "WR", team: "buf", opponent: "hou", homeAway: "home", rosProjectedPpg: 10 },
      { playerId: "gsis:dup-1", playerName: "A duplicate", position: "WR", team: "mia", opponent: "nyj", homeAway: "away", rosProjectedPpg: 9 },
    ];
    expect(() => buildProductionProjectionArtifact({
      season: 2026, week: 1, generatedAt: "2026-09-01T00:00:00.000Z", inputAsOf: "2026-09-01T00:00:00.000Z",
      candidates, history: [], deploymentBundle: bundle(), provenance: PROVENANCE,
    })).toThrow(/Duplicate GSIS/);
  });

  it("rejects an unsupported position", () => {
    const candidates = [
      { playerId: "gsis:k-1", playerName: "Kicker", position: "K" as never, team: "buf", opponent: "hou", homeAway: "home" as const, rosProjectedPpg: 8 },
    ];
    expect(() => buildProductionProjectionArtifact({
      season: 2026, week: 1, generatedAt: "2026-09-01T00:00:00.000Z", inputAsOf: "2026-09-01T00:00:00.000Z",
      candidates, history: [], deploymentBundle: bundle(), provenance: PROVENANCE,
    })).toThrow(/Unsupported position/);
  });

  it("rejects history that reaches the target week or later (leakage guard)", () => {
    const history: HistoricalPlayerWeek[] = [historyRow({ playerId: "gsis:rb-1", position: "RB", season: 2026, week: 2 })];
    const candidates: ProductionProjectionCandidate[] = [
      { playerId: "gsis:rb-1", playerName: "RB One", position: "RB", team: "buf", opponent: "hou", homeAway: "home", rosProjectedPpg: 15 },
    ];
    expect(() => buildProductionProjectionArtifact({
      season: 2026, week: 2, generatedAt: "2026-09-08T00:00:00.000Z", inputAsOf: "2026-09-08T00:00:00.000Z",
      candidates, history, deploymentBundle: bundle(), provenance: PROVENANCE,
    })).toThrow(/not strictly before/);
  });

  it("produces strictly ascending positionRank matching descending projectedFantasyPoints order", () => {
    const candidates: ProductionProjectionCandidate[] = [
      { playerId: "gsis:wr-a", playerName: "WR A", position: "WR", team: "buf", opponent: "hou", homeAway: "home", rosProjectedPpg: 8 },
      { playerId: "gsis:wr-b", playerName: "WR B", position: "WR", team: "mia", opponent: "nyj", homeAway: "away", rosProjectedPpg: 18 },
      { playerId: "gsis:wr-c", playerName: "WR C", position: "WR", team: "kc", opponent: "den", homeAway: "home", rosProjectedPpg: 12 },
    ];
    const artifact = buildProductionProjectionArtifact({
      season: 2026, week: 1, generatedAt: "2026-09-01T00:00:00.000Z", inputAsOf: "2026-09-01T00:00:00.000Z",
      candidates, history: [], deploymentBundle: bundle(), provenance: PROVENANCE,
    });
    expect(artifact.rows.WR.map((r) => r.positionRank)).toEqual([1, 2, 3]);
    expect(artifact.rows.WR.map((r) => r.playerId)).toEqual(["gsis:wr-b", "gsis:wr-c", "gsis:wr-a"]);
  });
});
