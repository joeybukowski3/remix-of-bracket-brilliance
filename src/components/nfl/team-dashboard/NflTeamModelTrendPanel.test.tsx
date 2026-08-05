import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  NflTeamModelTrendView,
} from "@/components/nfl/team-dashboard/NflTeamModelTrendPanel";
import {
  getNflTrajectoryPresentation,
  type NflTeamModelTrendViewModel,
} from "@/lib/nfl/teamModelTrend";

function trend(overrides: Partial<NflTeamModelTrendViewModel> = {}): NflTeamModelTrendViewModel {
  return {
    teamSlug: "buffalo-bills",
    modelVersion: "nfl-power-v0.3.1",
    currentPublicRating: 72.4,
    currentPublicRank: 4,
    currentRatingSeason: 2026,
    currentSourceSeason: 2025,
    currentRatingStateLabel: "2026 preseason public board",
    comparisonSeason: 2025,
    fullSeasonRating: 70.1,
    finalEightRating: 73.45,
    delta: 3.35,
    trajectoryLabel: "Late Riser",
    trajectoryLambda: 0,
    l8OpponentStrength: 0.42,
    provenance: {
      sourceKind: "model",
      sourceLabel: "nfl-power-v0.3.1 · 2026 preseason public board · 2025 comparison windows",
      generatedAt: "2026-08-03T21:19:45.299Z",
      season: 2026,
      validationStatus: "stage-1",
    },
    ...overrides,
  };
}

describe("NFL team model trend presentation", () => {
  it("renders current, full-season, final-eight, signed delta, and opponent context", () => {
    const { rerender } = render(<NflTeamModelTrendView trend={trend()} />);

    expect(screen.getByText("72.4")).toBeTruthy();
    expect(screen.getByText("70.1")).toBeTruthy();
    expect(screen.getByText("73.5")).toBeTruthy();
    expect(screen.getByText("+3.35")).toBeTruthy();
    expect(screen.getByText("+0.42")).toBeTruthy();
    expect(screen.getByText(/0 = league average · higher = tougher/i)).toBeTruthy();

    rerender(<NflTeamModelTrendView trend={trend({ delta: -3.35 })} />);
    expect(screen.getByText("-3.35")).toBeTruthy();
  });

  it("renders every current trajectory label with text and a distinct inflated-surge state", () => {
    const labels = ["Late Riser", "Late Decline", "Stable", "Schedule-Inflated Surge"];
    const { rerender } = render(<NflTeamModelTrendView trend={trend()} />);

    for (const label of labels) {
      rerender(<NflTeamModelTrendView trend={trend({ trajectoryLabel: label })} />);
      const badge = screen.getByText(label);
      expect(badge.textContent).toBe(label);
      expect(badge.getAttribute("data-trajectory-tone")).toBe(
        getNflTrajectoryPresentation(label).tone,
      );
    }

    expect(getNflTrajectoryPresentation("Schedule-Inflated Surge").tone).toBe("caution");
    expect(getNflTrajectoryPresentation("Late Riser").tone).toBe("positive");
    expect(screen.getByText(/did not clear the riser threshold after schedule adjustment/i)).toBeTruthy();
  });

  it("renders an unknown future trajectory label neutrally without dropping the panel", () => {
    render(<NflTeamModelTrendView trend={trend({ trajectoryLabel: "Future Context Label" })} />);

    expect(screen.getByRole("heading", { name: "Current Model Trend" })).toBeTruthy();
    expect(screen.getByText("Future Context Label").getAttribute("data-trajectory-tone")).toBe("neutral");
    expect(screen.getByText("Artifact-supplied trajectory context.")).toBeTruthy();
  });

  it("preserves zero and renders missing values explicitly without NaN or undefined", () => {
    const { rerender } = render(
      <NflTeamModelTrendView
        trend={trend({
          fullSeasonRating: 0,
          finalEightRating: 0,
          delta: 0,
          l8OpponentStrength: 0,
        })}
      />,
    );
    expect(screen.getAllByText("0.0").length).toBe(2);
    expect(screen.getAllByText("0.00").length).toBe(2);

    rerender(
      <NflTeamModelTrendView
        trend={trend({
          currentPublicRating: null,
          fullSeasonRating: null,
          finalEightRating: null,
          delta: null,
          trajectoryLabel: null,
          l8OpponentStrength: null,
        })}
      />,
    );
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(6);
    expect(document.body.textContent).not.toMatch(/NaN|undefined|-0\.00/);
  });

  it("shows actual provenance and the artifact's non-influence contract without fabricated dates", () => {
    render(<NflTeamModelTrendView trend={trend()} />);

    const provenance = screen.getByLabelText("Data provenance");
    expect(provenance.textContent).toContain("Model");
    expect(provenance.textContent).toContain("nfl-power-v0.3.1");
    expect(provenance.textContent).toContain("Season 2026");
    expect(provenance.textContent).toContain("Validation: stage-1");
    expect(provenance.textContent).toContain("Generated");
    expect(provenance.textContent).not.toMatch(/Retrieved|Source updated|live|current as of/i);
    expect(screen.getByText(/trajectory lambda = 0/i)).toBeTruthy();
    expect(screen.getByText(/does not independently change the public power rating/i)).toBeTruthy();
  });
});
