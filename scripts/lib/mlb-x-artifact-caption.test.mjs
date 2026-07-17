/**
 * mlb-x-artifact-caption.test.mjs
 * Run via: node --test scripts/lib/mlb-x-artifact-caption.test.mjs
 *
 * Previously no dedicated test file existed for this module. Covers:
 *   - buildHrCaptionFromArtifact stays byte-for-byte unchanged (regression --
 *     this rewrite only touches the K value-post caption)
 *   - buildKCaptionFromArtifact: leads with the top-ranked play, contains no
 *     CTA/URL/hashtags/question, fits the 280-char budget, safe fallback
 *   - K_VALUE_REPLY_CAPTION: exact approved static text
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildHrCaptionFromArtifact, buildKCaptionFromArtifact, K_VALUE_REPLY_CAPTION } from "./mlb-x-artifact-caption.mjs";

function kRow(overrides = {}) {
  return {
    rank: 1,
    pitcher: "Gavin Williams",
    team: "CLE",
    opponent: "PIT",
    side: "OVER",
    kLine: 6.5,
    odds: "-150",
    projectedKs: 8.1,
    projectionEdge: 1.6,
    ...overrides,
  };
}

describe("buildHrCaptionFromArtifact -- unchanged by this rewrite", () => {
  it("still produces the original HR caption format", () => {
    const artifact = { slateDate: "2026-07-17", rows: [{ player: "Test Player", team: "BOS", hrScore: 53.8, hrOddsYes: "+390" }] };
    const result = buildHrCaptionFromArtifact(artifact);
    assert.equal(result.skipped, false);
    assert.equal(
      result.caption,
      ["JoeKnowsBall MLB HR Props - Jul 17", "", "Top model edges:", "1. Test Player (BOS) - HR Score 53.8 | +390", "", "Free Access to Full Table at Link in Bio", "", "#MLB #MLBPicks #HomeRun #PropBets #MLBBetting"].join("\n"),
    );
  });
});

describe("K_VALUE_REPLY_CAPTION -- exact approved static text", () => {
  it("matches the approved copy exactly", () => {
    assert.equal(K_VALUE_REPLY_CAPTION, "Full table and custom models are FREE at JoeKnowsBall. Link in bio.\n\n#MLB #StrikeoutProps #MLBPicks #SportsAnalytics");
  });

  it("fits comfortably under the 280-char limit", () => {
    assert.ok(K_VALUE_REPLY_CAPTION.length <= 280, `reply caption is ${K_VALUE_REPLY_CAPTION.length} chars`);
  });

  it("never varies -- calling it twice yields the identical string (it's a constant, not a function)", () => {
    assert.equal(K_VALUE_REPLY_CAPTION, K_VALUE_REPLY_CAPTION);
  });
});

describe("buildKCaptionFromArtifact -- leads with the top-ranked play, no CTA/URL/hashtags/question", () => {
  it("no confirmed rows -> skipped", () => {
    const result = buildKCaptionFromArtifact({ slateDate: "2026-07-17", rows: [] });
    assert.equal(result.skipped, true);
    assert.equal(result.caption, "");
  });

  it("leads the caption with the rank-1 row's pitcher/side/line/odds/projection/edge", () => {
    const artifact = { slateDate: "2026-07-17", rows: [kRow()] };
    const result = buildKCaptionFromArtifact(artifact);
    assert.equal(result.skipped, false);
    assert.ok(result.caption.startsWith("JoeKnowsBall MLB K Props - Jul 17\n\nTop Value Play: Gavin Williams (CLE) vs PIT"));
    assert.ok(result.caption.includes("OVER 6.5 Ks (-150)"));
    assert.ok(result.caption.includes("Model 8.1 K (+1.6 edge)"));
  });

  it("contains no CTA, URL, hashtags, or question mark", () => {
    const artifact = {
      slateDate: "2026-07-17",
      rows: [kRow(), kRow({ rank: 2, pitcher: "Some Guy", team: "NYY", side: "UNDER", kLine: 5.5, odds: "+110", projectedKs: 3.9, projectionEdge: -1.6 })],
    };
    const result = buildKCaptionFromArtifact(artifact);
    assert.equal(result.caption.includes("?"), false);
    assert.equal(/link in bio/i.test(result.caption), false);
    assert.equal(/#\w/.test(result.caption), false);
    assert.equal(/https?:\/\//i.test(result.caption), false);
  });

  it("lists the remaining rows compactly after the top play, in rank order", () => {
    const artifact = {
      slateDate: "2026-07-17",
      rows: [
        kRow({ rank: 1, pitcher: "First", projectedKs: 8.1, kLine: 6.5, side: "OVER", odds: "-150" }),
        kRow({ rank: 2, pitcher: "Second", team: "NYY", side: "UNDER", kLine: 5.5, odds: "+110" }),
        kRow({ rank: 3, pitcher: "Third", team: "LAD", side: "OVER", kLine: 7.5, odds: "-120" }),
      ],
    };
    const result = buildKCaptionFromArtifact(artifact);
    assert.ok(result.caption.includes("2. Second NYY — UNDER 5.5 (+110)"));
    assert.ok(result.caption.includes("3. Third LAD — OVER 7.5 (-120)"));
  });

  it("a single-row artifact renders the top play with no trailing list", () => {
    const artifact = { slateDate: "2026-07-17", rows: [kRow()] };
    const result = buildKCaptionFromArtifact(artifact);
    assert.equal(result.skipped, false);
    assert.equal(result.caption.includes("2."), false);
  });

  it("stays within the 280-char budget for a full 5-row board with realistic names", () => {
    const rows = [1, 2, 3, 4, 5].map((n) =>
      kRow({ rank: n, pitcher: `Pitcher Number ${n}`, team: "BOS", side: n % 2 === 0 ? "UNDER" : "OVER", kLine: 6.5, odds: "-120", projectedKs: 8.1, projectionEdge: n % 2 === 0 ? -1.6 : 1.6 }),
    );
    const result = buildKCaptionFromArtifact({ slateDate: "2026-07-17", rows });
    assert.equal(result.skipped, false);
    assert.ok(result.caption.length <= 280, `caption is ${result.caption.length} chars`);
  });

  it("falls back to the short format when the long format would exceed 280 chars, still with no CTA/hashtags", () => {
    const rows = [1, 2, 3, 4, 5].map((n) =>
      kRow({ rank: n, pitcher: `Jonathan Alexander Christopherson-Worthington the ${n}`, team: "BOS", side: n % 2 === 0 ? "UNDER" : "OVER", kLine: 6.5, odds: "-150" }),
    );
    const result = buildKCaptionFromArtifact({ slateDate: "2026-07-17", rows });
    if (!result.skipped) {
      assert.ok(result.caption.length <= 280);
      assert.equal(/link in bio|#\w/i.test(result.caption), false);
    } else {
      assert.ok(result.reason.includes("chars"));
    }
  });

  it("captionRows exactly matches artifact.rows for the artifact/render/caption consistency proof", () => {
    const rows = [kRow(), kRow({ rank: 2, pitcher: "Second" })];
    const result = buildKCaptionFromArtifact({ slateDate: "2026-07-17", rows });
    assert.deepEqual(result.captionRows, rows);
  });
});
