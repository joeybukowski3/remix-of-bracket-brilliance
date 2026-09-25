import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import yaml from "js-yaml";

const workflow = readFileSync(new URL("../../.github/workflows/nfl-betting-splits-refresh.yml", import.meta.url), "utf8");
const parsed = yaml.load(workflow);
const steps = parsed.jobs["refresh-nfl-betting-splits"].steps;
const step = (name) => steps.find((entry) => entry.name === name);
const scripts = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url))).scripts;

test("scheduled and manual refresh use one Node generator with manual dry-run default", () => {
  assert.deepEqual(parsed.on.schedule, [{ cron: "37 8,12,17 * 1,9,10,11,12 *", timezone: "America/New_York" }]);
  assert.equal(parsed.on.workflow_dispatch.inputs.dry_run.default, true);
  assert.equal(scripts["generate:nfl-betting-splits"], "node scripts/generate-nfl-betting-splits.mjs");
  assert.match(step("Fetch and validate current NFL betting splits").run, /npm run generate:nfl-betting-splits -- --dry-run/);
  assert.match(step("Fetch and validate current NFL betting splits").run, /npm run generate:nfl-betting-splits\s*$/m);
  assert.doesNotMatch(workflow, /--input-dir|--capture-manifest|playwright|puppeteer/i);
});

test("publication is gated by live verification and stages only current.json", () => {
  const gate = step("Require verified live fetch before publication");
  const fetch = step("Fetch and validate current NFL betting splits");
  const publish = step("Commit and push validated current artifact");
  assert.ok(steps.indexOf(gate) < steps.indexOf(fetch));
  assert.equal(gate.env.LIVE_VERIFIED, "${{ vars.NFL_DK_SPLITS_LIVE_VERIFIED }}");
  assert.match(gate.run, /exit 1/);
  assert.match(publish.run, /git add -- public\/data\/nfl\/betting-splits\/current\.json/);
  assert.doesNotMatch(publish.run, /git add\s+(?:\.|-A|--all)\b/);
  assert.match(publish.run, /git diff --cached --quiet/);
  assert.match(workflow, /main-data-writers-\$\{\{ github\.repository \}\}/);
  assert.doesNotMatch(workflow, /continue-on-error/);
  assert.doesNotMatch(fetch.run, /\|\| true/);
  const deploy = parsed.jobs["deploy-pages"];
  assert.equal(deploy.uses, "./.github/workflows/deploy.yml");
  assert.equal(deploy.if, "needs.refresh-nfl-betting-splits.outputs.deploy_ref != ''");
  assert.equal(deploy.with.ref, "${{ needs.refresh-nfl-betting-splits.outputs.deploy_ref }}");
  assert.match(publish.run, /pushed_commit=\$\(git rev-parse HEAD\)/);
});
