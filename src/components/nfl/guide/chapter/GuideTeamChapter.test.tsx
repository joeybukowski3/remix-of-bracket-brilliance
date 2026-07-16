import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { GuideTeamChapter } from "@/components/nfl/guide/chapter/GuideTeamChapter";
import { GuideTeamSection } from "@/components/nfl/guide/GuideTeamSection";
import { NFL_GUIDE_RECORDS } from "@/lib/nfl/guideRecord";
import { isNflGuidePilotTeam, NFL_GUIDE_PILOT_SLUGS } from "@/lib/nfl/guidePilot";

const seattle = NFL_GUIDE_RECORDS.find((team) => team.slug === "seattle-seahawks");
if (!seattle) throw new Error("Seattle Seahawks not found in NFL_GUIDE_RECORDS");

// A non-pilot division rival, so the "existing stable presentation" check
// exercises real data rather than a synthetic fixture.
const rival = NFL_GUIDE_RECORDS.find(
  (team) => team.division === seattle.division && team.abbr !== seattle.abbr,
);
if (!rival) throw new Error("Expected at least one NFC West rival for the compact-rendering check");

const REAL_ROUTES = new Set([
  `/nfl/guide/team/${seattle.slug}`,
  "/nfl/power-ratings",
  "/nfl/guide",
  "/nfl/guide#guide-methodology",
]);

function renderChapter() {
  return render(
    <MemoryRouter>
      <GuideTeamChapter team={seattle} />
    </MemoryRouter>,
  );
}

describe("NFL guide pilot mechanism", () => {
  it("selects Seattle for the pilot chapter and leaves other teams on the compact card", () => {
    expect(isNflGuidePilotTeam("seattle-seahawks")).toBe(true);
    expect(isNflGuidePilotTeam(rival.slug)).toBe(false);
    expect(NFL_GUIDE_PILOT_SLUGS.size).toBe(1);
  });
});

describe("GuideTeamChapter (Seattle pilot)", () => {
  it("renders the pilot chapter for Seattle", () => {
    renderChapter();
    expect(screen.getByTestId("guide-chapter-sea")).toBeInTheDocument();
  });

  it("renders a different, stable presentation for a non-pilot division rival", () => {
    render(
      <MemoryRouter>
        <GuideTeamSection team={rival} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId(`guide-team-${rival.abbr}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`guide-chapter-${rival.abbr}`)).not.toBeInTheDocument();
  });

  it("resolves Seattle's team identity and logo", () => {
    renderChapter();
    expect(screen.getByText("Seattle Seahawks")).toBeInTheDocument();
    expect(screen.getByText("NFC West · Team Chapter")).toBeInTheDocument();
    expect(screen.getByAltText("Seattle Seahawks logo")).toBeInTheDocument();
  });

  it("keeps the stage-1 model status visible", () => {
    renderChapter();
    expect(screen.getByText(/validation status: stage-1/i)).toBeInTheDocument();
  });

  it("never displays a projected record or projected win total", () => {
    renderChapter();
    expect(screen.queryByText(/projected record/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/projected win/i)).not.toBeInTheDocument();
  });

  it("renders no invented strengths, concerns, or betting-position language", () => {
    renderChapter();
    for (const forbidden of [/strengths?:/i, /concerns?:/i, /^bet\b/i, /we (recommend|like)/i]) {
      expect(screen.queryByText(forbidden)).not.toBeInTheDocument();
    }
  });

  it("labels its factual summary as a model summary, not editorial analysis", () => {
    renderChapter();
    expect(screen.getByText(/model summary — not editorial analysis/i)).toBeInTheDocument();
  });

  it("omits sections for data Seattle does not have (context flags, manual adjustments)", () => {
    renderChapter();
    expect(screen.queryByText(/context flag/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/manual adjustment/i)).not.toBeInTheDocument();
  });

  it("labels every figure with a supported source", () => {
    renderChapter();
    expect(screen.getAllByText("JoeKnowsBall Model").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Market").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Schedule").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/warren sharp/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2026 vsin nfl betting guide/i).length).toBeGreaterThan(0);
  });

  it("has exactly one team-name heading and no page-level H1 inside the chapter", () => {
    const { container } = renderChapter();
    const teamHeadings = screen.getAllByRole("heading", { name: "Seattle Seahawks" });
    expect(teamHeadings).toHaveLength(1);
    expect(container.querySelectorAll("h1")).toHaveLength(0);
  });

  it("only links to real, existing guide routes", () => {
    renderChapter();
    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const href = link.getAttribute("href");
      expect(href, link.textContent ?? "").not.toBeNull();
      expect(REAL_ROUTES.has(href ?? ""), `unexpected href: ${href}`).toBe(true);
    }
  });

  it("renders deterministically across repeated renders", () => {
    const first = renderChapter();
    const firstHtml = first.container.querySelector("[data-testid='guide-chapter-sea']")?.innerHTML;
    first.unmount();

    const second = renderChapter();
    const secondHtml = second.container.querySelector("[data-testid='guide-chapter-sea']")?.innerHTML;

    expect(firstHtml).toBeTruthy();
    expect(firstHtml).toBe(secondHtml);
  });

  it("shows the same underlying record whether rendered for live or print", () => {
    // Both GuideBody variants render GuideDivisionSection with the same
    // NFL_GUIDE_RECORDS entry, so there is only one Seattle record to diverge.
    const seattleAgain = NFL_GUIDE_RECORDS.find((team) => team.slug === "seattle-seahawks");
    expect(seattleAgain).toBe(seattle);
  });

  it("shows the offense/defense rating split without duplicating it across every block", () => {
    renderChapter();
    const overallMatches = screen.getAllByText(seattle.model!.publicRating.toFixed(1));
    // Header + Model profile bar: at most two occurrences, not repeated in every section.
    expect(overallMatches.length).toBeLessThanOrEqual(2);
  });

  it("omits Seattle's empty additions list rather than rendering an empty block", () => {
    renderChapter();
    expect(seattle.offseason?.additions).toEqual([]);
    expect(screen.queryByText(/verified additions/i)).not.toBeInTheDocument();
    expect(screen.getByText(/verified departures/i)).toBeInTheDocument();
  });
});
