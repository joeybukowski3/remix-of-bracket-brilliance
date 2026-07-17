#!/usr/bin/env node
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createSharedMlbXPollPlan } from "./lib/mlb-x-poll-gate.mjs";
import { PollPlanState } from "./lib/mlb-x-poll-plan.mjs";

const ROOT = process.cwd();

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function writeJson(filePath, value) {
  const resolved = path.resolve(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`);
  return path.relative(ROOT, resolved).replaceAll("\\", "/");
}

function emit(outputs) {
  const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}`);
  for (const line of lines) console.log(`[mlb-x-poll] ${line}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
}

const result = await createSharedMlbXPollPlan({
  hrStateDir: path.resolve(arg("hr-state-dir", ".cache/mlb-hr-props-x-posted")),
  kStateDir: path.resolve(arg("k-state-dir", ".cache/mlb-strikeout-props-x-posted")),
});

const planPath = writeJson(arg("plan-path", "artifacts/mlb-x-poll-plan.json"), result.plan);
const snapshotPath = result.snapshot
  ? writeJson(arg("snapshot-path", "artifacts/mlb-x-poll-snapshot.json"), result.snapshot)
  : "";

emit({
  slate_date: result.plan.slateDate,
  both_posted: result.plan.bothAlreadyPosted,
  hr_should_run: result.plan.hr.shouldRun,
  k_should_run: result.plan.k.shouldRun,
  hr_status: result.plan.hr.reason,
  k_status: result.plan.k.reason,
  // Game-diversity/coverage reporting for the HR readiness gate -- see
  // mlb-x-readiness.mjs's formatGameCoverageLogLine. Never claims full-slate
  // coverage from a raw headcount; "n/a"/0 once already posted or before any
  // live data has been evaluated.
  hr_confirmed_game_count: result.plan.hr.confirmedGameCount ?? "n/a",
  hr_scheduled_game_count: result.plan.hr.scheduledGameCount ?? "n/a",
  hr_confirmed_game_coverage:
    result.plan.hr.confirmedGameCoverage != null ? result.plan.hr.confirmedGameCoverage.toFixed(2) : "n/a",
  hr_confirmed_rows_without_game_identity: result.plan.hr.confirmedRowsWithoutGameIdentity ?? 0,
  plan_path: planPath,
  snapshot_path: snapshotPath,
});

const bothFailed =
  result.plan.hr.state === PollPlanState.SOURCE_FAILURE &&
  result.plan.k.state === PollPlanState.SOURCE_FAILURE;
if (bothFailed) process.exitCode = 1;
