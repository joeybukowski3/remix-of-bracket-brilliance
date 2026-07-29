import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ResultCard } from "../components/ResultCard";
import { DEFENSE_POSITION_RANKS, SIMULATION_PLAYERS } from "../data";
import { OPPONENT_NAMES } from "../data/opponentNames";
import { computeDraftPickValueExtremes } from "../engine/draftPickValue";
import { simulateAutomaticDraft } from "../engine/cpuDraft";
import { simulateSeason } from "../engine/seasonSimulation";

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

    const extremes = computeDraftPickValueExtremes(draft.selections, 5, SIMULATION_PLAYERS)!;
    expect(screen.getByText("Best pick")).toBeInTheDocument();
    expect(screen.getByText("Worst pick")).toBeInTheDocument();
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
    expect(screen.queryByText("Best pick")).not.toBeInTheDocument();
    expect(screen.queryByText("Worst pick")).not.toBeInTheDocument();
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

describe("computeDraftPickValueExtremes", () => {
  it("picks the highest and lowest consensusOverallRank-minus-actualPick values for the user's slot only", () => {
    const selections = [
      { overallPick: 1, round: 1, slot: 1, playerId: "a", source: "user" as const },
      { overallPick: 2, round: 1, slot: 2, playerId: "b", source: "cpu" as const },
      { overallPick: 50, round: 5, slot: 1, playerId: "c", source: "user" as const },
    ];
    const playerUniverse = [
      { id: "a", name: "Player A", team: "AAA", consensusOverallRank: 10 } as never,
      { id: "b", name: "Player B", team: "BBB", consensusOverallRank: 500 } as never,
      { id: "c", name: "Player C", team: "CCC", consensusOverallRank: 5 } as never,
    ];
    const extremes = computeDraftPickValueExtremes(selections, 1, playerUniverse);
    expect(extremes).not.toBeNull();
    expect(extremes!.best.playerId).toBe("a");
    expect(extremes!.best.value).toBe(9);
    expect(extremes!.worst.playerId).toBe("c");
    expect(extremes!.worst.value).toBe(-45);
  });

  it("returns null when there are no picks for the given slot", () => {
    expect(computeDraftPickValueExtremes([], 1, [])).toBeNull();
  });
});
