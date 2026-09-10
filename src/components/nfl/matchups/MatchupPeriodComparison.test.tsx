import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MatchupPeriodComparison from "@/components/nfl/matchups/MatchupPeriodComparison";
import {
  createSuccessRateResolver,
  describeSuccessPeriods,
  resolveSuccessPeriods,
  type SuccessRatesArtifact,
} from "@/lib/nfl/successRateData";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";
import type { NflGuideTeamNormalized } from "@/lib/nfl/guideData";

function makeTeam(o: Partial<NflGuideTeamNormalized>): NflMatchupTeam {
  return {
    slug: "t", abbr: "tt", teamName: "Team", division: "AFC East", conference: "AFC", color: "#000",
    projectedWins: 8.5, marketWinTotal: 8.5, modelVsMarketGap: 0, recommendationLabel: "Pass",
    confidenceLabel: "Low", regressionGap: 0, regressionSignal: "Neutral", powerRank: 16,
    offenseRank: 16, defenseRank: 16, scheduleRank: 16, scheduleLabel: "Average", record2025: "8-9",
    overallPct: 0, offensePct: 0, defensePct: 0, headline: "", editorialSummary: "",
    strengths: [], concerns: [], keyQuestions: [], ...o,
  };
}

const AWAY = makeTeam({ slug: "new-england-patriots", abbr: "ne", teamName: "New England Patriots" });
const HOME = makeTeam({ slug: "seattle-seahawks", abbr: "sea", teamName: "Seattle Seahawks", conference: "NFC" });

const MATCHUP: NflMatchup = {
  slug: "new-england-patriots-at-seattle-seahawks", gameId: "2026_01_NE_SEA", season: 2026, week: 1,
  seasonType: "REG", kickoffUtc: "2026-09-13T20:05:00Z", stadium: "Lumen Field",
  away: AWAY, home: HOME, neutralSite: false, spread: null,
};

const metric = (pct: number, rank: number | null) => ({ pct, raw: pct / 100, rank });

function teamPeriod(base: number, rank: number) {
  return {
    gamesIncluded: 8,
    gameIds: ["2025_11_X_Y"],
    metrics: {
      "off.successRate": metric(base, rank),
      "off.passSuccessRate": metric(base + 5, rank + 1),
      "off.rushSuccessRate": metric(base - 8, rank + 2),
      "def.successRateAllowed": metric(base - 4, rank + 3),
      "def.passSuccessRateAllowed": metric(base - 2, rank + 4),
      "def.rushSuccessRateAllowed": metric(base - 6, rank + 5),
    },
  };
}

const ARTIFACT: SuccessRatesArtifact = {
  _meta: {
    schemaVersion: "nfl-matchup-success-rates-v1",
    generatedAt: "2026-08-03T12:00:00.000Z",
    source: "RBSDM (rbsdm.com/stats)",
    attribution: "Ben Baldwin / RBSDM",
    endpoint: "https://rbsdm.com/api/team-tiers",
    currentSeason: 2026, priorSeason: 2025,
    completedGameCounts: { "2025": { ne: 17, sea: 17 }, "2026": { ne: 0, sea: 0 } },
    notes: [],
  },
  periods: {
    "2025-last8": { ne: teamPeriod(50.5, 2), sea: teamPeriod(45.8, 9) },
    "2026-season": { ne: teamPeriod(48.2, 10), sea: teamPeriod(51.3, 5) },
    "2026-last5": { ne: teamPeriod(52.7, 3), sea: teamPeriod(47.1, 15) },
  },
};

function renderPeriods(awayGames: number, homeGames: number) {
  const periods = resolveSuccessPeriods(awayGames, homeGames);
  return render(
    <MemoryRouter>
      <MatchupPeriodComparison
        matchup={MATCHUP}
        successRate={{ periods, resolve: createSuccessRateResolver(ARTIFACT) }}
        note={describeSuccessPeriods([...periods])}
      />
    </MemoryRouter>
  );
}

describe("MatchupPeriodComparison", () => {
  it("keeps the headings, explanatory sentence and period labels", () => {
    renderPeriods(0, 0);
    expect(screen.getByText("Over time")).toBeInTheDocument();
    expect(screen.getByText("Success Rate by Period")).toBeInTheDocument();
    expect(
      screen.getByText(/Periods switch together for both teams once each has six completed/)
    ).toBeInTheDocument();
    // Preseason shows the 2025 Last 8 window, carried in each row's metric cell.
    expect(screen.getAllByText("2025 L8").length).toBeGreaterThan(0);
  });

  it("renders each success-rate metric as its own titled shared comparison table", () => {
    const { container } = renderPeriods(0, 0);
    // Six metrics → six titled table groups, each a shared MatchupMetricTable.
    expect(container.querySelectorAll(".matchup-metric-table-group")).toHaveLength(6);
    expect(container.querySelectorAll(".matchup-metric-table")).toHaveLength(6);
    // The prominent two-team header sits above the tables.
    expect(screen.getAllByText("NE").length).toBeGreaterThan(0);
    expect(screen.getAllByText("SEA").length).toBeGreaterThan(0);
  });

  it("shows league ranks in the team cells and states the raw percentage-point Edge", () => {
    const { container } = renderPeriods(0, 0);
    const ranks = Array.from(container.querySelectorAll(".matchup-metric-table__rank")).map(
      (n) => n.textContent
    );
    // NE 50.5 (#2) leads SEA 45.8 (#9) on Success Rate — higher is better.
    expect(ranks).toContain("2nd");
    expect(ranks).toContain("9th");
    // The raw percentage is preserved on the cell hover title, not shown in the cell.
    expect(screen.getAllByTitle(/50\.5%/).length).toBeGreaterThan(0);
    // Edge names the advantaged side with the raw percentage-point gap.
    expect(screen.getAllByText("+4.7 pp").length).toBeGreaterThan(0);
  });

  it("falls back to the raw percentage when a split has no league rank", () => {
    const noRank: SuccessRatesArtifact = {
      ...ARTIFACT,
      periods: {
        "2025-last8": {
          ne: { gamesIncluded: 8, gameIds: ["x"], metrics: { "off.successRate": metric(48, null) } },
          sea: { gamesIncluded: 8, gameIds: ["x"], metrics: { "off.successRate": metric(44, null) } },
        },
      },
    };
    render(
      <MemoryRouter>
        <MatchupPeriodComparison
          matchup={MATCHUP}
          successRate={{ periods: ["2025-last8"], resolve: createSuccessRateResolver(noRank) }}
          note="t"
        />
      </MemoryRouter>
    );
    expect(screen.getAllByText("48.0%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("44.0%").length).toBeGreaterThan(0);
  });

  it("keeps a missing value honest with an N/A cell and no winner", () => {
    const emptyArtifact: SuccessRatesArtifact = {
      ...ARTIFACT,
      periods: { "2026-last5": { ne: undefined as never, sea: undefined as never } },
    };
    render(
      <MemoryRouter>
        <MatchupPeriodComparison
          matchup={MATCHUP}
          successRate={{ periods: ["2026-last5"], resolve: createSuccessRateResolver(emptyArtifact) }}
          note="test"
        />
      </MemoryRouter>
    );
    expect(screen.getAllByText("N/A").length).toBeGreaterThan(0);
  });
});
