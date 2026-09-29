/**
 * Phase 5A proof-of-concept allow-list for build-time prerendering.
 *
 * Deliberately tiny: it proves the pipeline, it is not the rollout. Every
 * other URL keeps today's behavior: vercel.json's catch-all rewrite serves the
 * untouched Vite shell, preserved as dist/spa-fallback.html (SPA_FALLBACK_FILE)
 * because dist/index.html becomes the prerendered homepage. Expectations are asserted on each generated document; a mismatch
 * fails the build rather than shipping wrong metadata.
 */
export type PrerenderBody =
  /** The rendered body is meaningful on its own (content from bundled data). */
  | "content"
  /** The body renders the page's own loading state; only the head is route-specific. */
  | "head-only";

export interface PrerenderRoute {
  path: string;
  body: PrerenderBody;
  /**
   * The route's SEO depends on NFL season data the page fetches after mount.
   * The head is resolved from a render seeded with the deployment's own
   * dist/data files; the body comes from an unseeded render, so it matches
   * the browser's first (loading) render and createRoot does not flash
   * content -> loading -> content.
   */
  seoSeed?: { kind: "nfl-season"; season: number };
  expect: {
    title: string;
    robots: string;
    /** JSON-LD blocks the page declares. */
    jsonLdCount: number;
    /** The route's <h1>, when its body is meaningful. */
    h1?: string;
  };
}

/**
 * dist-relative path of the generic SPA shell. vercel.json's catch-all rewrite
 * targets it; the prerender copies Vite's original index.html here before
 * writing the homepage into dist/index.html.
 */
export const SPA_FALLBACK_FILE = "spa-fallback.html";

const INDEX_FOLLOW = "index, follow, max-image-preview:large";

export const PRERENDER_ROUTES: readonly PrerenderRoute[] = [
  {
    path: "/",
    body: "content",
    expect: {
      title: "MLB Props, PGA Golf Models & Analytics | Joe Knows Ball",
      robots: INDEX_FOLLOW,
      jsonLdCount: 1,
      h1: "Select a League",
    },
  },
  {
    path: "/nfl/teams/buffalo-bills",
    body: "content",
    expect: {
      title: "Buffalo Bills 2026 Team Rankings, Stats & Schedule | Joe Knows Ball",
      robots: INDEX_FOLLOW,
      jsonLdCount: 2,
      h1: "Buffalo Bills",
    },
  },
  {
    path: "/college-football/team/alabama",
    body: "content",
    expect: {
      title: "Alabama Crimson Tide | College Football | Joe Knows Ball",
      robots: INDEX_FOLLOW,
      jsonLdCount: 0,
      h1: "Alabama Crimson Tide",
    },
  },
  {
    path: "/nfl",
    body: "head-only",
    expect: { title: "NFL Weekly Command Center | Joe Knows Ball", robots: INDEX_FOLLOW, jsonLdCount: 0 },
  },
  {
    path: "/nfl/matchups/2026/week-4/la-chargers-at-seattle-seahawks",
    body: "head-only",
    seoSeed: { kind: "nfl-season", season: 2026 },
    expect: {
      title: "LA Chargers at Seattle Seahawks — 2026 Week 4 Matchup | Joe Knows Ball",
      robots: INDEX_FOLLOW,
      jsonLdCount: 2,
    },
  },
];

/** dist-relative output file for a route: /a/b -> a/b/index.html. */
export function outputFileForRoute(path: string): string {
  if (!/^\/[a-z0-9/-]*$/.test(path) || path.includes("//") || path.includes("..")) {
    throw new Error(`prerender: refusing unsafe route path ${JSON.stringify(path)}`);
  }
  const trimmed = path.replace(/^\/+|\/+$/g, "");
  return trimmed ? `${trimmed}/index.html` : "index.html";
}
