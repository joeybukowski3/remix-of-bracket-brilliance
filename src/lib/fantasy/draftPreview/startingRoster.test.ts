import { describe, expect, it } from "vitest";
import { addPlayerToRound, createEmptyMyDraftState, removePlayerFromRound, type MyDraftState } from "@/lib/fantasy/draftPreview/myDraft";
import { computeStartingRoster, computeStartingRosterTotals, STARTING_ROSTER_SLOT_ORDER } from "@/lib/fantasy/draftPreview/startingRoster";
import { makeDraftPreviewRow } from "@/lib/fantasy/draftPreview/testFixtures";

function slotPlayer(roster: ReturnType<typeof computeStartingRoster>, slot: string): string | null {
  return roster.find((entry) => entry.slot === slot)?.row?.player ?? null;
}

describe("STARTING_ROSTER_SLOT_ORDER", () => {
  it("is the exact 16-slot structure: QB, RB1/RB2, WR1/WR2, FLEX1/FLEX2, K, DST, BENCH1-7", () => {
    expect(STARTING_ROSTER_SLOT_ORDER).toEqual([
      "QB", "RB1", "RB2", "WR1", "WR2", "FLEX1", "FLEX2", "K", "DST",
      "BENCH1", "BENCH2", "BENCH3", "BENCH4", "BENCH5", "BENCH6", "BENCH7",
    ]);
  });
});

describe("computeStartingRoster", () => {
  it("assigns the highest-JKB-Proj-PPG player at each required slot, and FLEX from the best remaining RB/WR/TE", () => {
    let state: MyDraftState = createEmptyMyDraftState();
    state = addPlayerToRound(state, 1, makeDraftPreviewRow({ sleeperRank: 1, player: "QB1", rosterPosition: "QB", jkbProjectedPpg: 20, jkbParPerGame: 5 }));
    state = addPlayerToRound(state, 2, makeDraftPreviewRow({ sleeperRank: 2, player: "RB1", rosterPosition: "RB", jkbProjectedPpg: 18, jkbParPerGame: 6 }));
    state = addPlayerToRound(state, 3, makeDraftPreviewRow({ sleeperRank: 3, player: "RB2", rosterPosition: "RB", jkbProjectedPpg: 15, jkbParPerGame: 4 }));
    state = addPlayerToRound(state, 4, makeDraftPreviewRow({ sleeperRank: 4, player: "RB3 flex", rosterPosition: "RB", jkbProjectedPpg: 13, jkbParPerGame: 2 }));
    state = addPlayerToRound(state, 5, makeDraftPreviewRow({ sleeperRank: 5, player: "WR1", rosterPosition: "WR", jkbProjectedPpg: 17, jkbParPerGame: 5 }));
    state = addPlayerToRound(state, 6, makeDraftPreviewRow({ sleeperRank: 6, player: "WR2", rosterPosition: "WR", jkbProjectedPpg: 14, jkbParPerGame: 3 }));
    state = addPlayerToRound(state, 7, makeDraftPreviewRow({ sleeperRank: 7, player: "WR3 bench", rosterPosition: "WR", jkbProjectedPpg: 6, jkbParPerGame: -1 }));
    state = addPlayerToRound(state, 8, makeDraftPreviewRow({ sleeperRank: 8, player: "TE1 flex", rosterPosition: "TE", jkbProjectedPpg: 12, jkbParPerGame: 1 }));

    const roster = computeStartingRoster(state);
    expect(slotPlayer(roster, "QB")).toBe("QB1");
    expect(slotPlayer(roster, "RB1")).toBe("RB1");
    expect(slotPlayer(roster, "RB2")).toBe("RB2");
    expect(slotPlayer(roster, "WR1")).toBe("WR1");
    expect(slotPlayer(roster, "WR2")).toBe("WR2");
    // FLEX pulls the best remaining RB/WR/TE by PPG: RB3(13) and TE1(12) beat WR3(6).
    expect(slotPlayer(roster, "FLEX1")).toBe("RB3 flex");
    expect(slotPlayer(roster, "FLEX2")).toBe("TE1 flex");
    expect(slotPlayer(roster, "BENCH1")).toBe("WR3 bench");
  });

  it("only fills K with a rosterPosition K player, and DST with a rosterPosition DST player -- never cross-eligible", () => {
    let state: MyDraftState = createEmptyMyDraftState();
    state = addPlayerToRound(state, 1, makeDraftPreviewRow({ sleeperRank: 1, player: "Kicker", rosterPosition: "K", canonicalPosition: null, jkbProjectedPpg: undefined }));
    state = addPlayerToRound(state, 2, makeDraftPreviewRow({ sleeperRank: 2, player: "Defense", rosterPosition: "DST", canonicalPosition: null, jkbProjectedPpg: undefined }));
    state = addPlayerToRound(state, 3, makeDraftPreviewRow({ sleeperRank: 3, player: "RB1", rosterPosition: "RB", jkbProjectedPpg: 15 }));

    const roster = computeStartingRoster(state);
    expect(slotPlayer(roster, "K")).toBe("Kicker");
    expect(slotPlayer(roster, "DST")).toBe("Defense");
    expect(slotPlayer(roster, "RB1")).toBe("RB1"); // the RB fills its own RB slot, never K/DST
  });

  it("shows N/A-worthy (undefined) JKB PPG/PAR for K/DST rather than fabricating a value", () => {
    let state: MyDraftState = createEmptyMyDraftState();
    state = addPlayerToRound(state, 1, makeDraftPreviewRow({ sleeperRank: 1, player: "Kicker", rosterPosition: "K", canonicalPosition: null, jkbProjectedPpg: undefined, jkbParPerGame: undefined }));
    const roster = computeStartingRoster(state);
    const kSlot = roster.find((entry) => entry.slot === "K");
    expect(kSlot?.row?.jkbProjectedPpg).toBeUndefined();
    expect(kSlot?.row?.jkbParPerGame).toBeUndefined();
  });

  it("uses lowest Sleeper Rank as the deterministic tie-break when two K rows are drafted", () => {
    let state: MyDraftState = createEmptyMyDraftState();
    state = addPlayerToRound(state, 1, makeDraftPreviewRow({ sleeperRank: 50, player: "Later K", rosterPosition: "K", canonicalPosition: null }));
    state = addPlayerToRound(state, 2, makeDraftPreviewRow({ sleeperRank: 10, player: "Earlier K", rosterPosition: "K", canonicalPosition: null }));
    const roster = computeStartingRoster(state);
    expect(slotPlayer(roster, "K")).toBe("Earlier K");
    expect(slotPlayer(roster, "BENCH1")).toBe("Later K");
  });

  it("leaves a slot empty rather than starting a player with no JKB Proj PPG", () => {
    let state: MyDraftState = createEmptyMyDraftState();
    state = addPlayerToRound(state, 1, makeDraftPreviewRow({ sleeperRank: 1, player: "No JKB QB", rosterPosition: "QB", jkbProjectedPpg: undefined }));
    const roster = computeStartingRoster(state);
    expect(slotPlayer(roster, "QB")).toBeNull();
    expect(slotPlayer(roster, "BENCH1")).toBe("No JKB QB");
  });

  it("reflows the roster after a player is removed", () => {
    let state: MyDraftState = createEmptyMyDraftState();
    state = addPlayerToRound(state, 1, makeDraftPreviewRow({ sleeperRank: 1, player: "RB Starter", rosterPosition: "RB", jkbProjectedPpg: 18 }));
    state = addPlayerToRound(state, 2, makeDraftPreviewRow({ sleeperRank: 2, player: "RB Bench", rosterPosition: "RB", jkbProjectedPpg: 5 }));
    expect(slotPlayer(computeStartingRoster(state), "RB1")).toBe("RB Starter");

    state = removePlayerFromRound(state, 1);
    const rosterAfter = computeStartingRoster(state);
    expect(slotPlayer(rosterAfter, "RB1")).toBe("RB Bench");
  });

  it("returns every slot with a null row for an empty draft", () => {
    const roster = computeStartingRoster(createEmptyMyDraftState());
    expect(roster).toHaveLength(16);
    expect(roster.every((entry) => entry.row === null)).toBe(true);
  });
});

describe("computeStartingRosterTotals", () => {
  it("sums PPG/PAR across occupied starter slots only, excluding bench", () => {
    let state: MyDraftState = createEmptyMyDraftState();
    state = addPlayerToRound(state, 1, makeDraftPreviewRow({ sleeperRank: 1, player: "QB1", rosterPosition: "QB", jkbProjectedPpg: 20, jkbParPerGame: 5 }));
    state = addPlayerToRound(state, 2, makeDraftPreviewRow({ sleeperRank: 2, player: "RB-A", rosterPosition: "RB", jkbProjectedPpg: 18, jkbParPerGame: 6 }));
    state = addPlayerToRound(state, 3, makeDraftPreviewRow({ sleeperRank: 3, player: "RB-B", rosterPosition: "RB", jkbProjectedPpg: 15, jkbParPerGame: 4 }));
    state = addPlayerToRound(state, 4, makeDraftPreviewRow({ sleeperRank: 4, player: "WR-A", rosterPosition: "WR", jkbProjectedPpg: 17, jkbParPerGame: 5 }));
    state = addPlayerToRound(state, 5, makeDraftPreviewRow({ sleeperRank: 5, player: "WR-B", rosterPosition: "WR", jkbProjectedPpg: 14, jkbParPerGame: 3 }));
    state = addPlayerToRound(state, 6, makeDraftPreviewRow({ sleeperRank: 6, player: "TE-A flex", rosterPosition: "TE", jkbProjectedPpg: 12, jkbParPerGame: 2 }));
    state = addPlayerToRound(state, 7, makeDraftPreviewRow({ sleeperRank: 7, player: "RB-C flex", rosterPosition: "RB", jkbProjectedPpg: 10, jkbParPerGame: 1 }));
    state = addPlayerToRound(state, 8, makeDraftPreviewRow({ sleeperRank: 8, player: "Bench WR", rosterPosition: "WR", jkbProjectedPpg: 1, jkbParPerGame: -5 }));

    const roster = computeStartingRoster(state);
    expect(slotPlayer(roster, "BENCH1")).toBe("Bench WR");
    const totals = computeStartingRosterTotals(roster);
    expect(totals.starterCount).toBe(7);
    expect(totals.startingLineupProjectedPpg).toBeCloseTo(20 + 18 + 15 + 17 + 14 + 12 + 10, 5);
    expect(totals.startingLineupTotalPar).toBeCloseTo(5 + 6 + 4 + 5 + 3 + 2 + 1, 5);
  });

  it("excludes missing JKB PAR/G from the sum rather than treating it as 0", () => {
    let state: MyDraftState = createEmptyMyDraftState();
    state = addPlayerToRound(state, 1, makeDraftPreviewRow({ sleeperRank: 1, player: "QB1", rosterPosition: "QB", jkbProjectedPpg: 20, jkbParPerGame: undefined }));
    const totals = computeStartingRosterTotals(computeStartingRoster(state));
    expect(totals.startingLineupProjectedPpg).toBe(20);
    expect(totals.startingLineupTotalPar).toBeNull();
  });

  it("returns null totals for an empty roster", () => {
    const totals = computeStartingRosterTotals(computeStartingRoster(createEmptyMyDraftState()));
    expect(totals.starterCount).toBe(0);
    expect(totals.startingLineupProjectedPpg).toBeNull();
    expect(totals.startingLineupTotalPar).toBeNull();
  });
});
