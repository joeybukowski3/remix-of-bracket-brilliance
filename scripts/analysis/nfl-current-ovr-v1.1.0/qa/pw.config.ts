import { defineConfig } from "@playwright/test";

// Browser QA for nfl-current-ovr-v1.1.0. Uses the repo's analytics-blocking fixture (../../../../playwright-fixture).
// Start the app first (npx vite --port 8089 --host 127.0.0.1) and set QA_OUT to a writable output directory.
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  timeout: 180000,
  workers: 1,
  reporter: [["list"]],
  use: { serviceWorkers: "block", baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8089" },
});
