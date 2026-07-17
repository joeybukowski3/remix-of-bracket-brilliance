import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { TwitterApi } from "twitter-api-v2";
import { checkDailyPostingLock, getForceRepostOverride, savePostReceipt } from "./lib/mlb-x-daily-lock.mjs";
import { buildConfirmationSnapshot, resolveHrRowFacts } from "./lib/mlb-x-confirmation-snapshot.mjs";
import { selectConfirmedHrProps } from "./lib/mlb-hr-x-selection-core.mjs";
import { resolvePostingReadiness } from "./lib/mlb-x-readiness.mjs";
import { getEtSlateDate } from "./lib/mlb-x-slate-timing.mjs";
import {
  ARTIFACT_MISMATCH_STATUS,
  assertArtifactConsistency,
  buildHrArtifact,
  validateArtifact,
} from "./lib/mlb-x-selection-artifact.mjs";
import { buildHrCaptionFromArtifact } from "./lib/mlb-x-artifact-caption.mjs";
import { writeMlbSocialGraphic } from "./lib/mlb-social-graphic-renderer.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const RAW_DATA_PATH = path.join(DATA_DIR, "hr-props-raw.json");
const PRODUCTION_BASE_URL = "https://www.joeknowsball.com/data/mlb";
const GITHUB_BASE_URL = "https://raw.githubusercontent.com/joeybukowski3/remix-of-bracket-brilliance/main/public/data/mlb";
const HR_TARGET_TABLE_SIZE = 5;
// A single early-confirmed game (one team's 9-batter lineup) must never
// alone satisfy readiness -- it would post a table drawn entirely from one
// matchup instead of representing the slate. Still overridden at the final
// cutoff, which posts whatever is confirmed rather than miss the window.
const MIN_CONFIRMED_GAMES = 2;
const SCREENSHOT_PATH = path.join(ROOT, "artifacts", "mlb-hr-props-x.png");
const SVG_PATH = path.join(ROOT, "artifacts", "mlb-hr-props-x.svg");
const ARTIFACT_PATH = path.join(ROOT, "artifacts", "mlb-hr-props-x-selection.json");
const DEFAULT_DUPLICATE_STATE_DIR = path.join(ROOT, "artifacts", "x-post-state");
const args = new Set(process.argv.slice(2));

function usage() {
  return [
    "Usage: node scripts/post-mlb-hr-props-to-x.mjs --dry-run",
    "       node scripts/post-mlb-hr-props-to-x.mjs --post",
    "       node scripts/post-mlb-hr-props-to-x.mjs --post-text-only",
    "       node scripts/post-mlb-hr-props-to-x.mjs --verify-account",
    "       node scripts/post-mlb-hr-props-to-x.mjs --post-key-only",
    "",
    "Builds an immutable confirmed-only selection artifact from the LIVE lineup",
    "confirmation snapshot, renders the bare /mlb/hr-props/x-export route locally,",
    "and posts only when the rendered rows + caption exactly match the artifact.",
    "",
    "Set HR_PROPS_DATA_SOURCE to production, github, or local (default production).",
    "Set X_EXPECTED_USERNAME and JKB_X_* credentials for posting.",
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

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeUsername(value) {
  return normalizeText(value).replace(/^@/, "").toLowerCase();
}

function getDataSource() {
  const value = normalizeText(process.env.HR_PROPS_DATA_SOURCE).toLowerCase() || "production";
  if (!["production", "github", "local"].includes(value)) {
    throw new Error(`Invalid HR_PROPS_DATA_SOURCE="${value}". Expected production, github, or local.`);
  }
  return value;
}

function rawLocation(source) {
  if (source === "github") return `${GITHUB_BASE_URL}/hr-props-raw.json`;
  if (source === "local") return RAW_DATA_PATH;
  return `${PRODUCTION_BASE_URL}/hr-props-raw.json`;
}

async function loadJson(location, source) {
  if (source === "local") return JSON.parse(readFileSync(location, "utf8"));
  const response = await fetch(location, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load ${location}: HTTP ${response.status}`);
  return response.json();
}

function normalizeBatter(value) {
  const player = normalizeText(value?.player);
  const team = normalizeText(value?.team).toUpperCase();
  if (!player || !team) return null;
  return {
    player,
    playerId: value?.playerId ?? null,
    gameId: value?.gameId ?? null,
    team,
    opponent: normalizeText(value?.opponent).toUpperCase(),
    opposingPitcher: normalizeText(value?.opposingPitcher) || "TBD",
    hrScore: toFiniteNumber(value?.hrScore),
    hrScoreRank: toFiniteNumber(value?.hrScoreRank),
    hrOddsYes: normalizeText(value?.hrOddsYes) || null,
    barrelRate: toFiniteNumber(value?.barrelRate),
    hardHitRate: toFiniteNumber(value?.hardHitRate),
    last7HR: toFiniteNumber(value?.last7HR),
    last30HR: toFiniteNumber(value?.last30HR),
    lineupStatus: value?.lineupStatus ?? "unknown",
    battingOrder: value?.battingOrder ?? null,
  };
}

function getTodayEt() {
  return getEtSlateDate(new Date());
}

function getEtDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return getEtSlateDate(date);
}

function buildDailyPostingKey(slateDate) {
  return `mlb-hr-props:${slateDate}`;
}

function getStateDir() {
  return normalizeText(process.env.X_DUPLICATE_STATE_DIR) || DEFAULT_DUPLICATE_STATE_DIR;
}

function createXClientFromEnv() {
  const { JKB_X_API_KEY, JKB_X_API_SECRET, JKB_X_ACCESS_TOKEN, JKB_X_ACCESS_SECRET } = process.env;
  if (!JKB_X_API_KEY || !JKB_X_API_SECRET || !JKB_X_ACCESS_TOKEN || !JKB_X_ACCESS_SECRET) {
    throw new Error("Missing JoeKnowsBall X credentials (JKB_X_API_KEY/SECRET, JKB_X_ACCESS_TOKEN/SECRET).");
  }
  return new TwitterApi({ appKey: JKB_X_API_KEY, appSecret: JKB_X_API_SECRET, accessToken: JKB_X_ACCESS_TOKEN, accessSecret: JKB_X_ACCESS_SECRET });
}

async function verifyExpectedXAccount() {
  const expectedUsername = normalizeUsername(process.env.X_EXPECTED_USERNAME);
  if (!expectedUsername) throw new Error("Missing X_EXPECTED_USERNAME. Expected X_EXPECTED_USERNAME=_joeknowsball_.");
  const client = createXClientFromEnv();
  const account = await client.v1.verifyCredentials();
  const username = normalizeUsername(account?.screen_name);
  if (!username) throw new Error("Authenticated X username missing from verify_credentials.");
  if (username !== expectedUsername) throw new Error(`Authenticated X username @${username} does not match expected @${expectedUsername}.`);
  console.log(`[mlb-hr-props-x] Authenticated X account matches expected @${expectedUsername}.`);
  return { client, username };
}

function assertLivePostAllowed() {
  const eventName = process.env.GITHUB_EVENT_NAME ?? "";
  if (!["workflow_dispatch", "schedule", "workflow_run"].includes(eventName)) {
    throw new Error(`Live posting is blocked for event "${eventName}".`);
  }
  if (process.env.X_ALLOW_LIVE_POST !== "true") {
    throw new Error("Live posting is blocked unless X_ALLOW_LIVE_POST=true is set by the workflow.");
  }
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

function logFinalStatus(status) {
  console.log(`[mlb-hr-props-x] finalStatus=${status}`);
}

/**
 * Render the confirmed-only immutable artifact through the deterministic SVG
 * renderer, rasterize it at 2x, and extract row metadata back from the SVG for
 * the existing artifact/caption consistency proof.
 */
async function renderExportAndScrape(artifact, { outputPath = SCREENSHOT_PATH, svgPath = SVG_PATH } = {}) {
  const rendered = await writeMlbSocialGraphic({ kind: "hr", slateDate: artifact.slateDate, rows: artifact.rows, svgPath, pngPath: outputPath });
  return { screenshotPath: rendered.pngPath, svgPath: rendered.svgPath, renderedRows: rendered.renderedRows };
}

async function publishPost({ client, caption, screenshotPath }) {
  const mediaId = String(await client.v1.uploadMedia(screenshotPath, { mimeType: "image/png" }));
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const response = await client.v2.tweet(caption, { media: { media_ids: [mediaId] } });
  const tweetId = normalizeText(response?.data?.id);
  if (!tweetId) throw new Error("X post response did not include a tweet ID.");
  const tweetUrl = `https://x.com/_joeknowsball_/status/${tweetId}`;
  console.log(`[mlb-hr-props-x] postedTweetUrl=${tweetUrl}`);
  return { tweetId, tweetUrl, mediaId };
}

/** Build today's confirmed HR selection from the LIVE snapshot: raw data + selection core + readiness. */
async function buildSelection({ source, now }) {
  const slateDate = getTodayEt();
  const raw = await loadJson(rawLocation(source), source);
  const rawDate = normalizeText(raw?.date);
  const rawGeneratedDate = getEtDate(raw?.generatedAt);
  const dateMismatch = Boolean(rawDate && rawDate !== slateDate);
  const staleGenerated = Boolean(rawGeneratedDate && rawDate && rawGeneratedDate < rawDate);
  const batters = Array.isArray(raw?.batters) ? raw.batters.map(normalizeBatter).filter(Boolean) : [];

  const snapshot = await buildConfirmationSnapshot({ date: slateDate, now });

  const selection = selectConfirmedHrProps({
    batters: dateMismatch || staleGenerated ? [] : batters,
    isGameStarted: (row) => resolveHrRowFacts(snapshot, row).gameStarted,
    liveConfirm: (row) => resolveHrRowFacts(snapshot, row).liveConfirmed,
    maxTableSize: HR_TARGET_TABLE_SIZE,
  });

  const readiness = resolvePostingReadiness({
    timing: snapshot.timing,
    confirmedCount: selection.confirmedCount,
    targetCount: HR_TARGET_TABLE_SIZE,
    maxTableSize: HR_TARGET_TABLE_SIZE,
    projectedExcludedCount: selection.projectedExcludedCount,
    confirmationSourceFailed: !snapshot.ok,
    confirmedGameCount: selection.confirmedGameCount,
    minConfirmedGames: MIN_CONFIRMED_GAMES,
  });

  const artifact = buildHrArtifact({
    slateDate,
    snapshot,
    selectedRows: readiness.ready ? selection.selected : [],
    selectionStatus: readiness.finalStatus,
  });

  return { slateDate, rawDate, snapshot, selection, readiness, artifact };
}

function logSelection({ slateDate, rawDate, snapshot, selection, readiness }) {
  console.log(`[mlb-hr-props-x] slateDate=${slateDate}`);
  console.log(`[mlb-hr-props-x] rawSlateDate=${rawDate || "missing"}`);
  console.log(`[mlb-hr-props-x] snapshotOk=${snapshot.ok} confirmationAsOf=${snapshot.asOf}`);
  console.log(`[mlb-hr-props-x] phase=${readiness.phase} minutesUntilFirstPitch=${readiness.minutesUntilFirstPitch ?? "n/a"}`);
  console.log(`[mlb-hr-props-x] confirmedCount=${selection.confirmedCount} confirmedGameCount=${selection.confirmedGameCount} projectedExcluded=${selection.projectedExcludedCount} selectedCount=${readiness.selectedCount}`);
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

  const source = getDataSource();
  if ((mode === "post" || mode === "post-text-only") && source !== "production") {
    throw new Error("Live posting requires HR_PROPS_DATA_SOURCE=production.");
  }

  const now = new Date();
  const { slateDate, rawDate, snapshot, selection, readiness, artifact } = await buildSelection({ source, now });

  if (mode === "post-key-only") {
    if (!readiness.ready) throw new Error(`Not ready: ${readiness.finalStatus}`);
    console.log(buildDailyPostingKey(slateDate));
    return;
  }

  console.log(`[mlb-hr-props-x] mode=${mode} dataSource=${source}`);
  logSelection({ slateDate, rawDate, snapshot, selection, readiness });

  if (!readiness.ready) {
    console.log(`[mlb-hr-props-x] Not posting: ${readiness.finalStatus}`);
    logFinalStatus(readiness.finalStatus);
    return;
  }

  if (artifact.rows.length !== HR_TARGET_TABLE_SIZE) {
    console.log(`[mlb-hr-props-x] Not posting: fixed five-row graphic requires ${HR_TARGET_TABLE_SIZE} confirmed plays; received ${artifact.rows.length}.`);
    logFinalStatus("SKIPPED_INSUFFICIENT_ROWS");
    return;
  }

  // Freeze + validate the immutable artifact, then build the caption from it.
  const artifactError = validateArtifact(artifact, { slateDate, now });
  if (artifactError) {
    console.error(`[mlb-hr-props-x] ${artifactError}`);
    logFinalStatus(ARTIFACT_MISMATCH_STATUS);
    process.exitCode = 1;
    return;
  }
  mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
  const { writeFileSync } = await import("node:fs");
  writeFileSync(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`);

  const captionResult = buildHrCaptionFromArtifact(artifact);
  if (captionResult.skipped) {
    console.log(`[mlb-hr-props-x] ${captionResult.reason}`);
    logFinalStatus("SKIPPED_NO_ELIGIBLE_ROWS");
    return;
  }
  console.log("");
  console.log(captionResult.caption);
  console.log("");

  // Render the bare export locally + scrape the rendered rows.
  const { screenshotPath, svgPath, renderedRows } = await renderExportAndScrape(artifact);
  console.log(`[mlb-hr-props-x] svgPath=${svgPath} screenshotPath=${screenshotPath} renderedRows=${renderedRows.length}`);

  // Prove image + caption + artifact all describe the same players, same order.
  const mismatch = assertArtifactConsistency({ artifact, renderedRows, captionRows: captionResult.captionRows });
  if (mismatch) {
    console.error(`[mlb-hr-props-x] Artifact/render/caption mismatch: ${mismatch}`);
    logFinalStatus(ARTIFACT_MISMATCH_STATUS);
    process.exitCode = 1;
    return;
  }
  console.log(`[mlb-hr-props-x] consistencyCheck=OK (${artifact.rows.length} rows)`);

  if (mode === "dry-run") {
    console.log(`[mlb-hr-props-x] selectionArtifact=${ARTIFACT_PATH}`);
    logFinalStatus("SKIPPED_PREVIEW_MODE");
    return;
  }

  // Live post: daily lock, then publish.
  const forceRepost = getForceRepostOverride(process.env.GITHUB_EVENT_NAME ?? "", process.env.HR_X_FORCE_REPOST);
  const dailyPostingKey = buildDailyPostingKey(slateDate);
  const lock = checkDailyPostingLock(dailyPostingKey, getStateDir(), { allowOverride: forceRepost });
  if (lock.blocked) {
    console.log(`[mlb-hr-props-x] Duplicate protection: ${dailyPostingKey} already posted (${lock.statePath}).`);
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
  };

  if (mode === "post-text-only") {
    const response = await account.client.v2.tweet(captionResult.caption);
    const tweetId = normalizeText(response?.data?.id);
    if (!tweetId) throw new Error("X text-only post response did not include a tweet ID.");
    savePostReceipt(lock.statePath, { ...baseReceipt, mode: "text-only", tweetId, tweetUrl: `https://x.com/_joeknowsball_/status/${tweetId}` });
  } else {
    const post = await publishPost({ client: account.client, caption: captionResult.caption, screenshotPath });
    savePostReceipt(lock.statePath, { ...baseReceipt, tweetId: post.tweetId, tweetUrl: post.tweetUrl, mediaId: post.mediaId, screenshotPath });
  }
  console.log(`[mlb-hr-props-x] duplicateReceipt=${lock.statePath}`);
  logFinalStatus("POSTED");
}

try {
  await main();
} catch (error) {
  console.error(`[mlb-hr-props-x] ${sanitizeLogValue(error instanceof Error ? error.message : error)}`);
  logFinalStatus("FAILED");
  process.exitCode = 1;
}
