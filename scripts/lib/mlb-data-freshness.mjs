#!/usr/bin/env node

/**
 * Canonical MLB artifact freshness / slate-date safety layer.
 *
 * Motivation (Aug 27-28 2026 RCA): GitHub scheduled-workflow delivery for this
 * repo degraded badly -- "Generate MLB Data" runs fired hours late or not at
 * all. Several downstream gates only check whether HR/K lines are *populated*,
 * not whether the populated data belongs to *today's* Eastern slate, so stale
 * data can quietly satisfy a "we're fine" check. This module is the single
 * place that answers "does the published MLB data actually belong to the slate
 * we expect right now?" -- deterministically, with no network dependency.
 *
 * It intentionally does NOT touch any model math (K Score, HR model, projected
 * Ks, betting edge, ranking). It only inspects the `date` field that the
 * generators already stamp onto their artifacts and compares it to the expected
 * Eastern Time slate date (reusing resolveEasternSlateDate from mlb-slate-gate).
 */

import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { resolveEasternSlateDate } from "./mlb-slate-gate.mjs";
import { resolveOddsSlateDate } from "./mlb-prop-odds-core.mjs";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The canonical MLB artifacts this layer inspects. `required: "hard"` means a
 * stale/missing value should block (fail the canonical workflow's post-publish
 * assertion); `required: "soft"` means it degrades the report but a single
 * optional provider being unavailable must not fail the run.
 */
export const DEFAULT_ARTIFACTS = [
  { key: "hrProps", label: "hr-props-raw.json", file: "public/data/mlb/hr-props-raw.json", required: "hard" },
  {
    key: "strikeoutDetails",
    label: "strikeout-prop-details.json",
    file: "public/data/mlb/strikeout-prop-details.json",
    required: "soft",
  },
];

/**
 * Pure evaluation of a single artifact against the expected slate date.
 *
 * @param {{label:string, required:string, present:boolean, text:(string|null), expectedDate:string}} input
 * @returns {{label:string, required:string, present:boolean, parseError:boolean, artifactDate:(string|null), status:("current"|"stale"|"missing"), reason:string}}
 */
export function evaluateArtifact({ label, required, present, text, expectedDate }) {
  const base = { label, required, present: Boolean(present), parseError: false, artifactDate: null };

  if (!present || typeof text !== "string") {
    return { ...base, status: "missing", reason: `${label} is absent or unreadable` };
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ...base, parseError: true, status: "missing", reason: `${label} is not valid JSON` };
  }

  const artifactDate =
    parsed && typeof parsed.date === "string" && DATE_PATTERN.test(parsed.date.trim())
      ? parsed.date.trim()
      : null;

  if (!artifactDate) {
    // No trustworthy date -> never allow this to read as "current".
    return { ...base, status: "missing", reason: `${label} has no valid "date" field` };
  }

  if (artifactDate === expectedDate) {
    return { ...base, artifactDate, status: "current", reason: `${label} matches expected slate ${expectedDate}` };
  }

  return {
    ...base,
    artifactDate,
    status: "stale",
    reason: `${label} is dated ${artifactDate}, expected ${expectedDate}`,
  };
}

/**
 * Aggregate a set of per-artifact evaluations into one freshness verdict.
 *
 * status:
 *   - "current" : every inspected artifact belongs to expectedDate
 *   - "missing" : every inspected artifact is absent/unreadable/dateless
 *   - "partial" : at least one artifact is current AND at least one is not
 *   - "stale"   : no artifact is current, but at least one has a (wrong) date
 *
 * `blocking` is true when any hard-required artifact is not "current".
 * `degraded` is true whenever status !== "current".
 */
export function aggregateFreshness(expectedDate, evaluations) {
  const list = [...evaluations];
  const allCurrent = list.length > 0 && list.every((a) => a.status === "current");
  const allMissing = list.length > 0 && list.every((a) => a.status === "missing");
  const anyCurrent = list.some((a) => a.status === "current");

  let status;
  if (allCurrent) status = "current";
  else if (allMissing) status = "missing";
  else if (anyCurrent) status = "partial";
  else status = "stale";

  const blocking = list.some((a) => a.required === "hard" && a.status !== "current");
  const degraded = status !== "current";

  const artifacts = {};
  for (const evaluation of list) {
    artifacts[keyForLabel(evaluation.label)] = evaluation;
  }

  return {
    expectedDate,
    status,
    blocking,
    degraded,
    artifacts,
    reasons: list.filter((a) => a.status !== "current").map((a) => a.reason),
  };
}

function keyForLabel(label) {
  const match = DEFAULT_ARTIFACTS.find((a) => a.label === label);
  return match ? match.key : label;
}

/**
 * Resolve the expected Eastern slate date, honouring (in priority order):
 *   1. an explicit argument
 *   2. the MLB_EXPECTED_SLATE_DATE env var (set from slate-check output)
 *   3. the current Eastern Time calendar date
 */
export function resolveExpectedSlateDate({ now = new Date(), explicitDate = "" } = {}) {
  const explicit = String(explicitDate ?? "").trim();
  const fromEnv = String(process.env.MLB_EXPECTED_SLATE_DATE ?? "").trim();
  return resolveEasternSlateDate(now, explicit || fromEnv || "");
}

/**
 * Inspect the canonical MLB artifacts on disk (or via an injected reader) and
 * return the structured freshness verdict.
 *
 * @param {{
 *   now?: Date,
 *   expectedDate?: string,
 *   rootDir?: string,
 *   artifacts?: Array<{key:string,label:string,file:string,required:string}>,
 *   readFileImpl?: (absPath:string) => (string|null),
 * }} [options]
 */
export function inspectMlbDataFreshness(options = {}) {
  const {
    now = new Date(),
    expectedDate: explicitExpected,
    rootDir = process.cwd(),
    artifacts = DEFAULT_ARTIFACTS,
    readFileImpl,
  } = options;

  const expectedDate = explicitExpected || resolveExpectedSlateDate({ now });

  const read =
    typeof readFileImpl === "function"
      ? readFileImpl
      : (absPath) => {
          try {
            return readFileSync(absPath, "utf8");
          } catch {
            return null;
          }
        };

  const evaluations = artifacts.map((artifact) => {
    const text = read(path.isAbsolute(artifact.file) ? artifact.file : path.join(rootDir, artifact.file));
    return evaluateArtifact({
      label: artifact.label,
      required: artifact.required,
      present: text != null,
      text,
      expectedDate,
    });
  });

  return aggregateFreshness(expectedDate, evaluations);
}

/**
 * Slate-alignment guard for the odds-injection step.
 *
 * The shared injector (mlb-prop-odds-core) already clears odds when the model
 * slate and the odds slate disagree with *each other*. The remaining hole is
 * when BOTH are stale by the same (wrong) date -- e.g. yesterday's model +
 * yesterday's odds -- which passes an equality check but is still wrong for
 * today. This guard closes that by requiring both to equal the *expected*
 * Eastern slate date before any injection is allowed.
 *
 * `injectable` is only true when the model artifact AND the odds artifact both
 * belong to expectedDate. It never invents lines and never green-lights reusing
 * a stale odds file.
 */
export function assessSlateAlignment({ expectedDate, rawData, oddsData }) {
  const modelDate =
    rawData && typeof rawData.date === "string" && DATE_PATTERN.test(rawData.date.trim())
      ? rawData.date.trim()
      : null;
  const oddsDate = String(resolveOddsSlateDate(oddsData) || "").trim() || null;

  const modelCurrent = modelDate != null && modelDate === expectedDate;
  const oddsCurrent = oddsDate != null && oddsDate === expectedDate;

  let reason;
  if (modelCurrent && oddsCurrent) reason = "model and odds both belong to the expected slate";
  else if (!modelCurrent) reason = `model slate ${modelDate ?? "missing"} != expected ${expectedDate}`;
  else reason = `odds slate ${oddsDate ?? "missing"} != expected ${expectedDate}`;

  return {
    expectedDate,
    modelDate,
    oddsDate,
    modelCurrent,
    oddsCurrent,
    injectable: modelCurrent && oddsCurrent,
    reason,
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseCliArgs(argv) {
  const opts = { date: "", json: false, githubSummary: false, assertHard: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--json") opts.json = true;
    else if (token === "--github-summary") opts.githubSummary = true;
    else if (token === "--assert-hard") opts.assertHard = true;
    else if (token === "--date") {
      opts.date = argv[i + 1] ?? "";
      i += 1;
    } else if (token.startsWith("--date=")) {
      opts.date = token.slice("--date=".length);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }
  return opts;
}

function renderHumanReport(verdict) {
  const lines = [];
  lines.push(`[mlb-data-freshness] expected slate: ${verdict.expectedDate}`);
  lines.push(`[mlb-data-freshness] overall status: ${verdict.status} (blocking=${verdict.blocking}, degraded=${verdict.degraded})`);
  for (const artifact of Object.values(verdict.artifacts)) {
    lines.push(
      `[mlb-data-freshness]   ${artifact.label}: ${artifact.status}` +
        ` (date=${artifact.artifactDate ?? "n/a"}, required=${artifact.required}) -- ${artifact.reason}`,
    );
  }
  return lines.join("\n");
}

function renderGithubSummary(verdict) {
  const rows = Object.values(verdict.artifacts)
    .map((a) => `| ${a.label} | ${a.artifactDate ?? "—"} | ${a.status} | ${a.required} |`)
    .join("\n");
  return [
    "### MLB data freshness",
    "",
    `- Expected Eastern slate date: \`${verdict.expectedDate}\``,
    `- Overall status: **${verdict.status}** (blocking: ${verdict.blocking}, degraded: ${verdict.degraded})`,
    "",
    "| Artifact | Artifact date | Status | Required |",
    "| --- | --- | --- | --- |",
    rows,
    "",
  ].join("\n");
}

export function runFreshnessCli({
  argv = process.argv.slice(2),
  now = new Date(),
  rootDir = process.cwd(),
  log = console.log,
  logError = console.error,
  githubOutputPath = process.env.GITHUB_OUTPUT,
  githubSummaryPath = process.env.GITHUB_STEP_SUMMARY,
} = {}) {
  let opts;
  try {
    opts = parseCliArgs(argv);
  } catch (error) {
    logError(`[mlb-data-freshness] ${error instanceof Error ? error.message : error}`);
    return 2;
  }

  const verdict = inspectMlbDataFreshness({ now, rootDir, expectedDate: opts.date ? resolveExpectedSlateDate({ now, explicitDate: opts.date }) : undefined });

  if (opts.json) {
    log(JSON.stringify(verdict, null, 2));
  } else {
    log(renderHumanReport(verdict));
  }

  if (githubOutputPath) {
    try {
      appendFileSync(
        githubOutputPath,
        [
          `status=${verdict.status}`,
          `blocking=${verdict.blocking}`,
          `degraded=${verdict.degraded}`,
          `expected_date=${verdict.expectedDate}`,
          "",
        ].join("\n"),
      );
    } catch (error) {
      logError(`[mlb-data-freshness] could not write GITHUB_OUTPUT: ${error instanceof Error ? error.message : error}`);
    }
  }

  if (opts.githubSummary && githubSummaryPath) {
    try {
      appendFileSync(githubSummaryPath, `${renderGithubSummary(verdict)}\n`);
    } catch (error) {
      logError(`[mlb-data-freshness] could not write GITHUB_STEP_SUMMARY: ${error instanceof Error ? error.message : error}`);
    }
  }

  if (opts.assertHard && verdict.blocking) {
    logError(
      `[mlb-data-freshness] BLOCKING: a hard-required artifact is not current for ${verdict.expectedDate}. ${verdict.reasons.join("; ")}`,
    );
    return 1;
  }

  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runFreshnessCli();
}
