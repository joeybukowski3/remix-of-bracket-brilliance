import { test as base, expect } from "@playwright/test";
import { installAnalyticsBlocking } from "./scripts/lib/playwright-analytics-blocking.mjs";

type AnalyticsBlockingFixture = {
  _analyticsBlocking: void;
};

const test = base.extend<AnalyticsBlockingFixture>({
  _analyticsBlocking: [
    async ({ context }, use) => {
      await installAnalyticsBlocking(context);
      await use();
    },
    { auto: true },
  ],
});

export { test, expect };
