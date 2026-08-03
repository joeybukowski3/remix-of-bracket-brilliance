import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MatchupUnitComparison from "@/components/nfl/matchups/MatchupUnitComparison";
import MatchupTrenches from "@/components/nfl/matchups/MatchupTrenches";
import MatchupDataControls from "@/components/nfl/matchups/MatchupDataControls";
import {
  createMatchupMetricResolver,
  describeMatchupSample,
  type MatchupMetricsArtifact,
} from "@/lib/nfl/matchupMetricsData";
import {
  OFFENSE_METRIC_GROUPS,
  unavailableMetricResolver,
} from "@/lib/nfl/matchupMetrics";
import { DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS } from "@/lib/nfl/matchupSampleWindow";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";
import type { NflGuideTeamNormalized } from "@/lib/nfl/guideData";

function makeTeam(overrides: Partial<NflGuideTeamNormalized>): NflMatchupTeam {
  return {
    slug: "team-a", abbr: "taa", teamName: "Team A", division: "AFC East", conference: "AFC",
    color: "#000000", projectedWins: 8.5, marketWinTotal: 8.5, modelVsMarketGap: 0,
    recommendationLabel: "Pass", confidenceLabel: "Low", regressionGap: 0, regressionSignal: "Neutral",
    powerRank: 16, offenseRank: 16, defenseRank: 16, scheduleRank: 16, scheduleLabel: "Average",
    record2025: "8-9", overallPct: 0, offensePct: 0, defensePct: 0, headline: "",
    editorialSummary: "", strengths: [], concerns: [], keyQuestions: [],
    ...overrides,
  };
}

const AWAY = makeTeam({ slug: "new-england-patriots", abbr: "ne", teamName: "New England Patriots", offenseRank: 4, offensePct: 6.8 });
const HOME = makeTeam({ slug: "seattle-seahawks", abbr: "sea", teamName: "Seattle Seahawks", conference: "NFC", offenseRank: 6, offensePct: 6.0 });

const MATCHUP: NflMatchup = {
  slug: "new-england-patriots-at-seattle-seahawks", gameId: "2026_01_NE_SEA", season: 2026, week: 1,
  seasonType: "REG", kickoffUtc: "2026-09-13T20:05:00Z", stadium: "Lumen Field",
  away: AWAY, home: HOME, neutralSite: false, spread: null,
};

const SLUG_TO_ABBR = new Map([
  ["new-england-patriots", "ne"],
  ["seattle-seahawks", "sea"],
]);

/** Small deterministic artifact so these tests never depend on refreshed data. */
const ARTIFACT: MatchupMetricsArtifact = {
  _meta: {
    schemaVersion: "nfl-matchup-metrics-v1",
    generatedAt: "2026-08-02T12:00:00.000Z",
    source: "nflverse (stats_team weekly release)",
    sourceFiles: [{ season: 2025, path: "data/nfl/nflverse/stats-team-week/stats_team_week_2025.csv", rowCount: 544 }],
    currentSeason: 2026, priorSeason: 2025, seasonsUsed: [2025],
    metricKeys: ["off.yardsPerPlay", "off.passPlayRate", "off.passYardsPerGame"],
    notes: [],
  },
  windows: {
    "season-blend": {
      mode: "season", includePriorSeason: true,
      teams: {
        ne: {
          gamesIncluded: 8, gameIds: ["2025_10_NE_TB"], seasons: [2025],
          through: { season: 2025, week: 18, dateUtc: "2026-01-04T21:25:00.000Z" },
          metrics: {
            "off.yardsPerPlay": [6.81, 1],
            "off.passPlayRate": [52.7, 22],
            "off.passYardsPerGame": [270.3, 5],
          },
        },
        sea: {
          gamesIncluded: 8, gameIds: ["2025_11_SEA_LA"], seasons: [2025],
          through: { season: 2025, week: 18, dateUtc: "2026-01-04T21:25:00.000Z" },
          metrics: {
            "off.yardsPerPlay": [5.94, 14],
            "off.passPlayRate": [53.1, 20],
            "off.passYardsPerGame": [222.9, 18],
          },
        },
      },
    },
    "last5-blend": {
      mode: "last5", includePriorSeason: true,
      teams: {
        ne: {
          gamesIncluded: 5, gameIds: ["2025_15_BUF_NE"], seasons: [2025],
          through: { season: 2025, week: 18, dateUtc: "2026-01-04T21:25:00.000Z" },
          metrics: { "off.yardsPerPlay": [7.02, 1], "off.passPlayRate": [51.0, 25], "off.passYardsPerGame": [280.1, 3] },
        },
        sea: {
          gamesIncluded: 5, gameIds: ["2025_15_SEA_ARI"], seasons: [2025],
          through: { season: 2025, week: 18, dateUtc: "2026-01-04T21:25:00.000Z" },
          metrics: { "off.yardsPerPlay": [5.50, 20], "off.passPlayRate": [54.0, 15], "off.passYardsPerGame": [210.0, 22] },
        },
      },
    },
    "season-current": { mode: "season", includePriorSeason: false, teams: {} },
    "last5-current": { mode: "last5", includePriorSeason: false, teams: {} },
  },
};

function renderOffense(settings = DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS) {
  const resolver = createMatchupMetricResolver(ARTIFACT, settings, SLUG_TO_ABBR);
  return render(
    <MemoryRouter>
      <MatchupUnitComparison
        id="offense"
        matchup={MATCHUP}
        groups={OFFENSE_METRIC_GROUPS}
        resolver={resolver}
        baselineLabel="JKB Offense Rating"
        baselineRank={(team) => team.offenseRank}
        baselineValue={(team) => team.offensePct}
      />
    </MemoryRouter>
  );
}

/** The comparison row whose centre label matches `label`. */
function rowFor(label: string): HTMLElement {
  const labelNode = screen.getAllByText(label)[0];
  return labelNode.closest(".grid") as HTMLElement;
}

describe("populated conventional stats", () => {
  it("renders real values for both teams", () => {
    renderOffense();
    const row = rowFor("Yards / Play");
    expect(within(row).getByText("6.81")).toBeInTheDocument();
    expect(within(row).getByText("5.94")).toBeInTheDocument();
  });

  it("renders league ranks alongside the values", () => {
    renderOffense();
    const row = rowFor("Yards / Play");
    expect(within(row).getByText("#1")).toBeInTheDocument();
    expect(within(row).getByText("#14")).toBeInTheDocument();
  });

  it("applies the quality rank tier to performance metrics", () => {
    renderOffense();
    const row = rowFor("Yards / Play");
    // Rank 1 is Elite, rank 14 is Above Average — announced, not colour-only.
    expect(within(row).getByTitle(/League rank 1 of 32, Elite/)).toBeInTheDocument();
    expect(within(row).getByTitle(/League rank 14 of 32, Above Average/)).toBeInTheDocument();
  });

  it("formats percentages and per-game values from the catalogue format", () => {
    renderOffense();
    expect(within(rowFor("Pass Play %")).getByText("52.7%")).toBeInTheDocument();
    expect(within(rowFor("Passing Yards / Game")).getByText("270.3")).toBeInTheDocument();
  });
});

describe("volume metrics are never scored as quality", () => {
  it("renders play-mix ranks as descriptive, not as a quality tier", () => {
    renderOffense();
    const row = rowFor("Pass Play %");
    // Rank 22 would be "Weak" on the quality scale; it must not be labelled so.
    expect(within(row).getByTitle(/League rank 22 of 32, descriptive only/)).toBeInTheDocument();
    expect(within(row).queryByTitle(/Weak/)).toBeNull();
  });

  it("does not tint the value cell for context-only metrics", () => {
    renderOffense();
    const passMix = within(rowFor("Pass Play %")).getByText("52.7%").parentElement!;
    const quality = within(rowFor("Yards / Play")).getByText("6.81").parentElement!;
    expect(passMix.className).not.toMatch(/bg-(emerald|red|orange|amber|teal)/);
    expect(quality.className).toMatch(/bg-emerald/);
  });

  it("marks the pass-attempt volume rank as descriptive too", () => {
    renderOffense();
    // No value in the fixture, but the direction must still be context-only.
    const row = rowFor("Pass Attempts / Game");
    expect(within(row).queryByTitle(/Elite|Excellent|Weak|Very Poor/)).toBeNull();
  });
});

describe("deferred metrics stay unavailable", () => {
  it("keeps EPA, success rate, third down and time of possession at N/A", () => {
    renderOffense();
    for (const label of ["EPA / Play", "Success Rate", "3rd Down Conversion", "Avg Time of Possession"]) {
      const row = rowFor(label);
      expect(within(row).getAllByText("N/A").length, label).toBe(2);
    }
  });

  it("keeps the line-of-scrimmage rows at N/A", () => {
    renderOffense();
    expect(within(rowFor("Pass Block Win Rate")).getAllByText("N/A")).toHaveLength(2);
    expect(within(rowFor("Run Block Win Rate")).getAllByText("N/A")).toHaveLength(2);
  });

  it("leaves the trenches section entirely unavailable", () => {
    const resolver = createMatchupMetricResolver(ARTIFACT, DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS, SLUG_TO_ABBR);
    render(
      <MemoryRouter>
        <MatchupTrenches matchup={MATCHUP} resolver={resolver} />
      </MemoryRouter>
    );
    // Four battles x two sides, none substituted with sacks.
    expect(screen.getAllByText("N/A")).toHaveLength(8);
    expect(screen.queryByText(/Sacks/i)).toBeNull();
  });
});

describe("sample controls drive the data", () => {
  it("resolves a different sample for Last 5 than for Season", () => {
    const season = createMatchupMetricResolver(ARTIFACT, { window: "season", includePriorSeason: true }, SLUG_TO_ABBR);
    const last5 = createMatchupMetricResolver(ARTIFACT, { window: "last5", includePriorSeason: true }, SLUG_TO_ABBR);
    expect(season("new-england-patriots", "off.yardsPerPlay")!.value).toBe(6.81);
    expect(last5("new-england-patriots", "off.yardsPerPlay")!.value).toBe(7.02);
  });

  it("swaps rendered values when the window changes", () => {
    const { unmount } = renderOffense({ window: "season", includePriorSeason: true });
    expect(within(rowFor("Yards / Play")).getByText("6.81")).toBeInTheDocument();
    unmount();

    renderOffense({ window: "last5", includePriorSeason: true });
    expect(within(rowFor("Yards / Play")).getByText("7.02")).toBeInTheDocument();
  });

  it("shows N/A everywhere when the blend is off and no current-season games exist", () => {
    renderOffense({ window: "season", includePriorSeason: false });
    const metricCount = OFFENSE_METRIC_GROUPS.reduce((total, g) => total + g.metrics.length, 0);
    expect(screen.getAllByText("N/A")).toHaveLength(metricCount * 2);
  });
});

describe("sample label", () => {
  it("renders the resolved sample next to the controls", () => {
    const summary = describeMatchupSample(ARTIFACT, DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS, ["ne", "sea"]);
    render(
      <MatchupDataControls
        settings={DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS}
        onChange={() => {}}
        sampleLabel={summary.label}
      />
    );
    expect(screen.getByTestId("matchup-sample-label")).toHaveTextContent("8 games · 2025");
  });

  it("updates the label when the control state changes", () => {
    const onChange = vi.fn();
    const last5 = describeMatchupSample(ARTIFACT, { window: "last5", includePriorSeason: true }, ["ne", "sea"]);
    render(
      <MatchupDataControls
        settings={{ window: "last5", includePriorSeason: true }}
        onChange={onChange}
        sampleLabel={last5.label}
      />
    );
    expect(screen.getByTestId("matchup-sample-label")).toHaveTextContent("5 games · 2025");
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith({ window: "last5", includePriorSeason: false });
  });

  it("states plainly that no 2026 games exist rather than showing a 2025 count", () => {
    const summary = describeMatchupSample(ARTIFACT, { window: "season", includePriorSeason: false }, ["ne", "sea"]);
    render(
      <MatchupDataControls
        settings={{ window: "season", includePriorSeason: false }}
        onChange={() => {}}
        sampleLabel={summary.label}
      />
    );
    expect(screen.getByTestId("matchup-sample-label")).toHaveTextContent(/no completed 2026 games/i);
  });
});

describe("no fabricated model output", () => {
  it("renders no projected spread, winner or edge anywhere in the offense section", () => {
    renderOffense();
    expect(screen.queryByText(/projected spread/i)).toBeNull();
    expect(screen.queryByText(/model edge/i)).toBeNull();
    expect(screen.queryByText(/win probability/i)).toBeNull();
    expect(screen.queryByText(/pick/i)).toBeNull();
  });

  it("falls back to N/A rather than a substituted value when the artifact is absent", () => {
    render(
      <MemoryRouter>
        <MatchupUnitComparison
          id="offense" matchup={MATCHUP} groups={OFFENSE_METRIC_GROUPS}
          resolver={unavailableMetricResolver}
          baselineLabel="JKB Offense Rating"
          baselineRank={(team) => team.offenseRank}
          baselineValue={(team) => team.offensePct}
        />
      </MemoryRouter>
    );
    const metricCount = OFFENSE_METRIC_GROUPS.reduce((total, g) => total + g.metrics.length, 0);
    expect(screen.getAllByText("N/A")).toHaveLength(metricCount * 2);
  });
});
