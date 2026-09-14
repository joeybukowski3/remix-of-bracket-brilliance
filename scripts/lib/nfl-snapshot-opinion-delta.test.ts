import { describe, expect, it } from "vitest";
import { classifySideOpinionChange, classifyTotalOpinionChange } from "./nfl-snapshot-opinion-delta";
import type { SideOpinionState, TotalOpinionState } from "./nfl-snapshot-types";

const HOME_LINE = { homeLine: 3, awayLine: -3 };

function side(overrides: Partial<SideOpinionState>): SideOpinionState {
  return { lean: "home", confidence: 6, spreadLineAtOpinion: HOME_LINE, ...overrides };
}

function total(overrides: Partial<TotalOpinionState>): TotalOpinionState {
  return { lean: "under", confidence: 5, totalLineAtOpinion: 44.5, ...overrides };
}

describe("classifySideOpinionChange", () => {
  it("11. an unchanged lean with unchanged confidence classifies as 'none' -- a fully valid outcome", () => {
    expect(classifySideOpinionChange(side({}), side({}))).toBe("none");
  });

  it("12. a confidence increase with the same lean preserves the prior confidence in the assessment inputs and classifies as 'strengthened'", () => {
    const previous = side({ confidence: 6 });
    const current = side({ confidence: 7 });
    expect(classifySideOpinionChange(previous, current)).toBe("strengthened");
    // The caller (snapshot writer) is responsible for storing both -- this assertion documents that
    // the classifier itself never discards the previous value it was given.
    expect(previous.confidence).toBe(6);
  });

  it("13. a confidence decrease with the same lean preserves the prior confidence and classifies as 'weakened'", () => {
    const previous = side({ confidence: 7 });
    const current = side({ confidence: 5 });
    expect(classifySideOpinionChange(previous, current)).toBe("weakened");
    expect(previous.confidence).toBe(7);
  });

  it("14. a home<->away lean change classifies as 'changed_side'", () => {
    expect(classifySideOpinionChange(side({ lean: "home" }), side({ lean: "away", spreadLineAtOpinion: { homeLine: -3, awayLine: 3 } }))).toBe("changed_side");
  });

  it("15. moving from a play (home/away) to pass classifies as 'moved_to_pass'", () => {
    expect(classifySideOpinionChange(side({ lean: "home", confidence: 7 }), side({ lean: "pass", confidence: null }))).toBe("moved_to_pass");
  });

  it("16. moving from pass back to a play classifies as 'pass_to_play'", () => {
    expect(classifySideOpinionChange(side({ lean: "pass", confidence: null }), side({ lean: "away", confidence: 6, spreadLineAtOpinion: { homeLine: -3, awayLine: 3 } }))).toBe("pass_to_play");
  });

  it("17. no-material-change is representable: unchanged lean, unchanged (even null) confidence never forces a fabricated change", () => {
    expect(classifySideOpinionChange(side({ lean: "pass", confidence: null }), side({ lean: "pass", confidence: null }))).toBe("none");
  });

  it("treats a transition through 'undecided' as changed_side, never silently as 'none'", () => {
    expect(classifySideOpinionChange(side({ lean: "undecided", confidence: null }), side({ lean: "home", confidence: 6 }))).toBe("changed_side");
  });
});

describe("classifyTotalOpinionChange", () => {
  it("classifies an unchanged over/under lean as 'none'", () => {
    expect(classifyTotalOpinionChange(total({}), total({}))).toBe("none");
  });

  it("classifies over<->under as 'changed_total'", () => {
    expect(classifyTotalOpinionChange(total({ lean: "under" }), total({ lean: "over" }))).toBe("changed_total");
  });

  it("classifies a move to pass as 'moved_to_pass' and back as 'pass_to_play'", () => {
    expect(classifyTotalOpinionChange(total({ lean: "over", confidence: 6 }), total({ lean: "pass", confidence: null }))).toBe("moved_to_pass");
    expect(classifyTotalOpinionChange(total({ lean: "pass", confidence: null }), total({ lean: "under", confidence: 5 }))).toBe("pass_to_play");
  });
});
