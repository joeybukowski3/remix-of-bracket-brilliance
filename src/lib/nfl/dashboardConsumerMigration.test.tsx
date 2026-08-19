import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { NFL_GUIDE_TEAMS, NFL_GUIDE_TEAM_BY_SLUG } from "@/lib/nfl/guide2026";
import { getNflSeasonGuide } from "@/lib/nfl/guideData";
import { getNflVsinGuideTeam } from "@/lib/nfl/vsinGuide2026";
import { getNflOffseasonProfile } from "@/data/nflOffseason2026";
import { NflTeamHeaderOdds, NflTeamStatsSidebar } from "@/components/nfl/NflTeamVsinPanels";
import NflCoachOfYearCase from "@/components/nfl/NflCoachOfYearCase";
import NflOffseasonSection from "@/components/nfl/team-dashboard/NflOffseasonSection";
import NflScheduleGameCard from "@/components/nfl/team-dashboard/NflScheduleGameCard";
import type { NflScheduleGame } from "@/lib/nfl/teamSchedule";

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));

const ROOT = resolve(__dirname, "../../..");
const GUIDE = getNflSeasonGuide(2026)!;
const CANONICAL = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/teams.json"), "utf-8")).teams as {
  slug: string;
  abbr: string;
}[];

describe("normalized composite fields match legacy exactly", () => {
  it("overallPct/offensePct/defensePct mirror ovrPct/offPct/defPct for all 32 teams", () => {
    for (const legacy of NFL_GUIDE_TEAMS) {
      const normalized = GUIDE.teamBySlug.get(legacy.slug)!;
      expect(normalized.overallPct).toBe(legacy.ovrPct);
      expect(normalized.offensePct).toBe(legacy.offPct);
      expect(normalized.defensePct).toBe(legacy.defPct);
    }
  });

  it("all normalized dashboard teams map to canonical teams with no duplicates", () => {
    const canonicalSlugs = new Set(CANONICAL.map((t) => t.slug));
    const slugs = GUIDE.teams.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(32);
    for (const slug of slugs) expect(canonicalSlugs.has(slug), slug).toBe(true);
  });
});

describe("VSiN panels on the normalized type", () => {
  const kc = GUIDE.teamBySlug.get("kansas-city-chiefs")!;

  it("render odds and sidebar when VSiN data exists", () => {
    const vsin = getNflVsinGuideTeam(kc.abbr);
    if (!vsin) return; // VSiN coverage is data-dependent; renders nothing when absent
    render(<NflTeamHeaderOdds team={kc} />);
    expect(screen.getByLabelText(`${kc.teamName} futures odds from the VSiN guide`)).toBeTruthy();
    render(<NflTeamStatsSidebar team={kc} />);
    expect(screen.getByLabelText(`${kc.teamName} 2025 statistics`)).toBeTruthy();
    expect(screen.getByText("External source")).toBeTruthy();
    expect(screen.getByText("Season 2025")).toBeTruthy();

    const firstStat = vsin.statistics.offense[0];
    expect(screen.getByText(firstStat.label)).toBeTruthy();
    expect(screen.getAllByText(firstStat.displayValue).length).toBeGreaterThan(0);
    expect(screen.getAllByText(`#${firstStat.rank}`).length).toBeGreaterThan(0);
  });

  it("fail gracefully (render nothing) when VSiN data is missing", () => {
    const ghost = { ...kc, abbr: "zzz", teamName: "Ghost Team" };
    const header = render(<NflTeamHeaderOdds team={ghost} />);
    expect(header.container.firstChild).toBeNull();
    const sidebar = render(<NflTeamStatsSidebar team={ghost} />);
    expect(sidebar.container.firstChild).toBeNull();
  });
});

describe("offseason provenance on the normalized type", () => {
  it("adds source metadata without changing curated personnel values", () => {
    const kc = GUIDE.teamBySlug.get("kansas-city-chiefs")!;
    const offseason = getNflOffseasonProfile(kc.abbr);

    render(<NflOffseasonSection team={kc} />);

    expect(screen.getByText("Editorial")).toBeTruthy();
    expect(screen.getByText("JoeKnowsBall offseason snapshot")).toBeTruthy();
    expect(screen.getByText("Season 2026")).toBeTruthy();
    expect(screen.getAllByText(offseason.headCoach2026).length).toBeGreaterThan(0);
    for (const move of [...offseason.additions, ...offseason.departures].slice(0, 3)) {
      expect(screen.getByText(move.player)).toBeTruthy();
    }
  });
});

describe("schedule game card on the normalized type", () => {
  it("computes the same offense/defense matchup edges the legacy shape produced (OFF/DEF sourcing unchanged)", () => {
    const team = GUIDE.teamBySlug.get("buffalo-bills")!;
    const legacyTeam = NFL_GUIDE_TEAM_BY_SLUG.get("buffalo-bills")!;
    const legacyOpponent = NFL_GUIDE_TEAM_BY_SLUG.get("miami-dolphins")!;
    const game: NflScheduleGame = {
      week: 1,
      opponentAbbr: "mia",
      opponentName: "Miami Dolphins",
      homeAway: "home",
      date: "2026-09-13T17:00:00Z",
      venue: "Highmark Stadium",
      status: "Scheduled",
      result: null,
    } as NflScheduleGame;
    render(
      <MemoryRouter>
        <NflScheduleGameCard team={team} game={game} fallbackWeek={1} restEdge={null} />
      </MemoryRouter>
    );
    expect(screen.getByText("Miami Dolphins")).toBeTruthy();
    const expectedOffenseEdge = legacyTeam.offPct - legacyOpponent.defPct;
    const rendered = `${expectedOffenseEdge > 0 ? "+" : ""}${expectedOffenseEdge.toFixed(1)}%`;
    expect(screen.getAllByText(rendered).length).toBeGreaterThan(0);
  });

  it("sources 'Opponent power' from the opponentOvr prop (universal current rating), never the legacy guide powerRank", () => {
    const team = GUIDE.teamBySlug.get("buffalo-bills")!;
    const legacyOpponent = NFL_GUIDE_TEAM_BY_SLUG.get("miami-dolphins")!;
    const game: NflScheduleGame = {
      week: 1,
      opponentAbbr: "mia",
      opponentName: "Miami Dolphins",
      homeAway: "home",
      date: "2026-09-13T17:00:00Z",
      venue: "Highmark Stadium",
      status: "Scheduled",
      result: null,
    } as NflScheduleGame;
    render(
      <MemoryRouter>
        <NflScheduleGameCard
          team={team}
          game={game}
          fallbackWeek={1}
          restEdge={null}
          opponentOvr={{ rating: 60.4, rank: 12 }}
        />
      </MemoryRouter>
    );
    expect(screen.getByText("#12")).toBeTruthy();
    expect(screen.getByText("60.4 overall")).toBeTruthy();
    // The legacy guide powerRank for Miami must not appear anywhere.
    expect(screen.queryByText(`#${legacyOpponent.powerRank}`)).toBeNull();
  });

  it("renders NR (not a fabricated rank) when opponentOvr is unavailable", () => {
    const team = GUIDE.teamBySlug.get("buffalo-bills")!;
    const game: NflScheduleGame = {
      week: 1,
      opponentAbbr: "mia",
      opponentName: "Miami Dolphins",
      homeAway: "home",
      date: "2026-09-13T17:00:00Z",
      venue: "Highmark Stadium",
      status: "Scheduled",
      result: null,
    } as NflScheduleGame;
    render(
      <MemoryRouter>
        <NflScheduleGameCard team={team} game={game} fallbackWeek={1} restEdge={null} />
      </MemoryRouter>
    );
    expect(screen.getByText("NR")).toBeTruthy();
    expect(screen.getByText("Unavailable")).toBeTruthy();
  });

  it("renders without matchup metrics for an unknown opponent (graceful)", () => {
    const team = GUIDE.teamBySlug.get("buffalo-bills")!;
    const game = {
      week: 2,
      opponentAbbr: "zzz",
      opponentName: "Mystery Team",
      homeAway: "away",
      date: null,
      venue: null,
      status: "TBD",
      result: null,
    } as unknown as NflScheduleGame;
    render(
      <MemoryRouter>
        <NflScheduleGameCard team={team} game={game} fallbackWeek={2} restEdge={null} />
      </MemoryRouter>
    );
    expect(screen.getByText("Mystery Team")).toBeTruthy();
    expect(screen.queryByText("Opponent power")).toBeNull();
  });
});

describe("Coach of the Year case on the normalized type", () => {
  it("renders (or renders nothing) identically based on abbr, unchanged output", () => {
    const no = GUIDE.teamBySlug.get("new-orleans-saints")!;
    const { container } = render(
      <MemoryRouter>
        <NflCoachOfYearCase team={no} />
      </MemoryRouter>
    );
    // The COY case component keys off abbr only; New Orleans has a case entry.
    expect(container.textContent).toContain("Coach of the Year");
  });
});

describe("legacy usage is fully retired from guide/dashboard consumers", () => {
  const CONSUMER_FILES = [
    "src/pages/NFLGuide2026.tsx",
    "src/pages/NFLTeamGuide2026.tsx",
    "src/pages/NFLRegression2026.tsx",
    "src/components/nfl/NflTeamDashboardExtras.tsx",
    "src/components/nfl/NflCoachOfYearCase.tsx",
    "src/components/nfl/NflTeamVsinPanels.tsx",
    "src/components/nfl/team-dashboard/NflScheduleGameCard.tsx",
    "src/components/nfl/team-dashboard/NflScheduleSection.tsx",
    "src/components/nfl/team-dashboard/NflOffseasonSection.tsx",
    "src/components/nfl/team-dashboard/NflMarketValueSection.tsx",
    "src/components/nfl/team-dashboard/NflWarrenSharpTeamProfile.tsx",
    "src/components/nfl/team-dashboard/NflWarrenSharpAdvancedMetrics.tsx",
  ];

  it("no guide page or dashboard component imports the legacy guide2026 module", () => {
    for (const file of CONSUMER_FILES) {
      const source = readFileSync(join(ROOT, file), "utf-8");
      expect(source, file).not.toContain('from "@/lib/nfl/guide2026"');
    }
  });

  it("no guide page or dashboard component reads power-ratings.json", () => {
    for (const file of CONSUMER_FILES) {
      const source = readFileSync(join(ROOT, file), "utf-8");
      expect(source, file).not.toMatch(/(import|from|fetch|readFile|require)[^\n]*power-ratings/);
    }
  });

  it("no betting-edge or public-pick language introduced", () => {
    for (const file of CONSUMER_FILES) {
      const source = readFileSync(join(ROOT, file), "utf-8");
      expect(source, file).not.toMatch(/bettingEdge|CLV|sportsbook|guaranteed win|lock of the|our picks page/i);
    }
  });
});
