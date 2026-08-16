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
    expect(within(details as HTMLElement).getByText("Season HR")).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText("Season PA")).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText("Season HR/PA")).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText("Sample")).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText("ESTABLISHED")).toBeInTheDocument();
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
    expect(screen.queryByRole("columnheader")).not.toBeInTheDocument();
  });
});

function fixtureRows() {
  const rows = {
    strongEstablished: evaluateHrPlusEv(source({ player: "Strong Established", hrOddsYes: "+800", seasonHomeRuns: 20, seasonPlateAppearances: 400 })),
    moderateEstablished: evaluateHrPlusEv(source({ player: "Moderate Established", hrOddsYes: "+425", seasonHomeRuns: 20, seasonPlateAppearances: 400 })),
    fairEstablished: evaluateHrPlusEv(source({ player: "Fair Established", hrOddsYes: "+375", seasonHomeRuns: 20, seasonPlateAppearances: 400 })),
    overpricedEstablished: evaluateHrPlusEv(source({ player: "Overpriced Established", hrOddsYes: "-150", seasonHomeRuns: 20, seasonPlateAppearances: 400 })),
    strongLimited: evaluateHrPlusEv(source({ player: "Strong Limited", hrOddsYes: "+900", seasonHomeRuns: 4, seasonPlateAppearances: 80 })),
    strongVeryLimited: evaluateHrPlusEv(source({ player: "Strong Very Limited", hrOddsYes: "+950", seasonHomeRuns: 3, seasonPlateAppearances: 52 })),
    strongModerateSample: evaluateHrPlusEv(source({ player: "Strong Moderate Sample", hrOddsYes: "+700", seasonHomeRuns: 10, seasonPlateAppearances: 150 })),
    unavailable: evaluateHrPlusEv(source({ player: "No Price", hrOddsYes: null, seasonHomeRuns: null, seasonPlateAppearances: null })),
  };
  expect(rows.strongEstablished.label).toBe("STRONG +EV");
  expect(rows.moderateEstablished.label).toBe("MODERATE +EV");
  expect(rows.fairEstablished.label).toBe("FAIR");
  expect(rows.overpricedEstablished.label).toBe("OVERPRICED");
  expect(rows.strongLimited.label).toBe("STRONG +EV");
  expect(rows.strongVeryLimited.label).toBe("STRONG +EV");
  expect(rows.strongModerateSample.label).toBe("STRONG +EV");
  expect(rows.unavailable.label).toBe("UNAVAILABLE");
  expect(rows.strongEstablished.sampleLabel).toBe("ESTABLISHED");
  expect(rows.strongLimited.sampleLabel).toBe("LIMITED");
  expect(rows.strongVeryLimited.sampleLabel).toBe("VERY LIMITED");
  expect(rows.strongModerateSample.sampleLabel).toBe("MODERATE");
  return rows;
}

describe("HrPlusEvTable filters", () => {
  it("defaults to All and keeps EV descending", () => {
    const rows = fixtureRows();
    render(<HrPlusEvTable rows={Object.values(rows)} compact={false} />);
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All Samples" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Strong Established")).toBeInTheDocument();
    expect(screen.getByText("No Price")).toBeInTheDocument();
    const names = screen.getAllByText(/Strong Established|Moderate Established|Fair Established|Overpriced Established|Strong Limited|Strong Very Limited|Strong Moderate Sample|No Price/).map((node) => node.textContent);
    expect(names[0]).toContain("Strong");
  });

  it("filters Strong +EV and hides unavailable rows", () => {
    const rows = fixtureRows();
    render(<HrPlusEvTable rows={Object.values(rows)} compact={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Strong +EV" }));
    expect(screen.getByText("Strong Established")).toBeInTheDocument();
    expect(screen.getByText("Strong Limited")).toBeInTheDocument();
    expect(screen.queryByText("Fair Established")).not.toBeInTheDocument();
    expect(screen.queryByText("Overpriced Established")).not.toBeInTheDocument();
    expect(screen.queryByText("No Price")).not.toBeInTheDocument();
  });

  it("filters Moderate +EV", () => {
    const rows = fixtureRows();
    render(<HrPlusEvTable rows={Object.values(rows)} compact={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Moderate +EV" }));
    expect(screen.getByText("Moderate Established")).toBeInTheDocument();
    expect(screen.queryByText("Strong Established")).not.toBeInTheDocument();
    expect(screen.queryByText("Fair Established")).not.toBeInTheDocument();
  });

  it("filters Fair", () => {
    const rows = fixtureRows();
    render(<HrPlusEvTable rows={Object.values(rows)} compact={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Fair" }));
    expect(screen.getByText("Fair Established")).toBeInTheDocument();
    expect(screen.queryByText("Strong Established")).not.toBeInTheDocument();
    expect(screen.queryByText("Overpriced Established")).not.toBeInTheDocument();
  });

  it("filters Overpriced", () => {
    const rows = fixtureRows();
    render(<HrPlusEvTable rows={Object.values(rows)} compact={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Overpriced" }));
    expect(screen.getByText("Overpriced Established")).toBeInTheDocument();
    expect(screen.queryByText("Strong Established")).not.toBeInTheDocument();
    expect(screen.queryByText("Fair Established")).not.toBeInTheDocument();
  });

  it("filters Established samples", () => {
    const rows = fixtureRows();
    render(<HrPlusEvTable rows={Object.values(rows)} compact={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Established" }));
    expect(screen.getByText("Strong Established")).toBeInTheDocument();
    expect(screen.queryByText("Strong Limited")).not.toBeInTheDocument();
    expect(screen.queryByText("Strong Very Limited")).not.toBeInTheDocument();
    expect(screen.queryByText("Strong Moderate Sample")).not.toBeInTheDocument();
    expect(screen.queryByText("No Price")).not.toBeInTheDocument();
  });

  it("filters 125+ PA to moderate and established samples", () => {
    const rows = fixtureRows();
    render(<HrPlusEvTable rows={Object.values(rows)} compact={false} />);
    fireEvent.click(screen.getByRole("button", { name: "125+ PA" }));
    expect(screen.getByText("Strong Established")).toBeInTheDocument();
    expect(screen.getByText("Strong Moderate Sample")).toBeInTheDocument();
    expect(screen.queryByText("Strong Limited")).not.toBeInTheDocument();
    expect(screen.queryByText("Strong Very Limited")).not.toBeInTheDocument();
  });

  it("filters Limited samples to limited and very limited", () => {
    const rows = fixtureRows();
    render(<HrPlusEvTable rows={Object.values(rows)} compact={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Limited" }));
    expect(screen.getByText("Strong Limited")).toBeInTheDocument();
    expect(screen.getByText("Strong Very Limited")).toBeInTheDocument();
    expect(screen.queryByText("Strong Established")).not.toBeInTheDocument();
    expect(screen.queryByText("Strong Moderate Sample")).not.toBeInTheDocument();
  });

  it("combines Strong +EV with Established", () => {
    const rows = fixtureRows();
    render(<HrPlusEvTable rows={Object.values(rows)} compact={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Strong +EV" }));
    fireEvent.click(screen.getByRole("button", { name: "Established" }));
    expect(screen.getByText("Strong Established")).toBeInTheDocument();
    expect(screen.queryByText("Strong Limited")).not.toBeInTheDocument();
    expect(screen.queryByText("Moderate Established")).not.toBeInTheDocument();
  });

  it("updates the priced-hitter result count", () => {
    const rows = fixtureRows();
    render(<HrPlusEvTable rows={Object.values(rows)} compact={false} />);
    expect(screen.getByText(/7 of 7 priced hitters/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Strong +EV" }));
    expect(screen.getByText(/4 of 7 priced hitters/)).toBeInTheDocument();
  });
});
