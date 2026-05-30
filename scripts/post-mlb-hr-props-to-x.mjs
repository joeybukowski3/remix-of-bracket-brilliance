import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";
import { TwitterApi } from "twitter-api-v2";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const RAW_DATA_PATH = path.join(DATA_DIR, "hr-props-raw.json");
const BEST_BETS_PATH = path.join(DATA_DIR, "hr-props-best-bets.json");
const PRODUCTION_BASE_URL = "https://www.joeknowsball.com/data/mlb";
const GITHUB_BASE_URL = "https://raw.githubusercontent.com/joeybukowski3/remix-of-bracket-brilliance/main/public/data/mlb";
const HR_PROPS_URL = "https://www.joeknowsball.com/mlb/hr-props";
const EXPORT_SELECTOR = '[data-x-export="mlb-hr-props"]';
const SCREENSHOT_PATH = path.join(ROOT, "artifacts", "mlb-hr-props-x.png");
const DEFAULT_DUPLICATE_STATE_DIR = path.join(ROOT, "artifacts", "x-post-state");
const args = new Set(process.argv.slice(2));

function usage() {
  return [
    "Usage: node scripts/post-mlb-hr-props-to-x.mjs --dry-run",
    "       node scripts/post-mlb-hr-props-to-x.mjs --post",
    "       node scripts/post-mlb-hr-props-to-x.mjs --verify-account",
    "       node scripts/post-mlb-hr-props-to-x.mjs --post-key-only",
    "",
    "--dry-run  Build the X caption, screenshot the HR Props table, and do not post.",
    "--post     Manual GitHub Actions only: validate account, build the caption, screenshot the HR Props table, and publish to X.",
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
  const verifyAccount = args.has("--verify-account");
  const postKeyOnly = args.has("--post-key-only");
  const modes = [dryRun, post, verifyAccount, postKeyOnly].filter(Boolean).length;
  if (modes > 1) throw new Error("Choose only one mode: --dry-run, --post, --verify-account, or --post-key-only.");
  if (!modes) return "dry-run";
  if (verifyAccount) return "verify-account";
  if (postKeyOnly) return "post-key-only";
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
      viewport: { width: 1280, height: 1600 },
      deviceScaleFactor: 2,
    });
    page.setDefaultTimeout(60000);
    await page.goto(HR_PROPS_URL, { waitUntil: "networkidle", timeout: 60000 });

    let exportTarget = page.locator(EXPORT_SELECTOR).first();
    try {
      await exportTarget.waitFor({ state: "visible", timeout: 10000 });
    } catch {
      exportTarget = page
        .locator("table", { hasText: "HR Score" })
        .first()
        .locator("xpath=ancestor::div[contains(@class, 'overflow-x-auto')][1]");
      await exportTarget.waitFor({ state: "visible" });
      console.log(`[mlb-hr-props-x] ${EXPORT_SELECTOR} was not found on production; used current HR Score table fallback.`);
    }

    await exportTarget.screenshot({
      path: outputPath,
      animations: "disabled",
    });

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
    };
  }

  if (source === "github") {
    return {
      raw: `${GITHUB_BASE_URL}/hr-props-raw.json`,
      bestBets: `${GITHUB_BASE_URL}/hr-props-best-bets.json`,
    };
  }

  return {
    raw: RAW_DATA_PATH,
    bestBets: BEST_BETS_PATH,
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

function normalizeUsername(value) {
  return normalizeText(value).replace(/^@/, "").toLowerCase();
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function slugifyKey(value) {
  return normalizeText(value).replace(/[^a-zA-Z0-9._-]+/g, "-");
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
    hrScore,
    hrScoreRank,
  };
}

function getTopHrProps(rawPayload, bestBetsPayload, limit = 3) {
  const batters = Array.isArray(rawPayload?.batters)
    ? rawPayload.batters.map(normalizeBatter).filter(Boolean)
    : [];

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
  const lines = topPropsResult.topProps.map((row, index) => (
    `${index + 1}. ${row.player} (${row.team}) - HR Score ${row.hrScore.toFixed(1)}`
  ));

  const caption = [
    `JoeKnowsBall MLB HR Props - ${dateLabel}`,
    "",
    "Top model edges:",
    ...lines,
    "",
    `Full table: ${HR_PROPS_URL}`,
    "",
    "#MLB #HomeRunProps #MLBPicks #SportsBetting",
  ].join("\n");

  if (caption.length > 280) {
    return { skipped: true, reason: `Skipping: generated caption is ${caption.length} characters; expected 280 or fewer.`, caption: "", topProps: [] };
  }

  return { skipped: false, reason: "", caption, topProps: topPropsResult.topProps };
}

function buildPostKey(rawPayload, bestBetsPayload, topProps) {
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

function getDuplicateStatePath(postKey) {
  const stateDir = normalizeText(process.env.X_DUPLICATE_STATE_DIR) || DEFAULT_DUPLICATE_STATE_DIR;
  return path.join(stateDir, `${slugifyKey(postKey)}.json`);
}

function assertNotAlreadyPosted(postKey) {
  const statePath = getDuplicateStatePath(postKey);
  if (existsSync(statePath)) {
    throw new Error(`Duplicate protection blocked posting: ${postKey} already has a post receipt at ${statePath}.`);
  }
  return statePath;
}

function savePostReceipt(statePath, receipt) {
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(receipt, null, 2)}\n`);
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
  if (process.env.GITHUB_EVENT_NAME !== "workflow_dispatch") {
    throw new Error("Live posting is only allowed from manual GitHub Actions workflow_dispatch runs.");
  }
  if (process.env.X_ALLOW_LIVE_POST !== "true") {
    throw new Error("Live posting is blocked unless X_ALLOW_LIVE_POST=true is set by the manual workflow post path.");
  }
}

async function publishPost({ client, caption, screenshotPath }) {
  const mediaId = await client.v1.uploadMedia(screenshotPath, { mimeType: "image/png" });
  console.log(`[mlb-hr-props-x] uploadedMediaId=${mediaId}`);

  const response = await client.v2.tweet(caption, {
    media: { media_ids: [mediaId] },
  });
  const tweetId = normalizeText(response?.data?.id);
  if (!tweetId) throw new Error("X post response did not include a tweet ID.");

  const tweetUrl = `https://x.com/_joeknowsball_/status/${tweetId}`;
  console.log(`[mlb-hr-props-x] postedTweetId=${tweetId}`);
  console.log(`[mlb-hr-props-x] postedTweetUrl=${tweetUrl}`);
  return { tweetId, tweetUrl, mediaId };
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
  if (mode === "post") {
    assertLivePostAllowed();
    account = await verifyExpectedXAccount();
  }

  const source = getDataSource();
  if (mode === "post" && source !== "production") {
    throw new Error("Live posting requires HR_PROPS_DATA_SOURCE=production.");
  }

  const locations = getDataLocations(source);
  const rawPayload = await loadJson(locations.raw, source);
  const bestBetsPayload = await loadJson(locations.bestBets, source);
  const result = buildCaption(rawPayload, bestBetsPayload);

  if (mode === "post-key-only") {
    if (result.skipped) throw new Error(result.reason);
    console.log(buildPostKey(rawPayload, bestBetsPayload, result.topProps));
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
    return;
  }

  console.log(`[mlb-hr-props-x] captionLength=${result.caption.length}`);
  const postKey = buildPostKey(rawPayload, bestBetsPayload, result.topProps);
  console.log(`[mlb-hr-props-x] postKey=${postKey}`);
  const duplicateStatePath = mode === "post" ? assertNotAlreadyPosted(postKey) : "";
  console.log("");
  console.log(result.caption);
  console.log("");

  const screenshotPath = await screenshotHrPropsTable();
  console.log(`[mlb-hr-props-x] screenshotPath=${screenshotPath}`);

  if (mode === "post") {
    const post = await publishPost({ client: account.client, caption: result.caption, screenshotPath });
    savePostReceipt(duplicateStatePath, {
      postKey,
      slateDate: normalizeText(rawPayload?.date),
      postedAt: new Date().toISOString(),
      tweetId: post.tweetId,
      tweetUrl: post.tweetUrl,
      mediaId: post.mediaId,
      screenshotPath,
    });
    console.log(`[mlb-hr-props-x] duplicateReceipt=${duplicateStatePath}`);
  }
}

try {
  await main();
} catch (error) {
  console.error(`[mlb-hr-props-x] ${error instanceof Error ? error.message : error}`);
  console.error("");
  console.error(usage());
  process.exitCode = 1;
}
