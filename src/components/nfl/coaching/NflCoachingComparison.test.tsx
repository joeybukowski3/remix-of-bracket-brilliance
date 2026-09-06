/**
 * Coaching Rating v1 — reusable comparison component.
 *
 * Every assertion here is about ANALYSIS CONTEXT presentation: which coach,
 * which rating, which historical record, and which side the differential
 * favours. Nothing asserts (or should ever assert) a pick, an edge or a
 * total direction.
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import NflCoachingComparison from "./NflCoachingComparison";
import {
  coachingContextFixture,
  coachingUnavailableFixture,
} from "@/lib/nfl/performance/__fixtures__/coaching";
import { COACHING_ATS_NOTE } from "@/lib/nfl/performance/coachingPresentation";

function renderComparison(coaching = coachingContextFixture()) {
  return render(<NflCoachingComparison coaching={coaching} homeTeam="lar" awayTeam="sf" />);
}

describe("NflCoachingComparison", () => {
  it("headlines the home team when the differential favours home", () => {
    renderComparison();
    expect(screen.getByTestId("nfl-coaching-advantage")).toHaveTextContent("LAR +8");
    expect(within(screen.getByTestId("nfl-coaching-home")).getByText("Sean McVay")).toBeInTheDocument();
    expect(within(screen.getByTestId("nfl-coaching-home")).getByText("59")).toBeInTheDocument();
    expect(within(screen.getByTestId("nfl-coaching-away")).getByText("Kyle Shanahan")).toBeInTheDocument();
  });

  it("headlines the away team when the differential favours away", () => {
    renderComparison(
      coachingContextFixture({
        home_coaching_rating: 48,
        away_coaching_rating: 61,
        coaching_differential: -13,
        coaching_advantage_team: "away",
      }),
    );
    expect(screen.getByTestId("nfl-coaching-advantage")).toHaveTextContent("SF +13");
  });

  it("renders EVEN inside the frozen even threshold rather than a team", () => {
    renderComparison(
      coachingContextFixture({
        home_coaching_rating: 53,
        away_coaching_rating: 51,
        coaching_differential: 2,
        coaching_advantage_team: "even",
      }),
    );
    expect(screen.getByTestId("nfl-coaching-advantage")).toHaveTextContent("EVEN");
    expect(screen.getByTestId("nfl-coaching-advantage")).not.toHaveTextContent("LAR");
  });

  it("shows the first-year badge and no fabricated NFL head-coaching record", () => {
    renderComparison(
      coachingContextFixture({
        away_coach: "Rookie Coach",
        away_coaching_rating: 50,
        away_coach_context: {
          career_wl: "0-0",
          tenure_wl: "0-0",
          season_wl: "0-0",
          career_ats: "0-0",
          tenure_ats: "0-0",
          season_ats: "0-0",
          recent_ats: "0-0",
          small_sample: true,
          tenure_year: 1,
          first_year: true,
          interim: false,
        },
      }),
    );
    const away = within(screen.getByTestId("nfl-coaching-away"));
    expect(away.getByText("First-year HC")).toBeInTheDocument();
    expect(away.getByText("No NFL HC record")).toBeInTheDocument();
    expect(away.getByText("50")).toBeInTheDocument();
  });

  it("badges a small-sample coach who is not first-year", () => {
    renderComparison(
      coachingContextFixture({
        away_coach_context: { ...coachingContextFixture().away_coach_context!, small_sample: true },
      }),
    );
    expect(within(screen.getByTestId("nfl-coaching-away")).getByText("Small sample")).toBeInTheDocument();
  });

  it("shows 'Unrated' for a missing side instead of a rating of 0", () => {
    renderComparison(
      coachingContextFixture({
        away_coach: null,
        away_coaching_rating: null,
        away_coach_context: null,
        coaching_differential: null,
        coaching_advantage_team: null,
        coaching_context_status: "COACH_UNRATED",
      }),
    );
    const away = within(screen.getByTestId("nfl-coaching-away"));
    expect(away.getByText("Unrated")).toBeInTheDocument();
    expect(away.queryByText("0")).not.toBeInTheDocument();
    // The rated side is still fully rendered.
    expect(within(screen.getByTestId("nfl-coaching-home")).getByText("Sean McVay")).toBeInTheDocument();
  });

  it("renders the unavailable state without crashing when the source is missing", () => {
    renderComparison(coachingUnavailableFixture());
    expect(screen.getByText("Coaching context unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("nfl-coaching-home")).not.toBeInTheDocument();
  });

  it("always states that ATS is unweighted context", () => {
    renderComparison();
    expect(screen.getByTestId("nfl-coaching-ats-note")).toHaveTextContent(COACHING_ATS_NOTE);
    expect(screen.getByTestId("nfl-coaching-ats-note")).toHaveTextContent(
      "is not weighted in the JKB Coaching Rating",
    );
  });

  it("labels the section for assistive technology", () => {
    renderComparison();
    expect(screen.getByRole("region", { name: "Coaching advantage" })).toBeInTheDocument();
  });
});
