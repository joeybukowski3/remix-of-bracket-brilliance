import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow: string = readFileSync(".github/workflows/refresh-pga-player-history.yml", "utf8");
const rollover: string = readFileSync(".github/workflows/sync-pga-data.yml", "utf8");
const trendGenerator: string = readFileSync("scripts/generate-jkb-trend-rank.mjs", "utf8");
const historyPage: string = readFileSync("src/pages/PgaHistoryModel.tsx", "utf8");

describe("PGA scoped player-history workflow", () => {
  it("supports manual dispatch and one weekly Monday schedule", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain('cron: "30 10 * * 1"');
  });

  it("uses the shared main-data-writer concurrency strategy", () => {
    for (const source of [workflow, rollover]) {
      expect(source).toContain("group: main-data-writers-${{ github.repository }}");
      expect(source).toContain("cancel-in-progress: false");
    }
  });

  it("invokes scoped refresh and offline validation", () => {
    expect(workflow).toContain("npm run pga:refresh-history-scoped --");
    expect(workflow).toContain("npm run pga:validate-history-refresh --");
    expect(workflow).toContain("public/data/pga/next-tournament.json");
    expect(workflow).toContain("--participant-file public/data/pga/current-field.json");
  });

  it("exposes workflow_dispatch player_ids/player_names inputs for a targeted rerun", () => {
    expect(workflow).toContain("player_ids:");
    expect(workflow).toContain("player_names:");
    expect(workflow).toContain("--player-id \"$PLAYER_IDS\"");
    expect(workflow).toContain("--player \"$PLAYER_NAMES\"");
  });

  it("skips the current-week expected-event gate for a targeted rerun", () => {
    const dispatchInputsIndex = workflow.indexOf("workflow_dispatch:");
    const eventStepIndex = workflow.indexOf("Validate completed-event metadata");
    expect(dispatchInputsIndex).toBeGreaterThan(0);
    expect(eventStepIndex).toBeGreaterThan(dispatchInputsIndex);
    expect(workflow).toContain("if: github.event_name != 'workflow_dispatch' || (!github.event.inputs.player_ids && !github.event.inputs.player_names)");
  });

  it("stages only the explicit player-history allowlist and safely no-ops", () => {
    expect(workflow).toContain("git add public/data/pga/player-history.json");
    expect(workflow).not.toMatch(/^\s*git add public\/data\/pga\/?\s*$/m);
    expect(workflow).not.toContain("major-history.json");
    expect(workflow).toContain("git diff --quiet -- public/data/pga/player-history.json");
  });

  it("does not invoke unrelated PGA or non-PGA generators", () => {
    for (const forbidden of ["pga:best-bets", "pga:rankings", "pga:fetch-liv", "pga:fetch-dpwt", "mlb:", "nfl:", "GROK_API_KEY", "ODDS_API_KEY"]) {
      expect(workflow).not.toContain(forbidden);
    }
  });

  it("dependency-triggers the Monday rollover only after history completes successfully", () => {
    expect(rollover).toContain("workflow_run:");
    expect(rollover).toContain("Refresh PGA Player History");
    expect(rollover).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(rollover).toContain('cron: "0 12 * * 2,3"');
    expect(rollover).not.toContain('cron: "0 12 * * 1,2,3"');
  });

  it("checks out the committed history before stats, trend, rankings, and transition", () => {
    const jobs = rollover.slice(rollover.indexOf("jobs:"));
    const ordered = [
      "actions/checkout@v4",
      "npm run pga:trend -- --validate-input-only",
      "check-pga-stats-freshness.mjs",
      'npm run pga:trend -- --output-dir "${RUNNER_TEMP}/jkb-trend"',
      "Publish validated JKB Trend artifacts",
      "generate-pga-tournament-rankings.mjs",
      "check-pga-field-sync.mjs",
      "git commit -m \"chore: sync PGA sheet data\"",
    ].map((value) => jobs.indexOf(value));
    expect(ordered.every((index) => index >= 0)).toBe(true);
    expect([...ordered].sort((left, right) => left - right)).toEqual(ordered);
    expect(rollover).toContain("ref: ${{ env.TARGET_BRANCH }}");
  });

  it("validates to temporary output before replacing the last valid trend artifacts", () => {
    const generate = rollover.indexOf('npm run pga:trend -- --output-dir "${RUNNER_TEMP}/jkb-trend"');
    const publish = rollover.indexOf("Publish validated JKB Trend artifacts");
    const commit = rollover.indexOf("git commit -m \"chore: sync PGA sheet data\"");
    expect(generate).toBeGreaterThan(0);
    expect(publish).toBeGreaterThan(generate);
    expect(commit).toBeGreaterThan(publish);
    expect(rollover).toContain('cp "${RUNNER_TEMP}/jkb-trend/round-history-pga.json" public/data/pga/round-history-pga.json');
    expect(rollover).toContain('cp "${RUNNER_TEMP}/jkb-trend/jkb-trend-rankings.json" public/data/pga/jkb-trend-rankings.json');
  });

  it("commits generated trend output but later field rollovers cannot overwrite player history", () => {
    expect(rollover).toContain("public/data/pga/jkb-trend-rankings.json");
    expect(rollover).toContain("public/data/pga/round-history-pga.json");
    expect(rollover).not.toContain("git add public/data/pga/player-history.json");
  });

  it("feeds refreshed history to both JKB Trend generation and frontend model scoring", () => {
    expect(trendGenerator).toContain('"player-history.json"');
    expect(trendGenerator).toContain("flattenPgaHistory(payloads.pgaHistory");
    expect(trendGenerator).toContain("Object.values(player.eventHistory ?? {}).flat()");
    expect(historyPage).toContain("scoreRecentResults(recentResults)");
    expect(historyPage).toContain("calculateTrend(recentResults)");
    expect(historyPage).not.toContain("modelRecentResults");
  });
});
