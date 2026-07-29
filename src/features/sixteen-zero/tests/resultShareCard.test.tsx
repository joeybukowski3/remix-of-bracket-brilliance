import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ResultCard } from "../components/ResultCard";
import { DEFENSE_POSITION_RANKS, SIMULATION_PLAYERS } from "../data";
import { OPPONENT_NAMES } from "../data/opponentNames";
import { computePickOutcomeExtremes } from "../engine/draftPickValue";
import { simulateAutomaticDraft } from "../engine/cpuDraft";
import { simulateSeason } from "../engine/seasonSimulation";
import type { MatchupLineupEntry, ScheduleGame, SimulationPlayer } from "../types";

function buildDraftAndResult(seed: string, slot: number) {
  const draft = simulateAutomaticDraft(SIMULATION_PLAYERS, slot, `${seed}-draft`);
  const result = simulateSeason({
    roster: draft.rosters.get(slot)!,
    userSlot: slot,
    allRosters: Object.fromEntries(draft.rosters),
    playerUniverse: SIMULATION_PLAYERS,
    draftedPlayerIds: new Set(draft.selections.map((selection) => selection.playerId)),
    defenseRanks: DEFENSE_POSITION_RANKS,
    opponentNames: OPPONENT_NAMES.map((entry) => entry.name),
    seed: `${seed}-season`,
  });
  return { draft, result };
}

describe("16-0 share card", () => {
  it("renders branding, watermark, draft position, and best/worst pick tiles", () => {
    const { draft, result } = buildDraftAndResult("share-basic", 5);
    render(
      <MemoryRouter>
        <ResultCard
          result={result}
          draftSlot={5}
          draftSelections={draft.selections}
          onDraftAgain={() => undefined}
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByText("JoeKnowsBall").length).toBeGreaterThan(0);
    expect(screen.getByText("joeknowsball.com/16-0")).toBeInTheDocument();
    expect(screen.getAllByText("Pick 5").length).toBeGreaterThan(0);

    const extremes = computePickOutcomeExtremes(
      draft.selections,
      5,
      SIMULATION_PLAYERS,
      result.schedule,
      DEFENSE_POSITION_RANKS,
    )!;
    expect(screen.getByText("Best Pick This Run")).toBeInTheDocument();
    expect(screen.getByText("Worst Pick This Run")).toBeInTheDocument();
    expect(screen.getAllByText(extremes.best.playerName).length).toBeGreaterThan(0);
    expect(screen.getAllByText(extremes.worst.playerName).length).toBeGreaterThan(0);
  });

  it("omits best/worst pick tiles when draft selections are not provided", () => {
    const { result } = buildDraftAndResult("share-no-selections", 2);
    render(
      <MemoryRouter>
        <ResultCard result={result} draftSlot={2} onDraftAgain={() => undefined} />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Best Pick This Run")).not.toBeInTheDocument();
    expect(screen.queryByText("Worst Pick This Run")).not.toBeInTheDocument();
  });

  it("provides jump links that point at the season results and starting roster sections", () => {
    const { result } = buildDraftAndResult("share-jumplinks", 3);
    render(
      <MemoryRouter>
        <ResultCard result={result} draftSlot={3} onDraftAgain={() => undefined} />
      </MemoryRouter>,
    );

    const seasonResultsLink = screen.getByRole("link", { name: "Season Results" });
    const startingRosterLink = screen.getByRole("link", { name: "Starting Roster" });
    expect(seasonResultsLink).toHaveAttribute("href", "#season-results");
    expect(startingRosterLink).toHaveAttribute("href", "#starting-roster");
    expect(document.getElementById("season-results")).toBeInTheDocument();
    expect(document.getElementById("starting-roster")).toBeInTheDocument();
  });
});

function buildTestPlayer(overrides: Partial<SimulationPlayer> & { id: string }): SimulationPlayer {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    team: overrides.team ?? "TST",
    position: overrides.position ?? "WR",
    byeWeek: overrides.byeWeek ?? null,
    consensusOverallRank: overrides.consensusOverallRank ?? 100,
    consensusPositionRank: 1,
    projectedSeasonPoints: 0,
    projectedPPG: 0,
    projectionPositionRank: 1,
    blendedSeasonPoints: 0,
    blendedPPG: overrides.blendedPPG ?? 0,
    blendedPositionRank: 1,
    fullSeasonSOSRank: null,
    playoffSOSRank: null,
    weeklyOpponents: overrides.weeklyOpponents ?? {},
    opponentFantasyPointsAllowed: {},
    dataCompleteness: 1,
    active: true,
  };
}

function buildLineupEntry(
  playerId: string,
  points: number,
  isTemporaryReplacement = false,
): MatchupLineupEntry {
  return {
    slot: "WR1",
    playerId,
    playerName: playerId,
    position: "WR",
    nflTeam: "TST",
    nflOpponent: null,
    isHome: null,
    points,
    isTemporaryReplacement,
  };
}

describe("computePickOutcomeExtremes", () => {
  const playerB = buildTestPlayer({ id: "player-b", blendedPPG: 70, consensusOverallRank: 40 });
  const playerW = buildTestPlayer({ id: "player-w", blendedPPG: 140, consensusOverallRank: 61 });
  const playerN = buildTestPlayer({ id: "player-n", blendedPPG: 42, consensusOverallRank: 20 });
  const playerUniverse = [playerB, playerW, playerN];

  const selections = [
    { overallPick: 40, round: 4, slot: 1, playerId: "player-b", source: "user" as const },
    { overallPick: 1, round: 1, slot: 1, playerId: "player-w", source: "user" as const },
    { overallPick: 20, round: 2, slot: 1, playerId: "player-n", source: "user" as const },
    { overallPick: 2, round: 1, slot: 2, playerId: "player-b", source: "cpu" as const },
  ];

  function buildSchedule(): ScheduleGame[] {
    return [
      {
        fantasyWeek: 1,
        nflWeek: 1,
        opponentName: "Rivals",
        userScore: null,
        opponentScore: null,
        result: "W",
        boxScore: {
          opponentRosterSlot: 2,
          opponentLineup: [],
          userLineup: [
            buildLineupEntry("player-b", 168),
            buildLineupEntry("player-w", 0),
            buildLineupEntry("player-n", 42),
          ],
        },
      },
      // Should be excluded: a temporary replacement start, even for a drafted player.
      {
        fantasyWeek: 2,
        nflWeek: 2,
        opponentName: "Rivals 2",
        userScore: null,
        opponentScore: null,
        result: "W",
        boxScore: {
          opponentRosterSlot: 2,
          opponentLineup: [],
          userLineup: [buildLineupEntry("player-b", 1000, true)],
        },
      },
      // Should be excluded: outside regular-season Weeks 1-14.
      {
        fantasyWeek: 15,
        nflWeek: 15,
        opponentName: "Playoff foe",
        userScore: null,
        opponentScore: null,
        result: "W",
        boxScore: {
          opponentRosterSlot: 2,
          opponentLineup: [],
          userLineup: [buildLineupEntry("player-b", 1000)],
        },
      },
    ];
  }

  it("grades picks by simulated-vs-projected contribution plus a clamped draft-value nudge", () => {
    const extremes = computePickOutcomeExtremes(
      selections,
      1,
      playerUniverse,
      buildSchedule(),
      {},
    )!;

    expect(extremes).not.toBeNull();

    // player-b: simPPG 168/14=12, projPPG 70/14=5, delta=7, draftValueAdjustment=0 (pick 40 == rank 40) -> score 7
    expect(extremes.best.playerId).toBe("player-b");
    expect(extremes.best.simulatedContributionPPG).toBeCloseTo(12);
    expect(extremes.best.projectedContributionPPG).toBeCloseTo(5);
    expect(extremes.best.pickOutcomeScore).toBeCloseTo(7);

    // player-w: simPPG 0, projPPG 140/14=10, delta=-10, draftValueAdjustment=clamp((1-61)/20,-3,3)=-3 -> score -13
    expect(extremes.worst.playerId).toBe("player-w");
    expect(extremes.worst.simulatedContributionPPG).toBeCloseTo(0);
    expect(extremes.worst.projectedContributionPPG).toBeCloseTo(10);
    expect(extremes.worst.pickOutcomeScore).toBeCloseTo(-13);
  });

  it("excludes the temporary-replacement start and out-of-range playoff week from the totals", () => {
    const extremes = computePickOutcomeExtremes(
      selections,
      1,
      playerUniverse,
      buildSchedule(),
      {},
    )!;
    // If the Week 2 (temp replacement) or Week 15 (playoff) 1000-point entries leaked in,
    // player-b's simulated PPG would be far higher than 12.
    expect(extremes.best.simulatedContributionPPG).toBeCloseTo(12);
  });

  it("only considers picks from the given draft slot", () => {
    const extremes = computePickOutcomeExtremes(
      selections,
      2,
      playerUniverse,
      buildSchedule(),
      {},
    );
    expect(extremes).not.toBeNull();
    expect(extremes!.best.playerId).toBe("player-b");
    expect(extremes!.worst.playerId).toBe("player-b");
  });

  it("returns null when there are no picks for the given slot", () => {
    expect(computePickOutcomeExtremes([], 1, [], [], {})).toBeNull();
  });
});
