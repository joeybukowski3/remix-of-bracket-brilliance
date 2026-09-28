import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { generateSitemaps } from "./seo-sitemap";
import { EXCLUDED_ROUTES } from "./seo-sitemap-routes";
import { outputFileForRoute, PRERENDER_ROUTES, SPA_FALLBACK_FILE } from "./prerender-routes";

const sitemapPaths = () =>
  new Set(generateSitemaps().sections.flatMap((section) => section.entries.map((entry) => entry.path)));

type VercelConfig = { rewrites?: Array<{ source: string; destination: string }> };
const vercelConfig = (): VercelConfig => JSON.parse(readFileSync(resolve(__dirname, "..", "..", "vercel.json"), "utf8"));

describe("Phase 5A prerender allow-list", () => {
  it("is exactly the approved proof-of-concept routes", () => {
    expect(PRERENDER_ROUTES.map((route) => route.path)).toEqual([
      "/",
      "/nfl/teams/buffalo-bills",
      "/college-football/team/alabama",
      "/nfl",
      "/nfl/matchups/2026/week-4/la-chargers-at-seattle-seahawks",
    ]);
  });

  it("only prerenders indexable sitemap URLs, never excluded ones", () => {
    const inSitemap = sitemapPaths();
    for (const route of PRERENDER_ROUTES) {
      expect(inSitemap.has(route.path), route.path).toBe(true);
      expect(EXCLUDED_ROUTES[route.path], route.path).toBeUndefined();
    }
  });

  it("maps routes to directory index files (the homepage to dist/index.html) and rejects unsafe paths", () => {
    expect(outputFileForRoute("/")).toBe("index.html");
    expect(outputFileForRoute("/nfl/teams/buffalo-bills")).toBe("nfl/teams/buffalo-bills/index.html");
    expect(outputFileForRoute("/nfl")).toBe("nfl/index.html");
    for (const unsafe of ["/../etc", "/a//b", "/A", "/a?b", "nfl"]) expect(() => outputFileForRoute(unsafe)).toThrow();
  });

  it("never writes a route over the SPA fallback", () => {
    expect(PRERENDER_ROUTES.map((route) => outputFileForRoute(route.path))).not.toContain(SPA_FALLBACK_FILE);
  });
});

describe("vercel.json catch-all rewrite", () => {
  it("serves the preserved SPA shell, not the prerendered homepage", () => {
    expect(vercelConfig().rewrites).toEqual([{ source: "/:path*", destination: `/${SPA_FALLBACK_FILE}` }]);
  });
});
