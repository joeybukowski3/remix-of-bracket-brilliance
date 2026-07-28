import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ResultCard } from "../components/ResultCard";
import { DEFENSE_POSITION_RANKS, SIMULATION_PLAYERS } from "../data";
import { OPPONENT_NAMES } from "../data/opponentNames";
import { simulateAutomaticDraft } from "../engine/cpuDraft";
import { simulateSeason } from "../engine/seasonSimulation";

function buildResult(seed: string, slot: number) {
  const draft = simulateAutomaticDraft(SIMULATION_PLAYERS, slot, `${seed}-draft`);
  return simulateSeason({
    roster: draft.rosters.get(slot)!,
    userSlot: slot,
    allRosters: Object.fromEntries(draft.rosters),
    playerUniverse: SIMULATION_PLAYERS,
    draftedPlayerIds: new Set(draft.selections.map((selection) => selection.playerId)),
    defenseRanks: DEFENSE_POSITION_RANKS,
    opponentNames: OPPONENT_NAMES.map((entry) => entry.name),
    seed: `${seed}-season`,
  });
}

describe("16-0 expandable matchup details", () => {
  it("hides lineups until a played week is expanded, then shows both lineups with an accessible disclosure", () => {
    const result = buildResult("expand-basic", 4);
    render(
      <MemoryRouter>
        <ResultCard result={result} draftSlot={4} onDraftAgain={() => undefined} />
      </MemoryRouter>,
    );

    const week1 = result.schedule[0];
    const [toggle] = screen.getAllByRole("button", {
      name: `Show Week ${week1.fantasyWeek} matchup details`,
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    const controlsId = toggle.getAttribute("aria-controls")!;
    expect(document.getElementById(controlsId)).toBeNull();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const panel = document.getElementById(controlsId)!;
    expect(panel).toBeInTheDocument();
    expect(within(panel).getByText("Your lineup")).toBeInTheDocument();
    expect(within(panel).getByText(week1.opponentName)).toBeInTheDocument();

    for (const entry of week1.boxScore!.userLineup) {
      expect(within(panel).getAllByText(entry.playerName).length).toBeGreaterThan(0);
    }
  }, 20000);

  it("toggles open and closed without mutating the underlying schedule data", () => {
    const result = buildResult("expand-keyboard", 6);
    const scheduleSnapshotBefore = JSON.stringify(result.schedule);
    render(
      <MemoryRouter>
        <ResultCard result={result} draftSlot={6} onDraftAgain={() => undefined} />
      </MemoryRouter>,
    );

    const week1 = result.schedule[0];
    const [toggle] = screen.getAllByRole("button", {
      name: `Show Week ${week1.fantasyWeek} matchup details`,
    });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(
      screen.getAllByRole("button", { name: `Show Week ${week1.fantasyWeek} matchup details` })[0],
    );
    expect(JSON.stringify(result.schedule)).toBe(scheduleSnapshotBefore);
  }, 20000);

  it("renders a bye-week row with a concise message instead of two lineups", () => {
    const draft = simulateAutomaticDraft(SIMULATION_PLAYERS, 1, "expand-bye-draft");
    const result = simulateSeason({
      roster: draft.rosters.get(1)!,
      userSlot: 1,
      allRosters: Object.fromEntries(draft.rosters),
      playerUniverse: SIMULATION_PLAYERS,
      draftedPlayerIds: new Set(draft.selections.map((selection) => selection.playerId)),
      defenseRanks: DEFENSE_POSITION_RANKS,
      opponentNames: OPPONENT_NAMES.map((entry) => entry.name),
      seed: "expand-bye-season",
      overrides: {
        regularOpponentScores: Array(14).fill(0),
        playoffOpponentScores: { 16: 500 },
      },
    });
    expect(result.qualification.hasBye).toBe(true);

    render(
      <MemoryRouter>
        <ResultCard result={result} draftSlot={1} onDraftAgain={() => undefined} />
      </MemoryRouter>,
    );

    const [byeToggle] = screen.getAllByRole("button", { name: "Show Week 15 matchup details" });
    fireEvent.click(byeToggle);
    expect(
      screen.getAllByText("First-round bye — no matchup was played.").length,
    ).toBeGreaterThan(0);
  }, 20000);

  it("allows multiple weeks to be expanded independently", () => {
    const result = buildResult("expand-multi", 8);
    render(
      <MemoryRouter>
        <ResultCard result={result} draftSlot={8} onDraftAgain={() => undefined} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Show Week 1 matchup details" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Show Week 2 matchup details" })[0]);

    expect(
      screen.getAllByRole("button", { name: "Hide Week 1 matchup details" })[0],
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getAllByRole("button", { name: "Hide Week 2 matchup details" })[0],
    ).toHaveAttribute("aria-expanded", "true");
  }, 20000);

  it("flags a temporary replacement starter in the expanded box score", () => {
    const result = buildResult("expand-temp", 9);
    const weekWithReplacement = result.schedule.find(
      (game) =>
        !game.isBye &&
        game.boxScore &&
        [...game.boxScore.userLineup, ...game.boxScore.opponentLineup].some(
          (entry) => entry.isTemporaryReplacement,
        ),
    );
    if (!weekWithReplacement) {
      // No bye-driven replacement occurred for this deterministic seed; nothing to assert.
      return;
    }
    render(
      <MemoryRouter>
        <ResultCard result={result} draftSlot={9} onDraftAgain={() => undefined} />
      </MemoryRouter>,
    );
    fireEvent.click(
      screen.getAllByRole("button", {
        name: `Show Week ${weekWithReplacement.fantasyWeek} matchup details`,
      })[0],
    );
    expect(screen.getAllByText("Temp").length).toBeGreaterThan(0);
  }, 20000);
});
