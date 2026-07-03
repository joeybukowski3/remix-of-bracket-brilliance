import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { TwitterApi } from "twitter-api-v2";

const ROOT = process.cwd();
const DEFAULT_DUPLICATE_STATE_DIR = path.join(ROOT, "artifacts", "x-post-state");

const TARGETS = Object.freeze({
  hr: {
    label: "MLB HR Props",
    logPrefix: "mlb-hr-props-x",
    legacyScript: "scripts/post-mlb-hr-props-to-x.mjs",
    screenshotPath: "artifacts/mlb-hr-props-x.png",
  },
  ml: {
    label: "MLB ML Edges",
    logPrefix: "mlb-ml-edges-x",
    legacyScript: "scripts/post-mlb-ml-edges-to-x.mjs",
    screenshotPath: "artifacts/mlb-ml-edges-x.png",
  },
  k: {
    label: "MLB Strikeout Props",
    logPrefix: "mlb-strikeout-props-x",
    legacyScript: "scripts/post-mlb-strikeout-props-to-x.mjs",
    screenshotPath: "artifacts/mlb-strikeout-props-x.png",
  },
});

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUsername(value) {
  return normalizeText(value).replace(/^@/, "").toLowerCase();
}

function parseCli(argv = process.argv.slice(2)) {
  let target = "";
  let mode = "dry-run";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--target") {
      target = normalizeText(argv[index + 1]).toLowerCase();
      index += 1;
      continue;
    }
    if (arg.startsWith("--target=")) {
      target = normalizeText(arg.slice("--target=".length)).toLowerCase();
      continue;
    }
    if (["--dry-run", "--post", "--post-text-only", "--verify-account", "--post-key-only"].includes(arg)) {
      mode = arg.slice(2);
    }
  }

  if (!TARGETS[target]) {
    throw new Error(`Missing or invalid --target. Expected one of: ${Object.keys(TARGETS).join(", ")}.`);
  }

  return { target, mode };
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

async function verifyExpectedXAccount(client = createXClientFromEnv()) {
  const expectedUsername = normalizeUsername(process.env.X_EXPECTED_USERNAME);
  if (!expectedUsername) {
    throw new Error("Missing X_EXPECTED_USERNAME. Expected X_EXPECTED_USERNAME=_joeknowsball_.");
  }

  // Use X API v2 /users/me. The previous scripts used v1.1 verify_credentials,
  // which is unavailable on some current X API access tiers even when v2 posting works.
  const response = await client.v2.me({ "user.fields": ["id", "name", "username"] });
  const account = response?.data ?? response;
  const username = normalizeUsername(account?.username);
  const name = normalizeText(account?.name);
  const id = normalizeText(account?.id);

  console.log(`[x-post] Authenticated X account: @${username || "unknown"}${name ? ` (${name})` : ""}${id ? ` id=${id}` : ""}`);

  if (!username) throw new Error("Authenticated X username was missing from the X API v2 /users/me response.");
  if (username !== expectedUsername) {
    throw new Error(`Authenticated X username @${username} does not match expected @${expectedUsername}.`);
  }

  console.log(`[x-post] Authenticated X account matches expected @${expectedUsername}.`);
  return { client, username, name, id };
}

function assertLivePostAllowed() {
  const eventName = normalizeText(process.env.GITHUB_EVENT_NAME);
  const allowed = ["workflow_dispatch", "schedule", "workflow_run"].includes(eventName);
  if (!allowed) {
    throw new Error(`Live posting is blocked for event "${eventName}". Only workflow_dispatch, schedule, and workflow_run events may post.`);
  }
  if (process.env.X_ALLOW_LIVE_POST !== "true") {
    throw new Error("Live posting is blocked unless X_ALLOW_LIVE_POST=true is set by the workflow.");
  }
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

function runLegacy(targetConfig, mode, { capture = false } = {}) {
  const result = spawnSync(process.execPath, [targetConfig.legacyScript, `--${mode}`], {
    cwd: ROOT,
    env: { ...process.env, X_ALLOW_LIVE_POST: "false" },
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (capture) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Legacy ${targetConfig.label} ${mode} command failed with exit code ${result.status}.`);
  }

  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function extractPreparedPost(stdout, targetConfig) {
  const lines = String(stdout).split(/\r?\n/);
  const postKeyIndex = lines.findIndex((line) => line.includes(`[${targetConfig.logPrefix}] postKey=`));
  if (postKeyIndex < 0) throw new Error(`Unable to find postKey in ${targetConfig.label} dry-run output.`);

  const postKey = normalizeText(lines[postKeyIndex].split("postKey=").slice(1).join("postKey="));
  let cursor = postKeyIndex + 1;
  while (cursor < lines.length && !normalizeText(lines[cursor])) cursor += 1;

  const captionLines = [];
  for (; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];
    if (/^\[[^\]]+\]/.test(line)) break;
    captionLines.push(line);
  }
  while (captionLines.length && !normalizeText(captionLines.at(-1))) captionLines.pop();

  const caption = captionLines.join("\n").trim();
  if (!postKey) throw new Error(`Parsed an empty postKey from ${targetConfig.label} dry-run output.`);
  if (!caption) throw new Error(`Unable to parse the caption from ${targetConfig.label} dry-run output.`);

  const configuredScreenshot = path.join(ROOT, targetConfig.screenshotPath);
  const screenshotPath = existsSync(configuredScreenshot) ? configuredScreenshot : "";
  return { postKey, caption, screenshotPath };
}

function getDuplicateStatePath(postKey) {
  const stateDir = normalizeText(process.env.X_DUPLICATE_STATE_DIR) || DEFAULT_DUPLICATE_STATE_DIR;
  const safeKey = postKey.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return path.join(stateDir, `${safeKey}.json`);
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

function normalizeMediaId(value) {
  const candidate = value?.media_id_string ?? value?.media_id ?? value?.data?.id ?? value;
  const mediaId = normalizeText(candidate);
  if (!mediaId) throw new Error("X media upload response did not include a media ID.");
  return mediaId;
}

async function uploadMediaResilient(client, screenshotPath) {
  const errors = [];

  if (typeof client.v2?.uploadMedia === "function") {
    try {
      const response = await client.v2.uploadMedia(screenshotPath, { media_category: "tweet_image" });
      return { mediaId: normalizeMediaId(response), apiVersion: "v2" };
    } catch (error) {
      errors.push(`v2: ${sanitizeLogValue(error instanceof Error ? error.message : error)}`);
    }
  }

  try {
    const response = await client.v1.uploadMedia(screenshotPath, { mimeType: "image/png" });
    return { mediaId: normalizeMediaId(response), apiVersion: "v1.1" };
  } catch (error) {
    errors.push(`v1.1: ${sanitizeLogValue(error instanceof Error ? error.message : error)}`);
  }

  throw new Error(`X media upload failed (${errors.join("; ")}).`);
}

async function publishText(client, caption) {
  const response = await client.v2.tweet(caption);
  const tweetId = normalizeText(response?.data?.id);
  if (!tweetId) throw new Error("X post response did not include a tweet ID.");
  return { tweetId, mediaId: null, mode: "text-only" };
}

async function publishPreparedPost({ client, caption, screenshotPath }) {
  if (!screenshotPath) return publishText(client, caption);

  try {
    const upload = await uploadMediaResilient(client, screenshotPath);
    const response = await client.v2.tweet(caption, { media: { media_ids: [upload.mediaId] } });
    const tweetId = normalizeText(response?.data?.id);
    if (!tweetId) throw new Error("X post response did not include a tweet ID.");
    return { tweetId, mediaId: upload.mediaId, mode: `media-${upload.apiVersion}` };
  } catch (error) {
    console.warn(`[x-post] Media posting failed; retrying once as text-only. ${sanitizeLogValue(error instanceof Error ? error.message : error)}`);
    return publishText(client, caption);
  }
}

function buildReceiptKey(postKey, mode) {
  return mode === "post-text-only" ? `${postKey}-text-only` : postKey;
}

async function main() {
  const { target, mode } = parseCli();
  const targetConfig = TARGETS[target];

  if (mode === "dry-run" || mode === "post-key-only") {
    runLegacy(targetConfig, mode);
    return;
  }

  const account = await verifyExpectedXAccount();
  if (mode === "verify-account") return;

  assertLivePostAllowed();
  const prepared = extractPreparedPost(runLegacy(targetConfig, "dry-run", { capture: true }).stdout, targetConfig);
  const duplicateKey = buildReceiptKey(prepared.postKey, mode);
  const duplicateStatePath = assertNotAlreadyPosted(duplicateKey);

  const published = mode === "post-text-only"
    ? await publishText(account.client, prepared.caption)
    : await publishPreparedPost({ client: account.client, caption: prepared.caption, screenshotPath: prepared.screenshotPath });

  const tweetUrl = `https://x.com/${account.username}/status/${published.tweetId}`;
  savePostReceipt(duplicateStatePath, {
    postKey: duplicateKey,
    target,
    mode: published.mode,
    postedAt: new Date().toISOString(),
    tweetId: published.tweetId,
    tweetUrl,
    mediaId: published.mediaId,
    screenshotPath: prepared.screenshotPath || null,
    authenticatedUsername: account.username,
  });

  console.log(`[x-post] postedTweetId=${published.tweetId}`);
  console.log(`[x-post] postedTweetUrl=${tweetUrl}`);
  console.log(`[x-post] duplicateReceipt=${duplicateStatePath}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    await main();
  } catch (error) {
    console.error(`[x-post] ${sanitizeLogValue(error instanceof Error ? error.message : error)}`);
    process.exitCode = 1;
  }
}

export {
  TARGETS,
  buildReceiptKey,
  extractPreparedPost,
  normalizeMediaId,
  parseCli,
  publishPreparedPost,
  uploadMediaResilient,
  verifyExpectedXAccount,
};
