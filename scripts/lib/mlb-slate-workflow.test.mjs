import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { runSlateGate } from "./mlb-slate-gate.mjs";

const dataWorkflow = readFileSync(".github/workflows/generate-mlb-hr-props.yml", "utf8");
const numerologyWorkflow = readFileSync(".github/workflows/generate-mlb-numerology.yml", "utf8");
const noGameMessage = "No MLB games scheduled for ${SLATE_DATE} ET. Workflow completed as a successful no-op.";

test("Generate MLB Data gates the entire provider and generation job before npm ci", () => {
  const gate = section(dataWorkflow, "  slate-check:", "  generate-mlb-data:");
  const generation = dataWorkflow.slice(dataWorkflow.indexOf("  generate-mlb-data:"));
  assert.match(gate, /node scripts\/lib\/mlb-slate-gate\.mjs --date/);
  assert.doesNotMatch(gate, /npm ci|ODDS_API_KEY|GROK_API_KEY|generate-mlb|fetch-mlb-odds|git commit|git push/);
  assert.match(generation, /needs: slate-check/);
  assert.match(generation, /if: needs\.slate-check\.outputs\.has_games == 'true'/);
  assert.match(generation, /npm ci/);
  assert.match(generation, /fetch-mlb-odds\.mjs/);
  assert.match(generation, /generate-mlb-hr-props-with-k-shadow\.mjs/);
  assert.match(generation, /git commit/);
  assert.match(generation, /git push/);
  assert.ok(dataWorkflow.indexOf("mlb-slate-gate.mjs --date") < dataWorkflow.indexOf("npm ci"));
});

test("Generate MLB Numerology applies the authoritative slate gate before catch-up scheduling", () => {
  const gate = section(numerologyWorkflow, "  slate-check:", "  generate-numerology:");
  const generation = numerologyWorkflow.slice(numerologyWorkflow.indexOf("  generate-numerology:"));
  assert.match(gate, /node scripts\/lib\/mlb-slate-gate\.mjs --date/);
  assert.doesNotMatch(gate, /npm ci|GROK_API_KEY|numerology-gate-runner|filter-mlb-numerology-active|git commit|git push/);
  assert.match(generation, /needs: slate-check/);
  assert.match(generation, /if: needs\.slate-check\.outputs\.has_games == 'true'/);
  assert.ok(numerologyWorkflow.indexOf("mlb-slate-gate.mjs --date") < numerologyWorkflow.indexOf("npm ci"));
  assert.ok(generation.indexOf("npm ci") < generation.indexOf("numerology-gate-runner.mjs"));
  assert.ok(generation.indexOf("numerology-gate-runner.mjs") < generation.indexOf("generate-mlb-numerology.mjs"));
  assert.match(generation, /filter-mlb-numerology-active\.mjs/);
  assert.match(generation, /git commit/);
  assert.match(generation, /git push/);
});

test("both workflows expose the manual ET date and a complete successful no-op summary", () => {
  for (const workflow of [dataWorkflow, numerologyWorkflow]) {
    assert.match(workflow, /date:\s*\n\s+description: "Optional Eastern Time slate date \(YYYY-MM-DD\)"/);
    assert.match(workflow, /has_games: \$\{\{ steps\.slate\.outputs\.has_games \}\}/);
    assert.match(workflow, /game_count: \$\{\{ steps\.slate\.outputs\.game_count \}\}/);
    assert.match(workflow, /slate_date: \$\{\{ steps\.slate\.outputs\.slate_date \}\}/);
    assert.match(workflow, /reason: \$\{\{ steps\.slate\.outputs\.reason \}\}/);
    assert.ok(workflow.includes(noGameMessage));
    assert.match(workflow, /No providers were called\./);
    assert.match(workflow, /No generated files changed\./);
    assert.match(workflow, /No commit was attempted\./);
  }
});

test("a mocked blank slate is a successful no-op with unchanged production JSON", async () => {
  const generatedFiles = [
    "public/data/mlb/hr-props-raw.json",
    "public/data/mlb/numerology-daily.json",
  ].filter(existsSync);
  const before = new Map(generatedFiles.map((file) => [file, hash(file)]));
  const calls = { providers: 0, generators: 0, commits: 0 };
  const result = await simulateWorkflow({ dates: [] }, calls);
  assert.equal(result.exitCode, 0);
  assert.equal(result.hasGames, "false");
  assert.deepEqual(calls, { providers: 0, generators: 0, commits: 0 });
  assert.deepEqual(new Map(generatedFiles.map((file) => [file, hash(file)])), before);
});

test("a mocked normal slate keeps the existing execution path available", async () => {
  const calls = { providers: 0, generators: 0, commits: 0 };
  const result = await simulateWorkflow({ dates: [{ games: [{ gamePk: 1 }] }] }, calls);
  assert.equal(result.exitCode, 0);
  assert.equal(result.hasGames, "true");
  assert.deepEqual(calls, { providers: 1, generators: 1, commits: 1 });
});

async function simulateWorkflow(payload, calls) {
  const result = await runSlateGate({
    args: ["--date", "2026-07-13"],
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => payload }),
    emitOutput: () => {},
    log: () => {},
    logError: () => {},
  });
  if (result.hasGames === "true") {
    calls.providers += 1;
    calls.generators += 1;
    calls.commits += 1;
  }
  return result;
}

function section(source, start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

function hash(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}
