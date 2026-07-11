import { describe, expect, it } from "vitest";
import { buildHrCaptionFromArtifact, buildKCaptionFromArtifact } from "../../../scripts/lib/mlb-x-artifact-caption.mjs";
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

describe("buildKCaptionFromArtifact", () => {
  it("uses the favored side + side-correct odds from the artifact", () => {
    const artifact = buildKArtifact({
      slateDate: "2026-07-12",
      snapshot,
      selectionStatus: "READY_CONFIRMED_SELECTIONS",
      selectedRows: [
        { pitcher: "Tarik Skubal", team: "DET", opponent: "PHI", direction: "over", kLine: 7.5, oddsOver: "-120", oddsUnder: "+100", projectedKs: 9.3, projectionEdge: 1.8, pitcherId: 1, gameId: 10 },
        { pitcher: "Zack Wheeler", team: "PHI", opponent: "DET", direction: "under", kLine: 6.5, oddsOver: "-110", oddsUnder: "-105", projectedKs: 4.9, projectionEdge: -1.6, pitcherId: 2, gameId: 10 },
      ],
    });
    const result = buildKCaptionFromArtifact(artifact);
    expect(result.skipped).toBe(false);
    // Side-correct odds: OVER uses oddsOver (-120), UNDER uses oddsUnder (-105).
    expect(result.caption).toContain("Tarik Skubal");
    expect(result.caption).toContain("Zack Wheeler");
    expect(result.caption).toContain("OVER");
    expect(result.caption).toContain("UNDER");
    expect(result.caption).toContain("-120");
    expect(result.caption).toContain("-105");
    expect(result.caption).not.toContain("+100"); // the non-favored OVER-row under price never appears
    expect(result.captionRows).toBe(artifact.rows);
  });
});
