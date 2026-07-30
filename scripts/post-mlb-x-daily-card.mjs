#!/usr/bin/env node
/**
 * Posts the combined MLB Daily Model Card, invoked as:
 *   node scripts/post-mlb-x-daily-card.mjs --edition=morning --slate-date=YYYY-MM-DD
 *     --card-result-file=<path> [--dry-run]
 *
 * A dedicated, independent publication target from the four k/hr editions
 * (mlb-x-edition-poster.mjs / post-mlb-x-edition.mjs): the combined card is
 * not a market post, has no frozen per-market plan, and never lists
 * individual players in its caption. This script reuses every other piece of
 * existing X-publication infrastructure verbatim -- event-mode resolution,
 * the live-post kill switch, the X client/media-upload/account-verification
 * helpers, the publication lease, and the git-backed state store (via a new,
 * structurally distinct receipt path -- see mlb-x-state-store.mjs's
 * dailyCardReceiptPathFor).
 *
 * --card-result-file must contain the captured stdout of one
 * `npx tsx scripts/generate-social-card-live.ts --edition=morning ...`
 * invocation from THIS SAME job (generate-social-card-live.ts is used
 * entirely unmodified). This script never re-runs generation, never falls
 * back to fixture data, and never invents a card of its own -- an empty,
 * unparsable, blocked, preview, or not-publish-ready result is a hard
 * "do not post", enforced by mlb-x-daily-card-publication.mjs before any
 * lease, state read, or X call.
 */
import path from "node:path";
import process from "node:process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { TwitterApi } from "twitter-api-v2";
import { resolveEventMode } from "./lib/mlb-x-event-mode.mjs";
import {
  assertCardPublishable,
  DAILY_CARD_MORNING_TARGET,
  dailyCardReceiptKeyFor,
  parseCardGenerationResult,
} from "./lib/mlb-x-daily-card-publication.mjs";
import { buildDailyCardMorningCaption } from "./lib/mlb-x-daily-card-caption.mjs";
import { DailyCardPostOutcome, runDailyCardPost } from "./lib/mlb-x-daily-card-poster.mjs";
import { acquirePublicationLease } from "./lib/mlb-x-publication-lease.mjs";
import { createGitStateStore } from "./lib/mlb-x-state-store.mjs";
import {
  assertLivePostAllowed,
  createXClientFromEnv,
  postPrimaryTweet,
  sanitizeLogValue,
  secretsFromEnv,
  verifyExpectedXAccount,
} from "./lib/mlb-x-post-client.mjs";

const ROOT = process.cwd();
const TARGET = DAILY_CARD_MORNING_TARGET;

function parseArgs(argv) {
  const args = { dryRun: false };
  for (const raw of argv) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--edition=")) args.edition = raw.slice("--edition=".length);
    else if (raw.startsWith("--slate-date=")) args.slateDate = raw.slice("--slate-date=".length);
    else if (raw.startsWith("--card-result-file=")) args.cardResultFile = raw.slice("--card-result-file=".length);
    else if (raw.startsWith("--lease-directory=")) args.leaseDirectory = raw.slice("--lease-directory=".length);
    else if (raw.startsWith("--state-work-dir=")) args.stateWorkDir = raw.slice("--state-work-dir=".length);
    else if (raw.startsWith("--now=")) args.now = raw.slice("--now=".length); // test-only clock override
  }
  if (args.edition !== "morning") {
    throw new Error(`--edition must be "morning" (got "${args.edition}"). No other daily-card edition is published live yet.`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(args.slateDate ?? ""))) {
    throw new Error(`--slate-date is required and must be YYYY-MM-DD (the planner's slate_date output), got "${args.slateDate}".`);
  }
  if (!args.cardResultFile) {
    throw new Error("--card-result-file is required (captured stdout of the generate-social-card-live.ts step in this same job).");
  }
  args.leaseDirectory = args.leaseDirectory ?? path.join(ROOT, "artifacts", "mlb-x-leases");
  args.stateWorkDir = args.stateWorkDir ?? path.join(ROOT, ".mlb-x-state-work-daily-card");
  return args;
}

function log(target, message) {
  console.log(`[post-mlb-x-daily-card:${target}] ${message}`);
}

function logFinal(target, status) {
  console.log(`[post-mlb-x-daily-card:${target}] finalStatus=${status}`);
}

/** Git-backed authoritative receipt store, read+write. Separate work dir from the k/hr edition posters -- different job, different runner, no shared filesystem regardless. */
function makeStateStore(stateWorkDir) {
  const store = createGitStateStore({
    git: (cmdArgs, opts) => spawnSync("git", cmdArgs, { cwd: opts?.cwd, encoding: "utf8" }),
    workDir: stateWorkDir,
    readFile: (p) => readFileSync(p, "utf8"),
    writeFile: (p, c) => writeFileSync(p, c, "utf8"),
    ensureDir: (p) => mkdirSync(p, { recursive: true }),
    fileExists: existsSync,
  });
  if (!existsSync(stateWorkDir)) {
    mkdirSync(stateWorkDir, { recursive: true });
    spawnSync("git", ["init", "--quiet", "--initial-branch=main", stateWorkDir]);
    const remoteUrl = process.env.MLB_X_STATE_REMOTE_URL ?? ".";
    spawnSync("git", ["-C", stateWorkDir, "remote", "add", "origin", remoteUrl]);
  }
  return store;
}

/** Adapts runDailyCardPost's {readReceipt, writeReceipt} to the git store's daily-card calls. */
function toOrchestratorStateStore(store, args) {
  return {
    sync: () => store.sync(),
    readReceipt: ({ slateDate, target }) => store.readDailyCardReceipt({ slateDate, target }),
    writeReceipt: ({ slateDate, target, receipt }) => {
      const writeResult = store.writeDailyCardReceipt({ slateDate, target, receipt });
      if (!writeResult.pushed && !writeResult.unchanged) {
        // The post already succeeded on X by this point (this only fires on a
        // receipt PUSH failure) -- surfaced via a recovery artifact, same
        // shape as the k/hr edition posters, so it is never a silent success
        // and never mistaken for "not posted" by the next run.
        const recoveryPath = path.join(args.leaseDirectory, `${receipt.receiptKey}.push-failed.json`);
        mkdirSync(args.leaseDirectory, { recursive: true });
        writeFileSync(recoveryPath, `${JSON.stringify({ receipt, pushResult: writeResult, at: new Date().toISOString() }, null, 2)}\n`);
        log(TARGET, `STATE_PERSISTENCE_FAILED: receipt committed locally but not pushed -- recovery artifact at ${recoveryPath}`);
      }
      return writeResult;
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { edition, slateDate } = args;
  console.log(`[post-mlb-x-daily-card:${TARGET}] slateDate=${slateDate} dryRun=${args.dryRun}`);

  // ── Event-mode resolution: identical rule the k/hr edition posters use.
  // simulation_now is accepted only for a mode already resolved as dry-run or
  // diagnostic-only, and only for the planner's own resolved slate date --
  // never for morning-live, schedule, or workflow_run.
  const eventMode = resolveEventMode({
    eventName: process.env.GITHUB_EVENT_NAME ?? "",
    dispatchMode: process.env.MLB_X_DISPATCH_MODE ?? null,
    simulationNow: process.env.MLB_X_SIMULATION_NOW ?? null,
    slateDate,
  });
  if (!eventMode.ok) {
    console.error(`[post-mlb-x-daily-card:${TARGET}] cannot resolve a safe run mode: ${eventMode.reason}`);
    logFinal(TARGET, DailyCardPostOutcome.CONFIGURATION_ERROR);
    process.exitCode = 1;
    return;
  }
  const dryRun = args.dryRun || !eventMode.liveCapable;
  log(TARGET, `eventMode=${eventMode.mode} liveCapable=${eventMode.liveCapable} resolvedDryRun=${dryRun}`);
  if (eventMode.simulated) {
    const banner = `SIMULATED TIME: this run uses simulation_now=${eventMode.simulationNow} instead of the real clock -- dry-run only, never live.`;
    log(TARGET, banner);
    console.log(`::notice title=MLB X daily card simulated clock::${TARGET} ${banner}`);
  }

  // ── Card generation result: the sole authority on whether this run may
  // ever reach a lease, a receipt read, or an X call. Zero of those happen
  // before this passes.
  let rawStdout;
  try {
    rawStdout = readFileSync(args.cardResultFile, "utf8");
  } catch (error) {
    console.error(`[post-mlb-x-daily-card:${TARGET}] could not read --card-result-file: ${error instanceof Error ? error.message : error}`);
    logFinal(TARGET, DailyCardPostOutcome.CONFIGURATION_ERROR);
    process.exitCode = 1;
    return;
  }
  const parsed = parseCardGenerationResult(rawStdout);
  if (!parsed.ok) {
    console.error(`[post-mlb-x-daily-card:${TARGET}] card generation blocked or unreadable: ${parsed.reason}`);
    logFinal(TARGET, DailyCardPostOutcome.CONFIGURATION_ERROR);
    process.exitCode = 1;
    return;
  }
  const publishable = assertCardPublishable({ result: parsed.result, slateDate, edition, fileExists: existsSync });
  if (!publishable.ok) {
    console.error(`[post-mlb-x-daily-card:${TARGET}] card is not publishable: ${publishable.reason} ${JSON.stringify(publishable.detail ?? {})}`);
    logFinal(TARGET, DailyCardPostOutcome.CONFIGURATION_ERROR);
    process.exitCode = 1;
    return;
  }
  const imagePath = parsed.result.pngPath;
  log(TARGET, `card OK: pngPath=${imagePath} publishReady=${parsed.result.publishReady} preview=${parsed.result.preview}`);

  // ── Live-mode gating: identical event/flag gate the k/hr edition posters use. ──
  if (!dryRun) {
    try {
      assertLivePostAllowed({
        eventName: process.env.GITHUB_EVENT_NAME ?? "",
        allowLivePost: process.env.X_ALLOW_LIVE_POST,
        log: (m) => log(TARGET, m),
      });
    } catch (error) {
      console.error(`[post-mlb-x-daily-card:${TARGET}] ${error.message}`);
      logFinal(TARGET, DailyCardPostOutcome.CONFIGURATION_ERROR);
      process.exitCode = 1;
      return;
    }
  }

  const rawStore = makeStateStore(args.stateWorkDir);
  const stateStore = toOrchestratorStateStore(rawStore, args);
  const acquireLease = (receiptKey) => acquirePublicationLease({ receiptKey, leaseDir: args.leaseDirectory });
  const receiptKey = dailyCardReceiptKeyFor({ slateDate, target: TARGET });

  let client = null;
  const credentialsPresent = Boolean(process.env.JKB_X_API_KEY && process.env.JKB_X_API_SECRET && process.env.JKB_X_ACCESS_TOKEN && process.env.JKB_X_ACCESS_SECRET);
  if (credentialsPresent) {
    try {
      client = createXClientFromEnv(process.env, TwitterApi);
    } catch { /* handled by verifyAccount below returning false */ }
  }
  let verifiedAccount = false;

  const result = await runDailyCardPost({
    receiptKey,
    slateDate,
    target: TARGET,
    imagePath,
    stateStore,
    acquireLease,
    buildCaption: () => buildDailyCardMorningCaption({ slateDate }),
    postPrimary: async ({ caption, imagePath: png }) => {
      if (!client) throw new Error("X client not configured (missing credentials).");
      return postPrimaryTweet({ client, caption, imagePath: png, fs: { existsSync, statSync } });
    },
    verifyAccount: async () => {
      if (!client) return false;
      if (verifiedAccount) return true;
      const verify = await verifyExpectedXAccount({ client, expectedUsername: process.env.X_EXPECTED_USERNAME, log: (m) => log(TARGET, m) });
      verifiedAccount = verify.ok;
      return verify.ok;
    },
    dryRun,
    ...(args.now ? { now: () => args.now } : {}),
    log: (m) => log(TARGET, m),
  });

  const secrets = secretsFromEnv(process.env);
  console.log(JSON.stringify({ target: TARGET, slateDate, ...result }, null, 2).split("\n").map((l) => sanitizeLogValue(l, secrets)).join("\n"));
  logFinal(TARGET, result.status ?? result.outcome);

  const failureOutcomes = new Set([DailyCardPostOutcome.X_API_FAILED, DailyCardPostOutcome.CONFIGURATION_ERROR]);
  if (failureOutcomes.has(result.outcome)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[post-mlb-x-daily-card] ${sanitizeLogValue(error instanceof Error ? error.message : String(error), secretsFromEnv(process.env))}`);
  process.exitCode = 1;
});
