import { describe, expect, it } from "vitest";
import { DEFENSE_POSITION_RANKS, SIMULATION_PLAYERS } from "../data";
import { OPPONENT_NAMES } from "../data/opponentNames";
import { simulateAutomaticDraft } from "../engine/cpuDraft";
import {
  IntegrityError,
  assertDraftIntegrity,
  assertLineupIntegrity,
  assertNflMatchupConsistency,
  assertScoreReconciliation,
} from "../engine/integrityChecks";
import { LINEUP_SLOTS, optimizeLineup } from "../engine/lineupOptimizer";
import { buildMatchupLineupEntries } from "../engine/matchupBoxScore";
import { simulateSeason } from "../engine/seasonSimulation";
import type { SimulationPlayer, WeeklyLineup } from "../types";

const draft = simulateAutomaticDraft(SIMULATION_PLAYERS, 5, "integrity-roster");
const draftedPlayerIds = new Set(draft.selections.map((selection) => selection.playerId));
const names = OPPONENT_NAMES.map((entry) => entry.name);

describe("16-0 draft-level integrity", () => {
  it("passes for a legal 12-roster, 204-player draft", () => {
    expect(() =>
      assertDraftIntegrity(Object.fromEntries(draft.rosters), draftedPlayerIds),
    ).not.toThrow();
  });

  it("rejects fewer than 12 rosters", () => {
    const rosters = Object.fromEntries(draft.rosters);
    delete rosters[1];
    expect(() => assertDraftIntegrity(rosters, draftedPlayerIds)).toThrow(IntegrityError);
  });

  it("rejects a roster that does not have exactly 17 players", () => {
    const rosters = Object.fromEntries(draft.rosters);
    rosters[1] = rosters[1].slice(0, 16);
    expect(() => assertDraftIntegrity(rosters, draftedPlayerIds)).toThrow(/expected 17/);
  });

  it("rejects the same player appearing on two rosters", () => {
    const rosters: Record<number, readonly SimulationPlayer[]> = Object.fromEntries(draft.rosters);
    const duplicate = rosters[1][0];
    rosters[2] = [...rosters[2].slice(0, 16), duplicate];
    expect(() => assertDraftIntegrity(rosters, draftedPlayerIds)).toThrow(/more than one drafted roster/);
  });

  it("204 unique drafted IDs and 17 unique players per roster hold for a real automatic draft", () => {
    const allIds = new Set<string>();
    for (const [, roster] of draft.rosters) {
      expect(roster).toHaveLength(17);
      expect(new Set(roster.map((player) => player.id)).size).toBe(17);
      for (const player of roster) allIds.add(player.id);
    }
    expect(allIds.size).toBe(204);
  });

  it("no player is duplicated across any two rosters in a real automatic draft", () => {
    const seen = new Set<string>();
    for (const [, roster] of draft.rosters) {
      for (const player of roster) {
        expect(seen.has(player.id)).toBe(false);
        seen.add(player.id);
      }
    }
  });
});

describe("16-0 weekly lineup integrity", () => {
  const userRoster = draft.rosters.get(5)!;
  const userRosterIds = new Set(userRoster.map((player) => player.id));

  it("passes for a normally optimized nine-slot lineup", () => {
    const lineup = optimizeLineup(userRoster, 1, DEFENSE_POSITION_RANKS);
    expect(() =>
      assertLineupIntegrity(lineup, userRosterIds, draftedPlayerIds, "test lineup"),
    ).not.toThrow();
  });

  it("rejects a lineup with an unfilled slot", () => {
    const lineup = optimizeLineup(userRoster, 1, DEFENSE_POSITION_RANKS);
    const broken: WeeklyLineup = { ...lineup, K: null };
    expect(() => assertLineupIntegrity(broken, userRosterIds, draftedPlayerIds, "test lineup")).toThrow(
      /unfilled starting slot/,
    );
  });

  it("rejects a lineup with a duplicate starter", () => {
    const lineup = optimizeLineup(userRoster, 1, DEFENSE_POSITION_RANKS);
    const broken: WeeklyLineup = { ...lineup, RB2: lineup.RB1 };
    expect(() => assertLineupIntegrity(broken, userRosterIds, draftedPlayerIds, "test lineup")).toThrow(
      /duplicate starter/,
    );
  });

  it("rejects a starter that is drafted but not on the claimed roster (illegally borrowed)", () => {
    const lineup = optimizeLineup(userRoster, 1, DEFENSE_POSITION_RANKS);
    const otherDrafted = SIMULATION_PLAYERS.find(
      (player) => draftedPlayerIds.has(player.id) && !userRosterIds.has(player.id),
    )!;
    const broken: WeeklyLineup = { ...lineup, K: otherDrafted };
    expect(() => assertLineupIntegrity(broken, userRosterIds, draftedPlayerIds, "test lineup")).toThrow(
      /actually a drafted player/,
    );
  });

  it("allows an undrafted free agent to stand in as a temporary replacement", () => {
    const lineup = optimizeLineup(userRoster, 1, DEFENSE_POSITION_RANKS);
    const freeAgent = SIMULATION_PLAYERS.find(
      (player) => !draftedPlayerIds.has(player.id) && player.position === lineup.K!.position,
    )!;
    const withReplacement: WeeklyLineup = { ...lineup, K: freeAgent };
    expect(() =>
      assertLineupIntegrity(withReplacement, userRosterIds, draftedPlayerIds, "test lineup"),
    ).not.toThrow();
  });
});

describe("16-0 score reconciliation", () => {
  const userRoster = draft.rosters.get(5)!;
  const userRosterIds = new Set(userRoster.map((player) => player.id));

  it("passes when the sum of entry points matches the team score exactly", () => {
    const lineup = optimizeLineup(userRoster, 1, DEFENSE_POSITION_RANKS);
    const slotScores = Object.fromEntries(LINEUP_SLOTS.map((slot) => [slot, 10])) as Record<
      (typeof LINEUP_SLOTS)[number],
      number
    >;
    const entries = buildMatchupLineupEntries(lineup, slotScores, 1, userRosterIds);
    expect(() => assertScoreReconciliation(entries, 90, "test score")).not.toThrow();
  });

  it("rejects a mismatched team score", () => {
    const lineup = optimizeLineup(userRoster, 1, DEFENSE_POSITION_RANKS);
    const slotScores = Object.fromEntries(LINEUP_SLOTS.map((slot) => [slot, 10])) as Record<
      (typeof LINEUP_SLOTS)[number],
      number
    >;
    const entries = buildMatchupLineupEntries(lineup, slotScores, 1, userRosterIds);
    expect(() => assertScoreReconciliation(entries, 999, "test score")).toThrow(
      /does not match the stored team score/,
    );
  });
});

describe("16-0 NFL matchup consistency", () => {
  const userRoster = draft.rosters.get(5)!;
  const userRosterIds = new Set(userRoster.map((player) => player.id));

  it("passes when the displayed opponent matches weeklyOpponents for the week", () => {
    const lineup = optimizeLineup(userRoster, 1, DEFENSE_POSITION_RANKS);
    const slotScores = Object.fromEntries(LINEUP_SLOTS.map((slot) => [slot, 10])) as Record<
      (typeof LINEUP_SLOTS)[number],
      number
    >;
    const entries = buildMatchupLineupEntries(lineup, slotScores, 1, userRosterIds);
    for (const slot of LINEUP_SLOTS) {
      const entry = entries.find((candidate) => candidate.slot === slot)!;
      expect(() =>
        assertNflMatchupConsistency(entry, lineup[slot]!, 1, "test entry"),
      ).not.toThrow();
    }
  });

  it("rejects a tampered opponent code", () => {
    const lineup = optimizeLineup(userRoster, 1, DEFENSE_POSITION_RANKS);
    const slotScores = Object.fromEntries(LINEUP_SLOTS.map((slot) => [slot, 10])) as Record<
      (typeof LINEUP_SLOTS)[number],
      number
    >;
    const entries = buildMatchupLineupEntries(lineup, slotScores, 1, userRosterIds);
    const tampered = { ...entries[0], nflOpponent: "ZZZ" };
    expect(() => assertNflMatchupConsistency(tampered, lineup[tampered.slot]!, 1, "test entry")).toThrow(
      /does not match weekly data/,
    );
  });
});

describe("16-0 full-season integrity (end-to-end)", () => {
  it("simulates a complete season without tripping any integrity assertion", () => {
    expect(() =>
      simulateSeason({
        roster: draft.rosters.get(5)!,
        userSlot: 5,
        allRosters: Object.fromEntries(draft.rosters),
        playerUniverse: SIMULATION_PLAYERS,
        draftedPlayerIds,
        defenseRanks: DEFENSE_POSITION_RANKS,
        opponentNames: names,
        seed: "integrity-season",
      }),
    ).not.toThrow();
  });

  it("rejects a corrupted allRosters map before simulating", () => {
    const rosters = Object.fromEntries(draft.rosters);
    rosters[1] = rosters[1].slice(0, 16);
    expect(() =>
      simulateSeason({
        roster: draft.rosters.get(5)!,
        userSlot: 5,
        allRosters: rosters,
        playerUniverse: SIMULATION_PLAYERS,
        draftedPlayerIds,
        defenseRanks: DEFENSE_POSITION_RANKS,
        opponentNames: names,
        seed: "integrity-season-corrupt",
      }),
    ).toThrow(IntegrityError);
  });
});
