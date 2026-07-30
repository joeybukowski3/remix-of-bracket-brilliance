import { describe, expect, it } from "vitest";
import {
  getProjectionEdgeInfo,
  selectTopProjectedKRows,
  selectTopSocialKRows,
  sortByAbsoluteProjectionEdge,
  sortByProjectedKs,
} from "./kPropValueSorting";
import type { PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";

function makeRow(overrides: Partial<PitcherStrikeoutTeamRow>): PitcherStrikeoutTeamRow {
  return {
    rank: 1,
    gameKey: "BAL@CHC",
    pitcher: "Test Pitcher",
    team: "BAL",
    opponent: "CHC",
    park: "Wrigley Field",
    parkFactor: 1.0,
    pitcherKRate: 22,
    pitcherWhiffRate: 28,
    pitcherKVs: 60,
    opponentTeamKRate: 24,
    opponentTeamWhiffRate: 30,
    opponentTeamXba: 0.24,
    pitcherKSkillScore: 65,
    opponentTeamStrikeoutScore: 58,
    strikeoutMatchupScore: 62,
    whyItRanksWell: "Strong K matchup",
    projectedIP: 5.5,
    projectedK9: 8.2,
    ...overrides,
  };
}

describe("getProjectionEdgeInfo", () => {
  it("computes edge and direction=over when projectedKs is above the line", () => {
    const info = getProjectionEdgeInfo(makeRow({ projectedKs: 7.2, kLine: 6.5 }));
    expect(info.isValid).toBe(true);
    expect(info.projectionEdge).toBeCloseTo(0.7, 5);
    expect(info.absoluteProjectionEdge).toBeCloseTo(0.7, 5);
    expect(info.direction).toBe("over");
  });

  it("computes edge and direction=under when projectedKs is below the line", () => {
    const info = getProjectionEdgeInfo(makeRow({ projectedKs: 5.4, kLine: 6.5 }));
    expect(info.isValid).toBe(true);
    expect(info.projectionEdge).toBeCloseTo(-1.1, 5);
    expect(info.absoluteProjectionEdge).toBeCloseTo(1.1, 5);
    expect(info.direction).toBe("under");
  });

  it("is neutral when projectedKs exactly equals the line", () => {
    const info = getProjectionEdgeInfo(makeRow({ projectedKs: 6.5, kLine: 6.5 }));
    expect(info.direction).toBe("neutral");
    expect(info.absoluteProjectionEdge).toBe(0);
  });

  it("returns isValid=false and null edge (never a fabricated 0) when projectedKs is missing", () => {
    const info = getProjectionEdgeInfo(makeRow({ projectedKs: null, kLine: 6.5 }));
    expect(info.isValid).toBe(false);
    expect(info.projectionEdge).toBeNull();
    expect(info.absoluteProjectionEdge).toBeNull();
    expect(info.direction).toBe("neutral");
  });

  it("returns isValid=false when kLine is missing", () => {
    const info = getProjectionEdgeInfo(makeRow({ projectedKs: 7.2, kLine: null }));
    expect(info.isValid).toBe(false);
  });

  it("returns isValid=false for a non-finite kLine (e.g. NaN from bad data) instead of fabricating an edge", () => {
    const info = getProjectionEdgeInfo(makeRow({ projectedKs: 7.2, kLine: Number.NaN }));
    expect(info.isValid).toBe(false);
  });
});

describe("sortByProjectedKs (Most Strikeouts)", () => {
  it("ranks rows by highest projected strikeouts first", () => {
    const rows = [
      makeRow({ pitcher: "Low", projectedKs: 4.1 }),
      makeRow({ pitcher: "High", projectedKs: 9.3 }),
      makeRow({ pitcher: "Mid", projectedKs: 6.7 }),
    ];
    const sorted = sortByProjectedKs(rows);
    expect(sorted.map((r) => r.pitcher)).toEqual(["High", "Mid", "Low"]);
  });

  it("sorts rows with a missing projection below every row with a real one, never as a fabricated 0", () => {
    const rows = [
      makeRow({ pitcher: "NoProjection", projectedKs: null }),
      makeRow({ pitcher: "LowButReal", projectedKs: 0.5 }),
      makeRow({ pitcher: "High", projectedKs: 8.0 }),
    ];
    const sorted = sortByProjectedKs(rows);
    expect(sorted.map((r) => r.pitcher)).toEqual(["High", "LowButReal", "NoProjection"]);
  });

  describe("deterministic tie-break on equal projectedKs", () => {
    it("higher projectedKs always ranks first, regardless of the other score fields", () => {
      const rows = [
        makeRow({ pitcher: "LowerKsHigherScores", projectedKs: 5.0, strikeoutMatchupScore: 99, pitcherKSkillScore: 99, opponentTeamStrikeoutScore: 99 }),
        makeRow({ pitcher: "HigherKs", projectedKs: 6.0, strikeoutMatchupScore: 1, pitcherKSkillScore: 1, opponentTeamStrikeoutScore: 1 }),
      ];
      const sorted = sortByProjectedKs(rows);
      expect(sorted.map((r) => r.pitcher)).toEqual(["HigherKs", "LowerKsHigherScores"]);
    });

    it("breaks a tie on equal projectedKs by higher strikeoutMatchupScore first", () => {
      const rows = [
        makeRow({ pitcher: "LowMatchup", projectedKs: 6.0, strikeoutMatchupScore: 40 }),
        makeRow({ pitcher: "HighMatchup", projectedKs: 6.0, strikeoutMatchupScore: 90 }),
      ];
      const sorted = sortByProjectedKs(rows);
      expect(sorted.map((r) => r.pitcher)).toEqual(["HighMatchup", "LowMatchup"]);
    });

    it("falls through to pitcherKSkillScore when projectedKs and strikeoutMatchupScore are both tied", () => {
      const rows = [
        makeRow({ pitcher: "LowSkill", projectedKs: 6.0, strikeoutMatchupScore: 60, pitcherKSkillScore: 40 }),
        makeRow({ pitcher: "HighSkill", projectedKs: 6.0, strikeoutMatchupScore: 60, pitcherKSkillScore: 85 }),
      ];
      const sorted = sortByProjectedKs(rows);
      expect(sorted.map((r) => r.pitcher)).toEqual(["HighSkill", "LowSkill"]);
    });

    it("falls through to opponentTeamStrikeoutScore when projectedKs, strikeoutMatchupScore, and pitcherKSkillScore are all tied", () => {
      const rows = [
        makeRow({ pitcher: "LowOpponent", projectedKs: 6.0, strikeoutMatchupScore: 60, pitcherKSkillScore: 65, opponentTeamStrikeoutScore: 30 }),
        makeRow({ pitcher: "HighOpponent", projectedKs: 6.0, strikeoutMatchupScore: 60, pitcherKSkillScore: 65, opponentTeamStrikeoutScore: 75 }),
      ];
      const sorted = sortByProjectedKs(rows);
      expect(sorted.map((r) => r.pitcher)).toEqual(["HighOpponent", "LowOpponent"]);
    });

    it("falls through to alphabetical pitcher name as the final, deterministic tie-breaker", () => {
      const rows = [
        makeRow({ pitcher: "Zubaz", projectedKs: 6.0, strikeoutMatchupScore: 60, pitcherKSkillScore: 65, opponentTeamStrikeoutScore: 50 }),
        makeRow({ pitcher: "Adams", projectedKs: 6.0, strikeoutMatchupScore: 60, pitcherKSkillScore: 65, opponentTeamStrikeoutScore: 50 }),
      ];
      const sorted = sortByProjectedKs(rows);
      expect(sorted.map((r) => r.pitcher)).toEqual(["Adams", "Zubaz"]);
    });

    it("produces the same tied order regardless of input array order (reversing the input changes nothing)", () => {
      const rows = [
        makeRow({ pitcher: "Adams", projectedKs: 6.0, strikeoutMatchupScore: 60, pitcherKSkillScore: 65, opponentTeamStrikeoutScore: 50 }),
        makeRow({ pitcher: "Burke", projectedKs: 6.0, strikeoutMatchupScore: 60, pitcherKSkillScore: 65, opponentTeamStrikeoutScore: 50 }),
        makeRow({ pitcher: "Zubaz", projectedKs: 6.0, strikeoutMatchupScore: 60, pitcherKSkillScore: 65, opponentTeamStrikeoutScore: 50 }),
      ];
      const forward = sortByProjectedKs(rows).map((r) => r.pitcher);
      const reversed = sortByProjectedKs([...rows].reverse()).map((r) => r.pitcher);
      expect(forward).toEqual(["Adams", "Burke", "Zubaz"]);
      expect(reversed).toEqual(forward);
    });
  });
});

describe("sortByAbsoluteProjectionEdge (Best Value)", () => {
  it("ranks by absolute edge, so a large UNDER edge outranks a smaller OVER edge", () => {
    const rows = [
      makeRow({ pitcher: "SmallOver", projectedKs: 6.8, kLine: 6.5 }), // +0.3
      makeRow({ pitcher: "BigUnder", projectedKs: 4.0, kLine: 6.5 }), // -2.5
      makeRow({ pitcher: "MidOver", projectedKs: 7.5, kLine: 6.5 }), // +1.0
    ];
    const sorted = sortByAbsoluteProjectionEdge(rows);
    expect(sorted.map((r) => r.pitcher)).toEqual(["BigUnder", "MidOver", "SmallOver"]);
  });

  it("includes both OVER and UNDER favored rows in the same ranking", () => {
    const rows = [
      makeRow({ pitcher: "Over", projectedKs: 8.0, kLine: 6.0 }),
      makeRow({ pitcher: "Under", projectedKs: 4.0, kLine: 6.0 }),
    ];
    const directions = sortByAbsoluteProjectionEdge(rows).map((r) => getProjectionEdgeInfo(r).direction);
    expect(directions.sort()).toEqual(["over", "under"]);
  });

  it("keeps rows with missing/invalid projection or line visible but sorted below every valid row", () => {
    const rows = [
      makeRow({ pitcher: "Invalid", projectedKs: null, kLine: 6.5 }),
      makeRow({ pitcher: "ValidSmall", projectedKs: 6.7, kLine: 6.5 }),
      makeRow({ pitcher: "ValidBig", projectedKs: 9.0, kLine: 6.5 }),
    ];
    const sorted = sortByAbsoluteProjectionEdge(rows);
    expect(sorted).toHaveLength(3); // still visible, not dropped
    expect(sorted.map((r) => r.pitcher)).toEqual(["ValidBig", "ValidSmall", "Invalid"]);
  });

  it("ranks a strong OVER above a weaker UNDER", () => {
    const rows = [
      makeRow({ pitcher: "SmallUnder", projectedKs: 5.8, kLine: 6.0 }), // -0.2
      makeRow({ pitcher: "BigOver", projectedKs: 9.5, kLine: 6.0 }), // +3.5
    ];
    const sorted = sortByAbsoluteProjectionEdge(rows);
    expect(sorted.map((r) => r.pitcher)).toEqual(["BigOver", "SmallUnder"]);
  });

  describe("deterministic tie-breaking on equal absolute edge", () => {
    it("breaks a tie by higher strikeoutMatchupScore first", () => {
      const rows = [
        makeRow({ pitcher: "LowerScore", projectedKs: 7.5, kLine: 6.5, strikeoutMatchupScore: 50 }), // edge +1.0
        makeRow({ pitcher: "HigherScore", projectedKs: 7.5, kLine: 6.5, strikeoutMatchupScore: 80 }), // edge +1.0, tied
      ];
      const sorted = sortByAbsoluteProjectionEdge(rows);
      expect(sorted.map((r) => r.pitcher)).toEqual(["HigherScore", "LowerScore"]);
    });

    it("falls through to workloadConfidenceScore when edge and matchup score are both tied", () => {
      const rows = [
        makeRow({ pitcher: "LowerConfidence", projectedKs: 7.5, kLine: 6.5, strikeoutMatchupScore: 60, workloadConfidenceScore: 0.4 }),
        makeRow({ pitcher: "HigherConfidence", projectedKs: 7.5, kLine: 6.5, strikeoutMatchupScore: 60, workloadConfidenceScore: 0.9 }),
      ];
      const sorted = sortByAbsoluteProjectionEdge(rows);
      expect(sorted.map((r) => r.pitcher)).toEqual(["HigherConfidence", "LowerConfidence"]);
    });

    it("falls through to alphabetical pitcher name as the final, stable tie-breaker", () => {
      const rows = [
        makeRow({ pitcher: "Zulu Pitcher", projectedKs: 7.5, kLine: 6.5, strikeoutMatchupScore: 60, workloadConfidenceScore: 0.7 }),
        makeRow({ pitcher: "Alpha Pitcher", projectedKs: 7.5, kLine: 6.5, strikeoutMatchupScore: 60, workloadConfidenceScore: 0.7 }),
      ];
      const sorted = sortByAbsoluteProjectionEdge(rows);
      expect(sorted.map((r) => r.pitcher)).toEqual(["Alpha Pitcher", "Zulu Pitcher"]);
    });

    it("tie-break output is deterministic across repeated calls with the same input", () => {
      const rows = [
        makeRow({ pitcher: "B", projectedKs: 7.5, kLine: 6.5, strikeoutMatchupScore: 60 }),
        makeRow({ pitcher: "A", projectedKs: 7.5, kLine: 6.5, strikeoutMatchupScore: 60 }),
      ];
      const first = sortByAbsoluteProjectionEdge(rows).map((r) => r.pitcher);
      const second = sortByAbsoluteProjectionEdge(rows).map((r) => r.pitcher);
      expect(first).toEqual(second);
      expect(first).toEqual(["A", "B"]);
    });
  });
});

describe("selectTopSocialKRows (social/export ranking)", () => {
  it("ranks by absolute projection difference, not projected Ks or matchup score", () => {
    const rows = [
      // Highest projectedKs and highest matchup score, but the smallest edge -- should NOT rank first.
      makeRow({ pitcher: "HighKsSmallEdge", projectedKs: 9.0, kLine: 8.8, strikeoutMatchupScore: 95 }),
      // Lower projectedKs and lower matchup score, but the biggest edge -- should rank first.
      makeRow({ pitcher: "LowKsBigEdge", projectedKs: 4.0, kLine: 6.5, strikeoutMatchupScore: 40 }),
    ];
    const top = selectTopSocialKRows(rows, 5);
    expect(top[0].pitcher).toBe("LowKsBigEdge");
    expect(top[1].pitcher).toBe("HighKsSmallEdge");
  });

  it("excludes rows with missing/invalid projection or line entirely", () => {
    const rows = [
      makeRow({ pitcher: "Valid", projectedKs: 7.0, kLine: 6.0 }),
      makeRow({ pitcher: "NoLine", projectedKs: 7.0, kLine: null }),
      makeRow({ pitcher: "NoProjection", projectedKs: null, kLine: 6.0 }),
    ];
    const top = selectTopSocialKRows(rows, 5);
    expect(top.map((r) => r.pitcher)).toEqual(["Valid"]);
  });

  it("returns an empty array (for an explicit unavailable state) when there are no valid rows at all", () => {
    const rows = [
      makeRow({ pitcher: "NoLine", projectedKs: 7.0, kLine: null }),
      makeRow({ pitcher: "NoProjection", projectedKs: null, kLine: 6.0 }),
    ];
    expect(selectTopSocialKRows(rows, 5)).toEqual([]);
  });

  it("respects the limit parameter", () => {
    const rows = Array.from({ length: 8 }, (_, i) => makeRow({ pitcher: `P${i}`, projectedKs: 5 + i, kLine: 5 }));
    expect(selectTopSocialKRows(rows, 5)).toHaveLength(5);
  });
});

describe("selectTopProjectedKRows (morning 'Strikeout Model Leaders' ranking)", () => {
  it("ranks by highest projected Ks, not market edge or matchup score", () => {
    const rows = [
      // Smallest projectedKs but the biggest edge -- must NOT rank first here (that's selectTopSocialKRows's job).
      makeRow({ pitcher: "LowKsBigEdge", projectedKs: 4.0, kLine: 6.5, strikeoutMatchupScore: 95 }),
      // Highest projectedKs -- must rank first for the morning "most strikeouts" policy.
      makeRow({ pitcher: "HighKsSmallEdge", projectedKs: 9.0, kLine: 8.8, strikeoutMatchupScore: 40 }),
    ];
    const top = selectTopProjectedKRows(rows, 5);
    expect(top[0].pitcher).toBe("HighKsSmallEdge");
    expect(top[1].pitcher).toBe("LowKsBigEdge");
  });

  it("includes rows with no market line yet, unlike selectTopSocialKRows", () => {
    const rows = [makeRow({ pitcher: "NoLineYet", projectedKs: 7.5, kLine: null })];
    expect(selectTopSocialKRows(rows, 5)).toEqual([]);
    expect(selectTopProjectedKRows(rows, 5).map((r) => r.pitcher)).toEqual(["NoLineYet"]);
  });

  it("excludes rows with no real projection at all", () => {
    const rows = [
      makeRow({ pitcher: "HasProjection", projectedKs: 6.0, kLine: null }),
      makeRow({ pitcher: "NoProjection", projectedKs: null, kLine: null }),
    ];
    expect(selectTopProjectedKRows(rows, 5).map((r) => r.pitcher)).toEqual(["HasProjection"]);
  });

  it("excludes rows the model flags as data-quality-ineligible even with a high projection", () => {
    const rows = [
      makeRow({ pitcher: "Eligible", projectedKs: 6.0, kLine: 5.5 }),
      // A real line + projection, but publicRecommendationEligible=false must still be excluded.
      makeRow({ pitcher: "Ineligible", projectedKs: 9.0, kLine: 8.0, publicRecommendationEligible: false }),
    ];
    expect(selectTopProjectedKRows(rows, 5).map((r) => r.pitcher)).toEqual(["Eligible"]);
  });

  it("respects the limit parameter", () => {
    const rows = Array.from({ length: 8 }, (_, i) => makeRow({ pitcher: `P${i}`, projectedKs: 5 + i, kLine: null }));
    expect(selectTopProjectedKRows(rows, 5)).toHaveLength(5);
  });
});
