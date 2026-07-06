import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  buildDailyNumerologyCard,
  buildTrackingRecordsFromCard,
  ensureDirForFile,
  getTodayEt,
  loadJsonSafe,
  mergePerformanceRecords,
  renderEmailHtml,
  renderEmailText,
  summarizePerformance,
  writeJson,
} from "./lib/mlb-numerology-tracking.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb", "numerology");
const NUMEROLOGY_DAILY_PATH = path.join(ROOT, "public", "data", "mlb", "numerology-daily.json");
const HR_RAW_PATH = path.join(ROOT, "public", "data", "mlb", "hr-props-raw.json");
const DAILY_CARD_PATH = path.join(DATA_DIR, "daily-card.json");
const ARCHIVE_DIR = path.join(DATA_DIR, "archive");
const PERFORMANCE_PATH = path.join(DATA_DIR, "performance.json");
const PERFORMANCE_SUMMARY_PATH = path.join(DATA_DIR, "performance-summary.json");
const EMAIL_HTML_PATH = path.join(DATA_DIR, "email-preview.html");
const EMAIL_TEXT_PATH = path.join(DATA_DIR, "email-preview.txt");

function getArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

const requestedDate = getArgValue("--date") || getTodayEt();
const shouldSend = process.argv.includes("--send");
const shouldDraft = process.argv.includes("--draft") || process.argv.includes("--preview") || !shouldSend;
const sendGateEnabled = process.env.NUMEROLOGY_EMAIL_LIVE === "true";

async function main() {
  const numerologyPayload = loadJsonSafe(NUMEROLOGY_DAILY_PATH, null);
  if (!numerologyPayload) {
    throw new Error(`Missing live numerology board payload at ${NUMEROLOGY_DAILY_PATH}. Run npm run mlb:numerology first.`);
  }
  const hrPayload = loadJsonSafe(HR_RAW_PATH, null);

  const card = buildDailyNumerologyCard(numerologyPayload, { date: requestedDate, hrPayload });
  const archivePath = path.join(ARCHIVE_DIR, `${card.date}.json`);
  writeJson(DAILY_CARD_PATH, card);
  writeJson(archivePath, card);

  const existingPerformance = loadJsonSafe(PERFORMANCE_PATH, { records: [] });
  const pendingRecords = buildTrackingRecordsFromCard(card);
  const performance = mergePerformanceRecords(existingPerformance, pendingRecords);
  const summary = summarizePerformance(performance, card.date);
  writeJson(PERFORMANCE_PATH, performance);
  writeJson(PERFORMANCE_SUMMARY_PATH, summary);

  const html = renderEmailHtml(card, summary);
  const text = renderEmailText(card, summary);
  ensureDirForFile(EMAIL_HTML_PATH);
  fs.writeFileSync(EMAIL_HTML_PATH, html);
  fs.writeFileSync(EMAIL_TEXT_PATH, `${text}\n`);

  console.log(`[mlb-numerology] Generated card for ${card.date}`);
  console.log(`[mlb-numerology] Top play: ${card.topPlay ? `${card.topPlay.player} (${card.topPlay.numerologyScore})` : "none"}`);
  console.log(`[mlb-numerology] Plays over ${card.scoreThreshold}: ${card.allQualifiedPlaysOver50.length}`);
  console.log(`[mlb-numerology] Email preview written to ${EMAIL_TEXT_PATH}`);

  if (shouldSend) {
    await sendEmail({ card, html, text });
  } else if (shouldDraft) {
    console.log("[mlb-numerology] Draft/preview mode only. No live email sent.");
  }
}

async function sendEmail({ card, html, text }) {
  if (!sendGateEnabled) {
    throw new Error("Live send blocked. Set NUMEROLOGY_EMAIL_LIVE=true and pass --send to send.");
  }

  const webhookUrl = process.env.NUMEROLOGY_EMAIL_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error("Live send requested but NUMEROLOGY_EMAIL_WEBHOOK_URL is not configured.");
  }

  const payload = {
    subject: `MLB Numerology Plays — ${card.date}`,
    html,
    text,
    date: card.date,
    topPlay: card.topPlay,
    qualifiedCount: card.allQualifiedPlaysOver50.length,
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.NUMEROLOGY_EMAIL_WEBHOOK_TOKEN
        ? { Authorization: `Bearer ${process.env.NUMEROLOGY_EMAIL_WEBHOOK_TOKEN}` }
        : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Email webhook failed ${response.status}: ${body.slice(0, 500)}`);
  }

  console.log("[mlb-numerology] Live email webhook sent.");
}

main().catch((error) => {
  console.error(`[mlb-numerology] ${error.stack || error.message}`);
  process.exitCode = 1;
});
