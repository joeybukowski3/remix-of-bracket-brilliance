/**
 * Validates the combined MLB Daily Model Card's generation result before it
 * is ever allowed to reach the X posting layer.
 *
 * scripts/generate-social-card-live.ts is used entirely unmodified: on
 * success it prints exactly one JSON object to stdout (the return value of
 * writeSocialCard -- see scripts/lib/social-cards/write-social-card.mjs),
 * and on a blocked/failed generation it exits non-zero and prints a
 * readiness/diagnostics report to stderr, never stdout. The workflow step
 * captures that stdout to a file; this module is the sole authority on
 * whether the resulting card is safe to post, so the CLI script never has to
 * re-derive publish-readiness itself.
 *
 * Deliberately conservative: any parse failure, edition/slate-date
 * disagreement, preview flag, publishReady !== true, or missing PNG on disk
 * is a hard "do not post" -- there is no partial-credit path here, matching
 * "never post a preview card" and "never post when generation is blocked".
 */

export const DAILY_CARD_MORNING_TARGET = "daily-card-morning";

const SLATE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** `mlb-{target}-{slateDate}`, e.g. mlb-daily-card-morning-2026-07-21. Mirrors buildEditionReceiptKey's shape for the k/hr editions. */
export function dailyCardReceiptKeyFor({ slateDate, target = DAILY_CARD_MORNING_TARGET }) {
  if (!SLATE_DATE_PATTERN.test(String(slateDate ?? ""))) {
    throw new Error(`Malformed slate date "${slateDate}" (expected YYYY-MM-DD).`);
  }
  return `mlb-${target}-${slateDate}`;
}

/**
 * Parses the captured stdout of one generate-social-card-live.ts invocation.
 * @returns {{ok: true, result: object} | {ok: false, reason: string}}
 */
export function parseCardGenerationResult(rawStdout) {
  const trimmed = String(rawStdout ?? "").trim();
  if (!trimmed) {
    return { ok: false, reason: "CARD_GENERATION_EMPTY_OUTPUT" };
  }
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, reason: "CARD_GENERATION_OUTPUT_NOT_JSON" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "CARD_GENERATION_OUTPUT_NOT_JSON" };
  }
  return { ok: true, result: parsed };
}

/**
 * @param {object} params
 * @param {object} params.result parsed generation result (writeSocialCard's return value)
 * @param {string} params.slateDate the planner's resolved slate date (never recomputed here)
 * @param {string} params.edition expected edition, "morning" for this publication target
 * @param {(path: string) => boolean} params.fileExists injected for testability
 * @returns {{ok: true} | {ok: false, reason: string, detail?: object}}
 */
export function assertCardPublishable({ result, slateDate, edition, fileExists }) {
  if (!result || typeof result !== "object") {
    return { ok: false, reason: "CARD_GENERATION_OUTPUT_NOT_JSON" };
  }
  if (result.edition !== edition) {
    return { ok: false, reason: "CARD_EDITION_MISMATCH", detail: { expected: edition, actual: result.edition ?? null } };
  }
  if (result.slateDate !== slateDate) {
    return { ok: false, reason: "CARD_SLATE_DATE_MISMATCH", detail: { expected: slateDate, actual: result.slateDate ?? null } };
  }
  // preview is checked independently of publishReady: normalizeMorning always
  // sets publishReady:true, but a defensive caller (or a future edition) must
  // never post a card generated with --preview regardless of that flag.
  if (result.preview === true) {
    return { ok: false, reason: "CARD_IS_PREVIEW" };
  }
  if (result.publishReady !== true) {
    return { ok: false, reason: "CARD_NOT_PUBLISH_READY" };
  }
  if (typeof result.pngPath !== "string" || !result.pngPath || !fileExists(result.pngPath)) {
    return { ok: false, reason: "CARD_PNG_MISSING", detail: { pngPath: result.pngPath ?? null } };
  }
  return { ok: true };
}
