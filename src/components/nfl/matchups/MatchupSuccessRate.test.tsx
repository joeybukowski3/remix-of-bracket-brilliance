import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MatchupUnitComparison from "@/components/nfl/matchups/MatchupUnitComparison";
import MatchupUnitBattles from "@/components/nfl/matchups/MatchupUnitBattles";
import MatchupTrenches from "@/components/nfl/matchups/MatchupTrenches";
import {
  OFFENSE_METRIC_GROUPS,
  DEFENSE_METRIC_GROUPS,
  unavailableMetricResolver,
} from "@/lib/nfl/matchupMetrics";
import {
  createSuccessRateResolver,
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

const AWAY = makeTeam({ slug: "new-england-patriots", abbr: "ne", teamName: "New England Patriots", offenseRank: 4, offensePct: 6.8 });
const HOME = makeTeam({ slug: "seattle-seahawks", abbr: "sea", teamName: "Seattle Seahawks", conference: "NFC", offenseRank: 6, offensePct: 6.0 });

const MATCHUP: NflMatchup = {
  slug: "new-england-patriots-at-seattle-seahawks", gameId: "2026_01_NE_SEA", season: 2026, week: 1,
  seasonType: "REG", kickoffUtc: "2026-09-13T20:05:00Z", stadium: "Lumen Field",
  away: AWAY, home: HOME, neutralSite: false, spread: null,
};

const metric = (pct: number, rank: number) => ({ pct, raw: pct / 100, rank });

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

/** Deterministic fixture covering all three periods, including future 2026. */
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

function renderOffense(periods: ReturnType<typeof resolveSuccessPeriods>) {
  return render(
    <MemoryRouter>
      <MatchupUnitComparison
        id="offense"
        matchup={MATCHUP}
        groups={OFFENSE_METRIC_GROUPS}
        resolver={unavailableMetricResolver}
        baselineLabel="JKB Offense Rating"
        baselineRank={(t) => t.offenseRank}
        baselineValue={(t) => t.offensePct}
        successRate={{ periods, resolve: createSuccessRateResolver(ARTIFACT) }}
      />
    </MemoryRouter>
  );
}

/** The success-rate row block containing a given metric label. */
function srBlock(label: string): HTMLElement {
  return screen.getAllByText(label)[0].closest("div.border-b") as HTMLElement;
}

describe("preseason — 2025 Last 8 only", () => {
  it("shows a single 2025 period and no empty 2026 column", () => {
    renderOffense(resolveSuccessPeriods(0, 0));
    const block = srBlock("Success Rate");
    expect(within(block).getByText("2025 Last 8")).toBeInTheDocument();
    expect(within(block).queryByText("2026 Season")).toBeNull();
    expect(within(block).queryByText("2026 Last 5")).toBeNull();
  });

  it("renders both teams' published values and ranks", () => {
    renderOffense(resolveSuccessPeriods(0, 0));
    const block = srBlock("Success Rate");
    expect(within(block).getByText("50.5%")).toBeInTheDocument();
    expect(within(block).getByText("45.8%")).toBeInTheDocument();
    expect(within(block).getByText("#2")).toBeInTheDocument();
    expect(within(block).getByText("#9")).toBeInTheDocument();
  });

  it("populates all three offensive success metrics", () => {
    renderOffense(resolveSuccessPeriods(0, 0));
    expect(within(srBlock("Pass Success Rate")).getByText("55.5%")).toBeInTheDocument();
    expect(within(srBlock("Rush Success Rate")).getByText("42.5%")).toBeInTheDocument();
  });
});

describe("early 2026 — two separate periods", () => {
  it("shows 2025 Last 8 and 2026 Season, but not Last 5", () => {
    renderOffense(resolveSuccessPeriods(3, 2));
    const block = srBlock("Success Rate");
    expect(within(block).getByText("2025 Last 8")).toBeInTheDocument();
    expect(within(block).getByText("2026 Season")).toBeInTheDocument();
    expect(within(block).queryByText("2026 Last 5")).toBeNull();
  });

  it("renders both periods' values without combining them", () => {
    renderOffense(resolveSuccessPeriods(3, 2));
    const block = srBlock("Success Rate");
    // 2025 values and 2026 values both present, unblended.
    expect(within(block).getByText("50.5%")).toBeInTheDocument();
    expect(within(block).getByText("48.2%")).toBeInTheDocument();
    expect(within(block).getByText("45.8%")).toBeInTheDocument();
    expect(within(block).getByText("51.3%")).toBeInTheDocument();
  });

  it("holds the transition when only one team has six completed games", () => {
    renderOffense(resolveSuccessPeriods(6, 5));
    const block = srBlock("Success Rate");
    expect(within(block).getByText("2025 Last 8")).toBeInTheDocument();
    expect(within(block).queryByText("2026 Last 5")).toBeNull();
  });

  it("shows N/A for a team with no 2026 data instead of substituting 2025", () => {
    const partial: SuccessRatesArtifact = {
      ...ARTIFACT,
      periods: {
        "2025-last8": ARTIFACT.periods["2025-last8"],
        "2026-season": { sea: teamPeriod(51.3, 5) }, // ne has not played
      },
    };
    render(
      <MemoryRouter>
        <MatchupUnitComparison
          id="offense" matchup={MATCHUP} groups={OFFENSE_METRIC_GROUPS}
          resolver={unavailableMetricResolver}
          baselineLabel="JKB Offense Rating"
          baselineRank={(t) => t.offenseRank} baselineValue={(t) => t.offensePct}
          successRate={{ periods: ["2025-last8", "2026-season"], resolve: createSuccessRateResolver(partial) }}
        />
      </MemoryRouter>
    );
    const block = srBlock("Success Rate");
    expect(within(block).getByText("50.5%")).toBeInTheDocument(); // ne 2025 intact
    expect(within(block).getByText("51.3%")).toBeInTheDocument(); // sea 2026 present
    expect(within(block).getAllByText("N/A").length).toBeGreaterThan(0); // ne 2026 absent
  });
});

describe("after the six-game transition", () => {
  it("switches to 2026 Season + Last 5 and hides 2025", () => {
    renderOffense(resolveSuccessPeriods(6, 6));
    const block = srBlock("Success Rate");
    expect(within(block).getByText("2026 Season")).toBeInTheDocument();
    expect(within(block).getByText("2026 Last 5")).toBeInTheDocument();
    expect(within(block).queryByText("2025 Last 8")).toBeNull();
    expect(within(block).queryByText("50.5%")).toBeNull(); // 2025 value gone
    expect(within(block).getByText("52.7%")).toBeInTheDocument(); // last 5
  });
});

describe("defense success rates", () => {
  it("populates the three defensive success rows", () => {
    render(
      <MemoryRouter>
        <MatchupUnitComparison
          id="defense" matchup={MATCHUP} groups={DEFENSE_METRIC_GROUPS}
          resolver={unavailableMetricResolver}
          baselineLabel="JKB Defense Rating"
          baselineRank={(t) => t.defenseRank} baselineValue={(t) => t.defensePct}
          successRate={{ periods: ["2025-last8"], resolve: createSuccessRateResolver(ARTIFACT) }}
        />
      </MemoryRouter>
    );
    expect(within(srBlock("Success Rate Allowed")).getByText("46.5%")).toBeInTheDocument();
    expect(within(srBlock("Pass Success Rate Allowed")).getByText("48.5%")).toBeInTheDocument();
    expect(within(srBlock("Rush Success Rate Allowed")).getByText("44.5%")).toBeInTheDocument();
  });
});

describe("offense vs defense", () => {
  it("pairs away offense success against home defense success allowed", () => {
    render(
      <MemoryRouter>
        <MatchupUnitBattles
          matchup={MATCHUP}
          resolver={unavailableMetricResolver}
          successRate={{ periods: ["2025-last8"], resolve: createSuccessRateResolver(ARTIFACT) }}
        />
      </MemoryRouter>
    );
    // NE offense 50.5 vs SEA defense allowed 41.8 (45.8 - 4).
    const blocks = screen.getAllByText("Success Rate");
    expect(blocks.length).toBeGreaterThan(0);
    expect(screen.getAllByText("50.5%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("41.8%").length).toBeGreaterThan(0);
  });

  it("derives no matchup score, edge or winner", () => {
    render(
      <MemoryRouter>
        <MatchupUnitBattles
          matchup={MATCHUP} resolver={unavailableMetricResolver}
          successRate={{ periods: ["2025-last8"], resolve: createSuccessRateResolver(ARTIFACT) }}
        />
      </MemoryRouter>
    );
    // Look for actual derived output, not the section's own disclaimer (which
    // legitimately contains the word "projected" while denying one exists).
    for (const banned of [/projected spread/i, /model edge/i, /win probability/i, /picked winner/i]) {
      expect(screen.queryByText(banned), String(banned)).toBeNull();
    }
    expect(screen.getByText(/no matchup score or projected advantage is derived/i)).toBeInTheDocument();
  });
});

describe("nothing else regressed", () => {
  it("leaves EPA and other deferred rows at N/A", () => {
    renderOffense(resolveSuccessPeriods(0, 0));
    for (const label of ["EPA / Play", "3rd Down Conversion", "Avg Time of Possession", "Pass Block Win Rate"]) {
      const row = screen.getAllByText(label)[0].closest(".grid") as HTMLElement;
      expect(within(row).getAllByText("N/A").length, label).toBe(2);
    }
  });

  it("leaves the trenches section fully unavailable", () => {
    render(
      <MemoryRouter>
        <MatchupTrenches matchup={MATCHUP} resolver={unavailableMetricResolver} />
      </MemoryRouter>
    );
    // Phase 3B: one N/A per battle when the ESPN artifact is absent.
    expect(screen.getAllByText("N/A")).toHaveLength(4);
  });

  it("renders no success rate at all when the artifact is missing", () => {
    render(
      <MemoryRouter>
        <MatchupUnitComparison
          id="offense" matchup={MATCHUP} groups={OFFENSE_METRIC_GROUPS}
          resolver={unavailableMetricResolver}
          baselineLabel="JKB Offense Rating"
          baselineRank={(t) => t.offenseRank} baselineValue={(t) => t.offensePct}
          successRate={{ periods: ["2025-last8"], resolve: createSuccessRateResolver(null) }}
        />
      </MemoryRouter>
    );
    const block = srBlock("Success Rate");
    expect(within(block).getAllByText("N/A").length).toBe(2);
  });
});
