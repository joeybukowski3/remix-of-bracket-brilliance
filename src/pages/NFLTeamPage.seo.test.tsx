import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { getNflSeasonGuide } from "@/lib/nfl/guideData";
import { CANONICAL_BASE } from "@/hooks/usePageSeo";
import {
  NFL_TEAM_CANONICAL_ORIGIN,
  buildNflTeamIntro,
  buildNflTeamStructuredData,
  buildNflTeamTitle,
  nflTeamCanonicalUrl,
} from "@/lib/nfl/teamPageSeo";
import { nflTeamPath } from "@/lib/nfl/teamRoutes";
import NFLTeamGuide2026 from "@/pages/NFLTeamGuide2026";
import LegacyNflTeamRedirect from "@/pages/nfl/LegacyNflTeamRedirect";

// Heavy, data-fetching dashboard children are irrelevant to URL/metadata behavior.
vi.mock("@/components/nfl/NflTeamDashboardExtras", () => ({ default: () => <div data-testid="extras" /> }));
vi.mock("@/components/nfl/NflCoachOfYearCase", () => ({ default: () => null }));
vi.mock("@/components/nfl/team-dashboard/NflTeamModelTrendPanel", () => ({ default: () => null }));
vi.mock("@/components/nfl/NflTeamVsinPanels", () => ({
  NflTeamHeaderOdds: () => null,
  NflTeamStatsSidebar: () => null,
}));
vi.mock("@/hooks/useNflCurrentRating2026", () => ({ useNflCurrentRating2026: () => ({ data: null }) }));

const ROOT = resolve(__dirname, "../..");
const GUIDE = getNflSeasonGuide(2026)!;
const SAMPLE_SLUGS = ["buffalo-bills", "carolina-panthers", "dallas-cowboys", "la-rams", "ny-giants"];

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/nfl/teams/:teamSlug" element={<><NFLTeamGuide2026 /><LocationProbe /></>} />
        <Route path="/nfl/guide/team/:teamSlug" element={<LegacyNflTeamRedirect />} />
        <Route path="/nfl/guide" element={<><div data-testid="guide-index" /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>
  );
}

const canonicalHref = () => document.head.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null;
const robots = () => document.head.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null;
const jsonLd = () =>
  Array.from(document.head.querySelectorAll('script[type="application/ld+json"]')).map(
    (node) => JSON.parse(node.textContent ?? "{}") as Record<string, unknown>
  );

afterEach(() => cleanup());

describe("/nfl/teams/:teamSlug is the canonical, indexable team page", () => {
  it.each(SAMPLE_SLUGS)("renders %s with a self-referencing canonical, index robots and one H1", (slug) => {
    const team = GUIDE.teamBySlug.get(slug)!;
    renderAt(`/nfl/teams/${slug}`);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: team.teamName })).toBeTruthy();
    expect(document.title).toBe(`${team.teamName} 2026 Team Rankings, Stats & Schedule | Joe Knows Ball`);
    expect(canonicalHref()).toBe(`https://www.joeknowsball.com/nfl/teams/${slug}`);
    expect(robots()).toBe("index, follow, max-image-preview:large");
    expect(screen.getByTestId("nfl-team-intro").textContent).toContain(team.teamName);

    const sportsTeam = jsonLd().find((item) => item["@type"] === "SportsTeam");
    expect(sportsTeam).toMatchObject({ name: team.teamName, url: canonicalHref(), sport: "American Football" });
    expect(jsonLd().some((item) => item["@type"] === "BreadcrumbList")).toBe(true);
  });

  it("links division rivals to /nfl/teams/, never the legacy path", () => {
    renderAt("/nfl/teams/buffalo-bills");
    const teamLinks = Array.from(document.querySelectorAll("a[href]")).map((a) => a.getAttribute("href")!);
    expect(teamLinks.filter((href) => href.startsWith("/nfl/teams/"))).toHaveLength(4);
    expect(teamLinks.filter((href) => href.includes("/guide/team/"))).toEqual([]);
  });

  it("sends an unknown slug to /nfl/guide without ever exposing it as an indexable canonical", () => {
    renderAt("/nfl/teams/not-a-team");
    expect(screen.getByTestId("guide-index")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/nfl/guide");
    expect(canonicalHref() ?? "").not.toContain("not-a-team");
  });
});

describe("legacy /nfl/guide/team/:teamSlug", () => {
  it.each(SAMPLE_SLUGS)("client-redirects %s to the same team at /nfl/teams/", (slug) => {
    renderAt(`/nfl/guide/team/${slug}`);
    expect(screen.getByTestId("location").textContent).toBe(`/nfl/teams/${slug}`);
    expect(canonicalHref()).toBe(`https://www.joeknowsball.com/nfl/teams/${slug}`);
  });

  it("keeps query and hash (e.g. Coach of the Year deep links)", () => {
    renderAt("/nfl/guide/team/chicago-bears?ref=x#coach-of-year-case");
    expect(screen.getByTestId("location").textContent).toBe("/nfl/teams/chicago-bears?ref=x#coach-of-year-case");
  });

  it("forwards unknown slugs to the new route's safe handling (lands on /nfl/guide, no loop)", () => {
    renderAt("/nfl/guide/team/not-a-team");
    expect(screen.getByTestId("location").textContent).toBe("/nfl/guide");
  });

  it("is a permanent (301/308) server redirect in vercel.json", () => {
    const config = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")) as {
      redirects: Array<{ source: string; destination: string; permanent?: boolean }>;
    };
    expect(config.redirects).toContainEqual({
      source: "/nfl/guide/team/:teamSlug",
      destination: "/nfl/teams/:teamSlug",
      permanent: true,
    });
    // The destination must not itself match a redirect source (no loops/chains).
    expect(config.redirects.some((rule) => rule.source.startsWith("/nfl/teams"))).toBe(false);
  });
});

describe("team page SEO helpers", () => {
  it("canonical and path builders agree for every guide team", () => {
    expect(NFL_TEAM_CANONICAL_ORIGIN).toBe(CANONICAL_BASE);
    for (const team of GUIDE.teams) {
      expect(nflTeamCanonicalUrl(team.slug)).toBe(`https://www.joeknowsball.com${nflTeamPath(team.slug)}`);
      expect(buildNflTeamStructuredData(team)[0].url).toBe(nflTeamCanonicalUrl(team.slug));
      expect(buildNflTeamTitle(team)).toContain(team.teamName);
    }
  });

  it("omits market and schedule clauses when those figures are missing instead of inventing them", () => {
    const team = { ...GUIDE.teamBySlug.get("buffalo-bills")!, marketWinTotal: null, scheduleRank: null };
    const intro = buildNflTeamIntro(team);
    expect(intro).not.toContain("market win total");
    expect(intro).not.toContain("schedule #");
    expect(intro).not.toMatch(/null|undefined|NaN/);
  });
});

describe("no production code links to the legacy team path", () => {
  // Only the route declaration may name the legacy pattern; comments in the
  // redirect/route helpers document it.
  const ALLOWED = new Set(["src/AppRoutes.tsx", "src/lib/nfl/teamRoutes.ts", "src/pages/nfl/LegacyNflTeamRedirect.tsx"]);

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return sourceFiles(full);
      return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [full] : [];
    });
  }

  it("has zero /nfl/guide/team/ references outside the redirect", () => {
    const offenders = sourceFiles(join(ROOT, "src"))
      .map((file) => relative(ROOT, file).replace(/\\/g, "/"))
      .filter((file) => !ALLOWED.has(file))
      .filter((file) => /guide\/team\//.test(readFileSync(join(ROOT, file), "utf8")));
    expect(offenders).toEqual([]);
  });
});
