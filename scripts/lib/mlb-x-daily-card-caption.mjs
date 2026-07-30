/**
 * Deterministic caption for the combined MLB Daily Model Card X post.
 *
 * Unlike the K/HR edition captions (mlb-k-caption-core.mjs,
 * mlb-x-artifact-caption.mjs), the daily card caption never lists individual
 * players or fits rows against the character budget -- the card image itself
 * carries the home run and strikeout rows. The caption is a fixed template
 * with only the slate date substituted in, so it is always the same length
 * for a given date and there is nothing to select or omit.
 */
import { fitsBudget } from "./mlb-x-caption-budget.mjs";

export const DAILY_CARD_WEBSITE_URL = "https://www.joeknowsball.com/mlb";

const SLATE_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-07-30" -> "July 30, 2026". Title case (not the graphic's all-caps header style) so it reads naturally in a sentence. */
export function formatDailyCardSlateDate(slateDate) {
  const match = SLATE_DATE_PATTERN.exec(String(slateDate ?? ""));
  if (!match) throw new Error(`slateDate must be YYYY-MM-DD (got "${slateDate}")`);
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * @param {object} params
 * @param {string} params.slateDate YYYY-MM-DD
 * @returns {string} caption, guaranteed to fit the X character budget
 */
export function buildDailyCardMorningCaption({ slateDate }) {
  const caption = [
    `⚾ MLB Daily Model Card — ${formatDailyCardSlateDate(slateDate)}`,
    "",
    "Top home run targets and projected strikeout leaders for today’s slate.",
    "",
    "Full MLB models:",
    DAILY_CARD_WEBSITE_URL,
  ].join("\n");
  if (!fitsBudget(caption)) {
    throw new Error(`Daily card morning caption exceeds the X character budget: "${caption}"`);
  }
  return caption;
}
