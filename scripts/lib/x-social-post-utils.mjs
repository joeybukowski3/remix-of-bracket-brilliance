import { createHash } from "node:crypto";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TwitterApi } from "twitter-api-v2";

export const normalizeText = (value) => typeof value === "string" ? value.trim() : "";
export const normalizeTeam = (value) => normalizeText(value).toUpperCase();
export const normalizeUsername = (value) => normalizeText(value).replace(/^@/, "").toLowerCase();
export const toFiniteNumber = (value) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };
export const getTodayEt = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export const formatDateLabel = (value) => { const raw = normalizeText(value); if (!raw) return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }); const date = new Date(`${raw}T00:00:00`); return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString("en-US", { month: "short", day: "numeric" }); };
export const isAmericanOdds = (value) => /^[+-]\d+$/.test(normalizeText(value));
export const formatPropLine = (value) => { const number = toFiniteNumber(value); if (number == null || number <= 0) return ""; return Number.isInteger(number) ? number.toFixed(0) : String(number); };

export function parseMode(args, defaultMode = "dry-run") {
  const flags = new Set(args); const modes = ["dry-run", "post", "post-text-only", "verify-account", "post-key-only"]; const selected = modes.filter((mode) => flags.has(`--${mode}`));
  if (selected.length > 1) throw new Error(`Choose only one mode: ${modes.map((mode) => `--${mode}`).join(", ")}.`);
  return selected[0] ?? defaultMode;
}
export function assertLivePostAllowed() {
  const eventName = process.env.GITHUB_EVENT_NAME ?? "";
  if (!["workflow_dispatch", "schedule", "workflow_run"].includes(eventName)) throw new Error(`Live posting is blocked for event ${eventName}.`);
  if (process.env.X_ALLOW_LIVE_POST !== "true") throw new Error("Live posting is blocked unless X_ALLOW_LIVE_POST=true.");
}
function createXClientFromEnv() {
  const { JKB_X_API_KEY: appKey, JKB_X_API_SECRET: appSecret, JKB_X_ACCESS_TOKEN: accessToken, JKB_X_ACCESS_SECRET: accessSecret } = process.env;
  if (!appKey || !appSecret || !accessToken || !accessSecret) throw new Error("Missing JoeKnowsBall X credentials.");
  return new TwitterApi({ appKey, appSecret, accessToken, accessSecret });
}
export async function verifyExpectedXAccount(prefix) {
  const expected = normalizeUsername(process.env.X_EXPECTED_USERNAME); if (!expected) throw new Error("Missing X_EXPECTED_USERNAME.");
  const client = createXClientFromEnv(); const account = await client.v1.verifyCredentials(); const username = normalizeUsername(account?.screen_name);
  if (!username) throw new Error("Authenticated X username was missing.");
  console.log(`[${prefix}] Authenticated X account: @${username}`);
  if (username !== expected) throw new Error(`Authenticated X username @${username} does not match expected @${expected}.`);
  return { client, username, id: normalizeText(account?.id_str ?? account?.id) };
}
export function createPostKey(prefix, payload) { const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16); return `${prefix}-${payload.slateDate || "unknown"}-${hash}`; }
export function getDuplicateStatePath(postKey, fallbackDir) { const stateDir = normalizeText(process.env.X_DUPLICATE_STATE_DIR) || fallbackDir; return path.join(stateDir, `${postKey.replace(/[^a-zA-Z0-9._-]+/g, "-")}.json`); }
export function assertNotAlreadyPosted(postKey, fallbackDir) { const statePath = getDuplicateStatePath(postKey, fallbackDir); if (existsSync(statePath)) throw new Error(`Duplicate protection blocked posting: ${postKey}.`); return statePath; }
export function savePostReceipt(statePath, receipt) { mkdirSync(path.dirname(statePath), { recursive: true }); writeFileSync(statePath, `${JSON.stringify(receipt, null, 2)}\n`); }
export async function publishPost(client, caption, screenshotPath, prefix) { const mediaId = String(await client.v1.uploadMedia(screenshotPath, { mimeType: "image/png" })); await new Promise((resolve) => setTimeout(resolve, 2000)); const response = await client.v2.tweet(caption, { media: { media_ids: [mediaId] } }); const tweetId = normalizeText(response?.data?.id); if (!tweetId) throw new Error("X post response did not include a tweet ID."); const tweetUrl = `https://x.com/_joeknowsball_/status/${tweetId}`; console.log(`[${prefix}] postedTweetUrl=${tweetUrl}`); return { tweetId, tweetUrl, mediaId }; }
export async function publishTextOnlyPost(client, caption, prefix) { const response = await client.v2.tweet(caption); const tweetId = normalizeText(response?.data?.id); if (!tweetId) throw new Error("X text-only post response did not include a tweet ID."); const tweetUrl = `https://x.com/_joeknowsball_/status/${tweetId}`; console.log(`[${prefix}] postedTweetUrl=${tweetUrl}`); return { tweetId, tweetUrl }; }
export function logScreenshotSize(filePath, prefix) { const size = statSync(filePath).size; console.log(`[${prefix}] screenshotSize=${(size / 1_048_576).toFixed(2)} MB`); if (size > 4_900_000) console.warn(`[${prefix}] screenshot is close to X's 5 MB limit.`); }
export function isGenerationReady(observed, expected) { const expectedDate = normalizeText(expected?.date); const observedDate = normalizeText(observed?.date); const expectedTime = Date.parse(expected?.generatedAt ?? ""); const observedTime = Date.parse(observed?.generatedAt ?? ""); return Boolean(expectedDate && observedDate === expectedDate && Number.isFinite(expectedTime) && Number.isFinite(observedTime) && observedTime >= expectedTime); }
export async function pollUntilReady({ label, loadObserved, expected, validate, timeoutMs = Number(process.env.SOCIAL_POST_READINESS_TIMEOUT_MS) || 240000, intervalMs = Number(process.env.SOCIAL_POST_READINESS_INTERVAL_MS) || 15000 }) {
  const started = Date.now(); let attempts = 0; let last = null;
  while (Date.now() - started <= timeoutMs) {
    attempts += 1;
    try { const observed = await loadObserved(); last = observed; const generationReady = isGenerationReady(observed, expected); const validation = validate ? validate(observed) : { ready: true, detail: "" }; console.log(`[${label}] readiness attempt=${attempts} expectedDate=${expected.date} observedDate=${observed?.date || "missing"} expectedGeneratedAt=${expected.generatedAt || "missing"} observedGeneratedAt=${observed?.generatedAt || "missing"} dataReady=${validation.ready}`); if (generationReady && validation.ready) return { ready: true, attempts, observed, detail: validation.detail ?? "" }; } catch (error) { console.warn(`[${label}] readiness attempt=${attempts} failed: ${error.message}`); }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return { ready: false, attempts, observed: last, detail: "timeout" };
}
