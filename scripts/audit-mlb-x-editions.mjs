#!/usr/bin/env node
/**
 * Read-only, end-of-window audit of all four MLB X editions for one slate.
 * Never posts, never writes a receipt.
 *
 * Usage:
 *   node scripts/audit-mlb-x-editions.mjs --slate-date=YYYY-MM-DD
 *     [--first-game-time=<ISO>] [--state-work-dir=<path>]
 *
 * Known gap, reported here rather than silently worked around: runEditionPost
 * does not currently persist a diagnostic breadcrumb for a non-posted outcome
 * (NOT_DUE, IMAGE_FAILED, etc.) to the state branch -- only a genuine POSTED
 * receipt is written. This audit therefore reports POSTED-or-MISSING and the
 * correct exit-code policy reliably (the property that matters most: did the
 * edition publish), but "latest diagnostic reason" for a miss is reported as
 * unavailable rather than fabricated. Adding durable per-run diagnostics would
 * need a rolling, overwritten (not appended) record to avoid state-branch
 * churn from frequent pregame-poll misses -- left for a follow-up rather than
 * rushed into this integration.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { auditSlate, renderAuditAnnotations, renderAuditSummary } from "./lib/mlb-x-edition-audit.mjs";
import { createGitStateStore } from "./lib/mlb-x-state-store.mjs";

const ROOT = process.cwd();

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    if (raw.startsWith("--slate-date=")) args.slateDate = raw.slice("--slate-date=".length);
    else if (raw.startsWith("--first-game-time=")) args.firstGameTime = raw.slice("--first-game-time=".length);
    else if (raw.startsWith("--state-work-dir=")) args.stateWorkDir = raw.slice("--state-work-dir=".length);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(args.slateDate ?? ""))) {
    throw new Error(`--slate-date is required and must be YYYY-MM-DD, got "${args.slateDate}".`);
  }
  args.firstGameTime = args.firstGameTime || null;
  args.stateWorkDir = args.stateWorkDir ?? path.join(ROOT, ".mlb-x-state-work-audit");
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date().toISOString();

  const store = createGitStateStore({
    git: (cmdArgs, opts) => spawnSync("git", cmdArgs, { cwd: opts?.cwd, encoding: "utf8" }),
    workDir: args.stateWorkDir,
    readFile: (p) => readFileSync(p, "utf8"),
    writeFile: () => { throw new Error("Audit must never write state."); },
    ensureDir: () => { throw new Error("Audit must never write state."); },
    fileExists: existsSync,
  });
  if (!existsSync(args.stateWorkDir)) {
    mkdirSync(args.stateWorkDir, { recursive: true });
    spawnSync("git", ["init", "--quiet", "--initial-branch=main", args.stateWorkDir]);
    const remoteUrl = process.env.MLB_X_STATE_REMOTE_URL ?? ".";
    spawnSync("git", ["-C", args.stateWorkDir, "remote", "add", "origin", remoteUrl]);
  }
  store.sync();

  const report = auditSlate({
    slateDate: args.slateDate,
    now,
    firstGameTime: args.firstGameTime,
    readReceipt: ({ slateDate, market, edition }) => store.readReceipt({ slateDate, market, edition }),
    readDiagnostic: () => null, // see module header: no durable diagnostic feed yet
  });

  console.log(`[audit-mlb-x-editions] slateDate=${args.slateDate} postedCount=${report.postedCount}/4`);
  for (const e of report.editions) {
    console.log(`[audit-mlb-x-editions] ${e.key} posted=${e.posted} status=${e.status} windowClosed=${e.windowClosed}${e.posted ? ` postId=${e.postId} replyStatus=${e.replyStatus ?? "n/a"}` : ""}`);
  }

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) appendFileSync(summaryPath, renderAuditSummary(report));
  else console.log(renderAuditSummary(report));

  for (const annotation of renderAuditAnnotations(report)) console.log(annotation);

  if (report.technicalMisses.length) {
    console.error(`[audit-mlb-x-editions] ${report.technicalMisses.length} technical miss(es): ${report.technicalMisses.map((e) => e.key).join(", ")}`);
  }

  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) writeFileSync(outputPath, `posted_count=${report.postedCount}\ntechnical_miss_count=${report.technicalMisses.length}\n`, { flag: "a" });

  process.exitCode = report.exitCode;
}

main();
