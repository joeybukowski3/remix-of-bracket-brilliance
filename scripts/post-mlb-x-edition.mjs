#!/usr/bin/env node
/**
 * Shared edition posting entry point, invoked as:
 *   node scripts/post-mlb-x-edition.mjs --market=k|hr --edition=morning|confirmed
 *     --slate-date=YYYY-MM-DD --plan-directory=<path> [--dry-run]
 *
 * One implementation for all four editions (k-morning, hr-morning,
 * k-confirmed, hr-confirmed) -- the workflow's four poster jobs all call this
 * same script with different --market/--edition. It wires real collaborators
 * (X client, image renderer, caption builders, git-backed state) into
 * runEditionPost and does not reimplement any of that orchestration itself.
 *
 * --slate-date is the PLANNER's resolved Eastern slate date, passed down from
 * the plan job's `slate_date` output -- this script never recomputes it. Every
 * other carrier of a slate date (the frozen plan, the receipt key embedded in
 * its readiness, and any already-published image bundle) must agree with it
 * before anything is rendered or posted; a disagreement is a CONFIGURATION_ERROR
 * with zero X calls, checked before runEditionPost is ever invoked.
 *
 * Whether this run is dry-run or live-capable is resolved from
 * GITHUB_EVENT_NAME (and, for workflow_dispatch, MLB_X_DISPATCH_MODE) via
 * resolveEventMode (mlb-x-event-mode.mjs) -- NOT from a --dry-run flag the
 * workflow computes with shell conditionals. A --dry-run flag can still be
 * passed explicitly (e.g. for local/manual testing outside Actions) and can
 * only make a run safer: it forces a dry run regardless of what the event
 * resolves to. Nothing can make an unrecognized event or dispatch mode
 * live-capable; that fails closed as CONFIGURATION_ERROR before anything
 * else runs. Even a live-capable run still requires X_ALLOW_LIVE_POST=true,
 * real credentials, and account verification (assertLivePostAllowed) before
 * a single X call.
 */
import path from "node:path";
import process from "node:process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { TwitterApi } from "twitter-api-v2";
import { buildDiagnosticRecord, DIAGNOSTIC_OUTCOMES } from "./lib/mlb-x-edition-diagnostics.mjs";
import { resolveEventMode } from "./lib/mlb-x-event-mode.mjs";
import { PostOutcome, runEditionPost } from "./lib/mlb-x-edition-poster.mjs";
import { assertSlateDateAgreement, loadPlanForTarget } from "./lib/mlb-x-edition-publication.mjs";
import { acquirePublicationLease } from "./lib/mlb-x-publication-lease.mjs";
import { createGitStateStore } from "./lib/mlb-x-state-store.mjs";
import { ensureEditionImage } from "./lib/mlb-x-edition-image.mjs";
import { imageKindForMarket, validateImageBundle } from "./lib/mlb-x-image-bundle.mjs";
import { buildKEditionCaption } from "./lib/mlb-k-caption-core.mjs";
import { buildHrEditionCaption } from "./lib/mlb-x-artifact-caption.mjs";
import { buildOmittedRowsReply } from "./lib/mlb-x-edition-reply-caption.mjs";
import { writeMlbSocialGraphic } from "./lib/mlb-social-graphic-renderer.mjs";
import {
  assertLivePostAllowed,
  createXClientFromEnv,
  postPrimaryTextOnly,
  postPrimaryTweet,
  postReplyTweet,
  sanitizeLogValue,
  secretsFromEnv,
  verifyExpectedXAccount,
} from "./lib/mlb-x-post-client.mjs";

const ROOT = process.cwd();

function parseArgs(argv) {
  const args = { dryRun: false, postTextOnly: false, diagnosticOnly: false };
  for (const raw of argv) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw === "--post-text-only") args.postTextOnly = true;
    else if (raw === "--diagnostic-only") args.diagnosticOnly = true;
    else if (raw.startsWith("--market=")) args.market = raw.slice("--market=".length);
    else if (raw.startsWith("--edition=")) args.edition = raw.slice("--edition=".length);
    else if (raw.startsWith("--slate-date=")) args.slateDate = raw.slice("--slate-date=".length);
    else if (raw.startsWith("--plan-directory=")) args.planDirectory = raw.slice("--plan-directory=".length);
    else if (raw.startsWith("--image-directory=")) args.imageDirectory = raw.slice("--image-directory=".length);
    else if (raw.startsWith("--lease-directory=")) args.leaseDirectory = raw.slice("--lease-directory=".length);
    else if (raw.startsWith("--state-work-dir=")) args.stateWorkDir = raw.slice("--state-work-dir=".length);
    else if (raw.startsWith("--now=")) args.now = raw.slice("--now=".length); // test-only clock override
  }
  if (!["k", "hr"].includes(args.market)) throw new Error(`--market must be "k" or "hr" (got "${args.market}").`);
  if (!["morning", "confirmed"].includes(args.edition)) throw new Error(`--edition must be "morning" or "confirmed" (got "${args.edition}").`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(args.slateDate ?? ""))) {
    throw new Error(`--slate-date is required and must be YYYY-MM-DD (the planner's slate_date output), got "${args.slateDate}".`);
  }
  args.planDirectory = args.planDirectory ?? path.join(ROOT, "artifacts", "mlb-x-plans");
  args.imageDirectory = args.imageDirectory ?? path.join(ROOT, "artifacts");
  args.leaseDirectory = args.leaseDirectory ?? path.join(ROOT, "artifacts", "mlb-x-leases");
  args.stateWorkDir = args.stateWorkDir ?? path.join(ROOT, ".mlb-x-state-work");
  return args;
}

function log(market, edition, message) {
  console.log(`[post-mlb-x-edition:${market}-${edition}] ${message}`);
}

function logFinal(market, edition, status) {
  console.log(`[post-mlb-x-edition:${market}-${edition}] finalStatus=${status}`);
}

/** Git-backed authoritative receipt store, read+write. */
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

/** Adapts runEditionPost's {readReceipt, writeReceipt} to the git store's {slateDate,market,edition} calls. */
function toOrchestratorStateStore(store, args) {
  return {
    sync: () => store.sync(),
    readReceipt: ({ slateDate, market, edition }) => store.readReceipt({ slateDate, market, edition }),
    writeReceipt: ({ slateDate, market, edition, receipt }) => {
      const result = store.writeReceipt({ slateDate, market, edition, receipt });
      if (!result.pushed && !result.unchanged) {
        // The receipt is written locally and the process failed to push it.
        // This must be a visible, distinct condition -- not a silent success
        // and not a reason to attempt another primary post. Surfaced via a
        // dedicated recovery artifact the audit and next run can find.
        const recoveryPath = path.join(args.leaseDirectory, `${receipt.receiptKey}.push-failed.json`);
        mkdirSync(args.leaseDirectory, { recursive: true });
        writeFileSync(recoveryPath, `${JSON.stringify({ receipt, pushResult: result, at: new Date().toISOString() }, null, 2)}\n`);
        log(args.market, args.edition, `STATE_PERSISTENCE_FAILED: receipt committed locally but not pushed -- recovery artifact at ${recoveryPath}`);
        // Best-effort: the primary post already succeeded by this point (this
        // branch only fires on a receipt push failure), so a diagnostic-write
        // failure here must never mask that success or throw out of the caller.
        try {
          const diagResult = store.writeDiagnostic({
            slateDate, market, edition,
            diagnostic: buildDiagnosticRecord({
              market, edition, slateDate,
              latestOutcome: "STATE_PERSISTENCE_FAILED",
              reason: `receipt push failed after ${result.attempts ?? "?"} attempt(s); recovery artifact at ${recoveryPath}`,
            }),
          });
          if (diagResult.pushed) log(args.market, args.edition, "diagnostic recorded (STATE_PERSISTENCE_FAILED)");
        } catch (diagError) {
          log(args.market, args.edition, `diagnostic write failed (non-fatal): ${diagError instanceof Error ? diagError.message : diagError}`);
        }
      }
      return result;
    },
  };
}

async function renderGraphic({ market, slateDate, rows, svgPath, pngPath, browser }) {
  const rendered = await writeMlbSocialGraphic({ kind: market, slateDate, rows, svgPath, pngPath, browser });
  return { pngPath: rendered.pngPath, svgPath: rendered.svgPath, renderedRows: rendered.renderedRows };
}

function buildCaptionForMarket(market) {
  return async ({ rows, languageMode, plan }) => {
    const result = market === "k"
      ? buildKEditionCaption({ rows, languageMode, slateDate: plan.slateDate })
      : buildHrEditionCaption({ rows, languageMode, slateDate: plan.slateDate });
    if (result.skipped) {
      throw new Error(result.reason);
    }
    if (market === "hr" && result.diagnostics?.usedCategoryHeuristic) {
      log(market, plan.edition, `WARNING categoryHeuristicCount=${result.diagnostics.categoryHeuristicCount} players=${result.diagnostics.categoryHeuristicPlayers.join(",")} -- frozen plan rows lacked an explicit category`);
    }
    return { caption: result.caption, captionRows: result.captionRows, omittedRows: result.omittedRows ?? [] };
  };
}

function replyBuilderForMarket(market, client) {
  return async ({ inReplyTo, plan }) => {
    // omittedRows is recomputed here (pure, cheap) rather than threaded through
    // runEditionPost's interface, so this same function serves both the normal
    // post-then-reply path and reply-only recovery, where only `plan` exists.
    const captionResult = market === "k"
      ? buildKEditionCaption({ rows: plan.selectedRows, languageMode: plan.readiness.languageMode, slateDate: plan.slateDate })
      : buildHrEditionCaption({ rows: plan.selectedRows, languageMode: plan.readiness.languageMode, slateDate: plan.slateDate });
    const omitted = captionResult.skipped ? [] : captionResult.omittedRows ?? [];
    const { shouldReply, caption } = buildOmittedRowsReply({ omittedRows: omitted, market });
    if (!shouldReply) return null; // no reply attempted: nothing was omitted
    return postReplyTweet({ client, caption, inReplyTo });
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { market, edition, slateDate } = args;
  console.log(`[post-mlb-x-edition:${market}-${edition}] slateDate=${slateDate} dryRun=${args.dryRun} diagnosticOnly=${args.diagnosticOnly}`);

  // ── Diagnostic-only: load + validate the plan and check the account. Never touches image/caption/lease/X. ──
  if (args.diagnosticOnly) {
    const loaded = loadPlanForTarget({ directory: args.planDirectory, market, edition, slateDate });
    if (!loaded.ok) {
      console.error(`[post-mlb-x-edition:${market}-${edition}] plan invalid: ${loaded.error} ${JSON.stringify(loaded.detail ?? {})}`);
      logFinal(market, edition, PostOutcome.CONFIGURATION_ERROR);
      process.exitCode = 1;
      return;
    }
    log(market, edition, `plan OK: status=${loaded.plan.readiness.status} rows=${loaded.plan.selectedRows.length}`);
    try {
      const client = createXClientFromEnv(process.env, TwitterApi);
      const verify = await verifyExpectedXAccount({ client, expectedUsername: process.env.X_EXPECTED_USERNAME, log: (m) => log(market, edition, m) });
      log(market, edition, `account check: ${verify.ok ? "OK" : verify.reason}`);
    } catch (error) {
      log(market, edition, `account check skipped: ${error instanceof Error ? error.message : error}`);
    }
    logFinal(market, edition, "DIAGNOSTIC_OK");
    return;
  }

  // ── Diagnostic state: created and synced before any exit point below so
  // every CONFIGURATION_ERROR from here on -- not only the ones inside
  // runEditionPost -- can be persisted to the one rolling diagnostic for this
  // edition. Best-effort throughout: a diagnostic write never overrides the
  // real outcome or throws out of this script.
  const rawStore = makeStateStore(args.stateWorkDir);
  rawStore.sync();
  const writeDiag = (latestOutcome, { reason = "", windowClosesAt = null } = {}) => {
    if (!DIAGNOSTIC_OUTCOMES.includes(latestOutcome)) return;
    try {
      const written = rawStore.writeDiagnostic({
        slateDate, market, edition,
        diagnostic: buildDiagnosticRecord({ market, edition, slateDate, latestOutcome, reason, windowClosesAt }),
      });
      if (written.pushed) log(market, edition, `diagnostic recorded (${latestOutcome})`);
    } catch (error) {
      log(market, edition, `diagnostic write failed (non-fatal): ${error instanceof Error ? error.message : error}`);
    }
  };

  // ── Event-mode resolution: decides dry-run vs. live-capable from the real
  // GitHub Actions trigger, not from a fragile shell conditional in the
  // workflow (see mlb-x-event-mode.mjs for why that shape of bug happened
  // before). An explicit --dry-run CLI flag can only make this run SAFER --
  // it forces a dry run regardless of what the event resolves to -- but
  // nothing can make an unrecognized event or dispatch mode live-capable.
  // Zero X calls, zero image render, zero caption build before this passes.
  const eventMode = resolveEventMode({
    eventName: process.env.GITHUB_EVENT_NAME ?? "",
    dispatchMode: process.env.MLB_X_DISPATCH_MODE ?? null,
  });
  if (!args.dryRun && !eventMode.ok) {
    console.error(`[post-mlb-x-edition:${market}-${edition}] cannot resolve a safe run mode: ${eventMode.reason}`);
    writeDiag(PostOutcome.CONFIGURATION_ERROR, { reason: `event-mode resolution failed: ${eventMode.reason}` });
    logFinal(market, edition, PostOutcome.CONFIGURATION_ERROR);
    process.exitCode = 1;
    return;
  }
  args.dryRun = args.dryRun || !eventMode.liveCapable;
  log(market, edition, `eventMode=${eventMode.mode} liveCapable=${eventMode.liveCapable} resolvedDryRun=${args.dryRun}`);

  // ── Pre-flight slate-date agreement: CLI, plan, receipt key. Zero X calls before this passes. ──
  const preflightPlan = loadPlanForTarget({ directory: args.planDirectory, market, edition, slateDate });
  if (!preflightPlan.ok) {
    console.error(`[post-mlb-x-edition:${market}-${edition}] plan invalid: ${preflightPlan.error} ${JSON.stringify(preflightPlan.detail ?? {})}`);
    writeDiag(PostOutcome.CONFIGURATION_ERROR, { reason: `plan invalid: ${preflightPlan.error}` });
    logFinal(market, edition, PostOutcome.CONFIGURATION_ERROR);
    process.exitCode = 1;
    return;
  }
  const agreement = assertSlateDateAgreement({
    plannerSlateDate: slateDate,
    cliSlateDate: slateDate,
    planSlateDate: preflightPlan.plan.slateDate,
    receiptKey: preflightPlan.plan.readiness.receiptKey,
    imageSlateDate: null, // checked next, against any bundle already on disk
  });
  if (!agreement.agreed) {
    console.error(`[post-mlb-x-edition:${market}-${edition}] slate date disagreement: ${JSON.stringify(agreement.detail)}`);
    writeDiag(PostOutcome.CONFIGURATION_ERROR, { reason: `slate date disagreement: ${JSON.stringify(agreement.detail)}` });
    logFinal(market, edition, PostOutcome.CONFIGURATION_ERROR);
    process.exitCode = 1;
    return;
  }
  // A pre-existing image bundle for the wrong slate is also a configuration
  // problem, caught here before any render/post attempt. A bundle rendered
  // fresh during this run is still protected -- resolveEditionReadiness
  // rejects a mismatched slate on the freshly built metadata too (as
  // IMAGE_FAILED rather than CONFIGURATION_ERROR, but still zero X calls).
  const existingBundle = validateImageBundle({ kind: imageKindForMarket(market), slateDate, directory: args.imageDirectory });
  if (!existingBundle.valid && existingBundle.reason === "SLATE_MISMATCH") {
    console.error(`[post-mlb-x-edition:${market}-${edition}] existing image bundle is for a different slate.`);
    writeDiag(PostOutcome.CONFIGURATION_ERROR, { reason: "existing image bundle is for a different slate" });
    logFinal(market, edition, PostOutcome.CONFIGURATION_ERROR);
    process.exitCode = 1;
    return;
  }

  // ── Live-mode gating: identical event/flag gate the legacy posters use. ──
  const liveMode = !args.dryRun;
  if (liveMode) {
    try {
      assertLivePostAllowed({ eventName: process.env.GITHUB_EVENT_NAME ?? "", allowLivePost: process.env.X_ALLOW_LIVE_POST });
    } catch (error) {
      console.error(`[post-mlb-x-edition:${market}-${edition}] ${error.message}`);
      writeDiag(PostOutcome.CONFIGURATION_ERROR, { reason: error.message });
      logFinal(market, edition, PostOutcome.CONFIGURATION_ERROR);
      process.exitCode = 1;
      return;
    }
  }

  const stateStore = toOrchestratorStateStore(rawStore, args);
  const acquireLease = (receiptKey) => acquirePublicationLease({ receiptKey, leaseDir: args.leaseDirectory });

  let client = null;
  let verifiedAccount = false;
  const credentialsPresent = Boolean(process.env.JKB_X_API_KEY && process.env.JKB_X_API_SECRET && process.env.JKB_X_ACCESS_TOKEN && process.env.JKB_X_ACCESS_SECRET);
  if (credentialsPresent) {
    try {
      client = createXClientFromEnv(process.env, TwitterApi);
    } catch { /* handled by verifyAccount below returning false */ }
  }

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });

    const result = await runEditionPost({
      target: { market, edition, slateDate },
      planDirectory: args.planDirectory,
      stateStore,
      acquireLease,
      ensureImage: ({ rows }) =>
        ensureEditionImage({
          market, slateDate, rows, directory: args.imageDirectory,
          renderGraphic: (params) => renderGraphic({ ...params, browser }),
        }),
      buildCaption: buildCaptionForMarket(market),
      postPrimary: async ({ caption, imagePath }) => {
        if (!client) throw new Error("X client not configured (missing credentials).");
        if (args.postTextOnly) return postPrimaryTextOnly({ client, caption });
        return postPrimaryTweet({ client, caption, imagePath, fs: { existsSync, statSync } });
      },
      postReply: args.postTextOnly ? null : replyBuilderForMarket(market, client),
      verifyAccount: async () => {
        if (!client) return false;
        if (verifiedAccount) return true;
        const verify = await verifyExpectedXAccount({ client, expectedUsername: process.env.X_EXPECTED_USERNAME, log: (m) => log(market, edition, m) });
        verifiedAccount = verify.ok;
        return verify.ok;
      },
      dryRun: args.dryRun,
      liveConfig: { liveMode, allowLivePost: process.env.X_ALLOW_LIVE_POST === "true", credentialsPresent, verifiedAccount: true },
      log: (m) => log(market, edition, m),
      // Test-only: lets a dry run exercise a specific window (preferred,
      // fallback, after-window) against real scraped data without waiting for
      // the wall clock. Omitted in production -- runEditionPost defaults to
      // the real current time.
      ...(args.now ? { now: () => args.now } : {}),
    });

    const secrets = secretsFromEnv(process.env);
    console.log(JSON.stringify({ market, edition, slateDate, ...result }, null, 2).split("\n").map((l) => sanitizeLogValue(l, secrets)).join("\n"));
    logFinal(market, edition, result.status ?? result.outcome);

    // Persist a diagnostic for any non-post outcome runEditionPost returned
    // (IMAGE_FAILED, X_API_FAILED, ROW_MISMATCH, CONFIGURATION_ERROR from a
    // check inside the orchestrator itself, or a MISSED_WINDOW/NOT_DUE that
    // only became true on revalidation, after the plan said READY). A
    // posted-shaped outcome (POSTED, FALLBACK_POSTED, REPLY_RECOVERED,
    // ALREADY_POSTED, DRY_RUN, SKIPPED, LEASE_UNAVAILABLE) is not in the
    // allowlist, so writeDiag is a no-op for those -- the receipt already
    // speaks for a real publication.
    if (DIAGNOSTIC_OUTCOMES.includes(result.outcome)) {
      const reason = result.detail
        ? (typeof result.detail === "string" ? result.detail : JSON.stringify(result.detail))
        : (result.status ?? result.outcome);
      writeDiag(result.outcome, { reason });
    }

    const failureOutcomes = new Set([PostOutcome.X_API_FAILED, PostOutcome.IMAGE_FAILED, PostOutcome.CONFIGURATION_ERROR, PostOutcome.ROW_MISMATCH]);
    if (failureOutcomes.has(result.outcome)) process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
}

main().catch((error) => {
  console.error(`[post-mlb-x-edition] ${sanitizeLogValue(error instanceof Error ? error.message : String(error), secretsFromEnv(process.env))}`);
  process.exitCode = 1;
});
