import { cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NFL from "@/pages/NFL";
import NFLPowerRatings from "@/pages/NFLPowerRatings";
import NFLStandings from "@/pages/NFLStandings";
import NFLSchedule from "@/pages/NFLSchedule";
import NFLMatchups from "@/pages/NFLMatchups";
import NFLTeamSchedules from "@/pages/NFLTeamSchedules";
import NFLDfsContestAnalyzer from "@/pages/nfl/NFLDfsContestAnalyzer";
import PgaHistoryModel from "@/pages/PgaHistoryModel";
import PgaCustom from "@/pages/PgaCustom";
import PgaDfsUpload from "@/pages/PgaDfsUpload";
import PublicBetting from "@/pages/PublicBetting";
import WorldCupAnalyzer from "@/pages/WorldCupAnalyzer";
import MLBPercentileDemo from "@/pages/MLBPercentileDemo";
import MlbHrPropsXExport from "@/pages/MlbHrPropsXExport";
import MlbStrikeoutPropsXExport from "@/pages/MlbStrikeoutPropsXExport";
import MlbNumerologyXExport from "@/pages/MlbNumerologyXExport";
import ComingSoon from "@/pages/ComingSoon";
import NotFound from "@/pages/NotFound";
import StevePoolDashboard from "@/pages/StevePoolDashboard";
import HomeHeroOnly from "@/pages/HomeHeroOnly";
import CollegeFootballTeamPage from "@/pages/cfb/CollegeFootballTeamPage";
import CollegeFootballConference from "@/pages/cfb/CollegeFootballConference";
import CollegeFootballMatchup from "@/pages/cfb/CollegeFootballMatchup";
import { getAllTeams } from "@/data/cfb";
import { CFB_CONFERENCES } from "@/data/cfb/conferences";

/**
 * Browser-rendered robots/canonical behavior per route, using the real
 * usePageSeo hook. Data fetches never resolve: every page emits its metadata
 * on first render, so this checks the SEO contract independently of data.
 */

const SITE = "https://www.joeknowsball.com";
const INDEX = "index, follow, max-image-preview:large";
const NOINDEX = "noindex, follow";

function headState() {
  return {
    title: document.title,
    description: document.head.querySelector('meta[name="description"]')?.getAttribute("content") ?? null,
    robots: document.head.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null,
    canonical: document.head.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
  };
}

function renderAt(pattern: string, url: string, element: ReactElement) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path={pattern} element={element} />
          <Route path="*" element={<p>redirected</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return headState();
}

beforeEach(() => {
  document.head.innerHTML = "";
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.head.innerHTML = "";
});

describe("core NFL pages are indexable with a self-referencing canonical", () => {
  const cases: Array<[string, ReactElement]> = [
    ["/nfl", <NFL />],
    ["/nfl/power-ratings", <NFLPowerRatings />],
    ["/nfl/standings", <NFLStandings />],
    ["/nfl/schedule", <NFLSchedule />],
    ["/nfl/matchups", <NFLMatchups />],
  ];

  it.each(cases)("%s", (path, element) => {
    const state = renderAt(path, path, element);
    expect(state.robots).toBe(INDEX);
    expect(state.canonical).toBe(`${SITE}${path}`);
  });

  it("the ?week= state of /nfl/matchups canonicalizes to the main route", () => {
    const state = renderAt("/nfl/matchups", "/nfl/matchups?week=2", <NFLMatchups />);
    expect(state.robots).toBe(INDEX);
    expect(state.canonical).toBe(`${SITE}/nfl/matchups`);
  });
});

describe("NFL power ratings has page-specific metadata", () => {
  it("describes the 2026 power ratings page, not the old generic placeholder", () => {
    const state = renderAt("/nfl/power-ratings", "/nfl/power-ratings", <NFLPowerRatings />);
    expect(state.title).toBe("2026 NFL Power Ratings | Joe Knows Ball");
    expect(state.description).toMatch(/power ratings for all 32 NFL teams/i);
    expect(state.title).not.toMatch(/Analytics & Betting Models/);
    expect(state.description).not.toMatch(/coming soon/i);
  });
});

describe("pages that previously lacked or misassigned metadata", () => {
  it("/pga emits its own metadata", () => {
    const state = renderAt("/pga", "/pga", <PgaHistoryModel />);
    expect(state.title).toMatch(/^PGA Tour/);
    expect(state.canonical).toBe(`${SITE}/pga`);
    expect(state.robots).toBe(INDEX);
  });

  it("/odds-tracker canonicalizes to itself (not /) and is noindex", () => {
    const state = renderAt("/odds-tracker", "/odds-tracker", <PublicBetting />);
    expect(state.canonical).toBe(`${SITE}/odds-tracker`);
    expect(state.canonical).not.toBe(`${SITE}/`);
    expect(state.robots).toBe(NOINDEX);
  });
});

describe("intentional internal / tool / duplicate surfaces stay noindex", () => {
  const cases: Array<[string, string, string, ReactElement]> = [
    ["/nfl/dfs", "/nfl/dfs", "/nfl/dfs", <NFLDfsContestAnalyzer />],
    // Canonical is the bare route until the team list loads; noindex either way.
    ["/nfl/team-schedules/:teamSlug", "/nfl/team-schedules/buffalo-bills", "/nfl/team-schedules", <NFLTeamSchedules />],
    ["/pga/custom", "/pga/custom", "/pga/custom", <PgaCustom />],
    ["/pga/dfs", "/pga/dfs", "/pga/dfs", <PgaDfsUpload />],
    ["/world-cup/analyzer", "/world-cup/analyzer?a=bra&b=esp", "/world-cup/analyzer", <WorldCupAnalyzer />],
    ["/mlb-demo", "/mlb-demo", "/mlb-demo", <MLBPercentileDemo />],
    ["/mlb/hr-props/x-export", "/mlb/hr-props/x-export?d=payload", "/mlb/hr-props/x-export", <MlbHrPropsXExport />],
    ["/mlb/strikeout-props/x-export", "/mlb/strikeout-props/x-export?d=payload", "/mlb/strikeout-props/x-export", <MlbStrikeoutPropsXExport />],
    ["/mlb/numerology/x-export", "/mlb/numerology/x-export", "/mlb/numerology/x-export", <MlbNumerologyXExport />],
    ["/nba", "/nba", "/nba", <ComingSoon sport="NBA" />],
    ["/ncaa", "/ncaa", "/ncaa", <ComingSoon sport="NCAA Football" seoPage="ncaa" />],
    ["/steve", "/steve", "/steve", <StevePoolDashboard />],
  ];

  it.each(cases)("%s", (pattern, url, canonicalPath, element) => {
    const state = renderAt(pattern, url, element);
    // /steve additionally opts into nofollow.
    expect(state.robots).toMatch(/^noindex, (no)?follow$/);
    // Query payloads never leak into the canonical URL.
    expect(state.canonical).toBe(`${SITE}${canonicalPath}`);
  });
});

describe("invalid / not-found states are noindex", () => {
  it("global NotFound", () => {
    expect(renderAt("*", "/definitely-not-a-route", <NotFound />).robots).toBe(NOINDEX);
  });

  it("invalid CFB team is noindex; a real team is indexable", () => {
    expect(renderAt("/college-football/team/:teamSlug", "/college-football/team/not-a-team", <CollegeFootballTeamPage />).robots).toBe(NOINDEX);
    cleanup();
    const slug = getAllTeams()[0].slug;
    expect(renderAt("/college-football/team/:teamSlug", `/college-football/team/${slug}`, <CollegeFootballTeamPage />).robots).toBe(INDEX);
  });

  it("invalid CFB conference is noindex; a real conference is indexable", () => {
    expect(renderAt("/college-football/conference/:conferenceSlug", "/college-football/conference/not-a-conference", <CollegeFootballConference />).robots).toBe(NOINDEX);
    cleanup();
    const slug = Object.values(CFB_CONFERENCES)[0].slug;
    expect(renderAt("/college-football/conference/:conferenceSlug", `/college-football/conference/${slug}`, <CollegeFootballConference />).robots).toBe(INDEX);
  });

  it("invalid CFB matchup is noindex", () => {
    expect(renderAt("/college-football/matchup/:gameId", "/college-football/matchup/not-a-game", <CollegeFootballMatchup />).robots).toBe(NOINDEX);
  });
});

describe("homepage structured data", () => {
  it("keeps the WebSite schema without a SearchAction pointing at a nonexistent /search route", () => {
    renderAt("/", "/", <HomeHeroOnly />);
    const schemas = Array.from(document.head.querySelectorAll('script[type="application/ld+json"]')).map((node) =>
      JSON.parse(node.textContent ?? "{}")
    );
    const website = schemas.find((schema) => schema["@type"] === "WebSite");
    expect(website).toMatchObject({ "@type": "WebSite", name: "Joe Knows Ball", url: SITE });
    expect(website).not.toHaveProperty("potentialAction");
    expect(JSON.stringify(schemas)).not.toContain("/search");
  });
});
