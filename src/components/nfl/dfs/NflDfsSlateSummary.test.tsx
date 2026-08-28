import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NflDfsSlateSummary from "@/components/nfl/dfs/NflDfsSlateSummary";
import { buildDfsSlateAnalysis, enrichDfsSlateAnalysis } from "@/lib/nfl/dfs/slateAnalyzer";
import { assessDfsSlateCompatibility } from "@/lib/nfl/dfs/artifactCompatibility";
import { assessDfsResearch } from "@/lib/nfl/dfs/research";
import { buildDkRow, buildGame } from "@/lib/nfl/dfs/__fixtures__/dkRowFactory";
import { buildProjectionArtifact, buildProjectionRow } from "@/lib/nfl/dfs/__fixtures__/projectionRowFactory";

function buildAnalysis() {
  const dkRows = [buildDkRow({ dkId: "q1", name: "QB One", position: "QB", rosterPosition: "QB", salary: 8000, teamAbbrev: "NO" })];
  const projectionRows = [buildProjectionRow({ playerId: "gsis:q1", playerName: "QB One", position: "QB", team: "no", projectedFantasyPoints: 20, positionRank: 1 })];
  const teams = [] as never[];
  const analysis = buildDfsSlateAnalysis({ dkRows, projectionRows, teams });
  const projectionArtifact = buildProjectionArtifact({ season: 2026, week: 1, inputAsOf: "2026-09-10T00:00:00.000Z" });
  const research = assessDfsResearch(projectionRows, null, 2026, 1);
  const compatibility = assessDfsSlateCompatibility({
    dkRows, selectedSeason: 2026, selectedWeek: 1, projectionArtifact,
    canonicalGames: [buildGame({ gameId: "g1", season: 2026, week: 1, awayAbbr: "no", homeAbbr: "det" })],
    offensiveIdentityResolutions: [],
    now: new Date("2026-09-10T01:00:00.000Z"),
  });
  return enrichDfsSlateAnalysis(analysis, research, compatibility);
}

describe("NflDfsSlateSummary", () => {
  it("shows game/team/row counts and coverage percentages", () => {
    render(<NflDfsSlateSummary analysis={buildAnalysis()} season={2026} week={1} />);
    expect(screen.getByText(/1 Games/)).toBeInTheDocument();
    expect(screen.getByText(/1 Teams/)).toBeInTheDocument();
    expect(screen.getByText(/1 Entries/)).toBeInTheDocument();
    expect(screen.getByText(/100% Projection Match/)).toBeInTheDocument();
  });

  it("shows a READY_WITH_WARNINGS state when research is unavailable", () => {
    render(<NflDfsSlateSummary analysis={buildAnalysis()} season={2026} week={1} />);
    expect(screen.getByText("Ready with warnings")).toBeInTheDocument();
  });

  it("shows generatedAt/inputAsOf timestamps", () => {
    render(<NflDfsSlateSummary analysis={buildAnalysis()} season={2026} week={1} />);
    expect(screen.getByText(/input as of/i)).toBeInTheDocument();
  });

  it("shows the roster structure and scoring provenance under Contest Rules without a salary cap", () => {
    render(<NflDfsSlateSummary analysis={buildAnalysis()} season={2026} week={1} />);
    fireEvent.click(screen.getByText("Contest Rules -- NFL Classic"));
    expect(screen.getByText(/2 RB/)).toBeInTheDocument();
    expect(screen.getByText(/Full PPR/)).toBeInTheDocument();
    expect(screen.getByText(/salary cap is not shown/i)).toBeInTheDocument();
  });
});
