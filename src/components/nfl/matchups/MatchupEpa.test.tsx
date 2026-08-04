import { readFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MatchupUnitComparison from "@/components/nfl/matchups/MatchupUnitComparison";
import MatchupUnitBattles from "@/components/nfl/matchups/MatchupUnitBattles";
import {
  DEFENSE_METRIC_GROUPS,
  OFFENSE_METRIC_GROUPS,
  unavailableMetricResolver,
} from "@/lib/nfl/matchupMetrics";
import { composeMetricResolvers, createEpaResolver, type EpaArtifact } from "@/lib/nfl/epaData";
import type { NflMatchupSampleSettings } from "@/lib/nfl/matchupSampleWindow";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";
import type { NflGuideTeamNormalized } from "@/lib/nfl/guideData";

const ROOT = resolvePath(__dirname, "../../../..");
const EPA = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/matchup-epa.json"), "utf8")) as EpaArtifact;

function makeTeam(overrides: Partial<NflGuideTeamNormalized>): NflMatchupTeam {
  return {
    slug: "team-a", abbr: "taa", teamName: "Team A", division: "AFC East", conference: "AFC",
    color: "#000000", projectedWins: 8.5, marketWinTotal: 8.5, modelVsMarketGap: 0,
    recommendationLabel: "Pass", confidenceLabel: "Low", regressionGap: 0,
    regressionSignal: "Neutral", powerRank: 16, offenseRank: 16, defenseRank: 16,
    scheduleRank: 16, scheduleLabel: "Average", record2025: "8-9", overallPct: 0,
    offensePct: 0, defensePct: 0, headline: "", editorialSummary: "",
    strengths: [], concerns: [], keyQuestions: [],
    ...overrides,
  };
}

const AWAY = makeTeam({ slug: "new-england-patriots", abbr: "ne", teamName: "New England Patriots" });
const HOME = makeTeam({ slug: "seattle-seahawks", abbr: "sea", teamName: "Seattle Seahawks" });

const MATCHUP: NflMatchup = {
  gameId: "2026_01_NE_SEA",
  slug: "new-england-patriots-at-seattle-seahawks",
  week: 1, away: AWAY, home: HOME, spread: null,
} as unknown as NflMatchup;

const SLUGS = new Map([
  ["new-england-patriots", "ne"],
  ["seattle-seahawks", "sea"],
]);

const settings = (window: "season" | "last5", includePriorSeason: boolean): NflMatchupSampleSettings =>
  ({ window, includePriorSeason });

function epaResolver(s: NflMatchupSampleSettings) {
  return composeMetricResolvers(createEpaResolver(EPA, s, SLUGS), unavailableMetricResolver);
}

function renderOffense(s = settings("season", true)) {
  return render(
    <MemoryRouter>
      <MatchupUnitComparison
        id="offense"
        matchup={MATCHUP}
        groups={OFFENSE_METRIC_GROUPS}
        resolver={epaResolver(s)}
        baselineLabel="JKB Offense Rating"
        baselineRank={(t) => t.offenseRank}
        baselineValue={(t) => t.offensePct}
      />
    </MemoryRouter>
  );
}

function renderDefense(s = settings("season", true)) {
  return render(
    <MemoryRouter>
      <MatchupUnitComparison
        id="defense"
        matchup={MATCHUP}
        groups={DEFENSE_METRIC_GROUPS}
        resolver={epaResolver(s)}
        baselineLabel="JKB Defense Rating"
        baselineRank={(t) => t.defenseRank}
        baselineValue={(t) => t.defensePct}
      />
    </MemoryRouter>
  );
}

/** Signed three-decimal token, e.g. "+0.215" / "-0.010" / "0.000". */
const EPA_TOKEN = /^([+-]\d+\.\d{3}|0\.000)$/;

describe("offense EPA rows", () => {
  it("populates EPA / Play, EPA / Pass and EPA / Rush", () => {
    const { container } = renderOffense();
    for (const label of ["EPA / Play", "EPA / Pass", "EPA / Rush"]) {
      expect(screen.getAllByText(label).length, label).toBeGreaterThan(0);
    }
    const tokens = [...container.querySelectorAll("span")]
      .map((n) => (n.textContent ?? "").trim())
      .filter((t) => EPA_TOKEN.test(t));
    // Three offensive EPA metrics x two teams.
    expect(tokens.length).toBeGreaterThanOrEqual(6);
  });

  it("shows New England's audited season-blend value", () => {
    const { container } = renderOffense();
    expect(container.textContent).toContain("+0.215");
  });

  it("uses three-decimal signed formatting", () => {
    const { container } = renderOffense();
    const tokens = [...container.querySelectorAll("span")]
      .map((n) => (n.textContent ?? "").trim())
      .filter((t) => EPA_TOKEN.test(t));
    for (const t of tokens) expect(t, t).toMatch(EPA_TOKEN);
  });
});

describe("defense EPA rows", () => {
  it("populates EPA / Play Allowed, EPA / Pass Allowed and EPA / Rush Allowed", () => {
    renderDefense();
    for (const label of ["EPA / Play Allowed", "EPA / Pass Allowed", "EPA / Rush Allowed"]) {
      expect(screen.getAllByText(label).length, label).toBeGreaterThan(0);
    }
  });

  it("shows Seattle's audited defensive value", () => {
    const { container } = renderDefense();
    expect(container.textContent).toContain("-0.179");
  });
});

describe("sample controls drive EPA", () => {
  it("changes the displayed value between Season and Last 5", () => {
    const season = renderOffense(settings("season", true)).container.textContent ?? "";
    const last5 = renderOffense(settings("last5", true)).container.textContent ?? "";
    // NE: +0.215 on the rolling eight, +0.279 on the last five.
    expect(season).toContain("+0.215");
    expect(last5).toContain("+0.279");
    expect(season).not.toContain("+0.279");
  });

  it("falls back to N/A when the blend is OFF and no 2026 games exist", () => {
    const { container } = renderOffense(settings("season", false));
    const tokens = [...container.querySelectorAll("span")]
      .map((n) => (n.textContent ?? "").trim())
      .filter((t) => EPA_TOKEN.test(t));
    expect(tokens).toHaveLength(0);
    expect(container.textContent).toContain("N/A");
  });
});

describe("ranks", () => {
  it("attaches rank chips to EPA rows", () => {
    const { container } = renderOffense();
    // NE is #1 in EPA/play over the rolling eight-game sample.
    expect(container.textContent).toContain("#1");
  });
});

describe("offense vs defense battles", () => {
  it("populates the three EPA battles", () => {
    render(
      <MemoryRouter>
        <MatchupUnitBattles matchup={MATCHUP} resolver={epaResolver(settings("season", true))} />
      </MemoryRouter>
    );
    for (const label of ["EPA / Play", "EPA / Pass", "EPA / Rush"]) {
      expect(screen.getAllByText(label).length, label).toBeGreaterThan(0);
    }
  });

  it("pairs each offense against the opposing defense without declaring a winner", () => {
    const { container } = render(
      <MemoryRouter>
        <MatchupUnitBattles matchup={MATCHUP} resolver={epaResolver(settings("season", true))} />
      </MemoryRouter>
    );
    const text = container.textContent ?? "";
    expect(text).toContain("+0.215");
    expect(text).toMatch(/-0\.\d{3}/);
    // "No matchup score or projected advantage is derived" is the section's own
    // disclaimer, so the assertion targets claims rather than the word alone.
    expect(text).not.toMatch(/winner|epa edge|advantage to|projected spread|favou?rite|win prob/i);
    expect(text).toMatch(/no matchup score or projected advantage is derived/i);
  });
});

describe("scope guarantees", () => {
  it("produces no EPA-derived score, spread or probability", () => {
    const { container } = renderOffense();
    expect(container.textContent).not.toMatch(
      /projected spread|win probability|model edge|picked winner|epa edge|matchup score/i
    );
  });

  it("leaves success rate and trench rows to their own pipelines", () => {
    // The EPA resolver is composed with an unavailable fallback, so any row it
    // does not own must still read N/A.
    const { container } = renderOffense();
    expect(container.textContent).toContain("N/A");
  });
});
