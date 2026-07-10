import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";
import { TwitterApi } from "twitter-api-v2";
import { isMlPostingEnabled } from "./lib/mlb-ml-posting-gate.mjs";

const ROOT = process.cwd();
const ML_EDGES_URL = "https://www.joeknowsball.com/mlb";
const EXPORT_SELECTOR = '[data-x-export="mlb-ml-social"]';
const ROW_SELECTOR = "[data-ml-row]";
const ML_TAB_LABEL = "ML Edges";
const SCREENSHOT_PATH = path.join(ROOT, "artifacts", "mlb-ml-edges-x.png");
const DEFAULT_DUPLICATE_STATE_DIR = path.join(ROOT, "artifacts", "x-post-state");
const args = new Set(process.argv.slice(2));

function usage() {
  return [
    "Usage: node scripts/post-mlb-ml-edges-to-x.mjs --dry-run",
    "       node scripts/post-mlb-ml-edges-to-x.mjs --post",
    "       node scripts/post-mlb-ml-edges-to-x.mjs --post-text-only",
    "       node scripts/post-mlb-ml-edges-to-x.mjs --verify-account",
    "       node scripts/post-mlb-ml-edges-to-x.mjs --post-key-only",
    "",
    "--dry-run  Build the X caption, screenshot the ML Edges table, and do not post.",
    "--post     Manual GitHub Actions only: validate account, build the caption, screenshot the ML Edges table, and publish to X.",
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

function normalizeTeam(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeUsername(value) {
  return normalizeText(value).replace(/^@/, "").toLowerCase();
}

function toFiniteNumber(value) {
  if (value === "" || value == null) return null;
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

function slugifyKey(value) {
  return normalizeText(value).replace(/[^a-zA-Z0-9._-]+/g, "-");
}

/**
 * Load the ML Edges table by rendering the live MLB page, clicking the
 * "ML Edges" tab, and reading structured row data straight off the
 * data-ml-* attributes the page already renders. This avoids re-implementing
 * computeModelEdge() in Node — the browser is the single source of truth for
 * the model pick/confidence/differential math, exactly as the user sees it.
 *
 * PER MODEL AUDIT (Phase 1 correctness fix): this no longer reads a
 * data-ml-value-edge attribute (a fabricated probability-vs-market
 * percentage). It reads data-ml-differential — the model's own unmodified
 * factor differential — and reports edge strength as a tier label.
 */
async function loadMlEdgesFromPage(page) {
  await page.goto(ML_EDGES_URL, { waitUntil: "networkidle", timeout: 60000 });
  // The live page polls several data sources after initial load (Polymarket
  // moneylines, pitcher regression, etc.); give those a moment to settle
  // before interacting, since networkidle can resolve before all of the
  // page's own client-side fetches have finished rendering.
  await page.waitForTimeout(1500);

  try {
    // Role-based exact match — a plain text substring selector for "ML Edges"
    // also matches the much larger "ML Edge" pick badge rendered on every
    // Game Matchup Analyzer card, which sits earlier in the DOM and was
    // being clicked instead of the actual tab button.
    const tab = page.getByRole("button", { name: ML_TAB_LABEL }).first();
    await tab.scrollIntoViewIfNeeded({ timeout: 8000 });
    await tab.click({ timeout: 8000 });
    console.log("[mlb-ml-edges-x] Clicked ML Edges tab");
  } catch (clickErr) {
    console.warn(`[mlb-ml-edges-x] Tab click failed (${clickErr.message}), trying fallback selector`);
    const fallbackTab = page.locator(`button:text-is("🏆 ML Edges")`).first();
    await fallbackTab.scrollIntoViewIfNeeded({ timeout: 5000 });
    await fallbackTab.click({ timeout: 5000 });
  }
  await page.waitForTimeout(500);

  const exportTarget = page.locator(EXPORT_SELECTOR).first();
  await exportTarget.waitFor({ state: "visible", timeout: 15000 });

  const meta = await exportTarget.evaluate((el) => ({
    date: el.getAttribute("data-ml-date") || "",
    generatedAt: el.getAttribute("data-ml-generated-at") || "",
    rowCount: el.getAttribute("data-ml-row-count") || "",
  }));

  const rowLocators = exportTarget.locator(ROW_SELECTOR);
  const rowCount = await rowLocators.count();
  const rows = [];
  for (let i = 0; i < rowCount; i++) {
    const row = rowLocators.nth(i);
    const data = await row.evaluate((el) => ({
      away: el.getAttribute("data-ml-away") || "",
      home: el.getAttribute("data-ml-home") || "",
      pick: el.getAttribute("data-ml-pick") || "",
      confidence: el.getAttribute("data-ml-confidence") || "",
      differential: el.getAttribute("data-ml-differential") || "",
      pickAmerican: el.getAttribute("data-ml-pick-american") || "",
      polyYes: el.getAttribute("data-ml-poly-yes") || "",
      polyNo: el.getAttribute("data-ml-poly-no") || "",
      gameTime: el.getAttribute("data-ml-game-time") || "",
    }));
    rows.push({
      away: normalizeTeam(data.away),
      home: normalizeTeam(data.home),
      pick: normalizeTeam(data.pick),
      confidence: toFiniteNumber(data.confidence),
      differential: toFiniteNumber(data.differential),
      pickAmerican: normalizeText(data.pickAmerican) || null,
      polyYes: toFiniteNumber(data.polyYes),
      polyNo: toFiniteNumber(data.polyNo),
      gameTime: normalizeText(data.gameTime),
    });
  }

  return { date: meta.date, generatedAt: meta.generatedAt, rows, exportTarget };
}

function validateFreshness(date, generatedAt) {
  const today = getTodayEt();
  if (date !== today) return `Skipping: ML Edges table date is ${date || "missing"}, expected ${today}.`;
  const generatedDate = getEtDate(generatedAt);
  if (!generatedDate) return "Skipping: ML Edges generatedAt is missing or invalid.";
  if (generatedDate < date) return `Skipping: ML Edges generatedAt date ${generatedDate} is older than slate date ${date}.`;
  return "";
}

function validateRows(rows) {
  if (rows.length < 1) return "Skipping: no valid ML edge rows are available.";
  const top = rows[0];
  if (!top.away || !top.home) return "Skipping: top row is missing team abbreviations.";
  if (!top.pick) return "Skipping: top row is missing a model pick.";
  if (top.confidence == null) return "Skipping: top row is missing model confidence.";
  return "";
}

function formatDateLabel(dateValue) {
  const raw = normalizeText(dateValue);
  if (!raw) return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatCents(price) {
  if (price == null) return null;
  return `${Math.round(price * 100)}\u00a2`;
}

/**
 * Mirrors getEdgeTierLabel in src/lib/mlb/mlbModelEdge.ts. Kept in sync
 * manually since this script runs outside the Vite/TS build. PER MODEL
 * AUDIT: confidence is an edge-strength index (50-82), not a win
 * probability -- never present it as a percentage claim of "value".
 */
function getEdgeTierLabel(confidence) {
  if (confidence >= 72) return "Strong lean";
  if (confidence >= 64) return "Moderate lean";
  if (confidence >= 56) return "Slight lean";
  return "Coin flip";
}

/** Build one caption line for a pick, including Polymarket YES/NO when available. */
function formatRowLine(row, index) {
  const matchup = `${row.away}@${row.home}`;
  const parts = [`${index + 1}. ${row.pick} ML (${matchup})`];

  if (row.confidence != null) {
    parts.push(getEdgeTierLabel(row.confidence));
  }

  const yes = formatCents(row.polyYes);
  const no = formatCents(row.polyNo);
  if (yes != null && no != null) {
    parts.push(`Poly YES ${yes} / NO ${no}`);
  }

  return parts.join(" - ");
}

function buildCaption({ date, rows }) {
  const rowsError = validateRows(rows);
  if (rowsError) return { skipped: true, reason: rowsError, caption: "" };

  const dateLabel = formatDateLabel(date);
  const topRows = rows.slice(0, 3);
  const lines = topRows.map((row, index) => formatRowLine(row, index));

  const hasPoly = topRows.some((row) => row.polyYes != null);
  const subtitle = hasPoly ? "Top model edges (with Polymarket reference):" : "Top model edges:";

  const caption = [
    `JoeKnowsBall MLB ML Edges - ${dateLabel}`,
    "",
    subtitle,
    ...lines,
    "",
    "Free Access to Full Table at Link in Bio",
    "",
    "#MLB #MLBPicks #MoneyLine #MLBBetting",
  ].join("\n");

  if (caption.length > 280) {
    // Retry with a shorter line format (drop Polymarket detail) before giving up.
    const shortLines = topRows.map((row, index) => {
      const matchup = `${row.away}@${row.home}`;
      const tierText = row.confidence != null ? getEdgeTierLabel(row.confidence) : "--";
      return `${index + 1}. ${row.pick} ML (${matchup}) - ${tierText}`;
    });
    const shortCaption = [
      `JoeKnowsBall MLB ML Edges - ${dateLabel}`,
      "",
      "Top model edges:",
      ...shortLines,
      "",
      "Free Access to Full Table at Link in Bio",
      "",
      "#MLB #MLBPicks #MoneyLine #MLBBetting",
    ].join("\n");

    if (shortCaption.length > 280) {
      return { skipped: true, reason: `Skipping: generated caption is ${caption.length} characters (and ${shortCaption.length} shortened); expected 280 or fewer.`, caption: "" };
    }
    return { skipped: false, reason: "", caption: shortCaption };
  }

  return { skipped: false, reason: "", caption };
}

function buildPostKey(date, rows) {
  const fingerprint = rows.map((row) => ({
    away: row.away,
    home: row.home,
    pick: row.pick,
    confidence: row.confidence != null ? Number(row.confidence.toFixed(1)) : null,
    differential: row.differential != null ? Number(row.differential.toFixed(1)) : null,
    polyYes: row.polyYes != null ? Number(row.polyYes.toFixed(3)) : null,
    polyNo: row.polyNo != null ? Number(row.polyNo.toFixed(3)) : null,
  }));
  const hash = createHash("sha256")
    .update(JSON.stringify({ date, fingerprint }))
    .digest("hex")
    .slice(0, 16);

  return `mlb-ml-edges-${date}-${hash}`;
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

  console.log(`[mlb-ml-edges-x] Authenticated X account: ${displayUsername}${name ? ` (${name})` : ""}${id ? ` id=${id}` : ""}`);

  if (!username) throw new Error("Authenticated X username was missing from verify_credentials response.");
  if (username !== expectedUsername) {
    throw new Error(`Authenticated X username @${username} does not match expected @${expectedUsername}.`);
  }

  console.log(`[mlb-ml-edges-x] Authenticated X account matches expected @${expectedUsername}.`);
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
  console.log(`[mlb-ml-edges-x] uploadedMediaId=${mediaIdStr}`);

  // Brief wait to ensure media is fully processed before attaching to tweet
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const response = await client.v2.tweet(caption, {
    media: { media_ids: [mediaIdStr] },
  });
  const tweetId = normalizeText(response?.data?.id);
  if (!tweetId) throw new Error("X post response did not include a tweet ID.");

  const tweetUrl = `https://x.com/_joeknowsball_/status/${tweetId}`;
  console.log(`[mlb-ml-edges-x] postedTweetId=${tweetId}`);
  console.log(`[mlb-ml-edges-x] postedTweetUrl=${tweetUrl}`);
  return { tweetId, tweetUrl, mediaId: mediaIdStr };
}

async function publishTextOnlyPost({ client, caption }) {
  const response = await client.v2.tweet(caption);
  const tweetId = normalizeText(response?.data?.id);
  if (!tweetId) throw new Error("X text-only post response did not include a tweet ID.");

  const tweetUrl = `https://x.com/_joeknowsball_/status/${tweetId}`;
  console.log(`[mlb-ml-edges-x] postedTweetId=${tweetId}`);
  console.log(`[mlb-ml-edges-x] postedTweetUrl=${tweetUrl}`);
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
    console.error(`[mlb-ml-edges-x] X API error status=${sanitizeLogValue(status ?? "unknown")} code=${sanitizeLogValue(code ?? "unknown")}`);
  }
  if (title !== undefined) console.error(`[mlb-ml-edges-x] X API error title=${sanitizeLogValue(title)}`);
  if (detail !== undefined) console.error(`[mlb-ml-edges-x] X API error detail=${sanitizeLogValue(detail)}`);
  for (const [index, item] of errors.entries()) {
    const itemTitle = normalizeText(item?.title);
    const itemDetail = normalizeText(item?.detail);
    const itemCode = normalizeText(item?.code);
    console.error(`[mlb-ml-edges-x] X API error item ${index + 1}: code=${sanitizeLogValue(itemCode || "unknown")} title=${sanitizeLogValue(itemTitle || "unknown")} detail=${sanitizeLogValue(itemDetail || "unknown")}`);
  }
}

async function screenshotExportTarget(exportTarget, outputPath = SCREENSHOT_PATH) {
  mkdirSync(path.dirname(outputPath), { recursive: true });
  await exportTarget.screenshot({ path: outputPath, animations: "disabled" });

  const { statSync } = await import("node:fs");
  const { size } = statSync(outputPath);
  const sizeMb = (size / 1_048_576).toFixed(2);
  console.log(`[mlb-ml-edges-x] screenshotSize=${sizeMb} MB`);
  if (size > 4_900_000) {
    console.warn(`[mlb-ml-edges-x] WARNING: screenshot is ${sizeMb} MB — close to X's 5 MB limit`);
  }
  return outputPath;
}

function logFinalStatus(status) {
  console.log(`[mlb-ml-edges-x] finalStatus=${status}`);
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

  if ((mode === "post" || mode === "post-text-only") && !isMlPostingEnabled(process.env.ML_X_POSTING_ENABLED)) {
    console.log("[mlb-ml-edges-x] ML X posting is paused by configuration (ML_X_POSTING_ENABLED is not \"true\"). The ML model/table is under revision. No X API call was made.");
    logFinalStatus("SKIPPED_DISABLED");
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
    pageData = await loadMlEdgesFromPage(page);

    console.log(`[mlb-ml-edges-x] mode=${mode}`);
    console.log(`[mlb-ml-edges-x] todayEt=${getTodayEt()}`);
    console.log(`[mlb-ml-edges-x] tableDate=${pageData.date || "missing"}`);
    console.log(`[mlb-ml-edges-x] tableGeneratedAt=${pageData.generatedAt || "missing"}`);
    console.log(`[mlb-ml-edges-x] rowCount=${pageData.rows.length}`);

    const freshnessError = validateFreshness(pageData.date, pageData.generatedAt);
    if (freshnessError) {
      if (mode === "post-key-only") throw new Error(freshnessError);
      console.log(`[mlb-ml-edges-x] ${freshnessError}`);
      logFinalStatus("SKIPPED_NO_ELIGIBLE_ROWS");
      return;
    }

    const rowsError = validateRows(pageData.rows);
    if (rowsError) {
      if (mode === "post-key-only") throw new Error(rowsError);
      console.log(`[mlb-ml-edges-x] ${rowsError}`);
      logFinalStatus("SKIPPED_NO_ELIGIBLE_ROWS");
      return;
    }

    const result = buildCaption({ date: pageData.date, rows: pageData.rows });

    if (mode === "post-key-only") {
      if (result.skipped) throw new Error(result.reason);
      console.log(buildPostKey(pageData.date, pageData.rows));
      return;
    }

    if (result.skipped) {
      console.log(`[mlb-ml-edges-x] ${result.reason}`);
      logFinalStatus("SKIPPED_NO_ELIGIBLE_ROWS");
      return;
    }

    if (mode === "dry-run") {
      console.log("");
      console.log(result.caption);
      console.log("");
      try {
        screenshotPath = await screenshotExportTarget(pageData.exportTarget);
        console.log(`[mlb-ml-edges-x] screenshotPath=${screenshotPath}`);
      } catch (screenshotErr) {
        console.warn(`[mlb-ml-edges-x] Screenshot failed: ${screenshotErr instanceof Error ? screenshotErr.message : screenshotErr}`);
      }
      logFinalStatus("SKIPPED_PREVIEW_MODE");
      return;
    }

    console.log(`[mlb-ml-edges-x] captionLength=${result.caption.length}`);
    const postKey = buildPostKey(pageData.date, pageData.rows);
    console.log(`[mlb-ml-edges-x] postKey=${postKey}`);
    const liveDuplicateKey = mode === "post" || mode === "post-text-only" ? getLiveDuplicateKey(postKey, mode) : "";
    const duplicateStatePath = liveDuplicateKey ? assertNotAlreadyPosted(liveDuplicateKey) : "";
    console.log("");
    console.log(result.caption);
    console.log("");

    if (mode !== "post-text-only") {
      try {
        screenshotPath = await screenshotExportTarget(pageData.exportTarget);
        console.log(`[mlb-ml-edges-x] screenshotPath=${screenshotPath}`);
      } catch (screenshotErr) {
        console.warn(`[mlb-ml-edges-x] Screenshot failed — will post text-only: ${screenshotErr instanceof Error ? screenshotErr.message : screenshotErr}`);
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
        console.log(`[mlb-ml-edges-x] duplicateReceipt=${duplicateStatePath}`);
      } else {
        console.log("[mlb-ml-edges-x] Falling back to text-only post");
        const post = await publishTextOnlyPost({ client: account.client, caption: result.caption });
        savePostReceipt(duplicateStatePath, {
          postKey: liveDuplicateKey,
          mode: "text-only-fallback",
          slateDate: pageData.date,
          postedAt: new Date().toISOString(),
          tweetId: post.tweetId,
          tweetUrl: post.tweetUrl,
        });
        console.log(`[mlb-ml-edges-x] duplicateReceipt=${duplicateStatePath}`);
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
      console.log(`[mlb-ml-edges-x] duplicateReceipt=${duplicateStatePath}`);
    }

    logFinalStatus("POSTED");
  } finally {
    await browser.close();
  }
}

try {
  await main();
} catch (error) {
  console.error(`[mlb-ml-edges-x] ${sanitizeLogValue(error instanceof Error ? error.message : error)}`);
  logXApiError(error);
  console.log("[mlb-ml-edges-x] finalStatus=FAILED");
  console.error("");
  console.error(usage());
  process.exitCode = 1;
}
