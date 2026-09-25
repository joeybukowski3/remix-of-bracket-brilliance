import { describe, expect, it } from "vitest";
import { mapEpaTeamGameRows, priorSeasonTeamHistory } from "../../../../../../scripts/lib/fantasy-team-history";
import { buildProductionProjectionArtifact, type ProductionProjectionCandidate } from "./generator";
import { buildTrainingRow, type HistoricalTeamGameRow } from "../build";
import { buildWeeklyFantasyProjectionDeploymentBundle } from "../model/deploymentFit";
import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";

const PROVENANCE = [{ source: "test", sourceVersion: "v1", sourceHash: "h", inputAsOf: "2026-08-01T00:00:00.000Z" }];
const game = (season: number, week: number, team: string, rushEpa: number, plays: number): HistoricalTeamGameRow =>
  ({ season, week, team, opponent: "hou", offEpa: 1, offPlays: plays, passEpa: 1, passPlays: 30, rushEpa, rushPlays: 20 });

function rbHistory(): HistoricalPlayerWeek {
  return {
    season: 2026, week: 1, playerId: "gsis:rb-1", playerName: "RB One", position: "RB", team: "buf", opponent: "hou",
    externalIds: { gsisId: "rb-1", pfrId: null, sleeperId: null, espnId: null }, actualFantasyPoints: 12,
    stats: { passAttempts: 0, completions: 0, passingYards: 0, passingTouchdowns: 0, interceptions: 0, rushAttempts: 15, rushingYards: 70, rushingTouchdowns: 1, receptions: 3, targets: 4, receivingYards: 20, receivingTouchdowns: 0, sackFumblesLost: 0, rushingFumblesLost: 0, receivingFumblesLost: 0, fumblesLost: 0, passingTwoPointConversions: 0, rushingTwoPointConversions: 0, receivingTwoPointConversions: 0, specialTeamsTouchdowns: 0 },
    usage: { targetShare: 0.18, receivingAirYards: 30, airYardsShare: 0.12 } as never,
    provenance: { source: "nflverse stats_player weekly", sourceSeason: 2026, sourceWeek: 1, scoringVersion: "jkb-full-ppr-v1.0.0", snapSource: null },
  };
}

function bundleFromTrainingRows() {
  // RB training rows WITH varied team features (as the real training dataset has) so the ridge assigns weight to them.
  const base = {
    schemaVersion: "weekly-fantasy-projection-training-row-v2" as const, playerId: "gsis:t", playerName: "T", position: "RB" as const, team: "buf", opponent: "mia",
    homeAway: "home" as const, kickoff: null, historicalUniverseEligible: true, projectionCandidate: true, hasPriorSeason: true, rookieOrNoPriorHistory: false,
    priorSeasonPpg: 10, priorSeasonGames: 16, priorSeasonAttempts: null, priorSeasonCarries: 15, priorSeasonTargets: 3, priorSeasonReceptions: 2, priorSeasonSnapRate: null,
    gamesPlayedPrior: 3, weeksSinceLastAppearance: 1, seasonPpgPrior: 12, last3PpgPrior: 12, last5PpgPrior: 12, teamChangedFromPriorSeason: false,
    passAttemptsSeasonPrior: null, passAttemptsLast3: null, passingYardsSeasonPrior: null, passingTdsSeasonPrior: null, interceptionsSeasonPrior: null,
    carriesSeasonPrior: 15, rushingYardsSeasonPrior: 65, rushingTdsSeasonPrior: 0.5, carriesLast3: 15, targetsSeasonPrior: 3, targetsLast3: 3, receptionsSeasonPrior: 2,
    rushYardsSeasonPrior: 65, receivingYardsSeasonPrior: 15, targetShareSeasonPrior: 0.1, receivingAirYardsSeasonPrior: 20, airYardsShareSeasonPrior: 0.08,
    snapShareSeasonPrior: 0.6, snapShareLast3: 0.6, snapCoverageAvailable: true, teamOffensiveEpaPrior: 0.02, teamPassEpaPrior: 0.05, teamPassRatePrior: 0.58,
    opponentDefensiveEpaPrior: -0.01, opponentPassDefenseEpaPrior: -0.02, opponentRushDefenseEpaPrior: 0, opponentPositionFpaPrior: 20, opponentPositionFpaGamesPrior: 3,
    opponentPositionFpaPriorSeason: 19, shortWeek: false, byeReturn: false, restDays: 7, starterStatus: "unknown" as const,
    provenance: { generatedAt: "2026-01-01T00:00:00.000Z", sourceManifests: [], scheduleSource: { url: "", retrievedAtUtc: "", sha256: "" } },
  };
  const rows = [2023, 2024, 2025].flatMap((season, i) => [0, 1, 2, 3].map((j) => ({
    ...base, season, week: 5 + j, playerId: `gsis:t${i}${j}`,
    actualFantasyPoints: 8 + j * 3 + i, teamRushEpaPrior: -0.1 + 0.08 * j, teamOffensivePlaysPrior: 58 + 3 * j,
  })));
  return buildWeeklyFantasyProjectionDeploymentBundle(rows, { generatedAt: "2026-08-01T00:00:00.000Z", inputFingerprint: "fp" });
}

const candidates: ProductionProjectionCandidate[] = [
  { playerId: "gsis:qb-1", playerName: "QB", position: "QB", team: "buf", opponent: "hou", homeAway: "home", rosProjectedPpg: 20 },
  { playerId: "gsis:rb-1", playerName: "RB", position: "RB", team: "buf", opponent: "hou", homeAway: "home", rosProjectedPpg: 15 },
  { playerId: "gsis:wr-1", playerName: "WR", position: "WR", team: "buf", opponent: "hou", homeAway: "home", rosProjectedPpg: 12 },
  { playerId: "gsis:te-1", playerName: "TE", position: "TE", team: "buf", opponent: "hou", homeAway: "home", rosProjectedPpg: 8 },
];
const run = (teamHistory?: HistoricalTeamGameRow[]) => buildProductionProjectionArtifact({
  season: 2026, week: 2, generatedAt: "2026-09-08T00:00:00.000Z", inputAsOf: "2026-09-08T00:00:00.000Z",
  candidates, history: [rbHistory()], deploymentBundle: bundleFromTrainingRows(), provenance: PROVENANCE, ...(teamHistory ? { teamHistory } : {}),
});

describe("RB team-history repair", () => {
  it("maps epa-team-game rows exactly like the training dataset generator (same fields, canonical team abbreviations)", () => {
    const [row] = mapEpaTeamGameRows([{ game_id: "g", season: "2026", week: "1", team: "BUF", opponent: "HOU", off_epa: "1.5", off_plays: "60", pass_epa: "2", pass_plays: "35", rush_epa: "-0.5", rush_plays: "25" }]);
    expect(row).toEqual({ season: 2026, week: 1, team: "buf", opponent: "hou", offEpa: 1.5, offPlays: 60, passEpa: 2, passPlays: 35, rushEpa: -0.5, rushPlays: 25 });
    expect(() => mapEpaTeamGameRows([{ game_id: "g", season: "2026", week: "1", team: "BUF", opponent: "HOU", off_epa: "x", off_plays: "60", pass_epa: "2", pass_plays: "35", rush_epa: "0", rush_plays: "25" }])).toThrow();
  });
  it("selects strictly prior current-season rows and fails closed for week > 1 with no history", () => {
    const rows = [game(2025, 18, "buf", 5, 70), game(2026, 1, "buf", 1, 60), game(2026, 2, "buf", 9, 99), game(2026, 3, "buf", 9, 99)];
    const prior = priorSeasonTeamHistory(rows, 2026, 3);
    expect(prior.rows.map((r) => r.week)).toEqual([1, 2]);
    expect(prior.latestWeek).toBe(2);
    expect(() => priorSeasonTeamHistory([game(2025, 18, "buf", 5, 70)], 2026, 2)).toThrow(/refusing to generate RB/);
    expect(priorSeasonTeamHistory([], 2026, 1)).toEqual({ rows: [], latestWeek: null });
  });
  it("training and inference derive the SAME RB features from the same rows (and ignore target/later weeks)", () => {
    const rows = [game(2026, 1, "buf", 2.5, 61)];
    const target = { season: 2026, week: 2, playerId: "gsis:rb-1", playerName: "RB", position: "RB" as const, team: "buf", opponent: "hou", eligible: true };
    const withFuture = [...rows, game(2026, 2, "buf", 99, 200), game(2026, 5, "buf", 99, 200)];
    const a = buildTrainingRow(target, [rbHistory()], rows, [], () => null, "t");
    const b = buildTrainingRow(target, [rbHistory()], withFuture, [], () => null, "t");
    expect(a.teamRushEpaPrior).toBeCloseTo(2.5 / 20, 12);
    expect(a.teamOffensivePlaysPrior).toBe(61);
    expect(b.teamRushEpaPrior).toBe(a.teamRushEpaPrior);
    expect(b.teamOffensivePlaysPrior).toBe(a.teamOffensivePlaysPrior);
  });
  it("supplying team history changes ONLY the RB projection; QB/WR/TE are identical", () => {
    const without = run();
    const restored = run([game(2026, 1, "buf", 6, 75)]);
    expect(restored.rows.RB[0].projectedFantasyPoints).not.toBeCloseTo(without.rows.RB[0].projectedFantasyPoints, 6);
    expect(restored.rows.RB[0].components.teamContextAdjustment).not.toBeCloseTo(without.rows.RB[0].components.teamContextAdjustment, 6);
    for (const pos of ["QB", "WR", "TE"] as const) expect(JSON.stringify(restored.rows[pos])).toBe(JSON.stringify(without.rows[pos]));
    const sum = (r: typeof restored.rows.RB[0]) => r.components.baseline + r.components.usageAdjustment + r.components.teamContextAdjustment + r.components.opponentAdjustment + r.components.otherAdjustment + r.components.scoringEnvironmentAdjustment + r.components.opponentFpaAdjustment;
    expect(sum(restored.rows.RB[0])).toBeCloseTo(restored.rows.RB[0].projectedFantasyPoints, 6);
  });
});
