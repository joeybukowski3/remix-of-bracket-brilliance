import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const workflow = readFileSync(".github/workflows/generate-mlb-hr-props.yml", "utf8");

describe("Projected K daily snapshot workflow integration", () => {
  it("archives only after workload/V2 validation and production resolution", () => {
    const workloadValidation = workflow.indexOf("name: Validate K workload shadow");
    const v2Validation = workflow.indexOf("name: Validate K projection V2 shadow artifact");
    const resolver = workflow.indexOf("name: Resolve production K projection");
    const archive = workflow.indexOf("name: Preserve date-keyed Projected K inputs and outputs");
    assert.ok(workloadValidation >= 0 && v2Validation > workloadValidation);
    assert.ok(resolver > v2Validation);
    assert.ok(archive > resolver);
  });

  it("gates optional artifacts on their successful producer/validator outcomes", () => {
    assert.match(workflow, /steps\.generate_k_workload_shadow\.outcome.*steps\.validate_k_workload_shadow\.outcome/s);
    assert.match(workflow, /steps\.generate_k_props_v2_shadow\.outcome.*steps\.validate_k_props_v2_shadow\.outcome/s);
    assert.match(workflow, /steps\.fetch_odds\.outcome.*steps\.validate_prop_odds\.outcome/s);
    assert.match(workflow, /steps\.generate_k_details\.outcome/);
    assert.match(workflow, /steps\.fetch_team_wrc\.outcome/);
  });

  it("uploads the ignored data archive without adding it to the production Git staging path", () => {
    const upload = workflow.indexOf("name: Upload compressed Projected K daily snapshot");
    const archive = workflow.indexOf("name: Preserve date-keyed Projected K inputs and outputs");
    assert.ok(upload > archive);
    assert.match(workflow, /path: data\/mlb\/k-history\/daily\/\$\{\{ needs\.slate-check\.outputs\.slate_date \}\}\//);
    assert.match(workflow, /--workflow-run-id="\$\{\{ github\.run_id \}\}"/);
    assert.match(workflow, /--workflow-run-attempt="\$\{\{ github\.run_attempt \}\}"/);
    assert.match(workflow, /name: mlb-k-history-\$\{\{ needs\.slate-check\.outputs\.slate_date \}\}-\$\{\{ steps\.archive_k_history\.outputs\.snapshot_id \}\}/);
    assert.doesNotMatch(workflow, /git add[^\n]*data\/mlb\/k-history/);
  });
});
