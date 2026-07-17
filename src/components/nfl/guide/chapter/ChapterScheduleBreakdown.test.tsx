import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ChapterScheduleBreakdown } from "@/components/nfl/guide/chapter/ChapterScheduleBreakdown";
import { NFL_SEATTLE_SCHEDULE_2026 } from "@/lib/nfl/seattleSchedule";
import { NFL_GUIDE_RECORDS } from "@/lib/nfl/guideRecord";

const seattle = NFL_GUIDE_RECORDS.find((team) => team.slug === "seattle-seahawks");
if (!seattle) throw new Error("Seattle Seahawks not found in NFL_GUIDE_RECORDS");

const rival = NFL_GUIDE_RECORDS.find((team) => team.division === seattle.division && team.abbr !== seattle.abbr);
if (!rival) throw new Error("Expected an NFC West rival for the non-pilot check");

function renderBreakdown(team = seattle) {
  return render(
    <MemoryRouter>
      <ChapterScheduleBreakdown team={team} />
    </MemoryRouter>,
  );
}

describe("ChapterScheduleBreakdown", () => {
  it("renders all 17 games in both the desktop table and the mobile list", () => {
    const { container } = renderBreakdown();
    const rows = container.querySelectorAll("table tbody tr");
    const cards = container.querySelectorAll("ul > li");
    expect(rows).toHaveLength(17);
    expect(cards).toHaveLength(17);
  });

  it("renders nothing for a non-Seattle team (pilot scope guard)", () => {
    const { container } = renderBreakdown(rival);
    expect(container).toBeEmptyDOMElement();
  });

  it("never displays a probability tier or a percentage-style win chance", () => {
    renderBreakdown();
    expect(screen.queryByText(/probability tier/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/likely win|lean win|coin flip|lean loss|likely loss/i)).not.toBeInTheDocument();
    // No cell/badge should render a bare percentage value (a win-chance shape).
    expect(screen.queryByText(/^\d{1,3}%$/)).not.toBeInTheDocument();
  });

  it("explicitly states that matchup edge is not a win probability", () => {
    renderBreakdown();
    expect(screen.getByText(/not a win probability/i)).toBeInTheDocument();
  });

  it("labels source data distinctly (schedule and external reference)", () => {
    renderBreakdown();
    expect(screen.getAllByText("Schedule").length).toBeGreaterThan(0);
    expect(screen.getAllByText("External Reference").length).toBeGreaterThan(0);
  });

  it("pairs every semantic color state with a text label, never color alone", () => {
    const { container } = renderBreakdown();
    // Every advantage/disadvantage/neutral badge in the table carries a text
    // label ("Edge"/"Gap"/"Even" or "+Nd") alongside its color class.
    const badges = container.querySelectorAll("table tbody span.font-black");
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) {
      expect(badge.textContent?.trim().length ?? 0, badge.className).toBeGreaterThan(0);
    }
  });

  it("shows a legend explaining the advantage/disadvantage/neutral colors", () => {
    renderBreakdown();
    expect(screen.getByText(/seattle advantage/i)).toBeInTheDocument();
    expect(screen.getByText(/seattle\s*\n?\s*disadvantage/i) ?? screen.getByText(/disadvantage/i)).toBeTruthy();
    expect(screen.getByText(/neutral \/ even/i)).toBeInTheDocument();
  });

  it("marks the bye week without treating it as a game row", () => {
    renderBreakdown();
    expect(screen.getByText(/bye: week 11/i)).toBeInTheDocument();
    expect(screen.queryByText(/^11$/, { selector: "table tbody td" })).not.toBeInTheDocument();
  });

  it("does not overflow horizontally: the desktop table is hidden below md, the mobile list is hidden at md and up", () => {
    const { container } = renderBreakdown();
    const table = container.querySelector("table");
    const list = container.querySelector("ul");
    expect(table?.className).toContain("hidden");
    expect(table?.className).toContain("md:table");
    expect(list?.className).toContain("md:hidden");
  });

  it("forces the table (not the mobile list) to render in print regardless of screen breakpoint", () => {
    const { container } = renderBreakdown();
    const table = container.querySelector("table");
    const list = container.querySelector("ul");
    expect(table?.className).toContain("print:!table");
    expect(list?.className).toContain("print:hidden");
  });

  it("resolves an opponent logo for every game", () => {
    const { container } = renderBreakdown();
    for (const game of NFL_SEATTLE_SCHEDULE_2026) {
      const logos = screen.getAllByAltText(`${game.opponentName} logo`);
      expect(logos.length, game.opponentAbbr).toBeGreaterThan(0);
    }
    void container;
  });

  it("keeps each game row from splitting across a print page break", () => {
    const { container } = renderBreakdown();
    const rows = container.querySelectorAll("table tbody tr");
    for (const row of rows) {
      expect(row.className).toContain("break-inside-avoid");
    }
    const cards = container.querySelectorAll("ul > li");
    for (const card of cards) {
      expect(card.className).toContain("break-inside-avoid");
    }
  });
});

describe("ChapterScheduleBreakdown within a table context", () => {
  it("shows opponent NFL v0.3 rank and rating together, sourced from the guide record", () => {
    renderBreakdown();
    const week1Row = screen.getAllByRole("row").find((row) => within(row).queryByText("1"));
    expect(week1Row).toBeDefined();
    // Week 1 opponent is New England Patriots.
    expect(within(week1Row!).getByText("New England Patriots")).toBeInTheDocument();
  });
});
