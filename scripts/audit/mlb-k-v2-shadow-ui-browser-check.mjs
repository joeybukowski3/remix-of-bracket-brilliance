import { chromium } from "playwright";

const BASE_URL = process.env.JKB_PREVIEW_URL || "http://127.0.0.1:4173";
const viewports = [
  { width: 1440, height: 1100 },
  { width: 1280, height: 1000 },
  { width: 1024, height: 900 },
  { width: 768, height: 900 },
  { width: 390, height: 900 },
];

async function measure(page, path) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-x-export="mlb-strikeout-props"]', { timeout: 15000 });
  const rowButton = page.getByRole("button", { name: /Show recent strikeout details/i }).first();
  if (await rowButton.count()) {
    await rowButton.click();
    await page.waitForSelector('[data-testid="strikeout-prop-detail"]', { timeout: 10000 });
  }
  return page.evaluate(() => {
    const main = document.querySelector('[data-x-export="mlb-strikeout-props"]');
    const debug = document.querySelector('[data-testid="k-v2-shadow-debug-status"]');
    const comparison = document.querySelector('[data-testid="k-v2-shadow-row-comparison"]');
    const detail = document.querySelector('[data-testid="strikeout-prop-detail"]');
    return {
      viewport: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      hasPageOverflow: document.documentElement.scrollWidth > window.innerWidth,
      hasDebugBanner: Boolean(debug),
      hasShadowComparison: Boolean(comparison),
      hasDetail: Boolean(detail),
      mainWidth: main?.getBoundingClientRect().width ?? null,
      mainScrollWidth: main?.scrollWidth ?? null,
      xExportAttr: main?.getAttribute("data-x-export") ?? null,
      text: document.body.innerText.slice(0, 5000),
    };
  });
}

const browser = await chromium.launch();
try {
  const results = [];
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    results.push({ path: "/mlb/strikeout-props", width: viewport.width, result: await measure(page, "/mlb/strikeout-props") });
    await page.close();
  }
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    results.push({ path: "/mlb/strikeout-props?debug=k-v2", width: viewport.width, result: await measure(page, "/mlb/strikeout-props?debug=k-v2") });
    await page.close();
  }
  const missingPage = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await missingPage.route("**/data/mlb/k-props-v2-shadow.json", (route) => route.fulfill({ status: 404, body: "missing" }));
  results.push({ path: "/mlb/strikeout-props?debug=k-v2#missing-shadow", width: 390, result: await measure(missingPage, "/mlb/strikeout-props?debug=k-v2") });
  await missingPage.close();

  const stalePage = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await stalePage.route("**/data/mlb/k-props-v2-shadow.json", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.slateDate = "2026-07-22";
    payload.rows = payload.rows.map((row) => ({ ...row, slateDate: "2026-07-22" }));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
  results.push({ path: "/mlb/strikeout-props?debug=k-v2#stale-shadow", width: 390, result: await measure(stalePage, "/mlb/strikeout-props?debug=k-v2") });
  await stalePage.close();

  console.log(JSON.stringify(results.map(({ path, width, result }) => ({
    path,
    width,
    documentScrollWidth: result.documentScrollWidth,
    bodyScrollWidth: result.bodyScrollWidth,
    hasPageOverflow: result.hasPageOverflow,
    hasDebugBanner: result.hasDebugBanner,
    hasShadowComparison: result.hasShadowComparison,
    hasDetail: result.hasDetail,
    xExportAttr: result.xExportAttr,
  })), null, 2));
  const failures = results.filter(({ path, result }) => {
    const expectedShadow = path.includes("debug=k-v2") && !path.includes("missing-shadow") && !path.includes("stale-shadow");
    return result.hasPageOverflow
      || result.xExportAttr !== "mlb-strikeout-props"
      || (expectedShadow && !result.hasShadowComparison)
      || (path.includes("missing-shadow") && result.hasShadowComparison)
      || (path.includes("stale-shadow") && result.hasShadowComparison);
  });
  if (failures.length) {
    console.error("Browser validation failures:", JSON.stringify(failures, null, 2));
    process.exit(1);
  }
} finally {
  await browser.close();
}
