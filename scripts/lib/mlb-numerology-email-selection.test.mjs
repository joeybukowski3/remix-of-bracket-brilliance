import { describe, expect, it } from "vitest";
import { selectNumerologyEmailPlays } from "./mlb-numerology-email-selection.mjs";

function card(scores) {
  return {
    plays: scores.map((score, index) => ({
      player: `Player ${index + 1}`,
      playerId: index + 1,
      team: "NYM",
      numerologyScore: score,
      isTopPlay: false,
    })),
    topPlay: null,
    allQualifiedPlaysOver50: [],
  };
}

describe("selectNumerologyEmailPlays", () => {
  it("uses the top three when fewer than three plays score above 65", () => {
    const selected = selectNumerologyEmailPlays(card([74, 64, 61, 58]));
    expect(selected.allQualifiedPlaysOver50.map((play) => play.numerologyScore)).toEqual([74, 64, 61]);
    expect(selected.emailSelectionPolicy.mode).toBe("top-minimum");
    expect(selected.topPlay.player).toBe("Player 1");
  });

  it("includes every play above 65 when at least three qualify", () => {
    const selected = selectNumerologyEmailPlays(card([82, 76, 71, 68, 65, 64]));
    expect(selected.allQualifiedPlaysOver50.map((play) => play.numerologyScore)).toEqual([82, 76, 71, 68]);
    expect(selected.emailSelectionPolicy.mode).toBe("all-above-threshold");
  });

  it("treats 65 as below the strict over-65 threshold", () => {
    const selected = selectNumerologyEmailPlays(card([70, 66, 65, 64]));
    expect(selected.emailSelectionPolicy.aboveThresholdCount).toBe(2);
    expect(selected.allQualifiedPlaysOver50.map((play) => play.numerologyScore)).toEqual([70, 66, 65]);
  });
});
