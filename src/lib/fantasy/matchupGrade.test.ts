import { describe, expect, it } from "vitest";
import {
  getMatchupGrade,
  MATCHUP_GRADES,
  MATCHUP_GRADE_TEAM_COUNT,
} from "@/lib/fantasy/matchupGrade";

describe("matchup grade bands", () => {
  it("covers every rank from 1 to 32 exactly once", () => {
    for (let rank = 1; rank <= MATCHUP_GRADE_TEAM_COUNT; rank += 1) {
      const matches = MATCHUP_GRADES.filter(
        (grade) => rank >= grade.minRank && rank <= grade.maxRank,
      );
      expect(matches, `rank ${rank}`).toHaveLength(1);
    }
  });

  it("is contiguous and ordered best matchup first", () => {
    expect(MATCHUP_GRADES[0].minRank).toBe(1);
    expect(MATCHUP_GRADES[MATCHUP_GRADES.length - 1].maxRank).toBe(MATCHUP_GRADE_TEAM_COUNT);
    for (let i = 1; i < MATCHUP_GRADES.length; i += 1) {
      expect(MATCHUP_GRADES[i].minRank).toBe(MATCHUP_GRADES[i - 1].maxRank + 1);
    }
  });

  it("documents the approved 6/6/8/6/6 split", () => {
    expect(MATCHUP_GRADES.map((grade) => [grade.id, grade.minRank, grade.maxRank])).toEqual([
      ["great", 1, 6],
      ["good", 7, 12],
      ["neutral", 13, 20],
      ["tough", 21, 26],
      ["very-tough", 27, 32],
    ]);
  });

  // Rank 1 = allowed the MOST fantasy points to the position, so it is the
  // easiest matchup. Direction matches pointsAllowed2025.ts exactly.
  it("maps FPA rank 1 to the most favourable grade", () => {
    const grade = getMatchupGrade(1);
    expect(grade?.id).toBe("great");
    expect(grade?.label).toBe("Great");
    expect(grade?.badgeClass).toContain("emerald");
  });

  it("maps FPA rank 32 to the least favourable grade", () => {
    const grade = getMatchupGrade(32);
    expect(grade?.id).toBe("very-tough");
    expect(grade?.label).toBe("Very Tough");
    expect(grade?.badgeClass).toContain("rose");
  });

  it("returns the expected grade at every band boundary", () => {
    expect(getMatchupGrade(6)?.id).toBe("great");
    expect(getMatchupGrade(7)?.id).toBe("good");
    expect(getMatchupGrade(12)?.id).toBe("good");
    expect(getMatchupGrade(13)?.id).toBe("neutral");
    expect(getMatchupGrade(20)?.id).toBe("neutral");
    expect(getMatchupGrade(21)?.id).toBe("tough");
    expect(getMatchupGrade(26)?.id).toBe("tough");
    expect(getMatchupGrade(27)?.id).toBe("very-tough");
  });

  it("returns null rather than a neutral grade for a rank it cannot read", () => {
    expect(getMatchupGrade(null)).toBeNull();
    expect(getMatchupGrade(undefined)).toBeNull();
    expect(getMatchupGrade(0)).toBeNull();
    expect(getMatchupGrade(33)).toBeNull();
    expect(getMatchupGrade(Number.NaN)).toBeNull();
    expect(getMatchupGrade(4.5)).toBeNull();
  });
});
