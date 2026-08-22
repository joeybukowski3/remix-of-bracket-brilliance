import { describe, expect, it } from "vitest";
import { classifyRawPlayType, classifyResearchPlayCategory, detectKneelOrSpike } from "./classifyPlay";

describe("classifyRawPlayType", () => {
  it("classifies known offensive play types", () => {
    expect(classifyRawPlayType("Rush")).toBe("rush");
    expect(classifyRawPlayType("Pass Reception")).toBe("pass");
    expect(classifyRawPlayType("Sack")).toBe("sack");
    expect(classifyRawPlayType("Punt")).toBe("punt");
    expect(classifyRawPlayType("Kickoff")).toBe("kickoff");
    expect(classifyRawPlayType("Field Goal Good")).toBe("field_goal");
    expect(classifyRawPlayType("Penalty")).toBe("penalty_no_play");
    expect(classifyRawPlayType("Two Point Rush")).toBe("two_point_try");
  });

  it("classifies turnovers distinctly from fumbles recovered by the offense", () => {
    expect(classifyRawPlayType("Interception")).toBe("turnover");
    expect(classifyRawPlayType("Fumble Recovery (Opponent)")).toBe("turnover");
    expect(classifyRawPlayType("Fumble Recovery (Own)")).toBe("rush");
  });

  it("classifies defensive scores", () => {
    expect(classifyRawPlayType("Safety")).toBe("defensive_score");
    expect(classifyRawPlayType("Defensive 2pt Conversion")).toBe("defensive_score");
  });

  it("classifies administrative/non-play markers", () => {
    expect(classifyRawPlayType("Timeout")).toBe("administrative");
    expect(classifyRawPlayType("End Period")).toBe("administrative");
  });

  it("returns unknown for null or unrecognized raw types, never throwing", () => {
    expect(classifyRawPlayType(null)).toBe("unknown");
    expect(classifyRawPlayType("Some New CFBD Type")).toBe("unknown");
  });

  it("PAT is never emitted — CFBD has no distinct extra-point playType in this dataset", () => {
    const allMapped = ["Rush", "Pass Reception", "Sack", "Punt", "Kickoff", "Field Goal Good", "Penalty", "Safety"];
    expect(allMapped.map(classifyRawPlayType)).not.toContain("pat");
  });
});

describe("detectKneelOrSpike", () => {
  it("detects kneel only for rush-classified plays with kneel text", () => {
    expect(detectKneelOrSpike("rush", "Bo Nix kneels for -1 yd")).toBe("kneel");
    expect(detectKneelOrSpike("pass", "Bo Nix kneels for -1 yd")).toBeNull();
  });

  it("detects spike only for pass-classified plays with spike text", () => {
    expect(detectKneelOrSpike("pass", "QB spiked the ball")).toBe("spike");
    expect(detectKneelOrSpike("rush", "QB spiked the ball")).toBeNull();
  });

  it("returns null when there is no text or no match", () => {
    expect(detectKneelOrSpike("rush", null)).toBeNull();
    expect(detectKneelOrSpike("rush", "run up the middle for 4 yds")).toBeNull();
  });
});

describe("classifyResearchPlayCategory", () => {
  it("overrides rush with kneel when playText indicates a kneel-down", () => {
    expect(classifyResearchPlayCategory("Rush", "Team A kneels for -1 yd")).toBe("kneel");
  });

  it("falls back to the base category when playText gives no kneel/spike signal", () => {
    expect(classifyResearchPlayCategory("Rush", "run for 4 yds")).toBe("rush");
  });
});
