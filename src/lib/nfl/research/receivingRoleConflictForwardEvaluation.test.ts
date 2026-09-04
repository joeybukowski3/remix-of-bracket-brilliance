import { describe, expect, it } from "vitest";
import {
  classifyReceivingRoleConflictCohorts,
  computeReceivingRoleConflictErrors,
  summarizeReceivingRoleConflictCohort,
  type ReceivingRoleConflictEvaluationRow,
} from "./receivingRoleConflictForwardEvaluation";

function row(overrides: Partial<ReceivingRoleConflictEvaluationRow> = {}): ReceivingRoleConflictEvaluationRow {
  return {
    playerId: "p1", gameId: "2026_01_HOU_BUF", season: 2026, week: 1, position: "WR",
    projectedTargets: 6.5, projectedYards: 78.2, actualTargets: 9, actualYards: 101,
    conflictLevel: "high", orderingConflict: true, teamChanged: true, roleSourced: true, depthRank: 1, noHistory: false,
    ...overrides,
  };
}

describe("computeReceivingRoleConflictErrors", () => {
  it("computes target error from the archived pregame projection, not a recomputation", () => {
    const [result] = computeReceivingRoleConflictErrors([row()]);
    expect(result.absoluteTargetError).toBeCloseTo(2.5);
    expect(result.signedTargetError).toBeCloseTo(6.5 - 9);
  });

  it("computes receiving yards error when both values are present", () => {
    const [result] = computeReceivingRoleConflictErrors([row()]);
    expect(result.receivingYardsError).toBeCloseTo(Math.abs(78.2 - 101));
  });

  it("returns null yards error (not a fabricated number) when either yards value is missing", () => {
    const [result] = computeReceivingRoleConflictErrors([row({ projectedYards: null })]);
    expect(result.receivingYardsError).toBeNull();
  });

  it("is deterministic and does not mutate its input rows", () => {
    const rows = [row(), row({ playerId: "p2" })];
    const snapshot = JSON.stringify(rows);
    computeReceivingRoleConflictErrors(rows);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
});

describe("classifyReceivingRoleConflictCohorts", () => {
  it("always includes overall", () => {
    expect(classifyReceivingRoleConflictCohorts(row())).toContain("overall");
  });

  it("classifies week1 and weeks1to4 together for a week-1 row", () => {
    const cohorts = classifyReceivingRoleConflictCohorts(row({ week: 1 }));
    expect(cohorts).toContain("week1");
    expect(cohorts).toContain("weeks1to4");
  });

  it("classifies weeks1to4 but not week1 for week 3", () => {
    const cohorts = classifyReceivingRoleConflictCohorts(row({ week: 3 }));
    expect(cohorts).not.toContain("week1");
    expect(cohorts).toContain("weeks1to4");
  });

  it("classifies teamChanged xor sameTeam", () => {
    expect(classifyReceivingRoleConflictCohorts(row({ teamChanged: true }))).toContain("teamChanged");
    expect(classifyReceivingRoleConflictCohorts(row({ teamChanged: false }))).toContain("sameTeam");
    expect(classifyReceivingRoleConflictCohorts(row({ teamChanged: null }))).not.toEqual(expect.arrayContaining(["teamChanged", "sameTeam"]));
  });

  it("classifies the correct role-conflict level cohort", () => {
    expect(classifyReceivingRoleConflictCohorts(row({ conflictLevel: "low" }))).toContain("roleConflictLow");
    expect(classifyReceivingRoleConflictCohorts(row({ conflictLevel: "medium" }))).toContain("roleConflictMedium");
    expect(classifyReceivingRoleConflictCohorts(row({ conflictLevel: "high" }))).toContain("roleConflictHigh");
  });

  it("classifies sourcedWR1/sourcedWR2/sourcedTE1 by position and depth rank", () => {
    expect(classifyReceivingRoleConflictCohorts(row({ position: "WR", depthRank: 1, roleSourced: true }))).toContain("sourcedWR1");
    expect(classifyReceivingRoleConflictCohorts(row({ position: "WR", depthRank: 2, roleSourced: true }))).toContain("sourcedWR2");
    expect(classifyReceivingRoleConflictCohorts(row({ position: "TE", depthRank: 1, roleSourced: true }))).toContain("sourcedTE1");
  });

  it("does not classify a sourced-role cohort when roleSourced is false", () => {
    expect(classifyReceivingRoleConflictCohorts(row({ position: "WR", depthRank: 1, roleSourced: false }))).not.toContain("sourcedWR1");
  });

  it("classifies orderingConflict only when true", () => {
    expect(classifyReceivingRoleConflictCohorts(row({ orderingConflict: true }))).toContain("orderingConflict");
    expect(classifyReceivingRoleConflictCohorts(row({ orderingConflict: false }))).not.toContain("orderingConflict");
    expect(classifyReceivingRoleConflictCohorts(row({ orderingConflict: null }))).not.toContain("orderingConflict");
  });

  it("classifies noHistory rows", () => {
    expect(classifyReceivingRoleConflictCohorts(row({ noHistory: true }))).toContain("noHistory");
  });
});

describe("summarizeReceivingRoleConflictCohort", () => {
  it("aggregates mean absolute/signed error for the members of one cohort, using archived errors only", () => {
    const rows = [
      row({ playerId: "p1", conflictLevel: "high" }),
      row({ playerId: "p2", conflictLevel: "high", projectedTargets: 4, actualTargets: 4 }),
      row({ playerId: "p3", conflictLevel: "low" }),
    ];
    const errors = computeReceivingRoleConflictErrors(rows);
    const byKey = new Map(errors.map((e) => [`${e.gameId}|${e.playerId}`, e]));
    const summary = summarizeReceivingRoleConflictCohort("roleConflictHigh", rows, byKey);
    expect(summary.n).toBe(2);
    expect(summary.meanAbsoluteTargetError).toBeCloseTo((2.5 + 0) / 2);
  });

  it("returns n=0 and NaN means for an empty cohort rather than throwing", () => {
    const summary = summarizeReceivingRoleConflictCohort("roleConflictMedium", [], new Map());
    expect(summary.n).toBe(0);
    expect(Number.isNaN(summary.meanAbsoluteTargetError)).toBe(true);
  });

  it("never recomputes a projection -- errors must come from the caller-supplied archived map", () => {
    const rows = [row({ playerId: "p1" })];
    // deliberately empty error map: no archived outcome joined yet.
    const summary = summarizeReceivingRoleConflictCohort("overall", rows, new Map());
    expect(summary.n).toBe(0);
  });
});
