/**
 * Focused tests for the shared, presentation-only MlbParkFactorsStrip
 * component -- a single collapsible disclosure shared by HR Props,
 * Strikeout Props, and Batter vs Pitcher. Collapsed by default on every
 * viewport: the always-visible summary shows one compact row per park
 * (matchup, stadium, score); expanding reveals the full weather/roof
 * detail. Renders whatever `parks` array it is given (already built and
 * sorted by the caller) -- it performs no park-factor calculation or
 * ordering of its own.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MlbParkFactorsStrip, type MlbParkFactorDisplayRow } from "./MlbParkFactorsStrip";

function makePark(overrides: Partial<MlbParkFactorDisplayRow> = {}): MlbParkFactorDisplayRow {
  return {
    key: "BAL@CHC",
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
    ...overrides,
  };
}

function expand(container: HTMLElement) {
  const summary = container.querySelector("summary") as HTMLElement;
  fireEvent.click(summary);
  return summary;
}

describe("MlbParkFactorsStrip", () => {
  it("does not import production code from src/pages (no circular dependency with a page)", () => {
    const sourcePath = join(process.cwd(), "src/components/mlb/MlbParkFactorsStrip.tsx");
    const source = readFileSync(sourcePath, "utf8");

    expect(source).not.toMatch(/from\s+["']@\/pages/);
  });

  it("is collapsed by default on every viewport", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[makePark()]} perspective="hitter" subtitle="x" />);

    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Show details")).toBeInTheDocument();
  });

  it("shows the compact grid, matchup logos, stadium, and score while collapsed", () => {
    render(<MlbParkFactorsStrip parks={[makePark()]} perspective="hitter" subtitle="x" />);

    expect(screen.getByText("Wrigley Field")).toBeInTheDocument();
    expect(screen.getByText("1.05")).toBeInTheDocument();
    expect(screen.getByAltText("BAL logo")).toBeInTheDocument();
    expect(screen.getByAltText("CHC logo")).toBeInTheDocument();
  });

  it("does not show roof, temperature, precipitation, wind, or HR/G while collapsed", () => {
    render(
      <MlbParkFactorsStrip
        parks={[makePark({ windSpeed: 15 })]}
        perspective="hitter"
        subtitle="x"
        showHrPerGame
        showPrecipitation
      />,
    );

    expect(screen.queryByText("Open")).toBeNull();
    expect(screen.queryByText("78°")).toBeNull();
    expect(screen.queryByText(/Precip/)).toBeNull();
    expect(screen.queryByText(/💨/)).toBeNull();
    expect(screen.queryByText(/HR\/G/)).toBeNull();
  });

  it("shows the park count and subtitle", () => {
    render(<MlbParkFactorsStrip parks={[makePark(), makePark({ key: "NYY@BOS" })]} perspective="hitter" subtitle="Hitter-friendly order" />);

    expect(screen.getByText("2 parks")).toBeInTheDocument();
    expect(screen.getByText("Hitter-friendly order")).toBeInTheDocument();
  });

  it("expands on click and reveals expand state, roof, and temperature", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[makePark()]} perspective="hitter" subtitle="x" />);

    expand(container);

    expect(container.querySelector("details")).toHaveAttribute("open");
    expect(screen.getByText("Hide details")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("78°")).toBeInTheDocument();
  });

  it("shows HR/game once expanded, by default for hitter perspective", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[makePark()]} perspective="hitter" subtitle="x" />);

    expand(container);

    expect(screen.getByText(/2\.40 HR\/G/)).toBeInTheDocument();
  });

  it("omits HR/game once expanded for pitcher perspective by default", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[makePark()]} perspective="pitcher" subtitle="Pitcher-friendly order" />);

    expand(container);

    expect(screen.queryByText(/HR\/G/)).toBeNull();
  });

  it("respects an explicit showHrPerGame override once expanded", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[makePark()]} perspective="pitcher" subtitle="x" showHrPerGame />);

    expand(container);

    expect(screen.getByText(/HR\/G/)).toBeInTheDocument();
  });

  it("shows precipitation once expanded by default", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[makePark()]} perspective="hitter" subtitle="x" />);

    expand(container);

    expect(screen.getByText(/Precip 10%/)).toBeInTheDocument();
  });

  it("omits precipitation once expanded when showPrecipitation is false (matches Strikeout Props' prior sidebar)", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[makePark()]} perspective="pitcher" subtitle="x" showPrecipitation={false} />);

    expand(container);

    expect(screen.queryByText(/Precip/)).toBeNull();
  });

  it("shows wind once expanded only when wind speed reaches the existing 10 MPH threshold", () => {
    const { container: below } = render(<MlbParkFactorsStrip parks={[makePark({ windSpeed: 5 })]} perspective="hitter" subtitle="x" />);
    expand(below);
    expect(screen.queryByText(/💨/)).toBeNull();

    const { container: above } = render(<MlbParkFactorsStrip parks={[makePark({ windSpeed: 12 })]} perspective="hitter" subtitle="x" />);
    expand(above);
    expect(screen.getByText(/💨/)).toBeInTheDocument();
  });

  it("preserves existing wind-arrow direction mapping", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[makePark({ windSpeed: 12, windDirection: "SW" })]} perspective="hitter" subtitle="x" />);

    expand(container);

    expect(screen.getByText(/↗/)).toBeInTheDocument();
  });

  it("preserves existing roof-label mapping for retractable and closed roofs", () => {
    const { container } = render(
      <MlbParkFactorsStrip
        parks={[makePark({ key: "A", roofType: "Retractable" }), makePark({ key: "B", roofType: "Dome", homeTeam: "MIA" })]}
        perspective="hitter"
        subtitle="x"
      />,
    );

    expand(container);

    expect(screen.getByText("Retractable")).toBeInTheDocument();
    expect(screen.getByText("Roof")).toBeInTheDocument();
  });

  it("preserves existing hitter-perspective park-factor color thresholds", () => {
    const { container } = render(
      <MlbParkFactorsStrip
        parks={[makePark({ key: "hi", parkFactor: 1.15 }), makePark({ key: "lo", parkFactor: 0.9, homeTeam: "MIA" })]}
        perspective="hitter"
        subtitle="x"
      />,
    );

    const high = screen.getByText("1.15");
    const low = screen.getByText("0.90");
    expect(high.className).toMatch(/bg-green-500/);
    expect(low.className).toMatch(/bg-blue-500/);
    void container;
  });

  it("preserves existing pitcher-perspective park-factor color thresholds", () => {
    render(
      <MlbParkFactorsStrip
        parks={[makePark({ key: "hi", parkFactor: 1.15 }), makePark({ key: "lo", parkFactor: 0.9, homeTeam: "MIA" })]}
        perspective="pitcher"
        subtitle="x"
      />,
    );

    const high = screen.getByText("1.15");
    const low = screen.getByText("0.90");
    expect(high.className).toMatch(/bg-red-500/);
    expect(low.className).toMatch(/bg-green-500/);
  });

  it("is keyboard accessible: the summary is focusable and activation toggles the disclosure", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[makePark()]} perspective="hitter" subtitle="x" />);
    const summary = container.querySelector("summary") as HTMLElement;

    summary.focus();
    expect(document.activeElement).toBe(summary);

    // A native <summary> translates Enter/Space activation into a click event;
    // this component's toggle handler treats every click on the summary the same way.
    fireEvent.click(summary);

    expect(container.querySelector("details")).toHaveAttribute("open");
  });

  it("exposes expanded state via the native details `open` attribute", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[makePark()]} perspective="hitter" subtitle="x" />);
    const details = container.querySelector("details") as HTMLDetailsElement;

    expect(details.open).toBe(false);
    expand(container);
    expect(details.open).toBe(true);
  });

  it("renders exactly one semantic Park Factors instance with no duplicated mobile/desktop park trees", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[makePark()]} perspective="hitter" subtitle="x" />);

    expect(container.querySelectorAll("section")).toHaveLength(1);
    expect(container.querySelectorAll("details")).toHaveLength(1);
    // Collapsed: only the compact grid's copy of the stadium name should exist.
    expect(screen.getAllByText("Wrigley Field")).toHaveLength(1);
  });

  it("does not duplicate park data once expanded (compact identity plus one detailed card, not two full copies)", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[makePark()]} perspective="hitter" subtitle="x" />);

    expand(container);

    // Stadium now appears in the compact row and the expanded card -- exactly two, not more.
    expect(screen.getAllByText("Wrigley Field")).toHaveLength(2);
    expect(container.querySelectorAll("article")).toHaveLength(1);
  });

  it("includes the required compact-grid responsive breakpoint classes", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[makePark()]} perspective="hitter" subtitle="x" />);
    const grid = container.querySelector('[data-testid="park-factors-compact-grid"]');

    expect(grid).toHaveClass("grid-cols-1", "sm:grid-cols-2", "md:grid-cols-3", "lg:grid-cols-4", "xl:grid-cols-5", "2xl:grid-cols-6");
  });

  it("includes the required expanded-grid responsive breakpoint classes", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[makePark()]} perspective="hitter" subtitle="x" />);
    expand(container);
    const grid = container.querySelector('[data-testid="park-factors-expanded-grid"]');

    expect(grid).toHaveClass("sm:grid-cols-2", "md:grid-cols-3", "lg:grid-cols-4", "xl:grid-cols-5", "2xl:grid-cols-6");
  });

  it("preserves park ordering exactly as given by the caller", () => {
    const { container } = render(
      <MlbParkFactorsStrip
        parks={[
          makePark({ key: "first", stadium: "First Park" }),
          makePark({ key: "second", stadium: "Second Park", homeTeam: "MIA" }),
          makePark({ key: "third", stadium: "Third Park", homeTeam: "SEA" }),
        ]}
        perspective="hitter"
        subtitle="x"
      />,
    );

    const grid = container.querySelector('[data-testid="park-factors-compact-grid"]') as HTMLElement;
    const names = Array.from(grid.querySelectorAll("span")).map((el) => el.textContent).filter((text): text is string => !!text && text.endsWith("Park"));

    expect(names).toEqual(["First Park", "Second Park", "Third Park"]);
  });

  it("does not render any model recommendation or betting-claim wording", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[makePark()]} perspective="hitter" subtitle="x" />);
    expand(container);
    const text = container.textContent ?? "";

    expect(text).not.toMatch(/recommend/i);
    expect(text).not.toMatch(/\bbet\b/i);
    expect(text).not.toMatch(/\bodds\b/i);
    expect(text).not.toMatch(/\bpick\b/i);
  });

  it("renders zero park cards gracefully when parks is empty", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[]} perspective="hitter" subtitle="x" />);

    expect(screen.getByText("0 parks")).toBeInTheDocument();
    expect(container.querySelectorAll("article")).toHaveLength(0);

    expand(container);
    expect(container.querySelectorAll("article")).toHaveLength(0);
  });
});
