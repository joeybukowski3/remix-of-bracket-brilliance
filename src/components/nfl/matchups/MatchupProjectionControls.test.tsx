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
