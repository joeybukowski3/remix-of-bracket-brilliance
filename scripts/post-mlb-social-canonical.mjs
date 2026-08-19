#!/usr/bin/env node
/**
 * post-mlb-social-canonical.mjs
 *
 * Phase 5 manual/local entry point for the canonical publisher. Builds ONE
 * frozen SocialPostPlan (via the existing, unmodified Phase-1
 * composition/Phase-2 doubleheader-aware layer), then hands it -- unchanged --
 * to publishCanonicalSocialPost (mlb-social-canonical-publisher.mjs), which
 * consumes that same plan for graphic, caption, rowFingerprint, and
 * publication identity. No reranking or reselection happens anywhere in this
 * script.
 *
 * Usage:
 *   node scripts/post-mlb-social-canonical.mjs --product=k|hr --slate-date=YYYY-MM-DD
 *     [--source=fixture|local] [--rows=2|3|4|5] [--dry-run] [--live]
 *
 * Live gating is intentionally strict for a manual/local run: --live alone is
 * NOT enough. Live posting also requires GITHUB_EVENT_NAME to be one of
 * workflow_dispatch/schedule/workflow_run (assertLivePostAllowed, the exact
 * same gate the legacy/edition posters use) and X_ALLOW_LIVE_POST=true and
 * real X credentials -- none of which a bare local shell sets, so a plain
 * local invocation can NEVER post live by accident. Omitting --dry-run and
 * --live both still resolves to a dry run: only --live can make this
 * live-capable, and even then only if every other gate also agrees.
 *
 * This script only builds a plan and calls the canonical publisher -- it does
 * NOT touch the legacy edition plans/state/leases/images
 * (artifacts/mlb-x-plans, artifacts/mlb-x-images, artifacts/mlb-x-leases,
 * .mlb-x-state-work) at all, and writes its own images to a canonical-only
 * directory (artifacts/mlb-x-canonical-images) and its own leases/state work
 * dir, so it can never collide with the scheduled edition publisher (still
 * the only live path in Phase 5) or with poll-mlb-x-posts.yml's legacy
 * posters.
 */
import path from "node:path";
import process from "node:process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { TwitterApi } from "twitter-api-v2";
import { buildHrCanonicalCaption, buildKCanonicalCaption, buildCanonicalOmittedReply } from "./lib/mlb-social-canonical-caption.mjs";
import { ensureCanonicalImage } from "./lib/mlb-social-canonical-image.mjs";
import { CanonicalPostOutcome, publishCanonicalSocialPost } from "./lib/mlb-social-canonical-publisher.mjs";
import { buildPlanFromSource } from "./lib/mlb-social-plan-source.mjs";
import { createGitStateStore } from "./lib/mlb-x-state-store.mjs";
import { acquirePublicationLease } from "./lib/mlb-x-publication-lease.mjs";
import {
  assertLivePostAllowed,
  createXClientFromEnv,
  normalizeAllowLivePostFlag,
  postPrimaryTweet,
  postReplyTweet,
  sanitizeLogValue,
  secretsFromEnv,
  verifyExpectedXAccount,
} from "./lib/mlb-x-post-client.mjs";

const ROOT = process.cwd();

function parseArgs(argv) {
  const args = { dryRun: false, live: false };
  for (const raw of argv) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw === "--live") args.live = true;
    else if (raw.startsWith("--product=")) args.product = raw.slice("--product=".length);
    else if (raw.startsWith("--slate-date=")) args.slateDate = raw.slice("--slate-date=".length);
    else if (raw.startsWith("--source=")) args.source = raw.slice("--source=".length);
    else if (raw.startsWith("--rows=")) args.rows = Number(raw.slice("--rows=".length));
    else if (raw.startsWith("--image-directory=")) args.imageDirectory = raw.slice("--image-directory=".length);
    else if (raw.startsWith("--lease-directory=")) args.leaseDirectory = raw.slice("--lease-directory=".length);
    else if (raw.startsWith("--state-work-dir=")) args.stateWorkDir = raw.slice("--state-work-dir=".length);
  }
  if (!["k", "hr"].includes(args.product)) throw new Error(`--product must be "k" or "hr" (got "${args.product}").`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(args.slateDate ?? ""))) {
    throw new Error(`--slate-date is required and must be YYYY-MM-DD, got "${args.slateDate}".`);
  }
  args.source = args.source ?? "fixture";
  args.rows = Number.isInteger(args.rows) ? args.rows : null;
  args.imageDirectory = args.imageDirectory ?? path.join(ROOT, "artifacts", "mlb-x-canonical-images");
  args.leaseDirectory = args.leaseDirectory ?? path.join(ROOT, "artifacts", "mlb-x-canonical-leases");
  args.stateWorkDir = args.stateWorkDir ?? path.join(ROOT, ".mlb-x-canonical-state-work");
  // --dry-run always wins: it can only make a run safer, never less safe.
  args.dryRun = args.dryRun || !args.live;
  return args;
}

function log(product, message) {
  console.log(`[post-mlb-social-canonical:${product}] ${message}`);
}

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

function toPublisherStateStore(store) {
  return {
    sync: () => store.sync(),
    readCanonicalReceipt: ({ slateDate, product }) => store.readCanonicalReceipt({ slateDate, product }),
    writeCanonicalReceipt: ({ slateDate, product, receipt }) => store.writeCanonicalReceipt({ slateDate, product, receipt }),
  };
}

function buildCaptionForProduct(productKey) {
  return async (plan) => (productKey === "k" ? buildKCanonicalCaption(plan) : buildHrCanonicalCaption(plan));
}

function replyBuilderForProduct(productKey, client) {
  return async ({ inReplyTo, plan }) => {
    // Recomputed here (pure, cheap) rather than threaded through the
    // publisher's interface, so this one closure serves both the normal
    // post-then-reply path and reply-only recovery, where only `plan` exists.
    const captionResult = productKey === "k" ? buildKCanonicalCaption(plan) : buildHrCanonicalCaption(plan);
    const omitted = captionResult.skipped ? [] : captionResult.omittedRows ?? [];
    const { shouldReply, caption } = buildCanonicalOmittedReply({ omittedRows: omitted, product: productKey });
    if (!shouldReply) return null;
    return postReplyTweet({ client, caption, inReplyTo });
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { product, slateDate } = args;
  console.log(`[post-mlb-social-canonical:${product}] slateDate=${slateDate} source=${args.source} dryRun=${args.dryRun}`);

  const plan = buildPlanFromSource(product, { source: args.source, slateDate, rows: args.rows, root: ROOT, warn: (m) => console.warn(`[post-mlb-social-canonical:${product}] ${m}`) });
  if (!plan) {
    console.log(`[post-mlb-social-canonical:${product}] no canonical post: fewer than 2 distinct qualified opportunities.`);
    console.log(`[post-mlb-social-canonical:${product}] finalOutcome=${CanonicalPostOutcome.NO_PLAN}`);
    return;
  }
  log(product, `plan built: rows=${plan.rows.length} rowFingerprint=${plan.rowFingerprint} receiptKey=${plan.receiptKey}`);

  // ── Live-mode gating: same event/flag gate the legacy posters use, plus
  // this script's own --live requirement. Zero X calls before this passes. ──
  let liveMode = false;
  if (!args.dryRun) {
    try {
      assertLivePostAllowed({
        eventName: process.env.GITHUB_EVENT_NAME ?? "",
        allowLivePost: process.env.X_ALLOW_LIVE_POST,
        log: (m) => log(product, m),
      });
      liveMode = true;
    } catch (error) {
      console.error(`[post-mlb-social-canonical:${product}] ${error.message}`);
      console.log(`[post-mlb-social-canonical:${product}] finalOutcome=${CanonicalPostOutcome.CONFIGURATION_ERROR}`);
      process.exitCode = 1;
      return;
    }
  }

  const rawStore = makeStateStore(args.stateWorkDir);
  const stateStore = toPublisherStateStore(rawStore);
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
    if (!args.dryRun) browser = await chromium.launch({ headless: true });

    const result = await publishCanonicalSocialPost({
      plan,
      liveMode,
      allowLivePost: normalizeAllowLivePostFlag(process.env.X_ALLOW_LIVE_POST).enabled,
      credentialsPresent,
      stateStore,
      acquireLease,
      ensureImage: (thePlan) => ensureCanonicalImage({ plan: thePlan, directory: args.imageDirectory, browser }),
      buildCaption: buildCaptionForProduct(product),
      postPrimary: async ({ caption, imagePath }) => {
        if (!client) throw new Error("X client not configured (missing credentials).");
        return postPrimaryTweet({ client, caption, imagePath, fs: { existsSync, statSync } });
      },
      postReply: replyBuilderForProduct(product, client),
      verifyAccount: async () => {
        if (!client) return false;
        if (verifiedAccount) return true;
        const verify = await verifyExpectedXAccount({ client, expectedUsername: process.env.X_EXPECTED_USERNAME, log: (m) => log(product, m) });
        verifiedAccount = verify.ok;
        return verify.ok;
      },
      dryRun: args.dryRun,
      log: (m) => log(product, m),
    });

    const secrets = secretsFromEnv(process.env);
    console.log(JSON.stringify({ product, slateDate, ...result }, null, 2).split("\n").map((l) => sanitizeLogValue(l, secrets)).join("\n"));
    console.log(`[post-mlb-social-canonical:${product}] finalOutcome=${result.outcome}`);

    const failureOutcomes = new Set([CanonicalPostOutcome.X_API_FAILED, CanonicalPostOutcome.IMAGE_FAILED, CanonicalPostOutcome.CONFIGURATION_ERROR, CanonicalPostOutcome.CONSISTENCY_FAILED]);
    if (failureOutcomes.has(result.outcome)) process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
}

main().catch((error) => {
  console.error(`[post-mlb-social-canonical] ${sanitizeLogValue(error instanceof Error ? error.message : String(error), secretsFromEnv(process.env))}`);
  process.exitCode = 1;
});
