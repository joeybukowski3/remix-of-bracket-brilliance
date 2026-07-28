import { describe, expect, it } from "vitest";
import { DEFENSE_POSITION_RANKS, SIMULATION_PLAYERS } from "../data";
import { OPPONENT_NAMES } from "../data/opponentNames";
import { simulateAutomaticDraft } from "../engine/cpuDraft";
import { formatScoringTrace, traceWeeklyScoring } from "../engine/scoringTrace";
import { simulateSeason } from "../engine/seasonSimulation";

describe("16-0 dev-only scoring trace", () => {
  it("sums exactly nine starting slots and matches the displayed season week score", () => {
    const seed = "scoring-trace-verification";
    const draftSlot = 5;
    const draft = simulateAutomaticDraft(SIMULATION_PLAYERS, draftSlot, seed);
    const roster = draft.rosters.get(draftSlot)!;
    const draftedPlayerIds = new Set(
      draft.selections.map((selection) => selection.playerId),
    );
    const temporaryReplacementPool = SIMULATION_PLAYERS.filter(
      (player) => player.active && !draftedPlayerIds.has(player.id),
    );

    const week = 3;
    const trace = traceWeeklyScoring({
      roster,
      draftedPlayerIds,
      temporaryReplacementPool,
      week,
      defenseRanks: DEFENSE_POSITION_RANKS,
      seed,
      playerUniverseForTiers: SIMULATION_PLAYERS,
    });

    expect(trace.rows).toHaveLength(9);
    const uniqueSlots = new Set(trace.rows.map((row) => row.slot));
    expect(uniqueSlots.size).toBe(9);

    const season = simulateSeason({
      roster,
      userSlot: draftSlot,
      allRosters: Object.fromEntries(draft.rosters),
      playerUniverse: SIMULATION_PLAYERS,
      draftedPlayerIds,
      defenseRanks: DEFENSE_POSITION_RANKS,
      opponentNames: OPPONENT_NAMES.map((entry) => entry.name),
      seed,
    });
    const weekGame = season.schedule.find((game) => game.fantasyWeek === week)!;

    expect(trace.calculatedTotal).toBeCloseTo(weekGame.userScore!, 5);
    expect(trace.differenceFromDisplayed).toBe(0);

    const formatted = formatScoringTrace(trace);
    expect(formatted).toContain(`Week ${week}`);
    expect(formatted).toContain("Sum of 9 starters");
  });

  it("flags drafted starters vs temporary replacements correctly", () => {
    const seed = "scoring-trace-replacement";
    const draftSlot = 2;
    const draft = simulateAutomaticDraft(SIMULATION_PLAYERS, draftSlot, seed);
    const roster = draft.rosters.get(draftSlot)!;
    const draftedPlayerIds = new Set(
      draft.selections.map((selection) => selection.playerId),
    );
    const temporaryReplacementPool = SIMULATION_PLAYERS.filter(
      (player) => player.active && !draftedPlayerIds.has(player.id),
    );

    const trace = traceWeeklyScoring({
      roster,
      draftedPlayerIds,
      temporaryReplacementPool,
      week: 1,
      defenseRanks: DEFENSE_POSITION_RANKS,
      seed,
      playerUniverseForTiers: SIMULATION_PLAYERS,
    });

    for (const row of trace.rows) {
      expect(row.isDraftedStarter).toBe(draftedPlayerIds.has(row.playerId));
      expect(row.isDraftedStarter).not.toBe(row.isTemporaryReplacement);
    }
  });
});
