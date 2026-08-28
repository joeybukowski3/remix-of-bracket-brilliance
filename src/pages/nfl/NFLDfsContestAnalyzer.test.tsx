import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DK_NFL_CLASSIC_HEADERS } from "@/lib/nfl/dfs/contracts";
import { buildProjectionArtifact, buildProjectionRow } from "@/lib/nfl/dfs/__fixtures__/projectionRowFactory";
import { buildResearchArtifact } from "@/lib/nfl/dfs/__fixtures__/researchFactory";

const mockProjection = vi.hoisted(() => vi.fn());
const mockResearch = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useWeeklyFantasyProjectionArtifact", () => ({ useWeeklyFantasyProjectionArtifact: mockProjection }));
vi.mock("@/hooks/useWeeklyFantasyResearchArtifact", () => ({ useWeeklyFantasyResearchArtifact: mockResearch }));
vi.mock("@/hooks/useNflSeasonData", () => ({
  useNflSeasonData: () => ({
    loading: false,
    error: null,
    data: {
      teams: [],
      games: [
        { gameId: "2026_01_NO_DET", season: 2026, week: 1, seasonType: "REG", dateUtc: "2026-09-13T17:00:00.000Z", homeTeam: "Lions", awayTeam: "Saints", homeAbbr: "det", awayAbbr: "no", status: "scheduled", stadium: null, neutralSite: false },
      ],
      results: [],
      gamesMeta: null,
      resultsMeta: null,
    },
  }),
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));

import NFLDfsContestAnalyzer from "@/pages/nfl/NFLDfsContestAnalyzer";

const HEADER_LINE = DK_NFL_CLASSIC_HEADERS.join(",");
const MATCHING_CSV = [
  HEADER_LINE,
  "QB,Derek Sample (39001101),Derek Sample,39001101,QB,7200,NO@DET 09/13/2026 01:00PM ET,NO,19.86,",
].join("\n");

function makeFile(content: string) {
  return new File([content], "slate.csv", { type: "text/csv" });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/nfl/dfs"]}>
      <Routes>
        <Route path="/nfl/dfs" element={<NFLDfsContestAnalyzer />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NFLDfsContestAnalyzer page", () => {
  it("renders the empty upload state with supported-format copy and the selected week", () => {
    mockProjection.mockReturnValue({ status: "loading", season: 2026, week: 1 });
    mockResearch.mockReturnValue({ status: "loading", season: 2026, week: 1 });

    renderPage();

    expect(screen.getByText("NFL DFS Contest Analyzer")).toBeInTheDocument();
    expect(screen.getByText(/JKB Week 1/)).toBeInTheDocument();
    expect(screen.getByText(/QB \/ RB \/ WR \/ TE \/ FLEX \/ DST/)).toBeInTheDocument();
    expect(screen.getByLabelText(/drag and drop or press enter to browse/i)).toBeInTheDocument();
  });

  it("shows projection provenance once a valid slate is analyzed", async () => {
    const artifact = buildProjectionArtifact({
      season: 2026,
      week: 1,
      inputAsOf: "2026-09-10T00:00:00.000Z",
      rows: { QB: [buildProjectionRow({ playerId: "gsis:1", playerName: "Derek Sample", position: "QB", team: "no", projectedFantasyPoints: 22.5, positionRank: 1 })], RB: [], WR: [], TE: [] },
    });
    mockProjection.mockReturnValue({ status: "ready", artifact, rows: artifact.rows, freshness: { inputAsOf: artifact.inputAsOf, generatedAt: artifact.generatedAt } });
    mockResearch.mockReturnValue({ status: "ready", artifact: buildResearchArtifact({ season: 2026, week: 1, rows: [] }) });

    renderPage();

    const input = screen.getByLabelText(/choose draftkings salary csv/i);
    fireEvent.change(input, { target: { files: [makeFile(MATCHING_CSV)] } });

    await waitFor(() => expect(screen.getByText(/JKB Week 1 \(2026\)/)).toBeInTheDocument());
    expect(screen.getByText("Derek Sample")).toBeInTheDocument();
    expect(screen.getByText(/JKB Full PPR|input as of/i)).toBeInTheDocument();
  });
});
