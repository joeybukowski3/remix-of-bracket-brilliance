/**
 * Focused tests for the shared, presentation-only MlbParkFactorsStrip
 * component -- a single collapsible section shared by HR Props, Strikeout
 * Props, and Batter vs Pitcher. Collapsed by default on every viewport:
 * a compact row per park (matchup, stadium, score). Expanding SWAPS that
 * compact row for the full weather/roof detail cards -- never both at once,
 * so exactly one copy of each park's data is ever in the DOM. Each park is
 * clickable to drive a shared, caller-owned game-filter selection. Renders
 * whatever `parks` array it is given (already built and sorted by the
 * caller) -- it performs no park-factor calculation or ordering of its own.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

function toggle(container: HTMLElement) {
  const button = within(container).getByText(/show details|hide details/i);
  fireEvent.click(button);
  return button;
}

describe("MlbParkFactorsStrip", () => {
  it("does not import production code from src/pages (no circular dependency with a page)", () => {
    const sourcePath = join(process.cwd(), "src/components/mlb/MlbParkFactorsStrip.tsx");
    const source = readFileSync(sourcePath, "utf8");

    expect(source).not.toMatch(/from\s+["']@\/pages/);
  });

  it("is collapsed by default on every viewport", () => {
    render(<MlbParkFactorsStrip parks={[makePark()]} perspective="hitter" subtitle="x" />);

    expect(screen.getByText("Show details")).toBeInTheDocument();
    expect(screen.getByTestId("park-factors-compact-grid")).toBeInTheDocument();
    expect(screen.queryByTestId("park-factors-expanded-grid")).toBeNull();
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

    toggle(container);

    expect(screen.getByText("Hide details")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("78°")).toBeInTheDocument();
  });

  it("shows HR/game once expanded, by default for hitter perspective", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[makePark()]} perspective="hitter" subtitle="x" />);

    toggle(container);

    expect(screen.getByText(/2\.40 HR\/G/)).toBeInTheDocument();
  });

  it("omits HR/game once expanded for pitcher perspective by default", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[makePark()]} perspective="pitcher" subtitle="Pitcher-friendly order" />);

    toggle(container);

    expect(screen.queryByText(/HR\/G/)).toBeNull();
  });

  it("respects an explicit showHrPerGame override once expanded", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[makePark()]} perspective="pitcher" subtitle="x" showHrPerGame />);

    toggle(container);

    expect(screen.getByText(/HR\/G/)).toBeInTheDocument();
  });

  it("shows precipitation once expanded by default", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[makePark()]} perspective="hitter" subtitle="x" />);

    toggle(container);

    expect(screen.getByText(/Precip 10%/)).toBeInTheDocument();
  });

  it("omits precipitation once expanded when showPrecipitation is false (matches Strikeout Props' prior sidebar)", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[makePark()]} perspective="pitcher" subtitle="x" showPrecipitation={false} />);

    toggle(container);

    expect(screen.queryByText(/Precip/)).toBeNull();
  });

  it("shows wind once expanded only when wind speed reaches the existing 10 MPH threshold", () => {
    const { container: below } = render(<MlbParkFactorsStrip parks={[makePark({ windSpeed: 5 })]} perspective="hitter" subtitle="x" />);
    toggle(below);
    expect(screen.queryByText(/💨/)).toBeNull();

    const { container: above } = render(<MlbParkFactorsStrip parks={[makePark({ windSpeed: 12 })]} perspective="hitter" subtitle="x" />);
    toggle(above);
    expect(screen.getByText(/💨/)).toBeInTheDocument();
  });

  it("preserves existing wind-arrow direction mapping", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[makePark({ windSpeed: 12, windDirection: "SW" })]} perspective="hitter" subtitle="x" />);

    toggle(container);

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

    toggle(container);

    expect(screen.getByText("Retractable")).toBeInTheDocument();
    expect(screen.getByText("Roof")).toBeInTheDocument();
  });

  it("preserves existing hitter-perspective park-factor color thresholds", () => {
    render(
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

  it("is keyboard accessible: the toggle button is focusable and activation toggles the section", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[makePark()]} perspective="hitter" subtitle="x" />);
    const button = screen.getByText("Show details");

    button.focus();
    expect(document.activeElement).toBe(button);

    fireEvent.click(button);

    expect(screen.getByText("Hide details")).toBeInTheDocument();
    void container;
  });

  it("renders exactly one semantic Park Factors instance with no duplicated mobile/desktop park trees", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[makePark()]} perspective="hitter" subtitle="x" />);

    expect(container.querySelectorAll("section")).toHaveLength(1);
    expect(screen.getAllByText("Wrigley Field")).toHaveLength(1);
  });

  it("never renders both the compact grid and the expanded grid at once, collapsed or expanded (no duplicated park cards)", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[makePark()]} perspective="hitter" subtitle="x" />);

    expect(screen.getAllByText("Wrigley Field")).toHaveLength(1);
    expect(container.querySelectorAll("article")).toHaveLength(0);

    toggle(container);

    // Expanded: exactly one detail card, no leftover compact row.
    expect(screen.getAllByText("Wrigley Field")).toHaveLength(1);
    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(screen.queryByTestId("park-factors-compact-grid")).toBeNull();
  });

  it("includes the required compact-grid responsive breakpoint classes", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[makePark()]} perspective="hitter" subtitle="x" />);
    const grid = container.querySelector('[data-testid="park-factors-compact-grid"]');

    expect(grid).toHaveClass("grid-cols-1", "sm:grid-cols-2", "md:grid-cols-3", "lg:grid-cols-4", "xl:grid-cols-5", "2xl:grid-cols-6");
  });

  it("includes the required expanded-grid responsive breakpoint classes", () => {
    const { container } = render(<MlbParkFactorsStrip parks={[makePark()]} perspective="hitter" subtitle="x" />);
    toggle(container);
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
    toggle(container);
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

    toggle(container);
    expect(container.querySelectorAll("article")).toHaveLength(0);
  });

  it("clicking a compact park card calls onSelectGame with that park's key", () => {
    const onSelectGame = vi.fn();
    render(
      <MlbParkFactorsStrip
        parks={[makePark()]}
        perspective="hitter"
        subtitle="x"
        selectedGameKey="all"
        onSelectGame={onSelectGame}
      />,
    );

    fireEvent.click(screen.getByText("Wrigley Field"));

    expect(onSelectGame).toHaveBeenCalledWith("BAL@CHC");
  });

  it("clicking the already-selected park calls onSelectGame with \"all\" (toggle off)", () => {
    const onSelectGame = vi.fn();
    render(
      <MlbParkFactorsStrip
        parks={[makePark()]}
        perspective="hitter"
        subtitle="x"
        selectedGameKey="BAL@CHC"
        onSelectGame={onSelectGame}
      />,
    );

    fireEvent.click(screen.getByText("Wrigley Field"));

    expect(onSelectGame).toHaveBeenCalledWith("all");
  });

  it("clicking an expanded park card also calls onSelectGame with that park's key", () => {
    const onSelectGame = vi.fn();
    const { container } = render(
      <MlbParkFactorsStrip
        parks={[makePark()]}
        perspective="hitter"
        subtitle="x"
        selectedGameKey="all"
        onSelectGame={onSelectGame}
      />,
    );

    toggle(container);
    fireEvent.click(screen.getByText("Wrigley Field"));

    expect(onSelectGame).toHaveBeenCalledWith("BAL@CHC");
  });

  it("highlights the selected park card", () => {
    render(
      <MlbParkFactorsStrip
        parks={[makePark(), makePark({ key: "NYY@BOS", homeTeam: "BOS", awayTeam: "NYY", stadium: "Fenway Park" })]}
        perspective="hitter"
        subtitle="x"
        selectedGameKey="BAL@CHC"
        onSelectGame={vi.fn()}
      />,
    );

    const selected = screen.getByText("Wrigley Field").closest("button");
    const unselected = screen.getByText("Fenway Park").closest("button");

    expect(selected?.className).toMatch(/ring-sky-500/);
    expect(unselected?.className).not.toMatch(/ring-sky-500/);
  });

  it("shows a clear-selection pill with the matchup label when a game is selected", () => {
    render(
      <MlbParkFactorsStrip
        parks={[makePark()]}
        perspective="hitter"
        subtitle="x"
        selectedGameKey="BAL@CHC"
        onSelectGame={vi.fn()}
      />,
    );

    expect(screen.getByText(/BAL @ CHC/)).toBeInTheDocument();
  });

  it("clicking the clear-selection pill calls onSelectGame with \"all\"", () => {
    const onSelectGame = vi.fn();
    render(
      <MlbParkFactorsStrip
        parks={[makePark()]}
        perspective="hitter"
        subtitle="x"
        selectedGameKey="BAL@CHC"
        onSelectGame={onSelectGame}
      />,
    );

    fireEvent.click(screen.getByText(/BAL @ CHC/));

    expect(onSelectGame).toHaveBeenCalledWith("all");
  });

  it("does not throw or require onSelectGame -- clicking a park is a no-op without it", () => {
    render(<MlbParkFactorsStrip parks={[makePark()]} perspective="hitter" subtitle="x" />);

    expect(() => fireEvent.click(screen.getByText("Wrigley Field"))).not.toThrow();
  });
});
