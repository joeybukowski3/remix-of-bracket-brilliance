import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import HrPlusEvTable from "@/components/mlb/HrPlusEvTable";
import { evaluateHrPlusEv, type HrPlusEvBatterSource } from "@/lib/mlb/hrPlusEvModel";

function source(overrides: Partial<HrPlusEvBatterSource> = {}): HrPlusEvBatterSource {
  return {
    player: "Adley Rutschman",
    team: "BAL",
    opponent: "CHC",
    opposingPitcher: "Justin Steele",
    battingOrder: 3,
    bats: "S",
    pitcherHand: "L",
    parkFactor: 1.05,
    weatherBoost: 2,
    opposingPitcherHrVs: 62,
    hrOddsYes: "+425",
    seasonHomeRuns: 20,
    seasonPlateAppearances: 400,
    handednessSplits: {
      vsLeft: { homeRuns: 10, plateAppearances: 180 },
      vsRight: { homeRuns: 10, plateAppearances: 220 },
    },
    ...overrides,
  };
}

describe("HrPlusEvTable", () => {
  it("renders desktop columns and defaults to EV descending", () => {
    const high = evaluateHrPlusEv(source({ player: "High EV", hrOddsYes: "+800" }));
    const low = evaluateHrPlusEv(source({ player: "Low EV", hrOddsYes: "-150" }));
    const { container } = render(<HrPlusEvTable rows={[low, high]} compact={false} />);

    expect(container.querySelector('[data-plus-ev-table="desktop"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: /^Book Odds/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Fair Odds/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^\+EV/i })).toBeInTheDocument();
    expect(screen.getByText("Matchup")).toBeInTheDocument();
    expect(screen.getByText("JKB HR%")).toBeInTheDocument();

    const names = screen.getAllByText(/High EV|Low EV/).map((node) => node.textContent);
    expect(names[0]).toContain("High EV");
  });

  it("expands a row to show model details", () => {
    const row = evaluateHrPlusEv(source());
    render(<HrPlusEvTable rows={[row]} compact={false} />);

    fireEvent.click(screen.getByRole("button", { name: /Show \+EV details for Adley Rutschman/i }));
    const details = screen.getByTestId
      ? document.querySelector('[data-plus-ev-details="Adley Rutschman"]')
      : null;
    expect(details).not.toBeNull();
    expect(within(details as HTMLElement).getByText("Season HR/PA")).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText("Last 100 PA HR/PA")).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText("Last 50 PA HR/PA")).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText("Batting order / expected PA")).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText("Hitter handedness")).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText("Starter HR susceptibility")).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText("Opponent bullpen HR/PA")).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText("Park factor")).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText("Weather")).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText("Total multiplier")).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText("Adjusted HR/PA")).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText("JKB HR%")).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText("Book implied %")).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText("Probability edge")).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText("Fair odds")).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText("Book odds")).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText("+EV")).toBeInTheDocument();
  });

  it("renders UNAVAILABLE when valuation cannot be calculated", () => {
    const row = evaluateHrPlusEv(source({ hrOddsYes: null, seasonHomeRuns: null, seasonPlateAppearances: null, handednessSplits: null }));
    render(<HrPlusEvTable rows={[row]} compact={false} />);
    expect(screen.getByText("UNAVAILABLE")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Show \+EV details for Adley Rutschman/i }));
    expect(screen.getByText(/Season HR\/PA is unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/Sportsbook HR YES odds/i)).toBeInTheDocument();
  });

  it("prioritizes Batter, Book Odds, Fair Odds, EV, and Value on mobile", () => {
    const row = evaluateHrPlusEv(source());
    const { container } = render(<HrPlusEvTable rows={[row]} compact />);
    expect(container.querySelector('[data-plus-ev-table="mobile"]')).not.toBeNull();
    expect(screen.getByText("Adley Rutschman")).toBeInTheDocument();
    expect(screen.getByText("+425")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader")).not.toBeInTheDocument();
    expect(container.textContent).toMatch(/\+EV|EV|UNAVAILABLE|STRONG|MODERATE|FAIR|OVERPRICED/);
  });
});
