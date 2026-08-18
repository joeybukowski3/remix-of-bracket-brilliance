/**
 * K props market-data acquisition, ported verbatim from
 * post-mlb-strikeout-props-to-x.mjs's scrapeKPageRows/dedupe/filter pipeline.
 *
 * Unlike HR (public/data/mlb/hr-props-raw.json, a plain fetch), there is no
 * server-side JSON artifact carrying K market lines/odds/projections -- the K
 * props table is assembled client-side on the live page. A Playwright scrape
 * of the live production page is therefore the only source of this data.
 *
 * This is a deliberate, flagged exception to "the planner must not launch a
 * browser": the alternative would be reimplementing the page's projection
 * math server-side, which risks silently diverging from the model
 * calculation the constraint exists to protect. It remains far lighter than
 * the legacy poster's full sequence -- no local Vite build, no Playwright
 * *install* step here (the workflow's browser setup is shared), scraping the
 * LIVE production site rather than a locally rendered export route.
 *
 * The legacy poster script is intentionally left untouched and keeps its own
 * copy of this logic; this module exists so the new planner does not have to
 * import a CLI entry point (which would execute its own main()) to get it.
 */
import { dedupeScrapedKRows, filterEligibleKRows } from "./mlb-k-social-eligibility.mjs";
import { createAnalyticsBlockingPage } from "./playwright-analytics-blocking.mjs";

export const STRIKEOUT_PROPS_URL = "https://www.joeknowsball.com/mlb";
const PAGE_EXPORT_SELECTOR = '[data-x-export="mlb-k-social"]';
const ROW_SELECTOR = "[data-k-row]";
const K_TAB_LABEL = "K Props";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTeam(value) {
  return normalizeText(value).toUpperCase();
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Acquires K page data without allowing a browser or scrape failure to abort
 * planning for the independent HR market.
 */
export async function acquireKPageData({
  launchBrowser,
  scrape = scrapeKPageRows,
  viewport = { width: 1080, height: 1400 },
} = {}) {
  let browser = null;
  try {
    browser = await launchBrowser();
    const page = await createAnalyticsBlockingPage(browser, { viewport, deviceScaleFactor: 1 });
    page.setDefaultTimeout(60000);
    const pageData = await scrape(page);
    return { available: true, pageData, error: null };
  } catch (error) {
    return { available: false, pageData: null, error };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

/** Scrapes the live K table for market/projection data. Requires a Playwright page. */
export async function scrapeKPageRows(page, { url = STRIKEOUT_PROPS_URL } = {}) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  try {
    const tab = page.locator(`button:has-text("${K_TAB_LABEL}")`).first();
    await tab.scrollIntoViewIfNeeded({ timeout: 8000 });
    await tab.click({ timeout: 8000 });
  } catch {
    const fallbackTab = page.locator(`button:text-is("🎯 K Props")`).first();
    await fallbackTab.scrollIntoViewIfNeeded({ timeout: 5000 });
    await fallbackTab.click({ timeout: 5000 });
  }
  await page.waitForTimeout(500);

  const exportTarget = page.locator(PAGE_EXPORT_SELECTOR).first();
  await exportTarget.waitFor({ state: "visible", timeout: 15000 });
  const meta = await exportTarget.evaluate((el) => ({
    date: el.getAttribute("data-k-date") || "",
    generatedAt: el.getAttribute("data-k-generated-at") || "",
  }));

  const rowLocators = exportTarget.locator(ROW_SELECTOR);
  const rowCount = await rowLocators.count();
  const rows = [];
  for (let i = 0; i < rowCount; i++) {
    const data = await rowLocators.nth(i).evaluate((el) => ({
      pitcher: el.getAttribute("data-k-pitcher") || "",
      team: el.getAttribute("data-k-team") || "",
      opponent: el.getAttribute("data-k-opponent") || "",
      gameId: el.getAttribute("data-k-game-id") || "",
      line: el.getAttribute("data-k-line") || "",
      oddsOver: el.getAttribute("data-k-odds-over") || "",
      oddsUnder: el.getAttribute("data-k-odds-under") || "",
      bookmaker: el.getAttribute("data-k-bookmaker") || "",
      status: el.getAttribute("data-k-status") || "",
      side: el.getAttribute("data-k-side") || "",
      projectedKs: el.getAttribute("data-k-projected-ks") || "",
      projectionEdge: el.getAttribute("data-k-projection-edge") || "",
      projectedIP: el.getAttribute("data-k-projected-ip") || "",
      strikeoutScore: el.getAttribute("data-k-score") || "",
      legacyProjectedKs: el.getAttribute("data-k-legacy-projected-ks") || "",
      v2ProjectedKs: el.getAttribute("data-k-v2-projected-ks") || "",
      projectionSource: el.getAttribute("data-k-projection-source") || "",
      projectionFallbackReason: el.getAttribute("data-k-projection-fallback-reason") || "",
      v2Confidence: el.getAttribute("data-k-v2-confidence") || "",
    }));
    rows.push({
      pitcher: normalizeText(data.pitcher),
      team: normalizeTeam(data.team),
      opponent: normalizeTeam(data.opponent),
      // Canonical numeric MLB gamePk, passed through from PitcherStrikeoutTeamRow.gameId
      // via the [data-k-game-id] DOM attribute -- doubleheader-safe. Null when the page
      // could not resolve one (never fabricated); resolveKRowFacts falls back to the
      // unique team+opponent lookup in that case.
      gameId: toFiniteNumber(data.gameId),
      kLine: toFiniteNumber(data.line),
      oddsOver: normalizeText(data.oddsOver) || null,
      oddsUnder: normalizeText(data.oddsUnder) || null,
      bookmaker: normalizeText(data.bookmaker) || null,
      status: normalizeText(data.status) || null,
      direction: normalizeText(data.side) || null,
      projectedKs: toFiniteNumber(data.projectedKs),
      projectionEdge: toFiniteNumber(data.projectionEdge),
      projectedIP: toFiniteNumber(data.projectedIP),
      strikeoutScore: toFiniteNumber(data.strikeoutScore),
      // Resolution provenance, scraped alongside the projection it explains
      // so the frozen edition plan records WHICH projection was posted, not
      // just its value. Never used to re-select, re-rank or recompute.
      legacyProjectedKs: toFiniteNumber(data.legacyProjectedKs),
      v2ProjectedKs: toFiniteNumber(data.v2ProjectedKs),
      projectionSource: normalizeText(data.projectionSource) || null,
      projectionFallbackReason: normalizeText(data.projectionFallbackReason) || null,
      v2Confidence: normalizeText(data.v2Confidence) || null,
    });
  }

  const { rows: dedupedRows } = dedupeScrapedKRows(rows);
  const { eligibleRows } = filterEligibleKRows(dedupedRows);
  return { date: meta.date, generatedAt: meta.generatedAt, rows: eligibleRows };
}
