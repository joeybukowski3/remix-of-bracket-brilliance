import { describe, expect, it } from "vitest";
import { computePickWindow, computeRowAvailability } from "@/lib/fantasy/draftPreview/availability";
import { computeSnakeDraftSlotPicks } from "@/lib/fantasy/draftPreview/snakeDraft";

const SLOT_10_PICKS = computeSnakeDraftSlotPicks(10, 10);

describe("computePickWindow", () => {
  it("matches the approved slot-10 pick sequence", () => {
    expect(SLOT_10_PICKS.map((pick) => pick.overallPick)).toEqual([10, 15, 34, 39, 58, 63, 82, 87, 106, 111]);
  });

  it("builds the window for the first turn (10 -> 15)", () => {
    const window = computePickWindow(SLOT_10_PICKS, 0);
    expect(window).toEqual({ round: 1, currentPick: 10, nextPick: 15, opponentPicksBeforeNextTurn: 4 });
  });

  it("builds the window for the second turn (15 -> 34)", () => {
    const window = computePickWindow(SLOT_10_PICKS, 1);
    expect(window).toEqual({ round: 2, currentPick: 15, nextPick: 34, opponentPicksBeforeNextTurn: 18 });
  });

  it("has no next pick on the last tracked turn", () => {
    const window = computePickWindow(SLOT_10_PICKS, SLOT_10_PICKS.length - 1);
    expect(window.currentPick).toBe(111);
    expect(window.nextPick).toBeNull();
    expect(window.opponentPicksBeforeNextTurn).toBeNull();
  });

  it("rejects an out-of-range pick index", () => {
    expect(() => computePickWindow(SLOT_10_PICKS, -1)).toThrow();
    expect(() => computePickWindow(SLOT_10_PICKS, SLOT_10_PICKS.length)).toThrow();
  });
});

describe("computeRowAvailability", () => {
  const window10to15 = computePickWindow(SLOT_10_PICKS, 0);

  it("is available now at the current pick boundary", () => {
    expect(computeRowAvailability(10, window10to15).availableNow).toBe(true);
  });

  it("is not available now just before the current pick", () => {
    expect(computeRowAvailability(9, window10to15).availableNow).toBe(false);
  });

  it("marks ranks 11-14 as projected gone before the next turn (10 -> 15)", () => {
    for (const rank of [11, 12, 13, 14]) {
      const availability = computeRowAvailability(rank, window10to15);
      expect(availability.projectedGoneBeforeNextTurn).toBe(true);
      expect(availability.projectedAvailableNextTurn).toBe(false);
    }
  });

  it("does not mark the current pick itself as projected gone", () => {
    expect(computeRowAvailability(10, window10to15).projectedGoneBeforeNextTurn).toBe(false);
  });

  it("marks rank 15 (the next pick) as projected available next turn, not gone", () => {
    const availability = computeRowAvailability(15, window10to15);
    expect(availability.projectedGoneBeforeNextTurn).toBe(false);
    expect(availability.projectedAvailableNextTurn).toBe(true);
  });

  it("marks ranks well beyond the next pick as projected available next turn", () => {
    expect(computeRowAvailability(50, window10to15).projectedAvailableNextTurn).toBe(true);
  });

  it("marks ranks 16-33 as projected gone before the next turn (15 -> 34)", () => {
    const window15to34 = computePickWindow(SLOT_10_PICKS, 1);
    for (const rank of [16, 20, 33]) {
      expect(computeRowAvailability(rank, window15to34).projectedGoneBeforeNextTurn).toBe(true);
    }
    expect(computeRowAvailability(34, window15to34).projectedAvailableNextTurn).toBe(true);
  });

  it("treats every remaining player as available now, with no gone/next-turn projection, on the last tracked turn", () => {
    const lastWindow = computePickWindow(SLOT_10_PICKS, SLOT_10_PICKS.length - 1);
    const availability = computeRowAvailability(200, lastWindow);
    expect(availability.availableNow).toBe(true);
    expect(availability.projectedGoneBeforeNextTurn).toBe(false);
    expect(availability.projectedAvailableNextTurn).toBe(false);
  });
});
