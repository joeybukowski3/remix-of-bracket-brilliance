import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PgaHistoryModelTable from "./PgaHistoryModelTable";
import type { PgaHistoryResult, PgaTournamentModelRow } from "@/lib/pga/historyModel";

vi.mock("@/hooks/useJkbTrendRankings", () => ({
  useJkbTrendRankings: () => ({ payload: null, rankingMap: new Map(), loading: false, error: null }),
}));

function finish(overrides: Partial<PgaHistoryResult> = {}): PgaHistoryResult {
  return {
    eventName: "Sample Event",
    season: 2026,
    finishText: "T12",
    finishPosition: 12,
    madeCut: true,
    status: "made_cut",
    ...overrides,
  } as PgaHistoryResult;
}

function row(overrides: Partial<PgaTournamentModelRow> = {}): PgaTournamentModelRow {
  return {
    player: "Sample Golfer",
    sgTotal: 1.42, sgOTT: 0.51, sgApp: 0.83, sgAtG: 0.22, sgPutt: -0.14,
    trendRank: 12, drivingAccuracy: 62.4, bogeyAvoidance: 0.121, birdieBogeyRatio: 1.8,
    baseScore: 70, modelScore: 82.4,
    modelRank: 4,
    fieldRank: 1,
    recentResults: [finish()],
    eventResults: [finish({ finishText: "3", finishPosition: 3 })],
    specificMajorResults: [], allMajorResults: [],
    recentScore: 70, eventHistoryScore: 60, specificMajorScore: null, allMajorScore: null,
    courseFit: 34,
    trend: { score: 1, delta: 0.4, direction: "up", label: "Rising" },
    drivingDistance: 302.5,
    displayPercentiles: { sgTotal: 88, sgApp: 62, sgPutt: 18 },
    ...overrides,
  } as PgaTournamentModelRow;
}

function renderTable(rows: PgaTournamentModelRow[], rankMode: "field" | "tour") {
  return render(
    <PgaHistoryModelTable rows={rows} statView="percentile" isMajor={false} eventLabel="Rocket Classic" rankMode={rankMode} />,
  );
}

/** The desktop rank cell (first column of the first body row). */
function desktopRankCell(container: HTMLElement) {
  const cell = container.querySelector("table tbody tr td:nth-child(1)");
  if (!cell) throw new Error("desktop rank cell not rendered");
  return cell as HTMLElement;
}

/** Every desktop rank cell, in row order. */
function allDesktopRankCells(container: HTMLElement) {
  return [...container.querySelectorAll("table tbody tr td:nth-child(1)")] as HTMLElement[];
}

describe("field-only mode", () => {
  it("leads with the field rank and keeps the tour rank available", () => {
    const { container } = renderTable([row({ modelRank: 4, fieldRank: 1 })], "field");
    const cell = desktopRankCell(container);

    expect(cell.textContent).toContain("1");
    expect(cell.textContent).toContain("Tour #4");
    // The leading number is the field rank, not the tour rank.
    expect(cell.firstElementChild?.textContent?.trim()).toBe("1");
  });

  it("does not repeat the same number when both ranks are equal", () => {
    const { container } = renderTable([row({ modelRank: 1, fieldRank: 1 })], "field");
    const cell = desktopRankCell(container);

    expect(cell.firstElementChild?.textContent?.trim()).toBe("1");
    expect(cell.textContent).not.toContain("Tour #1");
    expect(cell.textContent).toContain("Field");
  });
});

describe("all-players mode", () => {
  it("leads with the tour rank for the top-ranked player", () => {
    // THE REGRESSION: this row previously rendered a bold "—" because it has no
    // field rank, demoting the world #1's real rank to 9px grey.
    const { container } = renderTable([row({ player: "Scottie Scheffler", modelRank: 1, fieldRank: null })], "tour");
    const cell = desktopRankCell(container);

    expect(cell.firstElementChild?.textContent?.trim()).toBe("1");
    expect(cell.textContent).toContain("Tour");
  });

  it("renders NO primary dash on any row that has a valid tour rank", () => {
    const rows = [
      row({ player: "Scottie Scheffler", modelRank: 1, fieldRank: null }),
      row({ player: "Rory McIlroy", modelRank: 2, fieldRank: null }),
      row({ player: "Robert MacIntyre", modelRank: 3, fieldRank: null }),
      row({ player: "Jacob Bridgeman", modelRank: 4, fieldRank: 1 }),
    ];
    const { container } = renderTable(rows, "tour");

    const leading = allDesktopRankCells(container).map((c) => c.firstElementChild?.textContent?.trim());
    expect(leading).toEqual(["1", "2", "3", "4"]);
    expect(leading).not.toContain("—");
  });

  it("keeps the field rank available as supporting detail for a field player", () => {
    const { container } = renderTable([row({ modelRank: 4, fieldRank: 1 })], "tour");
    const cell = desktopRankCell(container);

    expect(cell.firstElementChild?.textContent?.trim()).toBe("4");
    expect(cell.textContent).toContain("Field #1");
  });

  it("shows no field rank for a non-field player", () => {
    const { container } = renderTable([row({ modelRank: 7, fieldRank: null })], "tour");
    expect(desktopRankCell(container).textContent).not.toContain("Field #");
  });
});

describe("mobile rendering", () => {
  it("leads the collapsed row with the tour rank in all-players mode", () => {
    renderTable([row({ player: "Scottie Scheffler", modelRank: 1, fieldRank: null })], "tour");
    const button = screen.getByRole("button", { name: /Scottie Scheffler/i });

    expect(button.textContent).toContain("#1");
    expect(button.textContent).not.toContain("—");
  });

  it("leads the collapsed row with the field rank in field-only mode", () => {
    renderTable([row({ player: "Jacob Bridgeman", modelRank: 4, fieldRank: 1 })], "field");
    const button = screen.getByRole("button", { name: /Jacob Bridgeman/i });

    expect(button.textContent).toContain("#1");
  });

  it("exposes both ranks in the expanded panel without ambiguity", () => {
    renderTable([row({ player: "Jacob Bridgeman", modelRank: 4, fieldRank: 1 })], "tour");
    const button = screen.getByRole("button", { name: /Jacob Bridgeman/i });
    fireEvent.click(button);

    const panel = document.getElementById(button.getAttribute("aria-controls")!);
    expect(panel).toBeTruthy();
    expect(within(panel!).getByText(/Tour rank/i)).toBeInTheDocument();
    expect(within(panel!).getByText(/Field rank/i)).toBeInTheDocument();
  });

  it("states plainly when an expanded player is not in this week's field", () => {
    renderTable([row({ player: "Scottie Scheffler", modelRank: 1, fieldRank: null })], "tour");
    const button = screen.getByRole("button", { name: /Scottie Scheffler/i });
    fireEvent.click(button);

    const panel = document.getElementById(button.getAttribute("aria-controls")!);
    expect(within(panel!).getByText(/Not in this week's field/i)).toBeInTheDocument();
  });
});

describe("toggling between modes", () => {
  it("changes which rank leads without altering model scores or ranks", () => {
    const rows = [
      row({ player: "Scottie Scheffler", modelRank: 1, fieldRank: null, modelScore: 90 }),
      row({ player: "Jacob Bridgeman", modelRank: 4, fieldRank: 1, modelScore: 82.4 }),
    ];

    const tour = renderTable(rows, "tour");
    expect(allDesktopRankCells(tour.container).map((c) => c.firstElementChild?.textContent?.trim())).toEqual(["1", "4"]);
    // Model score is unchanged by the display mode.
    expect(within(tour.container.querySelector("table")!).getByText("82.4")).toBeInTheDocument();
    tour.unmount();

    // Field-only mode renders only field members, as the page filters them.
    const field = renderTable([rows[1]], "field");
    expect(allDesktopRankCells(field.container).map((c) => c.firstElementChild?.textContent?.trim())).toEqual(["1"]);
    expect(within(field.container.querySelector("table")!).getByText("82.4")).toBeInTheDocument();

    // The underlying row objects were never mutated by rendering.
    expect(rows[0].modelRank).toBe(1);
    expect(rows[1].fieldRank).toBe(1);
    expect(rows[1].modelScore).toBe(82.4);
  });
});
