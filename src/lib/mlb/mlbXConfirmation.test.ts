import { describe, expect, it } from "vitest";
import {
  ConfirmationStatus,
  classifyHitterConfirmation,
  classifyPitcherConfirmation,
  findConfirmedBatter,
  isHitterXEligible,
  isPitcherXEligible,
  isValidBattingOrder,
  matchesCurrentStarter,
  normalizeBoxscoreLineup,
  normalizeLineupStatus,
} from "../../../scripts/lib/mlb-x-confirmation.mjs";

describe("hitter confirmation", () => {
  it("confirmed lineup + valid batting order → CONFIRMED_LINEUP", () => {
    expect(classifyHitterConfirmation({ lineupStatus: "confirmed", battingOrder: 3 })).toBe(
      ConfirmationStatus.CONFIRMED_LINEUP,
    );
  });

  it("projected fallback → PROJECTED, never eligible", () => {
    const row = { lineupStatus: "projected", battingOrder: 2 };
    expect(classifyHitterConfirmation(row)).toBe(ConfirmationStatus.PROJECTED);
    expect(isHitterXEligible(row)).toBe(false);
  });

  it("scratched/out → OUT", () => {
    expect(classifyHitterConfirmation({ lineupStatus: "out", battingOrder: 4 })).toBe(ConfirmationStatus.OUT);
    expect(classifyHitterConfirmation({ lineupStatus: "scratched", battingOrder: 4 })).toBe(ConfirmationStatus.OUT);
  });

  it("unknown status → UNCONFIRMED", () => {
    expect(classifyHitterConfirmation({ lineupStatus: "unknown", battingOrder: null })).toBe(
      ConfirmationStatus.UNCONFIRMED,
    );
    expect(classifyHitterConfirmation({})).toBe(ConfirmationStatus.UNCONFIRMED);
  });

  it("confirmed hitter is eligible only when the game has not started", () => {
    const row = { lineupStatus: "confirmed", battingOrder: 1 };
    expect(isHitterXEligible(row, { gameStarted: false })).toBe(true);
    expect(isHitterXEligible(row, { gameStarted: true })).toBe(false);
  });

  it("batting order outside 1-9 is not a valid confirmed slot", () => {
    expect(isValidBattingOrder(0)).toBe(false);
    expect(isValidBattingOrder(10)).toBe(false);
    expect(isValidBattingOrder(1)).toBe(true);
    expect(isValidBattingOrder(9)).toBe(true);
    expect(isValidBattingOrder(2.5)).toBe(false);
    // confirmed status but bad order → not CONFIRMED_LINEUP
    expect(classifyHitterConfirmation({ lineupStatus: "confirmed", battingOrder: 12 })).toBe(
      ConfirmationStatus.UNCONFIRMED,
    );
  });

  it("normalizeLineupStatus lowercases and trims", () => {
    expect(normalizeLineupStatus("  Confirmed ")).toBe("confirmed");
  });
});

describe("pitcher confirmation", () => {
  it("current starter, game not started → CONFIRMED_STARTER + eligible", () => {
    expect(classifyPitcherConfirmation({ isCurrentStarter: true, gameStarted: false })).toBe(
      ConfirmationStatus.CONFIRMED_STARTER,
    );
    expect(isPitcherXEligible({ isCurrentStarter: true, gameStarted: false })).toBe(true);
  });

  it("not the current starter → UNCONFIRMED, ineligible (replaced/scratched pitcher)", () => {
    expect(isPitcherXEligible({ isCurrentStarter: false, gameStarted: false })).toBe(false);
  });

  it("game started → OUT even if listed", () => {
    expect(classifyPitcherConfirmation({ isCurrentStarter: true, gameStarted: true })).toBe(ConfirmationStatus.OUT);
    expect(isPitcherXEligible({ isCurrentStarter: true, gameStarted: true })).toBe(false);
  });
});

describe("matchesCurrentStarter", () => {
  it("matches by pitcher id when both present", () => {
    expect(
      matchesCurrentStarter({ rowPitcher: "Anybody", rowPitcherId: 592789, currentStarterName: "X", currentStarterId: 592789 }),
    ).toBe(true);
    expect(
      matchesCurrentStarter({ rowPitcher: "Zack Wheeler", rowPitcherId: 111, currentStarterName: "Zack Wheeler", currentStarterId: 222 }),
    ).toBe(false);
  });

  it("falls back to normalized name when ids are missing", () => {
    expect(
      matchesCurrentStarter({ rowPitcher: "Zack Wheeler", rowPitcherId: null, currentStarterName: "zack  wheeler", currentStarterId: null }),
    ).toBe(true);
    expect(
      matchesCurrentStarter({ rowPitcher: "Zack Wheeler", rowPitcherId: null, currentStarterName: "Aaron Nola", currentStarterId: null }),
    ).toBe(false);
  });
});

describe("normalizeBoxscoreLineup", () => {
  function makeBox(order: number[]) {
    const players: Record<string, unknown> = {};
    for (const id of order) players[`ID${id}`] = { person: { fullName: `Player ${id}` } };
    return { battingOrder: order, players };
  }

  it("marks a full 9-deep order confirmed with sequential batting order", () => {
    const lineup = normalizeBoxscoreLineup(makeBox([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    expect(lineup.confirmed).toBe(true);
    expect(lineup.batters).toHaveLength(9);
    expect(lineup.batters[0]).toEqual({ id: 1, name: "Player 1", battingOrder: 1 });
    expect(lineup.batters[8].battingOrder).toBe(9);
  });

  it("treats a partial order as not confirmed", () => {
    const lineup = normalizeBoxscoreLineup(makeBox([1, 2, 3]));
    expect(lineup.confirmed).toBe(false);
  });

  it("empty/missing order is not confirmed", () => {
    expect(normalizeBoxscoreLineup({}).confirmed).toBe(false);
    expect(normalizeBoxscoreLineup(null).confirmed).toBe(false);
  });

  it("findConfirmedBatter matches by id and by name, only when confirmed", () => {
    const lineup = normalizeBoxscoreLineup(makeBox([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    expect(findConfirmedBatter(lineup, { playerId: 3 })?.battingOrder).toBe(3);
    expect(findConfirmedBatter(lineup, { playerName: "Player 5" })?.battingOrder).toBe(5);
    expect(findConfirmedBatter(lineup, { playerId: 99 })).toBeNull();
    const partial = normalizeBoxscoreLineup(makeBox([1, 2]));
    expect(findConfirmedBatter(partial, { playerId: 1 })).toBeNull();
  });
});
