#!/usr/bin/env node
/**
 * plan-mlb-numerology-delivery.mjs
 *
 * Shared plan/artifact builder for Numerology's email + X delivery, mirroring
 * plan-mlb-x-posts.mjs's HR/K pattern. Runs once per poll attempt in the
 * "plan" job of poll-mlb-numerology-delivery.yml:
 *
 *   1. Check both surfaces' independent delivery receipts. If both are
 *      already delivered today, exit cheaply without any live-data fetch.
 *   2. Otherwise, build today's numerology card (same ranked candidate pool
 *      the site/email/X have always used -- scoring/ranking untouched) and
 *      a live confirmation snapshot on Numerology's first-pitch-relative
 *      120/75/30 window.
 *   3. Resolve confirmed-lineup-only readiness/selection.
 *   4. When ready, freeze the confirmed selection into ONE artifact file
 *      that both the deliver-email and deliver-x jobs read from --
 *      guaranteeing they never diverge on which players qualify.
 *
 * Writes GITHUB_OUTPUT: ready, slate_date, x_should_run, email_should_run,
 * plan_path, artifact_path.
 *
 * --force (used by the manual/rescue workflows' post/post-text-only and
 * send paths -- never by the automated schedule): skips the "both already
 * delivered" short-circuit and the first-pitch-relative readiness/phase
 * gate, so an operator can build a fresh artifact at any time of day. It
 * does NOT and cannot bypass live lineup confirmation itself -- the
 * artifact is still built from resolveNumerologyPollReadiness's
 * confirmed-lineup selection, and is only written when that selection is
 * non-empty; if zero players are actually confirmed right now, --force
 * produces no artifact and `ready=false`, exactly like the unforced path.
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { buildDailyNumerologyCard, getTodayEt, loadJsonSafe } from "./lib/mlb-numerology-tracking.mjs";
import { buildConfirmationSnapshot } from "./lib/mlb-x-confirmation-snapshot.mjs";
import { computeNumerologySlateTiming } from "./lib/mlb-x-slate-timing.mjs";
import { buildNumerologyArtifact } from "./lib/mlb-x-selection-artifact.mjs";
import {
  createNumerologyPollPlan,
  getNumerologyDeliveryState,
  resolveForcedArtifactDecision,
  resolveNumerologyPollReadiness,
} from "./lib/mlb-numerology-poll-gate.mjs";

const ROOT = process.cwd();
const NUMEROLOGY_DAILY_PATH = path.join(ROOT, "public", "data", "mlb", "numerology-daily.json");
const HR_RAW_PATH = path.join(ROOT, "public", "data", "mlb", "hr-props-raw.json");

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function writeJsonOutput(filePath, value) {
  const resolved = path.resolve(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`);
  return path.relative(ROOT, resolved).replaceAll("\\", "/");
}

function emit(outputs) {
  const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}`);
  for (const line of lines) console.log(`[mlb-numerology-poll] ${line}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
}

async function main() {
  const now = new Date();
  const slateDate = getTodayEt(now);
  const xStateDir = path.resolve(arg("x-state-dir", ".cache/mlb-numerology-x-posted"));
  const emailReceiptPath = path.resolve(arg("email-receipt-path", "public/data/mlb/numerology/email-send-state.json"));
  const planPath = arg("plan-path", "artifacts/mlb-numerology-poll-plan.json");
  const artifactPath = arg("artifact-path", "artifacts/mlb-numerology-selection-artifact.json");
  const forced = flag("force");

  const deliveryState = getNumerologyDeliveryState({ slateDate, xStateDir, emailReceiptPath });

  if (deliveryState.bothDelivered && !forced) {
    const plan = createNumerologyPollPlan({ slateDate, alreadyDelivered: true });
    writeJsonOutput(planPath, plan);
    emit({
      slate_date: slateDate,
      ready: false,
      x_should_run: false,
      email_should_run: false,
      plan_path: planPath,
      artifact_path: "",
    });
    return;
  }

  const numerologyPayload = loadJsonSafe(NUMEROLOGY_DAILY_PATH, null);
  const hrPayload = loadJsonSafe(HR_RAW_PATH, null);

  if (!numerologyPayload) {
    console.error(`[mlb-numerology-poll] Missing ${NUMEROLOGY_DAILY_PATH}; today's data has not been generated yet.`);
    const plan = createNumerologyPollPlan({ slateDate, alreadyDelivered: false, readiness: { ready: false, finalStatus: "SKIPPED_NO_GAMES" } });
    writeJsonOutput(planPath, plan);
    emit({ slate_date: slateDate, ready: false, x_should_run: false, email_should_run: false, plan_path: planPath, artifact_path: "" });
    return;
  }

  const card = buildDailyNumerologyCard(numerologyPayload, { date: slateDate, hrPayload });
  const snapshot = await buildConfirmationSnapshot({ date: slateDate, now, computeTiming: computeNumerologySlateTiming });
  const { readiness, selection } = resolveNumerologyPollReadiness({ plays: card.plays, snapshot });

  // Forced mode bypasses the first-pitch-relative phase gate (readiness.ready)
  // but never the confirmation selection itself -- see resolveForcedArtifactDecision's
  // own doc comment for why `forced` cannot inflate confirmedCount.
  const { shouldBuildArtifact, selectionStatus } = resolveForcedArtifactDecision({
    readiness,
    confirmedCount: selection.confirmedCount,
    forced,
  });

  const plan = createNumerologyPollPlan({ slateDate, alreadyDelivered: false, readiness });
  const planPathOut = writeJsonOutput(planPath, plan);

  let artifactPathOut = "";
  if (shouldBuildArtifact) {
    const artifact = buildNumerologyArtifact({
      slateDate,
      snapshot,
      selectedRows: selection.selected,
      selectionStatus,
    });
    artifactPathOut = writeJsonOutput(artifactPath, artifact);
  } else if (forced) {
    console.error(`[mlb-numerology-poll] --force requested, but zero players are currently live-confirmed (reason=${readiness.finalStatus}). No artifact produced.`);
  }

  emit({
    slate_date: slateDate,
    ready: shouldBuildArtifact,
    x_should_run: shouldBuildArtifact && (forced || !deliveryState.xDelivered),
    email_should_run: shouldBuildArtifact && (forced || !deliveryState.emailDelivered),
    plan_path: planPathOut,
    artifact_path: artifactPathOut,
  });
}

main().catch((error) => {
  console.error(`[mlb-numerology-poll] ${error instanceof Error ? error.stack : error}`);
  process.exitCode = 1;
});
