/**
 * Focused tests for the shared, presentation-only MlbParkFactorsStrip
 * component -- the compact, full-width, wrapping replacement for the fixed
 * 260-300px left sidebar previously duplicated across HR Props, Strikeout
 * Props, and Batter vs Pitcher. Renders whatever `parks` array it is given
 * (already built by buildParkSidebarRows and already sorted by the caller)
 * -- it performs no park-factor calculation or ordering of its own.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MlbParkFactorsStrip } from "./MlbParkFactorsStrip";
import type { ParkSidebarRow } from "@/pages/MlbHrProps";

function makePark(overrides: Partial<ParkSidebarRow> = {}): ParkSidebarRow {
  return {
    key: "BAL@CHC",
    matchup: "BAL @ CHC",
    awayTeam: "BAL",
    homeTeam: "CHC",
    stadium: "Wrigley Field",
    parkFactor: 1.05,
    hrPerGame: 2.4,
    roofType: "Open",
    temperature: 78,
    precipitation: 10,
    windSpeed: 12,
    windDirection: "SW",
    conditions: "Clear",
    ...overrides,
  };
}

describe("MlbParkFactorsStrip", () => {
  it("renders a park card with stadium, park factor, roof, and temperature", () => {
    render(<MlbParkFactorsStrip parks={[makePark()]} perspective="hitter" subtitle="Today's park and weather context" />);

    expect(screen.getAllByText("Wrigley Field").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1.05").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Open").length).toBeGreaterThan(0);
    expect(screen.getAllByText("78°").length).toBeGreaterThan(0);
  });

  it("shows the park count and subtitle", () => {
    render(<MlbParkFactorsStrip parks={[makePark(), makePark({ key: "NYY@BOS" })]} perspective="hitter" subtitle="Hitter-friendly order" />);

    expect(screen.getAllByText("2 parks").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Hitter-friendly order").length).toBeGreaterThan(0);
  });

  it("shows HR/game by default for hitter perspective", () => {
    render(<MlbParkFactorsStrip parks={[makePark()]} perspective="hitter" subtitle="x" />);

    expect(screen.getAllByText(/2\.40 HR\/G/).length).toBeGreaterThan(0);
  });

  it("omits HR/game for pitcher perspective by default", () => {
    render(<MlbParkFactorsStrip parks={[makePark()]} perspective="pitcher" subtitle="Pitcher-friendly order" />);

    expect(screen.queryByText(/HR\/G/)).toBeNull();
  });

  it("respects an explicit showHrPerGame override", () => {
    render(<MlbParkFactorsStrip parks={[makePark()]} perspective="pitcher" subtitle="x" showHrPerGame />);

    expect(screen.getAllByText(/HR\/G/).length).toBeGreaterThan(0);
  });

  it("shows precipitation by default", () => {
    render(<MlbParkFactorsStrip parks={[makePark()]} perspective="hitter" subtitle="x" />);

    expect(screen.getAllByText(/Precip 10%/).length).toBeGreaterThan(0);
  });

  it("omits precipitation when showPrecipitation is false (matches Strikeout Props' prior sidebar)", () => {
    render(<MlbParkFactorsStrip parks={[makePark()]} perspective="pitcher" subtitle="x" showPrecipitation={false} />);

    expect(screen.queryByText(/Precip/)).toBeNull();
  });

  it("shows wind only when wind speed reaches the existing 10 MPH threshold", () => {
    const { rerender } = render(<MlbParkFactorsStrip parks={[makePark({ windSpeed: 5 })]} perspective="hitter" subtitle="x" />);
    expect(screen.queryByText(/💨/)).toBeNull();

    rerender(<MlbParkFactorsStrip parks={[makePark({ windSpeed: 12 })]} perspective="hitter" subtitle="x" />);
    expect(screen.getAllByText(/💨/).length).toBeGreaterThan(0);
  });

  it("renders both a mobile collapsible disclosure and an always-expanded tablet/desktop block", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[makePark()]} perspective="hitter" subtitle="x" />);

    expect(container.querySelector("details.sm\\:hidden")).toBeInTheDocument();
    expect(container.querySelector(".hidden.sm\\:block")).toBeInTheDocument();
  });

  it("does not render any model recommendation or betting-claim wording", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[makePark()]} perspective="hitter" subtitle="x" />);
    const text = container.textContent ?? "";

    expect(text).not.toMatch(/recommend/i);
    expect(text).not.toMatch(/\bbet\b/i);
    expect(text).not.toMatch(/\bodds\b/i);
    expect(text).not.toMatch(/\bpick\b/i);
  });

  it("renders zero park cards gracefully when parks is empty", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[]} perspective="hitter" subtitle="x" />);

    expect(screen.getAllByText("0 parks").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("article")).toHaveLength(0);
  });
});
