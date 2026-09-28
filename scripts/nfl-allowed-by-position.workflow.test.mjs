import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import yaml from "js-yaml";

const read = (name) => yaml.load(readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8"));
const workflow = read("nfl-allowed-by-position.yml");
const steps = workflow.jobs["refresh-allowed-by-position"].steps;
const stepIndex = (name) => steps.findIndex((step) => step.name === name);

test("runs Friday, Monday and Tuesday at 8:00 AM Eastern during NFL-season months", () => {
  assert.deepEqual(workflow.on.schedule, [
    { cron: "0 8 * 1,2,9,10,11,12 5", timezone: "America/New_York" },
    { cron: "0 8 * 1,2,9,10,11,12 1", timezone: "America/New_York" },
    { cron: "0 8 * 1,2,9,10,11,12 2", timezone: "America/New_York" },
  ]);
});

test("supports a manual backfill with an optional season input", () => {
  assert.equal(workflow.on.workflow_dispatch.inputs.season.required, false);
  const resolve = steps[stepIndex("Resolve season")];
  assert.equal(resolve.env.SEASON_INPUT, "${{ inputs.season }}");
  assert.ok(!resolve.run.includes("${{ inputs.season }}"), "input must reach the shell via env, not interpolation");
});

test("shares the yardage workflow's data-writer lock", () => {
  assert.equal(workflow.concurrency.group, read("nfl-yardage-projections.yml").concurrency.group);
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
});

test("refreshes the cache, then generates and validates every artifact before committing", () => {
  const order = [
    "Refresh player-week stats cache",
    "Generate TDs Allowed by Position",
    "Validate TDs Allowed by Position",
    "Generate Fantasy Points Allowed by Position",
    "Validate Fantasy Points Allowed by Position",
    "Generate Yards vs Average by Position",
    "Validate Yards vs Average by Position",
    "Commit and push refreshed data",
  ].map(stepIndex);
  assert.ok(order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1])), `unexpected step order ${order}`);
  assert.match(steps[order[0]].run, /fantasy:player-week-cache -- --seasons=\$\{\{ steps\.season\.outputs\.season \}\} --partial-season=\$\{\{ steps\.season\.outputs\.season \}\}/);
  assert.match(steps[order[3]].run, /npm run nfl:fantasy-points-allowed/);
  assert.match(steps[order[4]].run, /npm run nfl:validate-fantasy-points-allowed/);
  assert.match(steps[order[5]].run, /npm run nfl:yards-vs-average -- --season=\$\{\{ steps\.season\.outputs\.season \}\}/);
  assert.match(steps[order[6]].run, /npm run nfl:validate-yards-vs-average -- --season=\$\{\{ steps\.season\.outputs\.season \}\}/);
});

test("is independent of the yardage model chain and only the diagnostics step may fail softly", () => {
  const runs = steps.map((step) => step.run ?? "").join("\n");
  for (const script of ["nfl:team-opportunity", "nfl:totals", "nfl:current-week-projections", "nfl:matchup-market"]) {
    assert.ok(!runs.includes(script), `must not depend on ${script}`);
  }
  const soft = steps.filter((step) => step["continue-on-error"]).map((step) => step.name);
  assert.deepEqual(soft, ["Refresh schedule/results for coverage diagnostics"]);
});

test("commits only the cache and the three artifacts, and skips idle runs", () => {
  const commit = steps[stepIndex("Commit and push refreshed data")].run;
  for (const path of [
    "public/data/nfl/fantasy-points-allowed.json",
    "public/data/nfl/tds-allowed-by-position.json",
    "public/data/nfl/yards-vs-average-by-position.json",
    "stats_player_week_${season}.csv",
    "data/nfl/nflverse/stats-player-week/manifest.json",
  ]) assert.ok(commit.includes(path), `missing ${path}`);
  assert.ok(!/git add[^\n]*(games|results)\.json/.test(commit), "schedule files belong to nfl-schedules-results.yml");
  assert.match(commit, /git diff --cached --quiet/);
  assert.match(commit, /delete value\.generatedAt/);
});

test("the yardage workflow keeps regenerating Fantasy Points Allowed as a backstop", () => {
  const yardage = read("nfl-yardage-projections.yml").jobs["refresh-yardage-projections"].steps;
  const find = (name) => yardage.findIndex((step) => step.name === name);
  const tdsValidate = find("Validate TDs Allowed by Position coverage");
  const generate = find("Generate Fantasy Points Allowed by Position");
  const validate = find("Validate Fantasy Points Allowed by Position");
  const publish = find("Commit and push validated DFS yardage history");
  assert.ok(tdsValidate > 0 && tdsValidate < generate && generate < validate && validate < publish);
  assert.ok(yardage[publish].run.includes("public/data/nfl/fantasy-points-allowed.json"));
});

test("Yards vs Avg is not part of the yardage-projections backstop (Phase 1)", () => {
  const yardage = read("nfl-yardage-projections.yml").jobs["refresh-yardage-projections"].steps;
  const runs = yardage.map((step) => step.run ?? "").join("\n");
  assert.ok(!runs.includes("nfl:yards-vs-average"));
  assert.ok(!runs.includes("yards-vs-average-by-position.json"));
});
