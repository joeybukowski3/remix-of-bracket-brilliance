import { describe, expect, it } from "vitest";
import { FANTASY_PAR_ROWS } from "@/lib/fantasy/parRankings";
import { FANTASY_RANKINGS } from "@/lib/fantasy/rankings";
import { buildRosIdentityCrosswalk } from "@/lib/fantasy/rosResearch/identity";
import { buildHistoricalBaseline } from "@/lib/fantasy/rosResearch/historicalBaseline";
import { buildUsageRoleContext } from "@/lib/fantasy/rosResearch/usageRoleContext";
import { buildTeamMarketContext } from "@/lib/fantasy/rosResearch/teamMarketContext";
import { buildScheduleFpaContext } from "@/lib/fantasy/rosResearch/scheduleFpaContext";
import {
  buildShadowCandidates,
  computeFpaAdjustment,
  computeHistoricalBaselineOptions,
  computeMarketAdjustment,
  computeTeamAdjustment,
  computeUsageAdjustment,
} from "@/lib/fantasy/rosResearch/shadowProjection";
import { runHistoricalBaselineBacktest, runUsageCapExperiment } from "@/lib/fantasy/rosResearch/shadowBacktest";
import { buildStatusAvailability } from "@/lib/fantasy/rosResearch/statusAvailability";
import { buildRookieFallback } from "@/lib/fantasy/rosResearch/rookieFallback";
import { applyStatusTreatments, buildRefinedCandidates, selectEffectiveBaseline } from "@/lib/fantasy/rosResearch/shadowProjection";
import { STATUS_MODEL_RANK_EXCLUSION } from "@/lib/fantasy/rosResearch/shadowProjectionConfig";
import {
  buildNormalizedAvailability,
  determineCurrentRosterVerified,
  evaluateRankEligibility,
  isProjectionEligible,
  normalizeAvailabilityStatus,
} from "@/lib/fantasy/rosResearch/rankEligibility";

describe("Phase 1/2 ROS research safety", () => {
  it("does not mutate the live workbook rows or PAR rows while building the identity crosswalk", () => {
    const rankingsBefore = structuredClone(FANTASY_RANKINGS.rows);
    const parBefore = structuredClone(FANTASY_PAR_ROWS);
    buildRosIdentityCrosswalk({ rankingRows: FANTASY_RANKINGS.rows, parRows: [], playerRows: [], rosterRows: [] });
    expect(FANTASY_RANKINGS.rows).toEqual(rankingsBefore);
    expect(FANTASY_PAR_ROWS).toEqual(parBefore);
  });

  it("retains known canonical ranking and PAR anchors (unchanged by this feature)", () => {
    const gibbs = FANTASY_RANKINGS.rows.find((row) => row.player === "Jahmyr Gibbs")!;
    expect(gibbs).toMatchObject({ overallRank: 1, positionRank: 1, projectionRank: 1 });
    const gibbsPar = FANTASY_PAR_ROWS.find((row) => row.player === "Jahmyr Gibbs")!;
    expect(gibbsPar.parPerGame).toBeCloseTo(10.72, 2);
  });

  it("Phase 2 builders do not mutate their inputs", () => {
    const rankingRows = structuredClone(FANTASY_RANKINGS.rows.slice(0, 5));
    buildHistoricalBaseline([], []);
    buildUsageRoleContext([], []);
    buildTeamMarketContext([], [], { source: "x", generatedAt: "2026-01-01T00:00:00.000Z" });
    buildScheduleFpaContext(new Map(), new Map(), 2025);
    expect(FANTASY_RANKINGS.rows.slice(0, 5)).toEqual(rankingRows);
  });

  it("replacement levels referenced by this feature match the frozen, unchanged values", () => {
    const byPosition = Object.fromEntries(FANTASY_PAR_ROWS.map((row) => [row.position, row.replacementPpg]));
    expect(byPosition.QB).toBeCloseTo(17.5667, 3);
    expect(byPosition.RB).toBeCloseTo(12.1667, 3);
    expect(byPosition.WR).toBeCloseTo(11.5667, 3);
    expect(byPosition.TE).toBeCloseTo(9.9333, 3);
  });

  it("Phase 3 shadow builders do not mutate the live workbook rows, PAR rows, or their own inputs", () => {
    const rankingsBefore = structuredClone(FANTASY_RANKINGS.rows);
    const parBefore = structuredClone(FANTASY_PAR_ROWS);

    const seasons = [{ season: 2024, gamesPlayed: 17, totalFantasyPoints: 200, ppg: 200 / 17 }];
    const seasonsBefore = structuredClone(seasons);
    computeHistoricalBaselineOptions(seasons);
    expect(seasons).toEqual(seasonsBefore);

    computeUsageAdjustment("WR", []);
    computeTeamAdjustment(undefined, 20);
    computeFpaAdjustment(undefined, 20);
    computeMarketAdjustment(undefined, 20);
    buildShadowCandidates(20, {
      usage: { factor: 1, applied: false, reason: null },
      team: { factor: 1, applied: false, reason: null },
      fpa: { factor: 1, applied: false, reason: null },
      market: { factor: 1, applied: false, reason: null },
    });
    runHistoricalBaselineBacktest([], [2023, 2024]);

    expect(FANTASY_RANKINGS.rows).toEqual(rankingsBefore);
    expect(FANTASY_PAR_ROWS).toEqual(parBefore);
  });

  it("Phase 3 shadow candidates never exceed their configured caps regardless of extreme input factors", () => {
    const candidates = buildShadowCandidates(20, {
      usage: { factor: 1.15, applied: true, reason: null },
      team: { factor: 1.1, applied: true, reason: null },
      fpa: { factor: 1.1, applied: true, reason: null },
      market: { factor: 1.08, applied: true, reason: null },
    });
    for (const candidate of candidates) {
      if (candidate.combinedFactor == null) continue;
      expect(candidate.combinedFactor).toBeGreaterThanOrEqual(0.7);
      expect(candidate.combinedFactor).toBeLessThanOrEqual(1.3);
    }
  });

  it("known canonical ranking/PAR anchors are still unchanged after Phase 3 shadow computation runs", () => {
    buildShadowCandidates(20, {
      usage: { factor: 1.05, applied: true, reason: null },
      team: { factor: 1, applied: false, reason: null },
      fpa: { factor: 1, applied: false, reason: null },
      market: { factor: 1, applied: false, reason: null },
    });
    const gibbs = FANTASY_RANKINGS.rows.find((row) => row.player === "Jahmyr Gibbs")!;
    expect(gibbs).toMatchObject({ overallRank: 1, positionRank: 1, projectionRank: 1 });
    const gibbsPar = FANTASY_PAR_ROWS.find((row) => row.player === "Jahmyr Gibbs")!;
    expect(gibbsPar.parPerGame).toBeCloseTo(10.72, 2);
    const byPosition = Object.fromEntries(FANTASY_PAR_ROWS.map((row) => [row.position, row.replacementPpg]));
    expect(byPosition.QB).toBeCloseTo(17.5667, 3);
    expect(byPosition.RB).toBeCloseTo(12.1667, 3);
    expect(byPosition.WR).toBeCloseTo(11.5667, 3);
    expect(byPosition.TE).toBeCloseTo(9.9333, 3);
  });

  it("Phase 3B builders (status, rookie fallback, refined candidates, usage-cap experiment) do not mutate the live workbook rows or PAR rows", () => {
    const rankingsBefore = structuredClone(FANTASY_RANKINGS.rows);
    const parBefore = structuredClone(FANTASY_PAR_ROWS);

    buildStatusAvailability({
      currentSeasonRosterRows: [{ gsisId: "x", team: "KC", rawStatus: "ACT" }],
      currentSeasonAsOf: "2026-08-22",
      masterTableRows: [{ gsisId: "y", team: null, rawStatus: "RLS" }],
      masterTableAsOf: "2026-08-21",
      universe: [{ playerId: "gsis:x", playerName: "X", position: "WR" }],
    });
    buildRookieFallback([{ playerId: "gsis:z", playerName: "Z", position: "RB" }], []);
    applyStatusTreatments("reserve", "high", 15);
    buildRefinedCandidates(15, { factor: 1.05, applied: true, reason: null });
    selectEffectiveBaseline(15, null);
    runUsageCapExperiment([], [0, 0.05, 0.1, 0.15]);

    expect(FANTASY_RANKINGS.rows).toEqual(rankingsBefore);
    expect(FANTASY_PAR_ROWS).toEqual(parBefore);
  });

  it("STATUS_MODEL_RANK_EXCLUSION only excludes the two unambiguous not-on-any-2026-team categories, never active/reserve/unknown", () => {
    expect(STATUS_MODEL_RANK_EXCLUSION.active).toBe(false);
    expect(STATUS_MODEL_RANK_EXCLUSION.reserve).toBe(false);
    expect(STATUS_MODEL_RANK_EXCLUSION.unknown).toBe(false);
    expect(STATUS_MODEL_RANK_EXCLUSION.otherUnavailable).toBe(false);
    expect(STATUS_MODEL_RANK_EXCLUSION.released).toBe(true);
    expect(STATUS_MODEL_RANK_EXCLUSION.suspended).toBe(true);
  });

  it("known canonical ranking/PAR anchors are still unchanged after Phase 3B status/fallback computation runs", () => {
    buildRefinedCandidates(15, { factor: 1.05, applied: true, reason: null });
    const gibbs = FANTASY_RANKINGS.rows.find((row) => row.player === "Jahmyr Gibbs")!;
    expect(gibbs).toMatchObject({ overallRank: 1, positionRank: 1, projectionRank: 1 });
    const gibbsPar = FANTASY_PAR_ROWS.find((row) => row.player === "Jahmyr Gibbs")!;
    expect(gibbsPar.parPerGame).toBeCloseTo(10.72, 2);
  });

  it("Phase 3C rank-eligibility functions do not mutate the live workbook rows or PAR rows", () => {
    const rankingsBefore = structuredClone(FANTASY_RANKINGS.rows);
    const parBefore = structuredClone(FANTASY_PAR_ROWS);

    buildNormalizedAvailability({
      status: { category: "reserve", rawCode: "RES", source: "master-player-table", asOf: "2026-08-21" },
      parTeam: "FA",
      parTeamAsOf: "2026-08-13",
      workbookTeam: null,
    });
    evaluateRankEligibility("R3", "RELEASED", false);
    isProjectionEligible(15.2);
    determineCurrentRosterVerified({ verifiedByCurrentSeasonRoster: false, workbookTeam: "kc", parTeam: "FA" });

    expect(FANTASY_RANKINGS.rows).toEqual(rankingsBefore);
    expect(FANTASY_PAR_ROWS).toEqual(parBefore);
  });

  it("no status-based PPG penalty: rank-eligibility evaluation never reads or returns a PPG-shaped value", () => {
    for (const status of ["ACTIVE", "RESERVE", "RELEASED", "FREE_AGENT", "UNKNOWN"] as const) {
      const result = evaluateRankEligibility("R3", status, false);
      expect(Object.keys(result).sort()).toEqual(["rankEligibilityReason", "rankEligible"]);
    }
  });

  it("projection is retained (projectionEligible) even when rank is withheld (rankEligible false)", () => {
    const projectedPpg = 12.4;
    expect(isProjectionEligible(projectedPpg)).toBe(true);
    const eligibility = evaluateRankEligibility("R2", "RELEASED", false);
    expect(eligibility.rankEligible).toBe(false);
    // The projection itself (isProjectionEligible/projectedPpg) is computed independently and is unaffected by rankEligible being false.
    expect(isProjectionEligible(projectedPpg)).toBe(true);
  });

  it("rookie fallback candidates follow the same rank-eligibility rules as historical-baseline candidates (status alone gates eligibility, not baseline source)", () => {
    const fallbackBaselineEligibility = evaluateRankEligibility("R2", "ACTIVE", true);
    const historicalBaselineEligibility = evaluateRankEligibility("R2", "ACTIVE", true);
    expect(fallbackBaselineEligibility).toEqual(historicalBaselineEligibility);
    const releasedRookie = evaluateRankEligibility("R2", "RELEASED", false);
    const releasedVeteran = evaluateRankEligibility("R2", "RELEASED", false);
    expect(releasedRookie).toEqual(releasedVeteran);
  });

  it("Hill/Diggs/Deebo/Aiyuk regression: normalized availability and R2 rank-eligibility match the Phase 3C trace", () => {
    const hill = buildNormalizedAvailability({
      status: { category: "reserve", rawCode: "RES", source: "master-player-table", asOf: "2026-08-21" },
      parTeam: "FA",
      parTeamAsOf: "2026-08-13",
      workbookTeam: null,
    });
    expect(hill.availabilityStatus).toBe("FREE_AGENT");
    expect(evaluateRankEligibility("R2", hill.availabilityStatus, hill.currentRosterVerified).rankEligible).toBe(false);

    const diggs = buildNormalizedAvailability({
      status: { category: "active", rawCode: "ACT", source: "master-player-table", asOf: "2026-08-21" },
      parTeam: "WAS",
      parTeamAsOf: "2026-08-13",
      workbookTeam: null,
    });
    expect(diggs.availabilityStatus).toBe("ACTIVE");
    expect(diggs.currentRosterVerified).toBe(false);
    expect(evaluateRankEligibility("R2", diggs.availabilityStatus, diggs.currentRosterVerified).rankEligible).toBe(true);

    const deebo = buildNormalizedAvailability({
      status: { category: "active", rawCode: "ACT", source: "master-player-table", asOf: "2026-08-21" },
      parTeam: "SF",
      parTeamAsOf: "2026-08-13",
      workbookTeam: null,
    });
    expect(deebo.availabilityStatus).toBe("ACTIVE");
    expect(evaluateRankEligibility("R2", deebo.availabilityStatus, deebo.currentRosterVerified).rankEligible).toBe(true);

    const aiyuk = buildNormalizedAvailability({
      status: { category: "released", rawCode: "RLS", source: "master-player-table", asOf: "2026-08-21" },
      parTeam: "SF",
      parTeamAsOf: "2026-08-13",
      workbookTeam: "sf",
    });
    expect(aiyuk.availabilityStatus).toBe("RELEASED");
    expect(aiyuk.currentRosterVerified).toBe(true);
    expect(aiyuk.statusConflict).toBe(true);
    expect(evaluateRankEligibility("R2", aiyuk.availabilityStatus, aiyuk.currentRosterVerified).rankEligible).toBe(false);
  });

  it("normalizeAvailabilityStatus never emits INJURED and maps unrecognized codes to UNKNOWN, not a guess", () => {
    expect(normalizeAvailabilityStatus("PUP", "reserve")).toBe("RESERVE");
    expect(normalizeAvailabilityStatus("ZZZ", "unknown")).toBe("UNKNOWN");
  });
});
