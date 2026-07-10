import { describe, expect, it } from "vitest";
import { describeKPropStatusReason, resolveKPropStatus } from "./kPropStatus";
import type { PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";

function makeRow(overrides: Partial<PitcherStrikeoutTeamRow> = {}): PitcherStrikeoutTeamRow {
  return {
    rank: 1,
    gameKey: "AAA@BBB",
    pitcher: "Test Pitcher",
    team: "AAA",
    opponent: "BBB",
    park: "Test Park",
    parkFactor: 1,
    pitcherKRate: 28,
    pitcherWhiffRate: 31,
    pitcherKVs: 75,
    opponentTeamKRate: 25,
    opponentTeamWhiffRate: 28,
    opponentTeamXba: 0.24,
    pitcherKSkillScore: 74,
    opponentTeamStrikeoutScore: 66,
    strikeoutMatchupScore: 72,
    whyItRanksWell: "Strong K indicators.",
    projectedIP: 6,
    projectedK9: 10,
    projectedKs: 6,
    kLine: 5.5,
    kOddsOver: "-115",
    kOddsUnder: "-115",
    kOddsBook: "draftkings",
    workloadRole: "starter",
    workloadConfidenceGrade: "A",
    workloadConfidenceScore: 0.9,
    workloadFlags: [],
    ...overrides,
  };
}

describe("resolveKPropStatus", () => {
  it("returns VALID for a clean row with a confident workload grade", () => {
    expect(resolveKPropStatus(makeRow()).status).toBe("VALID");
  });

  it("returns NO_MARKET when there is no K line at all (not a data-quality problem)", () => {
    const result = resolveKPropStatus(makeRow({ kLine: null }));
    expect(result.status).toBe("NO_MARKET");
  });

  it("Jack Perkins regression: rejects an incoherent two-sided market from an unranked book", () => {
    // +881 over / -100 under implies ~10.2% + 50% = ~60.2% combined --
    // far below any plausible real two-sided market.
    const perkins = makeRow({
      pitcher: "Jack Perkins",
      kLine: 2.5,
      kOddsOver: "+881",
      kOddsUnder: "-100",
      kOddsBook: "underdog",
      projectedIP: 8,
      projectedK9: 11.5,
      projectedKs: 10.2,
      workloadRole: "starter",
      workloadConfidenceGrade: "A",
    });
    const result = resolveKPropStatus(perkins);
    expect(result.status).toBe("INVALID_ODDS");
    expect(result.reasons).toContain("INCOHERENT_MARKET_PROBABILITY");
  });

  it("rejects a K line sourced from a disallowed DFS pick'em book even with a coherent price", () => {
    const result = resolveKPropStatus(makeRow({ kOddsBook: "underdog", kOddsOver: "-110", kOddsUnder: "-110" }));
    expect(result.status).toBe("INVALID_ODDS");
    expect(result.reasons).toContain("UNSUPPORTED_BOOK_SOURCE");
  });

  it("Patrick Sandoval regression: missing workload data with a real market line is not VALID", () => {
    const sandoval = makeRow({
      pitcher: "Patrick Sandoval",
      pitcherKRate: 0,
      pitcherWhiffRate: 0,
      kLine: 4.5,
      projectedIP: 5.5,
      projectedK9: 3,
      projectedKs: 1.8,
      workloadRole: "starter",
      workloadConfidenceGrade: "D",
      workloadConfidenceScore: 0.3,
      workloadFlags: ["NO_STARTS_AVAILABLE", "PITCHER_RECENT_K_RATE_MISSING", "RECENT_PITCH_COUNTS_MISSING"],
    });
    const result = resolveKPropStatus(sandoval);
    expect(result.status).toBe("INSUFFICIENT_DATA");
    expect(result.reasons).toContain("WORKLOAD_CONFIDENCE_GRADE_D");
  });

  it("returns INSUFFICIENT_DATA when there is no projection at all", () => {
    const result = resolveKPropStatus(makeRow({ projectedKs: null, projectedIP: null }));
    expect(result.status).toBe("INSUFFICIENT_DATA");
    expect(result.reasons).toContain("PROJECTION_UNAVAILABLE");
  });

  it("returns LOW_CONFIDENCE for a grade C workload", () => {
    const result = resolveKPropStatus(makeRow({ workloadConfidenceGrade: "C" }));
    expect(result.status).toBe("LOW_CONFIDENCE");
  });

  it("returns LOW_CONFIDENCE when publicRecommendationEligible is explicitly false", () => {
    const result = resolveKPropStatus(makeRow({ publicRecommendationEligible: false }));
    expect(result.status).toBe("LOW_CONFIDENCE");
    expect(result.reasons).toContain("PUBLIC_RECOMMENDATION_INELIGIBLE");
  });

  it("returns INVALID_WORKLOAD when the legacy projection diverges sharply from an eligible candidate", () => {
    const result = resolveKPropStatus(makeRow({
      projectedKs: 10.2,
      candidateProjectedKs: 5.6,
      projectionSource: "legacy",
      workloadConfidenceGrade: "A",
    }));
    expect(result.status).toBe("INVALID_WORKLOAD");
  });

  it("does not flag INVALID_WORKLOAD when the projection source is already the candidate/workload model", () => {
    const result = resolveKPropStatus(makeRow({
      projectedKs: 5.6,
      candidateProjectedKs: 5.6,
      projectionSource: "workload-team",
      workloadConfidenceGrade: "A",
    }));
    expect(result.status).toBe("VALID");
  });

  it("does not misclassify a legitimate low K line for a known reliever as implausible", () => {
    const result = resolveKPropStatus(makeRow({
      kLine: 0.5,
      workloadRole: "reliever",
      projectedIP: 1,
      projectedK9: 8,
      projectedKs: 0.9,
    }));
    expect(result.status).toBe("VALID");
  });

  it("skips the K-line plausibility band entirely when role is unknown, rather than defaulting to starter bounds", () => {
    const result = resolveKPropStatus(makeRow({ kLine: 0.5, workloadRole: null }));
    expect(result.status).toBe("VALID");
  });
});

describe("describeKPropStatusReason", () => {
  it("maps known reason codes to human-readable labels", () => {
    expect(describeKPropStatusReason("NO_STARTS_AVAILABLE")).toBe("Insufficient recent starts");
    expect(describeKPropStatusReason("INCOHERENT_MARKET_PROBABILITY")).toBe("Invalid odds");
  });

  it("falls back to a readable version of an unknown reason code", () => {
    expect(describeKPropStatusReason("SOME_NEW_FLAG")).toBe("some new flag");
  });
});
