import { describe, expect, it } from "vitest";
import { buildHrCaptionFromArtifact, buildKCaptionFromArtifact, K_VALUE_REPLY_CAPTION } from "../../../scripts/lib/mlb-x-artifact-caption.mjs";
import { buildHrArtifact, buildKArtifact } from "../../../scripts/lib/mlb-x-selection-artifact.mjs";

const snapshot = { ok: true, asOf: "2026-07-12T15:00:00Z", timing: { earliestGameTime: "2026-07-12T17:00:00Z", minutesUntilFirstPitch: 75, phase: "PREFERRED" } };

describe("buildHrCaptionFromArtifact", () => {
  it("builds a caption whose rows are exactly the artifact rows in order", () => {
    const artifact = buildHrArtifact({
      slateDate: "2026-07-12",
      snapshot,
      selectionStatus: "READY_CONFIRMED_SELECTIONS",
      selectedRows: [
        { player: "Kyle Schwarber", team: "PHI", opponent: "DET", battingOrder: 1, hrScore: 38.9, hrOddsYes: "+320", playerId: 1, gameId: 10 },
        { player: "Vlad Guerrero Jr.", team: "TOR", opponent: "TB", battingOrder: 3, hrScore: 36.5, hrOddsYes: "+350", playerId: 2, gameId: 11 },
      ],
    });
    const result = buildHrCaptionFromArtifact(artifact);
    expect(result.skipped).toBe(false);
    expect(result.captionRows).toBe(artifact.rows);
    expect(result.caption).toContain("Kyle Schwarber");
    expect(result.caption).toContain("Vlad Guerrero Jr.");
    // order preserved
    expect(result.caption.indexOf("Schwarber")).toBeLessThan(result.caption.indexOf("Guerrero"));
  });

  it("skips when there are no rows", () => {
    const artifact = buildHrArtifact({ slateDate: "2026-07-12", snapshot, selectionStatus: "SKIPPED_NO_CONFIRMED_SELECTIONS", selectedRows: [] });
    expect(buildHrCaptionFromArtifact(artifact).skipped).toBe(true);
  });
});

describe("buildKCaptionFromArtifact -- EXACT approved template, top play only", () => {
  it("exact Over example, built through the real artifact pipeline", () => {
    const artifact = buildKArtifact({
      slateDate: "2026-07-12",
      snapshot,
      selectionStatus: "READY_CONFIRMED_SELECTIONS",
      selectedRows: [{ pitcher: "Logan Gilbert", team: "SEA", opponent: "HOU", kLine: 5.5, oddsOver: "-120", oddsUnder: "+100", projectedKs: 7.1, pitcherId: 1, gameId: 10 }],
    });
    const result = buildKCaptionFromArtifact(artifact);
    expect(result.skipped).toBe(false);
    expect(result.caption).toBe(
      ["Logan Gilbert leads today's qualified K value board.", "", "Model projection: 7.1 K", "Market line: 5.5 K", "Recommended side: Over 5.5", "Projection edge: +1.6 K"].join("\n"),
    );
  });

  it("exact Under example, built through the real artifact pipeline", () => {
    const artifact = buildKArtifact({
      slateDate: "2026-07-12",
      snapshot,
      selectionStatus: "READY_CONFIRMED_SELECTIONS",
      selectedRows: [{ pitcher: "Jose Berrios", team: "TOR", opponent: "NYY", kLine: 5.5, oddsOver: "-110", oddsUnder: "+105", projectedKs: 4.3, pitcherId: 2, gameId: 11 }],
    });
    const result = buildKCaptionFromArtifact(artifact);
    expect(result.skipped).toBe(false);
    expect(result.caption).toBe(
      ["Jose Berrios leads today's qualified K value board.", "", "Model projection: 4.3 K", "Market line: 5.5 K", "Recommended side: Under 5.5", "Projection edge: -1.2 K"].join("\n"),
    );
  });

  it("describes only the top-ranked play -- a second artifact row never appears in the caption", () => {
    const artifact = buildKArtifact({
      slateDate: "2026-07-12",
      snapshot,
      selectionStatus: "READY_CONFIRMED_SELECTIONS",
      selectedRows: [
        { pitcher: "Tarik Skubal", team: "DET", opponent: "PHI", kLine: 7.5, oddsOver: "-120", oddsUnder: "+100", projectedKs: 9.3, pitcherId: 1, gameId: 10 },
        { pitcher: "Zack Wheeler", team: "PHI", opponent: "DET", kLine: 6.5, oddsOver: "-110", oddsUnder: "-105", projectedKs: 4.9, pitcherId: 2, gameId: 10 },
      ],
    });
    const result = buildKCaptionFromArtifact(artifact);
    expect(result.caption).toContain("Tarik Skubal");
    expect(result.caption).not.toContain("Zack Wheeler");
    expect(result.captionRows).toBe(artifact.rows); // still the full artifact (data-flow proof), not just the top row
  });

  it("contains no CTA/URL/hashtags/question, and uses title case Over/Under (not all caps)", () => {
    const artifact = buildKArtifact({
      slateDate: "2026-07-12",
      snapshot,
      selectionStatus: "READY_CONFIRMED_SELECTIONS",
      selectedRows: [{ pitcher: "Tarik Skubal", team: "DET", opponent: "PHI", kLine: 7.5, oddsOver: "-120", oddsUnder: "+100", projectedKs: 9.3, pitcherId: 1, gameId: 10 }],
    });
    const result = buildKCaptionFromArtifact(artifact);
    expect(result.caption).toContain("Over");
    expect(result.caption).not.toContain("OVER");
    expect(result.caption).not.toMatch(/link in bio/i);
    expect(result.caption).not.toMatch(/#\w/);
    expect(result.caption).not.toMatch(/https?:\/\//i);
    expect(result.caption).not.toContain("?");
  });
});

describe("K_VALUE_REPLY_CAPTION", () => {
  it("matches the approved static self-reply copy exactly", () => {
    expect(K_VALUE_REPLY_CAPTION).toBe("Full table and custom models are FREE at JoeKnowsBall. Link in bio.\n\n#MLB #StrikeoutProps #MLBPicks #SportsAnalytics");
    expect(K_VALUE_REPLY_CAPTION.length).toBeLessThanOrEqual(280);
  });
});
