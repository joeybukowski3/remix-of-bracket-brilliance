import { WEEKLY_INPUT_BENCHMARKS } from "@/lib/fantasy/weekly/__fixtures__/benchmarks";
import { parseWeeklyFantasyModelInput } from "@/lib/fantasy/weekly/contract";
import { resolveWeeklyEligibility } from "@/lib/fantasy/weekly/eligibility";

describe("weekly input benchmark fixtures", () => {
  it("contains exactly ten contract-valid cases per supported position", () => {
    expect(WEEKLY_INPUT_BENCHMARKS).toHaveLength(40);
    for (const position of ["QB", "RB", "WR", "TE"] as const) {
      expect(WEEKLY_INPUT_BENCHMARKS.filter((fixture) => fixture.input.player.position === position)).toHaveLength(10);
    }
    WEEKLY_INPUT_BENCHMARKS.forEach((fixture) => expect(parseWeeklyFantasyModelInput(fixture.input)).toEqual(fixture.input));
  });

  it("covers every required scenario without encoding rankings or coefficients", () => {
    const scenarios = new Set(WEEKLY_INPUT_BENCHMARKS.map((fixture) => fixture.scenario));
    for (const required of [
      "elite-favorable", "elite-poor", "average-favorable", "high-team-total", "low-team-total",
      "favorite", "underdog", "bye", "out", "questionable", "major-workload-increase",
      "backup-replacing-starter", "changed-teams", "missing-market", "missing-usage",
    ]) expect(scenarios.has(required as never), required).toBe(true);
    const json = JSON.stringify(WEEKLY_INPUT_BENCHMARKS);
    expect(json).not.toMatch(/weeklyScore|positionRank|adjustmentPercent|coefficient/i);
  });

  it("matches the canonical eligibility policy", () => {
    for (const fixture of WEEKLY_INPUT_BENCHMARKS) {
      const result = resolveWeeklyEligibility({
        identityResolved: true,
        homeAway: fixture.input.homeAway,
        availabilityStatus: fixture.input.availability.status,
      });
      expect(result.eligible, fixture.id).toBe(fixture.expectations.eligible);
    }
  });

  it("marks scenarios the current inputs cannot fully represent", () => {
    const backup = WEEKLY_INPUT_BENCHMARKS.find((fixture) => fixture.scenario === "backup-replacing-starter")!;
    expect(backup.input.player.starterStatus).toBe("unknown");
    expect(backup.expectations.missingAuthorities).toContain("starter-role");
    const missingUsage = WEEKLY_INPUT_BENCHMARKS.find((fixture) => fixture.scenario === "missing-usage")!;
    expect(missingUsage.input.usage.snapShare).toBeNull();
  });
});
