import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { GuideBody } from "@/components/nfl/guide/GuideBody";
import { formatGeneratedAt } from "@/components/nfl/guide/GuideHeader";
import {
  NFL_GUIDE_DIVISION_ORDER,
  NFL_GUIDE_MODEL_STATUS,
  NFL_GUIDE_RECORDS,
} from "@/lib/nfl/guideRecord";

function renderGuide(variant: "live" | "print") {
  return render(
    <MemoryRouter>
      <GuideBody variant={variant} />
    </MemoryRouter>,
  );
}

describe("GuideBody", () => {
  it("renders exactly one H1 naming the season", () => {
    renderGuide("live");
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("2026 NFL Guide");
  });

  it("renders a section for all 32 teams", () => {
    renderGuide("live");
    for (const team of NFL_GUIDE_RECORDS) {
      expect(screen.getByTestId(`guide-team-${team.abbr}`), team.abbr).toBeInTheDocument();
    }
    expect(screen.getAllByTestId(/^guide-team-/)).toHaveLength(32);
  });

  it("renders all eight divisions in a fixed order", () => {
    renderGuide("live");
    const sections = screen.getAllByTestId(/^guide-division-/);
    expect(sections).toHaveLength(8);
    const rendered = sections.map((section) => section.getAttribute("data-testid"));
    const expected = NFL_GUIDE_DIVISION_ORDER.map(
      (division) => `guide-division-division-${division.toLowerCase().replace(/\s+/g, "-")}`,
    );
    expect(rendered).toEqual(expected);
  });

  it("resolves a logo or an explicit fallback for every team", () => {
    renderGuide("live");
    for (const team of NFL_GUIDE_RECORDS) {
      const section = screen.getByTestId(`guide-team-${team.abbr}`);
      const logo = within(section).getByAltText(`${team.name} logo`);
      expect(logo, team.abbr).toBeInTheDocument();
    }
  });

  it("labels model, market, schedule and external data distinctly", () => {
    renderGuide("live");
    expect(screen.getAllByText("JoeKnowsBall Model").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Market").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Schedule").length).toBeGreaterThan(0);
    expect(screen.getAllByText("External Reference").length).toBeGreaterThan(0);
  });

  it("displays the model generated timestamp and season", () => {
    renderGuide("live");
    expect(screen.getByText(formatGeneratedAt(NFL_GUIDE_MODEL_STATUS.generatedAt))).toBeInTheDocument();
    expect(screen.getByText("nfl-power-v0.3.0")).toBeInTheDocument();
    expect(screen.getByText("2025 regular season")).toBeInTheDocument();
  });

  it("surfaces the stage-1 validation status rather than implying a finished model", () => {
    renderGuide("live");
    const notice = screen.getByTestId("guide-validation-notice");
    expect(notice).toHaveTextContent(/stage-1/i);
    expect(notice).toHaveTextContent(/not betting advice/i);
  });

  it("renders identical team and division content in the print variant", () => {
    const live = renderGuide("live");
    const liveTeams = live.container.querySelectorAll("[data-testid^='guide-team-']").length;
    const liveDivisions = live.container.querySelectorAll("[data-testid^='guide-division-']").length;
    live.unmount();

    const print = renderGuide("print");
    expect(print.container.querySelectorAll("[data-testid^='guide-team-']")).toHaveLength(liveTeams);
    expect(print.container.querySelectorAll("[data-testid^='guide-division-']")).toHaveLength(liveDivisions);
    expect(print.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("hides interactive-only controls from the print variant", () => {
    const live = renderGuide("live");
    expect(live.getByRole("button", { name: /save as pdf/i })).toBeInTheDocument();
    expect(live.getByRole("navigation", { name: /conference and division/i })).toBeInTheDocument();
    live.unmount();

    const print = renderGuide("print");
    expect(print.queryByRole("button", { name: /save as pdf/i })).not.toBeInTheDocument();
    expect(print.queryByRole("navigation", { name: /conference and division/i })).not.toBeInTheDocument();
  });

  it("marks interactive-only controls so print CSS can hide them", () => {
    const { container } = renderGuide("live");
    expect(container.querySelectorAll("[data-print-hidden]").length).toBeGreaterThan(0);
  });

  it("preserves source attribution for external material", () => {
    renderGuide("live");
    expect(screen.getAllByText(/Warren Sharp/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/VSiN/i).length).toBeGreaterThan(0);
  });

  it("omits a market block instead of fabricating a win total", () => {
    renderGuide("live");
    const withoutMarket = NFL_GUIDE_RECORDS.filter((team) => team.market === null);
    for (const team of withoutMarket) {
      const section = screen.getByTestId(`guide-team-${team.abbr}`);
      expect(within(section).getByText("Data Unavailable"), team.abbr).toBeInTheDocument();
    }
    const withMarket = NFL_GUIDE_RECORDS.filter((team) => team.market !== null);
    for (const team of withMarket) {
      const section = screen.getByTestId(`guide-team-${team.abbr}`);
      expect(
        within(section).getByText(team.market!.winTotal.toFixed(1)),
        team.abbr,
      ).toBeInTheDocument();
    }
  });
});
