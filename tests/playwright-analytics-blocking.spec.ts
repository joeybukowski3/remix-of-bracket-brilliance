import {
  getBlockedAnalyticsRequests,
  installAnalyticsBlocking,
  isAnalyticsBlockingInstalled,
} from "../scripts/lib/playwright-analytics-blocking.mjs";
import { expect, test } from "../playwright-fixture";

test("the shared fixture installs analytics blocking on its context", async ({ context }) => {
  expect(isAnalyticsBlockingInstalled(context)).toBe(true);
});

test("Playwright aborts Google Analytics and Google Tag Manager requests", async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const safetyNetRequests: string[] = [];

  try {
    await context.route("**/*", async (route) => {
      safetyNetRequests.push(route.request().url());
      await route.abort();
    });
    await installAnalyticsBlocking(context);
    const page = await context.newPage();
    const urls = [
      "https://google-analytics.com/g/collect?test=playwright",
      "https://www.google-analytics.com/g/collect?test=playwright",
      "https://region1.google-analytics.com/g/collect?test=playwright",
      "https://googletagmanager.com/gtm.js?id=GTM-TEST",
      "https://www.googletagmanager.com/gtm.js?id=GTM-TEST",
      "https://metrics.googletagmanager.com/gtm.js?id=GTM-TEST",
    ];

    const results = await page.evaluate(async (requestUrls) =>
      Promise.all(
        requestUrls.map(async (url) => {
          try {
            await fetch(url, { mode: "no-cors" });
            return "resolved";
          } catch {
            return "rejected";
          }
        }),
      ),
    urls);

    expect(results).toEqual(urls.map(() => "rejected"));
    expect(getBlockedAnalyticsRequests(context).sort()).toEqual([...urls].sort());
    expect(safetyNetRequests).toEqual([]);
  } finally {
    await context.close();
  }
});
