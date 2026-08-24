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

  it("runs fetch before build (fetch -> build order, WU5 §13)", () => {
    const fetch = indexOfStep("Fetch current CFBD inputs");
    const build = indexOfStep("Build + validate + atomically promote V2 shadow state");
    expect(fetch).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(fetch);
  });

  it("uses the package script entry points, never inlined model logic", () => {
    expect(workflow).toContain("run: npm run cfb:fetch-data");
    expect(workflow).toContain("run: npm run cfb:v2:build-shadow");
  });

  it("passes CFBD_API_KEY from secrets, never a literal value", () => {
    expect(workflow).toContain("CFBD_API_KEY: ${{ secrets.CFBD_API_KEY }}");
    expect(workflow).not.toMatch(/CFBD_API_KEY:\s*["'][^$][^{]/);
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
