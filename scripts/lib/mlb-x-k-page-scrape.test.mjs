import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { acquireKPageData } from "./mlb-x-k-page-scrape.mjs";

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
