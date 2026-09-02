import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const workflowPath = resolve(process.cwd(), ".github/workflows/nfl-schedules-results.yml");
const workflow = readFileSync(workflowPath, "utf8");

describe("WU2.5 postgame workflow", () => {
  it("is valid YAML and preserves the schedule, shared concurrency lock, and push retries", () => {
    expect(() => load(workflow)).not.toThrow();
    expect(workflow).toContain('cron: "10 6 * 1,2,9,10,11,12 *"');
    expect(workflow).toContain('timezone: "America/New_York"');
    expect(workflow).toContain("group: main-data-writers-${{ github.repository }}");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("for attempt in 1 2 3 4 5");
    expect(workflow).toContain("git rebase origin/main");
    expect(workflow).toContain("git push origin HEAD:main");
  });

  it("orders results, player-week refresh, and outcome resolution", () => {
    const schedule = workflow.indexOf("- name: Generate NFL schedules and results");
    const stats = workflow.indexOf("- name: Refresh authoritative 2026 player-week stats");
    const resolver = workflow.indexOf("- name: Resolve archived 2026 production predictions");
    const persistence = workflow.indexOf("- name: Commit and push refreshed data");
    expect(schedule).toBeGreaterThan(-1);
    expect(schedule).toBeLessThan(stats);
    expect(stats).toBeLessThan(resolver);
    expect(resolver).toBeLessThan(persistence);
    expect(workflow).toContain("npm run nfl:player-week-stats-cache --");
    expect(workflow).toContain("npm run resolve:nfl-prediction-outcomes");
  });

  it("resolves spreads without knowingly using stale player stats after a refresh failure", () => {
    expect(workflow).toContain("continue-on-error: true");
    expect(workflow).toContain('${{ steps.player-stats.outcome }}');
    expect(workflow).toContain("resolver_args+=(--prediction-types=spread)");
    expect(workflow).toContain("leaving player predictions pending");
  });

  it("strictly allowlists the 2026 cache and outcome partitions", () => {
    expect(workflow).toContain("^data/nfl/nflverse/player-week-stats/(stats_player_week_2026\\.csv|manifest\\.json)$");
    expect(workflow).toContain("Refusing unexpected player-week cache path");
    expect(workflow).toContain("^data/nfl/prediction-outcomes/2026/[0-9]{2}/(spread|passing|rushing|receiving)\\.jsonl$");
    expect(workflow).toContain("Refusing unexpected prediction outcome path");
    expect(workflow).toContain('git add -- "$cache_path"');
    expect(workflow).toContain('git add -- "$outcome_path"');
    expect(workflow).not.toMatch(/git add\s+(?:-A|--all|\.)\b/);
  });
});
