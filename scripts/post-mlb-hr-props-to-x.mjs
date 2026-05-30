import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { TwitterApi } from "twitter-api-v2";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const RAW_DATA_PATH = path.join(DATA_DIR, "hr-props-raw.json");
const BEST_BETS_PATH = path.join(DATA_DIR, "hr-props-best-bets.json");
const PRODUCTION_BASE_URL = "https://www.joeknowsball.com/data/mlb";
const GITHUB_BASE_URL = "https://raw.githubusercontent.com/joeybukowski3/remix-of-bracket-brilliance/main/public/data/mlb";
const HR_PROPS_URL = "https://www.joeknowsball.com/mlb/hr-props";
const args = new Set(process.argv.slice(2));

function usage() {
  return [
    "Usage: node scripts/post-mlb-hr-props-to-x.mjs --dry-run",
    "       node scripts/post-mlb-hr-props-to-x.mjs --post",
    "       node scripts/post-mlb-hr-props-to-x.mjs --verify-account",
    "",
    "--dry-run  Build and print the X caption without posting.",
    "--post     Build the caption and validate X client setup, but do not post yet.",
    "--verify-account  Verify configured X credentials and expected username without building a caption.",
    "",
    "Set HR_PROPS_DATA_SOURCE to production, github, or local.",
    "Default: production in GitHub Actions, local otherwise.",
    "Set X_EXPECTED_USERNAME to the exact X username that is allowed to post.",
  ].join("\n");
}

function getMode() {
  const dryRun = args.has("--dry-run");
  const post = args.has("--post");
  const verifyAccount = args.has("--verify-account");
  const modes = [dryRun, post, verifyAccount].filter(Boolean).length;
  if (modes > 1) throw new Error("Choose only one mode: --dry-run, --post, or --verify-account.");
  if (!modes) return "dry-run";
  if (verifyAccount) return "verify-account";
  return post ? "post" : "dry-run";
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getDataSource() {
  const value = normalizeText(process.env.HR_PROPS_DATA_SOURCE).toLowerCase();
  const source = value || (process.env.GITHUB_ACTIONS ? "production" : "local");
  if (!["production", "github", "local"].includes(source)) {
    throw new Error(`Invalid HR_PROPS_DATA_SOURCE="${source}". Expected production, github, or local.`);
  }
  return source;
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

function formatDateLabel(dateValue) {
  const raw = normalizeText(dateValue);
  if (!raw) return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function buildCaption(rawPayload, bestBetsPayload) {
  const freshnessError = validateFreshness(rawPayload, bestBetsPayload);
  if (freshnessError) return { skipped: true, reason: freshnessError, caption: "" };

  const topProps = getTopHrProps(rawPayload, bestBetsPayload);
  const topPropsError = validateTopProps(topProps);
  if (topPropsError) return { skipped: true, reason: topPropsError, caption: "" };

  const dateLabel = formatDateLabel(rawPayload?.date || bestBetsPayload?.date);
  const lines = topProps.map((row, index) => (
    `${index + 1}. ${row.player} (${row.team}) - HR Score ${row.hrScore.toFixed(1)}`
  ));

  const caption = [
    `JoeKnowsBall MLB HR Props - ${dateLabel}`,
    "",
    "Top model edges:",
    ...lines,
    "",
    `Full table: ${HR_PROPS_URL}`,
    "#MLB #MLBPicks",
  ].join("\n");

  return { skipped: false, reason: "", caption };
}

function createXClientFromEnv() {
  const appKey = process.env.X_API_KEY;
  const appSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_SECRET;

  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    throw new Error("Missing X credentials. Expected X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, and X_ACCESS_SECRET.");
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
  return { username, name, id };
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

  const source = getDataSource();
  const locations = getDataLocations(source);
  const rawPayload = await loadJson(locations.raw, source);
  const bestBetsPayload = await loadJson(locations.bestBets, source);
  const result = buildCaption(rawPayload, bestBetsPayload);

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
  console.log("");
  console.log(result.caption);

  if (mode === "post") {
    await verifyExpectedXAccount();
    console.log("");
    console.log("[mlb-hr-props-x] X account verified. Live posting is intentionally disabled for this first pass.");
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
