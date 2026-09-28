import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { generateSitemaps } from "../../scripts/lib/seo-sitemap";
import { EXCLUDED_ROUTES } from "../../scripts/lib/seo-sitemap-routes";

/**
 * Cross-checks the sitemap against the real router and per-page robots policy:
 * every listed URL, rendered through <App />, must emit `index, follow` with a
 * canonical equal to its own sitemap URL, and every known excluded route must
 * be noindex, redirect, or canonicalize elsewhere. Data fetches never resolve,
 * so this exercises the metadata contract independently of data.
 */

const SITE = "https://www.joeknowsball.com";
const INDEX = "index, follow, max-image-preview:large";
const WAIT = { timeout: 10_000 };
const TEST_TIMEOUT = 20_000;

/**
 * Excluded although the page itself is indexable: a user-specific tool, and a
 * page with no canonical metadata. Not asserted to be noindex.
 */
const EDITORIAL_EXCLUSIONS = new Set(["/fantasy-football/start-sit", "/pga/the-open-2026-picks-best-bets-odds"]);

const { sections } = generateSitemaps();
const pathsOf = (file: string) => sections.find((section) => section.file === file)!.entries.map((entry) => entry.path);
const sample = <T,>(items: T[], count: number) =>
  items.filter((_, index) => index % Math.ceil(items.length / count) === 0);

const listedPaths = [
  ...pathsOf("sitemap-pages.xml"),
  ...pathsOf("sitemap-nfl.xml"),
  ...pathsOf("sitemap-nfl-teams.xml"),
  ...sample(pathsOf("sitemap-nfl-matchups.xml"), 8),
  ...pathsOf("sitemap-cfb.xml").filter((path) => !path.startsWith("/college-football/team/")),
  ...sample(pathsOf("sitemap-cfb.xml").filter((path) => path.startsWith("/college-football/team/")), 6),
];

function head() {
  return {
    robots: document.head.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null,
    canonical: document.head.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
  };
}

function renderAppAt(path: string) {
  window.history.pushState({}, "", path);
  render(<App />);
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
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.head.innerHTML = "";
  window.history.pushState({}, "", "/");
});

describe("every sitemap URL renders as indexable with a self-referencing canonical", () => {
  it.each(listedPaths)("%s", async (path) => {
    renderAppAt(path);
    const expected = path === "/" ? `${SITE}/` : `${SITE}${path}`;
    await waitFor(() => expect(head().canonical).toBe(expected), WAIT);
    expect(head().robots).toBe(INDEX);
    expect(window.location.pathname).toBe(path);
  }, TEST_TIMEOUT);
});

describe("known excluded routes are noindex, redirect, or canonicalize elsewhere", () => {
  const concrete = Object.keys(EXCLUDED_ROUTES).filter((rule) => !rule.endsWith("/*") && !EDITORIAL_EXCLUSIONS.has(rule));

  it.each(concrete)("%s", async (path) => {
    renderAppAt(path);
    await waitFor(() => {
      const { robots, canonical } = head();
      const isNoindex = Boolean(robots?.startsWith("noindex"));
      const redirected = window.location.pathname !== path;
      const canonicalElsewhere = canonical !== null && canonical !== `${SITE}${path}`;
      expect(isNoindex || redirected || canonicalElsewhere).toBe(true);
    }, WAIT);
  }, TEST_TIMEOUT);
});
