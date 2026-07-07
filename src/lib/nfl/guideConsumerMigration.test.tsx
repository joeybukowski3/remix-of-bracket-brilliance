import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  NFL_GUIDE_BOUNCE_BACKS,
  NFL_GUIDE_DIVISIONS,
  NFL_GUIDE_PLAYOFFS,
  NFL_GUIDE_SUPER_BOWL_PICK,
  NFL_GUIDE_TEAM_BY_SLUG,
  NFL_GUIDE_TOP_MARKET_EDGES,
} from "@/lib/nfl/guide2026";
import { getLegacyGuideTeamBySlug, getNflSeasonGuide } from "@/lib/nfl/guideData";
import NFLGuide2026 from "@/pages/NFLGuide2026";
import NFLTeamGuide2026 from "@/pages/NFLTeamGuide2026";
import NFLRegression2026 from "@/pages/NFLRegression2026";

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));
vi.mock("@/components/nfl/NflGuideNav", () => ({ default: () => <nav /> }));
vi.mock("@/components/nfl/NflTeamDashboardExtras", () => ({
  default: ({ team }: { team: { abbr: string } }) => <div data-testid="extras" data-abbr={team.abbr} />,
}));
vi.mock("@/components/nfl/NflCoachOfYearCase", () => ({
  default: ({ team }: { team: { abbr: string } }) => <div data-testid="coy" data-abbr={team.abbr} />,
}));
vi.mock("@/components/nfl/NflTeamVsinPanels", () => ({
  NflTeamHeaderOdds: ({ team }: { team: { abbr: string } }) => <div data-testid="header-odds" data-abbr={team.abbr} />,
  NflTeamStatsSidebar: ({ team }: { team: { abbr: string } }) => <div data-testid="sidebar" data-abbr={team.abbr} />,
}));

const ROOT = resolve(__dirname, "../../..");
const GUIDE = getNflSeasonGuide(2026)!;

function renderTeamRoute(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/nfl/guide/team/${slug}`]}>
      <Routes>
        <Route path="/nfl/guide/team/:teamSlug" element={<NFLTeamGuide2026 />} />
        <Route path="/nfl/guide" element={<div data-testid="guide-index-redirect" />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("/nfl/guide renders from normalized data", () => {
  it("renders the Super Bowl pick, division cards and market edges", () => {
    render(
      <MemoryRouter>
        <NFLGuide2026 />
      </MemoryRouter>
    );
    expect(screen.getAllByText(NFL_GUIDE_SUPER_BOWL_PICK.team).length).toBeGreaterThan(0);
    // 8 division cards, each with 4 team links to /nfl/guide/team/<slug>
    const links = document.querySelectorAll('a[href^="/nfl/guide/team/"]');
    expect(links.length).toBeGreaterThanOrEqual(32);
    expect(screen.getByText("Fluke, real, or mispriced?")).toBeTruthy();
  });
});

describe("/nfl/guide/team/:teamSlug renders from normalized data", () => {
  for (const slug of ["kansas-city-chiefs", "buffalo-bills", "washington-commanders", "la-rams"]) {
    it(`resolves ${slug} with identical legacy values`, () => {
      const legacy = NFL_GUIDE_TEAM_BY_SLUG.get(slug)!;
      renderTeamRoute(slug);
      expect(screen.getByRole("heading", { level: 1, name: legacy.team })).toBeTruthy();
      expect(screen.getAllByText(legacy.headline).length).toBeGreaterThan(0);
      expect(screen.getByText(legacy.record2025)).toBeTruthy();
      expect(screen.getAllByText(legacy.projectedWins.toFixed(1)).length).toBeGreaterThan(0);
      // Deep dashboard children still receive the legacy team object.
      expect(screen.getByTestId("extras").getAttribute("data-abbr")).toBe(legacy.abbr);
      expect(screen.getByTestId("sidebar").getAttribute("data-abbr")).toBe(legacy.abbr);
      document.body.innerHTML = "";
    });
  }

  it("redirects unknown slugs to /nfl/guide (existing behavior)", () => {
    renderTeamRoute("los-angeles-rams");
    expect(screen.getByTestId("guide-index-redirect")).toBeTruthy();
  });
});

describe("/nfl/guide/regression renders from normalized data", () => {
  it("renders all 32 team rows", () => {
    render(
      <MemoryRouter>
        <NFLRegression2026 />
      </MemoryRouter>
    );
    const links = document.querySelectorAll('a[href^="/nfl/guide/team/"]');
    expect(links.length).toBe(32);
  });
});

describe("normalized derived collections match legacy ordering exactly", () => {
  it("divisions, market edges, playoffs and signals mirror guide2026", () => {
    expect(GUIDE.divisions.map((d) => d.division)).toEqual(NFL_GUIDE_DIVISIONS.map((d) => d.division));
    for (let i = 0; i < GUIDE.divisions.length; i += 1) {
      expect(GUIDE.divisions[i].teams.map((t) => t.slug)).toEqual(NFL_GUIDE_DIVISIONS[i].teams.map((t) => t.slug));
    }
    expect(GUIDE.topMarketEdges.map((t) => t.slug)).toEqual(NFL_GUIDE_TOP_MARKET_EDGES.map((t) => t.slug));
    expect(GUIDE.superBowlPick.slug).toBe(NFL_GUIDE_SUPER_BOWL_PICK.slug);
    expect(GUIDE.bounceBacks.map((t) => t.slug)).toEqual(NFL_GUIDE_BOUNCE_BACKS.map((t) => t.slug));
    for (const conference of ["AFC", "NFC"] as const) {
      expect(GUIDE.playoffProjection[conference].divisionWinners.map((t) => t.slug)).toEqual(
        NFL_GUIDE_PLAYOFFS[conference].divisionWinners.map((t) => t.slug)
      );
      expect(GUIDE.playoffProjection[conference].wildCards.map((t) => t.slug)).toEqual(
        NFL_GUIDE_PLAYOFFS[conference].wildCards.map((t) => t.slug)
      );
      expect(GUIDE.playoffProjection[conference].conferenceChampion.slug).toBe(
        NFL_GUIDE_PLAYOFFS[conference].conferenceChampion.slug
      );
    }
  });

  it("normalized color matches the legacy team color for all 32 teams", () => {
    for (const team of GUIDE.teams) {
      expect(team.color).toBe(NFL_GUIDE_TEAM_BY_SLUG.get(team.slug)!.color);
    }
  });
});

describe("compatibility adapter", () => {
  it("returns the exact same object guide2026 exposes for every slug", () => {
    for (const [slug, legacy] of NFL_GUIDE_TEAM_BY_SLUG) {
      expect(getLegacyGuideTeamBySlug(slug)).toBe(legacy);
    }
    expect(getLegacyGuideTeamBySlug("not-a-team")).toBeUndefined();
  });
});

describe("safety", () => {
  it("guide pages and data modules do not import or read power-ratings.json", () => {
    const files = [
      "src/pages/NFLGuide2026.tsx",
      "src/pages/NFLTeamGuide2026.tsx",
      "src/pages/NFLRegression2026.tsx",
      "src/lib/nfl/guideData.ts",
      "src/lib/nfl/guideLabels.ts",
      "src/lib/nfl/guide2026.ts",
    ];
    for (const file of files) {
      const source = readFileSync(join(ROOT, file), "utf-8");
      expect(source, file).not.toMatch(/(import|from|fetch|readFile|require)[^\n]*power-ratings/);
    }
  });

  it("migrated pages introduce no betting-edge language", () => {
    for (const file of ["src/pages/NFLGuide2026.tsx", "src/pages/NFLTeamGuide2026.tsx", "src/pages/NFLRegression2026.tsx"]) {
      const source = readFileSync(join(ROOT, file), "utf-8");
      expect(source, file).not.toMatch(/bettingEdge|CLV|sportsbook|guaranteed win|lock of the/i);
    }
  });
});
