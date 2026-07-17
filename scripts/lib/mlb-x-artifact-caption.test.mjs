/**
 * mlb-x-artifact-caption.test.mjs
 * Run via: node --test scripts/lib/mlb-x-artifact-caption.test.mjs
 *
 * Covers:
 *   - buildHrCaptionFromArtifact stays byte-for-byte unchanged (regression --
 *     this rewrite only touches the K value-post caption)
 *   - buildKCaptionFromArtifact: EXACT approved template for the top-ranked
 *     play only -- no date heading, no remaining rows, no odds, no CTA, no
 *     URL, no hashtags, no question
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

describe("buildKCaptionFromArtifact -- EXACT approved template, top play only", () => {
  it("no confirmed rows -> skipped", () => {
    const result = buildKCaptionFromArtifact({ slateDate: "2026-07-17", rows: [] });
    assert.equal(result.skipped, true);
    assert.equal(result.caption, "");
  });

  it("exact Over example from the approved spec", () => {
    const artifact = {
      slateDate: "2026-07-17",
      rows: [{ rank: 1, pitcher: "Logan Gilbert", team: "SEA", opponent: "HOU", side: "OVER", kLine: 5.5, odds: "-120", projectedKs: 7.1, projectionEdge: 1.6 }],
    };
    const result = buildKCaptionFromArtifact(artifact);
    assert.equal(result.skipped, false);
    assert.equal(
      result.caption,
      ["Logan Gilbert leads today's qualified K value board.", "", "Model projection: 7.1 K", "Market line: 5.5 K", "Recommended side: Over 5.5", "Projection edge: +1.6 K"].join("\n"),
    );
  });

  it("exact Under example from the approved spec", () => {
    const artifact = {
      slateDate: "2026-07-17",
      rows: [{ rank: 1, pitcher: "Jose Berrios", team: "TOR", opponent: "NYY", side: "UNDER", kLine: 5.5, odds: "+105", projectedKs: 4.3, projectionEdge: -1.2 }],
    };
    const result = buildKCaptionFromArtifact(artifact);
    assert.equal(result.skipped, false);
    assert.equal(
      result.caption,
      ["Jose Berrios leads today's qualified K value board.", "", "Model projection: 4.3 K", "Market line: 5.5 K", "Recommended side: Under 5.5", "Projection edge: -1.2 K"].join("\n"),
    );
  });

  it("describes ONLY the top-ranked (rank 1) row -- ignores every other row entirely", () => {
    const artifact = {
      slateDate: "2026-07-17",
      rows: [
        kRow({ rank: 1, pitcher: "First", side: "OVER" }),
        kRow({ rank: 2, pitcher: "Second", team: "NYY", side: "UNDER" }),
        kRow({ rank: 3, pitcher: "Third", team: "LAD", side: "OVER" }),
      ],
    };
    const result = buildKCaptionFromArtifact(artifact);
    assert.equal(result.caption.includes("Second"), false);
    assert.equal(result.caption.includes("Third"), false);
    assert.equal(result.caption.includes("2."), false);
    assert.equal(result.caption.includes("3."), false);
  });

  it("contains no date heading, no odds, no CTA, URL, hashtags, or question mark", () => {
    const artifact = { slateDate: "2026-07-17", rows: [kRow()] };
    const result = buildKCaptionFromArtifact(artifact);
    assert.equal(result.caption.includes("Jul 17"), false);
    assert.equal(result.caption.includes(kRow().odds), false);
    assert.equal(result.caption.includes("?"), false);
    assert.equal(/link in bio/i.test(result.caption), false);
    assert.equal(/#\w/.test(result.caption), false);
    assert.equal(/https?:\/\//i.test(result.caption), false);
    assert.equal(/JoeKnowsBall MLB K Props/i.test(result.caption), false);
  });

  it("uses title case Over/Under, never all caps", () => {
    const overResult = buildKCaptionFromArtifact({ slateDate: "2026-07-17", rows: [kRow({ side: "OVER" })] });
    assert.ok(overResult.caption.includes("Over"));
    assert.equal(overResult.caption.includes("OVER"), false);
    const underResult = buildKCaptionFromArtifact({ slateDate: "2026-07-17", rows: [kRow({ side: "UNDER", projectionEdge: -1.6 })] });
    assert.ok(underResult.caption.includes("Under"));
    assert.equal(underResult.caption.includes("UNDER"), false);
  });

  it("always renders exactly one decimal place for projection, line, and edge, even for whole numbers", () => {
    const artifact = { slateDate: "2026-07-17", rows: [kRow({ projectedKs: 7, kLine: 5, side: "OVER", projectionEdge: 2 })] };
    const result = buildKCaptionFromArtifact(artifact);
    assert.ok(result.caption.includes("Model projection: 7.0 K"));
    assert.ok(result.caption.includes("Market line: 5.0 K"));
    assert.ok(result.caption.includes("Recommended side: Over 5.0"));
    assert.ok(result.caption.includes("Projection edge: +2.0 K"));
  });

  it("stays comfortably within the 280-char budget for the exact template", () => {
    const artifact = { slateDate: "2026-07-17", rows: [kRow()] };
    const result = buildKCaptionFromArtifact(artifact);
    assert.equal(result.skipped, false);
    assert.ok(result.caption.length <= 280, `caption is ${result.caption.length} chars`);
    assert.ok(result.caption.length < 200, `expected comfortably under 280, got ${result.caption.length}`);
  });

  it("captionRows returns the full artifact.rows (data-flow proof for assertArtifactConsistency), not just the described top row", () => {
    const rows = [kRow(), kRow({ rank: 2, pitcher: "Second" })];
    const result = buildKCaptionFromArtifact({ slateDate: "2026-07-17", rows });
    assert.deepEqual(result.captionRows, rows);
  });
});
