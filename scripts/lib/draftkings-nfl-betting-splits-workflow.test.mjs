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
  assert.doesNotMatch(workflow, /continue-on-error/);
  assert.doesNotMatch(fetch.run, /\|\| true/);
});

test("uses its own concurrency group instead of the 28-workflow shared writer lock", () => {
  // GitHub keeps one pending run per group and cancels older pending runs, so behind long data writers
  // these pregame refreshes were delayed 1-4 h or dropped. The workflow writes one file and its push
  // loop rebases over concurrent pushes; runs of this workflow still never overlap each other.
  assert.deepEqual(parsed.concurrency, {
    group: "nfl-betting-splits-refresh-${{ github.repository }}",
    "cancel-in-progress": false,
  });
  const withoutComments = workflow.replace(/^\s*#.*$/gm, "");
  assert.doesNotMatch(withoutComments, /main-data-writers/);
  const publish = step("Commit and push validated current artifact");
  assert.match(publish.run, /git rebase origin\/main/);
  assert.match(publish.run, /for attempt in 1 2 3 4 5/);
});

test("deployment is Vercel's push-triggered build, not a GitHub Pages workflow call", () => {
  // The site is served by Vercel, which builds every push to main (data-only commits included).
  // A Pages deploy here only rebuilt an unused github.io mirror, so there must be no such job.
  assert.deepEqual(Object.keys(parsed.jobs), ["refresh-nfl-betting-splits"]);
  assert.doesNotMatch(workflow, /deploy\.yml|deploy-pages|pages:\s*write/);
  assert.equal(parsed.jobs["refresh-nfl-betting-splits"].outputs, undefined);
});
