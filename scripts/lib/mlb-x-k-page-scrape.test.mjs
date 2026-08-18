import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { acquireKPageData, scrapeKPageRows } from "./mlb-x-k-page-scrape.mjs";

const PAGE_EXPORT_SELECTOR = '[data-x-export="mlb-k-social"]';
const ROW_SELECTOR = "[data-k-row]";

function fakeElement(attrs) {
  return { getAttribute: (name) => attrs[name] ?? null };
}

/**
 * Minimal fake of the subset of the Playwright `page` API scrapeKPageRows
 * calls, so its DOM-attribute-extraction logic can be unit tested without a
 * real browser. `metaAttrs` becomes the `[data-x-export="mlb-k-social"]`
 * root element; `rowAttrsList` becomes the `[data-k-row]` elements in order.
 */
function fakePage({ metaAttrs, rowAttrsList }) {
  const rootEl = fakeElement(metaAttrs);
  const rowEls = rowAttrsList.map(fakeElement);
  const rowLocator = {
    async count() {
      return rowEls.length;
    },
    nth(i) {
      return { async evaluate(fn) { return fn(rowEls[i]); } };
    },
  };
  const exportTarget = {
    async waitFor() {},
    async evaluate(fn) {
      return fn(rootEl);
    },
    locator(selector) {
      if (selector === ROW_SELECTOR) return rowLocator;
      throw new Error(`fakePage: unexpected row locator ${selector}`);
    },
  };
  const tabButton = {
    async scrollIntoViewIfNeeded() {},
    async click() {},
  };
  return {
    async goto() {},
    async waitForTimeout() {},
    locator(selector) {
      if (selector === PAGE_EXPORT_SELECTOR) return { first: () => exportTarget };
      if (selector.startsWith("button")) return { first: () => tabButton };
      throw new Error(`fakePage: unexpected locator ${selector}`);
    },
  };
}

function browserHarness() {
  let closed = false;
  const page = {
    setDefaultTimeout() {},
  };
  return {
    launchBrowser: async () => ({
      newPage: async () => page,
      close: async () => {
        closed = true;
      },
    }),
    page,
    wasClosed: () => closed,
  };
}

describe("acquireKPageData", () => {
  it("treats a valid empty K table as available data", async () => {
    const harness = browserHarness();
    const emptyPageData = { date: "2026-07-26", generatedAt: "2026-07-26T15:35:46.282Z", rows: [] };
    const result = await acquireKPageData({
      launchBrowser: harness.launchBrowser,
      scrape: async (page) => {
        assert.equal(page, harness.page);
        return emptyPageData;
      },
    });

    assert.equal(result.available, true);
    assert.deepEqual(result.pageData, emptyPageData);
    assert.equal(result.error, null);
    assert.equal(harness.wasClosed(), true);
  });

  it("contains a K scrape failure and still closes the browser", async () => {
    const harness = browserHarness();
    const scrapeError = new Error("K export root was unavailable");
    const result = await acquireKPageData({
      launchBrowser: harness.launchBrowser,
      scrape: async () => {
        throw scrapeError;
      },
    });

    assert.equal(result.available, false);
    assert.equal(result.pageData, null);
    assert.equal(result.error, scrapeError);
    assert.equal(harness.wasClosed(), true);
  });
});

function baseRowAttrs(overrides = {}) {
  return {
    "data-k-pitcher": "Gavin Williams",
    "data-k-team": "CLE",
    "data-k-opponent": "PIT",
    "data-k-line": "6.5",
    "data-k-odds-over": "-150",
    "data-k-odds-under": "+118",
    "data-k-bookmaker": "draftkings",
    "data-k-status": "VALID",
    "data-k-side": "over",
    "data-k-projected-ks": "7.2",
    "data-k-projection-edge": "0.7",
    "data-k-projected-ip": "5.3",
    ...overrides,
  };
}

describe("scrapeKPageRows", () => {
  it("scrapes gameId from data-k-game-id, doubleheader-safe and numeric", async () => {
    const page = fakePage({
      metaAttrs: { "data-k-date": "2026-08-18", "data-k-generated-at": "2026-08-18T15:00:00.000Z" },
      rowAttrsList: [baseRowAttrs({ "data-k-game-id": "201" })],
    });
    const result = await scrapeKPageRows(page);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].gameId, 201);
  });

  it("distinguishes two doubleheader-leg rows for the same matchup by gameId", async () => {
    const page = fakePage({
      metaAttrs: { "data-k-date": "2026-08-18", "data-k-generated-at": "2026-08-18T15:00:00.000Z" },
      rowAttrsList: [
        baseRowAttrs({ "data-k-pitcher": "Starter G1", "data-k-game-id": "201" }),
        baseRowAttrs({ "data-k-pitcher": "Starter G2", "data-k-game-id": "202" }),
      ],
    });
    const result = await scrapeKPageRows(page);
    assert.equal(result.rows.length, 2);
    assert.deepEqual(result.rows.map((r) => r.gameId), [201, 202]);
  });

  it("normalizes a missing data-k-game-id to null rather than fabricating one", async () => {
    const page = fakePage({
      metaAttrs: { "data-k-date": "2026-08-18", "data-k-generated-at": "2026-08-18T15:00:00.000Z" },
      rowAttrsList: [baseRowAttrs()],
    });
    const result = await scrapeKPageRows(page);
    assert.equal(result.rows[0].gameId, null);
  });

  it("leaves non-doubleheader row scraping (pitcher/team/opponent/line/odds) unchanged", async () => {
    const page = fakePage({
      metaAttrs: { "data-k-date": "2026-08-18", "data-k-generated-at": "2026-08-18T15:00:00.000Z" },
      rowAttrsList: [baseRowAttrs({ "data-k-game-id": "500" })],
    });
    const result = await scrapeKPageRows(page);
    const row = result.rows[0];
    assert.equal(row.pitcher, "Gavin Williams");
    assert.equal(row.team, "CLE");
    assert.equal(row.opponent, "PIT");
    assert.equal(row.kLine, 6.5);
    assert.equal(row.oddsOver, "-150");
    assert.equal(row.oddsUnder, "+118");
  });
});
