import { describe, expect, it } from "vitest";
import type { DefensePositionRanks } from "../engine/lineupOptimizer";
import { getEmptyLineupSlots, optimizeLineup } from "../engine/lineupOptimizer";
import {
  buildPlayerTierMap,
  simulateLineupScore,
} from "../engine/playerScoreSimulation";
import { formatScoringTrace, traceWeeklyScoring } from "../engine/scoringTrace";
import { SeededRandom } from "../engine/seededRandom";
import type { FantasyPosition, SimulationPlayer, WeeklyLineup } from "../types";

function mockPlayer(
  overrides: Partial<SimulationPlayer> & { id: string; position: FantasyPosition },
): SimulationPlayer {
  return {
    name: overrides.id,
    team: "TST",
    byeWeek: null,
    consensusOverallRank: 100,
    consensusPositionRank: 10,
    projectedSeasonPoints: 0,
    projectedPPG: 10,
    projectionPositionRank: 10,
    blendedSeasonPoints: 0,
    blendedPPG: 10,
    blendedPositionRank: 10,
    fullSeasonSOSRank: null,
    playoffSOSRank: null,
    weeklyOpponents: {},
    opponentFantasyPointsAllowed: {},
    dataCompleteness: 1,
    active: true,
    ...overrides,
  };
}

function lineupIds(lineup: WeeklyLineup) {
  return Object.fromEntries(
    Object.entries(lineup).map(([slot, player]) => [slot, player?.id ?? null]),
  );
}

function buildFullMockRoster(): SimulationPlayer[] {
  return [
    mockPlayer({ id: "qb-1", position: "QB", blendedPPG: 22, weeklyOpponents: { 1: "OPPA" } }),
    mockPlayer({ id: "rb-1", position: "RB", blendedPPG: 18, weeklyOpponents: { 1: "OPPB" } }),
    mockPlayer({ id: "rb-2", position: "RB", blendedPPG: 15, weeklyOpponents: { 1: "OPPC" } }),
    mockPlayer({ id: "wr-1", position: "WR", blendedPPG: 16, weeklyOpponents: { 1: "OPPD" } }),
    mockPlayer({ id: "wr-2", position: "WR", blendedPPG: 14, weeklyOpponents: { 1: "OPPE" } }),
    mockPlayer({ id: "te-1", position: "TE", blendedPPG: 10, weeklyOpponents: { 1: "OPPF" } }),
    mockPlayer({ id: "flex-1", position: "WR", blendedPPG: 9, weeklyOpponents: { 1: "OPPG" } }),
    mockPlayer({ id: "k-1", position: "K", blendedPPG: 8, weeklyOpponents: { 1: "OPPH" } }),
    mockPlayer({ id: "dst-1", position: "DST", blendedPPG: 7, weeklyOpponents: { 1: "OPPI" } }),
  ];
}

type PositionCase = {
  position: FantasyPosition;
  starterCount: number;
  slots: (lineup: WeeklyLineup) => Array<SimulationPlayer | null>;
};

const POSITION_CASES: PositionCase[] = [
  { position: "QB", starterCount: 1, slots: (lineup) => [lineup.QB] },
  { position: "RB", starterCount: 2, slots: (lineup) => [lineup.RB1, lineup.RB2] },
  { position: "WR", starterCount: 2, slots: (lineup) => [lineup.WR1, lineup.WR2] },
  { position: "TE", starterCount: 1, slots: (lineup) => [lineup.TE] },
  { position: "K", starterCount: 1, slots: (lineup) => [lineup.K] },
  { position: "DST", starterCount: 1, slots: (lineup) => [lineup.DST] },
];

describe("16-0 weekly lineup optimizer: expected-score-only selection", () => {
  it("starts the QB with the higher expected PPG over one with lower expected PPG", () => {
    const higher = mockPlayer({ id: "qb-high", position: "QB", blendedPPG: 22 });
    const lower = mockPlayer({ id: "qb-low", position: "QB", blendedPPG: 15 });
    const lineup = optimizeLineup([lower, higher], 1, {});
    expect(lineup.QB?.id).toBe("qb-high");
  });

  it("starts a lower-base QB over a higher-base QB when its matchup-adjusted expectation is greater", () => {
    const week = 3;
    const highBase = mockPlayer({
      id: "qb-high-base",
      position: "QB",
      blendedPPG: 20,
      weeklyOpponents: { [week]: "TOUGH" },
    });
    const lowBaseFavorable = mockPlayer({
      id: "qb-low-base-favorable",
      position: "QB",
      blendedPPG: 18,
      weeklyOpponents: { [week]: "SOFT" },
    });
    const defenseRanks: DefensePositionRanks = {
      TOUGH: { QB: 30 },
      SOFT: { QB: 2 },
    };
    // highBase adjusted: 20 * 0.93 (hardest) = 18.6
    // lowBaseFavorable adjusted: 18 * 1.07 (easiest) = 19.26 -> surpasses highBase
    const lineup = optimizeLineup([highBase, lowBaseFavorable], week, defenseRanks);
    expect(lineup.QB?.id).toBe("qb-low-base-favorable");
  });

  it("does not give the first-drafted (first in roster array) QB priority", () => {
    const higher = mockPlayer({ id: "qb-high", position: "QB", blendedPPG: 22 });
    const lower = mockPlayer({ id: "qb-low", position: "QB", blendedPPG: 15 });
    const lowerDraftedFirst = optimizeLineup([lower, higher], 1, {});
    const higherDraftedFirst = optimizeLineup([higher, lower], 1, {});
    expect(lowerDraftedFirst.QB?.id).toBe("qb-high");
    expect(higherDraftedFirst.QB?.id).toBe("qb-high");
  });

  it("excludes a QB on bye from selection", () => {
    const week = 5;
    const onBye = mockPlayer({ id: "qb-bye", position: "QB", blendedPPG: 30, byeWeek: week });
    const backup = mockPlayer({ id: "qb-backup", position: "QB", blendedPPG: 10 });
    const lineup = optimizeLineup([onBye, backup], week, {});
    expect(lineup.QB?.id).toBe("qb-backup");
  });

  it.each(POSITION_CASES)(
    "starts the highest expected eligible $position player(s), independent of roster array order",
    ({ position, starterCount, slots }) => {
      const candidates = Array.from({ length: starterCount + 1 }, (_, index) =>
        mockPlayer({ id: `${position}-${index}`, position, blendedPPG: 10 + index }),
      );
      const expectedTopIds = [...candidates]
        .sort((first, second) => second.blendedPPG - first.blendedPPG)
        .slice(0, starterCount)
        .map((player) => player.id);

      const forward = optimizeLineup(candidates, 1, {});
      const reversed = optimizeLineup([...candidates].reverse(), 1, {});

      for (const lineup of [forward, reversed]) {
        const startedIds = slots(lineup).map((player) => player?.id);
        for (const id of expectedTopIds) {
          expect(startedIds).toContain(id);
        }
      }
    },
  );

  it.each(POSITION_CASES)(
    "excludes $position players on bye from selection",
    ({ position, starterCount, slots }) => {
      const week = 4;
      const onBye = mockPlayer({ id: `${position}-bye`, position, blendedPPG: 50, byeWeek: week });
      const backups = Array.from({ length: starterCount }, (_, index) =>
        mockPlayer({ id: `${position}-backup-${index}`, position, blendedPPG: 10 + index }),
      );
      const lineup = optimizeLineup([onBye, ...backups], week, {});
      const startedIds = slots(lineup).map((player) => player?.id);
      expect(startedIds).not.toContain(onBye.id);
    },
  );

  it.each(POSITION_CASES)(
    "orders $position starters by matchup-adjusted expectation, ahead of raw base PPG",
    ({ position, slots }) => {
      const week = 2;
      const highBase = mockPlayer({
        id: `${position}-high-base`,
        position,
        blendedPPG: 20,
        weeklyOpponents: { [week]: "TOUGH" },
      });
      const lowBaseFavorable = mockPlayer({
        id: `${position}-low-base-favorable`,
        position,
        blendedPPG: 18,
        weeklyOpponents: { [week]: "SOFT" },
      });
      const defenseRanks: DefensePositionRanks = {
        TOUGH: { [position]: 30 },
        SOFT: { [position]: 2 },
      };
      const lineup = optimizeLineup([highBase, lowBaseFavorable], week, defenseRanks);
      expect(slots(lineup)[0]?.id).toBe(lowBaseFavorable.id);
    },
  );

  it("selects the highest expected remaining RB/WR/TE for FLEX after fixed slots are filled", () => {
    const roster = [
      mockPlayer({ id: "rb-1", position: "RB", blendedPPG: 20 }),
      mockPlayer({ id: "rb-2", position: "RB", blendedPPG: 19 }),
      mockPlayer({ id: "rb-3", position: "RB", blendedPPG: 12 }),
      mockPlayer({ id: "wr-1", position: "WR", blendedPPG: 18 }),
      mockPlayer({ id: "wr-2", position: "WR", blendedPPG: 17 }),
      mockPlayer({ id: "wr-3", position: "WR", blendedPPG: 14 }),
      mockPlayer({ id: "te-1", position: "TE", blendedPPG: 10 }),
    ];
    const lineup = optimizeLineup(roster, 1, {});
    expect(lineup.RB1?.id).toBe("rb-1");
    expect(lineup.RB2?.id).toBe("rb-2");
    expect(lineup.WR1?.id).toBe("wr-1");
    expect(lineup.WR2?.id).toBe("wr-2");
    expect(lineup.TE?.id).toBe("te-1");
    expect(lineup.FLEX?.id).toBe("wr-3");
  });

  it("never places one player in two slots", () => {
    const roster = buildFullMockRoster();
    const lineup = optimizeLineup(roster, 1, {});
    const selected = Object.values(lineup).filter(
      (player): player is SimulationPlayer => player !== null,
    );
    expect(new Set(selected.map((player) => player.id)).size).toBe(selected.length);
  });

  it("is deterministic for identical inputs", () => {
    const roster = buildFullMockRoster();
    const week = 1;
    const defenseRanks: DefensePositionRanks = { OPPA: { QB: 5 } };
    const first = optimizeLineup(roster, week, defenseRanks);
    const second = optimizeLineup(roster, week, defenseRanks);
    expect(lineupIds(second)).toEqual(lineupIds(first));
  });

  it("never uses realized-score hindsight: selection has no dependency on random draws, only realized point totals vary", () => {
    const roster = buildFullMockRoster();
    const week = 1;
    // optimizeLineup takes no random/seed argument at all, so re-running it
    // is inherently independent of any realized-score random draw.
    const lineupA = optimizeLineup(roster, week, {});
    const lineupB = optimizeLineup(roster, week, {});
    expect(lineupIds(lineupA)).toEqual(lineupIds(lineupB));

    const tiers = buildPlayerTierMap(roster);
    const scoreDrawOne = simulateLineupScore(lineupA, week, {}, tiers, new SeededRandom("draw-one"));
    const scoreDrawTwo = simulateLineupScore(lineupA, week, {}, tiers, new SeededRandom("draw-two"));
    // Changing only the realized random draw must not change who was selected.
    expect(lineupIds(optimizeLineup(roster, week, {}))).toEqual(lineupIds(lineupA));
    expect(scoreDrawOne.expectedTotal).toBe(scoreDrawTwo.expectedTotal);
  });

  it("computes the weekly score from the selected starter's expected value, not a bench player's", () => {
    const week = 1;
    const starter = mockPlayer({ id: "qb-starter", position: "QB", blendedPPG: 25 });
    const bench = mockPlayer({ id: "qb-bench", position: "QB", blendedPPG: 5 });
    const roster = [bench, starter];
    const lineup = optimizeLineup(roster, week, {});
    expect(lineup.QB?.id).toBe(starter.id);
    expect(Object.values(lineup).some((player) => player?.id === bench.id)).toBe(false);

    const tiers = buildPlayerTierMap(roster);
    const result = simulateLineupScore(lineup, week, {}, tiers, new SeededRandom("bench-vs-starter"));
    expect(result.expectedTotal).toBeCloseTo(starter.blendedPPG, 5);
  });

  it("reports empty slots explicitly rather than filling missing positions with drafted players from another position", () => {
    const roster = [mockPlayer({ id: "qb-only", position: "QB", blendedPPG: 20 })];
    const lineup = optimizeLineup(roster, 1, {});
    expect(lineup.QB?.id).toBe("qb-only");
    expect(getEmptyLineupSlots(lineup)).toEqual(["RB1", "RB2", "WR1", "WR2", "TE", "FLEX", "K", "DST"]);
  });
});

describe("16-0 dev-only weekly scoring trace (not exposed in production UI)", () => {
  it("reports each selected starter's base PPG, matchup multiplier, adjusted expected PPG, and realized score", () => {
    const week = 1;
    const roster = buildFullMockRoster();
    const draftedPlayerIds = new Set(roster.map((player) => player.id));
    const defenseRanks: DefensePositionRanks = { OPPA: { QB: 5 } };

    const trace = traceWeeklyScoring({
      roster,
      draftedPlayerIds,
      temporaryReplacementPool: [],
      week,
      defenseRanks,
      seed: "trace-week-1",
      playerUniverseForTiers: roster,
    });

    expect(trace.rows).toHaveLength(9);
    const qbRow = trace.rows.find((row) => row.slot === "QB");
    expect(qbRow?.playerId).toBe("qb-1");
    expect(qbRow?.canonicalProjectedPPG).toBe(22);
    expect(qbRow?.matchupMultiplier).toBeCloseTo(1.04, 5); // rank 5 -> "easy"
    expect(qbRow?.matchupAdjustedExpectedScore).toBeCloseTo(22 * 1.04, 5);
    expect(typeof qbRow?.finalSimulatedScore).toBe("number");
    expect(qbRow?.isDraftedStarter).toBe(true);

    // Human-readable trace output exists for local debugging but is only
    // ever produced by tests/scripts, never rendered by production UI.
    expect(formatScoringTrace(trace)).toContain("Week 1 scoring trace");
  });
});
