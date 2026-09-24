import { describe, it, expect } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MatchupTrenches from "@/components/nfl/matchups/MatchupTrenches";
import MatchupUnitComparison from "@/components/nfl/matchups/MatchupUnitComparison";
import MatchupUnitBattles from "@/components/nfl/matchups/MatchupUnitBattles";
import { OFFENSE_METRIC_GROUPS, unavailableMetricResolver } from "@/lib/nfl/matchupMetrics";
import {
  createTrenchResolver,
  describeTrenchPeriods,
  resolveTrenchPeriods,
  type TrenchMetricsArtifact,
} from "@/lib/nfl/trenchMetricsData";
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

const m = (valuePct: number, espnRank: number) => ({ valuePct, espnRank });

function seasonTeams(base: number, rank: number) {
  return {
    ne: {
      espnSlug: "ne",
      metrics: {
        "off.passBlockWinRate": m(base, rank),
        "off.runBlockWinRate": m(base + 8, rank + 1),
        "def.passRushWinRate": m(base - 29, rank + 2),
        "def.runStopWinRate": m(base - 33, rank + 3),
      },
    },
    sea: {
      espnSlug: "sea",
      metrics: {
        "off.passBlockWinRate": m(base + 1, rank + 10),
        "off.runBlockWinRate": m(base + 9, rank + 11),
        "def.passRushWinRate": m(base - 23, rank + 12),
        "def.runStopWinRate": m(base - 32, rank + 13),
      },
    },
  };
}

/** Deterministic fixture including a 2026 season, which does not exist live yet. */
const ARTIFACT: TrenchMetricsArtifact = {
  schemaVersion: "nfl-matchup-trench-metrics-v1",
  generatedAt: "2026-08-03T12:00:00.000Z",
  source: "ESPN Analytics (NFL Next Gen Stats)",
  attribution: "ESPN Analytics / NFL Next Gen Stats",
  metricColumns: {},
  seasons: {
    "2025": {
      articleId: "46138675", throughWeek: 18,
      sourceUpdatedText: "Last updated: Through all Week 18 games",
      sourceLastModified: "2026-01-06T15:51:59Z",
      teams: seasonTeams(64, 13),
    },
    "2026": {
      articleId: "99999999", throughWeek: 4,
      sourceUpdatedText: "Last updated: Through Week 4 games",
      sourceLastModified: "2026-10-01T12:00:00Z",
      teams: seasonTeams(70, 3),
    },
  },
  provenance: {},
};

function trenchConfig(periods: ReturnType<typeof resolveTrenchPeriods>, artifact = ARTIFACT) {
  return { artifact, periods, resolve: createTrenchResolver(artifact) };
}

function renderTrenches(periods: ReturnType<typeof resolveTrenchPeriods>, artifact = ARTIFACT) {
  return render(
    <MemoryRouter>
      <MatchupTrenches
        matchup={MATCHUP}
        trench={trenchConfig(periods, artifact)}
        note={describeTrenchPeriods(periods)}
      />
    </MemoryRouter>
  );
}

describe("preseason — 2025 only", () => {
  it("shows the 2025 period and no 2026 column", () => {
    renderTrenches(resolveTrenchPeriods(0, 0));
    expect(screen.getAllByText("2025 Season").length).toBeGreaterThan(0);
    expect(screen.queryByText(/2026 Through Week/)).toBeNull();
  });

  it("renders two unified charts with a group and two towers for each battle", () => {
    const { container } = renderTrenches(resolveTrenchPeriods(0, 0));
    expect(screen.getAllByText("Pass Block vs Pass Rush")).toHaveLength(2);
    expect(screen.getAllByText("Run Block vs Run Stop")).toHaveLength(2);
    expect(screen.getByText("New England Patriots has the ball")).toBeInTheDocument();
    expect(screen.getByText("Seattle Seahawks has the ball")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "NE Offense vs SEA Defense" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "SEA Offense vs NE Defense" })).toBeInTheDocument();
    const charts = container.querySelectorAll("#trenches .matchup-unified-chart");
    expect(charts).toHaveLength(2);
    for (const chart of charts) {
      expect(chart.querySelectorAll("[data-rank-tower-group]")).toHaveLength(2);
      expect(chart.querySelectorAll("[data-rank-tower]")).toHaveLength(4);
    }
    expect(container.querySelector("#trenches .matchup-comparison-card")).toBeNull();
  });

  it("uses ESPN ranks for height and keeps percentages visible and accessible", () => {
    const { container } = renderTrenches(resolveTrenchPeriods(0, 0));
    const group = container.querySelector("#trenches .matchup-unified-chart [data-rank-tower-group]")!;
    const towers = group.querySelectorAll<HTMLElement>(".matchup-unified-chart__team");
    expect(towers).toHaveLength(2);
    expect(towers[0]).toHaveAttribute("aria-label", expect.stringContaining("Pass Block vs Pass Rush — 2025 Season"));
    expect(towers[0]).toHaveAttribute("aria-label", expect.stringContaining("New England Patriots offense — rank 13 of 32 — value 64%"));
    expect(towers[1]).toHaveAttribute("aria-label", expect.stringContaining("Seattle Seahawks defense — rank 25 of 32 — value 41%"));
    expect(towers[0].querySelector(".matchup-unified-chart__value")).toHaveTextContent("64%");
    expect(towers[1].querySelector(".matchup-unified-chart__value")).toHaveTextContent("41%");
    expect(towers[0].querySelector("[data-rank-badge]")).toHaveTextContent("#13");
    expect(towers[1].querySelector("[data-rank-badge]")).toHaveTextContent("#25");
    expect((towers[0].querySelector(".matchup-rank-towers__bar-fill") as HTMLElement).style.height).toBe("61.29032258064516%");
    expect((towers[1].querySelector(".matchup-rank-towers__bar-fill") as HTMLElement).style.height).toBe("22.580645161290324%");
  });

  it("shows whole-number percentages without invented decimals", () => {
    renderTrenches(resolveTrenchPeriods(0, 0));
    expect(screen.queryByText(/\d+\.\d%/)).toBeNull();
  });

  it("labels each possession with the teams' roles", () => {
    const { container } = renderTrenches(resolveTrenchPeriods(0, 0));
    expect(screen.getByText("New England Patriots has the ball")).toBeInTheDocument();
    expect(screen.getByText("Seattle Seahawks has the ball")).toBeInTheDocument();
    expect(container.querySelectorAll(".matchup-unified-chart__legend")).toHaveLength(2);
  });

  it("keeps NE (away) left and SEA (home) right across both reciprocal possessions", () => {
    const { container } = renderTrenches(resolveTrenchPeriods(0, 0));
    for (const chart of container.querySelectorAll("#trenches .matchup-unified-chart")) {
      const pair = chart.querySelector(".matchup-unified-chart__pair")!;
      const labels = Array.from(pair.querySelectorAll(".matchup-unified-chart__identity"), (node) => node.textContent);
      expect(labels[0]).toMatch(/^NE /);
      expect(labels[1]).toMatch(/^SEA /);
    }
  });
});

describe("early 2026 — two separate periods", () => {
  it("shows 2025 Season and 2026 Through Week 4", () => {
    renderTrenches(resolveTrenchPeriods(3, 2));
    expect(screen.getAllByText("2025 Season").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2026 Through Week 4").length).toBeGreaterThan(0);
  });

  it("keeps both seasons' values distinct and unblended", () => {
    renderTrenches(resolveTrenchPeriods(3, 2));
    expect(screen.getAllByText("#13").length).toBeGreaterThan(0);
    expect(screen.getAllByText("#3").length).toBeGreaterThan(0);
    expect(screen.getAllByText("64%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("70%").length).toBeGreaterThan(0);
    expect(document.querySelectorAll("#trenches [data-rank-tower-group]")).toHaveLength(8);
  });

  it("holds the two-period state when only one team has six games", () => {
    renderTrenches(resolveTrenchPeriods(6, 5));
    expect(screen.getAllByText("2025 Season").length).toBeGreaterThan(0);
  });

  it("shows N/A for the 2026 period when that season is unavailable", () => {
    const only2025 = { ...ARTIFACT, seasons: { "2025": ARTIFACT.seasons["2025"] } };
    renderTrenches(["2025-season", "2026-season"], only2025);
    expect(screen.getAllByText("#13").length).toBeGreaterThan(0);
    expect(screen.getAllByText("N/A").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2026 Season to Date").length).toBeGreaterThan(0);
  });
});

describe("established 2026 — 2026 only", () => {
  it("hides 2025 and shows only the 2026 period", () => {
    renderTrenches(resolveTrenchPeriods(6, 6));
    expect(screen.queryByText("2025 Season")).toBeNull();
    expect(screen.getAllByText("2026 Through Week 4").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("64%")).toHaveLength(0);
    expect(screen.getAllByText("70%").length).toBeGreaterThan(0);
  });
});

describe("integrity", () => {
  it("never shows a Last 5 or Last 8 trench label", () => {
    for (const periods of [resolveTrenchPeriods(0, 0), resolveTrenchPeriods(3, 3), resolveTrenchPeriods(8, 8)]) {
      const { unmount } = renderTrenches(periods);
      expect(screen.queryByText(/Last 5/i)).toBeNull();
      expect(screen.queryByText(/Last 8/i)).toBeNull();
      unmount();
    }
  });

  it("substitutes no sacks or conventional metric into the trench card", () => {
    renderTrenches(resolveTrenchPeriods(0, 0));
    expect(screen.queryByText(/Sacks/i)).toBeNull();
    expect(screen.queryByText(/Yards/i)).toBeNull();
  });

  it("derives no trench score, edge, projection or winner", () => {
    renderTrenches(resolveTrenchPeriods(0, 0));
    for (const banned of [/projected/i, /win probability/i, /edge score/i, /advantage score/i, /winner/i]) {
      expect(screen.queryByText(banned), String(banned)).toBeNull();
    }
  });

  it("credits ESPN Analytics / NFL Next Gen Stats", () => {
    renderTrenches(resolveTrenchPeriods(0, 0));
    expect(screen.getByText(/ESPN Analytics \/ NFL Next Gen Stats/)).toBeInTheDocument();
  });

  it("keeps the section visible with N/A when the artifact is missing entirely", () => {
    render(
      <MemoryRouter>
        <MatchupTrenches matchup={MATCHUP} />
      </MemoryRouter>
    );
    expect(screen.getAllByText("Pass Block vs Pass Rush")).toHaveLength(2);
    expect(screen.getAllByText("Run Block vs Run Stop")).toHaveLength(2);
    expect(document.querySelectorAll("#trenches [data-rank-tower-group]")).toHaveLength(4);
    expect(document.querySelectorAll("#trenches .matchup-unified-chart__missing")).toHaveLength(8);
    expect(screen.getAllByText("N/A").length).toBeGreaterThan(0);
  });
});

describe("offense and defense sections", () => {
  it("populates PBWR and RBWR rows in the offense section", () => {
    render(
      <MemoryRouter>
        <MatchupUnitComparison
          id="offense" matchup={MATCHUP} groups={OFFENSE_METRIC_GROUPS}
          resolver={unavailableMetricResolver}
          baselineLabel="JKB Offense Rating"
          baselineRank={(t) => t.offenseRank} baselineValue={(t) => t.offensePct}
          trench={trenchConfig(["2025-season"])}
        />
      </MemoryRouter>
    );
    const pbwr = screen.getAllByText("Pass Block Win Rate")[0].closest("div.border-b") as HTMLElement;
    expect(within(pbwr).getByText("64%")).toBeInTheDocument();
    expect(within(pbwr).getByText("13th")).toBeInTheDocument();
    const rbwr = screen.getAllByText("Run Block Win Rate")[0].closest("div.border-b") as HTMLElement;
    expect(within(rbwr).getByText("72%")).toBeInTheDocument();
  });
});

describe("offense vs defense pairings", () => {
  it("aligns periods on both sides of a trench pairing", () => {
    render(
      <MemoryRouter>
        <MatchupUnitBattles
          matchup={MATCHUP}
          resolver={unavailableMetricResolver}
          trench={trenchConfig(["2025-season", "2026-season"])}
        />
      </MemoryRouter>
    );
    // "Pass Block vs Pass Rush" lives in the Passing group tab, not the
    // Overall tab shown by default.
    fireEvent.click(screen.getByRole("tab", { name: "Passing" }));
    // Each pairing renders one row per period, the period carried on the
    // Rank Towers card (the default, unmocked-viewport view) as a context
    // label.
    const contexts = Array.from(
      document.querySelectorAll(".matchup-rank-towers__context")
    ).map((n) => n.textContent);
    expect(contexts).toContain("2025 Season");
    expect(contexts).toContain("2026 Through Week 4");
    expect(screen.getAllByText("Pass Block vs Pass Rush").length).toBeGreaterThan(0);
  });
});
