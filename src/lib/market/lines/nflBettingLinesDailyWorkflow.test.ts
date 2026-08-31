import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  path.join(process.cwd(), ".github", "workflows", "nfl-betting-lines-daily.yml"),
  "utf8",
);

function stepBlock(name: string): string {
  const start = workflow.indexOf(`- name: ${name}`);
  expect(start).toBeGreaterThan(-1);
  return workflow.slice(start, start + 1400);
}

describe("NFL betting-lines daily workflow — static assertions", () => {
  it("is scheduled exactly once per day and also allows manual dispatch", () => {
    const cronLines = [...workflow.matchAll(/- cron: "[^"]*"/g)];
    expect(cronLines.length).toBe(1);
    expect(workflow).toContain('cron: "0 10 * * *"');
    expect(workflow).toContain("workflow_dispatch:");
    // no intraday polling
    expect(workflow).not.toMatch(/cron:\s*"[^"]*\*\//);
  });

  it("documents the fixed-UTC / DST drift tradeoff and the ~6 AM ET target", () => {
    expect(workflow).toMatch(/10:00 UTC/);
    expect(workflow).toMatch(/EDT/);
    expect(workflow).toMatch(/EST/);
    expect(workflow).toMatch(/drift|shift/i);
  });

  it("reads THE_ODDS_API_KEY from secrets only, never a literal, and never logs it", () => {
    expect(workflow).toContain("THE_ODDS_API_KEY: ${{ secrets.THE_ODDS_API_KEY }}");
    expect((workflow.match(/secrets\.THE_ODDS_API_KEY/g) ?? []).length).toBe(1);
    expect(workflow).not.toMatch(/THE_ODDS_API_KEY:\s*["'][^$]/);
    expect(workflow).not.toMatch(/echo.*THE_ODDS_API_KEY|console\.log.*THE_ODDS_API_KEY/i);
    // no api key exposed as a dispatch input
    const dispatchBlock = workflow.slice(
      workflow.indexOf("workflow_dispatch:"),
      workflow.indexOf("concurrency:"),
    );
    expect(dispatchBlock).not.toMatch(/key/i);
  });

  it("invokes ONLY the NFL current-week refresh — no CFB, no SportsDataIO, no betting splits", () => {
    expect(workflow).toContain("npm run market:betting-lines:refresh-current");
    expect(workflow).not.toMatch(/\bcfb\b|ncaaf|americanfootball_ncaaf/i);
    expect(workflow).not.toMatch(/sportsdataio|sports-data-io/i);
    expect(workflow).not.toMatch(/betting-splits|betting_splits|market:betting-splits/i);
    expect(workflow).not.toContain("--league cfb");
    expect(workflow).not.toContain("--allow-low-quota");
  });

  it("stages only the four exact NFL betting-lines artifact paths", () => {
    const commit = stepBlock("Commit and push refreshed NFL betting lines");
    expect(commit).toContain("data/market/betting-lines/history/nfl");
    expect(commit).toContain("data/market/betting-lines/quota-state.json");
    expect(commit).toContain("public/data/market/betting-lines-current.json");
    expect(commit).toContain("public/data/market/betting-lines-history/nfl");
    expect(commit).not.toContain("betting-lines/history/cfb");
    expect(commit).not.toMatch(/betting-lines-history\/cfb/);
  });

  it("never uses a blanket git add", () => {
    expect(workflow).not.toMatch(/git add\s+\.(\s|$)/);
    expect(workflow).not.toMatch(/git add\s+-A\b/);
    expect(workflow).not.toMatch(/git add\s+--all\b/);
  });

  it("does not create an empty commit and skips commit when nothing changed", () => {
    const detect = stepBlock("Detect betting-lines artifact changes");
    const commit = stepBlock("Commit and push refreshed NFL betting lines");
    expect(detect).toContain("changed=false");
    expect(commit).toContain("if: steps.changes.outputs.changed == 'true'");
    expect(commit).toContain("git diff --cached --quiet");
    expect(commit).toMatch(/empty commit/i);
  });

  it("uses the repo Node + install + shared data-writer lock conventions", () => {
    expect(workflow).toContain("node-version: 20");
    expect(workflow).toContain("run: npm ci");
    expect(workflow).toContain("main-data-writers-${{ github.repository }}");
    expect(workflow).toMatch(/permissions:\s*\n\s*contents: write/);
    expect((workflow.match(/git commit/g) ?? []).length).toBe(1);
    expect((workflow.match(/git push origin/g) ?? []).length).toBe(1);
    expect(workflow).not.toMatch(/secrets\.[A-Z_]*PAT/);
  });
});
