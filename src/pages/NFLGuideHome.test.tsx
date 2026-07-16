import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import NFLGuideHome from "@/pages/NFLGuideHome";
import { NFL_GUIDE_MODEL_STATUS } from "@/lib/nfl/guideRecord";

function renderHome() {
  return render(
    <MemoryRouter>
      <NFLGuideHome />
    </MemoryRouter>,
  );
}

describe("NFLGuideHome (/nfl)", () => {
  it("renders exactly one H1 naming the season", () => {
    renderHome();
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("2026 NFL Guide");
  });

  it("links the three primary entry points to their routes", () => {
    renderHome();
    expect(screen.getByRole("link", { name: /open full interactive guide/i })).toHaveAttribute(
      "href",
      "/nfl/guide",
    );
    expect(screen.getByRole("link", { name: /open print \/ pdf edition/i })).toHaveAttribute(
      "href",
      "/nfl-guide/",
    );
    const powerRatingsLinks = screen.getAllByRole("link", { name: /power ratings/i });
    expect(powerRatingsLinks.some((link) => link.getAttribute("href") === "/nfl/power-ratings")).toBe(true);
  });

  it("surfaces the model's stage-1 validation status", () => {
    renderHome();
    const notice = screen.getByTestId("guide-home-validation-notice");
    expect(notice).toHaveTextContent(/stage-1/i);
    expect(notice).toHaveTextContent(/not betting advice/i);
  });

  it("displays the model version and generated timestamp from guide data", () => {
    renderHome();
    expect(screen.getByText("nfl-power-v0.3.0")).toBeInTheDocument();
    expect(NFL_GUIDE_MODEL_STATUS.generatedAt).not.toBeNull();
  });

  it("labels model, market, schedule and external data distinctly", () => {
    renderHome();
    expect(screen.getAllByText("JoeKnowsBall Model").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Market").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Schedule").length).toBeGreaterThan(0);
    expect(screen.getAllByText("External Reference").length).toBeGreaterThan(0);
  });

  it("links every conference and division into the full guide's anchors", () => {
    renderHome();
    const eastLinks = screen.getAllByRole("link", { name: "East" }).map((link) => link.getAttribute("href"));
    expect(eastLinks).toContain("/nfl/guide#division-afc-east");
    expect(eastLinks).toContain("/nfl/guide#division-nfc-east");
    for (const conference of ["afc", "nfc"]) {
      for (const division of ["east", "north", "south", "west"]) {
        expect(
          document.querySelector(`a[href="/nfl/guide#division-${conference}-${division}"]`),
          `${conference}-${division}`,
        ).toBeTruthy();
      }
    }
  });

  it("links to the guide's methodology section rather than duplicating it", () => {
    renderHome();
    const link = screen.getByRole("link", { name: /read the full methodology/i });
    expect(link).toHaveAttribute("href", "/nfl/guide#guide-methodology");
  });
});
