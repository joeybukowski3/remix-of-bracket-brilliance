import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";
import { TwitterApi } from "twitter-api-v2";

const ROOT = process.cwd();
const STRIKEOUT_PROPS_URL = "https://www.joeknowsball.com/mlb";
const EXPORT_SELECTOR = '[data-x-export="mlb-k-social"]';
const ROW_SELECTOR = "[data-k-row]";
const K_TAB_LABEL = "K Props";
const SCREENSHOT_PATH = path.join(ROOT, "artifacts", "mlb-strikeout-props-x.png");
const DEFAULT_DUPLICATE_STATE_DIR = path.join(ROOT, "artifacts", "x-post-state");
const args = new Set(process.argv.slice(2));

function usage() {
  return [
    "Usage: node scripts/post-mlb-strikeout-props-to-x.mjs --dry-run",
    "       node scripts/post-mlb-strikeout-props-to-x.mjs --post",
    "       node scripts/post-mlb-strikeout-props-to-x.mjs --post-text-only",
    "       node scripts/post-mlb-strikeout-props-to-x.mjs --verify-account",
    "       node scripts/post-mlb-strikeout-props-to-x.mjs --post-key-only",
    "",
    "--dry-run  Build the X caption, screenshot the Strikeout Props table, and do not post.",
    "--post     Manual GitHub Actions only: validate account, build the caption, screenshot the Strikeout Props table, and publish to X.",
    "--post-text-only  Manual GitHub Actions only: validate account, build the caption, and publish text only to X.",
    "--verify-account  Verify configured X credentials and expected username without building a caption.",
    "--post-key-only  Print the deterministic duplicate-protection key for the current slate/table.",
    "",
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

/**
 * Load the K Props table by rendering the live MLB page, clicking the
 * "K Props" tab, and reading structured row data straight off the
 * data-k-* attributes the page already renders. This guarantees the
 * caption always matches what's screenshotted — both come from the same
 * rendered strikeoutMatchupScore ranking the page itself displays, not a
 * separately-computed field from the raw data file.
 */
async function loadKPropsFromPage(page) {
  await page.goto(STRIKEOUT_PROPS_URL, { waitUntil: "networkidle", timeout: 60000 });
  // Give the page's own client-side data fetches a moment to settle —
  // networkidle can resolve before all rendering/refetching has finished.
  await page.waitForTimeout(1500);

  try {
    const tab = page.locator(`button:has-text("${K_TAB_LABEL}")`).first();
    await tab.scrollIntoViewIfNeeded({ timeout: 8000 });
    await tab.click({ timeout: 8000 });
    console.log("[mlb-strikeout-props-x] Clicked K Props tab");
  } catch (clickErr) {
    console.warn(`[mlb-strikeout-props-x] Tab click failed (${clickErr.message}), trying fallback selector`);
    const fallbackTab = page.locator(`button:text-is("🎯 K Props")`).first();
    await fallbackTab.scrollIntoViewIfNeeded({ timeout: 5000 });
    await fallbackTab.click({ timeout: 5000 });
  }
  await page.waitForTimeout(500);

  const exportTarget = page.locator(EXPORT_SELECTOR).first();
  await exportTarget.waitFor({ state: "visible", timeout: 15000 });

  const meta = await exportTarget.evaluate((el) => ({
    date: el.getAttribute("data-k-date") || "",
    generatedAt: el.getAttribute("data-k-generated-at") || "",
  }));

  const rowLocators = exportTarget.locator(ROW_SELECTOR);
  const rowCount = await rowLocators.count();
  const rows = [];
  for (let i = 0; i < rowCount; i++) {
    const row = rowLocators.nth(i);
    const data = await row.evaluate((el) => ({
      pitcher: el.getAttribute("data-k-pitcher") || "",
      team: el.getAttribute("data-k-team") || "",
      opponent: el.getAttribute("data-k-opponent") || "",
      score: el.getAttribute("data-k-score") || "",
      kRate: el.getAttribute("data-k-rate") || "",
      whiffRate: el.getAttribute("data-k-whiff-rate") || "",
      oppRate: el.getAttribute("data-k-opp-rate") || "",
    }));
    rows.push({
      pitcher: normalizeText(data.pitcher),
      team: normalizeTeam(data.team),
      opponent: normalizeTeam(data.opponent),
      strikeoutScore: toFiniteNumber(data.score) ?? 0,
      kRate: toFiniteNumber(data.kRate),
      whiffRate: toFiniteNumber(data.whiffRate),
      oppRate: toFiniteNumber(data.oppRate),
    });
  }

  return { date: meta.date, generatedAt: meta.generatedAt, rows, exportTarget };
}

async function screenshotExportTarget(exportTarget, outputPath = SCREENSHOT_PATH) {
  mkdirSync(path.dirname(outputPath), { recursive: true });
  await exportTarget.screenshot({ path: outputPath, animations: "disabled" });

  const { statSync } = await import("node:fs");
  const { size } = statSync(outputPath);
  const sizeMb = (size / 1_048_576).toFixed(2);
  console.log(`[mlb-strikeout-props-x] screenshotSize=${sizeMb} MB`);
  if (size > 4_900_000) {
    console.warn(`[mlb-strikeout-props-x] WARNING: screenshot is ${sizeMb} MB — close to X's 5 MB limit`);
  }
  return outputPath;
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
  return `${normalizeText(value?.pitcher)}|${normalizeTeam(value?.team)}|${normalizeTeam(value?.opponent)}`;
}

function slugifyKey(value) {
  return normalizeText(value).replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function validateFreshness(date, generatedAt) {
  const today = getTodayEt();
  if (date !== today) return `Skipping: K Props table date is ${date || "missing"}, expected ${today}.`;
  const generatedDate = getEtDate(generatedAt);
  if (!generatedDate) return "Skipping: K Props generatedAt is missing or invalid.";
  if (generatedDate < date) return `Skipping: K Props generatedAt date ${generatedDate} is older than slate date ${date}.`;
  return "";
}

function validateRows(rows) {
  if (rows.length < 3) return `Skipping: only ${rows.length} valid K prop rows are available; expected at least 3.`;

  for (const [index, row] of rows.slice(0, 3).entries()) {
    const label = `top ${index + 1}`;
    if (isPlaceholderText(row.pitcher)) return `Skipping: ${label} pitcher name is missing or a placeholder.`;
    if (isPlaceholderText(row.team)) return `Skipping: ${label} team is missing or a placeholder.`;
    if (!Number.isFinite(row.strikeoutScore)) return `Skipping: ${label} K score is missing or invalid.`;
  }

  return "";
}

function formatDateLabel(dateValue) {
  const raw = normalizeText(dateValue);
  if (!raw) return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function buildCaption({ date, rows }) {
  const rowsError = validateRows(rows);
  if (rowsError) return { skipped: true, reason: rowsError, caption: "", topProps: [] };

  const topProps = rows.slice(0, 3);
  const dateLabel = formatDateLabel(date);
  const lines = topProps.map((row, index) => {
    const kPart = row.kRate != null ? ` · K%: ${row.kRate.toFixed(1)}` : "";
    const whiffPart = row.whiffRate != null ? ` · Whiff%: ${row.whiffRate.toFixed(1)}` : "";
    return `${index + 1}. ${row.pitcher} (${row.team}) — ${row.strikeoutScore.toFixed(1)}${kPart}${whiffPart}`;
  });

  const caption = [
    `JoeKnowsBall MLB K Props - ${dateLabel}`,
    "",
    "Top edges:",
    ...lines,
    "",
    "Full table at link in bio",
    "",
    "#MLB #MLBPicks #Strikeouts #MLBBetting",
  ].join("\n");

  if (caption.length > 280) {
    // Retry with a shorter line format (drop K%/Whiff% detail) before giving up.
    const shortLines = topProps.map((row, index) => `${index + 1}. ${row.pitcher} (${row.team}) — ${row.strikeoutScore.toFixed(1)}`);
    const shortCaption = [
      `JoeKnowsBall MLB K Props - ${dateLabel}`,
      "",
      "Top edges:",
      ...shortLines,
      "",
      "Full table at link in bio",
      "",
      "#MLB #MLBPicks #Strikeouts",
    ].join("\n");

    if (shortCaption.length > 280) {
      return { skipped: true, reason: `Skipping: generated caption is ${caption.length} characters (and ${shortCaption.length} shortened); expected 280 or fewer.`, caption: "", topProps: [] };
    }
    return { skipped: false, reason: "", caption: shortCaption, topProps };
  }

  return { skipped: false, reason: "", caption, topProps };
}

function buildPostKey(date, rows) {
  const fingerprint = rows
    .map((row) => ({
      pitcher: row.pitcher,
      team: row.team,
      opponent: row.opponent,
      strikeoutScore: Number(row.strikeoutScore.toFixed(1)),
      kRate: row.kRate != null ? Number(row.kRate.toFixed(1)) : null,
      whiffRate: row.whiffRate != null ? Number(row.whiffRate.toFixed(1)) : null,
    }))
    .sort((left, right) => pickKey(left).localeCompare(pickKey(right)));
  const hash = createHash("sha256")
    .update(JSON.stringify({ slateDate: date, fingerprint }))
    .digest("hex")
    .slice(0, 16);

  return `mlb-k-props-${date}-${hash}`;
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

  console.log(`[mlb-strikeout-props-x] Authenticated X account: ${displayUsername}${name ? ` (${name})` : ""}${id ? ` id=${id}` : ""}`);

  if (!username) throw new Error("Authenticated X username was missing from verify_credentials response.");
  if (username !== expectedUsername) {
    throw new Error(`Authenticated X username @${username} does not match expected @${expectedUsername}.`);
  }

  console.log(`[mlb-strikeout-props-x] Authenticated X account matches expected @${expectedUsername}.`);
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

function getLiveDuplicateKey(postKey, mode) {
  return mode === "post-text-only" ? `${postKey}-text-only` : postKey;
}

async function publishPost({ client, caption, screenshotPath }) {
  const mediaId = await client.v1.uploadMedia(screenshotPath, { mimeType: "image/png" });
  const mediaIdStr = String(mediaId);
  console.log(`[mlb-strikeout-props-x] uploadedMediaId=${mediaIdStr}`);

  // Brief wait to ensure media is fully processed before attaching to tweet
  await new Promise(resolve => setTimeout(resolve, 2000));

  const response = await client.v2.tweet(caption, {
    media: { media_ids: [mediaIdStr] },
  });
  const tweetId = normalizeText(response?.data?.id);
  if (!tweetId) throw new Error("X post response did not include a tweet ID.");

  const tweetUrl = `https://x.com/_joeknowsball_/status/${tweetId}`;
  console.log(`[mlb-strikeout-props-x] postedTweetId=${tweetId}`);
  console.log(`[mlb-strikeout-props-x] postedTweetUrl=${tweetUrl}`);
  return { tweetId, tweetUrl, mediaId: mediaIdStr };
}

async function publishTextOnlyPost({ client, caption }) {
  const response = await client.v2.tweet(caption);
  const tweetId = normalizeText(response?.data?.id);
  if (!tweetId) throw new Error("X text-only post response did not include a tweet ID.");

  const tweetUrl = `https://x.com/_joeknowsball_/status/${tweetId}`;
  console.log(`[mlb-strikeout-props-x] postedTweetId=${tweetId}`);
  console.log(`[mlb-strikeout-props-x] postedTweetUrl=${tweetUrl}`);
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
    console.error(`[mlb-strikeout-props-x] X API error status=${sanitizeLogValue(status ?? "unknown")} code=${sanitizeLogValue(code ?? "unknown")}`);
  }
  if (title !== undefined) console.error(`[mlb-strikeout-props-x] X API error title=${sanitizeLogValue(title)}`);
  if (detail !== undefined) console.error(`[mlb-strikeout-props-x] X API error detail=${sanitizeLogValue(detail)}`);
  for (const [index, item] of errors.entries()) {
    const itemTitle = normalizeText(item?.title);
    const itemDetail = normalizeText(item?.detail);
    const itemCode = normalizeText(item?.code);
    console.error(`[mlb-strikeout-props-x] X API error item ${index + 1}: code=${sanitizeLogValue(itemCode || "unknown")} title=${sanitizeLogValue(itemTitle || "unknown")} detail=${sanitizeLogValue(itemDetail || "unknown")}`);
  }
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

  const browser = await chromium.launch({ headless: true });
  let pageData;
  let screenshotPath = "";
  try {
    const page = await browser.newPage({
      viewport: { width: 1080, height: 1400 },
      deviceScaleFactor: 1,
    });
    page.setDefaultTimeout(60000);
    pageData = await loadKPropsFromPage(page);

    console.log(`[mlb-strikeout-props-x] mode=${mode}`);
    console.log(`[mlb-strikeout-props-x] todayEt=${getTodayEt()}`);
    console.log(`[mlb-strikeout-props-x] tableDate=${pageData.date || "missing"}`);
    console.log(`[mlb-strikeout-props-x] tableGeneratedAt=${pageData.generatedAt || "missing"}`);
    console.log(`[mlb-strikeout-props-x] rowCount=${pageData.rows.length}`);

    const freshnessError = validateFreshness(pageData.date, pageData.generatedAt);
    if (freshnessError) {
      if (mode === "post-key-only") throw new Error(freshnessError);
      console.log(`[mlb-strikeout-props-x] ${freshnessError}`);
      return;
    }

    const rowsError = validateRows(pageData.rows);
    if (rowsError) {
      if (mode === "post-key-only") throw new Error(rowsError);
      console.log(`[mlb-strikeout-props-x] ${rowsError}`);
      return;
    }

    const result = buildCaption({ date: pageData.date, rows: pageData.rows });

    if (mode === "post-key-only") {
      if (result.skipped) throw new Error(result.reason);
      console.log(buildPostKey(pageData.date, pageData.rows));
      return;
    }

    if (result.skipped) {
      console.log(`[mlb-strikeout-props-x] ${result.reason}`);
      return;
    }

    console.log(`[mlb-strikeout-props-x] captionLength=${result.caption.length}`);
    const postKey = buildPostKey(pageData.date, pageData.rows);
    console.log(`[mlb-strikeout-props-x] postKey=${postKey}`);
    const liveDuplicateKey = mode === "post" || mode === "post-text-only" ? getLiveDuplicateKey(postKey, mode) : "";
    const duplicateStatePath = liveDuplicateKey ? assertNotAlreadyPosted(liveDuplicateKey) : "";
    console.log("");
    console.log(result.caption);
    console.log("");

    if (mode !== "post-text-only") {
      try {
        screenshotPath = await screenshotExportTarget(pageData.exportTarget);
        console.log(`[mlb-strikeout-props-x] screenshotPath=${screenshotPath}`);
      } catch (screenshotErr) {
        console.warn(`[mlb-strikeout-props-x] Screenshot failed — will post text-only: ${screenshotErr instanceof Error ? screenshotErr.message : screenshotErr}`);
      }
    }

    if (mode === "post") {
      if (screenshotPath) {
        const post = await publishPost({ client: account.client, caption: result.caption, screenshotPath });
        savePostReceipt(duplicateStatePath, {
          postKey: liveDuplicateKey,
          slateDate: pageData.date,
          postedAt: new Date().toISOString(),
          tweetId: post.tweetId,
          tweetUrl: post.tweetUrl,
          mediaId: post.mediaId,
          screenshotPath,
        });
        console.log(`[mlb-strikeout-props-x] duplicateReceipt=${duplicateStatePath}`);
      } else {
        // Screenshot failed — fall back to text-only so the post always goes out
        console.log("[mlb-strikeout-props-x] Falling back to text-only post");
        const post = await publishTextOnlyPost({ client: account.client, caption: result.caption });
        savePostReceipt(duplicateStatePath, {
          postKey: liveDuplicateKey,
          mode: "text-only-fallback",
          slateDate: pageData.date,
          postedAt: new Date().toISOString(),
          tweetId: post.tweetId,
          tweetUrl: post.tweetUrl,
        });
        console.log(`[mlb-strikeout-props-x] duplicateReceipt=${duplicateStatePath}`);
      }
    }

    if (mode === "post-text-only") {
      const post = await publishTextOnlyPost({ client: account.client, caption: result.caption });
      savePostReceipt(duplicateStatePath, {
        postKey: liveDuplicateKey,
        mode: "text-only",
        slateDate: pageData.date,
        postedAt: new Date().toISOString(),
        tweetId: post.tweetId,
        tweetUrl: post.tweetUrl,
      });
      console.log(`[mlb-strikeout-props-x] duplicateReceipt=${duplicateStatePath}`);
    }
  } finally {
    await browser.close();
  }
}

try {
  await main();
} catch (error) {
  console.error(`[mlb-strikeout-props-x] ${sanitizeLogValue(error instanceof Error ? error.message : error)}`);
  logXApiError(error);
  console.error("");
  console.error(usage());
  process.exitCode = 1;
}
