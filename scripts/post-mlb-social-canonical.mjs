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
 *     [--source=fixture|local|production] [--candidates-file=path] [--rows=2|3|4|5] [--dry-run] [--live]
 *
 * --source=production is the only source a scheduled live workflow run may
 * use (see .github/workflows/mlb-x-canonical.yml). For K it requires
 * --candidates-file=<path to scripts/generate-mlb-k-production-candidates.ts's
 * output> and throws rather than posting anything if that file is missing or
 * malformed -- see scripts/lib/mlb-k-production-candidates.mjs.
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
import { CanonicalReceiptState, classifyCanonicalReceipt, evaluateCanonicalPublication, isBeforeCanonicalCutover } from "./lib/mlb-x-canonical-readiness.mjs";
import { buildPlanFromSource } from "./lib/mlb-social-plan-source.mjs";
import { createGitStateStore } from "./lib/mlb-x-state-store.mjs";
import { acquirePublicationLease } from "./lib/mlb-x-publication-lease.mjs";
import { fetchSlateTiming } from "./lib/mlb-x-slate-timing.mjs";
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
    else if (raw.startsWith("--candidates-file=")) args.candidatesFile = raw.slice("--candidates-file=".length);
    else if (raw.startsWith("--rows=")) args.rows = Number(raw.slice("--rows=".length));
    else if (raw.startsWith("--image-directory=")) args.imageDirectory = raw.slice("--image-directory=".length);
    else if (raw.startsWith("--lease-directory=")) args.leaseDirectory = raw.slice("--lease-directory=".length);
    else if (raw.startsWith("--state-work-dir=")) args.stateWorkDir = raw.slice("--state-work-dir=".length);
    else if (raw === "--offline") args.offline = true;
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

/**
 * The reply DECISION and TEXT, derived from the frozen plan. Called by the
 * publisher exactly once, at primary-post time, and persisted onto the
 * receipt -- never called again for reply-only recovery (see
 * mlb-social-canonical-publisher.mjs), so a later run's freshly-built `plan`
 * (which may reflect different current data) can never change what an
 * already-posted primary's reply says.
 */
function buildReplyForProduct(productKey) {
  return async (plan) => {
    const captionResult = productKey === "k" ? buildKCanonicalCaption(plan) : buildHrCanonicalCaption(plan);
    const omitted = captionResult.skipped ? [] : captionResult.omittedRows ?? [];
    return buildCanonicalOmittedReply({ omittedRows: omitted, product: productKey }); // {shouldReply, caption}
  };
}

/**
 * Pure "send this exact text as a reply" side effect. Deliberately takes
 * only `caption` (never `plan`) -- the reply CONTENT is entirely decided
 * upstream by buildReplyForProduct/the publisher, so this closure can never
 * recompute or diverge from the persisted reply text.
 */
function replySenderForProduct(client) {
  return async ({ inReplyTo, caption }) => postReplyTweet({ client, caption, inReplyTo });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { product, slateDate } = args;
  console.log(`[post-mlb-social-canonical:${product}] slateDate=${slateDate} source=${args.source} dryRun=${args.dryRun}`);

  // ── Phase 7 cutover guard, checked before anything else -- plan build,
  // state sync, live-mode gating. A slate date the legacy edition/poll
  // systems could already have published under a different receipt
  // namespace must never receive a canonical primary post; see
  // isBeforeCanonicalCutover in mlb-x-canonical-readiness.mjs. ──────────────
  if (isBeforeCanonicalCutover(slateDate)) {
    console.log(JSON.stringify({ readinessStatus: "NO_POST_FOR_SLATE", reason: "BEFORE_CANONICAL_CUTOVER", planBuilt: false, wouldCallX: false }, null, 2));
    console.log(`[post-mlb-social-canonical:${product}] finalOutcome=NO_POST_FOR_SLATE`);
    return;
  }

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
  const productKey = product === "k" ? "mlb-k-props" : "mlb-hr-props";

  // ── Phase 6 receipt-first check. Sync + classify the canonical receipt
  // BEFORE building a plan, fetching slate timing, or doing any acquisition
  // work at all. A fully-published product/date returns immediately here and
  // never pays for plan composition, timing fetch, rendering, or X calls. ──
  rawStore.sync();
  const existingReceipt = rawStore.readCanonicalReceipt({ slateDate, product: productKey });
  const receiptState = classifyCanonicalReceipt(existingReceipt);

  if (receiptState === CanonicalReceiptState.FULLY_PUBLISHED) {
    console.log(JSON.stringify({
      readinessStatus: "ALREADY_PUBLISHED", reason: "PRIMARY_AND_REPLY_COMPLETE", receiptState,
      qualifiedRowCount: 0, pendingConfirmationCount: null, earliestIncludedGameStart: null, publicationCutoff: null,
      planBuilt: false, wouldCallX: false,
    }, null, 2));
    console.log(`[post-mlb-social-canonical:${product}] finalOutcome=ALREADY_PUBLISHED`);
    return;
  }

  // ── Plan build + slate timing are only needed once we know the receipt is
  // NOT already fully published (fresh candidate, or reply-recovery-only,
  // where `plan` is still required for publication identity, but the reply
  // CONTENT itself comes from the persisted receipt -- see
  // mlb-social-canonical-publisher.mjs -- never from this freshly-built
  // plan). ───────────────────────────────────────────────────────────────
  const { plan, pendingConfirmationCount } = buildPlanFromSource(product, {
    source: args.source, slateDate, rows: args.rows, root: ROOT,
    warn: (m) => console.warn(`[post-mlb-social-canonical:${product}] ${m}`),
    productionKCandidatesPath: args.candidatesFile ?? null,
  });
  if (plan) log(product, `plan built: rows=${plan.rows.length} rowFingerprint=${plan.rowFingerprint} receiptKey=${plan.receiptKey} pendingConfirmationCount=${pendingConfirmationCount}`);

  let slateTiming = null;
  if (!args.offline) {
    try {
      slateTiming = await fetchSlateTiming({ date: slateDate });
    } catch (error) {
      log(product, `slate timing fetch failed, treating as unknown: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const readiness = evaluateCanonicalPublication({ product: productKey, slateDate, existingReceipt, plan, pendingConfirmationCount, slateTiming });
  console.log(JSON.stringify({
    readinessStatus: readiness.status,
    reason: readiness.reason,
    receiptState: readiness.receiptState,
    qualifiedRowCount: readiness.qualifiedRowCount,
    pendingConfirmationCount,
    earliestIncludedGameStart: readiness.earliestIncludedGameStart,
    publicationCutoff: readiness.publicationCutoff,
    planBuilt: Boolean(plan),
    wouldCallX: readiness.shouldCallX && liveMode,
  }, null, 2));

  if (!readiness.shouldBuildPlan && !readiness.shouldCallX) {
    console.log(`[post-mlb-social-canonical:${product}] finalOutcome=${readiness.status}`);
    return;
  }

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
      buildReply: buildReplyForProduct(product),
      postPrimary: async ({ caption, imagePath }) => {
        if (!client) throw new Error("X client not configured (missing credentials).");
        return postPrimaryTweet({ client, caption, imagePath, fs: { existsSync, statSync } });
      },
      postReply: replySenderForProduct(client),
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
