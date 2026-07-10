import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";
import { TwitterApi } from "twitter-api-v2";
import { checkDailyPostingLock, getForceRepostOverride, savePostReceipt } from "./lib/mlb-x-daily-lock.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const RAW_DATA_PATH = path.join(DATA_DIR, "hr-props-raw.json");
const BEST_BETS_PATH = path.join(DATA_DIR, "hr-props-best-bets.json");
const PITCHER_REGRESSION_PATH = path.join(DATA_DIR, "pitcher-regression.json");
const PRODUCTION_BASE_URL = "https://www.joeknowsball.com/data/mlb";
const GITHUB_BASE_URL = "https://raw.githubusercontent.com/joeybukowski3/remix-of-bracket-brilliance/main/public/data/mlb";
const HR_PROPS_URL = "https://www.joeknowsball.com/mlb";
const EXPORT_SELECTOR = '[data-x-export="mlb-hr-social"]';
const HR_TAB_LABEL = "HR Props";
const SCREENSHOT_PATH = path.join(ROOT, "artifacts", "mlb-hr-props-x.png");
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
    "--dry-run  Build the X caption, screenshot the HR Props table, and do not post.",
    "--post     Manual GitHub Actions only: validate account, build the caption, screenshot the HR Props table, and publish to X.",
    "--post-text-only  Manual GitHub Actions only: validate account, build the caption, and publish text only to X.",
    "--verify-account  Verify configured X credentials and expected username without building a caption.",
    "--post-key-only  Print the deterministic duplicate-protection key for the current slate/table.",
    "",
    "Set HR_PROPS_DATA_SOURCE to production, github, or local.",
    "Default: production.",
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
  const value = normalizeText(process.env.HR_PROPS_DATA_SOURCE).toLowerCase();
  const source = value || "production";
  if (!["production", "github", "local"].includes(source)) {
    throw new Error(`Invalid HR_PROPS_DATA_SOURCE="${source}". Expected production, github, or local.`);
  }
  return source;
}

async function screenshotHrPropsTable(outputPath = SCREENSHOT_PATH) {
  mkdirSync(path.dirname(outputPath), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1080, height: 1400 },
      deviceScaleFactor: 1,
    });
    page.setDefaultTimeout(60000);
    await page.goto(HR_PROPS_URL, { waitUntil: "networkidle", timeout: 60000 });

    // Click the HR Props tab — use text selector with emoji for reliability
    try {
      await page.locator(`button:has-text("HR Props")`).first().click({ timeout: 8000 });
      console.log("[mlb-hr-props-x] Clicked HR Props tab");
    } catch (clickErr) {
      console.warn(`[mlb-hr-props-x] Tab click failed (${clickErr.message}), trying fallback selector`);
      await page.locator(`button:text-is("🔥 HR Props")`).first().click({ timeout: 5000 });
    }

    let exportTarget = page.locator(EXPORT_SELECTOR).first();
    try {
      await exportTarget.waitFor({ state: "visible", timeout: 10000 });
    } catch {
      exportTarget = page
        .locator("table", { hasText: "HR Score" })
        .first()
        .locator("xpath=ancestor::div[contains(@class, 'overflow-x-auto')][1]");
      await exportTarget.waitFor({ state: "visible" });
      console.log(`[mlb-hr-props-x] ${EXPORT_SELECTOR} was not found; used HR Score table fallback.`);
    }

    await exportTarget.screenshot({
      path: outputPath,
      animations: "disabled",
    });

    // Log file size so we can catch future limit issues early
    const { statSync } = await import("node:fs");
    const { size } = statSync(outputPath);
    const sizeMb = (size / 1_048_576).toFixed(2);
    console.log(`[mlb-hr-props-x] screenshotSize=${sizeMb} MB`);
    if (size > 4_900_000) {
      console.warn(`[mlb-hr-props-x] WARNING: screenshot is ${sizeMb} MB — close to X's 5 MB limit`);
    }

    return outputPath;
  } finally {
    await browser.close();
  }
}

function getDataLocations(source) {
  if (source === "production") {
    return {
      raw: `${PRODUCTION_BASE_URL}/hr-props-raw.json`,
      bestBets: `${PRODUCTION_BASE_URL}/hr-props-best-bets.json`,
      pitcherRegression: `${PRODUCTION_BASE_URL}/pitcher-regression.json`,
    };
  }

  if (source === "github") {
    return {
      raw: `${GITHUB_BASE_URL}/hr-props-raw.json`,
      bestBets: `${GITHUB_BASE_URL}/hr-props-best-bets.json`,
      pitcherRegression: `${GITHUB_BASE_URL}/pitcher-regression.json`,
    };
  }

  return {
    raw: RAW_DATA_PATH,
    bestBets: BEST_BETS_PATH,
    pitcherRegression: PITCHER_REGRESSION_PATH,
  };
}

async function loadJson(location, source) {
  if (source === "local") return JSON.parse(readFileSync(location, "utf8"));

  const response = await fetch(location, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load ${location}: HTTP ${response.status}`);
  return response.json();
}

function normalizeTeam(value) {
  return normalizeText(value).toUpperCase();
}

// Must match the xeraMult + regrAdj logic in MlbHrProps.tsx / MlbGameDetail.tsx exactly
// so the tweet text always ranks players the same way the table does.
function xeraMult(xera) {
  if (xera == null) return 1.0;
  if (xera <= 2.5) return 0.80;
  if (xera <= 3.0) return 0.85;
  if (xera <= 3.5) return 0.91;
  if (xera <= 4.0) return 0.96;
  if (xera <= 4.5) return 1.00;
  if (xera <= 5.0) return 1.05;
  if (xera <= 5.5) return 1.10;
  return 1.15;
}

function computeAdjustedHrScore(batter, pitchers, regressionData) {
  const hrPropsPitcher = pitchers.find(
    p => p.pitcher === batter.opposingPitcher || (batter.opposingPitcherId && p.pitcherId === batter.opposingPitcherId)
  );
  const regrEntry = regressionData.find(p => p.name === batter.opposingPitcher);
  const pitcherXera = hrPropsPitcher?.xera ?? regrEntry?.xera ?? regrEntry?.xfip ?? null;
  const regressionScore = regrEntry?.regressionScore ?? null;
  const regrAdj = regressionScore != null
    ? Math.max(0.96, Math.min(1.04, 1.0 + regressionScore * 0.004))
    : 1.0;
  return Math.round(batter.hrScore * xeraMult(pitcherXera) * regrAdj * 10) / 10;
}

function normalizeUsername(value) {
  return normalizeText(value).replace(/^@/, "").toLowerCase();
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isAmericanOdds(value) {
  return /^[+-]\d+$/.test(normalizeText(value));
}

function getTodayEt() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getEtDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isStarterPlaceholder(value) {
  const normalized = normalizeText(value).toUpperCase();
  return !normalized || normalized === "TBD" || normalized === "TBA" || normalized === "TO BE ANNOUNCED" || normalized === "TO BE DETERMINED";
}

function isPlaceholderText(value) {
  const normalized = normalizeText(value).toUpperCase();
  return !normalized || normalized === "TBD" || normalized === "TBA" || normalized === "N/A" || normalized === "NA" || normalized === "NULL" || normalized === "UNKNOWN";
}

function pickKey(value) {
  return `${normalizeText(value?.player)}|${normalizeTeam(value?.team)}|${normalizeTeam(value?.opponent)}`;
}

function normalizeBatter(value) {
  const player = normalizeText(value?.player);
  const team = normalizeTeam(value?.team);
  const opponent = normalizeTeam(value?.opponent);
  const hrScore = toFiniteNumber(value?.hrScore);
  const hrScoreRank = toFiniteNumber(value?.hrScoreRank);
  if (!player || !team || !opponent || hrScore == null || hrScoreRank == null) return null;
  return {
    player,
    team,
    opponent,
    opposingPitcher: normalizeText(value?.opposingPitcher) || "TBD",
    opposingPitcherId: value?.opposingPitcherId ?? null,
    hrScore,
    hrScoreRank,
    hrOddsYes: normalizeText(value?.hrOddsYes) || null,
  };
}

function getTopHrProps(rawPayload, bestBetsPayload, limit = 3) {
  const batters = Array.isArray(rawPayload?.batters)
    ? rawPayload.batters.map(normalizeBatter).filter(Boolean)
    : [];

  // hrScore is now pitcher-adjusted at generation time — sort directly
  const batterLookup = new Map(batters.map((row) => [pickKey(row), row]));
  const curatedPicks = Array.isArray(bestBetsPayload?.bestBets) ? bestBetsPayload.bestBets : [];
  const visibleBestBets = curatedPicks
    .map((pick) => batterLookup.get(pickKey(pick)))
    .filter((row) => row && !isStarterPlaceholder(row.opposingPitcher));

  if (visibleBestBets.length >= limit) return visibleBestBets.slice(0, limit);

  return batters
    .filter((row) => !isStarterPlaceholder(row.opposingPitcher))
    .sort((left, right) => right.hrScore - left.hrScore || left.hrScoreRank - right.hrScoreRank)
    .slice(0, limit);
}

function validateFreshness(rawPayload, bestBetsPayload) {
  const today = getTodayEt();
  const rawDate = normalizeText(rawPayload?.date);
  const bestBetsDate = normalizeText(bestBetsPayload?.date);
  const rawGeneratedDate = getEtDate(rawPayload?.generatedAt);
  const bestBetsGeneratedDate = getEtDate(bestBetsPayload?.generatedAt);

  if (rawDate !== today) return `Skipping: raw HR props slate date is ${rawDate || "missing"}, expected ${today}.`;
  if (bestBetsDate && bestBetsDate !== today) return `Skipping: best-bets slate date is ${bestBetsDate}, expected ${today}.`;
  if (rawGeneratedDate && rawGeneratedDate < rawDate) return `Skipping: raw HR props generatedAt date ${rawGeneratedDate} is older than slate date ${rawDate}.`;
  if (bestBetsGeneratedDate && bestBetsDate && bestBetsGeneratedDate < bestBetsDate) {
    return `Skipping: best-bets generatedAt date ${bestBetsGeneratedDate} is older than slate date ${bestBetsDate}.`;
  }
  if (!rawGeneratedDate) return "Skipping: raw HR props generatedAt is missing or invalid.";
  if (bestBetsDate && !bestBetsGeneratedDate) return "Skipping: best-bets generatedAt is missing or invalid.";

  return "";
}

function validateTopProps(topProps) {
  if (topProps.length < 3) return `Skipping: only ${topProps.length} valid HR props are available; expected at least 3.`;

  for (const [index, row] of topProps.slice(0, 3).entries()) {
    const label = `top ${index + 1}`;
    if (isPlaceholderText(row.player)) return `Skipping: ${label} player name is missing or a placeholder.`;
    if (isPlaceholderText(row.team)) return `Skipping: ${label} team is missing or a placeholder.`;
    if (row.hrScore == null || !Number.isFinite(row.hrScore)) return `Skipping: ${label} HR score is missing or invalid.`;
    if (!isAmericanOdds(row.hrOddsYes)) return `Skipping: ${label} HR odds are missing.`;
  }

  return "";
}

function getValidatedTopProps(rawPayload, bestBetsPayload) {
  const freshnessError = validateFreshness(rawPayload, bestBetsPayload);
  if (freshnessError) return { skipped: true, reason: freshnessError, topProps: [] };

  const topProps = getTopHrProps(rawPayload, bestBetsPayload);
  const topPropsError = validateTopProps(topProps);
  if (topPropsError) return { skipped: true, reason: topPropsError, topProps: [] };

  return { skipped: false, reason: "", topProps };
}

function formatDateLabel(dateValue) {
  const raw = normalizeText(dateValue);
  if (!raw) return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function buildCaption(rawPayload, bestBetsPayload) {
  const topPropsResult = getValidatedTopProps(rawPayload, bestBetsPayload);
  if (topPropsResult.skipped) return { skipped: true, reason: topPropsResult.reason, caption: "", topProps: [] };

  const dateLabel = formatDateLabel(rawPayload?.date || bestBetsPayload?.date);
  const lines = topPropsResult.topProps.map((row, index) => {
    return `${index + 1}. ${row.player} (${row.team}) - HR Score ${row.hrScore.toFixed(1)} | ${row.hrOddsYes}`;
  });

  const caption = [
    `JoeKnowsBall MLB HR Props - ${dateLabel}`,
    "",
    "Top model edges:",
    ...lines,
    "",
    "Free Access to Full Table at Link in Bio",
    "",
    "#MLB #MLBPicks #HomeRun #PropBets #MLBBetting",
  ].join("\n");

  if (caption.length > 280) {
    const shortLines = topPropsResult.topProps.map((row, index) =>
      `${index + 1}. ${row.player} ${row.team} — HR ${row.hrScore.toFixed(1)} | ${row.hrOddsYes}`
    );
    const shortCaption = [
      `MLB HR Props - ${dateLabel}`,
      "",
      ...shortLines,
      "",
      "Full table: link in bio",
      "#MLB #HomeRun",
    ].join("\n");
    if (shortCaption.length <= 280) {
      return { skipped: false, reason: "", caption: shortCaption, topProps: topPropsResult.topProps };
    }
    return { skipped: true, reason: `Skipping: generated caption is ${caption.length} characters; expected 280 or fewer.`, caption: "", topProps: [] };
  }

  return { skipped: false, reason: "", caption, topProps: topPropsResult.topProps };
}

// Content fingerprint: changes whenever odds, lineup confirmation, or
// ranking order changes -- retained purely for audit/debugging (stored in
// the receipt), NOT used as the duplicate-post gate. A fingerprint-keyed
// gate is what let the same slate legitimately post more than once in a
// single day (each intraday data refresh produces a new fingerprint,
// which duplicate protection then treated as an entirely new, never-
// before-seen post). See buildDailyPostingKey for the actual gate.
function buildContentFingerprint(rawPayload, bestBetsPayload, topProps) {
  const slateDate = normalizeText(rawPayload?.date || bestBetsPayload?.date);
  const tableRows = Array.isArray(rawPayload?.batters)
    ? rawPayload.batters.map(normalizeBatter).filter(Boolean)
    : [];
  const tableFingerprint = tableRows
    .map((row) => ({
      player: row.player,
      team: row.team,
      opponent: row.opponent,
      opposingPitcher: row.opposingPitcher,
      hrScore: Number(row.hrScore.toFixed(1)),
      hrScoreRank: row.hrScoreRank,
    }))
    .sort((left, right) => pickKey(left).localeCompare(pickKey(right)));
  const topFingerprint = topProps.map((row) => ({
    player: row.player,
    team: row.team,
    opponent: row.opponent,
    hrScore: Number(row.hrScore.toFixed(1)),
    hrScoreRank: row.hrScoreRank,
  }));
  const hash = createHash("sha256")
    .update(JSON.stringify({ slateDate, tableFingerprint, topFingerprint }))
    .digest("hex")
    .slice(0, 16);

  return `mlb-hr-props-${slateDate}-${hash}`;
}

// The actual duplicate-post gate: one key per slate date, full stop.
// Content changing intraday (odds refresh, confirmed starter replacing
// TBD, re-ranked scores) must NOT be treated as a new, unposted table --
// see buildContentFingerprint's docstring for the bug this replaces.
function buildDailyPostingKey(rawPayload, bestBetsPayload) {
  const slateDate = normalizeText(rawPayload?.date || bestBetsPayload?.date);
  return `mlb-hr-props:${slateDate}`;
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

  console.log(`[mlb-hr-props-x] Authenticated X account: ${displayUsername}${name ? ` (${name})` : ""}${id ? ` id=${id}` : ""}`);

  if (!username) throw new Error("Authenticated X username was missing from verify_credentials response.");
  if (username !== expectedUsername) {
    throw new Error(`Authenticated X username @${username} does not match expected @${expectedUsername}.`);
  }

  console.log(`[mlb-hr-props-x] Authenticated X account matches expected @${expectedUsername}.`);
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
  console.log(`[mlb-hr-props-x] uploadedMediaId=${mediaIdStr}`);

  // Brief wait to ensure media is fully processed before attaching to tweet
  await new Promise(resolve => setTimeout(resolve, 2000));

  const response = await client.v2.tweet(caption, {
    media: { media_ids: [mediaIdStr] },
  });
  const tweetId = normalizeText(response?.data?.id);
  if (!tweetId) throw new Error("X post response did not include a tweet ID.");

  const tweetUrl = `https://x.com/_joeknowsball_/status/${tweetId}`;
  console.log(`[mlb-hr-props-x] postedTweetId=${tweetId}`);
  console.log(`[mlb-hr-props-x] postedTweetUrl=${tweetUrl}`);
  return { tweetId, tweetUrl, mediaId: mediaIdStr };
}

async function publishTextOnlyPost({ client, caption }) {
  const response = await client.v2.tweet(caption);
  const tweetId = normalizeText(response?.data?.id);
  if (!tweetId) throw new Error("X text-only post response did not include a tweet ID.");

  const tweetUrl = `https://x.com/_joeknowsball_/status/${tweetId}`;
  console.log(`[mlb-hr-props-x] postedTweetId=${tweetId}`);
  console.log(`[mlb-hr-props-x] postedTweetUrl=${tweetUrl}`);
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
  for (const secret of [
    process.env.JKB_X_API_KEY,
    process.env.JKB_X_API_SECRET,
    process.env.JKB_X_ACCESS_TOKEN,
    process.env.JKB_X_ACCESS_SECRET,
  ]) {
    if (secret) text = text.split(secret).join("[redacted]");
  }

  return text
    .replace(/authorization:\s*[^\n\r]+/gi, "authorization: [redacted]")
    .replace(/(oauth_[a-z_]+=)"[^"]+"/gi, '$1"[redacted]"')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]");
}

function logXApiError(error) {
  if (!error || typeof error !== "object") return;

  const status = getFirstDefined(error, [
    ["status"],
    ["statusCode"],
    ["code"],
    ["data", "status"],
    ["data", "statusCode"],
    ["error", "status"],
  ]);
  const code = getFirstDefined(error, [
    ["code"],
    ["data", "code"],
    ["data", "error", "code"],
    ["error", "code"],
  ]);
  const title = getFirstDefined(error, [
    ["data", "title"],
    ["data", "error", "title"],
    ["error", "title"],
  ]);
  const detail = getFirstDefined(error, [
    ["data", "detail"],
    ["data", "error", "detail"],
    ["error", "detail"],
  ]);
  const errors = Array.isArray(error.data?.errors) ? error.data.errors : [];

  if (status !== undefined || code !== undefined) {
    console.error(`[mlb-hr-props-x] X API error status=${sanitizeLogValue(status ?? "unknown")} code=${sanitizeLogValue(code ?? "unknown")}`);
  }
  if (title !== undefined) console.error(`[mlb-hr-props-x] X API error title=${sanitizeLogValue(title)}`);
  if (detail !== undefined) console.error(`[mlb-hr-props-x] X API error detail=${sanitizeLogValue(detail)}`);
  for (const [index, item] of errors.entries()) {
    const itemTitle = normalizeText(item?.title);
    const itemDetail = normalizeText(item?.detail);
    const itemCode = normalizeText(item?.code);
    console.error(`[mlb-hr-props-x] X API error item ${index + 1}: code=${sanitizeLogValue(itemCode || "unknown")} title=${sanitizeLogValue(itemTitle || "unknown")} detail=${sanitizeLogValue(itemDetail || "unknown")}`);
  }
}

function logFinalStatus(status) {
  console.log(`[mlb-hr-props-x] finalStatus=${status}`);
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

  const locations = getDataLocations(source);
  const rawPayload = await loadJson(locations.raw, source);
  const bestBetsPayload = await loadJson(locations.bestBets, source);

  const result = buildCaption(rawPayload, bestBetsPayload);

  if (mode === "post-key-only") {
    if (result.skipped) throw new Error(result.reason);
    console.log(buildDailyPostingKey(rawPayload, bestBetsPayload));
    return;
  }

  console.log(`[mlb-hr-props-x] mode=${mode}`);
  console.log(`[mlb-hr-props-x] dataSource=${source}`);
  console.log(`[mlb-hr-props-x] rawData=${locations.raw}`);
  console.log(`[mlb-hr-props-x] bestBets=${locations.bestBets}`);
  console.log(`[mlb-hr-props-x] todayEt=${getTodayEt()}`);
  console.log(`[mlb-hr-props-x] rawSlateDate=${normalizeText(rawPayload?.date) || "missing"}`);
  console.log(`[mlb-hr-props-x] bestBetsSlateDate=${normalizeText(bestBetsPayload?.date) || "missing"}`);

  if (result.skipped) {
    console.log(`[mlb-hr-props-x] ${result.reason}`);
    logFinalStatus("SKIPPED_NO_ELIGIBLE_ROWS");
    return;
  }

  console.log(`[mlb-hr-props-x] captionLength=${result.caption.length}`);
  const contentFingerprint = buildContentFingerprint(rawPayload, bestBetsPayload, result.topProps);
  const dailyPostingKey = buildDailyPostingKey(rawPayload, bestBetsPayload);
  console.log(`[mlb-hr-props-x] contentFingerprint=${contentFingerprint}`);
  console.log(`[mlb-hr-props-x] dailyPostingKey=${dailyPostingKey}`);

  if (mode !== "post" && mode !== "post-text-only") {
    // dry-run: preview only, never consumes or checks the daily lock.
    console.log("");
    console.log(result.caption);
    console.log("");
    if (mode === "dry-run") {
      try {
        const screenshotPath = await screenshotHrPropsTable();
        console.log(`[mlb-hr-props-x] screenshotPath=${screenshotPath}`);
      } catch (screenshotErr) {
        console.warn(`[mlb-hr-props-x] Screenshot failed: ${screenshotErr instanceof Error ? screenshotErr.message : screenshotErr}`);
      }
    }
    logFinalStatus("SKIPPED_PREVIEW_MODE");
    return;
  }

  const forceRepost = getForceRepostOverride(process.env.GITHUB_EVENT_NAME ?? "", process.env.HR_X_FORCE_REPOST);
  const lock = checkDailyPostingLock(dailyPostingKey, getStateDir(), { allowOverride: forceRepost });
  if (lock.blocked) {
    console.log(`[mlb-hr-props-x] Duplicate protection: ${dailyPostingKey} already has a post receipt at ${lock.statePath}. No live post will be attempted.`);
    logFinalStatus("SKIPPED_ALREADY_POSTED_TODAY");
    return;
  }
  if (lock.overrodeExistingLock) {
    console.log(`[mlb-hr-props-x] Daily posting lock for ${dailyPostingKey} is already set, but an explicit force-repost override was provided -- proceeding.`);
  }
  const duplicateStatePath = lock.statePath;
  console.log("");
  console.log(result.caption);
  console.log("");

  let screenshotPath = "";
  if (mode !== "post-text-only") {
    try {
      screenshotPath = await screenshotHrPropsTable();
      console.log(`[mlb-hr-props-x] screenshotPath=${screenshotPath}`);
    } catch (screenshotErr) {
      console.warn(`[mlb-hr-props-x] Screenshot failed — will post text-only: ${screenshotErr instanceof Error ? screenshotErr.message : screenshotErr}`);
    }
  }

  const baseReceipt = {
    dailyPostingKey,
    contentFingerprint,
    slateDate: normalizeText(rawPayload?.date),
    postedAt: new Date().toISOString(),
    forcedOverride: forceRepost,
  };

  if (mode === "post") {
    if (screenshotPath) {
      const post = await publishPost({ client: account.client, caption: result.caption, screenshotPath });
      savePostReceipt(duplicateStatePath, { ...baseReceipt, tweetId: post.tweetId, tweetUrl: post.tweetUrl, mediaId: post.mediaId, screenshotPath });
      console.log(`[mlb-hr-props-x] duplicateReceipt=${duplicateStatePath}`);
    } else {
      // Screenshot failed — fall back to text-only so the post always goes out
      console.log("[mlb-hr-props-x] Falling back to text-only post");
      const post = await publishTextOnlyPost({ client: account.client, caption: result.caption });
      savePostReceipt(duplicateStatePath, { ...baseReceipt, mode: "text-only-fallback", tweetId: post.tweetId, tweetUrl: post.tweetUrl });
      console.log(`[mlb-hr-props-x] duplicateReceipt=${duplicateStatePath}`);
    }
  }

  if (mode === "post-text-only") {
    const post = await publishTextOnlyPost({ client: account.client, caption: result.caption });
    savePostReceipt(duplicateStatePath, { ...baseReceipt, mode: "text-only", tweetId: post.tweetId, tweetUrl: post.tweetUrl });
    console.log(`[mlb-hr-props-x] duplicateReceipt=${duplicateStatePath}`);
  }

  logFinalStatus("POSTED");
}

try {
  await main();
} catch (error) {
  console.error(`[mlb-hr-props-x] ${sanitizeLogValue(error instanceof Error ? error.message : error)}`);
  logXApiError(error);
  console.log("[mlb-hr-props-x] finalStatus=FAILED");
  console.error("");
  console.error(usage());
  process.exitCode = 1;
}
