/**
 * Shared X (Twitter) posting primitives for the edition posters.
 *
 * Ported from the existing production posters
 * (post-mlb-strikeout-props-to-x.mjs, post-mlb-hr-props-to-x.mjs) so both
 * edition adapters call one real implementation instead of two copies. Every
 * function takes its collaborators (client, fs, env) as parameters so this
 * module is unit-testable with a fake client and never has to touch the
 * network to be verified.
 */

export function normalizeUsername(value) {
  return String(value ?? "").trim().replace(/^@/, "").toLowerCase();
}

/** Redacts credentials from a log line. Mirrors both posters' sanitizeLogValue. */
export function sanitizeLogValue(value, secrets = []) {
  let text = String(value);
  for (const secret of secrets) {
    if (secret) text = text.split(secret).join("[redacted]");
  }
  return text
    .replace(/authorization:\s*[^\n\r]+/gi, "authorization: [redacted]")
    .replace(/(oauth_[a-z_]+=)"[^"]+"/gi, '$1"[redacted]"')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]");
}

export function secretsFromEnv(env = process.env) {
  return [env.JKB_X_API_KEY, env.JKB_X_API_SECRET, env.JKB_X_ACCESS_TOKEN, env.JKB_X_ACCESS_SECRET].filter(Boolean);
}

/**
 * Normalizes the raw X_ALLOW_LIVE_POST env value. Trims surrounding
 * whitespace (a repository Variable's value can pick up a trailing
 * newline/space when pasted in the GitHub UI) and compares case-insensitively,
 * so "true", "TRUE", and " true " all enable live posting the same way
 * "false", unset, or any other value does not.
 *
 * `present` distinguishes "the variable resolved to an empty/unset value"
 * from "the variable resolved to something, just not the string true" -- the
 * two most common misconfigurations (kill switch left off vs. the value was
 * set as a Secret instead of a Variable, so `vars.X_ALLOW_LIVE_POST` is
 * always empty) look identical without it.
 */
export function normalizeAllowLivePostFlag(rawValue) {
  const trimmed = typeof rawValue === "string" ? rawValue.trim() : "";
  return { present: trimmed.length > 0, enabled: trimmed.toLowerCase() === "true" };
}

/** Same event/flag gate as both existing posters: workflow_dispatch, schedule, or workflow_run, plus an explicit opt-in. */
export function assertLivePostAllowed({ eventName, allowLivePost, log = () => {} }) {
  if (!["workflow_dispatch", "schedule", "workflow_run"].includes(eventName)) {
    throw new Error(`Live posting is blocked for event "${eventName}".`);
  }
  const flag = normalizeAllowLivePostFlag(allowLivePost);
  // Never logs the raw value -- only whether it was present and how it
  // normalized -- so this is safe to print even though X_ALLOW_LIVE_POST is
  // sourced the same way secrets are (a workflow `env:` entry).
  log(`X_ALLOW_LIVE_POST present=${flag.present} enabled=${flag.enabled}`);
  if (!flag.enabled) {
    throw new Error("Live posting is blocked unless X_ALLOW_LIVE_POST=true is set by the workflow.");
  }
}

/** A missing or zero-byte image must fail loudly before it ever reaches the X API. */
export function assertMediaUsable(imagePath, { existsSync, statSync }) {
  if (!existsSync(imagePath)) throw new Error(`Image file missing before upload: ${imagePath}`);
  const { size } = statSync(imagePath);
  if (size <= 0) throw new Error(`Image file is zero bytes before upload: ${imagePath}`);
}

/**
 * @param {object} env process.env-shaped credential source
 * @param {new (...args) => object} TwitterApiCtor injected so tests never import the real SDK
 */
export function createXClientFromEnv(env, TwitterApiCtor) {
  const { JKB_X_API_KEY, JKB_X_API_SECRET, JKB_X_ACCESS_TOKEN, JKB_X_ACCESS_SECRET } = env;
  if (!JKB_X_API_KEY || !JKB_X_API_SECRET || !JKB_X_ACCESS_TOKEN || !JKB_X_ACCESS_SECRET) {
    throw new Error("Missing JoeKnowsBall X credentials (JKB_X_API_KEY/SECRET, JKB_X_ACCESS_TOKEN/SECRET).");
  }
  return new TwitterApiCtor({ appKey: JKB_X_API_KEY, appSecret: JKB_X_API_SECRET, accessToken: JKB_X_ACCESS_TOKEN, accessSecret: JKB_X_ACCESS_SECRET });
}

/** Never throws: returns {ok, username} so a caller can turn a mismatch into CONFIGURATION_ERROR. */
export async function verifyExpectedXAccount({ client, expectedUsername, log = () => {} }) {
  const expected = normalizeUsername(expectedUsername);
  if (!expected) return { ok: false, username: null, reason: "MISSING_EXPECTED_USERNAME" };
  const account = await client.v1.verifyCredentials();
  const username = normalizeUsername(account?.screen_name);
  if (!username) return { ok: false, username: null, reason: "NO_AUTHENTICATED_USERNAME" };
  if (username !== expected) return { ok: false, username, reason: "ACCOUNT_MISMATCH" };
  log(`Authenticated X account matches expected @${expected}.`);
  return { ok: true, username, reason: null };
}

/**
 * Uploads media and creates the primary post. Mirrors both posters'
 * publishPost, generalized to either market's caption/image pair.
 */
export async function postPrimaryTweet({ client, caption, imagePath, fs, wait = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  assertMediaUsable(imagePath, fs);
  const mediaId = String(await client.v1.uploadMedia(imagePath, { mimeType: "image/png" }));
  await wait(2000);
  const response = await client.v2.tweet(caption, { media: { media_ids: [mediaId] } });
  const postId = String(response?.data?.id ?? "").trim();
  if (!postId) throw new Error("X post response did not include a post ID.");
  return { postId, mediaId };
}

/** Text-only reply threaded onto the primary post. */
export async function postReplyTweet({ client, caption, inReplyTo }) {
  const response = await client.v2.tweet(caption, { reply: { in_reply_to_tweet_id: inReplyTo } });
  const postId = String(response?.data?.id ?? "").trim();
  if (!postId) throw new Error("Reply post response did not include a post ID.");
  return { postId };
}

/** Text-only primary post, for the existing --post-text-only diagnostic mode. */
export async function postPrimaryTextOnly({ client, caption }) {
  const response = await client.v2.tweet(caption);
  const postId = String(response?.data?.id ?? "").trim();
  if (!postId) throw new Error("X text-only post response did not include a post ID.");
  return { postId };
}
