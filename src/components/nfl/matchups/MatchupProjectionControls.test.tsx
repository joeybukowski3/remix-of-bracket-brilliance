import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MatchupDataControls from "./MatchupDataControls";
import type { MatchupComparisonLens } from "@/lib/nfl/projectedMatchupMetrics";
import { DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS } from "@/lib/nfl/matchupSampleWindow";

function Controls() {
  const [settings, setSettings] = useState(DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS);
  const [lens, setLens] = useState<MatchupComparisonLens>("observed");
  return <><MatchupDataControls settings={settings} onChange={setSettings} lens={lens} onLensChange={setLens} />
    <output>{JSON.stringify({ lens, ...settings })}</output></>;
}

describe("2026 Projection filter", () => {
  it("keeps all new lenses distinct and restores legacy Last 5 settings", () => {
    render(<Controls />);
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("tab", { name: "Last 5" }));
    for (const label of ["2026 Blended", "2026 Projection", "2026 Season", "2025 Season"]) {
      fireEvent.click(screen.getByRole("tab", { name: label }));
      expect(screen.getByRole("tab", { name: label })).toHaveAttribute("aria-selected", "true");
      expect(screen.queryByRole("switch")).toBeNull();
      if (label === "2026 Blended") expect(screen.getByText(/fading the projection prior/)).toBeVisible();
    }
    fireEvent.click(screen.getByRole("tab", { name: "Last 5" }));
    expect(screen.getByRole("status")).toHaveTextContent('"lens":"observed","window":"last5","includePriorSeason":false');
  }, 15000);
  it("selects projections, hides historical controls and preserves all observed settings", () => {
    render(<Controls />);
    expect(screen.getByRole("tab", { name: "Season" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("tab", { name: "Last 5" }));
    fireEvent.click(screen.getByRole("tab", { name: "2026 Projection" }));
    expect(screen.getByRole("tab", { name: "2026 Projection" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByText(/Forward-looking JKB team projections/)).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent('"lens":"projection","window":"last5","includePriorSeason":false');
    fireEvent.click(screen.getByRole("tab", { name: "Season" }));
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("status")).toHaveTextContent('"lens":"observed","window":"season","includePriorSeason":false');
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });
});
