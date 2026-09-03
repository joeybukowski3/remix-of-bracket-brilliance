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
      expect(workflow).toContain("cancel-in-progress: false");
      expect(workflow).toContain("for attempt in 1 2 3 4 5");
    }
  });

  it("keeps the matchup workflow hard-coded to main (not yet branch-aware)", () => {
    expect(matchup).toContain("group: main-data-writers-${{ github.repository }}");
    expect(matchup).toContain("git rebase origin/main");
    expect(matchup).toContain("git push origin HEAD:main");
  });

  // Commit a7eace08: the yardage workflow used to hard-code `ref: main` at
  // checkout and `origin/main`/`HEAD:main` at push, so a workflow_dispatch
  // run against a feature branch would silently check out and push to main.
  // These assertions cover the branch-aware replacement end to end rather
  // than pinning exact hard-coded main strings.
  it("resolves and pushes to a dispatch-selected branch in the yardage workflow, defaulting to main on schedule", () => {
    expect(yardage).toContain("group: main-data-writers-${{ github.repository }}-${{ github.ref_name }}");

    // workflow_dispatch resolves from github.ref_name; schedule resolves
    // explicitly to main, never inferred.
    const resolveStart = yardage.indexOf("- name: Resolve target branch");
    expect(resolveStart).toBeGreaterThan(-1);
    const checkoutStart = yardage.indexOf("- name: Check out repository");
    expect(checkoutStart).toBeGreaterThan(resolveStart);
    const resolveBlock = yardage.slice(resolveStart, checkoutStart);
    expect(resolveBlock).toContain('event_name="${{ github.event_name }}"');
    expect(resolveBlock).toContain('ref_name="${{ github.ref_name }}"');
    expect(resolveBlock).toContain('if [ "$event_name" = "workflow_dispatch" ]');
    expect(resolveBlock).toContain('branch="$ref_name"');
    expect(resolveBlock).toContain('elif [ "$event_name" = "schedule" ]');
    expect(resolveBlock).toContain('branch="main"');

    // Checkout uses the resolved target branch, not a hard-coded ref.
    const checkoutBlock = yardage.slice(checkoutStart, yardage.indexOf("- name: Verify checkout branch"));
    expect(checkoutBlock).toContain("ref: ${{ steps.target-branch.outputs.branch }}");
    expect(checkoutBlock).not.toContain("ref: main");

    // Push retry loop fetches/rebases/pushes against the resolved branch.
    const commit = commitBlock(yardage);
    expect(commit).toContain('target_branch="${{ steps.target-branch.outputs.branch }}"');
    expect(commit).toContain('git fetch origin "$target_branch"');
    expect(commit).toContain('git rebase "origin/$target_branch"');
    expect(commit).toContain('git push origin "HEAD:$target_branch"');
    expect(commit).not.toContain("git rebase origin/main");
    expect(commit).not.toContain("git push origin HEAD:main");

    // Fail-closed guard: a workflow_dispatch run must never push to a branch
    // other than the one it checked out.
    expect(commit).toContain('if [ "${{ github.event_name }}" = "workflow_dispatch" ] && [ "$target_branch" != "$checked_out_branch" ]');
    expect(commit).toContain("refusing to push");
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
