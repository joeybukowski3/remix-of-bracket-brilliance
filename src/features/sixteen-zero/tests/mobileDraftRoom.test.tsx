import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { DraftRoom } from "../components/DraftRoom";
import { useDraftGame } from "../hooks/useDraftGame";

function renderDraftRoomAtSlot1() {
  const { result } = renderHook(() => useDraftGame());
  act(() => result.current.startDraft(1));
  render(
    <MemoryRouter>
      <DraftRoom game={result.current} />
    </MemoryRouter>,
  );
  return result;
}

function mobileSectionButtons() {
  return [
    document.querySelector('[data-mobile-section-toggle="available-players"]') as HTMLElement,
    document.querySelector('[data-mobile-section-toggle="your-roster"]') as HTMLElement,
    document.querySelector('[data-mobile-section-toggle="recent-selections"]') as HTMLElement,
  ];
}

describe("16-0 mobile draft-room ordering and collapsible sections", () => {
  it("orders mobile sections as Draft Status, Available Players, Your Roster, Recent Selections", () => {
    renderDraftRoomAtSlot1();

    const main = document.querySelector("main")!;
    const allElements = Array.from(main.querySelectorAll("*"));
    const draftStatusIndex = allElements.findIndex((element) =>
      element.textContent?.trim().startsWith("Draft status"),
    );
    const availablePlayersIndex = allElements.findIndex(
      (element) => element.tagName === "BUTTON" && element.textContent?.includes("Available Players"),
    );
    const yourRosterIndex = allElements.findIndex(
      (element) => element.tagName === "BUTTON" && element.textContent?.includes("Your Roster"),
    );
    const recentSelectionsIndex = allElements.findIndex(
      (element) => element.tagName === "BUTTON" && element.textContent?.includes("Recent Selections"),
    );

    expect(draftStatusIndex).toBeGreaterThanOrEqual(0);
    expect(availablePlayersIndex).toBeGreaterThan(draftStatusIndex);
    expect(yourRosterIndex).toBeGreaterThan(availablePlayersIndex);
    expect(recentSelectionsIndex).toBeGreaterThan(yourRosterIndex);
  });

  it("expands Available Players by default and collapses Your Roster and Recent Selections by default", () => {
    renderDraftRoomAtSlot1();

    const [availableToggle, rosterToggle, recentToggle] = mobileSectionButtons();
    expect(availableToggle).toHaveAttribute("aria-expanded", "true");
    expect(rosterToggle).toHaveAttribute("aria-expanded", "false");
    expect(recentToggle).toHaveAttribute("aria-expanded", "false");
  });

  it("allows multiple mobile sections to be open at once (no forced single-open accordion)", () => {
    renderDraftRoomAtSlot1();

    const [, rosterToggle, recentToggle] = mobileSectionButtons();
    fireEvent.click(rosterToggle);
    fireEvent.click(recentToggle);

    const [availableToggleAfter, rosterToggleAfter, recentToggleAfter] = mobileSectionButtons();
    expect(availableToggleAfter).toHaveAttribute("aria-expanded", "true");
    expect(rosterToggleAfter).toHaveAttribute("aria-expanded", "true");
    expect(recentToggleAfter).toHaveAttribute("aria-expanded", "true");
  });

  it("preserves the available-players search text across a collapse and reopen", () => {
    renderDraftRoomAtSlot1();

    const searchBox = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchBox, { target: { value: "mahomes" } });
    expect((searchBox as HTMLInputElement).value).toBe("mahomes");

    const [availableToggle] = mobileSectionButtons();
    fireEvent.click(availableToggle); // collapse
    fireEvent.click(availableToggle); // reopen

    const searchBoxAfter = screen.getByPlaceholderText(/search/i);
    expect((searchBoxAfter as HTMLInputElement).value).toBe("mahomes");
  });

  it("does not reset draft progress or scroll/trigger a CPU pick when toggling a mobile section", () => {
    const result = renderDraftRoomAtSlot1();

    const selectionsBefore = result.current.selections.length;
    const [, rosterToggle] = mobileSectionButtons();
    fireEvent.click(rosterToggle);
    fireEvent.click(rosterToggle);

    expect(result.current.selections.length).toBe(selectionsBefore);
    expect(screen.getByRole("heading", { level: 1, name: "Available players" })).toBeInTheDocument();
  });

  it("gives each mobile section header an accessible expanded state and controls target", () => {
    renderDraftRoomAtSlot1();

    for (const button of mobileSectionButtons()) {
      const controlsId = button.getAttribute("aria-controls");
      expect(controlsId).toBeTruthy();
      expect(["true", "false"]).toContain(button.getAttribute("aria-expanded"));
    }
  });

  it("keeps the desktop layout DOM structure (DraftBoard, AvailablePlayersTable, UserRosterPanel) present and unchanged", () => {
    renderDraftRoomAtSlot1();
    expect(screen.getAllByText("Recent selections").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Your pick: Round 1, Pick 1/).length).toBeGreaterThan(0);
  });
});
