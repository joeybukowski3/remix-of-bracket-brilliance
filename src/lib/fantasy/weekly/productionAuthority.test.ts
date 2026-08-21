import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { FantasyAvailability } from "./availability";
import {
  buildWeeklyFantasyRankingArtifact,
  assertProductionHistoryCutoff,
  compareWeeklyBaselineRank,
  type ProductionRankingCandidate,
} from "./productionAuthority";

const hash = "a".repeat(64);
const generatedAt = "2026-08-21T16:00:00.000Z";
const source = (rank: number, ppg: number, name = "2026-par-consensus") => ({
  rank, projectedPpg: ppg, source: name, sourceVersion: "v1", sourceHash: hash,
  inputAsOf: "2026-08-20T00:00:00.000Z",
});
const availability = (status: FantasyAvailability["status"] = "active", isStale = false): FantasyAvailability => ({
  status, practiceStatus: null, sourceSeason: 2026, sourceWeek: 1,
  sourceAsOf: "2026-08-20T00:00:00.000Z", isStale, staleReasons: isStale ? ["source-week-mismatch"] : [],
});
const candidate = (overrides: Partial<ProductionRankingCandidate> = {}): ProductionRankingCandidate => ({
  playerKey: "pfr:TestPl00",
  identity: { resolved: true, playerId: "gsis:00-1", playerName: "Test Player", position: "WR" },
  team: "buf", opponent: "mia", homeAway: "home", availability: availability(),
  historyGames: 0, preseasonRos: source(1, 20), currentSeason: null, historicalFallback: null,
  context: { matchupGrade: "Great", fpaRank: 1, fantasyPointsAllowed: 30, marketTotal: 50, impliedTeamTotal: 28, teamEnvironment: { offensiveEpa: 0.2 } },
  previousRank: null, previousAuthority: null,
  ...overrides,
});
const build = (candidates: ProductionRankingCandidate[]) => buildWeeklyFantasyRankingArtifact({
  season: 2026, week: 1, generatedAt, inputAsOf: "2026-08-20T00:00:00.000Z", candidates,
  provenance: [{ source: "test", sourceVersion: "v1", sourceHash: hash, inputAsOf: "2026-08-20T00:00:00.000Z" }],
});

describe("production weekly fantasy authority", () => {
  it.each([0, 1])("uses ROS authority with %i prior games", (historyGames) => {
    const row = build([candidate({ historyGames })]).rankings.WR[0];
    expect(row).toMatchObject({ baselineAuthority: "preseason-ros", baselineValue: 20, currentSeasonPpg: null, confidence: "medium" });
    expect(row.reasons).toEqual(expect.arrayContaining(["PRESEASON_ROS_BASELINE", "INSUFFICIENT_HISTORY"]));
  });

  it.each([2, 3])("uses prior-game-only current-season PPG with %i prior games", (historyGames) => {
    const row = build([candidate({ historyGames, currentSeason: source(4, 18, "current-season-through-previous-game") })]).rankings.WR[0];
    expect(row).toMatchObject({ baselineAuthority: "current-season", baselineValue: 18, currentSeasonPpg: 18, confidence: "high" });
    expect(row.reasons).toContain("CURRENT_SEASON_BASELINE");
    expect(row.diagnostics.transitionFlag).toBe(historyGames === 2);
  });

  it("covers rookies without a prior-year row from ROS", () => {
    expect(build([candidate({ historicalFallback: null })]).rankings.WR).toHaveLength(1);
  });

  it("preserves history through a team change", () => {
    const row = build([candidate({ team: "kc", opponent: "den", historyGames: 2, currentSeason: source(5, 17, "current") })]).rankings.WR[0];
    expect(row.baselineAuthority).toBe("current-season");
  });

  it("counts games played rather than NFL weeks after missed games", () => {
    const row = build([candidate({ historyGames: 1, currentSeason: source(5, 17, "current") })]).rankings.WR[0];
    expect(row.baselineAuthority).toBe("preseason-ros");
  });

  it.each([
    ["bye", "active", "BYE"], ["home", "out", "OUT"], ["home", "reserve", "RESERVE"],
  ] as const)("excludes %s/%s", (homeAway, status, reason) => {
    const artifact = build([candidate({ homeAway, opponent: homeAway === "bye" ? null : "mia", availability: availability(status) })]);
    expect(artifact.rankings.WR).toHaveLength(0);
    expect(artifact.diagnostics.excluded[0].reasons).toContain(reason);
  });

  it.each(["questionable", "doubtful"] as const)("keeps %s players provisionally eligible", (status) => {
    expect(build([candidate({ availability: availability(status) })]).rankings.WR[0].availability).toBe(status);
  });

  it("lowers confidence without changing score for stale or unknown availability", () => {
    const stale = build([candidate({ availability: availability("unknown", true) })]).rankings.WR[0];
    expect(stale).toMatchObject({ baselineValue: 20, confidence: "low" });
    expect(stale.reasons).toEqual(expect.arrayContaining(["AVAILABILITY_STALE", "AVAILABILITY_UNKNOWN"]));
  });

  it("falls back to ROS when qualified current-season authority is missing", () => {
    const row = build([candidate({ historyGames: 2, currentSeason: null })]).rankings.WR[0];
    expect(row).toMatchObject({ baselineAuthority: "preseason-ros", confidence: "low" });
    expect(row.reasons).toContain("SOURCE_FALLBACK");
  });

  it("does not rank when no supported authority exists", () => {
    const artifact = build([candidate({ preseasonRos: null, historicalFallback: null })]);
    expect(artifact.rankings.WR).toHaveLength(0);
    expect(artifact.diagnostics.excludedRows).toBe(1);
  });

  it("assigns deterministic ties by player ID without hidden context", () => {
    const rows = build([
      candidate({ identity: { resolved: true, playerId: "gsis:b", playerName: "B", position: "WR" }, preseasonRos: source(2, 20) }),
      candidate({ identity: { resolved: true, playerId: "gsis:a", playerName: "A", position: "WR" }, preseasonRos: source(1, 20) }),
    ]).rankings.WR;
    expect(rows.map((row) => [row.playerId, row.positionRank])).toEqual([["gsis:a", 1], ["gsis:b", 2]]);
  });

  it("does not allow matchup, FPA, market, or team context to influence rank", () => {
    const lower = candidate({ identity: { resolved: true, playerId: "gsis:lower", playerName: "Lower", position: "WR" }, preseasonRos: source(2, 19), context: { matchupGrade: "Great", fpaRank: 1, fantasyPointsAllowed: 40, marketTotal: 60, impliedTeamTotal: 35, teamEnvironment: { epa: 1 } } });
    const higher = candidate({ identity: { resolved: true, playerId: "gsis:higher", playerName: "Higher", position: "WR" }, preseasonRos: source(1, 20), context: { matchupGrade: "Very Tough", fpaRank: 32, fantasyPointsAllowed: 5, marketTotal: 30, impliedTeamTotal: 10, teamEnvironment: { epa: -1 } } });
    expect(build([lower, higher]).rankings.WR.map((row) => row.playerId)).toEqual(["gsis:higher", "gsis:lower"]);
  });

  it("emits transition and rank-movement diagnostics without modifying value", () => {
    const row = build([candidate({ historyGames: 2, currentSeason: source(1, 18, "current"), previousAuthority: "preseason-ros", previousRank: 4 })]).rankings.WR[0];
    expect(row.diagnostics).toEqual({ sourceAuthorityChangedThisWeek: true, previousRank: 4, absoluteRankMovement: 3, transitionFlag: true });
    expect(row.baselineValue).toBe(18);
  });

  it("uses the documented standalone comparator", () => {
    const rows = [
      { baselineValue: 10, preseasonProjectedPpg: 9, preseasonRosRank: 2, playerId: "b" },
      { baselineValue: 10, preseasonProjectedPpg: 10, preseasonRosRank: 1, playerId: "a" },
    ].sort(compareWeeklyBaselineRank);
    expect(rows[0].playerId).toBe("a");
  });

  it("contains no experimental or fixed-FPA ranking imports", () => {
    const sourceText = readFileSync(join(process.cwd(), "src/lib/fantasy/weekly/productionAuthority.ts"), "utf8");
    expect(sourceText).not.toMatch(/phaseC|scoreRidgeModel|baseline-usage|matchupAdjustment|getMatchupMultiplier/);
  });

  it("rejects target-week and future-week history", () => {
    expect(() => assertProductionHistoryCutoff([{ season: 2026, week: 2 }], { season: 2026, week: 2 })).toThrow(/target-week/);
    expect(() => assertProductionHistoryCutoff([{ season: 2026, week: 1 }], { season: 2026, week: 2 })).not.toThrow();
  });
});
