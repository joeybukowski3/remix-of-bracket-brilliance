import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    {
      // scripts/lib/*.mjs CLI modules start with a #! line, which vite-node's
      // function wrapper rejects. Neutralise it so tests can import them.
      name: "strip-hashbang",
      enforce: "pre",
      transform(code) {
        return code.startsWith("#!") ? { code: `//${code.slice(2)}`, map: null } : null;
      },
    },
  ],
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
      "api/_lib/mlb-refresh-backup.test.ts",
      "scripts/lib/mlb-opponent-k-context.test.mjs",
      "scripts/lib/mlb-strikeout-reference-context.test.mjs",
      // MLB K probability/value shadow layer (informational, does not drive
      // Best K Prop Bets) -- see docs/features/mlb-k.md.
      "scripts/lib/mlb-k-odds-math.test.mjs",
      "scripts/lib/mlb-k-probability-model.test.mjs",
      "scripts/lib/mlb-k-probability-shadow-core.test.mjs",
      // MLB K table column updates -- K/Inning Last 5 (total/total, not an
      // average of per-game rates) and opponent last-10-games home/away
      // passthrough.
      "scripts/lib/mlb-strikeout-prop-details-core.test.mjs",
      "scripts/lib/mlb-strikeout-prop-details-fetch.test.mjs",
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
      // NFL Anytime TD market -- ParlayAPI canonical scorer-market pipeline.
      "scripts/lib/nfl-anytime-td-selection.test.mjs",
      // NFL yardage alt-market (secondary source) -- Kalshi ladder normalization.
      "scripts/lib/nfl-kalshi-yardage.test.mjs",
      // NFL Yardage Player Detail v2 -- Last-10 history pipeline.
      "scripts/lib/nfl-epa-week-rank-core.test.mjs",
      "scripts/lib/nfl-yardage-rolling-core.test.mjs",
      "scripts/lib/nfl-yardage-historical-line-core.test.mjs",
      // NFL Phase 11A -- JKB-vs-sportsbook research/evaluation framework.
      "scripts/lib/nfl-research-odds-math.test.mjs",
      "scripts/lib/nfl-research-join.test.mjs",
      "scripts/lib/nfl-research-metrics.test.mjs",
      "scripts/lib/nfl-research-buckets.test.mjs",
      "scripts/lib/nfl-research-time-split.test.mjs",
      "scripts/lib/nfl-research-bias.test.mjs",
      // NFL prospective 2026 JKB TD Score forward-validation (research only).
      "scripts/research/lib/nfl-td-forward-core.test.mjs",
      "scripts/research/lib/nfl-td-forward-metrics.test.mjs",
      "scripts/research/lib/nfl-td-forward-summary.test.mjs",
      // NFL Performance Analytics pipeline (Phase 6) -- TS generator test,
      // enumerated for the same reason as the PGA suites above.
      "scripts/generate-nfl-team-performance-analytics.test.ts",
      // MLB X Sep 3 2026 fix -- Phase 1 stale-data guard for the K production
      // candidate generator.
      "scripts/generate-mlb-k-production-candidates.test.ts",
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
      // Phase 3 DFS -- Razzball defensive slot/wide PPG-allowed scraper core (parse/normalize/validate).
      "scripts/lib/nfl-slot-wide-defense-context-core.test.mjs",
      // WU4C.1 -- scheduled-workflow commit-path allowlist (predictions/outcomes/evaluations).
      "scripts/lib/nfl-prediction-archive-allowlist.test.mjs",
      // WU4G -- forward evaluation (rushing shadow-vs-production / receiving role-conflict) operational layer.
      "scripts/lib/nfl-forward-evaluation.test.ts",
      "scripts/materialize-nfl-forward-evaluation.test.ts",
      // NFL Yardage Props Review -- shared opponent-production-allowed artifact.
      "scripts/lib/nfl-production-allowed-core.test.mjs",
      "scripts/generate-nfl-team-pregame-features.test.ts",
      // NFL total model production guard -- Week 1 empty-target-season-cache relief.
      "scripts/generate-nfl-totals.test.ts",
      // Shadow total calibration candidate (k=0.8, shadow-only; never a production consumer).
      "scripts/lib/nfl-total-shadow-calibration.test.ts",
      "scripts/lib/nfl-total-shadow-report.test.ts",
      "scripts/lib/nfl-total-shadow-allowlist.test.mjs",
      "scripts/nfl-total-shadow-pipeline.test.ts",
      // CFB official AP/CFP rankings -- rankings-only fetch/update CLI behavior.
      "scripts/cfb-fetch-rankings.test.ts",
      "scripts/cfb-update-rankings.test.ts",
      // CFB matchup-stats WU -- CFBD-derived season-stats build CLI behavior.
      "scripts/cfb-build-season-stats.test.ts",
      // NFL Yardage Projection refresh pipeline -- CI artifact validation gate.
      "scripts/validate-nfl-current-week-yardage-projections.test.mjs",
      // NFL yardage workflow -- branch-aware CI ref resolution.
      "scripts/lib/ci-branch-resolution.test.mjs",
      // NFL matchup-page JKB projected totals -- team-totals frontend view generator.
      "scripts/generate-nfl-team-totals-view.test.ts",
      // NFL Performance Center WU1 -- deterministic pregame starter-cohort selector.
      "scripts/lib/nfl-starter-cohort.test.ts",
      "scripts/generate-nfl-starter-cohort.test.ts",
      // NFL Performance Center WU2 -- canonical starter-prop evaluation materializer.
      "scripts/lib/nfl-starter-prop-evaluation.test.ts",
      "scripts/generate-nfl-starter-prop-evaluations.test.ts",
      // NFL Performance Center WU3 -- canonical totals performance artifact.
      "scripts/lib/nfl-totals-performance.test.ts",
      "scripts/lib/nfl-game-context.test.ts",
      "scripts/generate-nfl-totals-performance.test.ts",
      // Dual-AI handicapping architecture WU1 -- Game Context Packet builder + validators.
      "scripts/lib/nfl-full-game-context.test.ts",
      // WU7.1 -- gameId/identity team-code alias normalization regression coverage.
      "scripts/lib/nfl-game-context-validators.test.ts",
      // Dual-AI handicapping architecture WU2 -- external evidence normalization/validation foundation.
      "scripts/lib/nfl-evidence-normalizer.test.ts",
      "scripts/lib/nfl-evidence-store.test.ts",
      // Dual-AI handicapping architecture WU2.1 -- canonical player/coach
      // subject identity validation.
      "scripts/lib/nfl-evidence-subject-identity.test.ts",
      // Dual-AI handicapping architecture WU2.2 -- production subject
      // identity source loader (pure core + repo-file I/O wrapper).
      "scripts/lib/nfl-evidence-subject-identity-loader-core.test.ts",
      "scripts/lib/nfl-evidence-subject-identity-loader.test.ts",
      // Dual-AI handicapping architecture WU3 -- Grok research adapter
      // (xAI Agent Tools API /v1/responses) config/parsing/adapter tests.
      "scripts/lib/nfl-grok-research-config.test.ts",
      "scripts/lib/nfl-grok-research-parsing.test.ts",
      "scripts/lib/nfl-grok-research-adapter.test.ts",
      // Dual-AI handicapping architecture WU3.1 -- Grok research hardening
      // (citation-specificity policy, research coverage summary).
      "scripts/lib/nfl-evidence-policy.test.ts",
      "scripts/lib/nfl-grok-research-coverage.test.ts",
      // Dual-AI handicapping architecture WU3.2 -- model-agnostic recurring
      // pregame snapshot framework (evidence/market/opinion deltas, locking,
      // append-only storage, provider-neutral delta-research context).
      "scripts/lib/nfl-snapshot-evidence-delta.test.ts",
      "scripts/lib/nfl-snapshot-market-delta.test.ts",
      "scripts/lib/nfl-snapshot-opinion-delta.test.ts",
      "scripts/lib/nfl-snapshot-lock.test.ts",
      "scripts/lib/nfl-snapshot-store.test.ts",
      // WU4.4.2 -- analysis-lifecycle bookkeeping (initial vs. update vs.
      // not_started, independent of snapshotType cadence).
      "scripts/lib/nfl-snapshot-analysis-lifecycle.test.ts",
      "scripts/lib/nfl-research-delta-context.test.ts",
      // Dual-AI handicapping architecture WU3.3 -- Grok delta-update mode
      // (update-mode prompt/adapter wiring + the append -> evidence-delta ->
      // market-delta -> snapshot orchestration pipeline).
      "scripts/lib/nfl-grok-update-pipeline.test.ts",
      // Dual-AI handicapping architecture WU3.3.1 -- delta-update integration
      // hardening (shared fresh context loader, stale-context freshness guard).
      "scripts/lib/nfl-full-game-context-loader.test.ts",
      "scripts/lib/nfl-snapshot-context-freshness.test.ts",
      // Dual-AI handicapping architecture WU3.4 -- Grok handicap +
      // update-assessment engine (structured analysis validation, opinion-
      // delta reuse for update assessments, reasoning-only adapter).
      "scripts/lib/nfl-grok-analysis-validator.test.ts",
      "scripts/lib/nfl-grok-analysis-adapter.test.ts",
      "scripts/lib/nfl-grok-analysis-pipeline.test.ts",
      // WU7.9 -- long-form editorial article: deterministic legacy-article preview adapter.
      "scripts/lib/nfl-legacy-editorial-adapter.test.ts",
      // WU4.5 -- true independent handicapper architecture: JKB fair-line
      // opinion sanitized out of AI input, mechanical market-edge computation.
      "scripts/lib/nfl-ai-context-sanitizer.test.ts",
      "scripts/lib/nfl-market-edge.test.ts",
      // Dual-AI handicapping architecture WU4 -- ChatGPT research adapter
      // (OpenAI Responses API /v1/responses) config/parsing/adapter tests.
      "scripts/lib/nfl-chatgpt-research-adapter.test.ts",
      // WU6.4 -- dedicated buildRawEvidenceCandidatesFromFindings() coverage,
      // mirroring nfl-grok-research-parsing.test.ts's separation of concerns
      // (malformed-candidate quarantine regression from the DET_BUF live run).
      "scripts/lib/nfl-chatgpt-research-parsing.test.ts",
      // Dual-AI handicapping architecture WU4.4 -- ChatGPT handicap +
      // update-assessment parity (shared provider-neutral analysis
      // contract, ChatGPT reasoning-only adapter, model-isolation tests).
      "scripts/lib/nfl-chatgpt-analysis-validator.test.ts",
      "scripts/lib/nfl-chatgpt-analysis-adapter.test.ts",
      "scripts/lib/nfl-chatgpt-analysis-pipeline.test.ts",
      "scripts/lib/nfl-chatgpt-analysis-isolation.test.ts",
      // WU5 -- internal snapshot -> sanitized public AI-handicap presentation exporter.
      "scripts/generate-nfl-ai-handicap-presentation.test.ts",
      // WU6 -- provider-neutral slate orchestrator: zero-cost planning phase
      // and stage execution (dependency-injected command runner, no real
      // Grok/OpenAI calls).
      "scripts/lib/nfl-ai-slate-plan.test.ts",
      "scripts/lib/nfl-ai-slate-executor.test.ts",
      // WU6.9 -- machine-readable Stage A/B telemetry markers (emit/parse/aggregate).
      "scripts/lib/nfl-ai-telemetry.test.ts",
      "scripts/run-nfl-ai-handicap-slate.test.ts",
      // WU6.5 -- zero-cost replay of an archived provider research response
      // (ChatGPT only; see nfl-provider-research-replay.ts's header for the
      // Grok gap). Pure planning/safety-check tests plus the CLI integration
      // suite for scripts/replay-nfl-provider-research.ts.
      "scripts/lib/nfl-provider-research-replay.test.ts",
      "scripts/replay-nfl-provider-research.test.ts",
      // NFL Performance Center WU4 -- automation wiring + overview/health/props artifacts.
      "scripts/lib/nfl-props-performance.test.ts",
      "scripts/generate-nfl-props-performance.test.ts",
      "scripts/lib/nfl-performance-overview.test.ts",
      "scripts/generate-nfl-performance-overview.test.ts",
      "scripts/lib/nfl-performance-health.test.ts",
      "scripts/generate-nfl-performance-health.test.ts",
      // NFL Performance Center WU6 -- canonical sides (spread) performance artifact.
      "scripts/lib/nfl-sides-performance.test.ts",
      "scripts/generate-nfl-sides-performance.test.ts",
      // NFL Coaching Ratings v1 -- ingestion + canonical coach identity +
      // leakage-safe pregame coach-game context + persistence research.
      "scripts/lib/nfl-coach-core.test.mjs",
      "scripts/lib/nfl-coach-context.test.mjs",
      "scripts/lib/nfl-coach-research.test.mjs",
      // NFL Coaching Ratings v1 -- frozen composite + public artifact builder.
      "scripts/lib/nfl-coach-rating.test.mjs",
      // NFL Coaching Rating v1 Phase B -- historical point-in-time rating snapshots.
      "scripts/lib/nfl-coach-rating-snapshot.test.mjs",
      // NFL Coaching Rating v1 Phase C -- current-season adapter + per-game snapshot selection.
      "scripts/lib/nfl-coach-rating-current-adapter.test.ts",
      "scripts/lib/nfl-coaching-snapshot-source.test.ts",
      // WalterFootball private research dashboard -- page parser, normalizer, diff.
      "scripts/lib/walter/parseGamePage.test.mjs",
      "scripts/lib/walter/normalizeGame.test.mjs",
      "scripts/lib/walter/diffCapture.test.mjs",
      "scripts/lib/walter/storage.test.mjs",
      // Canonical-schedule coverage diagnostics (sources/panels/canonical
      // match counts, premium-gate detection) -- see scheduleCoverage.mjs.
      "scripts/lib/walter/scheduleCoverage.test.mjs",
    ],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
