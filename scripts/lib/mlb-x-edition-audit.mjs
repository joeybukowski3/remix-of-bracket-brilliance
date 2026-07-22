/**
 * End-of-window audit for MLB X editions. Never posts.
 *
 * On 2026-07-21 every workflow run reported success while the slate published
 * nothing: four editions missed, zero signal. This turns a slate's four
 * receipts into an explicit report, and distinguishes a technical miss (worth
 * failing a job over) from a legitimate one (nothing to post).
 */
import { listEditionTargets } from "./mlb-x-edition-receipts.mjs";
import {
  CONFIRMED_WINDOW_CLOSE_MINUTES,
  easternParts,
  MORNING_WINDOW_CLOSE_ET,
} from "./mlb-x-edition-readiness.mjs";

/**
 * Statuses that mean the pipeline broke, as opposed to having nothing to say.
 * Single source of truth for "is this a real failure" -- reused by
 * mlb-x-edition-diagnostics.mjs's technicalFailure flag, so the audit's
 * exit-code policy and the persisted diagnostic's failure flag can never
 * disagree about which outcomes are technical.
 */
export const TECHNICAL_MISS_STATUSES = Object.freeze([
  "IMAGE_FAILED",
  "X_API_FAILED",
  "CONFIGURATION_ERROR",
  "ROW_MISMATCH",
  "STATE_PERSISTENCE_FAILED",
]);

/** Statuses that are legitimate reasons not to have posted. */
export const BENIGN_MISS_STATUSES = Object.freeze([
  "NO_GAMES",
  "NO_VALID_PICKS",
  "INVALID_SLATE",
  "NOT_DUE",
  "MISSED_WINDOW",
  "WAITING_FOR_SELECTED_LINEUPS",
]);

const MS_PER_MINUTE = 60_000;

function morningWindowClosed(now, timeZone) {
  const et = easternParts(now, timeZone);
  return et.minutesOfDay > MORNING_WINDOW_CLOSE_ET.hour * 60 + MORNING_WINDOW_CLOSE_ET.minute;
}

function confirmedWindowClosed(now, firstGameTime) {
  if (!firstGameTime) return true;
  const first = Date.parse(firstGameTime);
  if (!Number.isFinite(first)) return true;
  return Date.parse(now) > first - CONFIRMED_WINDOW_CLOSE_MINUTES * MS_PER_MINUTE;
}

/**
 * @param {object} params
 * @param {Function} params.readReceipt ({slateDate, market, edition}) -> receipt|null
 * @param {Function} [params.readDiagnostic] ({market, edition, slateDate}) -> {latestOutcome, reason}|null
 *        matches the rolling diagnostic record shape from mlb-x-edition-diagnostics.mjs
 */
export function auditSlate({
  slateDate,
  now,
  firstGameTime = null,
  readReceipt,
  readDiagnostic = () => null,
  timeZone = "America/New_York",
}) {
  const editions = listEditionTargets(slateDate).map(({ market, edition, key }) => {
    const receipt = readReceipt({ slateDate, market, edition });
    const postId = receipt?.primaryPostId ?? receipt?.postId ?? null;
    const posted = Boolean(postId && String(postId).trim());
    const diagnostic = posted ? null : readDiagnostic({ market, edition, slateDate });
    const windowClosed = edition === "morning"
      ? morningWindowClosed(now, timeZone)
      : confirmedWindowClosed(now, firstGameTime);

    const status = posted ? "POSTED" : diagnostic?.latestOutcome ?? "MISSING";
    return {
      key, market, edition, posted,
      postId: posted ? String(postId).trim() : null,
      replyStatus: receipt?.replyStatus ?? null,
      replyPostId: receipt?.replyPostId ?? null,
      status,
      reason: posted ? null : diagnostic?.reason ?? diagnostic?.latestOutcome ?? "no receipt and no diagnostic recorded",
      windowClosed,
      // Only a closed window makes a missing edition a real miss; an open one
      // may still publish.
      missed: !posted && windowClosed,
      technical: !posted && windowClosed && TECHNICAL_MISS_STATUSES.includes(status),
    };
  });

  const missed = editions.filter((e) => e.missed);
  const technicalMisses = editions.filter((e) => e.technical);
  return {
    slateDate,
    postedCount: editions.filter((e) => e.posted).length,
    editions,
    missed,
    technicalMisses,
    // Nonzero only for technical misses: a slate with no games or no valid
    // picks published nothing correctly and must not page anyone.
    exitCode: technicalMisses.length > 0 ? 1 : 0,
  };
}

/** GitHub Actions job summary (Markdown). */
export function renderAuditSummary(report) {
  const rows = report.editions.map((e) => {
    const state = e.posted ? "✅ posted" : e.missed ? "❌ missed" : "⏳ window open";
    const detail = e.posted ? `\`${e.postId}\`${e.replyStatus && e.replyStatus !== "NOT_REQUESTED" ? ` (reply ${e.replyStatus})` : ""}` : e.reason;
    return `| ${e.market.toUpperCase()} | ${e.edition} | ${state} | ${detail} | ${e.windowClosed ? "closed" : "open"} |`;
  });
  return [
    `## MLB X editions — ${report.slateDate}`,
    "",
    `**${report.postedCount} of 4 published.**`,
    "",
    "| Market | Edition | State | Post ID / reason | Window |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
    report.technicalMisses.length
      ? `**${report.technicalMisses.length} technical miss(es):** ${report.technicalMisses.map((e) => `${e.key} (${e.status})`).join(", ")}`
      : report.missed.length
        ? `${report.missed.length} edition(s) missed for benign reasons.`
        : "No missed editions.",
    "",
  ].join("\n");
}

/** `::warning::` annotations, one per missed edition. */
export function renderAuditAnnotations(report) {
  return report.missed.map((e) =>
    `::warning title=MLB X edition missing::${e.key} did not publish (${e.status}): ${e.reason}`);
}
