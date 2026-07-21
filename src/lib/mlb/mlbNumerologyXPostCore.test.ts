import { describe, expect, it } from "vitest";
import {
  assertLivePostConfirmed,
  buildCaption,
  buildPlayCardSummary,
  buildSignalChips,
  buildXPostPreview,
  buildXPostPreviewFromArtifact,
  describeSignalChip,
  validatePreviewReady,
} from "../../../scripts/lib/mlb-numerology-x-post-core.mjs";
import { buildNumerologyArtifact } from "../../../scripts/lib/mlb-x-selection-artifact.mjs";

function makePlay(overrides: Record<string, unknown> = {}) {
  return {
    player: "Spencer Torkelson",
    team: "det",
    opponent: "ath",
    numerologyScore: 72,
    modelRating: 51,
    matchType: "Exact Match",
    numerologySignals: [
      { field: "age", label: "Age 26", matched: true },
      { field: "birthDay", label: "Born on day 26", matched: true },
    ],
    ...overrides,
  };
}

function makeCard(overrides: Record<string, unknown> = {}) {
  return {
    date: "2026-07-09",
    scoreThreshold: 50,
    livePageUrl: "https://www.joeknowsball.com/mlb/numerology",
    dailyProfile: {
      universalDayCompound: 26,
      universalDayRoot: 8,
      primaryFamily: [2, 5, 8],
      secondaryFamily: [3, 6, 9],
      balancingComplement: 2,
      countercurrent: 1,
    },
    allQualifiedPlaysOver50: [],
    ...overrides,
  };
}

describe("mlb-numerology-x-post-core", () => {
  describe("describeSignalChip", () => {
    it("maps a known field to its casual category label", () => {
      expect(describeSignalChip({ field: "birthDay", label: "Born on day 26" })).toBe("Birth Day Alignment — Born on day 26");
      expect(describeSignalChip({ field: "age", label: "Age 26" })).toBe("Age Match — Age 26");
      expect(describeSignalChip({ field: "jersey", label: "Jersey #23" })).toBe("Jersey Match — Jersey #23");
    });

    it("falls back to a generic label for an unrecognized field instead of inventing a category", () => {
      expect(describeSignalChip({ field: "somethingNew", label: "Custom 7" })).toBe("Numerology Match — Custom 7");
    });

    it("omits the dash separator when there is no label or detail text at all", () => {
      expect(describeSignalChip({ field: "age" })).toBe("Age Match");
    });
  });

  describe("buildSignalChips", () => {
    it("returns up to `limit` chips in order", () => {
      const play = makePlay();
      expect(buildSignalChips(play, 1)).toEqual(["Age Match — Age 26"]);
      expect(buildSignalChips(play, 5)).toHaveLength(2);
    });

    it("returns an empty array when there are no signals, never fabricating one", () => {
      expect(buildSignalChips(makePlay({ numerologySignals: [] }))).toEqual([]);
      expect(buildSignalChips(makePlay({ numerologySignals: undefined }))).toEqual([]);
    });
  });

  describe("buildPlayCardSummary", () => {
    it("normalizes team codes to uppercase and rounds scores", () => {
      const summary = buildPlayCardSummary(makePlay({ numerologyScore: 71.6, modelRating: 50.4 }));
      expect(summary).toMatchObject({ player: "Spencer Torkelson", team: "DET", opponent: "ATH", matchup: "DET vs ATH" });
      expect(summary?.numerologyScore).toBe(72);
      expect(summary?.modelRating).toBe(50);
    });

    it("returns null for a null play instead of a fabricated placeholder card", () => {
      expect(buildPlayCardSummary(null)).toBeNull();
    });
  });

  describe("buildXPostPreview", () => {
    it("selects the top 3 qualifying plays and puts the rest in othersOver50", () => {
      const plays = [
        makePlay({ player: "P1", numerologyScore: 90 }),
        makePlay({ player: "P2", numerologyScore: 80 }),
        makePlay({ player: "P3", numerologyScore: 70 }),
        makePlay({ player: "P4", numerologyScore: 60 }),
        makePlay({ player: "P5", numerologyScore: 55 }),
      ];
      const preview = buildXPostPreview(makeCard({ allQualifiedPlaysOver50: plays }));
      expect(preview.topPlay?.player).toBe("P1");
      expect(preview.secondPlay?.player).toBe("P2");
      expect(preview.thirdPlay?.player).toBe("P3");
      expect(preview.othersOver50.map((p) => p.player)).toEqual(["P4", "P5"]);
      expect(preview.totalQualifiedCount).toBe(5);
      expect(preview.othersOver50TruncatedCount).toBe(0);
    });

    it("truncates a long others-over-50 list for display but preserves the true remaining count", () => {
      const plays = Array.from({ length: 16 }, (_, i) => makePlay({ player: `P${i}`, numerologyScore: 90 - i }));
      const preview = buildXPostPreview(makeCard({ allQualifiedPlaysOver50: plays }));
      expect(preview.othersOver50).toHaveLength(10); // MAX_OTHERS_DISPLAYED
      expect(preview.othersOver50TotalCount).toBe(13); // 16 - top 3
      expect(preview.othersOver50TruncatedCount).toBe(3);
    });

    it("never fabricates a second/third play when fewer than 3 qualify", () => {
      const preview = buildXPostPreview(makeCard({ allQualifiedPlaysOver50: [makePlay({ player: "OnlyOne" })] }));
      expect(preview.topPlay?.player).toBe("OnlyOne");
      expect(preview.secondPlay).toBeNull();
      expect(preview.thirdPlay).toBeNull();
      expect(preview.othersOver50).toEqual([]);
    });

    it("passes through the real daily numbers without altering them", () => {
      const preview = buildXPostPreview(makeCard({ allQualifiedPlaysOver50: [makePlay()] }));
      expect(preview.dayNumbers).toMatchObject({
        universalDayLabel: "26/8",
        primaryFamily: [2, 5, 8],
        secondaryFamily: [3, 6, 9],
        balancingComplement: 2,
        countercurrent: 1,
      });
    });

    it("uses the compound number alone when compound equals root (no redundant '8/8')", () => {
      const preview = buildXPostPreview(
        makeCard({
          allQualifiedPlaysOver50: [makePlay()],
          dailyProfile: { universalDayCompound: 8, universalDayRoot: 8 },
        })
      );
      expect(preview.dayNumbers.universalDayLabel).toBe("8");
    });
  });

  describe("validatePreviewReady", () => {
    it("passes for a fresh preview with a real top play", () => {
      const preview = buildXPostPreview(makeCard({ allQualifiedPlaysOver50: [makePlay()] }));
      expect(validatePreviewReady(preview, "2026-07-09")).toBe("");
    });

    it("rejects a preview whose slate date doesn't match today", () => {
      const preview = buildXPostPreview(makeCard({ allQualifiedPlaysOver50: [makePlay()] }));
      expect(validatePreviewReady(preview, "2026-07-10")).toMatch(/expected 2026-07-10/);
    });

    it("rejects a preview with no qualifying play rather than posting an empty graphic", () => {
      const preview = buildXPostPreview(makeCard({ allQualifiedPlaysOver50: [] }));
      expect(validatePreviewReady(preview, "2026-07-09")).toMatch(/no qualifying numerology play/i);
    });
  });

  describe("buildCaption", () => {
    it("builds a caption leading with the top play and listing the top 3", () => {
      const plays = [
        makePlay({ player: "Spencer Torkelson", numerologyScore: 72 }),
        makePlay({ player: "Cal Raleigh", numerologyScore: 53 }),
        makePlay({ player: "Trevor Larnach", numerologyScore: 39 }),
      ];
      const preview = buildXPostPreview(makeCard({ allQualifiedPlaysOver50: plays }));
      const result = buildCaption(preview);
      expect(result.skipped).toBe(false);
      expect(result.caption).toContain("Spencer Torkelson (72)");
      expect(result.caption).toContain("26/8");
      expect(result.caption).toContain("1. Spencer Torkelson — 72");
      expect(result.caption).toContain("2. Cal Raleigh — 53");
      expect(result.caption).toContain("https://www.joeknowsball.com/mlb/numerology");
      expect(result.caption.length).toBeLessThanOrEqual(280);
    });

    it("skips rather than posting a caption with no top play", () => {
      const preview = buildXPostPreview(makeCard({ allQualifiedPlaysOver50: [] }));
      const result = buildCaption(preview);
      expect(result.skipped).toBe(true);
      expect(result.caption).toBe("");
    });

    it("always produces a caption at or under 280 characters even with a very long player name", () => {
      const longName = "A".repeat(120);
      const preview = buildXPostPreview(makeCard({ allQualifiedPlaysOver50: [makePlay({ player: longName })] }));
      const result = buildCaption(preview);
      if (!result.skipped) {
        expect(result.caption.length).toBeLessThanOrEqual(280);
      } else {
        expect(result.reason).toMatch(/280/);
      }
    });
  });

  describe("buildXPostPreviewFromArtifact", () => {
    function snapshot(asOf = new Date().toISOString()) {
      return { asOf, timing: { phase: "FINAL_CUTOFF", minutesUntilFirstPitch: 50, earliestGameTime: null } };
    }
    function confirmedArtifactRow(overrides: Record<string, unknown> = {}) {
      return makePlay({ liveConfirmed: true, ...overrides });
    }
    function validArtifact(rows: unknown[] = [confirmedArtifactRow({ player: "Confirmed One" }), confirmedArtifactRow({ player: "Confirmed Two" })]) {
      return buildNumerologyArtifact({ slateDate: "2026-07-20", snapshot: snapshot(), selectedRows: rows, selectionStatus: "READY_CONFIRMED_SELECTIONS" });
    }

    it("builds the preview from exactly the artifact's rows, ignoring card.allQualifiedPlaysOver50", () => {
      const card = makeCard({
        date: "2026-07-20",
        allQualifiedPlaysOver50: [makePlay({ player: "Ignored Score-Threshold Play" })],
      });
      const preview = buildXPostPreviewFromArtifact(card, validArtifact());
      expect(preview.topPlay?.player).toBe("Confirmed One");
      expect(preview.secondPlay?.player).toBe("Confirmed Two");
      expect(preview.thirdPlay).toBeNull();
      expect(preview.totalQualifiedCount).toBe(2);
      expect(preview.confirmationStatus).toBe("confirmed");
    });

    it("throws when the artifact's slate date does not match the card's (wrong-slate artifact must fail closed)", () => {
      const card = makeCard({ date: "2026-07-20" });
      const wrongSlateArtifact = { ...validArtifact([confirmedArtifactRow()]), slateDate: "2026-07-19" };
      expect(() => buildXPostPreviewFromArtifact(card, wrongSlateArtifact)).toThrow(/slate date/i);
    });

    it("throws when the artifact's confirmation snapshot is stale (must fail closed)", () => {
      const card = makeCard({ date: "2026-07-20" });
      const staleAsOf = new Date(Date.now() - 60 * 60_000).toISOString();
      const staleArtifact = buildNumerologyArtifact({ slateDate: "2026-07-20", snapshot: snapshot(staleAsOf), selectedRows: [confirmedArtifactRow()], selectionStatus: "READY_CONFIRMED_SELECTIONS" });
      expect(() => buildXPostPreviewFromArtifact(card, staleArtifact)).toThrow(/stale/i);
    });

    it("throws when the artifact is missing or malformed", () => {
      const card = makeCard({ date: "2026-07-20" });
      expect(() => buildXPostPreviewFromArtifact(card, null)).toThrow(/missing or malformed/i);
      expect(() => buildXPostPreviewFromArtifact(card, {})).toThrow(/missing or malformed/i);
    });

    it("throws when the artifact has zero rows (empty artifact must block live delivery)", () => {
      const card = makeCard({ date: "2026-07-20" });
      expect(() => buildXPostPreviewFromArtifact(card, validArtifact([]))).toThrow(/zero confirmed rows/i);
    });

    it("throws when any row in the artifact is missing the live-confirmed marker (an unconfirmed player must block live delivery)", () => {
      const card = makeCard({ date: "2026-07-20" });
      const unconfirmedRow = makePlay({ player: "Snuck In Unconfirmed" }); // no liveConfirmed
      const artifact = validArtifact([confirmedArtifactRow({ player: "Legit" }), unconfirmedRow]);
      expect(() => buildXPostPreviewFromArtifact(card, artifact)).toThrow(/without live lineup confirmation/i);
    });
  });

  describe("assertLivePostConfirmed (production-safety gate)", () => {
    it("live X post (mode=post) with no artifact fails -- the unconfirmed score-threshold preview is never postable", () => {
      const card = makeCard({ date: "2026-07-20", allQualifiedPlaysOver50: [makePlay()] });
      const unconfirmedPreview = buildXPostPreview(card);
      expect(unconfirmedPreview.confirmationStatus).toBe("unconfirmed-preview");
      expect(() => assertLivePostConfirmed(unconfirmedPreview, "post")).toThrow(/not confirmed/i);
    });

    it("live text-only X post (mode=post-text-only) with no artifact fails", () => {
      const card = makeCard({ date: "2026-07-20", allQualifiedPlaysOver50: [makePlay()] });
      const unconfirmedPreview = buildXPostPreview(card);
      expect(() => assertLivePostConfirmed(unconfirmedPreview, "post-text-only")).toThrow(/not confirmed/i);
    });

    it("dry-run without an artifact remains possible and the result is visibly marked unconfirmed", () => {
      const card = makeCard({ date: "2026-07-20", allQualifiedPlaysOver50: [makePlay()] });
      const unconfirmedPreview = buildXPostPreview(card);
      expect(unconfirmedPreview.confirmationStatus).toBe("unconfirmed-preview");
      expect(() => assertLivePostConfirmed(unconfirmedPreview, "dry-run")).not.toThrow();
    });

    it("verify-account and post-key-only are also unaffected (not live-posting modes)", () => {
      const unconfirmedPreview = buildXPostPreview(makeCard({ date: "2026-07-20", allQualifiedPlaysOver50: [makePlay()] }));
      expect(() => assertLivePostConfirmed(unconfirmedPreview, "verify-account")).not.toThrow();
      expect(() => assertLivePostConfirmed(unconfirmedPreview, "post-key-only")).not.toThrow();
    });

    it("manual X post uses the confirmed selection: a valid artifact-driven preview is allowed to post/post-text-only", () => {
      const card = makeCard({ date: "2026-07-20" });
      const confirmedPreview = buildXPostPreviewFromArtifact(
        card,
        buildNumerologyArtifact({
          slateDate: "2026-07-20",
          snapshot: { asOf: new Date().toISOString(), timing: { phase: "FINAL_CUTOFF", minutesUntilFirstPitch: 50, earliestGameTime: null } },
          selectedRows: [makePlay({ liveConfirmed: true })],
          selectionStatus: "FORCED_CONFIRMED_SELECTION",
        }),
      );
      expect(() => assertLivePostConfirmed(confirmedPreview, "post")).not.toThrow();
      expect(() => assertLivePostConfirmed(confirmedPreview, "post-text-only")).not.toThrow();
    });
  });
});
