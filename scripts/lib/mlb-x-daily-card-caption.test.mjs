/**
 * mlb-x-daily-card-caption.test.mjs
 * Run via: node --test scripts/lib/mlb-x-daily-card-caption.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fitsBudget } from "./mlb-x-caption-budget.mjs";
import { buildDailyCardMorningCaption, DAILY_CARD_WEBSITE_URL, formatDailyCardSlateDate } from "./mlb-x-daily-card-caption.mjs";

describe("formatDailyCardSlateDate", () => {
  it("formats YYYY-MM-DD as a readable date", () => {
    assert.equal(formatDailyCardSlateDate("2026-07-30"), "July 30, 2026");
  });

  it("rejects a malformed slate date", () => {
    assert.throws(() => formatDailyCardSlateDate("7/30/2026"), /YYYY-MM-DD/);
    assert.throws(() => formatDailyCardSlateDate(""), /YYYY-MM-DD/);
    assert.throws(() => formatDailyCardSlateDate(undefined), /YYYY-MM-DD/);
  });
});

describe("buildDailyCardMorningCaption", () => {
  it("is deterministic for the same slate date", () => {
    const first = buildDailyCardMorningCaption({ slateDate: "2026-07-30" });
    const second = buildDailyCardMorningCaption({ slateDate: "2026-07-30" });
    assert.equal(first, second);
  });

  it("differs only by the formatted date across slates", () => {
    const a = buildDailyCardMorningCaption({ slateDate: "2026-07-30" });
    const b = buildDailyCardMorningCaption({ slateDate: "2026-08-01" });
    assert.notEqual(a, b);
    assert.match(a, /July 30, 2026/);
    assert.match(b, /August 1, 2026/);
  });

  it("contains the required elements without listing individual players", () => {
    const caption = buildDailyCardMorningCaption({ slateDate: "2026-07-30" });
    assert.match(caption, /MLB Daily Model Card/);
    assert.ok(caption.includes(DAILY_CARD_WEBSITE_URL));
    assert.match(caption, /home run/i);
    assert.match(caption, /strikeout/i);
  });

  it("always fits the X character budget", () => {
    const caption = buildDailyCardMorningCaption({ slateDate: "2026-12-31" });
    assert.ok(fitsBudget(caption), `caption exceeds budget: ${caption}`);
  });
});
