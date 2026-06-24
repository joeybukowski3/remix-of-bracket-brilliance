import { describe, expect, it } from "vitest";
import {
  COACH_OF_YEAR_CANDIDATES,
  COACH_OF_YEAR_ELEVATED_CANDIDATES,
  COACH_OF_YEAR_HISTORY,
  COACH_OF_YEAR_RATED_CANDIDATES,
  getCandidateByAbbr,
  getCoachCandidateCounts,
  getCoachOfYearHistorySummary,
} from "@/lib/nfl/coachOfYear2026";

describe("NFL Coach of the Year research model", () => {
  it("contains the requested 10-year historical sample", () => {
    expect(COACH_OF_YEAR_HISTORY).toHaveLength(10);
    expect(getCoachOfYearHistorySummary()).toMatchObject({
      firstYearCoachPct: 50,
      missedPriorPlayoffsPct: 80,
      awardPlayoffsPct: 100,
      divisionWinnerPct: 60,
      improvedPpgPct: 90,
      easierSchedulePct: 80,
      sampleSize: 10,
    });
  });

  it("places every NFL team into exactly one candidate bucket", () => {
    expect(COACH_OF_YEAR_CANDIDATES).toHaveLength(32);
    expect(getCoachCandidateCounts()).toEqual({ eliminated: 14, unlikely: 3, rated: 15 });
  });

  it("eliminates the 2025 playoff field", () => {
    expect(getCandidateByAbbr("sea")?.bucket).toBe("eliminated");
    expect(getCandidateByAbbr("ne")?.bucket).toBe("eliminated");
    expect(getCandidateByAbbr("pit")?.bucket).toBe("eliminated");
    expect(getCandidateByAbbr("car")?.bucket).toBe("eliminated");
  });

  it("downgrades winning non-playoff teams and Dallas' verified SOS jump", () => {
    expect(getCandidateByAbbr("det")?.bucket).toBe("unlikely");
    expect(getCandidateByAbbr("min")?.bucket).toBe("unlikely");
    expect(getCandidateByAbbr("dal")).toMatchObject({ bucket: "unlikely", significantSosIncrease: true, sharpSosRank: 4 });
  });

  it("identifies elevated teams using all four published filters", () => {
    expect(COACH_OF_YEAR_ELEVATED_CANDIDATES.map((row) => row.team.abbr)).toEqual(["no"]);
    const saints = COACH_OF_YEAR_ELEVATED_CANDIDATES[0];
    expect(saints.team.projectedWins).toBeGreaterThanOrEqual(7);
    expect(saints.team.regressionGap).toBeGreaterThanOrEqual(3);
    expect(saints.sharpSosRank).toBeGreaterThanOrEqual(17);
    expect(Math.min(saints.team.offRank, saints.team.defRank)).toBeLessThanOrEqual(20);
  });

  it("keeps all rated scores inside the published 100-point framework", () => {
    expect(COACH_OF_YEAR_RATED_CANDIDATES).toHaveLength(15);
    for (const row of COACH_OF_YEAR_RATED_CANDIDATES) {
      expect(row.score.schedule).toBeGreaterThanOrEqual(0);
      expect(row.score.schedule).toBeLessThanOrEqual(25);
      expect(row.score.firstYearCoach).toBeGreaterThanOrEqual(0);
      expect(row.score.firstYearCoach).toBeLessThanOrEqual(15);
      expect(row.score.improvement).toBeGreaterThanOrEqual(0);
      expect(row.score.improvement).toBeLessThanOrEqual(35);
      expect(row.score.path).toBeGreaterThanOrEqual(0);
      expect(row.score.path).toBeLessThanOrEqual(25);
      expect(row.score.total).toBe(row.score.schedule + row.score.firstYearCoach + row.score.improvement + row.score.path);
    }
  });
});
