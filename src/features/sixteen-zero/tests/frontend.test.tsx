import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SixteenZeroPage from "../SixteenZeroPage";
import { DraftBoard } from "../components/DraftBoard";
import { ResultCard } from "../components/ResultCard";
import { SEASON_ROW_DELAY_MS } from "../components/SeasonSimulation";
import { UserRosterPanel } from "../components/UserRosterPanel";
import { DEFENSE_POSITION_RANKS, SIMULATION_PLAYERS } from "../data";
import { OPPONENT_NAMES } from "../data/opponentNames";
import { simulateAutomaticDraft } from "../engine/cpuDraft";
import { simulateSeason } from "../engine/seasonSimulation";
import { useDraftGame } from "../hooks/useDraftGame";

vi.mock("../engine/createLocalRun", () => ({
  createLocalSimulationRun: vi.fn((chosenDraftSlot?: number) => ({
    simulationId: "00000000-0000-4000-8000-000000000001",
    seed: "frontend-test-seed",
    draftSlot: chosenDraftSlot ?? 1,
  })),
  generateRandomDraftSlot: vi.fn(() => 1),
}));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("16-0 no-persistence frontend", () => {
  it("loads the route flow without network requests", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network disabled"));
    render(
      <MemoryRouter initialEntries={["/16-0"]}>
        <SixteenZeroPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Can You Build the Perfect Fantasy Team?" }),
    ).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^draft position 1$/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start draft/i }));
    });
    expect(screen.getByRole("heading", { level: 1, name: "Available players" })).toBeInTheDocument();
    expect(screen.getAllByText(/Your pick: Round 1, Pick 1/).length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not auto-pick while the user is on the clock, no matter how long they wait", async () => {
    const { result, unmount } = renderHook(() => useDraftGame());
    act(() => result.current.startDraft());
    expect(result.current.phase).toBe("user_on_clock");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(result.current.phase).toBe("user_on_clock");
    expect(result.current.selections).toHaveLength(0);
    expect(result.current.userRoster).toHaveLength(0);
    unmount();
  });

  it("still advances the draft on a manual pick after a long wait", async () => {
    const { result, unmount } = renderHook(() => useDraftGame());
    act(() => result.current.startDraft());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    const [firstAvailable] = result.current.availablePlayers;
    act(() => result.current.draftPlayer(firstAvailable.id));
    expect(result.current.selections[0]).toMatchObject({
      overallPick: 1,
      slot: 1,
      source: "user",
      playerId: firstAvailable.id,
    });
    expect(result.current.userRoster).toHaveLength(1);
    unmount();
  });

  it("initializes the correct snake draft order for a chosen draft slot", () => {
    const { result, unmount } = renderHook(() => useDraftGame());
    act(() => result.current.startDraft(7));
    expect(result.current.draftSlot).toBe(7);
    expect(result.current.phase).toBe("cpu_drafting");
    unmount();
  });

  it("puts slot 1 on the clock immediately when slot 1 is chosen", () => {
    const { result, unmount } = renderHook(() => useDraftGame());
    act(() => result.current.startDraft(1));
    expect(result.current.draftSlot).toBe(1);
    expect(result.current.phase).toBe("user_on_clock");
    unmount();
  });

  it("uses a 25–35 second animation window for a 14–17 row season", () => {
    expect(14 * SEASON_ROW_DELAY_MS).toBeGreaterThanOrEqual(25_000);
    expect(17 * SEASON_ROW_DELAY_MS).toBeLessThanOrEqual(35_000);
  });

  it("shows two-K/two-DST progress and final-pick forcing", () => {
    const draft = simulateAutomaticDraft(
      SIMULATION_PLAYERS,
      1,
      "frontend-requirements",
    );
    const offense = draft.rosters
      .get(1)!
      .filter((player) => player.position !== "K" && player.position !== "DST");
    render(<UserRosterPanel roster={offense} picksRemaining={4} />);
    const kRows = document.querySelectorAll('[data-requirement-row="K"]');
    const dstRows = document.querySelectorAll('[data-requirement-row="DST"]');
    expect(kRows.length).toBeGreaterThan(0);
    expect(dstRows.length).toBeGreaterThan(0);
    kRows.forEach((row) => expect(row.textContent).toContain("0 / 2"));
    dstRows.forEach((row) => expect(row.textContent).toContain("0 / 2"));
    expect(
      screen.getAllByText("Roster completion is forcing every remaining pick.")
        .length,
    ).toBeGreaterThan(0);
  });

  it("shows the non-modal Round 16 backup K/DST instruction", () => {
    render(
      <DraftBoard
        currentPick={{ round: 16, slot: 1, overallPick: 181, pickInRound: 1 }}
        draftSlot={1}
        isUserOnClock
        recentSelections={[]}
        allSelections={[]}
      />,
    );
    expect(
      screen.getByText(
        "Final two rounds: Draft one backup kicker and one backup defense. Check their bye weeks so your starters have coverage.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Final 2 picks: Backup K + DST. Check bye weeks."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("warns non-modally when a starting K or DST is still missing late", () => {
    render(
      <DraftBoard
        currentPick={{ round: 14, slot: 1, overallPick: 157, pickInRound: 1 }}
        draftSlot={1}
        isUserOnClock
        recentSelections={[]}
        allSelections={[]}
        needsStartingK
        needsStartingDST
      />,
    );
    expect(
      screen.getByText(
        "Starting K + DST still needed. Draft them before Round 15 ends; the engine will force the pick if necessary.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the full season schedule including a Week 15 bye and playoff labels", () => {
    const draft = simulateAutomaticDraft(SIMULATION_PLAYERS, 3, "schedule-display-draft");
    const result = simulateSeason({
      roster: draft.rosters.get(3)!,
      userSlot: 3,
      allRosters: Object.fromEntries(draft.rosters),
      playerUniverse: SIMULATION_PLAYERS,
      draftedPlayerIds: new Set(
        draft.selections.map((selection) => selection.playerId),
      ),
      defenseRanks: DEFENSE_POSITION_RANKS,
      opponentNames: OPPONENT_NAMES.map((entry) => entry.name),
      seed: "schedule-display-season",
      overrides: {
        regularOpponentScores: Array(14).fill(0),
        qualification: { qualified: true, seed: 1, hasBye: true },
        playoffOpponentScores: { 16: 0, 17: 0 },
      },
    });
    render(
      <MemoryRouter>
        <ResultCard result={result} draftSlot={3} onDraftAgain={() => undefined} />
      </MemoryRouter>,
    );
    expect(result.schedule).toHaveLength(17);
    const scheduleSection = document.querySelector("[data-season-schedule]")!;
    expect(scheduleSection.textContent).toContain("Week 15");
    expect(scheduleSection.textContent).toContain("Playoff bye");
    expect(scheduleSection.textContent).toContain("Semifinal");
    expect(scheduleSection.textContent).toContain("Championship");
    expect(scheduleSection.textContent).toContain("Regular season");
    for (const game of result.schedule) {
      expect(scheduleSection.textContent).toContain(String(game.fantasyWeek));
    }
  });

  it("renders a perfect championship as 16-0", () => {
    const draft = simulateAutomaticDraft(SIMULATION_PLAYERS, 2, "perfect-display-draft");
    const result = simulateSeason({
      roster: draft.rosters.get(2)!,
      userSlot: 2,
      allRosters: Object.fromEntries(draft.rosters),
      playerUniverse: SIMULATION_PLAYERS,
      draftedPlayerIds: new Set(
        draft.selections.map((selection) => selection.playerId),
      ),
      defenseRanks: DEFENSE_POSITION_RANKS,
      opponentNames: OPPONENT_NAMES.map((entry) => entry.name),
      seed: "perfect-display-season",
      overrides: {
        regularOpponentScores: Array(14).fill(0),
        playoffOpponentScores: { 16: 0, 17: 0 },
      },
    });
    render(
      <MemoryRouter>
        <ResultCard
          result={result}
          draftSlot={2}
          onDraftAgain={() => undefined}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "16-0" })).toBeInTheDocument();
    expect(screen.getByText("The perfect fantasy season.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /draft again/i })).toBeEnabled();
  });
});
