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
      "scripts/lib/mlb-strikeout-reference-context.test.mjs",
      "scripts/lib/mlb-prop-line-selection.test.mjs",
      "scripts/lib/mlb-prop-odds-integrity.test.mjs",
      "tests/social-cards.test.mjs",
      "scripts/lib/social-cards/adapters/mlb-daily-card-adapters.test.mjs",
      "scripts/lib/social-cards/adapters/no-legacy-selection.test.mjs",
      "scripts/lib/social-cards/workflow-summary.test.mjs",
      "scripts/lib/mlb-top-hr-tracking.test.mjs",
      "scripts/lib/mlb-top-k-tracking.test.mjs",
      "scripts/lib/mlb-numerology-tracking.test.mjs",
      // NFL Phase 10B -- ParlayAPI canonical yardage-market pipeline.
      "scripts/lib/nfl-prop-line-selection.test.mjs",
      "scripts/lib/nfl-roster-identity.test.mjs",
      "scripts/lib/nfl-market-archive.test.mjs",
      "scripts/lib/nfl-market-coverage.test.mjs",
      // NFL Phase 11A -- JKB-vs-sportsbook research/evaluation framework.
      "scripts/lib/nfl-research-odds-math.test.mjs",
      "scripts/lib/nfl-research-join.test.mjs",
      "scripts/lib/nfl-research-metrics.test.mjs",
      "scripts/lib/nfl-research-buckets.test.mjs",
      "scripts/lib/nfl-research-time-split.test.mjs",
      "scripts/lib/nfl-research-bias.test.mjs",
      // NFL Performance Analytics pipeline (Phase 6) -- TS generator test,
      // enumerated for the same reason as the PGA suites above.
      "scripts/generate-nfl-team-performance-analytics.test.ts",
      // CFB Model V2 WU5 -- production /plays fetch client batching.
      "scripts/lib/cfb-cfbd-plays-client.test.ts",
      // CFB Model V2 WU5 checkpoint -- required-input fail-closed behavior.
      "scripts/cfb-v2-build-shadow.fail-closed.test.ts",
      // CFB Model V2 WU6 -- shadow audit CLI behavior.
      "scripts/cfb-v2-audit-shadow.test.ts",
      // CFB Model V2 WU7A -- browser artifact publisher CLI behavior.
      "scripts/cfb-v2-publish-browser-artifact.test.ts",
      // CFB Model V2 WU7A checkpoint -- real git-add mechanics for the
      // browser artifact vs. its .gitignore rule.
      "scripts/cfb-v2-browser-artifact-gitignore.test.ts",
      // CFB Week 1 market odds -- odds-only fetch/update CLI behavior.
      "scripts/cfb-fetch-market-odds.test.ts",
      "scripts/cfb-update-market-odds.test.ts",
      // NFL yardage-prop Phase 1 -- historical outcome artifact generator CLI.
      "scripts/generate-nfl-yardage-outcomes.test.ts",
      // NFL yardage-prop Phase 2 -- play-by-play classification/aggregation core.
      "scripts/lib/nfl-play-volume-core.test.mjs",
      // NFL Yardage Props Review -- shared opponent-production-allowed artifact.
      "scripts/lib/nfl-production-allowed-core.test.mjs",
      "scripts/generate-nfl-team-pregame-features.test.ts",
      // CFB official AP/CFP rankings -- rankings-only fetch/update CLI behavior.
      "scripts/cfb-fetch-rankings.test.ts",
      "scripts/cfb-update-rankings.test.ts",
      // CFB matchup-stats WU -- CFBD-derived season-stats build CLI behavior.
      "scripts/cfb-build-season-stats.test.ts",
      // NFL Yardage Projection refresh pipeline -- CI artifact validation gate.
      "scripts/validate-nfl-current-week-yardage-projections.test.mjs",
    ],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
