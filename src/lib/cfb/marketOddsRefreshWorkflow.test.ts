import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(path.join(process.cwd(), ".github", "workflows", "cfb-market-odds-refresh.yml"), "utf8");
const deployWorkflow = readFileSync(path.join(process.cwd(), ".github", "workflows", "deploy.yml"), "utf8");

function indexOfStep(name: string): number {
  return workflow.indexOf(`- name: ${name}`);
}

describe("CFB market odds refresh workflow — static assertions", () => {
  it("triggers on both a schedule and manual dispatch", () => {
    expect(workflow).toMatch(/on:\s*\n\s*schedule:/);
    expect(workflow).toContain("workflow_dispatch:");
  });

  it("runs the approved fixed cadence: 4:00 AM ET Mon-Sat plus an extra 10:15 AM ET Saturday run, none on Sunday", () => {
    expect(workflow).toContain('cron: "0 4 * * 1,2,3,4,5,6"');
    expect(workflow).toContain('cron: "15 10 * * 6"');
    // Day-of-week list 1-6 covers Mon-Sat; Sunday (0) never appears in a cron day-of-week field.
    const dayOfWeekFields = [...workflow.matchAll(/cron:\s*"[^"]*\s([\d,]+)"/g)].map((match) => match[1]);
    for (const field of dayOfWeekFields) {
      expect(field.split(",")).not.toContain("0");
    }
  });

  it("totals exactly 7 scheduled runs per week (6 days x one 4am run, plus one extra Saturday run)", () => {
    const daysInFirstCron = "1,2,3,4,5,6".split(",").length; // Mon-Sat
    const daysInSecondCron = "6".split(",").length; // Saturday only
    expect(daysInFirstCron + daysInSecondCron).toBe(7);
  });

  it("evaluates every cron trigger in America/New_York so EST/EDT transitions never drift the user-facing local time", () => {
    const scheduleBlock = workflow.slice(workflow.indexOf("schedule:"), workflow.indexOf("workflow_dispatch:"));
    const cronLines = [...scheduleBlock.matchAll(/- cron: "[^"]*"/g)];
    expect(cronLines.length).toBe(2);
    const timezoneLines = [...scheduleBlock.matchAll(/timezone: "America\/New_York"/g)];
    expect(timezoneLines.length).toBe(cronLines.length);
    // Every cron entry must be immediately followed by its own timezone line, not one shared/misplaced one.
    for (const match of scheduleBlock.matchAll(/- cron: "[^"]*"\s*\n\s*timezone: "America\/New_York"/g)) {
      expect(match[0]).toBeTruthy();
    }
  });

  it("does not poll intraday — sportsbook-level freshness is explicitly not required", () => {
    expect(workflow).not.toMatch(/cron:\s*"[^"]*\*\/[0-9]\s/); // no */N hour polling of any kind
  });

  it("is a separate workflow from any ratings/model refresh", () => {
    expect(workflow).not.toContain("cfb:v2:");
    expect(workflow).not.toContain("cfb:build-ratings");
    expect(workflow).not.toContain("cfb:build-v1");
    expect(workflow).not.toContain("cfb:calibrate");
  });

  it("uses a dedicated concurrency group", () => {
    expect(workflow).toMatch(/concurrency:\s*\n\s*group: cfb-market-odds-refresh/);
    expect(workflow).toContain("cancel-in-progress: true");
  });

  it("runs the odds-only fetch -> odds-only update -> detect -> commit chain, in that order, via package script entry points", () => {
    const fetch = indexOfStep("Fetch current CFBD market odds (/lines only)");
    const update = indexOfStep("Update schedule odds (merges by CFBD game ID, odds-only)");
    const detect = indexOfStep("Detect schedule/odds changes");
    const commit = indexOfStep("Commit and push schedule/odds artifact");
    for (const index of [fetch, update, detect, commit]) expect(index).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(fetch);
    expect(detect).toBeGreaterThan(update);
    expect(commit).toBeGreaterThan(detect);
    expect(workflow).toContain("run: npm run cfb:fetch-market-odds");
    expect(workflow).toContain("run: npm run cfb:update-market-odds");
    expect(workflow).not.toContain("run: npm run cfb:fetch-data");
  });

  it("never invokes the broad cfb:fetch-data / cfb:build-v1 chain anywhere in the workflow", () => {
    expect(workflow).not.toContain("cfb:fetch-data");
    expect(workflow).not.toContain("cfb:build-v1");
  });

  it("commits ONLY the schedule/odds artifact — never ratings CSV/JSON, the raw CFBD cache, or the calibration report", () => {
    const commitIndex = indexOfStep("Commit and push schedule/odds artifact");
    const commitBlock = workflow.slice(commitIndex, commitIndex + 1200);
    expect(commitBlock).toContain("git add data/generated/cfb/2026-schedule-v1.json");
    expect((commitBlock.match(/git add /g) ?? []).length).toBe(1);
    expect(commitBlock).not.toContain("preseason-ratings");
    expect(commitBlock).not.toContain("model-calibration-report.json");
    expect(commitBlock).not.toContain("data/cfb/cfbd/raw");
    expect(commitBlock).not.toMatch(/public\/data\/nfl|public\/data\/pga|public\/data\/mlb|cfb\/v2/);
    expect(commitBlock).not.toMatch(/git add \.|git add -A|git add --all/);
  });

  it("an unchanged schedule/odds artifact skips the commit step entirely", () => {
    const detectIndex = indexOfStep("Detect schedule/odds changes");
    const commitIndex = indexOfStep("Commit and push schedule/odds artifact");
    const detectBlock = workflow.slice(detectIndex, commitIndex);
    const commitBlock = workflow.slice(commitIndex, commitIndex + 1200);
    expect(detectBlock).toContain("git status --porcelain -- 'data/generated/cfb/2026-schedule-v1.json'");
    expect(detectBlock).toContain("changed=false");
    expect(commitBlock).toContain("if: steps.changes.outputs.changed == 'true'");
    expect(commitBlock).toContain("git diff --cached --quiet");
  });

  it("deploys Pages only after a changed artifact was committed and pushed successfully", () => {
    const commitIndex = indexOfStep("Commit and push schedule/odds artifact");
    const commitBlock = workflow.slice(commitIndex, commitIndex + 1500);
    const deployJob = workflow.slice(workflow.indexOf("  deploy-pages:"));

    expect(workflow).toContain("deploy_ref: ${{ steps.commit.outputs.pushed_commit }}");
    expect(commitBlock).toContain('echo "pushed_commit=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"');
    expect(commitBlock.indexOf("git push origin HEAD:main")).toBeLessThan(commitBlock.indexOf("pushed_commit="));
    expect(deployJob).toContain("needs: refresh-market-odds");
    expect(deployJob).toContain("if: needs.refresh-market-odds.outputs.deploy_ref != ''");
    expect(deployJob).toContain("uses: ./.github/workflows/deploy.yml");
    expect(deployJob).toContain("ref: ${{ needs.refresh-market-odds.outputs.deploy_ref }}");
  });

  it("exposes the Pages workflow as a native reusable workflow", () => {
    expect(deployWorkflow).toContain("workflow_call:");
    expect(deployWorkflow).toMatch(/workflow_call:\s*\n\s*inputs:\s*\n\s*ref:/);
  });

  it("passes CFBD_API_KEY from secrets, never a literal value, and only in the fetch step", () => {
    expect(workflow).toContain("CFBD_API_KEY: ${{ secrets.CFBD_API_KEY }}");
    expect(workflow).not.toMatch(/CFBD_API_KEY:\s*["'][^$][^{]/);
    const occurrences = (workflow.match(/secrets\.CFBD_API_KEY/g) ?? []).length;
    expect(occurrences).toBe(1);
    expect(workflow).not.toMatch(/echo.*CFBD_API_KEY|console\.log.*CFBD_API_KEY/i);
  });

  it("requests write permission, with exactly one commit and one push, no PAT", () => {
    expect(workflow).toMatch(/permissions:\s*\n\s*contents: write/);
    expect((workflow.match(/git commit/g) ?? []).length).toBe(1);
    expect((workflow.match(/git push/g) ?? []).length).toBe(1);
    expect(workflow).not.toMatch(/secrets\.[A-Z_]*PAT/);
  });

  it("never touches V2 shadow paths, betting-edge logic, or unrelated UI/sport directories", () => {
    expect(workflow).not.toMatch(/marketAnchor|betting-edge|public\/data\/nfl|src\/pages|src\/components|shadow-projections/);
  });
});
