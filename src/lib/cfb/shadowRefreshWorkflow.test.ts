import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(path.join(process.cwd(), ".github", "workflows", "cfb-v2-shadow-refresh.yml"), "utf8");
const deployWorkflow = readFileSync(path.join(process.cwd(), ".github", "workflows", "deploy.yml"), "utf8");

function indexOfStep(name: string): number {
  return workflow.indexOf(`- name: ${name}`);
}

describe("CFB Model V2 shadow refresh workflow — WU5 §23/§25 static assertions", () => {
  it("triggers on both a schedule and manual dispatch", () => {
    expect(workflow).toMatch(/on:\s*\n\s*schedule:/);
    expect(workflow).toContain("workflow_dispatch:");
  });

  it("runs exactly once per week (Monday only) — a second midweek run would be byte-identical output, not fresher (see cron comment)", () => {
    expect(workflow).toContain('cron: "0 8 * 8,9,10,11,12,1 1"');
    expect(workflow).not.toMatch(/cron:.*,4["']/); // no Thursday (day-of-week 4) trigger
  });

  it("uses a dedicated concurrency group with a deliberate cancel-in-progress choice", () => {
    expect(workflow).toMatch(/concurrency:\s*\n\s*group: cfb-v2-shadow-refresh/);
    expect(workflow).toContain("cancel-in-progress: true");
  });

  it("runs fetch -> build -> audit -> summary -> publish -> commit -> upload, in that order (WU5 §13 / WU6 §7 / WU7A §19)", () => {
    const fetch = indexOfStep("Fetch current CFBD inputs");
    const build = indexOfStep("Build + validate + atomically promote V2 shadow state");
    const audit = indexOfStep("Audit shadow state");
    const summary = indexOfStep("Write job summary");
    const publish = indexOfStep("Publish browser artifact");
    const detect = indexOfStep("Detect browser artifact changes");
    const commit = indexOfStep("Commit and push browser artifact");
    const upload = indexOfStep("Upload shadow manifest + audit summary");
    for (const index of [fetch, build, audit, summary, publish, detect, commit, upload]) expect(index).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(fetch);
    expect(audit).toBeGreaterThan(build);
    expect(summary).toBeGreaterThan(audit);
    expect(publish).toBeGreaterThan(summary);
    expect(detect).toBeGreaterThan(publish);
    expect(commit).toBeGreaterThan(detect);
    expect(upload).toBeGreaterThan(commit);
  });

  it("the publish/commit steps only run after the audit step — an INVALID audit exit stops the job before they execute", () => {
    const audit = indexOfStep("Audit shadow state");
    const publish = indexOfStep("Publish browser artifact");
    // No `if: always()` on publish/commit -- default GH Actions behavior
    // is "only run if all previous steps succeeded", so an audit failure
    // (non-zero exit on INVALID) naturally blocks these steps.
    const betweenAuditAndPublish = workflow.slice(audit, publish);
    // "Write job summary" is the one step allowed if:always() between them; publish/commit themselves must NOT carry if:always().
    const publishBlock = workflow.slice(publish, publish + 200);
    const commitIndex = indexOfStep("Commit and push browser artifact");
    const commitBlock = workflow.slice(commitIndex, commitIndex + 300);
    expect(publishBlock).not.toContain("if: always()");
    expect(commitBlock).toContain("if: steps.changes.outputs.changed == 'true'");
    expect(betweenAuditAndPublish).toContain("Write job summary");
  });

  it("uses the package script entry points, never inlined model logic", () => {
    expect(workflow).toContain("run: npm run cfb:fetch-data");
    expect(workflow).toContain("run: npm run cfb:v2:build-shadow");
    expect(workflow).toContain("run: npm run cfb:v2:audit-shadow");
    expect(workflow).toContain("run: npm run cfb:v2:publish-browser-artifact");
  });

  it("commits ONLY the compact browser artifact path, never the internal shadow artifacts, audit summary, raw CFBD cache, or unrelated public/data files (WU7A checkpoint §3)", () => {
    const commitIndex = indexOfStep("Commit and push browser artifact");
    const commitBlock = workflow.slice(commitIndex, commitIndex + 1200);
    expect(commitBlock).toContain("git add public/data/cfb/v2/shadow-projections.json");
    // Exactly one `git add` invocation in this step, so there is no way a
    // second, broader add could sneak in alongside the narrow one.
    expect((commitBlock.match(/git add /g) ?? []).length).toBe(1);
    expect(commitBlock).not.toContain("data/generated/cfb/v2");
    expect(commitBlock).not.toContain("audit-summary.json");
    expect(commitBlock).not.toContain("manifest.json");
    expect(commitBlock).not.toContain("data/cfb/cfbd/raw");
    expect(commitBlock).not.toMatch(/public\/data\/nfl|public\/data\/pga|public\/data\/mlb|public\/data\/betting-splits|public\/data\/polymarket/);
    expect(commitBlock).not.toMatch(/git add \.|git add -A|git add --all/);
  });

  it("an unchanged browser artifact skips the commit step entirely — no empty commit, job still succeeds (WU7A checkpoint §3)", () => {
    const detectIndex = indexOfStep("Detect browser artifact changes");
    const commitIndex = indexOfStep("Commit and push browser artifact");
    const detectBlock = workflow.slice(detectIndex, commitIndex);
    const commitBlock = workflow.slice(commitIndex, commitIndex + 400);
    // The gate is computed from the artifact path's own git status, and
    // the commit step is conditioned on it — so "unchanged" means the
    // step (and its git commit/push) never runs at all, which GitHub
    // Actions reports as "skipped", not a failure.
    expect(detectBlock).toContain("git status --porcelain -- 'public/data/cfb/v2/shadow-projections.json'");
    expect(detectBlock).toContain("changed=false");
    expect(commitBlock).toContain("if: steps.changes.outputs.changed == 'true'");
    // Defense-in-depth: even if reached, an empty diff still exits 0 cleanly.
    const fullCommitBlock = workflow.slice(commitIndex, commitIndex + 1200);
    expect(fullCommitBlock).toContain("git diff --cached --quiet");
  });

  it("deploys Pages only after a changed browser artifact was committed and pushed successfully", () => {
    const commitIndex = indexOfStep("Commit and push browser artifact");
    const uploadIndex = indexOfStep("Upload shadow manifest + audit summary");
    const commitBlock = workflow.slice(commitIndex, uploadIndex);
    const deployJob = workflow.slice(workflow.indexOf("  deploy-pages:"));

    expect(workflow).toContain("deploy_ref: ${{ steps.commit.outputs.pushed_commit }}");
    expect(commitBlock).toContain('echo "pushed_commit=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"');
    expect(commitBlock.indexOf("git push origin HEAD:main")).toBeLessThan(commitBlock.indexOf("pushed_commit="));
    expect(deployJob).toContain("needs: refresh-shadow-state");
    expect(deployJob).toContain("if: needs.refresh-shadow-state.outputs.deploy_ref != ''");
    expect(deployJob).toContain("uses: ./.github/workflows/deploy.yml");
    expect(deployJob).toContain("ref: ${{ needs.refresh-shadow-state.outputs.deploy_ref }}");
  });

  it("exposes the Pages workflow as a native reusable workflow and checks out the exact pushed commit", () => {
    expect(deployWorkflow).toContain("workflow_call:");
    expect(deployWorkflow).toMatch(/workflow_call:\s*\n\s*inputs:\s*\n\s*ref:/);
    expect(deployWorkflow).toContain("ref: ${{ inputs.ref || github.sha }}");
  });

  it("runs the summary and upload steps even on failure (if: always()), so a failed run is still inspectable", () => {
    const summaryIndex = indexOfStep("Write job summary");
    const uploadIndex = indexOfStep("Upload shadow manifest + audit summary");
    const summaryBlock = workflow.slice(summaryIndex, uploadIndex);
    const uploadBlock = workflow.slice(uploadIndex, uploadIndex + 400);
    expect(summaryBlock).toContain("if: always()");
    expect(uploadBlock).toContain("if: always()");
  });

  it("uploads only the compact manifest + audit summary, never the full ratings/projections artifacts or raw CFBD cache", () => {
    const uploadIndex = indexOfStep("Upload shadow manifest + audit summary");
    const uploadBlock = workflow.slice(uploadIndex, uploadIndex + 400);
    expect(uploadBlock).toContain("data/generated/cfb/v2/manifest.json");
    expect(uploadBlock).toContain("data/generated/cfb/v2/audit-summary.json");
    expect(uploadBlock).not.toMatch(/preseason-ratings\.json|preseason-projections\.json|week-\d+-ratings|week-\d+-projections/);
    expect(uploadBlock).not.toContain("data/cfb/cfbd/raw");
  });

  it("passes CFBD_API_KEY from secrets, never a literal value, and never exposes it outside the fetch step", () => {
    expect(workflow).toContain("CFBD_API_KEY: ${{ secrets.CFBD_API_KEY }}");
    expect(workflow).not.toMatch(/CFBD_API_KEY:\s*["'][^$][^{]/);
    // Exactly one env block should reference the secret — the fetch step.
    const occurrences = (workflow.match(/secrets\.CFBD_API_KEY/g) ?? []).length;
    expect(occurrences).toBe(1);
    expect(workflow).not.toMatch(/echo.*CFBD_API_KEY|console\.log.*CFBD_API_KEY/i);
  });

  it("WU7A: requests write permission (needed for the one narrow commit), never touches unrelated write scopes", () => {
    expect(workflow).toMatch(/permissions:\s*\n\s*contents: write/);
    // Exactly one commit and one push, both scoped to the single artifact path (checked in the commit-block test above).
    expect((workflow.match(/git commit/g) ?? []).length).toBe(1);
    expect((workflow.match(/git push/g) ?? []).length).toBe(1);
  });

  it("never checks out or touches V1/V1.1/marketAnchor/UI paths", () => {
    expect(workflow).not.toMatch(/marketAnchor|public\/data\/nfl|src\/pages|src\/components/);
  });
});
