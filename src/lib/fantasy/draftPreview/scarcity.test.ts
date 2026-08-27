import { describe, expect, it } from "vitest";
import { computeAllPositionOpportunityCosts, computePositionOpportunityCost } from "@/lib/fantasy/draftPreview/scarcity";
import { computePickWindow } from "@/lib/fantasy/draftPreview/availability";
import { computeSnakeDraftSlotPicks } from "@/lib/fantasy/draftPreview/snakeDraft";
import type { DraftPreviewRow } from "@/lib/fantasy/draftPreview/draftPreviewBoard";
import type { FantasyPosition } from "@/lib/fantasy/rankings";

function makeRow(overrides: Partial<DraftPreviewRow> & { sleeperRank: number; player: string }): DraftPreviewRow {
  return {
    sleeperRank: overrides.sleeperRank,
    player: overrides.player,
    team: overrides.team ?? null,
    sourcePosition: overrides.sourcePosition ?? "RB",
    canonicalPosition: overrides.canonicalPosition ?? "RB",
    bye: overrides.bye ?? null,
    sleeperProjectedPoints: overrides.sleeperProjectedPoints ?? 0,
    sleeperProjectedPpg: overrides.sleeperProjectedPpg ?? 0,
    jkb: overrides.jkb,
    jkbProjectedPpg: overrides.jkbProjectedPpg,
    jkbParPerGame: overrides.jkbParPerGame,
    modelRank: overrides.modelRank ?? null,
    seasonPointsRank2025: overrides.seasonPointsRank2025,
    seasonPpgRank2025: overrides.seasonPpgRank2025,
    lastEightPointsRank: overrides.lastEightPointsRank,
    isDuplicatePresentation: overrides.isDuplicatePresentation ?? false,
  };
}

const SLOT_10_PICKS = computeSnakeDraftSlotPicks(10, 10);
const WINDOW_10_TO_15 = computePickWindow(SLOT_10_PICKS, 0);

describe("computePositionOpportunityCost", () => {
  it("picks the highest PAR/G among rows available now as bestNow", () => {
    const rows: DraftPreviewRow[] = [
      makeRow({ sleeperRank: 5, player: "Already Gone", jkbParPerGame: 20 }), // sleeperRank < currentPick(10) -> excluded
      makeRow({ sleeperRank: 10, player: "Player A", jkbParPerGame: 8.1 }),
      makeRow({ sleeperRank: 12, player: "Player B", jkbParPerGame: 6.5 }),
    ];
    const result = computePositionOpportunityCost(rows, "RB", WINDOW_10_TO_15);
    expect(result.bestNow?.player).toBe("Player A");
    expect(result.bestNow?.parPerGame).toBe(8.1);
  });

  it("picks the highest PAR/G among rows projected available at the next turn as bestNextTurn", () => {
    const rows: DraftPreviewRow[] = [
      makeRow({ sleeperRank: 10, player: "Now Best", jkbParPerGame: 8.1 }),
      makeRow({ sleeperRank: 12, player: "Gone Before Next Turn", jkbParPerGame: 9.9 }), // 10 < 12 < 15
      makeRow({ sleeperRank: 15, player: "Next Turn Best", jkbParPerGame: 5.9 }),
      makeRow({ sleeperRank: 20, player: "Next Turn Runner Up", jkbParPerGame: 4.0 }),
    ];
    const result = computePositionOpportunityCost(rows, "RB", WINDOW_10_TO_15);
    expect(result.bestNextTurn?.player).toBe("Next Turn Best");
    expect(result.bestNextTurn?.parPerGame).toBe(5.9);
  });

  it("computes the exact PAR/G opportunity cost from the worked example (8.1 -> 5.9 = 2.2)", () => {
    const rows: DraftPreviewRow[] = [
      makeRow({ sleeperRank: 10, player: "Player A", jkbParPerGame: 8.1 }),
      makeRow({ sleeperRank: 15, player: "Player B", jkbParPerGame: 5.9 }),
    ];
    const result = computePositionOpportunityCost(rows, "RB", WINDOW_10_TO_15);
    expect(result.opportunityCost).toBeCloseTo(2.2, 10);
    expect(result.insufficientData).toBe(false);
  });

  it("returns insufficient-data (not zero) when no row has a JKB PAR/G join", () => {
    const rows: DraftPreviewRow[] = [
      makeRow({ sleeperRank: 10, player: "No Join", jkbParPerGame: undefined }),
      makeRow({ sleeperRank: 20, player: "Also No Join", jkbParPerGame: undefined }),
    ];
    const result = computePositionOpportunityCost(rows, "RB", WINDOW_10_TO_15);
    expect(result.bestNow).toBeNull();
    expect(result.bestNextTurn).toBeNull();
    expect(result.opportunityCost).toBeNull();
    expect(result.insufficientData).toBe(true);
  });

  it("returns insufficient-data for an empty position", () => {
    const result = computePositionOpportunityCost([], "TE", WINDOW_10_TO_15);
    expect(result.bestNow).toBeNull();
    expect(result.bestNextTurn).toBeNull();
    expect(result.opportunityCost).toBeNull();
    expect(result.insufficientData).toBe(true);
  });

  it("returns insufficient-data (not zero) for a one-player position with no next-turn candidate", () => {
    const rows: DraftPreviewRow[] = [
      makeRow({ sleeperRank: 10, player: "Only One", canonicalPosition: "TE", jkbParPerGame: 7.0 }),
    ];
    const result = computePositionOpportunityCost(rows, "TE", WINDOW_10_TO_15);
    expect(result.bestNow?.player).toBe("Only One");
    expect(result.bestNextTurn).toBeNull();
    expect(result.opportunityCost).toBeNull();
    expect(result.insufficientData).toBe(true);
  });

  it("breaks PAR/G ties by the lower Sleeper Rank", () => {
    const rows: DraftPreviewRow[] = [
      makeRow({ sleeperRank: 12, player: "Higher Rank", jkbParPerGame: 8.1 }),
      makeRow({ sleeperRank: 10, player: "Lower Rank", jkbParPerGame: 8.1 }),
    ];
    const result = computePositionOpportunityCost(rows, "RB", WINDOW_10_TO_15);
    expect(result.bestNow?.player).toBe("Lower Rank");
  });

  it("excludes duplicate presentation rows from both bestNow and bestNextTurn", () => {
    const rows: DraftPreviewRow[] = [
      makeRow({ sleeperRank: 10, player: "Duplicate Listing", jkbParPerGame: 99, isDuplicatePresentation: true }),
      makeRow({ sleeperRank: 11, player: "Real Best", jkbParPerGame: 6.0 }),
    ];
    const result = computePositionOpportunityCost(rows, "RB", WINDOW_10_TO_15);
    expect(result.bestNow?.player).toBe("Real Best");
  });

  it("has no bestNextTurn on the last tracked turn (no next pick to project)", () => {
    const lastWindow = computePickWindow(SLOT_10_PICKS, SLOT_10_PICKS.length - 1);
    const rows: DraftPreviewRow[] = [makeRow({ sleeperRank: 200, player: "Still Around", jkbParPerGame: 3.0 })];
    const result = computePositionOpportunityCost(rows, "RB", lastWindow);
    expect(result.bestNow?.player).toBe("Still Around");
    expect(result.bestNextTurn).toBeNull();
    expect(result.opportunityCost).toBeNull();
    expect(result.insufficientData).toBe(true);
  });
});

describe("computeAllPositionOpportunityCosts", () => {
  it("returns one result per requested position, in order", () => {
    const positions: readonly FantasyPosition[] = ["QB", "RB", "WR", "TE"];
    const results = computeAllPositionOpportunityCosts([], positions, WINDOW_10_TO_15);
    expect(results.map((result) => result.position)).toEqual(["QB", "RB", "WR", "TE"]);
  });
});
