/**
 * Build-time static prerender (SEO Phase 5A proof of concept).
 *
 *   npm run build   -> prebuild (seo:generate) -> vite build -> postbuild (this script)
 *
 * Renders the allow-listed routes in scripts/lib/prerender-routes.ts with
 * React's renderToString + StaticRouter over the app's own route tree
 * (src/entry-server.tsx) and writes dist/<route>/index.html with the route's
 * real head (title, description, canonical, robots, Open Graph, Twitter,
 * JSON-LD) and body markup. The browser entry still uses createRoot, which
 * replaces the prerendered #root on boot; nothing here hydrates.
 *
 * Safety properties, each enforced below rather than assumed:
 * - no network: global fetch/WebSocket/EventSource are replaced with recorders
 *   that throw, and any attempt fails the build;
 * - no browser globals and no analytics: rendering runs in plain Node, where
 *   renderToString executes neither effects nor <script> tags;
 * - no secrets: every document is scanned for server-only env values;
 * - no stale or duplicate metadata: every document is validated for exactly
 *   one title/canonical/og:url/robots/description and the expected JSON-LD.
 *
 * SPA fallback: Vite's original dist/index.html is first copied, byte for
 * byte, to dist/spa-fallback.html -- the target of vercel.json's catch-all
 * rewrite for every non-prerendered URL -- and only then is dist/index.html
 * replaced by the prerendered homepage. The copy happens before anything else,
 * including the PRERENDER_SKIP path, because the rewrite needs that file to
 * exist in every deploy. Re-running on an already-prerendered dist reuses the
 * preserved shell instead of copying the homepage over it.
 *
 * PRERENDER_SKIP=1 skips generation (logged loudly) so an unrelated data
 * deploy is never blocked by a prerender failure; the result is today's
 * SPA-only output (plus the fallback copy).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { createServer } from "vite";
import type { NflSeasonData, nflSeasonDataPaths, toNflSeasonData } from "../src/hooks/useNflSeasonData";
import type { CollectedSeo } from "../src/lib/seo/seoCollector";
import {
  PRERENDER_MARKER_ATTR,
  injectPrerenderedDocument,
  renderSeoHead,
  summarizeDocument,
  validateDocument,
  type DocumentSummary,
} from "./lib/prerender-html";
import { PRERENDER_ROUTES, SPA_FALLBACK_FILE, outputFileForRoute, type PrerenderRoute } from "./lib/prerender-routes";
import { findLeakedSecretNames } from "./lib/prerender-secrets";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");
const MIN_CONTENT_BODY_TEXT = 500;

/** The shape of src/entry-server.tsx, typed from .ts sources so the scripts typecheck needs no JSX. */
interface EntryServer {
  render(url: string, options?: { nflSeasons?: ReadonlyMap<number, NflSeasonData> }): { html: string; seo: CollectedSeo };
  nflSeasonDataPaths: typeof nflSeasonDataPaths;
  toNflSeasonData: typeof toNflSeasonData;
  CANONICAL_BASE: string;
}

const INDEX_PATH = resolve(DIST, "index.html");
const FALLBACK_PATH = resolve(DIST, SPA_FALLBACK_FILE);
const PRERENDER_MARKER = `${PRERENDER_MARKER_ATTR}="true"`;
const EMPTY_ROOT = '<div id="root"></div>';

/** Throws unless `html` is the untouched Vite SPA shell (no prerender marker, empty #root). */
function assertGenericShell(html: string, label: string): void {
  if (html.includes(PRERENDER_MARKER) || !html.includes(EMPTY_ROOT)) {
    throw new Error(`prerender: ${label} is not the generic SPA shell (marker or non-empty #root)`);
  }
}

/**
 * Ensures dist/spa-fallback.html holds Vite's original shell and returns it as
 * the injection template. First run: copy dist/index.html. Re-run on an
 * already-prerendered dist: the shell was preserved earlier; reuse it.
 */
function preserveSpaFallback(): string {
  const index = readFileSync(INDEX_PATH, "utf8");
  if (index.includes(PRERENDER_MARKER)) {
    if (!existsSync(FALLBACK_PATH)) throw new Error("prerender: dist/index.html is already prerendered but dist/spa-fallback.html is missing; rebuild");
    const preserved = readFileSync(FALLBACK_PATH, "utf8");
    assertGenericShell(preserved, SPA_FALLBACK_FILE);
    return preserved;
  }
  assertGenericShell(index, "dist/index.html");
  writeFileSync(FALLBACK_PATH, index, "utf8");
  return index;
}

type NetworkAttempt = { api: string; target: string };

/** Replaces every network entry point Node exposes globally; attempts are recorded and rejected. */
function installNetworkGuard(): NetworkAttempt[] {
  const attempts: NetworkAttempt[] = [];
  const block = (api: string) =>
    function blocked(target: unknown): never {
      const url = typeof target === "string" ? target : target instanceof URL ? target.href : String((target as { url?: string })?.url ?? target);
      attempts.push({ api, target: url });
      throw new Error(`prerender: network access is not allowed during render (${api} ${url})`);
    };
  const globals = globalThis as Record<string, unknown>;
  globals.fetch = block("fetch");
  for (const api of ["WebSocket", "EventSource", "XMLHttpRequest"]) {
    if (api in globals) globals[api] = block(api);
  }
  return attempts;
}

/** Analytics (gtag/dataLayer) and every page effect need these; plain Node has none of them. */
const BROWSER_GLOBALS = ["window", "document", "localStorage", "sessionStorage", "gtag", "dataLayer"] as const;

function assertNoBrowserGlobals(): void {
  const globals = globalThis as Record<string, unknown>;
  const present = BROWSER_GLOBALS.filter((name) => globals[name] !== undefined);
  if (present.length > 0) throw new Error(`prerender: browser globals present in the render environment: ${present.join(", ")}`);
}

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(resolve(DIST, `.${relative}`), "utf8"));
}

type SeasonJson = Parameters<typeof toNflSeasonData>[0];

/** The same three files the page fetches, read from this deployment's dist/data. */
function seasonSeed(entry: EntryServer, season: number): ReadonlyMap<number, NflSeasonData> {
  const paths = entry.nflSeasonDataPaths(season);
  const data = entry.toNflSeasonData(
    readJson(paths.teams) as SeasonJson,
    readJson(paths.games) as SeasonJson,
    readJson(paths.results) as SeasonJson,
  );
  return new Map([[season, data]]);
}

interface RouteReport {
  route: PrerenderRoute;
  written: boolean;
  file: string;
  bytes: number;
  ms: number;
  summary: DocumentSummary;
  problems: string[];
}

const USE_LAYOUT_EFFECT_SSR_WARNING = /useLayoutEffect does nothing on the server/;

/**
 * The seeded pass exists only to resolve SEO; its markup is discarded. React's
 * useLayoutEffect-on-server warning concerns hydrating that markup, so it is
 * irrelevant there and is condensed to one note. Every other console.error
 * still prints.
 */
function renderSeoOnly(entry: EntryServer, route: PrerenderRoute, season: number): CollectedSeo {
  const originalError = console.error;
  let condensed = 0;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && USE_LAYOUT_EFFECT_SSR_WARNING.test(args[0])) condensed += 1;
    else originalError(...args);
  };
  try {
    return entry.render(route.path, { nflSeasons: seasonSeed(entry, season) }).seo;
  } finally {
    console.error = originalError;
    if (condensed > 0) console.log(`  note ${route.path}: ${condensed} useLayoutEffect SSR warning(s) in the discarded SEO-only pass`);
  }
}

function renderRoute(entry: EntryServer, template: string, route: PrerenderRoute): RouteReport {
  const started = performance.now();
  const body = entry.render(route.path);
  const seo = route.seoSeed ? renderSeoOnly(entry, route, route.seoSeed.season) : body.seo;

  const problems: string[] = [];
  if (seo.pages.length !== 1) problems.push(`expected exactly one usePageSeo declaration, found ${seo.pages.length}`);
  const page = seo.pages[seo.pages.length - 1];
  let doc = "";
  if (page) {
    doc = injectPrerenderedDocument({ template, headHtml: renderSeoHead(page, seo.jsonLd), bodyHtml: body.html });
    problems.push(
      ...validateDocument(doc, {
        canonicalUrl: `${entry.CANONICAL_BASE}${route.path}`,
        title: route.expect.title,
        robots: route.expect.robots,
        jsonLdCount: route.expect.jsonLdCount,
      }),
    );
  }
  const summary = summarizeDocument(doc);
  if (route.expect.h1 && !summary.h1s.includes(route.expect.h1)) problems.push(`h1: expected "${route.expect.h1}", found ${JSON.stringify(summary.h1s)}`);
  if (route.body === "content" && summary.bodyTextLength < MIN_CONTENT_BODY_TEXT) problems.push(`body: only ${summary.bodyTextLength} chars of visible text`);
  const leaked = findLeakedSecretNames(doc);
  if (leaked.length > 0) problems.push(`server-only secret value(s) found in HTML for: ${leaked.join(", ")}`);

  const file = outputFileForRoute(route.path);
  if (problems.length === 0) {
    const target = resolve(DIST, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, doc, "utf8");
  }
  return { route, written: problems.length === 0, file, bytes: Buffer.byteLength(doc), ms: performance.now() - started, summary, problems };
}

function logReport(report: RouteReport): void {
  const { route, summary } = report;
  const where = report.written ? `dist/${report.file}` : "(not written)";
  console.log(
    `  ${report.problems.length ? "FAIL" : "ok  "} ${route.path} -> ${where} ${(report.bytes / 1024).toFixed(1)} KB, ${report.ms.toFixed(0)} ms, ` +
      `JSON-LD [${summary.jsonLdTypes.join(", ")}], h1 ${JSON.stringify(summary.h1s[0] ?? null)}, body text ${summary.bodyTextLength} chars`,
  );
  for (const problem of report.problems) console.error(`       - ${problem}`);
}

async function main(): Promise<void> {
  // First, unconditionally: vercel.json's catch-all rewrite serves this file.
  const template = preserveSpaFallback();

  if (process.env.PRERENDER_SKIP === "1") {
    console.warn("prerender: SKIPPED (PRERENDER_SKIP=1) -- dist contains only the SPA shell; no route-specific HTML was generated.");
    return;
  }
  const started = performance.now();
  let peakRss = process.memoryUsage().rss;
  const sampleMemory = () => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  };

  // Vite's SSR module loader compiles JSX with the development runtime
  // (jsxDEV), which only React's development build provides. Pin it so the
  // output never depends on whatever NODE_ENV the build environment sets.
  // Markup is identical to production React's; only dev warnings differ.
  process.env.NODE_ENV = "development";

  // Vite only transforms the app for Node here: no port, no HMR, no dep
  // pre-bundling, and production mode so dev-only plugins stay out of the markup.
  const vite = await createServer({
    root: ROOT,
    mode: "production",
    configFile: resolve(ROOT, "vite.config.ts"),
    appType: "custom",
    logLevel: "error",
    server: { middlewareMode: true, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });

  const attempts = installNetworkGuard();
  const reports: RouteReport[] = [];
  let importMs = 0;
  try {
    assertNoBrowserGlobals();
    const importStarted = performance.now();
    const entry = (await vite.ssrLoadModule("/src/entry-server.tsx")) as EntryServer;
    importMs = performance.now() - importStarted;
    sampleMemory();
    for (const route of PRERENDER_ROUTES) {
      reports.push(renderRoute(entry, template, route));
      sampleMemory();
    }
    assertNoBrowserGlobals();
  } finally {
    await vite.close();
  }

  const fallback = readFileSync(FALLBACK_PATH, "utf8");
  if (fallback !== template) throw new Error(`prerender: dist/${SPA_FALLBACK_FILE} changed during prerender`);
  assertGenericShell(fallback, SPA_FALLBACK_FILE);

  console.log(`prerender: ${reports.filter((r) => r.written).length}/${reports.length} route(s) written; SPA fallback preserved as dist/${SPA_FALLBACK_FILE}`);
  reports.forEach(logReport);
  console.log(
    `prerender: app import ${(importMs / 1000).toFixed(1)} s, total ${((performance.now() - started) / 1000).toFixed(1)} s, ` +
      `peak RSS ${(peakRss / 1024 / 1024).toFixed(0)} MB, network attempts ${attempts.length}`,
  );

  const failures = reports.filter((r) => r.problems.length > 0);
  if (attempts.length > 0) {
    for (const attempt of attempts) console.error(`prerender: blocked ${attempt.api} ${attempt.target}`);
  }
  if (failures.length > 0 || attempts.length > 0) {
    console.error("prerender: FAILED -- fix the problems above, or set PRERENDER_SKIP=1 to deploy the SPA shell only.");
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  console.error("prerender: FAILED -- set PRERENDER_SKIP=1 to deploy the SPA shell only.");
  process.exitCode = 1;
});
