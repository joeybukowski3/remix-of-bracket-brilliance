import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import LegacyPositionBoard from "@/components/fantasy/LegacyPositionBoard";
import { FANTASY_RANKINGS } from "@/lib/fantasy/rankings";

afterEach(() => vi.unstubAllGlobals());

function stubCompactViewport() {
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  })));
}

/**
 * Guards the pre-redesign board restored for side-by-side review. These assert
 * the original behaviour, so they should fail loudly if the restored copy ever
 * drifts from what was deleted.
 */
describe("restored legacy position board", () => {
  it("renders a fixed compact core with unchanged legacy ranking values", () => {
    stubCompactViewport();
    render(<LegacyPositionBoard position="RB" query="jahmyr gibbs" mobileGroup="Metrics" />);
    const table = screen.getByRole("table");
    expect(table.className).toContain("table-fixed");
    expect(table.className).not.toContain("min-w-");

    const source = FANTASY_RANKINGS.rows.find((row) => row.player === "Jahmyr Gibbs")!;
    const row = screen.getAllByRole("row").find((item) => within(item).queryByText("Jahmyr Gibbs"))!;
    const cells = Array.from(row.querySelectorAll("td"));
    expect(cells[0].textContent).toBe(String(source.positionRank));
    expect(cells[2].textContent).toBe(String(source.projectionRank));
    expect(cells[3].textContent).toBe(String(source.averageRank));

    fireEvent.click(screen.getByRole("button", { name: "Show details for Jahmyr Gibbs" }));
    expect(screen.getByText("Touches Rk")).toBeTruthy();
    expect(screen.getByText("Strength of Schedule")).toBeTruthy();
    expect(screen.getByText("W17")).toBeTruthy();
  });

  it("renders full-width tier header rows, with tier chips mobile-only as before", () => {
    render(<LegacyPositionBoard position="RB" query="" mobileGroup="Metrics" />);
    expect(screen.getByText("Tier 1")).toBeTruthy();
    expect(screen.getByText("Outside Draft Pool")).toBeTruthy();
    // The original board hid its inline chips above the md breakpoint.
    for (const chip of screen.getAllByText("T1")) {
      expect(chip.className).toContain("md:hidden");
    }
  });

  it("keeps the original column set, including the model columns", () => {
    render(<LegacyPositionBoard position="RB" query="" mobileGroup="Metrics" />);
    for (const label of [
      "JKB Rk",
      "Touches Rk",
      "Late / Last 8 Rk",
      "Projection Rk",
      "Vegas Rk",
      "AVG Rk",
      "Strength of Schedule",
      "O-Line Rk",
      "W15",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("omits the Vegas column for WR, which has no Vegas data", () => {
    render(<LegacyPositionBoard position="WR" query="" mobileGroup="Metrics" />);
    expect(screen.getByText("Target % Rk")).toBeTruthy();
    expect(screen.queryByText("Vegas Rk")).toBeNull();
  });

  it("carries no PAR/G, tier-chip or Season PAR styling", () => {
    render(<LegacyPositionBoard position="RB" query="" mobileGroup="Metrics" />);
    expect(screen.queryByText("PAR/G")).toBeNull();
    expect(screen.queryByText("'26 proj")).toBeNull();
    expect(screen.queryByText("'25 actual")).toBeNull();
  });

  it("shows a bare JKB position rank, not a PAR-sorted RBn label", () => {
    render(<LegacyPositionBoard position="RB" query="" mobileGroup="Metrics" />);
    const firstRow = screen.getAllByRole("row").find((row) => within(row).queryByText("Jahmyr Gibbs"));
    expect(firstRow).toBeTruthy();
    // First cell is the rank column: a bare number, never "RB1".
    expect(firstRow!.querySelector("td")?.textContent).toBe("1");
    expect(within(firstRow!).queryByText("RB1")).toBeNull();
  });

  it("honours the mobile column-group selection", () => {
    const { rerender } = render(
      <LegacyPositionBoard position="RB" query="" mobileGroup="Metrics" />,
    );
    const metricsHeader = screen.getByText("Touches Rk");
    expect(metricsHeader.className).not.toContain("max-md:hidden");

    rerender(<LegacyPositionBoard position="RB" query="" mobileGroup="Playoffs" />);
    expect(screen.getByText("Touches Rk").className).toContain("max-md:hidden");
    expect(screen.getByText("W15").className).not.toContain("max-md:hidden");
  });

  it("still exposes expandable PAR detail rows and search filtering", () => {
    render(<LegacyPositionBoard position="RB" query="jahmyr gibbs" mobileGroup="Metrics" />);
    fireEvent.click(screen.getByRole("button", { name: "Show details for Jahmyr Gibbs" }));
    expect(screen.getByText(/PAR rank/i)).toBeTruthy();
  });

  it("reports an empty state when nothing matches", () => {
    render(<LegacyPositionBoard position="RB" query="zzz-no-player" mobileGroup="Metrics" />);
    expect(screen.getByText(/No players match/i)).toBeTruthy();
  });
});
