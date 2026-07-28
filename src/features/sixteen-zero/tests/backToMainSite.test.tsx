import { act, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { DraftRoom } from "../components/DraftRoom";
import { DraftSlotSelector } from "../components/DraftSlotSelector";
import { LandingHero } from "../components/LandingHero";
import { ResultCard } from "../components/ResultCard";
import { SeasonSimulation } from "../components/SeasonSimulation";
import { DEFENSE_POSITION_RANKS, SIMULATION_PLAYERS } from "../data";
import { OPPONENT_NAMES } from "../data/opponentNames";
import { simulateAutomaticDraft } from "../engine/cpuDraft";
import { simulateSeason } from "../engine/seasonSimulation";
import { useDraftGame } from "../hooks/useDraftGame";

afterEach(() => {
  document.body.innerHTML = "";
});

function expectBackToMainSite() {
  const links = screen.getAllByRole("link", { name: "Back to Main Site" });
  expect(links.length).toBe(1);
  expect(links[0].getAttribute("href")).toBe("/");
}

function buildSeasonResult() {
  const draft = simulateAutomaticDraft(SIMULATION_PLAYERS, 1, "back-to-main-site-draft");
  return simulateSeason({
    roster: draft.rosters.get(1)!,
    userSlot: 1,
    allRosters: Object.fromEntries(draft.rosters),
    playerUniverse: SIMULATION_PLAYERS,
    draftedPlayerIds: new Set(draft.selections.map((selection) => selection.playerId)),
    defenseRanks: DEFENSE_POSITION_RANKS,
    opponentNames: OPPONENT_NAMES.map((entry) => entry.name),
    seed: "back-to-main-site-season",
  });
}

describe("Back to Main Site navigation", () => {
  it("appears on the landing screen and links to /", () => {
    render(
      <MemoryRouter>
        <LandingHero onStart={() => undefined} initializing={false} />
      </MemoryRouter>,
    );
    expectBackToMainSite();
  });

  it("appears on the draft-position selection screen and links to /", () => {
    render(
      <MemoryRouter>
        <DraftSlotSelector onConfirm={() => undefined} />
      </MemoryRouter>,
    );
    expectBackToMainSite();
  });

  it("appears on the draft room and links to /", () => {
    const { result, unmount } = renderHook(() => useDraftGame());
    act(() => result.current.startDraft(1));
    render(
      <MemoryRouter>
        <DraftRoom game={result.current} />
      </MemoryRouter>,
    );
    expectBackToMainSite();
    unmount();
  });

  it("appears on the season simulation screen and links to /", () => {
    render(
      <MemoryRouter>
        <SeasonSimulation result={buildSeasonResult()} onComplete={() => undefined} />
      </MemoryRouter>,
    );
    expectBackToMainSite();
  });

  it("appears on the result screen and links to /", () => {
    render(
      <MemoryRouter>
        <ResultCard result={buildSeasonResult()} draftSlot={1} onDraftAgain={() => undefined} />
      </MemoryRouter>,
    );
    expectBackToMainSite();
  });

  it("never renders a duplicate main-site button on any screen", () => {
    render(
      <MemoryRouter>
        <ResultCard result={buildSeasonResult()} draftSlot={1} onDraftAgain={() => undefined} />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("link", { name: "Back to Main Site" })).toHaveLength(1);
  });
});
