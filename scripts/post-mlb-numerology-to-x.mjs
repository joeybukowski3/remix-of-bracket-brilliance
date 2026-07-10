import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";
import { TwitterApi } from "twitter-api-v2";
import { buildCaption, validatePreviewReady } from "./lib/mlb-numerology-x-post-core.mjs";
import { checkDailyPostingLock, getForceRepostOverride, savePostReceipt } from "./lib/mlb-x-daily-lock.mjs";
import { assertScheduledLiveGateEnabled } from "./lib/mlb-numerology-scheduled-gate.mjs";

const ROOT = process.cwd();
const LOCAL_PREVIEW_PATH = path.join(ROOT, "public", "data", "mlb", "numerology", "x-post-preview.json");
const PRODUCTION_PREVIEW_URL = "https://www.joeknowsball.com/data/mlb/numerology/x-post-preview.json";
const GITHUB_PREVIEW_URL = "https://raw.githubusercontent.com/joeybukowski3/remix-of-bracket-brilliance/main/public/data/mlb/numerology/x-post-preview.json";
// Defaults to the live production export page, matching the HR props X
// poster's always-screenshot-production pattern. Overridable so this same
// script can screenshot a local dev/preview server before the export
// route has ever been deployed -- see README note in the workflow file.
const SCREENSHOT_URL = process.env.NUMEROLOGY_X_SCREENSHOT_URL || "https://www.joeknowsball.com/mlb/numerology/x-export";
const EXPORT_SELECTOR = '[data-x-export="mlb-numerology-social"]';
const SCREENSHOT_PATH = path.join(ROOT, "artifacts", "mlb-numerology-x.png");
const DEFAULT_DUPLICATE_STATE_DIR = path.join(ROOT, "artifacts", "x-post-state");
const args = new Set(process.argv.slice(2));

function usage() {
  return [
    "Usage: node scripts/post-mlb-numerology-to-x.mjs --dry-run",
    "       node scripts/post-mlb-numerology-to-x.mjs --post",
    "       node scripts/post-mlb-numerology-to-x.mjs --post-text-only",
    "       node scripts/post-mlb-numerology-to-x.mjs --verify-account",
    "       node scripts/post-mlb-numerology-to-x.mjs --post-key-only",
    "",
    "--dry-run  Build the X caption, screenshot the numerology export graphic, and do not post.",
    "--post     Manual GitHub Actions only: validate account, build the caption, screenshot the graphic, and publish to X.",
    "--post-text-only  Manual GitHub Actions only: validate account, build the caption, and publish text only to X.",
    "--verify-account  Verify configured X credentials and expected username without building a caption.",
    "--post-key-only  Print the deterministic duplicate-protection key for the current slate/top play.",
    "",
    "Set NUMEROLOGY_X_DATA_SOURCE to production, github, or local. Default: production.",
    "Set NUMEROLOGY_X_SCREENSHOT_URL to override the page screenshotted (default: production export route).",
    "Set X_EXPECTED_USERNAME to the exact X username that is allowed to post.",
    "Set JKB_X_API_KEY, JKB_X_API_SECRET, JKB_X_ACCESS_TOKEN, and JKB_X_ACCESS_SECRET for JoeKnowsBall posting.",
  ].join("\n");
}

function getMode() {
  const dryRun = args.has("--dry-run");
  const post = args.has("--post");
  const postTextOnly = args.has("--post-text-only");
  const verifyAccount = args.has("--verify-account");
  const postKeyOnly = args.has("--post-key-only");
  const modes = [dryRun, post, postTextOnly, verifyAccount, postKeyOnly].filter(Boolean).length;
  if (modes > 1) throw new Error("Choose only one mode: --dry-run, --post, --post-text-only, --verify-account, or --post-key-only.");
  if (!modes) return "dry-run";
  if (verifyAccount) return "verify-account";
  if (postKeyOnly) return "post-key-only";
  if (postTextOnly) return "post-text-only";
  return post ? "post" : "dry-run";
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getDataSource() {
  const value = normalizeText(process.env.NUMEROLOGY_X_DATA_SOURCE).toLowerCase();
  const source = value || "production";
  if (!["production", "github", "local"].includes(source)) {
    throw new Error(`Invalid NUMEROLOGY_X_DATA_SOURCE="${source}". Expected production, github, or local.`);
  }
  return source;
}

function getPreviewLocation(source) {
  if (source === "production") return PRODUCTION_PREVIEW_URL;
  if (source === "github") return GITHUB_PREVIEW_URL;
  return LOCAL_PREVIEW_PATH;
}

async function loadPreview(source) {
  const location = getPreviewLocation(source);
  if (source === "local") return JSON.parse(readFileSync(location, "utf8"));
  const response = await fetch(location, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load ${location}: HTTP ${response.status}`);
  return response.json();
}

function getTodayEt() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function screenshotNumerologyExport(outputPath = SCREENSHOT_PATH) {
  mkdirSync(path.dirname(outputPath), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1600 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(60000);
    await page.goto(SCREENSHOT_URL, { waitUntil: "networkidle", timeout: 60000 });

    const exportTarget = page.locator(EXPORT_SELECTOR).first();
    await exportTarget.waitFor({ state: "visible", timeout: 15000 });
    await exportTarget.screenshot({ path: outputPath, animations: "disabled" });

    const { statSync } = await import("node:fs");
    const { size } = statSync(outputPath);
    const sizeMb = (size / 1_048_576).toFixed(2);
    console.log(`[mlb-numerology-x] screenshotSize=${sizeMb} MB`);
    if (size > 4_900_000) {
      console.warn(`[mlb-numerology-x] WARNING: screenshot is ${sizeMb} MB — close to X's 5 MB limit`);
    }

    return outputPath;
  } finally {
    await browser.close();
  }
}

function normalizeUsername(value) {
  return normalizeText(value).replace(/^@/, "").toLowerCase();
}

// Content fingerprint: audit/debugging only, retained in the receipt --
// NOT the duplicate-post gate. See buildDailyPostingKey, and HR's
// identical split (post-mlb-hr-props-to-x.mjs) for why a fingerprint-
// keyed gate is unsafe.
function buildContentFingerprint(preview) {
  const fingerprint = {
    date: preview?.date,
    topPlay: preview?.topPlay,
    secondPlay: preview?.secondPlay,
    thirdPlay: preview?.thirdPlay,
    othersOver50: preview?.othersOver50,
  };
  const hash = createHash("sha256").update(JSON.stringify(fingerprint)).digest("hex").slice(0, 16);
  return `mlb-numerology-${normalizeText(preview?.date)}-${hash}`;
}

// The actual duplicate-post gate: one key per slate date.
function buildDailyPostingKey(preview) {
  return `mlb-numerology:${normalizeText(preview?.date)}`;
}

function getStateDir() {
  return normalizeText(process.env.X_DUPLICATE_STATE_DIR) || DEFAULT_DUPLICATE_STATE_DIR;
}

function createXClientFromEnv() {
  const appKey = process.env.JKB_X_API_KEY;
  const appSecret = process.env.JKB_X_API_SECRET;
  const accessToken = process.env.JKB_X_ACCESS_TOKEN;
  const accessSecret = process.env.JKB_X_ACCESS_SECRET;

  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    throw new Error("Missing JoeKnowsBall X credentials. Expected JKB_X_API_KEY, JKB_X_API_SECRET, JKB_X_ACCESS_TOKEN, and JKB_X_ACCESS_SECRET.");
  }

  return new TwitterApi({ appKey, appSecret, accessToken, accessSecret });
}

async function verifyExpectedXAccount() {
  const expectedUsername = normalizeUsername(process.env.X_EXPECTED_USERNAME);
  if (!expectedUsername) throw new Error("Missing X_EXPECTED_USERNAME. Expected X_EXPECTED_USERNAME=_joeknowsball_.");

  const client = createXClientFromEnv();
  const account = await client.v1.verifyCredentials();
  const username = normalizeUsername(account?.screen_name);
  const displayUsername = username ? `@${username}` : "@unknown";
  const name = normalizeText(account?.name);
  const id = normalizeText(account?.id_str ?? account?.id);

  console.log(`[mlb-numerology-x] Authenticated X account: ${displayUsername}${name ? ` (${name})` : ""}${id ? ` id=${id}` : ""}`);

  if (!username) throw new Error("Authenticated X username was missing from verify_credentials response.");
  if (username !== expectedUsername) {
    throw new Error(`Authenticated X username @${username} does not match expected @${expectedUsername}.`);
  }

  console.log(`[mlb-numerology-x] Authenticated X account matches expected @${expectedUsername}.`);
  return { client, username, name, id };
}

function assertLivePostAllowed() {
  const eventName = process.env.GITHUB_EVENT_NAME ?? "";
  const allowed = eventName === "workflow_dispatch" || eventName === "schedule" || eventName === "workflow_run";
  if (!allowed) {
    throw new Error(`Live posting is blocked for event "${eventName}". Only workflow_dispatch, schedule, and workflow_run events may post.`);
  }
  if (process.env.X_ALLOW_LIVE_POST !== "true") {
    throw new Error("Live posting is blocked unless X_ALLOW_LIVE_POST=true is set by the workflow.");
  }
}

async function publishPost({ client, caption, screenshotPath }) {
  const mediaId = await client.v1.uploadMedia(screenshotPath, { mimeType: "image/png" });
  const mediaIdStr = String(mediaId);
  console.log(`[mlb-numerology-x] uploadedMediaId=${mediaIdStr}`);

  await new Promise((resolve) => setTimeout(resolve, 2000));

  const response = await client.v2.tweet(caption, { media: { media_ids: [mediaIdStr] } });
  const tweetId = normalizeText(response?.data?.id);
  if (!tweetId) throw new Error("X post response did not include a tweet ID.");

  const tweetUrl = `https://x.com/_joeknowsball_/status/${tweetId}`;
  console.log(`[mlb-numerology-x] postedTweetId=${tweetId}`);
  console.log(`[mlb-numerology-x] postedTweetUrl=${tweetUrl}`);
  return { tweetId, tweetUrl, mediaId: mediaIdStr };
}

async function publishTextOnlyPost({ client, caption }) {
  const response = await client.v2.tweet(caption);
  const tweetId = normalizeText(response?.data?.id);
  if (!tweetId) throw new Error("X text-only post response did not include a tweet ID.");

  const tweetUrl = `https://x.com/_joeknowsball_/status/${tweetId}`;
  console.log(`[mlb-numerology-x] postedTweetId=${tweetId}`);
  console.log(`[mlb-numerology-x] postedTweetUrl=${tweetUrl}`);
  return { tweetId, tweetUrl };
}

function getNestedValue(source, pathParts) {
  let value = source;
  for (const part of pathParts) {
    if (!value || typeof value !== "object") return undefined;
    value = value[part];
  }
  return value;
}

function getFirstDefined(source, paths) {
  for (const pathParts of paths) {
    const value = getNestedValue(source, pathParts);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function sanitizeLogValue(value) {
  let text = String(value);
  for (const secret of [process.env.JKB_X_API_KEY, process.env.JKB_X_API_SECRET, process.env.JKB_X_ACCESS_TOKEN, process.env.JKB_X_ACCESS_SECRET]) {
    if (secret) text = text.split(secret).join("[redacted]");
  }
  return text
    .replace(/authorization:\s*[^\n\r]+/gi, "authorization: [redacted]")
    .replace(/(oauth_[a-z_]+=)"[^"]+"/gi, '$1"[redacted]"')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]");
}

function logXApiError(error) {
  if (!error || typeof error !== "object") return;
  const status = getFirstDefined(error, [["status"], ["statusCode"], ["code"], ["data", "status"], ["data", "statusCode"], ["error", "status"]]);
  const code = getFirstDefined(error, [["code"], ["data", "code"], ["data", "error", "code"], ["error", "code"]]);
  const title = getFirstDefined(error, [["data", "title"], ["data", "error", "title"], ["error", "title"]]);
  const detail = getFirstDefined(error, [["data", "detail"], ["data", "error", "detail"], ["error", "detail"]]);
  const errors = Array.isArray(error.data?.errors) ? error.data.errors : [];

  if (status !== undefined || code !== undefined) {
    console.error(`[mlb-numerology-x] X API error status=${sanitizeLogValue(status ?? "unknown")} code=${sanitizeLogValue(code ?? "unknown")}`);
  }
  if (title !== undefined) console.error(`[mlb-numerology-x] X API error title=${sanitizeLogValue(title)}`);
  if (detail !== undefined) console.error(`[mlb-numerology-x] X API error detail=${sanitizeLogValue(detail)}`);
  for (const [index, item] of errors.entries()) {
    const itemTitle = normalizeText(item?.title);
    const itemDetail = normalizeText(item?.detail);
    const itemCode = normalizeText(item?.code);
    console.error(`[mlb-numerology-x] X API error item ${index + 1}: code=${sanitizeLogValue(itemCode || "unknown")} title=${sanitizeLogValue(itemTitle || "unknown")} detail=${sanitizeLogValue(itemDetail || "unknown")}`);
  }
}

function logFinalStatus(status) {
  console.log(`[mlb-numerology-x] finalStatus=${status}`);
}

async function main() {
  if (args.has("--help") || args.has("-h")) {
    console.log(usage());
    return;
  }

  const mode = getMode();
  if (mode === "verify-account") {
    await verifyExpectedXAccount();
    return;
  }

  let account = null;
  if (mode === "post" || mode === "post-text-only") {
    assertLivePostAllowed();
    assertScheduledLiveGateEnabled(process.env.GITHUB_EVENT_NAME ?? "", process.env.NUMEROLOGY_X_SCHEDULED_LIVE_ENABLED);
    account = await verifyExpectedXAccount();
  }

  const source = getDataSource();
  if ((mode === "post" || mode === "post-text-only") && source !== "production") {
    throw new Error("Live posting requires NUMEROLOGY_X_DATA_SOURCE=production.");
  }

  const preview = await loadPreview(source);
  const freshnessError = validatePreviewReady(preview, getTodayEt());

  if (mode === "post-key-only") {
    if (freshnessError) throw new Error(freshnessError);
    console.log(buildDailyPostingKey(preview));
    return;
  }

  console.log(`[mlb-numerology-x] mode=${mode}`);
  console.log(`[mlb-numerology-x] dataSource=${source}`);
  console.log(`[mlb-numerology-x] previewLocation=${getPreviewLocation(source)}`);
  console.log(`[mlb-numerology-x] todayEt=${getTodayEt()}`);
  console.log(`[mlb-numerology-x] previewSlateDate=${normalizeText(preview?.date) || "missing"}`);

  if (freshnessError) {
    console.log(`[mlb-numerology-x] ${freshnessError}`);
    logFinalStatus("SKIPPED_NO_ELIGIBLE_ROWS");
    return;
  }

  const result = buildCaption(preview);
  if (result.skipped) {
    console.log(`[mlb-numerology-x] ${result.reason}`);
    logFinalStatus("SKIPPED_NO_ELIGIBLE_ROWS");
    return;
  }

  console.log(`[mlb-numerology-x] captionLength=${result.caption.length}`);
  const contentFingerprint = buildContentFingerprint(preview);
  const dailyPostingKey = buildDailyPostingKey(preview);
  console.log(`[mlb-numerology-x] contentFingerprint=${contentFingerprint}`);
  console.log(`[mlb-numerology-x] dailyPostingKey=${dailyPostingKey}`);

  if (mode !== "post" && mode !== "post-text-only") {
    // dry-run (including a schedule event resolved down to dry-run by the
    // workflow's scheduled-live gate): preview only, never consumes or
    // checks the daily lock.
    console.log("");
    console.log(result.caption);
    console.log("");
    if (mode === "dry-run") {
      try {
        const screenshotPath = await screenshotNumerologyExport();
        console.log(`[mlb-numerology-x] screenshotPath=${screenshotPath}`);
      } catch (screenshotErr) {
        console.warn(`[mlb-numerology-x] Screenshot failed: ${screenshotErr instanceof Error ? screenshotErr.message : screenshotErr}`);
      }
    }
    logFinalStatus("SKIPPED_PREVIEW_MODE");
    return;
  }

  const forceRepost = getForceRepostOverride(process.env.GITHUB_EVENT_NAME ?? "", process.env.NUMEROLOGY_X_FORCE_REPOST);
  const lock = checkDailyPostingLock(dailyPostingKey, getStateDir(), { allowOverride: forceRepost });
  if (lock.blocked) {
    console.log(`[mlb-numerology-x] Duplicate protection: ${dailyPostingKey} already has a post receipt at ${lock.statePath}. No live post will be attempted.`);
    logFinalStatus("SKIPPED_ALREADY_POSTED_TODAY");
    return;
  }
  if (lock.overrodeExistingLock) {
    console.log(`[mlb-numerology-x] Daily posting lock for ${dailyPostingKey} is already set, but an explicit force-repost override was provided -- proceeding.`);
  }
  const duplicateStatePath = lock.statePath;
  console.log("");
  console.log(result.caption);
  console.log("");

  let screenshotPath = "";
  if (mode !== "post-text-only") {
    try {
      screenshotPath = await screenshotNumerologyExport();
      console.log(`[mlb-numerology-x] screenshotPath=${screenshotPath}`);
    } catch (screenshotErr) {
      console.warn(`[mlb-numerology-x] Screenshot failed — will post text-only: ${screenshotErr instanceof Error ? screenshotErr.message : screenshotErr}`);
    }
  }

  const baseReceipt = {
    dailyPostingKey,
    contentFingerprint,
    slateDate: normalizeText(preview?.date),
    postedAt: new Date().toISOString(),
    forcedOverride: forceRepost,
  };

  if (mode === "post") {
    if (screenshotPath) {
      const post = await publishPost({ client: account.client, caption: result.caption, screenshotPath });
      savePostReceipt(duplicateStatePath, { ...baseReceipt, tweetId: post.tweetId, tweetUrl: post.tweetUrl, mediaId: post.mediaId, screenshotPath });
      console.log(`[mlb-numerology-x] duplicateReceipt=${duplicateStatePath}`);
    } else {
      console.log("[mlb-numerology-x] Falling back to text-only post");
      const post = await publishTextOnlyPost({ client: account.client, caption: result.caption });
      savePostReceipt(duplicateStatePath, { ...baseReceipt, mode: "text-only-fallback", tweetId: post.tweetId, tweetUrl: post.tweetUrl });
      console.log(`[mlb-numerology-x] duplicateReceipt=${duplicateStatePath}`);
    }
  }

  if (mode === "post-text-only") {
    const post = await publishTextOnlyPost({ client: account.client, caption: result.caption });
    savePostReceipt(duplicateStatePath, { ...baseReceipt, mode: "text-only", tweetId: post.tweetId, tweetUrl: post.tweetUrl });
    console.log(`[mlb-numerology-x] duplicateReceipt=${duplicateStatePath}`);
  }

  logFinalStatus("POSTED");
}

try {
  await main();
} catch (error) {
  console.error(`[mlb-numerology-x] ${sanitizeLogValue(error instanceof Error ? error.message : error)}`);
  logXApiError(error);
  console.log("[mlb-numerology-x] finalStatus=FAILED");
  console.error("");
  console.error(usage());
  process.exitCode = 1;
}
