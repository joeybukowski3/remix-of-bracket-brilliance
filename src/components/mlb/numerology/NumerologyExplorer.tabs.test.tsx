import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { NumerologyExplorer } from "./NumerologyExplorer";
import type { DailyProfile } from "@/types/mlbNumerology";
import type { NumerologyCardPlayer } from "./NumerologyAuditCard";

const DAILY: DailyProfile = {
  universalDayRawSum: 19,
  universalDayCompound: 19,
  universalDayMaster: null,
  universalDayRoot: 1,
  universalDayTrace: [],
  calendarDayCompound: 30,
  calendarDayRoot: 3,
  universalYear: 1,
  universalMonth: 7,
  structuralEcho: "10/1",
  primaryFamily: [1, 4, 7],
  secondaryFamily: [3, 6, 9],
  balancingComplement: 9,
  countercurrent: 8,
  repeatedDigits: [],
  interpretation: "",
};

function player(overrides: Partial<NumerologyCardPlayer> = {}): NumerologyCardPlayer {
  return {
    playerName: "Player",
    team: "NYY",
    opponent: "BOS",
    jerseyNumber: 10,
    numerologyScore: 20,
    baseballScore: 40,
    ...overrides,
  };
}

function desktopNames(container: HTMLElement): string[] {
  return [...container.querySelectorAll("tbody tr")]
    .map((row) => row.querySelector("b")?.textContent ?? "")
    .filter(Boolean);
}

function firstScore(container: HTMLElement, key: "sinCity" | "numerology"): number {
  const cell = container.querySelector(`[data-score="${key}"]`);
  return Number(cell?.textContent ?? "NaN");
}

function renderStaticExplorer() {
  return render(
    <NumerologyExplorer
      exact={[
        player({
          playerName: "Sin Leader",
          team: "NYY",
          jerseyNumber: 19,
          numerologyScore: 20,
          baseballScore: 10,
          scoreBreakdown: {
            sinCity: { included: true, score: 80, matchCount: 2, evaluatedCount: 2, fieldPoints: 6, comboBonus: 0, bonus: 6, rawCeiling: 21, matches: [] },
          } as NumerologyCardPlayer["scoreBreakdown"],
        }),
      ]}
      root={[
        player({
          playerName: "Num Leader",
          team: "BOS",
          opponent: "NYY",
          jerseyNumber: 3,
          numerologyScore: 90,
          baseballScore: 80,
          scoreBreakdown: {
            sinCity: { included: true, score: 10, matchCount: 0, evaluatedCount: 1, fieldPoints: 1, comboBonus: 0, bonus: 1, rawCeiling: 21, matches: [] },
          } as NumerologyCardPlayer["scoreBreakdown"],
        }),
      ]}
    />,
  );
}

function renderLiveExplorer() {
  return render(
    <NumerologyExplorer
      exact={[
        player({
          playerName: "Jersey Star",
          team: "NYY",
          jerseyNumber: 19,
          numerologyScore: 0,
          baseballScore: 10,
        }),
      ]}
      root={[]}
      identities={{
        "Jersey Star|NYY": { birthDate: "2003-04-19", jerseyNumber: 19 },
      }}
      dailyProfile={DAILY}
      slateDate="2026-06-30"
    />,
  );
}

describe("Explorer ranking tabs", () => {
  it("defaults to the Sin City tab", () => {
    renderStaticExplorer();
    expect(screen.getByRole("tab", { name: "Sin City" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Numerology" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByText("Sin City Score ↓")).toBeTruthy();
  });

  it("sorts the Sin City tab by Sin City Score descending", () => {
    const { container } = renderStaticExplorer();
    expect(desktopNames(container)[0]).toBe("Sin Leader");
  });

  it("sorts the Numerology tab by Numerology Score descending", () => {
    const { container } = renderStaticExplorer();
    fireEvent.click(screen.getByRole("tab", { name: "Numerology" }));
    expect(screen.getByRole("tab", { name: "Numerology" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Numerology Score ↓")).toBeTruthy();
    expect(desktopNames(container)[0]).toBe("Num Leader");
  });

  it("changes ranking authority immediately when switching tabs", () => {
    const { container } = renderStaticExplorer();
    expect(desktopNames(container)[0]).toBe("Sin Leader");
    fireEvent.click(screen.getByRole("tab", { name: "Numerology" }));
    expect(desktopNames(container)[0]).toBe("Num Leader");
    fireEvent.click(screen.getByRole("tab", { name: "Sin City" }));
    expect(desktopNames(container)[0]).toBe("Sin Leader");
  });

  it("keeps each Filter Settings panel collapsed by default", () => {
    renderStaticExplorer();
    expect(screen.getByRole("button", { name: "Sin City Filter Settings" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Jersey # Exclude" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Numerology" }));
    expect(screen.getByRole("button", { name: "Numerology Filter Settings" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Jersey Exclude" })).toBeNull();
  });

  it("lets Include/Exclude work after expanding Filter Settings", () => {
    renderStaticExplorer();
    fireEvent.click(screen.getByRole("button", { name: "Sin City Filter Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Jersey # Exclude" }));
    expect(screen.getByRole("button", { name: "Jersey # Exclude" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Numerology" }));
    fireEvent.click(screen.getByRole("button", { name: "Numerology Filter Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Personal Day Exclude" }));
    expect(screen.getByRole("button", { name: "Personal Day Exclude" })).toHaveAttribute("aria-pressed", "true");
  });

  it("applies shared search and team filters in both tabs", () => {
    const { container } = renderStaticExplorer();
    fireEvent.change(screen.getByPlaceholderText("Search players"), { target: { value: "Num" } });
    expect(desktopNames(container)).toEqual(["Num Leader"]);
    fireEvent.change(screen.getByPlaceholderText("Search players"), { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Team" }), { target: { value: "NYY" } });
    expect(desktopNames(container)).toEqual(["Sin Leader"]);
    fireEvent.click(screen.getByRole("tab", { name: "Numerology" }));
    expect(desktopNames(container)).toEqual(["Sin Leader"]);
  });

  it("keeps mobile layout compact: tappable tabs, collapsed settings, wrapping, no page overflow", () => {
    const { container } = renderStaticExplorer();
    const tablist = screen.getByRole("tablist", { name: "Ranking view" });
    expect(tablist.className).toContain("grid-cols-2");
    expect(screen.getByRole("tab", { name: "Sin City" }).className).toContain("min-h-11");
    expect(screen.getByRole("tab", { name: "Numerology" }).className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "Sin City Filter Settings" })).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelector("#explorer")?.className).toContain("overflow-x-hidden");
    expect(container.querySelector("[data-prominent-score='sinCity']")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Numerology" }));
    expect(container.querySelector("[data-prominent-score='numerology']")).toBeTruthy();
    const mobileCard = container.querySelector("article");
    expect(mobileCard).toBeTruthy();
    expect(within(mobileCard as HTMLElement).getByText(/Sin Leader|Num Leader/)).toBeTruthy();
  });
});

describe("Independent scoring controls", () => {
  it("Sin City settings change Sin City Score only", () => {
    const { container } = renderLiveExplorer();
    const beforeSin = firstScore(container, "sinCity");
    const beforeNum = firstScore(container, "numerology");
    expect(beforeSin).toBeGreaterThan(0);
    expect(beforeNum).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Sin City Filter Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Jersey # Exclude" }));

    expect(firstScore(container, "sinCity")).toBeLessThan(beforeSin);
    expect(firstScore(container, "numerology")).toBe(beforeNum);
  });

  it("Numerology settings change Numerology Score only", () => {
    const { container } = renderLiveExplorer();
    fireEvent.click(screen.getByRole("tab", { name: "Numerology" }));
    const beforeSin = firstScore(container, "sinCity");
    const beforeNum = firstScore(container, "numerology");
    expect(beforeSin).toBeGreaterThan(0);
    expect(beforeNum).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Numerology Filter Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Jersey Exclude" }));

    expect(firstScore(container, "numerology")).toBeLessThan(beforeNum);
    expect(firstScore(container, "sinCity")).toBe(beforeSin);
  });
});
