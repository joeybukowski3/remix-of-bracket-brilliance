import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import yaml from "js-yaml";

const read = (name) => yaml.load(readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8"));

test("fantasy delayed Tuesday run still executes rollover and bootstraps clean-runner inputs", () => {
  const workflow = read("generate-fantasy-weekly-projections.yml");
  assert.deepEqual(workflow.on.schedule, [{ cron: "0 4 * * 2", timezone: "America/New_York" }]);
  const steps = workflow.jobs["generate-weekly-projections"].steps;
  assert.ok(!steps.some((step) => step.run?.includes("SKIP_ROLLOVER=true")));
  const generator = steps.find((step) => step.name?.startsWith("Generate production weekly"));
  assert.ok(generator.run.indexOf("generate-fantasy-player-week-history.ts") < generator.run.indexOf("generate-fantasy-weekly-projections.ts"));
  assert.match(generator.run, /npx tsx scripts\/generate-fantasy-player-week-projection-dataset.ts/);
  assert.ok(steps.findIndex((step) => step.run === "npm run nfl:weekly-roster-cache") < steps.indexOf(generator));
  assert.match(steps.find((step) => step.name === "Resolve season/week").run, /exit "\$STATUS"/);
});

test("yardage core commits before DFS can fail; DFS only stages after validation", () => {
  const steps = read("nfl-yardage-projections.yml").jobs["refresh-yardage-projections"].steps;
  const core = steps.findIndex((step) => step.name === "Commit and push refreshed data");
  const dfs = steps.findIndex((step) => step.name === "Regenerate NFL DFS lineup-context artifact");
  const validate = steps.findIndex((step) => step.name === "Validate generated DFS lineup-context artifact");
  const publish = steps.findIndex((step) => step.name === "Commit and push validated DFS derivative");
  assert.ok(core > 0 && core < dfs && dfs < validate && validate < publish);
  assert.ok(!steps[core].run.includes("public/data/nfl/dfs"));
  assert.ok(steps.slice(0, core).every((step) => !step["continue-on-error"]));
  assert.ok(!steps[dfs]["continue-on-error"] && !steps[validate]["continue-on-error"]);
  assert.ok(!steps[publish].if?.includes("always"));
  // Default Actions failure semantics stop execution at the failed step:
  // a DFS failure occurs strictly after the core publish has completed.
  const executed = [];
  for (let index = 0; index < steps.length; index++) {
    executed.push(steps[index].name);
    if (index === dfs) break;
  }
  assert.ok(executed.includes("Commit and push refreshed data"));
  assert.ok(!executed.includes("Commit and push validated DFS derivative"));
});

test("TD has one independently scheduled current-slate pipeline after yardage", () => {
  const workflow = read("nfl-touchdown-preview.yml");
  assert.deepEqual(workflow.on.schedule, [{ cron: "30 10 * 1,2,9,10,11,12 *", timezone: "America/New_York" }]);
  const steps = workflow.jobs["refresh-touchdown-preview"].steps;
  const source = steps.findIndex((step) => step.name === "Validate current-week yardage candidate source");
  const generator = steps.findIndex((step) => step.name === "Generate current-week touchdown preview");
  const validator = steps.findIndex((step) => step.name === "Validate current-week touchdown preview");
  assert.ok(source < generator && generator < validator && validator < steps.length - 1);
  assert.match(steps[generator].run, /--week=\$\{\{ steps.current-week.outputs.week \}\}/);
  assert.ok(steps.every((step) => !step["continue-on-error"]));
});
