import { describe, expect, it } from "vitest";
import {
  calibratedTdProbability,
  deriveTeamChanged,
  dedupeAppendOnly,
  earlySeasonFlag,
  gradeActualTd,
  noVigOverProbability,
  resolveCandidateCalibrator,
  snapshotKey,
  weekBand,
} from "./nfl-td-forward-core.mjs";

const ARTIFACT = {
  method: "global-logistic",
  version: "td-score-calibrator-candidate-trailing8-2022-2024",
  trailingWindowStrategy: "trailing8",
  transform: "x = jkbTdScore / 100",
  coefficients: { intercept: -3.687695, slope: 4.334307 },
  optionalTeamChangedTerm: { coefficients: { a: -3.6702, bScore: 4.3197, cTeamChanged: -0.6617 } },
};

describe("resolveCandidateCalibrator", () => {
  it("derives base + team-changed coefficients from the artifact", () => {
    const c = resolveCandidateCalibrator(ARTIFACT);
    expect(c.version).toBe("td-score-calibrator-candidate-trailing8-2022-2024");
    expect(c.base).toEqual({ intercept: -3.687695, slope: 4.334307 });
    expect(c.teamChanged).toEqual({ a: -3.6702, bScore: 4.3197, cTeamChanged: -0.6617 });
    expect(c.transformDivisor).toBe(100);
  });

  it("throws rather than falling back when base coefficients are absent (no hardcoding from prose)", () => {
    expect(() => resolveCandidateCalibrator({ method: "global-logistic", version: "x" })).toThrow(/not reproducibly present/);
  });

  it("rejects an unsupported method", () => {
    expect(() => resolveCandidateCalibrator({ method: "isotonic", version: "x" })).toThrow(/unsupported method/);
  });

  it("leaves teamChanged null when the artifact has no reproducible team-changed term", () => {
    const { optionalTeamChangedTerm, ...noTc } = ARTIFACT;
    expect(resolveCandidateCalibrator(noTc).teamChanged).toBeNull();
  });
});

describe("calibratedTdProbability", () => {
  const c = resolveCandidateCalibrator(ARTIFACT);

  it("applies the one-parameter base logistic when teamChanged is not a boolean", () => {
    // logit at score 50 -> -3.687695 + 4.334307*0.5 = -1.5205415 -> sigmoid
    const expected = 1 / (1 + Math.exp(1.5205415));
    expect(calibratedTdProbability(c, { jkbTdScore: 50 })).toBeCloseTo(expected, 9);
    expect(calibratedTdProbability(c, { jkbTdScore: 50, teamChanged: null })).toBeCloseTo(expected, 9);
  });

  it("applies the team-changed term exactly as recorded when teamChanged is boolean", () => {
    const x = 0.6;
    const withChange = 1 / (1 + Math.exp(-(-3.6702 + 4.3197 * x - 0.6617)));
    const withoutChange = 1 / (1 + Math.exp(-(-3.6702 + 4.3197 * x)));
    expect(calibratedTdProbability(c, { jkbTdScore: 60, teamChanged: true })).toBeCloseTo(withChange, 9);
    expect(calibratedTdProbability(c, { jkbTdScore: 60, teamChanged: false })).toBeCloseTo(withoutChange, 9);
  });

  it("returns null for a missing score", () => {
    expect(calibratedTdProbability(c, { jkbTdScore: null })).toBeNull();
  });
});

describe("gradeActualTd", () => {
  it("is 1 for a rushing or receiving TD", () => {
    expect(gradeActualTd({ rushingTds: 1, receivingTds: 0 })).toBe(1);
    expect(gradeActualTd({ rushingTds: 0, receivingTds: 2 })).toBe(1);
  });

  it("is 0 for a scoreless rush/rec line even with passing TDs present elsewhere", () => {
    expect(gradeActualTd({ rushingTds: 0, receivingTds: 0 })).toBe(0);
  });

  it("only counts rush + rec — passing/def/ST TDs are never passed into this function", () => {
    // A QB with 3 passing TDs but 0 rush/rec TDs did not score an anytime TD.
    expect(gradeActualTd({ rushingTds: 0, receivingTds: 0 })).toBe(0);
  });

  it("returns null when neither field is present (ungradeable)", () => {
    expect(gradeActualTd({})).toBeNull();
  });
});

describe("weekBand / earlySeasonFlag", () => {
  it("bands weeks", () => {
    expect(weekBand(1)).toBe("w1");
    expect(weekBand(3)).toBe("w2-4");
    expect(weekBand(9)).toBe("w5-plus");
  });
  it("flags weeks 1-4 as early season", () => {
    expect(earlySeasonFlag(4)).toBe(true);
    expect(earlySeasonFlag(5)).toBe(false);
  });
});

describe("deriveTeamChanged", () => {
  it("is true when the most-recent prior game was for another team", () => {
    const prior = [
      { season: 2025, week: 18, team: "nyj" },
      { season: 2024, week: 1, team: "gb" },
    ];
    expect(deriveTeamChanged(prior, "pit")).toBe(true);
  });
  it("is false when the most-recent prior game was for the same team", () => {
    expect(deriveTeamChanged([{ season: 2025, week: 10, team: "pit" }], "pit")).toBe(false);
  });
  it("is null with no usable history", () => {
    expect(deriveTeamChanged([], "pit")).toBeNull();
  });
});

describe("snapshotKey / dedupeAppendOnly", () => {
  it("keys one snapshot per (playerId, gameId, observedAt)", () => {
    expect(snapshotKey({ playerId: "p1", gameId: "g1", observedAt: "t1" })).toBe("p1|g1|t1");
  });

  it("never re-appends an observation already in the archive", () => {
    const existing = [{ playerId: "p1", gameId: "g1", observedAt: "t1" }].map(snapshotKey);
    const candidates = [
      { playerId: "p1", gameId: "g1", observedAt: "t1" }, // dup
      { playerId: "p1", gameId: "g1", observedAt: "t2" }, // new observation time
      { playerId: "p2", gameId: "g1", observedAt: "t1" }, // new player
    ];
    const { toAppend, skipped } = dedupeAppendOnly(existing, candidates, snapshotKey);
    expect(skipped).toBe(1);
    expect(toAppend).toHaveLength(2);
  });
});

describe("noVigOverProbability", () => {
  it("pNoVigOver = pOver / (pOver + pUnder) for a two-sided market", () => {
    // -120 / +100 -> implied 0.5455 / 0.5 -> 0.5217
    expect(noVigOverProbability(-120, 100)).toBeCloseTo(0.54545 / (0.54545 + 0.5), 4);
  });
  it("is null when only one side is present", () => {
    expect(noVigOverProbability(-120, null)).toBeNull();
  });
});
