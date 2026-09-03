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

  it("orders results, player-week refresh, play-volume refresh, outcome resolution, and WU3 materialization", () => {
    const schedule = workflow.indexOf("- name: Generate NFL schedules and results");
    const stats = workflow.indexOf("- name: Refresh authoritative 2026 player-week stats");
    const playVolume = workflow.indexOf("- name: Refresh 2026 play-volume-team-game cache");
    const resolver = workflow.indexOf("- name: Resolve archived 2026 production predictions");
    const materialize = workflow.indexOf("- name: Materialize WU3 evaluations");
    const persistence = workflow.indexOf("- name: Commit and push refreshed data");
    expect(schedule).toBeGreaterThan(-1);
    expect(schedule).toBeLessThan(stats);
    expect(stats).toBeLessThan(playVolume);
    expect(playVolume).toBeLessThan(resolver);
    expect(resolver).toBeLessThan(materialize);
    expect(materialize).toBeLessThan(persistence);
    expect(workflow).toContain("npm run nfl:player-week-stats-cache --");
    expect(workflow).toContain("npm run nfl:play-volume-cache -- --seasons=2026");
    expect(workflow).toContain("npm run resolve:nfl-prediction-outcomes");
    expect(workflow).toContain("npm run materialize:nfl-evaluation -- --season=2026");
  });

  it("resolves spreads and team_opportunity -- but not player props -- without knowingly using stale player stats after a refresh failure", () => {
    expect(workflow).toContain("continue-on-error: true");
    expect(workflow).toContain('${{ steps.player-stats.outcome }}');
    expect(workflow).toContain("resolver_args+=(--prediction-types=spread,team_opportunity)");
    expect(workflow).toContain("leaving player predictions pending");
  });

  it("never blocks team_opportunity resolution on a play-volume cache failure -- it degrades to pending, not a job failure", () => {
    expect(workflow).toContain('${{ steps.play-volume.outcome }}');
    expect(workflow).toContain("team_opportunity predictions will resolve as pending_team_stats this run");
  });

  it("never blocks the games/results/outcome commit on a WU3 materialization failure", () => {
    expect(workflow).toMatch(/name: Materialize WU3 evaluations\s*\n\s*id: materialize\s*\n\s*continue-on-error: true/);
    expect(workflow).toContain('${{ steps.materialize.outcome }}');
  });

  it("strictly allowlists the 2026 caches, delegating outcome/evaluation path validation to the shared allowlist module", () => {
    expect(workflow).toContain("^data/nfl/nflverse/player-week-stats/(stats_player_week_2026\\.csv|manifest\\.json)$");
    expect(workflow).toContain("Refusing unexpected player-week cache path");
    expect(workflow).toContain("^data/nfl/nflverse/play-volume-team-game/(play_volume_team_game_2026\\.csv|manifest\\.json)$");
    expect(workflow).toContain("Refusing unexpected play-volume cache path");
    expect(workflow).toContain("node scripts/lib/nfl-prediction-archive-allowlist.mjs outcomes 2026");
    expect(workflow).toContain("node scripts/lib/nfl-prediction-archive-allowlist.mjs evaluations 2026");
    expect(workflow).toContain('git add -- "$cache_path"');
    expect(workflow).toContain('git add -- "$outcome_path"');
    expect(workflow).toContain('git add -- "$evaluation_path"');
    expect(workflow).not.toMatch(/git add\s+(?:-A|--all|\.)\b/);
  });
});
