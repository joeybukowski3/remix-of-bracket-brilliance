import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(path.join(process.cwd(), ".github", "workflows", "cfb-v2-shadow-refresh.yml"), "utf8");

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

  it("runs fetch -> build -> audit -> summary -> upload, in that order (WU5 §13 / WU6 §7)", () => {
    const fetch = indexOfStep("Fetch current CFBD inputs");
    const build = indexOfStep("Build + validate + atomically promote V2 shadow state");
    const audit = indexOfStep("Audit shadow state");
    const summary = indexOfStep("Write job summary");
    const upload = indexOfStep("Upload shadow manifest + audit summary");
    for (const index of [fetch, build, audit, summary, upload]) expect(index).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(fetch);
    expect(audit).toBeGreaterThan(build);
    expect(summary).toBeGreaterThan(audit);
    expect(upload).toBeGreaterThan(summary);
  });

  it("uses the package script entry points, never inlined model logic", () => {
    expect(workflow).toContain("run: npm run cfb:fetch-data");
    expect(workflow).toContain("run: npm run cfb:v2:build-shadow");
    expect(workflow).toContain("run: npm run cfb:v2:audit-shadow");
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

  it("requests only read permissions — this workflow never commits or pushes generated output", () => {
    expect(workflow).toMatch(/permissions:\s*\n\s*contents: read/);
    expect(workflow).not.toContain("contents: write");
    expect(workflow).not.toContain("git commit");
    expect(workflow).not.toContain("git push");
  });

  it("never checks out or touches V1/V1.1/marketAnchor/UI paths", () => {
    expect(workflow).not.toMatch(/marketAnchor|public\/data\/nfl|src\/pages|src\/components/);
  });
});
