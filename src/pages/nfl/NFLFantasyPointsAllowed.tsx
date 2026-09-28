import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import { NflFilterChips } from "@/components/nfl/ui/NflFilterBar";
import { usePageSeo } from "@/hooks/usePageSeo";
import { DEFAULT_ALLOWED_BY_POSITION_DISPLAY_MODE, type AllowedByPositionDisplayMode } from "@/components/nfl/allowed-by-position/types";
import type { FantasyAllowedSampleKey } from "@/lib/nfl/fantasyAllowed/types";
import FantasyPointsAllowedView from "./FantasyPointsAllowedView";
import FantasyPositionMatchupView from "./FantasyPositionMatchupView";
import YardsVsAverageView from "./YardsVsAverageView";

/**
 * Top-level view tabs for /nfl/fantasy-points-allowed. "Matchup Comparison"
 * used to be its own nav destination (/nfl/fantasy-position-matchups); it now
 * lives here as a second tab so the two related tables share one page shell.
 * "Yards vs Avg" (?view=yards) is the opponent-adjusted yardage view.
 */
export type FantasyPointsAllowedViewKey = "points" | "matchups" | "yards";

const VIEW_OPTIONS: readonly FantasyPointsAllowedViewKey[] = ["points", "matchups", "yards"];
const VIEW_LABEL: Record<FantasyPointsAllowedViewKey, string> = { points: "Points Allowed", matchups: "Matchup Comparison", yards: "Yards vs Avg" };

function parseView(raw: string | null): FantasyPointsAllowedViewKey {
  return raw === "matchups" || raw === "yards" ? raw : "points";
}

export default function NFLFantasyPointsAllowed() {
  usePageSeo({
    title: "Fantasy Points Allowed by Position | Joe Knows Ball",
    description: "Defense ranks for fantasy points allowed by position, a FOR vs. ALLOWED matchup comparison, and opponent yards vs. their own average -- QB, RB, WR, TE.",
    path: "/nfl/fantasy-points-allowed",
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const view = parseView(searchParams.get("view"));

  // Shared across both tabs: switching sample/display-mode carries over when you switch views.
  const [sample, setSample] = useState<FantasyAllowedSampleKey>("2026");
  const [displayMode, setDisplayMode] = useState<AllowedByPositionDisplayMode>(DEFAULT_ALLOWED_BY_POSITION_DISPLAY_MODE);

  function handleViewChange(next: FantasyPointsAllowedViewKey) {
    const params = new URLSearchParams(searchParams);
    if (next === "points") params.delete("view");
    else params.set("view", next);
    setSearchParams(params, { replace: true });
  }

  return (
    <div className="w-full">
      <NflPageHeader
        eyebrow="Markets & Predictions"
        title="Fantasy Points Allowed by Position"
        description="Defense ranks for fantasy points allowed by position, a team's own production matched against the opponent's allowed ranks, or opponent yards vs. their own average. (1st is least allowed)"
      >
        <NflFilterChips label="View" options={VIEW_OPTIONS} value={view} onChange={handleViewChange} formatOption={(option) => VIEW_LABEL[option]} />
      </NflPageHeader>

      <section className="mt-3">
        {view === "points" ? (
          <FantasyPointsAllowedView sample={sample} onSampleChange={setSample} displayMode={displayMode} onDisplayModeChange={setDisplayMode} />
        ) : view === "yards" ? (
          <YardsVsAverageView sample={sample} onSampleChange={setSample} />
        ) : (
          <FantasyPositionMatchupView sample={sample} onSampleChange={setSample} displayMode={displayMode} onDisplayModeChange={setDisplayMode} />
        )}
      </section>
    </div>
  );
}
