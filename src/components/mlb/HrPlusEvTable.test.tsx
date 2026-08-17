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
    last30HomeRuns: 4,
    last30PlateAppearances: 80,
    last14HomeRuns: 2,
    last14PlateAppearances: 40,
    handednessSplits: {
      vsLeft: { homeRuns: 10, plateAppearances: 180 },
      vsRight: { homeRuns: 10, plateAppearances: 220 },
    },
    ...overrides,
  };
}

describe("HrPlusEvTable", () => {
  it("renders V2 desktop columns and defaults to EV descending", () => {
    const high = evaluateHrPlusEv(source({ player: "High EV", hrOddsYes: "+800" }));
    const low = evaluateHrPlusEv(source({ player: "Low EV", hrOddsYes: "-150" }));
    const { container } = render(<HrPlusEvTable rows={[low, high]} compact={false} />);

    expect(container.querySelector('[data-plus-ev-table="desktop"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: /^Book Odds/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Season PA\/HR/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Current Rate Fair/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^HR Trend/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Matchup/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^JKB HR%/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^JKB Fair/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^\+EV/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Value/i })).toBeInTheDocument();
    // The old V1 raw HR/PA column header must not remain.
    expect(screen.queryByRole("button", { name: /^HR\/PA$/i })).not.toBeInTheDocument();

    const names = screen.getAllByText(/High EV|Low EV/).map((node) => node.textContent);
    expect(names[0]).toContain("High EV");
  });

  it("shows the >300 PA eligibility banner", () => {
    const row = evaluateHrPlusEv(source());
    render(<HrPlusEvTable rows={[row]} compact={false} />);
    expect(screen.getByText(/more than 300 season PA/i)).toBeInTheDocument();
  });

  it("expands a row to show V2 model details", () => {
    const row = evaluateHrPlusEv(source());
    render(<HrPlusEvTable rows={[row]} compact={false} />);

    fireEvent.click(screen.getByRole("button", { name: /Show \+EV details for Adley Rutschman/i }));
    const details = document.querySelector('[data-plus-ev-details="Adley Rutschman"]');
    expect(details).not.toBeNull();
    const scope = within(details as HTMLElement);
    expect(scope.getByText("Season HR")).toBeInTheDocument();
    expect(scope.getByText("Season PA")).toBeInTheDocument();
    expect(scope.getByText("Season PA/HR")).toBeInTheDocument();
    expect(scope.getByText("Batting order / expected PA")).toBeInTheDocument();
    expect(scope.getByText("Current Rate HR%")).toBeInTheDocument();
    expect(scope.getByText("Current Rate Fair")).toBeInTheDocument();
    expect(scope.getByText("L30 HR")).toBeInTheDocument();
    expect(scope.getByText("L30 PA")).toBeInTheDocument();
    expect(scope.getByText("L30 PA/HR")).toBeInTheDocument();
    expect(scope.getByText("L14 HR")).toBeInTheDocument();
    expect(scope.getByText("L14 PA")).toBeInTheDocument();
    expect(scope.getByText("L14 PA/HR")).toBeInTheDocument();
    expect(scope.getByText("Trend Factor")).toBeInTheDocument();
    expect(scope.getByText("Matchup Multiplier")).toBeInTheDocument();
    expect(scope.getByText("Trend-adjusted HR/PA")).toBeInTheDocument();
    expect(scope.getByText("Final JKB HR/PA")).toBeInTheDocument();
    expect(scope.getByText("JKB HR%")).toBeInTheDocument();
    expect(scope.getByText("JKB Fair")).toBeInTheDocument();
    expect(scope.getByText("Book odds")).toBeInTheDocument();
    expect(scope.getByText("Book implied %")).toBeInTheDocument();
    expect(scope.getByText("Probability edge")).toBeInTheDocument();
    expect(scope.getByText("+EV")).toBeInTheDocument();
    expect(scope.getByText("Value")).toBeInTheDocument();
    expect(scope.getByText("Starter HR susceptibility")).toBeInTheDocument();
    expect(scope.getByText("Hitter HR/PA vs starter hand")).toBeInTheDocument();
    expect(scope.getByText("Park factor")).toBeInTheDocument();
    expect(scope.getByText("Weather")).toBeInTheDocument();
  });

  it("shows a real populated 0-HR trend window without Infinity, and an unavailable window explicitly", () => {
    const row = evaluateHrPlusEv(source({
      last30HomeRuns: 0,
      last30PlateAppearances: 51,
      last14HomeRuns: null,
      last14PlateAppearances: null,
    }));
    render(<HrPlusEvTable rows={[row]} compact={false} />);
    fireEvent.click(screen.getByRole("button", { name: /Show \+EV details for Adley Rutschman/i }));
    const details = document.querySelector('[data-plus-ev-details="Adley Rutschman"]') as HTMLElement;
    expect(within(details).getByText("0")).toBeInTheDocument();
    expect(within(details).getByText("51")).toBeInTheDocument();
    expect(details.textContent).not.toMatch(/infinity/i);
    expect(within(details).getByText("unavailable")).toBeInTheDocument();
  });

  it("renders UNAVAILABLE when valuation cannot be calculated", () => {
    const row = evaluateHrPlusEv(source({ hrOddsYes: null, seasonHomeRuns: null, seasonPlateAppearances: null, handednessSplits: null }));
    render(<HrPlusEvTable rows={[row]} compact={false} />);
    expect(screen.getByText("UNAVAILABLE")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Show \+EV details for Adley Rutschman/i }));
    expect(screen.getByText(/Season HR\/PA is unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/Sportsbook HR YES odds/i)).toBeInTheDocument();
  });

  it("renders UNAVAILABLE for a batter at or below the 300 PA eligibility threshold", () => {
    const row = evaluateHrPlusEv(source({ seasonPlateAppearances: 300 }));
    render(<HrPlusEvTable rows={[row]} compact={false} />);
    expect(screen.getByText("UNAVAILABLE")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Show \+EV details for Adley Rutschman/i }));
    expect(screen.getByText(/more than 300 season plate appearances/i)).toBeInTheDocument();
  });

  it("prioritizes Batter, Book Odds, Current Rate Fair, JKB Fair, EV, and Value on mobile", () => {
    const row = evaluateHrPlusEv(source());
    const { container } = render(<HrPlusEvTable rows={[row]} compact />);
    expect(container.querySelector('[data-plus-ev-table="mobile"]')).not.toBeNull();
    expect(screen.getByText("Adley Rutschman")).toBeInTheDocument();
    expect(screen.getByText("+425")).toBeInTheDocument();
    expect(screen.getByText(/Current:/)).toBeInTheDocument();
    expect(screen.queryByRole("columnheader")).not.toBeInTheDocument();
    expect(container.textContent).toMatch(/\+EV|EV|UNAVAILABLE|STRONG|MODERATE|FAIR|OVERPRICED/);
  });
});

function fixtureRows() {
  const rows = {
    strong: evaluateHrPlusEv(source({ player: "Strong Row", hrOddsYes: "+800", seasonHomeRuns: 24, seasonPlateAppearances: 380 })),
    moderate: evaluateHrPlusEv(source({ player: "Moderate Row", hrOddsYes: "+425", seasonHomeRuns: 20, seasonPlateAppearances: 400 })),
    fair: evaluateHrPlusEv(source({ player: "Fair Row", hrOddsYes: "+375", seasonHomeRuns: 20, seasonPlateAppearances: 400 })),
    overpriced: evaluateHrPlusEv(source({ player: "Overpriced Row", hrOddsYes: "-150", seasonHomeRuns: 20, seasonPlateAppearances: 400 })),
    unavailable: evaluateHrPlusEv(source({ player: "No Price", hrOddsYes: null, seasonHomeRuns: null, seasonPlateAppearances: null })),
  };
  expect(rows.strong.label).toBe("STRONG +EV");
  expect(rows.moderate.label).toBe("MODERATE +EV");
  expect(rows.fair.label).toBe("FAIR");
  expect(rows.overpriced.label).toBe("OVERPRICED");
  expect(rows.unavailable.label).toBe("UNAVAILABLE");
  return rows;
}

describe("HrPlusEvTable filters", () => {
  it("defaults to All and keeps EV descending, with no Sample filter control", () => {
    const rows = fixtureRows();
    render(<HrPlusEvTable rows={Object.values(rows)} compact={false} />);
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "All Samples" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Established" })).not.toBeInTheDocument();
    expect(screen.getByText("Strong Row")).toBeInTheDocument();
    expect(screen.getByText("No Price")).toBeInTheDocument();
    const names = screen.getAllByText(/Strong Row|Moderate Row|Fair Row|Overpriced Row|No Price/).map((node) => node.textContent);
    expect(names[0]).toContain("Strong Row");
  });

  it("filters Strong +EV and hides unavailable rows", () => {
    const rows = fixtureRows();
    render(<HrPlusEvTable rows={Object.values(rows)} compact={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Strong +EV" }));
    expect(screen.getByText("Strong Row")).toBeInTheDocument();
    expect(screen.queryByText("Fair Row")).not.toBeInTheDocument();
    expect(screen.queryByText("Overpriced Row")).not.toBeInTheDocument();
    expect(screen.queryByText("No Price")).not.toBeInTheDocument();
  });

  it("filters Moderate +EV", () => {
    const rows = fixtureRows();
    render(<HrPlusEvTable rows={Object.values(rows)} compact={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Moderate +EV" }));
    expect(screen.getByText("Moderate Row")).toBeInTheDocument();
    expect(screen.queryByText("Strong Row")).not.toBeInTheDocument();
    expect(screen.queryByText("Fair Row")).not.toBeInTheDocument();
  });

  it("filters Fair", () => {
    const rows = fixtureRows();
    render(<HrPlusEvTable rows={Object.values(rows)} compact={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Fair" }));
    expect(screen.getByText("Fair Row")).toBeInTheDocument();
    expect(screen.queryByText("Strong Row")).not.toBeInTheDocument();
    expect(screen.queryByText("Overpriced Row")).not.toBeInTheDocument();
  });

  it("filters Overpriced", () => {
    const rows = fixtureRows();
    render(<HrPlusEvTable rows={Object.values(rows)} compact={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Overpriced" }));
    expect(screen.getByText("Overpriced Row")).toBeInTheDocument();
    expect(screen.queryByText("Strong Row")).not.toBeInTheDocument();
    expect(screen.queryByText("Fair Row")).not.toBeInTheDocument();
  });

  it("Positive EV only hides overpriced and unavailable rows", () => {
    const rows = fixtureRows();
    render(<HrPlusEvTable rows={Object.values(rows)} compact={false} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Positive EV only/i }));
    expect(screen.getByText("Strong Row")).toBeInTheDocument();
    expect(screen.getByText("Moderate Row")).toBeInTheDocument();
    expect(screen.queryByText("Overpriced Row")).not.toBeInTheDocument();
    expect(screen.queryByText("No Price")).not.toBeInTheDocument();
  });

  it("updates the priced-hitter result count", () => {
    const rows = fixtureRows();
    render(<HrPlusEvTable rows={Object.values(rows)} compact={false} />);
    expect(screen.getByText(/4 of 4 priced hitters/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Strong +EV" }));
    expect(screen.getByText(/1 of 4 priced hitters/)).toBeInTheDocument();
  });
});
