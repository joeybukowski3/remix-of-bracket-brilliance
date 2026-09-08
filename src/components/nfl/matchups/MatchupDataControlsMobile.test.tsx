import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MatchupDataControls from "@/components/nfl/matchups/MatchupDataControls";
import { DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS } from "@/lib/nfl/matchupSampleWindow";

describe("MatchupDataControls mobile compaction", () => {
  it("keeps Data Window and Historical Blend visible on every breakpoint, but marks Sample and the active-sample-rule sentence desktop-only", () => {
    render(
      <MatchupDataControls
        settings={DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS}
        onChange={() => {}}
        sampleLabel="8 games · 2025"
      />
    );

    expect(screen.getByText("Data Window")).toBeInTheDocument();
    expect(screen.getByText("Historical Blend")).toBeInTheDocument();

    // Sample stays queryable (its behaviour/value is unchanged) but is hidden
    // below the `sm` breakpoint and only shown at `sm` and up.
    const sampleLabel = screen.getByTestId("matchup-sample-label");
    const sampleRow = sampleLabel.closest("div");
    expect(sampleRow?.className).toContain("hidden");
    expect(sampleRow?.className).toContain("sm:flex");

    const activeSampleRule = screen.getByText(/Active sample rule:/).closest("p");
    expect(activeSampleRule?.className).toContain("hidden");
    expect(activeSampleRule?.className).toContain("sm:block");
  });

  it("keeps the Historical Blend control to a single line on mobile with a short label", () => {
    render(
      <MatchupDataControls
        settings={DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS}
        onChange={() => {}}
      />
    );
    const mobileLabel = screen.getByText("2025 Last 8");
    expect(mobileLabel.className).toContain("sm:hidden");
    const desktopLabel = screen.getByText("Include 2025 Last 8");
    expect(desktopLabel.className).toContain("hidden");
  });
});
