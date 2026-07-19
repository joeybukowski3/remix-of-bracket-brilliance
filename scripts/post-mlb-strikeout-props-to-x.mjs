import { mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";
import { TwitterApi } from "twitter-api-v2";
import { filterEligibleKRows } from "./lib/mlb-k-social-eligibility.mjs";
import { checkDailyPostingLock, getDuplicateStatePath, getForceRepostOverride, readPostReceipt, savePostReceipt } from "./lib/mlb-x-daily-lock.mjs";
import { buildConfirmationSnapshot, resolveKRowFacts } from "./lib/mlb-x-confirmation-snapshot.mjs";
import { selectConfirmedKRows } from "./lib/mlb-k-x-selection-core.mjs";
import { resolvePostingReadiness, WaitingReason } from "./lib/mlb-x-readiness.mjs";
import {
  getEtMinutesSinceMidnight,
  getEtSlateDate,
  isAtOrAfterEtClockTime,
  K_EARLIEST_POST_ET_HOUR,
  K_EARLIEST_POST_ET_MINUTE,
  SlatePhase,
} from "./lib/mlb-x-slate-timing.mjs";
import {
  ARTIFACT_MISMATCH_STATUS,
  assertArtifactConsistency,
  buildKArtifact,
  validateArtifact,
} from "./lib/mlb-x-selection-artifact.mjs";
import { buildKCaptionFromArtifact, K_VALUE_REPLY_CAPTION } from "./lib/mlb-x-artifact-caption.mjs";
import { writeMlbSocialGraphic } from "./lib/mlb-social-graphic-renderer.mjs";

const ROOT = process.cwd();
const STRIKEOUT_PROPS_URL = "https://www.joeknowsball.com/mlb";
const PAGE_EXPORT_SELECTOR = '[data-x-export="mlb-k-social"]';
const ROW_SELECTOR = "[data-k-row]";
const K_TAB_LABEL = "K Props";
const K_TARGET_TABLE_SIZE = 5;
const SCREENSHOT_PATH = path.join(ROOT, "artifacts", "mlb-strikeout-props-x.png");
const SVG_PATH = path.join(ROOT, "artifacts", "mlb-strikeout-props-x.svg");
const ARTIFACT_PATH = path.join(ROOT, "artifacts", "mlb-strikeout-props-x-selection.json");
const DEFAULT_DUPLICATE_STATE_DIR = path.join(ROOT, "artifacts", "x-post-state");
const args = new Set(process.argv.slice(2));

function usage() {
  return [
    "Usage: node scripts/post-mlb-strikeout-props-to-x.mjs --dry-run | --post | --post-text-only | --verify-account | --post-key-only",
    "",
    "Scrapes the live K table for market data, confirms current starters against the",
    "LIVE snapshot, freezes the confirmed-only selection into an immutable artifact,",
    "renders the bare /mlb/strikeout-props/x-export route locally, and posts only when",
    "the rendered rows + caption exactly match the artifact.",
  ].join("\n");
}

function getMode() {
  const modes = ["--dry-run", "--post", "--post-text-only", "--verify-account", "--post-key-only"].filter((m) => args.has(m));
  if (modes.length > 1) throw new Error("Choose only one mode.");
  if (!modes.length) return "dry-run";
  return modes[0].slice(2);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTeam(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeUsername(value) {
  return normalizeText(value).replace(/^@/, "").toLowerCase();
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getTodayEt() {
  return getEtSlateDate(new Date());
}

function buildDailyPostingKey(date) {
  return `mlb-k-props:${date}`;
}

function getStateDir() {
  return normalizeText(process.env.X_DUPLICATE_STATE_DIR) || DEFAULT_DUPLICATE_STATE_DIR;
}

function createXClientFromEnv() {
  const { JKB_X_API_KEY, JKB_X_API_SECRET, JKB_X_ACCESS_TOKEN, JKB_X_ACCESS_SECRET } = process.env;
  if (!JKB_X_API_KEY || !JKB_X_API_SECRET || !JKB_X_ACCESS_TOKEN || !JKB_X_ACCESS_SECRET) {
    throw new Error("Missing JoeKnowsBall X credentials.");
  }
  return new TwitterApi({ appKey: JKB_X_API_KEY, appSecret: JKB_X_API_SECRET, accessToken: JKB_X_ACCESS_TOKEN, accessSecret: JKB_X_ACCESS_SECRET });
}

async function verifyExpectedXAccount() {
  const expectedUsername = normalizeUsername(process.env.X_EXPECTED_USERNAME);
  if (!expectedUsername) throw new Error("Missing X_EXPECTED_USERNAME.");
  const client = createXClientFromEnv();
  const account = await client.v1.verifyCredentials();
  const username = normalizeUsername(account?.screen_name);
  if (username !== expectedUsername) throw new Error(`Authenticated X username @${username} does not match expected @${expectedUsername}.`);
  console.log(`[mlb-strikeout-props-x] Authenticated X account matches expected @${expectedUsername}.`);
  return { client, username };
}

function assertLivePostAllowed() {
  const eventName = process.env.GITHUB_EVENT_NAME ?? "";
  if (!["workflow_dispatch", "schedule", "workflow_run"].includes(eventName)) throw new Error(`Live posting is blocked for event "${eventName}".`);
  if (process.env.X_ALLOW_LIVE_POST !== "true") throw new Error("Live posting is blocked unless X_ALLOW_LIVE_POST=true.");
}

function sanitizeLogValue(value) {
  let text = String(value);
  for (const secret of [process.env.JKB_X_API_KEY, process.env.JKB_X_API_SECRET, process.env.JKB_X_ACCESS_TOKEN, process.env.JKB_X_ACCESS_SECRET]) {
    if (secret) text = text.split(secret).join("[redacted]");
  }
  return text.replace(/authorization:\s*[^\n\r]+/gi, "authorization: [redacted]").replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]");
}

function logFinalStatus(status) {
  console.log(`[mlb-strikeout-props-x] finalStatus=${status}`);
}

/** Scrape the live K table for market/projection data (authoritative page computation). */
async function scrapeKPageRows(page) {
  await page.goto(STRIKEOUT_PROPS_URL, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  try {
    const tab = page.locator(`button:has-text("${K_TAB_LABEL}")`).first();
    await tab.scrollIntoViewIfNeeded({ timeout: 8000 });
    await tab.click({ timeout: 8000 });
  } catch {
    const fallbackTab = page.locator(`button:text-is("🎯 K Props")`).first();
    await fallbackTab.scrollIntoViewIfNeeded({ timeout: 5000 });
    await fallbackTab.click({ timeout: 5000 });
  }
  await page.waitForTimeout(500);

  const exportTarget = page.locator(PAGE_EXPORT_SELECTOR).first();
  await exportTarget.waitFor({ state: "visible", timeout: 15000 });
  const meta = await exportTarget.evaluate((el) => ({
    date: el.getAttribute("data-k-date") || "",
    generatedAt: el.getAttribute("data-k-generated-at") || "",
  }));

  const rowLocators = exportTarget.locator(ROW_SELECTOR);
  const rowCount = await rowLocators.count();
  const rows = [];
  for (let i = 0; i < rowCount; i++) {
    const data = await rowLocators.nth(i).evaluate((el) => ({
      pitcher: el.getAttribute("data-k-pitcher") || "",
      team: el.getAttribute("data-k-team") || "",
      opponent: el.getAttribute("data-k-opponent") || "",
      line: el.getAttribute("data-k-line") || "",
      oddsOver: el.getAttribute("data-k-odds-over") || "",
      oddsUnder: el.getAttribute("data-k-odds-under") || "",
      bookmaker: el.getAttribute("data-k-bookmaker") || "",
      status: el.getAttribute("data-k-status") || "",
      side: el.getAttribute("data-k-side") || "",
      projectedKs: el.getAttribute("data-k-projected-ks") || "",
      projectionEdge: el.getAttribute("data-k-projection-edge") || "",
      projectedIP: el.getAttribute("data-k-projected-ip") || "",
      strikeoutScore: el.getAttribute("data-k-score") || "",
    }));
    rows.push({
      pitcher: normalizeText(data.pitcher),
      team: normalizeTeam(data.team),
      opponent: normalizeTeam(data.opponent),
      kLine: toFiniteNumber(data.line),
      oddsOver: normalizeText(data.oddsOver) || null,
      oddsUnder: normalizeText(data.oddsUnder) || null,
      bookmaker: normalizeText(data.bookmaker) || null,
      status: normalizeText(data.status) || null,
      direction: normalizeText(data.side) || null,
      projectedKs: toFiniteNumber(data.projectedKs),
      projectionEdge: toFiniteNumber(data.projectionEdge),
      projectedIP: toFiniteNumber(data.projectedIP),
      strikeoutScore: toFiniteNumber(data.strikeoutScore),
    });
  }

  const { eligibleRows } = filterEligibleKRows(rows);
  return { date: meta.date, generatedAt: meta.generatedAt, rows: eligibleRows };
}

/** Render deterministic SVG/PNG + extract row metadata for the consistency check. */
async function renderExportAndScrape(browser, artifact, { outputPath = SCREENSHOT_PATH, svgPath = SVG_PATH } = {}) {
  const rendered = await writeMlbSocialGraphic({ kind: "k", slateDate: artifact.slateDate, rows: artifact.rows, svgPath, pngPath: outputPath, browser });
  return { screenshotPath: rendered.pngPath, svgPath: rendered.svgPath, renderedRows: rendered.renderedRows };
}

async function publishPost({ client, caption, screenshotPath }) {
  const mediaId = String(await client.v1.uploadMedia(screenshotPath, { mimeType: "image/png" }));
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const response = await client.v2.tweet(caption, { media: { media_ids: [mediaId] } });
  const tweetId = normalizeText(response?.data?.id);
  if (!tweetId) throw new Error("X post response did not include a tweet ID.");
  const tweetUrl = `https://x.com/_joeknowsball_/status/${tweetId}`;
  console.log(`[mlb-strikeout-props-x] postedTweetUrl=${tweetUrl}`);
  return { tweetId, tweetUrl, mediaId };
}

/** Posts the approved static CTA/hashtag self-reply, threaded onto the given main tweet. */
async function publishReply({ client, inReplyToTweetId }) {
  const response = await client.v2.tweet(K_VALUE_REPLY_CAPTION, { reply: { in_reply_to_tweet_id: inReplyToTweetId } });
  const replyTweetId = normalizeText(response?.data?.id);
  if (!replyTweetId) throw new Error("Reply post response did not include a tweet ID.");
  const replyTweetUrl = `https://x.com/_joeknowsball_/status/${replyTweetId}`;
  console.log(`[mlb-strikeout-props-x] postedReplyUrl=${replyTweetUrl}`);
  return { replyTweetId, replyTweetUrl };
}

function formatEtClock(now) {
  const totalMinutes = getEtMinutesSinceMidnight(now);
  const hour = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const minute = (totalMinutes % 60).toString().padStart(2, "0");
  return `${hour}:${minute}`;
}

/** Enrich scraped rows with live confirmation, select via the K core, and freeze the artifact. */
function buildSelection({ pageData, snapshot, slateDate, now, mode }) {
  const today = getTodayEt();
  const dataFresh = pageData.date === today;
  const enriched = (dataFresh ? pageData.rows : []).map((row) => {
    const facts = resolveKRowFacts(snapshot, row);
    return {
      ...row,
      isCurrentStarter: facts.isCurrentStarter,
      gameStarted: facts.gameStarted,
      opposingLineupConfirmed: facts.opposingLineupConfirmed,
      gameId: facts.gamePk,
      pitcherId: facts.starterId,
    };
  });

  const atCutoff = Boolean(snapshot.timing.isFinalCutoff);
  const selection = selectConfirmedKRows({ rows: enriched, atCutoff, maxTableSize: K_TARGET_TABLE_SIZE });

  // Wait reason: opposing-lineup if valid starters exist but are held for the
  // opponent card; valid-markets if no valid current starter exists yet.
  let waitingReason = WaitingReason.LINEUPS;
  if (selection.validStarterCount === 0) waitingReason = WaitingReason.VALID_MARKETS;
  else if (selection.selected.length === 0 && selection.heldForOpposingCount > 0) waitingReason = WaitingReason.OPPOSING_LINEUP;

  // During POLLING prefer to accumulate a fuller table; in PREFERRED/CUTOFF a
  // single strong confirmed edge is postable (K has no hard minimum).
  const targetCount = snapshot.timing.phase === SlatePhase.POLLING ? 3 : 1;

  // 11:00 AM ET is the opening of the K posting window, not a fixed
  // publication guarantee -- the existing first-pitch-relative phase/final
  // cutoff below still governs everything else. This is the poster's own
  // final live revalidation of the guard (the poll plan already checked it
  // once before launching this job); see mlb-x-slate-timing.mjs. Always
  // computed and logged accurately regardless of mode -- only its
  // *blocking effect* on readiness is bypassed for dry-run below.
  const earliestPostGuardPassed = isAtOrAfterEtClockTime(now, K_EARLIEST_POST_ET_HOUR, K_EARLIEST_POST_ET_MINUTE);
  // A manual dry-run may still preview a fully-qualified board before
  // 11:00 AM ET (useful for QA) -- a scheduled/live post never bypasses the
  // guard; the true guard status is still reported via earliestPostGuardPassed
  // above regardless of mode, so a dry-run run before 11:00 clearly shows a
  // live post would currently be blocked even while rendering a preview.
  const readinessEarliestPostGuardPassed = mode === "dry-run" ? true : earliestPostGuardPassed;

  const readiness = resolvePostingReadiness({
    timing: snapshot.timing,
    confirmedCount: selection.selected.length,
    targetCount,
    maxTableSize: K_TARGET_TABLE_SIZE,
    projectedExcludedCount: selection.excludedStaleStarterCount,
    confirmationSourceFailed: !snapshot.ok,
    waitingReason,
    earliestPostGuardPassed: readinessEarliestPostGuardPassed,
  });

  const artifact = buildKArtifact({
    slateDate,
    snapshot,
    selectedRows: readiness.ready ? selection.selected : [],
    selectionStatus: readiness.finalStatus,
  });

  return { selection, readiness, artifact, dataFresh, earliestPostGuardPassed };
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
    account = await verifyExpectedXAccount();
  }

  const now = new Date();
  const slateDate = getTodayEt();

  // Reply-only recovery: if today's slate already has a main-post receipt
  // but the self-reply never went out (a partial failure between the two
  // posts), post ONLY the missing reply -- never re-run selection/scraping/
  // rendering, and never re-post the main tweet. Skipped entirely under
  // force_repost, which always takes the full fresh-post-and-reply path
  // below instead (same override semantics as before this feature existed).
  if (mode === "post" || mode === "post-text-only") {
    const forceRepost = getForceRepostOverride(process.env.GITHUB_EVENT_NAME ?? "", process.env.K_X_FORCE_REPOST);
    if (!forceRepost) {
      const statePath = getDuplicateStatePath(buildDailyPostingKey(slateDate), getStateDir());
      const existingReceipt = readPostReceipt(statePath);
      if (existingReceipt && existingReceipt.tweetId && !existingReceipt.replyTweetId) {
        console.log(`[mlb-strikeout-props-x] Recovering missing reply for existing post ${existingReceipt.tweetUrl ?? existingReceipt.tweetId}.`);
        const reply = await publishReply({ client: account.client, inReplyToTweetId: existingReceipt.tweetId });
        savePostReceipt(statePath, { ...existingReceipt, ...reply, replyPostedAt: new Date().toISOString() });
        console.log(`[mlb-strikeout-props-x] duplicateReceipt=${statePath}`);
        logFinalStatus("POSTED_REPLY_RECOVERY");
        return;
      }
      if (existingReceipt && existingReceipt.tweetId && existingReceipt.replyTweetId) {
        console.log(`[mlb-strikeout-props-x] Duplicate protection: ${buildDailyPostingKey(slateDate)} already posted with reply (${statePath}).`);
        logFinalStatus("SKIPPED_ALREADY_POSTED_TODAY");
        return;
      }
    }
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1400 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(60000);
    const pageData = await scrapeKPageRows(page);
    await page.close();

    const snapshot = await buildConfirmationSnapshot({ date: slateDate, now });
    const { selection, readiness, artifact, dataFresh, earliestPostGuardPassed } = buildSelection({ pageData, snapshot, slateDate, now, mode });

    if (mode === "post-key-only") {
      if (!readiness.ready) throw new Error(`Not ready: ${readiness.finalStatus}`);
      console.log(buildDailyPostingKey(slateDate));
      return;
    }

    console.log(`[mlb-strikeout-props-x] mode=${mode}`);
    console.log(`[mlb-strikeout-props-x] slateDate=${slateDate} pageDate=${pageData.date || "missing"} dataFresh=${dataFresh}`);
    console.log(
      `[mlb-strikeout-props-x] utcNow=${now.toISOString()} etClock=${formatEtClock(now)} earliestPostEt=${String(K_EARLIEST_POST_ET_HOUR).padStart(2, "0")}:${String(K_EARLIEST_POST_ET_MINUTE).padStart(2, "0")} earliestPostGuardPassed=${earliestPostGuardPassed}`,
    );
    console.log(`[mlb-strikeout-props-x] snapshotOk=${snapshot.ok} phase=${readiness.phase} isFinalCutoff=${snapshot.timing.isFinalCutoff} minutesUntilFirstPitch=${readiness.minutesUntilFirstPitch ?? "n/a"}`);
    console.log(`[mlb-strikeout-props-x] validStarters=${selection.validStarterCount} heldForOpposing=${selection.heldForOpposingCount} selectedCount=${readiness.selectedCount}`);
    console.log(`[mlb-strikeout-props-x] readinessResult=${readiness.finalStatus} ready=${readiness.ready}`);

    if (!readiness.ready) {
      console.log(`[mlb-strikeout-props-x] Not posting: ${readiness.finalStatus}`);
      logFinalStatus(readiness.finalStatus);
      return;
    }

    if (artifact.rows.length !== K_TARGET_TABLE_SIZE) {
      console.log(`[mlb-strikeout-props-x] Not posting: fixed five-row graphic requires ${K_TARGET_TABLE_SIZE} valid plays; received ${artifact.rows.length}.`);
      logFinalStatus("SKIPPED_INSUFFICIENT_ROWS");
      return;
    }

    const artifactError = validateArtifact(artifact, { slateDate, now });
    if (artifactError) {
      console.error(`[mlb-strikeout-props-x] ${artifactError}`);
      logFinalStatus(ARTIFACT_MISMATCH_STATUS);
      process.exitCode = 1;
      return;
    }
    mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`);

    const captionResult = buildKCaptionFromArtifact(artifact);
    if (captionResult.skipped) {
      console.log(`[mlb-strikeout-props-x] ${captionResult.reason}`);
      logFinalStatus("SKIPPED_NO_ELIGIBLE_ROWS");
      return;
    }
    console.log("");
    console.log(captionResult.caption);
    console.log("");

    const { screenshotPath, svgPath, renderedRows } = await renderExportAndScrape(browser, artifact);
    console.log(`[mlb-strikeout-props-x] svgPath=${svgPath} screenshotPath=${screenshotPath} renderedRows=${renderedRows.length}`);

    const mismatch = assertArtifactConsistency({ artifact, renderedRows, captionRows: captionResult.captionRows });
    if (mismatch) {
      console.error(`[mlb-strikeout-props-x] Artifact/render/caption mismatch: ${mismatch}`);
      logFinalStatus(ARTIFACT_MISMATCH_STATUS);
      process.exitCode = 1;
      return;
    }
    console.log(`[mlb-strikeout-props-x] consistencyCheck=OK (${artifact.rows.length} rows)`);

    if (mode === "dry-run") {
      console.log(`[mlb-strikeout-props-x] selectionArtifact=${ARTIFACT_PATH}`);
      logFinalStatus("SKIPPED_PREVIEW_MODE");
      return;
    }

    const forceRepost = getForceRepostOverride(process.env.GITHUB_EVENT_NAME ?? "", process.env.K_X_FORCE_REPOST);
    const dailyPostingKey = buildDailyPostingKey(slateDate);
    const lock = checkDailyPostingLock(dailyPostingKey, getStateDir(), { allowOverride: forceRepost });
    if (lock.blocked) {
      console.log(`[mlb-strikeout-props-x] Duplicate protection: ${dailyPostingKey} already posted (${lock.statePath}).`);
      logFinalStatus("SKIPPED_ALREADY_POSTED_TODAY");
      return;
    }

    const baseReceipt = {
      dailyPostingKey,
      slateDate,
      confirmationAsOf: artifact.confirmationAsOf,
      selectionStatus: artifact.selectionStatus,
      rows: artifact.rows,
      postedAt: new Date().toISOString(),
      forcedOverride: forceRepost,
      // Main post and self-reply are one posting unit sharing this receipt.
      // Populated after the reply below succeeds -- left null here so a
      // crash between the two posts leaves a receipt this script's own
      // reply-recovery check (above) can find and finish on the next run.
      replyTweetId: null,
      replyTweetUrl: null,
      replyPostedAt: null,
    };

    let mainReceipt;
    if (mode === "post-text-only") {
      const response = await account.client.v2.tweet(captionResult.caption);
      const tweetId = normalizeText(response?.data?.id);
      if (!tweetId) throw new Error("X text-only post response did not include a tweet ID.");
      mainReceipt = { ...baseReceipt, mode: "text-only", tweetId, tweetUrl: `https://x.com/_joeknowsball_/status/${tweetId}` };
    } else {
      const post = await publishPost({ client: account.client, caption: captionResult.caption, screenshotPath });
      mainReceipt = { ...baseReceipt, tweetId: post.tweetId, tweetUrl: post.tweetUrl, mediaId: post.mediaId, screenshotPath };
    }
    // Save immediately -- before attempting the reply -- so a failure below
    // never re-triggers a second main post; only the reply-recovery path
    // above will ever run again for today's slate.
    savePostReceipt(lock.statePath, mainReceipt);
    console.log(`[mlb-strikeout-props-x] duplicateReceipt=${lock.statePath}`);
    logFinalStatus("POSTED");

    const reply = await publishReply({ client: account.client, inReplyToTweetId: mainReceipt.tweetId });
    savePostReceipt(lock.statePath, { ...mainReceipt, ...reply, replyPostedAt: new Date().toISOString() });
  } finally {
    await browser.close();
  }
}

try {
  await main();
} catch (error) {
  console.error(`[mlb-strikeout-props-x] ${sanitizeLogValue(error instanceof Error ? error.message : error)}`);
  logFinalStatus("FAILED");
  process.exitCode = 1;
}
