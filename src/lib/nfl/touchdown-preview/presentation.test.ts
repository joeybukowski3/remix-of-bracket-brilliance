import { describe, expect, it } from "vitest";
import {
  OPPONENT_POSITION_TD_ALLOWED_LABEL,
  formatTouchdownMatchupLabel,
  touchdownMatchupKey,
} from "./presentation";

describe("touchdownMatchupKey", () => {
  it("is stable regardless of which team is passed first (NE @ SEA)", () => {
    expect(touchdownMatchupKey("ne", "sea")).toBe(touchdownMatchupKey("sea", "ne"));
  });

  it("is stable regardless of which team is passed first for another matchup", () => {
    expect(touchdownMatchupKey("buf", "mia")).toBe(touchdownMatchupKey("mia", "buf"));
  });

  it("normalizes casing and known team aliases through the shared identity normalizer", () => {
    expect(touchdownMatchupKey("NE", "SEA")).toBe(touchdownMatchupKey("ne", "sea"));
    expect(touchdownMatchupKey("LA", "SF")).toBe(touchdownMatchupKey("LAR", "sf"));
    expect(touchdownMatchupKey("WAS", "dal")).toBe(touchdownMatchupKey("wsh", "dal"));
  });

  it("produces the expected canonical key", () => {
    expect(touchdownMatchupKey("sea", "ne")).toBe("ne@sea");
  });
});

describe("formatTouchdownMatchupLabel", () => {
  it("renders a spaced label from the canonical key", () => {
    expect(formatTouchdownMatchupLabel("ne@sea")).toBe("ne @ sea");
  });
});

describe("OPPONENT_POSITION_TD_ALLOWED_LABEL", () => {
  it("labels the QB metric as rushing TD allowance, not a generic TD label", () => {
    expect(OPPONENT_POSITION_TD_ALLOWED_LABEL.QB).toBe("QB Rush TD Allowed");
  });

  it("gives every position a distinct, non-ambiguous label", () => {
    const labels = Object.values(OPPONENT_POSITION_TD_ALLOWED_LABEL);
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) expect(label).not.toBe("TD");
  });
});
