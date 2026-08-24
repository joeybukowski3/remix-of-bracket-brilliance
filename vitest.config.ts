import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      // PGA Best Bets deterministic value pipeline (PR A) -- these are plain
      // Vitest suites for pure .mjs modules, explicitly enumerated rather than
      // globbed under scripts/** because most scripts/**/*.test.mjs files use
      // node:test (Node's built-in runner), which Vitest cannot collect.
      "scripts/config/pga-best-bets-config.test.mjs",
      "scripts/lib/pga-odds-math.test.mjs",
      "scripts/lib/pga-odds-provider.test.mjs",
      "scripts/lib/pga-probability-model.test.mjs",
      "scripts/lib/pga-best-bets-selection.test.mjs",
      "scripts/lib/pga-best-bets-schema.test.mjs",
      "scripts/lib/mlb-opponent-k-context.test.mjs",
      "scripts/lib/mlb-prop-line-selection.test.mjs",
      "scripts/lib/mlb-prop-odds-integrity.test.mjs",
      "tests/social-cards.test.mjs",
      "scripts/lib/social-cards/adapters/mlb-daily-card-adapters.test.mjs",
      "scripts/lib/social-cards/adapters/no-legacy-selection.test.mjs",
      "scripts/lib/social-cards/workflow-summary.test.mjs",
      "scripts/lib/mlb-top-hr-tracking.test.mjs",
      "scripts/lib/mlb-top-k-tracking.test.mjs",
      "scripts/lib/mlb-numerology-tracking.test.mjs",
      // NFL Performance Analytics pipeline (Phase 6) -- TS generator test,
      // enumerated for the same reason as the PGA suites above.
      "scripts/generate-nfl-team-performance-analytics.test.ts",
      // CFB Model V2 WU5 -- production /plays fetch client batching.
      "scripts/lib/cfb-cfbd-plays-client.test.ts",
      // CFB Model V2 WU5 checkpoint -- required-input fail-closed behavior.
      "scripts/cfb-v2-build-shadow.fail-closed.test.ts",
    ],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
