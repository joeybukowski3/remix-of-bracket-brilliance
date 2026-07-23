import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(path.join(process.cwd(), ".github", "workflows", "generate-mlb-hr-props.yml"), "utf8");

function indexOfStep(name: string): number {
  return workflow.indexOf(`- name: ${name}`);
}

describe("MLB K props V2 shadow workflow ordering", () => {
  it("runs after raw, workload, odds, and strikeout detail prerequisites", () => {
    const workload = indexOfStep("Generate K workload shadow");
    const finalHr = indexOfStep("Generate final HR props and best bets");
    const injectKOdds = indexOfStep("Inject pitcher K odds (line + over/under price)");
    const validateOdds = indexOfStep("Validate MLB prop odds enrichment");
    const details = indexOfStep("Generate strikeout prop row details");
    const shadow = indexOfStep("Generate K projection V2 shadow artifact");
    const validateShadow = indexOfStep("Validate K projection V2 shadow artifact");
    const xReport = indexOfStep("Report MLB prop odds enrichment");

    for (const index of [workload, finalHr, injectKOdds, validateOdds, details, shadow, validateShadow]) {
      expect(index).toBeGreaterThan(-1);
    }

    expect(shadow).toBeGreaterThan(workload);
    expect(shadow).toBeGreaterThan(finalHr);
    expect(shadow).toBeGreaterThan(injectKOdds);
    expect(shadow).toBeGreaterThan(validateOdds);
    expect(shadow).toBeGreaterThan(details);
    expect(validateShadow).toBeGreaterThan(shadow);
    expect(xReport).toBeGreaterThan(validateShadow);
  });

  it("uses package commands as the workflow entry points", () => {
    expect(workflow).toContain("run: npm run mlb:k-props-v2-shadow");
    expect(workflow).toContain("run: npm run mlb:k-props-v2-shadow:validate");
  });
});
