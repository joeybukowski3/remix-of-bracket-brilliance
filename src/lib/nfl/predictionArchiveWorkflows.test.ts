import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());
const matchup = readFileSync(resolve(ROOT, ".github/workflows/nfl-matchup-projections.yml"), "utf8");
const yardage = readFileSync(resolve(ROOT, ".github/workflows/nfl-yardage-projections.yml"), "utf8");

function commitBlock(workflow: string): string {
  const start = workflow.indexOf("- name: Commit and push refreshed data");
  if (start < 0) throw new Error("commit step missing");
  return workflow.slice(start);
}

describe("WU1 prediction archive workflow persistence", () => {
  it("preserves the shared safe writer lock and existing push retry pattern", () => {
    for (const workflow of [matchup, yardage]) {
      expect(workflow).toContain("group: main-data-writers-${{ github.repository }}");
      expect(workflow).toContain("cancel-in-progress: false");
      expect(workflow).toContain("for attempt in 1 2 3 4 5");
      expect(workflow).toContain("git rebase origin/main");
      expect(workflow).toContain("git push origin HEAD:main");
    }
  });

  it("keeps each existing live artifact in its commit allowlist", () => {
    expect(commitBlock(matchup)).toContain("git add public/data/nfl/matchup-projections.json");
    expect(commitBlock(yardage)).toContain("public/data/nfl/${{ steps.current-week.outputs.season }}/team-opportunity.json");
    expect(commitBlock(yardage)).toContain("public/data/nfl/${{ steps.current-week.outputs.season }}/yardage-projections.json");
  });

  it("stages only validated spread archive paths in the matchup workflow", () => {
    const block = commitBlock(matchup);
    expect(block).toContain("^data/nfl/predictions/2026/[0-9]{2}/jkb-power-number\\.jsonl$");
    expect(block).toContain("^data/nfl/predictions/manifests/sources/[0-9a-f]{64}\\.json$");
    expect(block).toContain('git add -- "$archive_path"');
    expect(block).toContain("Refusing unexpected prediction archive path");
  });

  // WU4C.1: the yardage workflow's archive-path validation moved to the
  // shared, unit-tested scripts/lib/nfl-prediction-archive-allowlist.mjs
  // module (see nfl-prediction-archive-allowlist.test.mjs for the exact
  // partitions it accepts/rejects, including team-opportunity) instead of an
  // inline regex -- this only asserts the workflow actually delegates to it.
  it("delegates yardage-workflow archive-path validation to the shared allowlist module", () => {
    const block = commitBlock(yardage);
    expect(block).toContain("node scripts/lib/nfl-prediction-archive-allowlist.mjs predictions");
    expect(block).toContain('git add -- "$archive_path"');
    expect(block).not.toMatch(/data\/nfl\/predictions\/\$\{archive_season\}\/\[0-9\]\{2\}\/nfl-\(/);
  });

  it("generates WU4A team opportunity before current-week yardage projections, on the same fresh runner", () => {
    const teamOpp = yardage.indexOf("- name: Generate WU4A team opportunity");
    const projections = yardage.indexOf("- name: Generate current-week yardage projections");
    expect(teamOpp).toBeGreaterThan(-1);
    expect(teamOpp).toBeLessThan(projections);
    expect(yardage).toContain("npm run nfl:team-opportunity -- --season=${{ steps.current-week.outputs.season }} --week=${{ steps.current-week.outputs.week }}");
    // No continue-on-error on the WU4A step: a failure stops the job before
    // the projections step (and therefore receiving v2) is ever reached.
    const teamOppBlock = yardage.slice(teamOpp, projections);
    expect(teamOppBlock).not.toContain("continue-on-error");
  });

  it("never uses a blanket Git add for archive persistence", () => {
    for (const workflow of [matchup, yardage]) {
      const block = commitBlock(workflow);
      expect(block).not.toMatch(/git add\s+(?:-A|--all|\.)\b/);
      expect(block).not.toMatch(/git add(?:\s+--)??\s+['"]?data\/nfl\/predictions['"]?\s*$/m);
    }
  });
});
