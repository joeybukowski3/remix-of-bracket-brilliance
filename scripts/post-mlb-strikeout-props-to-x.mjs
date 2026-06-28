import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import {
  assertLivePostAllowed, assertNotAlreadyPosted, createPostKey, formatDateLabel,
  formatPropLine, isAmericanOdds, isGenerationReady, logScreenshotSize,
  normalizeTeam, normalizeText, parseMode, pollUntilReady, publishPost,
  publishTextOnlyPost, savePostReceipt, toFiniteNumber, verifyExpectedXAccount,
} from "./lib/x-social-post-utils.mjs";

const PREFIX = "mlb-strikeout-props-x";
const ROOT = process.cwd();
const RAW_PATH = path.join(ROOT, "public/data/mlb/hr-props-raw.json");
const PROD_RAW = "https://www.joeknowsball.com/data/mlb/hr-props-raw.json";
const PAGE_URL = process.env.SOCIAL_PAGE_URL || "https://www.joeknowsball.com/mlb";
const EXPORT_SELECTOR = '[data-x-export="mlb-k-social"]';
const ROW_SELECTOR = "[data-k-row]";
const SCREENSHOT_PATH = path.join(ROOT, "artifacts/mlb-strikeout-props-x.png");
const STATE_DIR = path.join(ROOT, "artifacts/x-post-state");

function usage() { return "Usage: node scripts/post-mlb-strikeout-props-to-x.mjs --dry-run|--post|--post-text-only|--verify-account|--post-key-only"; }
function validPitcherOdds(row) { return Boolean(formatPropLine(row?.kLine) && isAmericanOdds(row?.kOddsOver)); }
async function productionRaw() {
  const response = await fetch(`${PROD_RAW}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load production K data: HTTP ${response.status}`);
  return response.json();
}
async function waitForProduction(expected) {
  return pollUntilReady({ label: PREFIX, expected: { date: expected.date, generatedAt: expected.generatedAt }, loadObserved: productionRaw,
    validate: (observed) => { const count = (observed?.pitchers ?? []).filter(validPitcherOdds).length; return { ready: count >= 3, detail: `pitchersWithLineAndOver=${count}` }; } });
}
async function loadTable(page) {
  await page.goto(PAGE_URL, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  const tab = page.getByRole("button", { name: /K Props/i }).first();
  await tab.scrollIntoViewIfNeeded(); await tab.click();
  const target = page.locator(EXPORT_SELECTOR).first();
  await target.waitFor({ state: "visible", timeout: 15000 }); await page.waitForTimeout(1000);
  await target.locator(ROW_SELECTOR).first().waitFor({ state: "visible", timeout: 15000 });
  const meta = await target.evaluate((el) => ({ date: el.getAttribute("data-k-date") || "", generatedAt: el.getAttribute("data-k-generated-at") || "" }));
  const values = await target.locator(ROW_SELECTOR).evaluateAll((els) => els.map((el) => ({
    pitcher: el.getAttribute("data-k-pitcher") || "", team: el.getAttribute("data-k-team") || "", opponent: el.getAttribute("data-k-opponent") || "",
    score: el.getAttribute("data-k-score") || "", kRate: el.getAttribute("data-k-rate") || "", whiffRate: el.getAttribute("data-k-whiff-rate") || "",
    oppRate: el.getAttribute("data-k-opp-rate") || "", line: el.getAttribute("data-k-line") || "", oddsOver: el.getAttribute("data-k-odds-over") || "",
    oddsUnder: el.getAttribute("data-k-odds-under") || "", bookmaker: el.getAttribute("data-k-bookmaker") || "",
  })));
  const rows = [];
  for (const value of values) {
    const combined = normalizeText(value.oddsOver).match(/^([0-9]+(?:\.[0-9]+)?)\s+Ks\s+\(([+-]\d+)\)$/i);
    const row = { pitcher: normalizeText(value.pitcher), team: normalizeTeam(value.team), opponent: normalizeTeam(value.opponent),
      strikeoutScore: toFiniteNumber(value.score), kRate: toFiniteNumber(value.kRate), whiffRate: toFiniteNumber(value.whiffRate), oppRate: toFiniteNumber(value.oppRate),
      line: toFiniteNumber(value.line || combined?.[1]), oddsOver: isAmericanOdds(combined?.[2] || value.oddsOver) ? normalizeText(combined?.[2] || value.oddsOver) : null,
      oddsUnder: isAmericanOdds(value.oddsUnder) ? normalizeText(value.oddsUnder) : null, bookmaker: normalizeText(value.bookmaker) || null };
    if (row.pitcher && !rows.some((candidate) => candidate.pitcher === row.pitcher && candidate.team === row.team)) rows.push(row);
  }
  return { target, meta, rows };
}
export function validateKRows(rows) {
  if (rows.length < 3) return `Only ${rows.length} K prop rows are available.`;
  for (const [index, row] of rows.slice(0, 3).entries()) {
    if (!row.pitcher || !row.team) return `Top ${index + 1} pitcher or team is missing.`;
    if (!Number.isFinite(row.strikeoutScore)) return `Top ${index + 1} score is invalid.`;
    if (!formatPropLine(row.line)) return `Top ${index + 1} strikeout line is missing.`;
    if (!isAmericanOdds(row.oddsOver)) return `Top ${index + 1} over price is missing.`;
  }
  return "";
}
function full(row, index) { return `${index + 1}. ${row.pitcher} (${row.team}) — Over ${formatPropLine(row.line)} Ks (${row.oddsOver}) · Score ${row.strikeoutScore.toFixed(1)}`; }
function compact(row, index) { return `${index + 1}. ${row.pitcher} ${row.team} — O ${formatPropLine(row.line)} (${row.oddsOver}) · ${row.strikeoutScore.toFixed(1)}`; }
export function buildCaption({ date, rows }) {
  const error = validateKRows(rows);
  if (error) return { skipped: true, reason: error, caption: "", topProps: [] };
  const topProps = rows.slice(0, 3); const label = formatDateLabel(date);
  const candidates = [
    [`JoeKnowsBall MLB K Props - ${label}`, "", "Top edges:", ...topProps.map(full), "", "Free Access to Full Table at Link in Bio", "", "#MLB #MLBPicks #Strikeouts #MLBBetting"],
    [`MLB K Props - ${label}`, "", ...topProps.map(compact), "", "Full table: link in bio", "#MLB #Strikeouts"],
    [`MLB K Props ${label}`, ...topProps.map(compact), "Full table: link in bio"],
  ].map((lines) => lines.join("\n"));
  const caption = candidates.find((value) => value.length <= 280);
  return caption ? { skipped: false, reason: "", caption, topProps }
    : { skipped: true, reason: "Unable to stay under 280 characters while retaining K line and over price.", caption: "", topProps: [] };
}
async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) { console.log(usage()); return; }
  const mode = parseMode(process.argv.slice(2));
  if (mode === "verify-account") { await verifyExpectedXAccount(PREFIX); return; }
  const expected = JSON.parse(readFileSync(RAW_PATH, "utf8"));
  if (["post", "post-text-only"].includes(mode)) {
    assertLivePostAllowed();
    const ready = await waitForProduction(expected);
    if (!ready.ready) { console.warn(`[${PREFIX}] SAFE SKIP: production remained stale or lacked K lines after ${ready.attempts} attempts.`); return; }
  }
  mkdirSync(path.dirname(SCREENSHOT_PATH), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1400 }, deviceScaleFactor: 1 });
    const table = await loadTable(page);
    if (["post", "post-text-only"].includes(mode) && !isGenerationReady(table.meta, { date: expected.date, generatedAt: expected.generatedAt })) {
      console.warn(`[${PREFIX}] SAFE SKIP: live table metadata is stale. expected=${expected.date}/${expected.generatedAt} observed=${table.meta.date}/${table.meta.generatedAt}`); return;
    }
    const result = buildCaption({ date: table.meta.date || expected.date, rows: table.rows });
    if (result.skipped) { console.warn(`[${PREFIX}] SAFE SKIP: ${result.reason}`); return; }
    const postKey = createPostKey("mlb-k-props", { slateDate: table.meta.date || expected.date, top: result.topProps.map((row) => ({ pitcher: row.pitcher, team: row.team, score: row.strikeoutScore, line: row.line, oddsOver: row.oddsOver })) });
    if (mode === "post-key-only") { console.log(postKey); return; }
    await table.target.screenshot({ path: SCREENSHOT_PATH, animations: "disabled" });
    logScreenshotSize(SCREENSHOT_PATH, PREFIX); console.log(result.caption);
    if (mode === "dry-run") return;
    const account = await verifyExpectedXAccount(PREFIX);
    const duplicateKey = mode === "post-text-only" ? `${postKey}-text-only` : postKey;
    const statePath = assertNotAlreadyPosted(duplicateKey, STATE_DIR);
    const receipt = mode === "post-text-only" ? await publishTextOnlyPost(account.client, result.caption, PREFIX) : await publishPost(account.client, result.caption, SCREENSHOT_PATH, PREFIX);
    savePostReceipt(statePath, { ...receipt, postKey: duplicateKey, postedAt: new Date().toISOString() });
  } finally { await browser.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(`[${PREFIX}] ${error?.stack ?? error}`); process.exitCode = 1; });
