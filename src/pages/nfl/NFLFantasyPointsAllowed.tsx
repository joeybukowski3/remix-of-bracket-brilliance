import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import { NflFilterChips } from "@/components/nfl/ui/NflFilterBar";
import { usePageSeo } from "@/hooks/usePageSeo";
import { DEFAULT_ALLOWED_BY_POSITION_DISPLAY_MODE, type AllowedByPositionDisplayMode } from "@/components/nfl/allowed-by-position/types";
import type { FantasyAllowedSampleKey } from "@/lib/nfl/fantasyAllowed/types";
import FantasyPointsAllowedView from "./FantasyPointsAllowedView";
import FantasyPositionMatchupView from "./FantasyPositionMatchupView";

/**
 * Top-level view tabs for /nfl/fantasy-points-allowed. "Matchup Comparison"
 * used to be its own nav destination (/nfl/fantasy-position-matchups); it now
 * lives here as a second tab so the two related tables share one page shell.
 */
export type FantasyPointsAllowedViewKey = "points" | "matchups";

const VIEW_OPTIONS: readonly FantasyPointsAllowedViewKey[] = ["points", "matchups"];
const VIEW_LABEL: Record<FantasyPointsAllowedViewKey, string> = { points: "Points Allowed", matchups: "Matchup Comparison" };

function parseView(raw: string | null): FantasyPointsAllowedViewKey {
  return raw === "matchups" ? "matchups" : "points";
}

export default function NFLFantasyPointsAllowed() {
  usePageSeo({
    title: "Fantasy Points Allowed by Position | Joe Knows Ball",
    description: "Defense ranks for fantasy points allowed by position, plus a FOR vs. ALLOWED matchup comparison -- QB, RB, WR, TE.",
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
        description="Defense ranks for fantasy points allowed by position, or a team's own production matched against the opponent's allowed ranks. (1st is least, 32nd is most PPG)"
      >
        <NflFilterChips label="View" options={VIEW_OPTIONS} value={view} onChange={handleViewChange} formatOption={(option) => VIEW_LABEL[option]} />
      </NflPageHeader>

      <section className="mt-3">
        {view === "points" ? (
          <FantasyPointsAllowedView sample={sample} onSampleChange={setSample} displayMode={displayMode} onDisplayModeChange={setDisplayMode} />
        ) : (
          <FantasyPositionMatchupView sample={sample} onSampleChange={setSample} displayMode={displayMode} onDisplayModeChange={setDisplayMode} />
        )}
      </section>
    </div>
  );
}
