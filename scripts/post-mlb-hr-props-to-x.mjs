import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import {
  assertLivePostAllowed, assertNotAlreadyPosted, createPostKey, formatDateLabel,
  isAmericanOdds, logScreenshotSize, normalizeTeam, normalizeText, parseMode,
  pollUntilReady, publishPost, publishTextOnlyPost, savePostReceipt,
  toFiniteNumber, verifyExpectedXAccount,
} from "./lib/x-social-post-utils.mjs";

const PREFIX = "mlb-hr-props-x";
const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public/data/mlb");
const RAW_PATH = path.join(DATA_DIR, "hr-props-raw.json");
const BEST_PATH = path.join(DATA_DIR, "hr-props-best-bets.json");
const PROD = "https://www.joeknowsball.com/data/mlb";
const GITHUB = "https://raw.githubusercontent.com/joeybukowski3/remix-of-bracket-brilliance/main/public/data/mlb";
const PAGE_URL = process.env.SOCIAL_PAGE_URL || "https://www.joeknowsball.com/mlb";
const EXPORT_SELECTOR = '[data-x-export="mlb-hr-social"]';
const SCREENSHOT_PATH = path.join(ROOT, "artifacts/mlb-hr-props-x.png");
const STATE_DIR = path.join(ROOT, "artifacts/x-post-state");

function usage() {
  return "Usage: node scripts/post-mlb-hr-props-to-x.mjs --dry-run|--post|--post-text-only|--verify-account|--post-key-only";
}
function sourceName() {
  const value = normalizeText(process.env.HR_PROPS_DATA_SOURCE).toLowerCase() || "production";
  if (!["production", "github", "local"].includes(value)) throw new Error(`Invalid HR_PROPS_DATA_SOURCE=${value}`);
  return value;
}
function locations(source) {
  if (source === "local") return { raw: RAW_PATH, best: BEST_PATH };
  const base = source === "github" ? GITHUB : PROD;
  return { raw: `${base}/hr-props-raw.json`, best: `${base}/hr-props-best-bets.json` };
}
async function loadJson(location, source = "production") {
  if (source === "local") return JSON.parse(readFileSync(location, "utf8"));
  const response = await fetch(`${location}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load ${location}: HTTP ${response.status}`);
  return response.json();
}
function key(row) { return `${normalizeText(row?.player)}|${normalizeTeam(row?.team)}|${normalizeTeam(row?.opponent)}`; }
function placeholder(value) { return ["", "TBD", "TBA", "TO BE ANNOUNCED", "TO BE DETERMINED"].includes(normalizeText(value).toUpperCase()); }
function normalizeBatter(value) {
  const player = normalizeText(value?.player);
  const team = normalizeTeam(value?.team);
  const opponent = normalizeTeam(value?.opponent);
  const hrScore = toFiniteNumber(value?.hrScore);
  const hrScoreRank = toFiniteNumber(value?.hrScoreRank);
  if (!player || !team || !opponent || hrScore == null || hrScoreRank == null) return null;
  return { player, team, opponent, opposingPitcher: normalizeText(value?.opposingPitcher) || "TBD", hrScore, hrScoreRank,
    hrOddsYes: isAmericanOdds(value?.hrOddsYes) ? normalizeText(value.hrOddsYes) : null,
    hrOddsBook: normalizeText(value?.hrOddsBook) || null };
}
export function getTopHrProps(raw, best, limit = 3) {
  const batters = Array.isArray(raw?.batters) ? raw.batters.map(normalizeBatter).filter(Boolean) : [];
  const lookup = new Map(batters.map((row) => [key(row), row]));
  const curated = Array.isArray(best?.bestBets) ? best.bestBets : [];
  const selected = curated.map((row) => lookup.get(key(row))).filter((row) => row && !placeholder(row.opposingPitcher));
  if (selected.length >= limit) return selected.slice(0, limit);
  return batters.filter((row) => !placeholder(row.opposingPitcher)).sort((a, b) => b.hrScore - a.hrScore || a.hrScoreRank - b.hrScoreRank).slice(0, limit);
}
function compact(row, index) { return `${index + 1}. ${row.player} ${row.team} — HR ${row.hrScore.toFixed(1)} | ${row.hrOddsYes || "N/A"}`; }
export function buildCaption(raw, best) {
  const topProps = getTopHrProps(raw, best);
  if (topProps.length < 3) return { skipped: true, reason: `Only ${topProps.length} valid HR props are available.`, caption: "", topProps: [] };
  const date = formatDateLabel(raw?.date || best?.date);
  const full = topProps.map((row, i) => `${i + 1}. ${row.player} (${row.team}) - HR Score ${row.hrScore.toFixed(1)} (${row.hrOddsYes || "N/A"})`);
  const candidates = [
    [`JoeKnowsBall MLB HR Props - ${date}`, "", "Top model edges:", ...full, "", "Free Access to Full Table at Link in Bio", "", "#MLB #MLBPicks #HomeRun #PropBets #MLBBetting"],
    [`MLB HR Props - ${date}`, "", ...topProps.map(compact), "", "Full table: link in bio", "#MLB #HomeRun"],
    [`MLB HR Props ${date}`, ...topProps.map(compact), "Full table: link in bio"],
  ].map((lines) => lines.join("\n"));
  const caption = candidates.find((value) => value.length <= 280);
  return caption ? { skipped: false, reason: "", caption, topProps }
    : { skipped: true, reason: "Unable to stay under 280 characters while retaining HR odds.", caption: "", topProps: [] };
}
async function waitForProduction(expected) {
  return pollUntilReady({ label: PREFIX, expected: { date: expected.date, generatedAt: expected.generatedAt },
    loadObserved: async () => { const [raw, best] = await Promise.all([loadJson(`${PROD}/hr-props-raw.json`), loadJson(`${PROD}/hr-props-best-bets.json`)]); return { ...raw, best }; },
    validate: (observed) => { const top = getTopHrProps(observed, observed.best); return { ready: top.length >= 3 && top.every((row) => isAmericanOdds(row.hrOddsYes)), detail: `topOdds=${top.filter((row) => row.hrOddsYes).length}` }; } });
}
async function renderedTable(page) {
  await page.goto(PAGE_URL, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  const tab = page.getByRole("button", { name: /HR Props/i }).first();
  await tab.scrollIntoViewIfNeeded(); await tab.click();
  const target = page.locator(EXPORT_SELECTOR).first();
  await target.waitFor({ state: "visible", timeout: 15000 }); await page.waitForTimeout(1000);
  await target.locator("[data-hr-row]").first().waitFor({ state: "visible", timeout: 15000 });
  const rows = await target.locator("[data-hr-row]").evaluateAll((els) => els.map((el) => ({ player: el.getAttribute("data-hr-player") || "", team: el.getAttribute("data-hr-team") || "", odds: el.getAttribute("data-hr-odds") || "" })));
  return { target, rows };
}
function renderedMatches(rows, top) {
  const unique = [];
  for (const row of rows) if (row.player && !unique.some((item) => item.player === row.player && item.team === row.team)) unique.push(row);
  const visible = unique.slice(0, 3);
  return visible.length === 3 && visible.every((row, i) => row.player === top[i].player && row.team === top[i].team && isAmericanOdds(row.odds));
}
async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) { console.log(usage()); return; }
  const mode = parseMode(process.argv.slice(2));
  if (mode === "verify-account") { await verifyExpectedXAccount(PREFIX); return; }
  const source = sourceName();
  if (["post", "post-text-only"].includes(mode) && source !== "production") throw new Error("Live posting requires production data.");
  const localRaw = JSON.parse(readFileSync(RAW_PATH, "utf8"));
  if (["post", "post-text-only"].includes(mode)) {
    assertLivePostAllowed();
    const ready = await waitForProduction(localRaw);
    if (!ready.ready) { console.warn(`[${PREFIX}] SAFE SKIP: production remained stale or lacked HR odds after ${ready.attempts} attempts.`); return; }
  }
  const paths = locations(source);
  const [raw, best] = await Promise.all([loadJson(paths.raw, source), loadJson(paths.best, source)]);
  const result = buildCaption(raw, best);
  if (result.skipped) { console.warn(`[${PREFIX}] SAFE SKIP: ${result.reason}`); return; }
  const postKey = createPostKey("mlb-hr-props", { slateDate: raw.date, top: result.topProps.map((row) => ({ player: row.player, team: row.team, score: row.hrScore, odds: row.hrOddsYes })) });
  if (mode === "post-key-only") { console.log(postKey); return; }
  mkdirSync(path.dirname(SCREENSHOT_PATH), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1400 }, deviceScaleFactor: 1 });
    const table = await renderedTable(page);
    if (!renderedMatches(table.rows, result.topProps)) { console.warn(`[${PREFIX}] SAFE SKIP: screenshot rows, caption rows, or HR odds did not match.`); return; }
    await table.target.screenshot({ path: SCREENSHOT_PATH, animations: "disabled" });
    logScreenshotSize(SCREENSHOT_PATH, PREFIX);
  } finally { await browser.close(); }
  console.log(result.caption);
  if (mode === "dry-run") return;
  const account = await verifyExpectedXAccount(PREFIX);
  const duplicateKey = mode === "post-text-only" ? `${postKey}-text-only` : postKey;
  const statePath = assertNotAlreadyPosted(duplicateKey, STATE_DIR);
  const receipt = mode === "post-text-only" ? await publishTextOnlyPost(account.client, result.caption, PREFIX) : await publishPost(account.client, result.caption, SCREENSHOT_PATH, PREFIX);
  savePostReceipt(statePath, { ...receipt, postKey: duplicateKey, postedAt: new Date().toISOString() });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(`[${PREFIX}] ${error?.stack ?? error}`); process.exitCode = 1; });
