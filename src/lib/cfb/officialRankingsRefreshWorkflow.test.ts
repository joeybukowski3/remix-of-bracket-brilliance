import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  path.join(process.cwd(), ".github", "workflows", "cfb-official-rankings-refresh.yml"),
  "utf8",
);
const oddsWorkflow = readFileSync(
  path.join(process.cwd(), ".github", "workflows", "cfb-market-odds-refresh.yml"),
  "utf8",
);
const gitignore = readFileSync(path.join(process.cwd(), ".gitignore"), "utf8");

function indexOfStep(name: string): number {
  return workflow.indexOf(`- name: ${name}`);
}

/**
 * Scheduled runs per week = sum of each cron line's day-of-week list size.
 * Counting cron LINES would understate a line like "* * 1,2,3,4,5,6".
 */
function runsPerWeek(source: string): number {
  return [...source.matchAll(/- cron: "(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)"/g)].reduce(
    (total, match) => total + match[5].split(",").length,
    0,
  );
}

describe("CFB official rankings refresh workflow — static assertions", () => {
  it("triggers on both a schedule and manual dispatch", () => {
    expect(workflow).toMatch(/on:\s*\n\s*schedule:/);
    expect(workflow).toContain("workflow_dispatch:");
  });

  it("runs a low-cost 3-runs-per-week cadence aligned to AP and CFP publication windows", () => {
    expect(workflow).toContain('cron: "30 15 * * 0"'); // Sunday, after the weekly AP release
    expect(workflow).toContain('cron: "0 9 * * 1"'); // Monday safety net / preseason poll
    expect(workflow).toContain('cron: "0 7 * * 3"'); // Wednesday, after Tuesday-night CFP
    const cronLines = [...workflow.matchAll(/- cron: "[^"]*"/g)];
    expect(cronLines.length).toBe(3);
  });

  it("totals exactly 3 scheduled runs — and therefore 3 CFBD calls — per week", () => {
    expect(runsPerWeek(workflow)).toBe(3);
  });

  it("is meaningfully lighter than the odds refresh — polls do not need market-level freshness", () => {
    expect(runsPerWeek(workflow)).toBeLessThan(runsPerWeek(oddsWorkflow));
  });

  it("never polls intraday", () => {
    expect(workflow).not.toMatch(/cron:\s*"[^"]*\*\/[0-9]/);
  });

  it("evaluates every cron trigger in America/New_York so EST/EDT never drifts the local time", () => {
    const scheduleBlock = workflow.slice(
      workflow.indexOf("schedule:"),
      workflow.indexOf("workflow_dispatch:"),
    );
    const cronLines = [...scheduleBlock.matchAll(/- cron: "[^"]*"/g)];
    const timezoneLines = [...scheduleBlock.matchAll(/timezone: "America\/New_York"/g)];
    expect(timezoneLines.length).toBe(cronLines.length);
    const paired = [
      ...scheduleBlock.matchAll(/- cron: "[^"]*"\s*\n\s*timezone: "America\/New_York"/g),
    ];
    expect(paired.length).toBe(cronLines.length);
  });

  it("makes exactly one CFBD request per run, via the rankings-only package script", () => {
    expect(workflow).toContain("run: npm run cfb:refresh-rankings");
    expect(indexOfStep("Fetch official CFBD rankings (/rankings only)")).toBeGreaterThan(-1);
    expect((workflow.match(/run: npm run cfb:/g) ?? []).length).toBe(1);
  });

  it("never invokes the broad fetch-data / ratings / calibration / V2 chains", () => {
    for (const forbidden of [
      "cfb:fetch-data",
      "cfb:build-ratings",
      "cfb:build-v1",
      "cfb:calibrate",
      "cfb:build-market-anchor",
      "cfb:v2:",
      "cfb:refresh-market-odds",
    ]) {
      expect(workflow).not.toContain(forbidden);
    }
  });

  it("uses a dedicated concurrency group separate from the odds refresh", () => {
    expect(workflow).toMatch(/concurrency:\s*\n\s*group: cfb-official-rankings-refresh/);
    expect(workflow).toContain("cancel-in-progress: true");
  });

  it("runs fetch/update -> detect -> commit in order", () => {
    const fetchStep = indexOfStep("Fetch official CFBD rankings (/rankings only)");
    const detect = indexOfStep("Detect official ranking changes");
    const commit = indexOfStep("Commit and push official rankings artifact");
    for (const index of [fetchStep, detect, commit]) expect(index).toBeGreaterThan(-1);
    expect(detect).toBeGreaterThan(fetchStep);
    expect(commit).toBeGreaterThan(detect);
  });

  it("commits ONLY the ranking artifact — never ratings, schedule, raw cache, or V2 artifacts", () => {
    const commitIndex = indexOfStep("Commit and push official rankings artifact");
    const commitBlock = workflow.slice(commitIndex, commitIndex + 1400);
    expect(commitBlock).toContain("git add data/generated/cfb/2026-rankings.json");
    expect((commitBlock.match(/git add /g) ?? []).length).toBe(1);
    expect(commitBlock).not.toContain("preseason-ratings");
    expect(commitBlock).not.toContain("2026-schedule-v1.json");
    expect(commitBlock).not.toContain("model-calibration-report.json");
    expect(commitBlock).not.toContain("data/cfb/cfbd/raw");
    expect(commitBlock).not.toMatch(/public\/data\/nfl|public\/data\/pga|public\/data\/mlb|cfb\/v2/);
    expect(commitBlock).not.toMatch(/git add \.|git add -A|git add --all/);
  });

  it("an unchanged ranking artifact skips both the commit and the deploy", () => {
    const detectIndex = indexOfStep("Detect official ranking changes");
    const commitIndex = indexOfStep("Commit and push official rankings artifact");
    const detectBlock = workflow.slice(detectIndex, commitIndex);
    const commitBlock = workflow.slice(commitIndex, commitIndex + 1400);
    expect(detectBlock).toContain(
      "git status --porcelain -- 'data/generated/cfb/2026-rankings.json'",
    );
    expect(detectBlock).toContain("changed=false");
    expect(commitBlock).toContain("if: steps.changes.outputs.changed == 'true'");
    expect(commitBlock).toContain("git diff --cached --quiet");
    expect(workflow).toContain("if: needs.refresh-rankings.outputs.deploy_ref != ''");
  });

  it("deploys Pages via the established reusable workflow only after a successful push", () => {
    const deployJob = workflow.slice(workflow.indexOf("  deploy-pages:"));
    expect(workflow).toContain("deploy_ref: ${{ steps.commit.outputs.pushed_commit }}");
    expect(deployJob).toContain("needs: refresh-rankings");
    expect(deployJob).toContain("uses: ./.github/workflows/deploy.yml");
    expect(deployJob).toContain("ref: ${{ needs.refresh-rankings.outputs.deploy_ref }}");
  });

  it("passes CFBD_API_KEY from secrets only, once, and never logs it", () => {
    expect(workflow).toContain("CFBD_API_KEY: ${{ secrets.CFBD_API_KEY }}");
    expect(workflow).not.toMatch(/CFBD_API_KEY:\s*["'][^$][^{]/);
    expect((workflow.match(/secrets\.CFBD_API_KEY/g) ?? []).length).toBe(1);
    expect(workflow).not.toMatch(/echo.*CFBD_API_KEY/i);
  });

  it("requests write permission with exactly one commit and one push, and no PAT", () => {
    expect(workflow).toMatch(/permissions:\s*\n\s*contents: write/);
    expect((workflow.match(/git commit/g) ?? []).length).toBe(1);
    expect((workflow.match(/git push/g) ?? []).length).toBe(1);
    expect(workflow).not.toMatch(/secrets\.[A-Z_]*PAT/);
  });

  it("never touches V2 shadow paths or unrelated sport/UI directories", () => {
    expect(workflow).not.toMatch(
      /marketAnchor|shadow-projections|public\/data\/nfl|public\/data\/mlb|src\/pages|src\/components|fantasy/,
    );
  });

  it("keeps the ranking artifact a normal tracked path despite the data/generated/cfb blanket ignore", () => {
    expect(gitignore).toContain("data/generated/cfb/*");
    expect(gitignore).toContain("!data/generated/cfb/2026-rankings.json");
  });
});
