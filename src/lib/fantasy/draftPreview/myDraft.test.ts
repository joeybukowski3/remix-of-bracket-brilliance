import { describe, expect, it } from "vitest";
import {
  addPlayerToRound,
  computeMyDraftTotals,
  createEmptyMyDraftState,
  draftedRoundForPlayer,
  isPlayerDrafted,
  removePlayerFromRound,
  resetMyDraftState,
} from "@/lib/fantasy/draftPreview/myDraft";
import { makeDraftPreviewRow } from "@/lib/fantasy/draftPreview/testFixtures";

describe("addPlayerToRound / removePlayerFromRound", () => {
  it("adds a player to the given round without touching other rounds", () => {
    const bijan = makeDraftPreviewRow({ sleeperRank: 2, player: "Bijan Robinson", canonicalPosition: "RB" });
    const ajBrown = makeDraftPreviewRow({ sleeperRank: 20, player: "A.J. Brown", canonicalPosition: "WR" });
    let state = createEmptyMyDraftState();
    state = addPlayerToRound(state, 1, bijan);
    state = addPlayerToRound(state, 2, ajBrown);

    expect(state.get(1)?.player).toBe("Bijan Robinson");
    expect(state.get(2)?.player).toBe("A.J. Brown");
    expect(state.size).toBe(2);
  });

  it("does not mutate the previous state object (immutable update)", () => {
    const row = makeDraftPreviewRow({ sleeperRank: 2, player: "Bijan Robinson" });
    const before = createEmptyMyDraftState();
    const after = addPlayerToRound(before, 1, row);
    expect(before.size).toBe(0);
    expect(after.size).toBe(1);
  });

  it("replaces a round's player when a new player is added to the same round", () => {
    const first = makeDraftPreviewRow({ sleeperRank: 2, player: "First Pick" });
    const second = makeDraftPreviewRow({ sleeperRank: 5, player: "Second Pick" });
    let state = createEmptyMyDraftState();
    state = addPlayerToRound(state, 1, first);
    state = addPlayerToRound(state, 1, second);
    expect(state.get(1)?.player).toBe("Second Pick");
    expect(state.size).toBe(1);
  });

  it("removes a player from a round, restoring it to empty, without corrupting other rounds", () => {
    const bijan = makeDraftPreviewRow({ sleeperRank: 2, player: "Bijan Robinson" });
    const ajBrown = makeDraftPreviewRow({ sleeperRank: 20, player: "A.J. Brown" });
    let state = createEmptyMyDraftState();
    state = addPlayerToRound(state, 1, bijan);
    state = addPlayerToRound(state, 2, ajBrown);
    state = removePlayerFromRound(state, 1);

    expect(state.has(1)).toBe(false);
    expect(state.get(2)?.player).toBe("A.J. Brown");
  });
});

describe("resetMyDraftState", () => {
  it("returns an empty state", () => {
    expect(resetMyDraftState().size).toBe(0);
  });
});

describe("isPlayerDrafted / draftedRoundForPlayer", () => {
  it("reports a player as drafted once added, and not before", () => {
    const row = makeDraftPreviewRow({ sleeperRank: 42, player: "Someone" });
    let state = createEmptyMyDraftState();
    expect(isPlayerDrafted(state, 42)).toBe(false);
    state = addPlayerToRound(state, 3, row);
    expect(isPlayerDrafted(state, 42)).toBe(true);
    expect(draftedRoundForPlayer(state, 42)).toBe(3);
  });

  it("returns null for a player not in the draft", () => {
    expect(draftedRoundForPlayer(createEmptyMyDraftState(), 99)).toBeNull();
  });
});

describe("computeMyDraftTotals", () => {
  it("counts players by position", () => {
    let state = createEmptyMyDraftState();
    state = addPlayerToRound(state, 1, makeDraftPreviewRow({ sleeperRank: 1, player: "RB1", canonicalPosition: "RB" }));
    state = addPlayerToRound(state, 2, makeDraftPreviewRow({ sleeperRank: 2, player: "RB2", canonicalPosition: "RB" }));
    state = addPlayerToRound(state, 3, makeDraftPreviewRow({ sleeperRank: 3, player: "WR1", canonicalPosition: "WR" }));

    const totals = computeMyDraftTotals(state);
    expect(totals.playersDrafted).toBe(3);
    expect(totals.countsByPosition).toEqual({ QB: 0, RB: 2, WR: 1, TE: 0 });
  });

  it("sums Sleeper projected points across every drafted player (always present)", () => {
    let state = createEmptyMyDraftState();
    state = addPlayerToRound(state, 1, makeDraftPreviewRow({ sleeperRank: 1, player: "A", sleeperProjectedPoints: 300 }));
    state = addPlayerToRound(state, 2, makeDraftPreviewRow({ sleeperRank: 2, player: "B", sleeperProjectedPoints: 250 }));
    expect(computeMyDraftTotals(state).totalSleeperProjectedPoints).toBe(550);
  });

  it("excludes missing JKB PPG/PAR from totals rather than treating them as 0", () => {
    let state = createEmptyMyDraftState();
    state = addPlayerToRound(
      state,
      1,
      makeDraftPreviewRow({ sleeperRank: 1, player: "Has JKB", jkbProjectedPpg: 18, jkbParPerGame: 6 }),
    );
    state = addPlayerToRound(
      state,
      2,
      makeDraftPreviewRow({ sleeperRank: 2, player: "No JKB", jkbProjectedPpg: undefined, jkbParPerGame: undefined }),
    );

    const totals = computeMyDraftTotals(state);
    expect(totals.totalJkbProjectedPpg).toBe(18);
    expect(totals.totalJkbParPerGame).toBe(6);
  });

  it("returns null totals (not 0) when no drafted player has a JKB join", () => {
    let state = createEmptyMyDraftState();
    state = addPlayerToRound(
      state,
      1,
      makeDraftPreviewRow({ sleeperRank: 1, player: "No JKB", jkbProjectedPpg: undefined, jkbParPerGame: undefined }),
    );
    const totals = computeMyDraftTotals(state);
    expect(totals.totalJkbProjectedPpg).toBeNull();
    expect(totals.totalJkbParPerGame).toBeNull();
  });

  it("returns zeroed totals for an empty draft", () => {
    const totals = computeMyDraftTotals(createEmptyMyDraftState());
    expect(totals.playersDrafted).toBe(0);
    expect(totals.totalSleeperProjectedPoints).toBe(0);
    expect(totals.totalJkbProjectedPpg).toBeNull();
    expect(totals.totalJkbParPerGame).toBeNull();
  });
});
