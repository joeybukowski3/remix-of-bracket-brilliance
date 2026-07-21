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
import { assertEmailSelectionConfirmed, selectNumerologyEmailPlays, selectNumerologyEmailPlaysFromArtifact } from "./lib/mlb-numerology-email-selection.mjs";
import { assertValidNumerologyEmailHtml } from "./lib/mlb-numerology-email-validation.mjs";
import { enrichCardPlaysWithContext } from "./lib/mlb-numerology-player-context.mjs";
import { deliverNumerologyEmail } from "./lib/mlb-numerology-email-delivery.mjs";
import {
  injectRecentTopMatchesHtml,
  injectRecentTopMatchesText,
} from "./lib/mlb-numerology-recent-history.mjs";

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
const EMAIL_SEND_STATE_PATH = path.join(DATA_DIR, "email-send-state.json");

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
    throw new Error(`Missing live numerology board payload at ${NUMEROLOGY_DAILY_PATH}. Ensure public/data/mlb/numerology-daily.json exists or run the MLB numerology data generation workflow first.`);
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

  // Keep the full board and tracking archives unchanged -- only which plays
  // go in the subscriber email changes below. When a shared delivery
  // artifact is provided (the normal automated path -- see
  // plan-mlb-numerology-delivery.mjs / poll-mlb-numerology-delivery.yml),
  // the email uses EXACTLY that artifact's confirmed-lineup selection, so it
  // can never diverge from what the X post uses. Without one, a LIVE send
  // (--send) is refused outright -- the unconfirmed score-threshold
  // fallback below is reachable ONLY for --draft/--preview, and its output
  // is explicitly labeled emailSelectionPolicy.confirmationStatus =
  // "unconfirmed-preview" so it can never be silently mistaken for a
  // confirmed selection by a later step (see sendEmail's own re-check).
  const artifactPath = process.env.NUMEROLOGY_SELECTION_ARTIFACT_PATH;
  if (shouldSend && !artifactPath) {
    throw new Error(
      "Live email send requires NUMEROLOGY_SELECTION_ARTIFACT_PATH (a confirmed-lineup selection artifact from plan-mlb-numerology-delivery.mjs). " +
        "Refusing to send from the unconfirmed score-threshold fallback -- only --draft/--preview may use it.",
    );
  }
  const selectedEmailCard = artifactPath
    ? selectNumerologyEmailPlaysFromArtifact(card, loadJsonSafe(artifactPath, null))
    : selectNumerologyEmailPlays(card);
  if (!artifactPath) {
    console.warn("[mlb-numerology] UNCONFIRMED PREVIEW: no NUMEROLOGY_SELECTION_ARTIFACT_PATH provided; using the score-threshold fallback. This selection is NOT eligible for live delivery.");
  }
  const emailCard = await enrichCardPlaysWithContext(selectedEmailCard);
  const html = injectRecentTopMatchesHtml(renderEmailHtml(emailCard, summary), performance);
  const text = injectRecentTopMatchesText(renderEmailText(emailCard, summary), performance);
  const validation = assertValidNumerologyEmailHtml(html, emailCard);
  ensureDirForFile(EMAIL_HTML_PATH);
  fs.writeFileSync(EMAIL_HTML_PATH, html);
  fs.writeFileSync(EMAIL_TEXT_PATH, `${text}\n`);

  console.log(`[mlb-numerology] Generated card for ${card.date}`);
  console.log(`[mlb-numerology] Top play: ${emailCard.topPlay ? `${emailCard.topPlay.player} (${emailCard.topPlay.numerologyScore})` : "none"}`);
  console.log(`[mlb-numerology] Email selection: ${emailCard.emailSelectionPolicy?.mode ?? "unknown"}; selected=${emailCard.emailSelectedPlays.length}; above65=${emailCard.emailSelectionPolicy?.aboveThresholdCount ?? 0}`);
  console.log(`[mlb-numerology] Email validation passed: summary=${validation.summaryCount}; details=${validation.detailedCount}`);
  console.log(`[mlb-numerology] Email preview written to ${EMAIL_TEXT_PATH}`);

  if (shouldSend) {
    await sendEmail({ card: emailCard, html, text });
  } else if (shouldDraft) {
    console.log("[mlb-numerology] Draft/preview mode only. No live email sent.");
  }
}

async function sendEmail({ card, html, text }) {
  // Defense-in-depth re-check, independent of the earlier shouldSend/
  // artifactPath gate above -- sendEmail must never dispatch an unconfirmed
  // selection even if some future call site reaches it a different way.
  assertEmailSelectionConfirmed(card.emailSelectionPolicy);

  assertValidNumerologyEmailHtml(html, card);

  if (!sendGateEnabled) {
    throw new Error("Live send blocked. Set NUMEROLOGY_EMAIL_LIVE=true and pass --send to send.");
  }

  const webhookUrl = process.env.NUMEROLOGY_EMAIL_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error("Live send requested but NUMEROLOGY_EMAIL_WEBHOOK_URL is not configured.");
  }

  const result = await deliverNumerologyEmail({
    card,
    html,
    text,
    webhookUrl,
    webhookToken: process.env.NUMEROLOGY_EMAIL_WEBHOOK_TOKEN,
    receiptPath: EMAIL_SEND_STATE_PATH,
    fetchImpl: fetch,
  });

  console.log(`[mlb-numerology] Delivery status=${result.status}; receipt recorded for ${card.date}.`);
  return result;
}

main().catch((error) => {
  console.error(`[mlb-numerology] ${error.stack || error.message}`);
  process.exitCode = 1;
});
