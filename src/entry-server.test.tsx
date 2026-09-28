// @vitest-environment node
/**
 * The build-time prerender entry must render in plain Node: no window or
 * document, no network, no analytics. Season data for the seeded SEO pass is
 * read from public/data -- the same files the page fetches in the browser.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { nflSeasonDataPaths, render, toNflSeasonData } from "./entry-server";

const fetchSpy = vi.fn(() => {
  throw new Error("network access during prerender");
});

function publicJson(path: string) {
  return JSON.parse(readFileSync(resolve(__dirname, "..", "public", `.${path}`), "utf8"));
}

function seed2026() {
  const paths = nflSeasonDataPaths(2026);
  return new Map([[2026, toNflSeasonData(publicJson(paths.teams), publicJson(paths.games), publicJson(paths.results))]]);
}

const h1Of = (html: string) => html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1].replace(/<[^>]+>/g, "") ?? null;

beforeAll(() => {
  vi.stubGlobal("fetch", fetchSpy);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("entry-server render (Node, no browser)", () => {
  it("runs without browser globals", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
  });

  it("renders the Buffalo Bills team page with its content and one SEO declaration", () => {
    const { html, seo } = render("/nfl/teams/buffalo-bills");
    expect(h1Of(html)).toBe("Buffalo Bills");
    expect(seo.pages).toHaveLength(1);
    expect(seo.pages[0].title).toBe("Buffalo Bills 2026 Team Rankings, Stats & Schedule | Joe Knows Ball");
    expect(seo.pages[0].canonicalUrl).toBe("https://www.joeknowsball.com/nfl/teams/buffalo-bills");
    expect(seo.pages[0].metas.find((tag) => tag.key === "robots")?.content).toBe("index, follow, max-image-preview:large");
    expect(seo.pages[0].structuredData.map((item) => item["@type"])).toEqual(["SportsTeam", "BreadcrumbList"]);
  });

  it("renders the Alabama CFB team page from bundled data", () => {
    const { html, seo } = render("/college-football/team/alabama");
    expect(h1Of(html)).toBe("Alabama Crimson Tide");
    expect(seo.pages).toHaveLength(1);
    expect(seo.pages[0].canonicalUrl).toBe("https://www.joeknowsball.com/college-football/team/alabama");
  });

  it("renders /nfl with its static SEO and the page's own loading body", () => {
    const { seo } = render("/nfl");
    expect(seo.pages).toHaveLength(1);
    expect(seo.pages[0].title).toBe("NFL Weekly Command Center | Joe Knows Ball");
    expect(seo.pages[0].canonicalUrl).toBe("https://www.joeknowsball.com/nfl");
  });

  it("resolves matchup SEO only from the seeded pass; the unseeded body stays in the browser's loading state", () => {
    const url = "/nfl/matchups/2026/week-4/la-chargers-at-seattle-seahawks";
    const unseeded = render(url);
    expect(unseeded.html).toContain("Loading matchup…");
    expect(unseeded.seo.pages[0].title).toBe("NFL Weekly Matchup | Joe Knows Ball");

    const seeded = render(url, { nflSeasons: seed2026() });
    expect(seeded.seo.pages).toHaveLength(1);
    expect(seeded.seo.pages[0].title).toBe("LA Chargers at Seattle Seahawks — 2026 Week 4 Matchup | Joe Knows Ball");
    expect(seeded.seo.pages[0].canonicalUrl).toBe(`https://www.joeknowsball.com${url}`);
    expect(seeded.seo.pages[0].structuredData.map((item) => item["@type"])).toEqual(["SportsEvent", "BreadcrumbList"]);
  });

  it("renders the homepage with its WebSite schema", () => {
    const { html, seo } = render("/");
    expect(h1Of(html)).toBe("Select a League");
    expect(seo.pages[0].canonicalUrl).toBe("https://www.joeknowsball.com/");
    expect(seo.pages[0].structuredData.map((item) => item["@type"])).toEqual(["WebSite"]);
  });

  it("isolates renders: nothing collected for one route leaks into the next", () => {
    render("/nfl/teams/buffalo-bills");
    expect(render("/college-football/team/alabama").seo.pages).toHaveLength(1);
  });

  it("never attempted network access across every render above", () => {
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
