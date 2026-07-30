/**
 * mlb-x-daily-card-publication.test.mjs
 * Run via: node --test scripts/lib/mlb-x-daily-card-publication.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertCardPublishable,
  DAILY_CARD_MORNING_TARGET,
  dailyCardReceiptKeyFor,
  parseCardGenerationResult,
} from "./mlb-x-daily-card-publication.mjs";

const SLATE = "2026-07-21";
const okResult = (overrides = {}) => ({
  cardType: "mlb_daily", edition: "morning", slateDate: SLATE,
  preview: false, publishReady: true, pngPath: "/tmp/mlb-daily-morning.png",
  ...overrides,
});
const alwaysExists = () => true;
const neverExists = () => false;

describe("dailyCardReceiptKeyFor", () => {
  it("builds a stable key for the daily card morning target", () => {
    assert.equal(dailyCardReceiptKeyFor({ slateDate: SLATE }), `mlb-${DAILY_CARD_MORNING_TARGET}-${SLATE}`);
  });

  it("rejects a malformed slate date", () => {
    assert.throws(() => dailyCardReceiptKeyFor({ slateDate: "7/21/26" }), /slate date/i);
  });

  it("keeps slates separate", () => {
    assert.notEqual(dailyCardReceiptKeyFor({ slateDate: SLATE }), dailyCardReceiptKeyFor({ slateDate: "2026-07-22" }));
  });
});

describe("parseCardGenerationResult", () => {
  it("parses a valid JSON result", () => {
    const parsed = parseCardGenerationResult(JSON.stringify(okResult()));
    assert.equal(parsed.ok, true);
    assert.equal(parsed.result.publishReady, true);
  });

  it("treats empty stdout as a blocked generation, never a crash", () => {
    assert.deepEqual(parseCardGenerationResult(""), { ok: false, reason: "CARD_GENERATION_EMPTY_OUTPUT" });
    assert.deepEqual(parseCardGenerationResult("   \n  "), { ok: false, reason: "CARD_GENERATION_EMPTY_OUTPUT" });
    assert.deepEqual(parseCardGenerationResult(undefined), { ok: false, reason: "CARD_GENERATION_EMPTY_OUTPUT" });
  });

  it("treats unparsable stdout as blocked, never throws", () => {
    assert.deepEqual(parseCardGenerationResult("{ not json"), { ok: false, reason: "CARD_GENERATION_OUTPUT_NOT_JSON" });
    assert.deepEqual(parseCardGenerationResult("null"), { ok: false, reason: "CARD_GENERATION_OUTPUT_NOT_JSON" });
    assert.deepEqual(parseCardGenerationResult("42"), { ok: false, reason: "CARD_GENERATION_OUTPUT_NOT_JSON" });
  });
});

describe("assertCardPublishable", () => {
  it("accepts a valid, publish-ready, non-preview result with an existing PNG", () => {
    const verdict = assertCardPublishable({ result: okResult(), slateDate: SLATE, edition: "morning", fileExists: alwaysExists });
    assert.deepEqual(verdict, { ok: true });
  });

  it("rejects a preview card even if publishReady happens to be true", () => {
    const verdict = assertCardPublishable({ result: okResult({ preview: true }), slateDate: SLATE, edition: "morning", fileExists: alwaysExists });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reason, "CARD_IS_PREVIEW");
  });

  it("rejects a card that is not publish-ready", () => {
    const verdict = assertCardPublishable({ result: okResult({ publishReady: false }), slateDate: SLATE, edition: "morning", fileExists: alwaysExists });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reason, "CARD_NOT_PUBLISH_READY");
  });

  it("rejects a missing PNG even when the result claims publishReady", () => {
    const verdict = assertCardPublishable({ result: okResult(), slateDate: SLATE, edition: "morning", fileExists: neverExists });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reason, "CARD_PNG_MISSING");
  });

  it("rejects a missing pngPath field outright, never falling back to a guessed path", () => {
    const verdict = assertCardPublishable({ result: okResult({ pngPath: undefined }), slateDate: SLATE, edition: "morning", fileExists: alwaysExists });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reason, "CARD_PNG_MISSING");
  });

  it("rejects an edition mismatch", () => {
    const verdict = assertCardPublishable({ result: okResult({ edition: "confirmed" }), slateDate: SLATE, edition: "morning", fileExists: alwaysExists });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reason, "CARD_EDITION_MISMATCH");
  });

  it("rejects a slate-date mismatch between the CLI arg and the generation result", () => {
    const verdict = assertCardPublishable({ result: okResult({ slateDate: "2026-07-22" }), slateDate: SLATE, edition: "morning", fileExists: alwaysExists });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reason, "CARD_SLATE_DATE_MISMATCH");
  });
});
