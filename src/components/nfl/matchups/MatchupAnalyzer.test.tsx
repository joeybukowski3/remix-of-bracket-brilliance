import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MatchupSection from "@/components/nfl/matchups/MatchupSection";
import MatchupJumpNav from "@/components/nfl/matchups/MatchupJumpNav";
import MatchupDataControls from "@/components/nfl/matchups/MatchupDataControls";
import MatchupUnitComparison from "@/components/nfl/matchups/MatchupUnitComparison";
import MatchupTrenches from "@/components/nfl/matchups/MatchupTrenches";
import MatchupInjuries from "@/components/nfl/matchups/MatchupInjuries";
import MatchupMarketProfile from "@/components/nfl/matchups/MatchupMarketProfile";
import MatchupAdvantages from "@/components/nfl/matchups/MatchupAdvantages";
import MatchupAngles from "@/components/nfl/matchups/MatchupAngles";
import MatchupHero from "@/components/nfl/matchups/MatchupHero";
import { NFL_MATCHUP_SECTIONS } from "@/lib/nfl/matchupSections";
import {
  DEFENSE_METRIC_GROUPS,
  OFFENSE_METRIC_GROUPS,
  unavailableInjuryResolver,
  unavailableMetricResolver,
} from "@/lib/nfl/matchupMetrics";
import { DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS } from "@/lib/nfl/matchupSampleWindow";
import { deriveAdvantages, deriveAngles } from "@/lib/nfl/matchupComparison";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";
import type { NflGuideTeamNormalized } from "@/lib/nfl/guideData";

function makeTeam(overrides: Partial<NflGuideTeamNormalized>): NflMatchupTeam {
  return {
    slug: "team-a",
    abbr: "taa",
    teamName: "Team A",
    division: "AFC East",
    conference: "AFC",
    color: "#000000",
    projectedWins: 8.5,
    marketWinTotal: 8.5,
    modelVsMarketGap: 0,
    recommendationLabel: "Pass",
    confidenceLabel: "Low",
    regressionGap: 0,
    regressionSignal: "Neutral",
    powerRank: 16,
    offenseRank: 16,
    defenseRank: 16,
    scheduleRank: 16,
    scheduleLabel: "Average",
    record2025: "8-9",
    overallPct: 0,
    offensePct: 0,
    defensePct: 0,
    headline: "",
    editorialSummary: "",
    strengths: [],
    concerns: [],
    keyQuestions: [],
    ...overrides,
  };
}

const AWAY = makeTeam({
  slug: "new-england-patriots",
  abbr: "ne",
  teamName: "New England Patriots",
  division: "AFC East",
  powerRank: 6,
  offenseRank: 9,
  defenseRank: 3,
  overallPct: 8.4,
  offensePct: 5.1,
  defensePct: 11.2,
  projectedWins: 10.5,
  record2025: "11-6",
});

const HOME = makeTeam({
  slug: "seattle-seahawks",
  abbr: "sea",
  teamName: "Seattle Seahawks",
  division: "NFC West",
  conference: "NFC",
  powerRank: 21,
  offenseRank: 24,
  defenseRank: 18,
  overallPct: -4.2,
  offensePct: -6.7,
  defensePct: -1.1,
  projectedWins: 7.5,
  record2025: "8-9",
});

const MATCHUP: NflMatchup = {
  slug: "new-england-patriots-at-seattle-seahawks",
  gameId: "2026_01_ne_sea",
  season: 2026,
  week: 1,
  seasonType: "REG",
  kickoffUtc: "2026-09-13T20:05:00Z",
  stadium: "Lumen Field",
  away: AWAY,
  home: HOME,
  neutralSite: false,
  spread: null,
};

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("Jump To navigation", () => {
  it("renders one anchor per registered section, in page order", () => {
    render(<MatchupJumpNav />);
    const nav = screen.getByRole("navigation", { name: /jump to matchup section/i });
    const links = within(nav).getAllByRole("link");

    expect(links).toHaveLength(NFL_MATCHUP_SECTIONS.length);
    expect(links.map((link) => link.getAttribute("href"))).toEqual(
      NFL_MATCHUP_SECTIONS.map((section) => `#${section.id}`)
    );
  });

  it("covers every section the brief requires", () => {
    render(<MatchupJumpNav />);
    for (const id of [
      "overview",
      "advantages",
      "things-to-watch",
      "offense",
      "defense",
      "matchups",
      "trenches",
      "market",
      "injuries",
      "game-trends",
      "model-analysis",
    ]) {
      expect(document.querySelector(`a[href="#${id}"]`), id).not.toBeNull();
    }
  });
});

describe("MatchupSection collapse behaviour", () => {
  it("exposes an accessible, keyboard-operable toggle that starts expanded", () => {
    render(
      <MatchupSection id="offense">
        <p>section body</p>
      </MatchupSection>
    );

    const toggle = screen.getByRole("button", { name: /hide/i });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    // The toggle must point at the element it controls.
    const controlledId = toggle.getAttribute("aria-controls");
    expect(controlledId).toBeTruthy();
    expect(document.getElementById(controlledId!)).not.toBeNull();
  });

  it("flips aria-expanded and hides the body on mobile when collapsed", () => {
    render(
      <MatchupSection id="offense">
        <p>section body</p>
      </MatchupSection>
    );

    const toggle = screen.getByRole("button", { name: /hide/i });
    const body = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(body.className).toContain("block");
    expect(body.className).not.toContain("hidden");

    fireEvent.click(toggle);

    expect(screen.getByRole("button", { name: /show/i })).toHaveAttribute("aria-expanded", "false");
    // Collapsed below `lg` only — desktop keeps the grid cell populated.
    expect(body.className).toContain("hidden");
    expect(body.className).toContain("lg:block");
  });

  it("anchors the section with a stable id and a focusable target", () => {
    render(
      <MatchupSection id="trenches">
        <p>body</p>
      </MatchupSection>
    );
    const section = document.getElementById("trenches")!;
    expect(section).not.toBeNull();
    expect(section.getAttribute("tabindex")).toBe("-1");
  });
});

describe("Data controls", () => {
  it("defaults to Season with the 2025 blend on", () => {
    render(
      <MatchupDataControls
        settings={DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS}
        onChange={() => {}}
      />
    );

    expect(screen.getByRole("tab", { name: "Season" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Last 5" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch")).toHaveTextContent(/ON/);
  });

  it("emits the typed sample settings the future pipeline will consume", () => {
    const onChange = vi.fn();
    render(
      <MatchupDataControls settings={DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS} onChange={onChange} />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Last 5" }));
    expect(onChange).toHaveBeenCalledWith({ window: "last5", includePriorSeason: true });

    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith({ window: "season", includePriorSeason: false });
  });

  it("describes the active sample rule without claiming a game count", () => {
    render(
      <MatchupDataControls settings={DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS} onChange={() => {}} />
    );
    expect(screen.getByText(/rolling eight-game sample/i)).toBeInTheDocument();
    // Phase 2: conventional stats now respond to the controls, while the
    // preseason power baseline in the hero deliberately does not.
    expect(screen.getByText(/conventional team stats respond to these controls/i)).toBeInTheDocument();
    expect(screen.getByText(/power baseline in the header is a separate preseason model/i)).toBeInTheDocument();
  });
});

describe("Offense and Defense comparisons", () => {
  it("surfaces the populated Joe Knows Ball baseline with real ranks", () => {
    renderWithRouter(
      <MatchupUnitComparison
        id="offense"
        matchup={MATCHUP}
        groups={OFFENSE_METRIC_GROUPS}
        resolver={unavailableMetricResolver}
        baselineLabel="JKB Offense Rating"
        baselineRank={(team) => team.offenseRank}
        baselineValue={(team) => team.offensePct}
      />
    );

    expect(screen.getByText("JKB Offense Rating")).toBeInTheDocument();
    expect(screen.getByText("+5.1%")).toBeInTheDocument();
    expect(screen.getByText("-6.7%")).toBeInTheDocument();
    // Offense ranks 9 and 24 come straight from the guide model.
    expect(screen.getByText("#9")).toBeInTheDocument();
    expect(screen.getByText("#24")).toBeInTheDocument();
  });

  it("renders every catalogued offense metric as N/A rather than inventing a value", () => {
    renderWithRouter(
      <MatchupUnitComparison
        id="offense"
        matchup={MATCHUP}
        groups={OFFENSE_METRIC_GROUPS}
        resolver={unavailableMetricResolver}
        baselineLabel="JKB Offense Rating"
        baselineRank={(team) => team.offenseRank}
        baselineValue={(team) => team.offensePct}
      />
    );

    const metricCount = OFFENSE_METRIC_GROUPS.reduce(
      (total, group) => total + group.metrics.length,
      0
    );
    // One "N/A" per team per metric — and nothing else populated.
    expect(screen.getAllByText("N/A")).toHaveLength(metricCount * 2);

    for (const group of OFFENSE_METRIC_GROUPS) {
      for (const metric of group.metrics) {
        expect(screen.getAllByText(metric.label).length, metric.label).toBeGreaterThan(0);
      }
    }
  });

  it("renders every catalogued defense metric as N/A, including Run Stop Win Rate", () => {
    renderWithRouter(
      <MatchupUnitComparison
        id="defense"
        matchup={MATCHUP}
        groups={DEFENSE_METRIC_GROUPS}
        resolver={unavailableMetricResolver}
        baselineLabel="JKB Defense Rating"
        baselineRank={(team) => team.defenseRank}
        baselineValue={(team) => team.defensePct}
      />
    );

    const metricCount = DEFENSE_METRIC_GROUPS.reduce(
      (total, group) => total + group.metrics.length,
      0
    );
    expect(screen.getAllByText("N/A")).toHaveLength(metricCount * 2);
    expect(screen.getAllByText("Run Stop Win Rate").length).toBeGreaterThan(0);
    expect(screen.queryByText("Run Block Win Rate")).toBeNull();
  });

  it("switches the visible subgroup on small screens via the segmented control", () => {
    renderWithRouter(
      <MatchupUnitComparison
        id="offense"
        matchup={MATCHUP}
        groups={OFFENSE_METRIC_GROUPS}
        resolver={unavailableMetricResolver}
        baselineLabel="JKB Offense Rating"
        baselineRank={(team) => team.offenseRank}
        baselineValue={(team) => team.offensePct}
      />
    );

    const overallTab = screen.getByRole("tab", { name: "Overall Offense" });
    const passingTab = screen.getByRole("tab", { name: "Passing" });
    expect(overallTab).toHaveAttribute("aria-selected", "true");

    fireEvent.click(passingTab);
    expect(passingTab).toHaveAttribute("aria-selected", "true");
    expect(overallTab).toHaveAttribute("aria-selected", "false");
  });
});

describe("Placeholder sections stay honest", () => {
  it("renders trenches with an explicit unavailable state and no fabricated win rates", () => {
    renderWithRouter(<MatchupTrenches matchup={MATCHUP} resolver={unavailableMetricResolver} />);

    // Phase 3B: the card stays visible and every battle reads N/A when the
    // ESPN artifact is absent.
    expect(screen.getAllByText("Pass Block vs Pass Rush")).toHaveLength(2);
    expect(screen.getAllByText("Run Block vs Run Stop")).toHaveLength(2);
    expect(screen.getAllByText("N/A")).toHaveLength(4);
    expect(screen.queryByText(/Sacks/i)).toBeNull();
  });

  it("renders injuries in an unavailable state when the artifact is not connected", () => {
    renderWithRouter(
      <MatchupInjuries
        matchup={MATCHUP}
        resolver={unavailableInjuryResolver}
        unavailableMessage="Injury report not connected."
      />
    );

    // Once for the section, not once per team — see MatchupInjuries.test.tsx.
    expect(screen.getAllByText(/injury report not connected/i)).toHaveLength(1);
    // No fabricated rows, and no derived number of any kind. "Impact" survives
    // only as the pre-existing section label, never as a computed value.
    expect(screen.queryByText(/total snaps/i)).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    for (const node of screen.getAllByText(/impact/i)) {
      expect(node.textContent?.trim()).toBe("Injury Impact");
    }
  });

  it("labels model-vs-market figures as season context, not matchup spread analysis", () => {
    renderWithRouter(<MatchupMarketProfile matchup={MATCHUP} />);

    expect(screen.getByText(/joe knows ball season context/i)).toBeInTheDocument();
    expect(screen.getByText(/describe the season, not this matchup/i)).toBeInTheDocument();
    expect(screen.getByText(/no projected line and no pick/i)).toBeInTheDocument();
    // The season win-total data that already exists is still shown.
    expect(screen.getByText("Model Projected Wins")).toBeInTheDocument();
    expect(screen.getByText("10.5")).toBeInTheDocument();
    expect(screen.getByText("7.5")).toBeInTheDocument();
  });
});

describe("Preserved model features", () => {
  it("still renders the derived Advantages for the matchup", () => {
    const advantages = deriveAdvantages(MATCHUP);
    expect(advantages.length).toBeGreaterThan(0);

    render(<MatchupAdvantages notes={advantages} />);
    for (const note of advantages) {
      expect(screen.getByText(note.text)).toBeInTheDocument();
    }
  });

  it("still renders the derived Things to Watch entries with severity tags", () => {
    const angles = deriveAngles(MATCHUP);
    expect(angles.length).toBeGreaterThan(0);

    render(<MatchupAngles angles={angles} />);
    for (const angle of angles) {
      expect(screen.getByText(angle.label)).toBeInTheDocument();
      expect(screen.getByText(angle.explanation)).toBeInTheDocument();
    }
  });

  it("uses the Things to Watch heading rather than Angles to Watch", () => {
    render(
      <MatchupSection id="things-to-watch">
        <p>body</p>
      </MatchupSection>
    );
    expect(screen.getByRole("heading", { name: "Things to Watch" })).toBeInTheDocument();
    expect(screen.queryByText(/angles to watch/i)).toBeNull();
  });
});

describe("Matchup hero", () => {
  /** Two teams' worth of generated v0.3.1 ratings. */
  const MODEL_RATINGS = (abbr: string) =>
    abbr === "ne"
      ? { rating: 65.74, rank: 5, offenseRating: 75.51, offenseRank: 3, defenseRating: 55.2, defenseRank: 11 }
      : abbr === "sea"
        ? { rating: 74.36, rank: 2, offenseRating: 55.51, offenseRank: 14, defenseRating: 85.16, defenseRank: 1 }
        : null;

  it("shows both team identities and real schedule context", () => {
    renderWithRouter(<MatchupHero matchup={MATCHUP} />);

    expect(screen.getByRole("link", { name: "New England Patriots" })).toHaveAttribute(
      "href",
      "/nfl/guide/team/new-england-patriots"
    );
    expect(screen.getByRole("link", { name: "Seattle Seahawks" })).toHaveAttribute(
      "href",
      "/nfl/guide/team/seattle-seahawks"
    );

    expect(screen.getByText("Lumen Field")).toBeInTheDocument();
    expect(screen.getByText("Week 1")).toBeInTheDocument();
    expect(screen.getByText("11-6")).toBeInTheDocument();
  });

  it("shows generated model ratings, not the retired static percentages", () => {
    renderWithRouter(<MatchupHero matchup={MATCHUP} modelRatings={MODEL_RATINGS} />);

    // Public-scale values, rendered to one decimal and never as a percentage.
    expect(screen.getByText("65.7")).toBeInTheDocument();
    expect(screen.getByText("74.4")).toBeInTheDocument();
    expect(screen.getByText("85.2")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
    // The hand-curated static ratings were signed percentages; none may remain.
    const heroText = screen.getByRole("region", { hidden: true }).textContent ?? document.body.textContent ?? "";
    expect(heroText).not.toMatch(/[+-]\d+\.\d+%/);
  });

  it("renders N/A rather than falling back to the static rating system", () => {
    // No resolver supplied: the hero must not silently read nflPreseason2026.
    renderWithRouter(<MatchupHero matchup={MATCHUP} />);
    // Three rating slots per team, plus the structural spread and game total.
    expect(screen.getAllByText("N/A")).toHaveLength(8);
  });

  it("shows the spread and total as unavailable rather than deriving them", () => {
    renderWithRouter(<MatchupHero matchup={MATCHUP} modelRatings={MODEL_RATINGS} />);
    // One N/A for the structural spread, one for the game total.
    expect(screen.getAllByText("N/A")).toHaveLength(2);
  });

  it("never shows a projected spread, win probability or pick in the hero", () => {
    const { container } = renderWithRouter(
      <MatchupHero matchup={MATCHUP} modelRatings={MODEL_RATINGS} />
    );
    expect(container.textContent).not.toMatch(
      /projected spread|win prob|model edge|picked winner|favou?rite to win/i
    );
  });
});
