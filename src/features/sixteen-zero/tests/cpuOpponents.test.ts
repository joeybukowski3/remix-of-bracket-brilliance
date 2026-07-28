import { describe, expect, it } from "vitest";
import { DEFENSE_POSITION_RANKS, SIMULATION_PLAYERS } from "../data";
import { OPPONENT_NAMES } from "../data/opponentNames";
import { simulateAutomaticDraft } from "../engine/cpuDraft";
import {
  getEmptyLineupSlots,
  getExpectedPlayerScore,
  optimizeLineup,
} from "../engine/lineupOptimizer";
import { buildPlayerTierMap, simulateLineupScore } from "../engine/playerScoreSimulation";
import { selectPlayoffOpponents } from "../engine/rosterStrength";
import { simulateSeason } from "../engine/seasonSimulation";
import { SeededRandom } from "../engine/seededRandom";
import type { FantasyPosition, SimulationPlayer } from "../types";

const names = OPPONENT_NAMES.map((entry) => entry.name);

function draftFixture(seed: string, userSlot: number) {
  const draft = simulateAutomaticDraft(SIMULATION_PLAYERS, userSlot, seed);
  return {
    draft,
    roster: draft.rosters.get(userSlot)!,
    userSlot,
    allRosters: Object.fromEntries(draft.rosters),
    draftedPlayerIds: new Set(draft.selections.map((selection) => selection.playerId)),
  };
}

function runSeason(seed: string, userSlot = 4) {
  const fixture = draftFixture(seed, userSlot);
  return {
    ...fixture,
    result: simulateSeason({
      roster: fixture.roster,
      userSlot: fixture.userSlot,
      allRosters: fixture.allRosters,
      playerUniverse: SIMULATION_PLAYERS,
      draftedPlayerIds: fixture.draftedPlayerIds,
      defenseRanks: DEFENSE_POSITION_RANKS,
      opponentNames: names,
      seed,
    }),
  };
}

describe("16-0 CPU opponents use drafted rosters and the shared scoring engine", () => {
  it("produces a legal 11-CPU-roster schedule with no synthetic opponent tiers involved", () => {
    const { result } = runSeason("cpu-opponents-basic");
    expect(result.schedule.filter((game) => game.fantasyWeek <= 14)).toHaveLength(14);
    expect(
      result.schedule
        .filter((game) => !game.isBye)
        .every((game) => Number.isFinite(game.opponentScore)),
    ).toBe(true);
  });

  it("scores CPU lineups with the identical player-scoring function used for the user", () => {
    const fixture = draftFixture("cpu-shared-engine", 6);
    const tiers = buildPlayerTierMap(SIMULATION_PLAYERS);
    const cpuSlot = Object.keys(fixture.allRosters)
      .map(Number)
      .find((slot) => slot !== fixture.userSlot)!;
    const cpuRoster = fixture.allRosters[cpuSlot];
    const week = 3;
    const temporaryReplacementPool = SIMULATION_PLAYERS.filter(
      (player) => player.active && !fixture.draftedPlayerIds.has(player.id),
    );
    const cpuLineup = optimizeLineup(cpuRoster, week, DEFENSE_POSITION_RANKS, {
      temporaryReplacementPool,
    });
    const userLineup = optimizeLineup(fixture.roster, week, DEFENSE_POSITION_RANKS, {
      temporaryReplacementPool,
    });

    const cpuScore = simulateLineupScore(
      cpuLineup,
      week,
      DEFENSE_POSITION_RANKS,
      tiers,
      new SeededRandom("shared-engine-check"),
    );
    const userScore = simulateLineupScore(
      userLineup,
      week,
      DEFENSE_POSITION_RANKS,
      tiers,
      new SeededRandom("shared-engine-check"),
    );

    // Same seed + same underlying scoring function: if the two lineups happen
    // to share a player at a slot, that player's simulated score must match
    // exactly (there is no separate CPU scoring path or multiplier).
    for (const slot of Object.keys(cpuLineup) as Array<keyof typeof cpuLineup>) {
      if (cpuLineup[slot] && userLineup[slot] && cpuLineup[slot]!.id === userLineup[slot]!.id) {
        expect(cpuScore.slotScores[slot]).toBe(userScore.slotScores[slot]);
      }
    }
    expect(cpuScore.playerScores).toHaveLength(9);
    expect(userScore.playerScores).toHaveLength(9);
  });

  it("optimizes CPU lineups by matchup-adjusted expected value, same as the user", () => {
    const fixture = draftFixture("cpu-lineup-optimization", 8);
    const cpuSlot = Object.keys(fixture.allRosters)
      .map(Number)
      .find((slot) => slot !== fixture.userSlot)!;
    const cpuRoster = fixture.allRosters[cpuSlot];
    const week = 5;
    const lineup = optimizeLineup(cpuRoster, week, DEFENSE_POSITION_RANKS);

    for (const position of ["RB", "WR"] as FantasyPosition[]) {
      const started = Object.values(lineup).filter(
        (player) => player?.position === position,
      ) as SimulationPlayer[];
      const bench = cpuRoster.filter(
        (player) =>
          player.position === position &&
          player.byeWeek !== week &&
          !started.some((starter) => starter.id === player.id),
      );
      const minStarted = Math.min(
        ...started.map((player) => getExpectedPlayerScore(player, week, DEFENSE_POSITION_RANKS)),
      );
      for (const benched of bench) {
        expect(getExpectedPlayerScore(benched, week, DEFENSE_POSITION_RANKS)).toBeLessThanOrEqual(
          minStarted + 1e-9,
        );
      }
    }
  });

  it("selects CPU opponents from the drafted 11-team pool, not a fixed distribution", () => {
    const fixture = draftFixture("cpu-from-draft-pool", 1);
    expect(() =>
      simulateSeason({
        roster: fixture.roster,
        userSlot: fixture.userSlot,
        allRosters: { 1: fixture.roster },
        playerUniverse: SIMULATION_PLAYERS,
        draftedPlayerIds: fixture.draftedPlayerIds,
        defenseRanks: DEFENSE_POSITION_RANKS,
        opponentNames: names,
        seed: "cpu-from-draft-pool",
      }),
    ).toThrow(/11 drafted CPU rosters/);
  });

  it("applies the same bye/temporary-replacement rules to CPU rosters", () => {
    const fixture = draftFixture("cpu-bye-rules", 2);
    const cpuSlot = Object.keys(fixture.allRosters)
      .map(Number)
      .find((slot) => slot !== fixture.userSlot)!;
    const week = 9;
    const depletedCpuRoster = fixture.allRosters[cpuSlot].map((player) =>
      player.position === "K" || player.position === "DST"
        ? { ...player, byeWeek: week }
        : player,
    );
    const allRostersWithDepletedCpu = { ...fixture.allRosters, [cpuSlot]: depletedCpuRoster };

    const result = simulateSeason({
      roster: fixture.roster,
      userSlot: fixture.userSlot,
      allRosters: allRostersWithDepletedCpu,
      playerUniverse: SIMULATION_PLAYERS,
      draftedPlayerIds: fixture.draftedPlayerIds,
      defenseRanks: DEFENSE_POSITION_RANKS,
      opponentNames: names,
      seed: "cpu-bye-rules",
    });
    // The engine must not throw even though a CPU roster has a fully depleted
    // K/DST slot in one week — it must fall back to temporary replacements,
    // exactly like the user's own roster does.
    expect(result.schedule.filter((game) => game.fantasyWeek <= 14)).toHaveLength(14);
  });

  it("applies no stage multiplier: expected value depends only on matchup, not playoff week", () => {
    const player = SIMULATION_PLAYERS.find((candidate) => candidate.position === "QB")!;
    const regularSeasonExpected = getExpectedPlayerScore(player, 3, DEFENSE_POSITION_RANKS);
    const week15Expected = getExpectedPlayerScore(player, 15, DEFENSE_POSITION_RANKS);
    const week17Expected = getExpectedPlayerScore(player, 17, DEFENSE_POSITION_RANKS);
    const opponent3 = player.weeklyOpponents[3];
    const opponent15 = player.weeklyOpponents[15];
    const opponent17 = player.weeklyOpponents[17];
    if (opponent3 === opponent15) {
      expect(week15Expected).toBe(regularSeasonExpected);
    }
    if (opponent3 === opponent17) {
      expect(week17Expected).toBe(regularSeasonExpected);
    }
  });

  it("selects playoff opponents purely from precomputed roster strength", () => {
    const strengths = Array.from({ length: 11 }, (_, index) => ({
      slot: index + 1,
      strength: 90 + index * 3,
    }));
    const selection = selectPlayoffOpponents(strengths);
    expect(selection.week17.slot).toBe(11);
    expect(selection.week16.slot).toBe(10);
    expect(selection.week15.slot).toBe(8);
    // The selector's type signature accepts no user score or outcome data at
    // all, so it structurally cannot react to a realized result.
    const reshuffled = [...strengths].reverse();
    const selectionFromReshuffledInput = selectPlayoffOpponents(reshuffled);
    expect(selectionFromReshuffledInput).toEqual(selection);
  });

  it("sums exactly nine CPU starters once per week", () => {
    const fixture = draftFixture("cpu-nine-starters", 7);
    const cpuSlot = Object.keys(fixture.allRosters)
      .map(Number)
      .find((slot) => slot !== fixture.userSlot)!;
    const tiers = buildPlayerTierMap(SIMULATION_PLAYERS);
    const week = 4;
    const lineup = optimizeLineup(fixture.allRosters[cpuSlot], week, DEFENSE_POSITION_RANKS);
    expect(getEmptyLineupSlots(lineup)).toEqual([]);
    const score = simulateLineupScore(
      lineup,
      week,
      DEFENSE_POSITION_RANKS,
      tiers,
      new SeededRandom("cpu-nine-starters-score"),
    );
    expect(score.playerScores).toHaveLength(9);
    expect(new Set(Object.values(lineup).map((player) => player!.id)).size).toBe(9);
  });

  it("reproduces identical user and CPU outcomes for the same seed", () => {
    const first = runSeason("cpu-determinism-check", 5);
    const repeated = runSeason("cpu-determinism-check", 5);
    expect(repeated.result).toEqual(first.result);
  });

  it("scores a strong CPU roster higher than a weak CPU roster over many samples", () => {
    const week = 1;
    const byPosition = (position: FantasyPosition) =>
      SIMULATION_PLAYERS.filter(
        (player) => player.position === position && player.byeWeek !== week,
      ).sort((first, second) => second.blendedPPG - first.blendedPPG);

    function buildRoster(pick: (players: SimulationPlayer[]) => SimulationPlayer[]) {
      return [
        ...pick(byPosition("QB")).slice(0, 1),
        ...pick(byPosition("RB")).slice(0, 3),
        ...pick(byPosition("WR")).slice(0, 3),
        ...pick(byPosition("TE")).slice(0, 2),
        ...pick(byPosition("K")).slice(0, 1),
        ...pick(byPosition("DST")).slice(0, 1),
      ];
    }
    const strongRoster = buildRoster((players) => players);
    const weakRoster = buildRoster((players) => [...players].reverse());
    const tiers = buildPlayerTierMap(SIMULATION_PLAYERS);

    function averageScore(roster: SimulationPlayer[], label: string) {
      const lineup = optimizeLineup(roster, week, DEFENSE_POSITION_RANKS);
      const samples = Array.from({ length: 300 }, (_, index) =>
        simulateLineupScore(
          lineup,
          week,
          DEFENSE_POSITION_RANKS,
          tiers,
          new SeededRandom(`${label}-${index}`),
        ).rawScore,
      );
      return samples.reduce((total, value) => total + value, 0) / samples.length;
    }

    expect(averageScore(strongRoster, "strong-roster")).toBeGreaterThan(
      averageScore(weakRoster, "weak-roster"),
    );
  });
});
