import { describe, expect, it } from "vitest";

// @ts-expect-error -- plain JS module, no type declarations
import {
  applyResolvedKProjection,
  buildV2RowIndex,
  findV2Row,
  resolveKProjection,
  resolveKProjectionsForPayload,
} from "../../../scripts/lib/mlb-k-production-projection.mjs";
// @ts-expect-error -- plain JS module, no type declarations
import { buildKArtifact } from "../../../scripts/lib/mlb-x-selection-artifact.mjs";
// @ts-expect-error -- plain JS module, no type declarations
import { selectConfirmedKRows } from "../../../scripts/lib/mlb-k-x-selection-core.mjs";
// @ts-expect-error -- plain JS module, no type declarations
import { buildKCaptionFromArtifact } from "../../../scripts/lib/mlb-x-artifact-caption.mjs";

const SLATE = "2026-07-24";

type AnyRecord = Record<string, unknown>;

function v2Row(overrides: AnyRecord = {}): AnyRecord {
  return {
    key: "dean-kremer|bal|chc|2026-07-24",
    slateDate: SLATE,
    game: { gameId: 777, gameKey: "BAL@CHC", gameDate: `${SLATE}T18:05:00Z`, venue: "Wrigley", pitcherIsHome: false },
    pitcher: { id: 101, name: "Dean Kremer", team: "BAL", opponent: "CHC", handedness: "R" },
    market: { kLine: 5.5, oddsOver: "-115", oddsUnder: "-105", book: "dk", slateDate: SLATE },
    legacy: { projectedIP: 5.5, projectedK9: 8.2, projectedKs: 5.0, projectionSource: "legacy", projectionFallbackReason: null },
    v2: {
      modelVersion: "mlb-k-projection-v2-shadow",
      projectedStrikeouts: 6.4,
      projectedKRate: 0.26,
      projectedBattersFaced: 24,
      projectedInnings: 5.6,
      pitcherSkillRate: 0.25,
      opponentEnvironmentRate: 0.24,
      matchupAdjustment: 1.01,
      confidence: "high",
      components: [],
      fallbacks: [],
      warnings: [],
    },
    comparison: { v2MinusLegacyKs: 1.4, legacyEdgeToLine: -0.5, v2EdgeToLine: 0.9 },
    inputs: {},
    ...overrides,
  };
}

function artifactWith(rows: AnyRecord[], slateDate = SLATE): AnyRecord {
  return {
    schemaVersion: 1,
    slateDate,
    generatedAt: `${slateDate}T12:00:00.000Z`,
    modelVersion: "mlb-k-projection-v2-shadow",
    projectionMode: "shadow",
    rows,
    diagnostics: {},
  };
}

function legacyRow(overrides: AnyRecord = {}): AnyRecord {
  return {
    pitcher: "Dean Kremer",
    pitcherId: 101,
    gameId: 777,
    gameKey: "BAL@CHC",
    team: "BAL",
    opponent: "CHC",
    kLine: 5.5,
    projectedKs: 5.0,
    legacyProjectedKs: 5.0,
    ...overrides,
  };
}

function resolve(legacy: AnyRecord, artifact: AnyRecord | null, publicSlateDate: string | null = SLATE, artifactValid = true) {
  return resolveKProjection({ legacyRow: legacy, artifact, publicSlateDate, artifactValid });
}

describe("resolveKProjection", () => {
  it("uses V2 when confidence is high", () => {
    const resolved = resolve(legacyRow(), artifactWith([v2Row()]));
    expect(resolved.source).toBe("v2");
    expect(resolved.effectiveProjectedKs).toBe(6.4);
    expect(resolved.fallbackReason).toBeNull();
    expect(resolved.confidence).toBe("high");
    expect(resolved.modelVersion).toBe("mlb-k-projection-v2-shadow");
  });

  it("uses V2 when confidence is medium", () => {
    const row = v2Row();
    (row.v2 as AnyRecord).confidence = "medium";
    const resolved = resolve(legacyRow(), artifactWith([row]));
    expect(resolved.source).toBe("v2");
    expect(resolved.effectiveProjectedKs).toBe(6.4);
  });

  it.each(["low", "insufficient"])("falls back to legacy when confidence is %s", (confidence) => {
    const row = v2Row();
    (row.v2 as AnyRecord).confidence = confidence;
    const resolved = resolve(legacyRow(), artifactWith([row]));
    expect(resolved.source).toBe("legacy-fallback");
    expect(resolved.fallbackReason).toBe("low-v2-confidence");
    expect(resolved.effectiveProjectedKs).toBe(5.0);
    // the raw V2 number stays available for debug comparison, just unused
    expect(resolved.v2ProjectedKs).toBe(6.4);
  });

  it("falls back when the artifact is missing", () => {
    const resolved = resolve(legacyRow(), null);
    expect(resolved.source).toBe("legacy-fallback");
    expect(resolved.fallbackReason).toBe("missing-v2-artifact");
    expect(resolved.effectiveProjectedKs).toBe(5.0);
  });

  it("falls back when the artifact was rejected upstream", () => {
    const resolved = resolve(legacyRow(), artifactWith([v2Row()]), SLATE, false);
    expect(resolved.fallbackReason).toBe("missing-v2-artifact");
  });

  it("falls back when the artifact slate does not match the public slate", () => {
    const stale = artifactWith([v2Row({ slateDate: "2026-07-23" })], "2026-07-23");
    const resolved = resolve(legacyRow(), stale);
    expect(resolved.source).toBe("legacy-fallback");
    expect(resolved.fallbackReason).toBe("stale-v2-artifact");
    expect(resolved.effectiveProjectedKs).toBe(5.0);
  });

  it("falls back when no V2 row matches", () => {
    const resolved = resolve(legacyRow({ pitcherId: 999, gameId: 888, pitcher: "Nobody At All" }), artifactWith([v2Row()]));
    expect(resolved.fallbackReason).toBe("missing-v2-row");
    expect(resolved.effectiveProjectedKs).toBe(5.0);
  });

  it("falls back when the stable identity is ambiguous", () => {
    const duplicate = artifactWith([v2Row(), v2Row({ key: "other-key" })]);
    const resolved = resolve(legacyRow(), duplicate);
    expect(resolved.fallbackReason).toBe("stable-id-mismatch");
    expect(resolved.effectiveProjectedKs).toBe(5.0);
  });

  it.each([null, Number.NaN, Number.POSITIVE_INFINITY, 0, -3.2])(
    "falls back when the V2 projection is %s",
    (projectedStrikeouts) => {
      const row = v2Row();
      (row.v2 as AnyRecord).projectedStrikeouts = projectedStrikeouts;
      const resolved = resolve(legacyRow(), artifactWith([row]));
      expect(resolved.source).toBe("legacy-fallback");
      expect(resolved.fallbackReason).toBe("invalid-v2-projection");
      expect(resolved.effectiveProjectedKs).toBe(5.0);
    },
  );

  it.each([null, 0, Number.NaN])("reports unavailable when V2 is unusable and legacy is %s", (legacyValue) => {
    const row = v2Row();
    (row.v2 as AnyRecord).confidence = "low";
    const resolved = resolve(legacyRow({ projectedKs: legacyValue, legacyProjectedKs: legacyValue }), artifactWith([row]));
    expect(resolved.source).toBe("unavailable");
    expect(resolved.effectiveProjectedKs).toBeNull();
    expect(resolved.fallbackReason).toBe("invalid-legacy-projection");
    // the reason V2 was refused is still recorded
    expect(resolved.v2RejectionReason).toBe("low-v2-confidence");
  });

  it("never returns a fabricated zero, NaN or Infinity", () => {
    const cases = [
      resolve(legacyRow(), artifactWith([v2Row()])),
      resolve(legacyRow({ projectedKs: 0, legacyProjectedKs: 0 }), null),
    ];
    for (const resolved of cases) {
      const value = resolved.effectiveProjectedKs;
      expect(value === null || (Number.isFinite(value) && value > 0)).toBe(true);
    }
  });

  it("is deterministic for the same inputs", () => {
    const artifact = artifactWith([v2Row()]);
    const first = resolve(legacyRow(), artifact);
    const second = resolve(legacyRow(), artifact);
    expect(second).toEqual(first);
  });
});

describe("stable identity matching", () => {
  const index = (rows: AnyRecord[]) => buildV2RowIndex(artifactWith(rows));

  it("matches on slateDate + gamePk + pitcherId", () => {
    const match = findV2Row(index([v2Row()]), legacyRow(), SLATE);
    expect(match.matchedBy).toBe("stable-id");
    expect(match.row).not.toBeNull();
  });

  it("falls back to slateDate + pitcherId + team + opponent when the gamePk is absent", () => {
    const row = v2Row();
    (row.game as AnyRecord).gameId = null;
    const match = findV2Row(index([row]), legacyRow({ gameId: null }), SLATE);
    expect(match.matchedBy).toBe("matchup");
  });

  it("falls back to the normalized legacy key when no ID is available", () => {
    const row = v2Row();
    (row.game as AnyRecord).gameId = null;
    (row.pitcher as AnyRecord).id = null;
    const match = findV2Row(index([row]), legacyRow({ gameId: null, pitcherId: null }), SLATE);
    expect(match.matchedBy).toBe("legacy-key");
  });

  it("rejects an ambiguous legacy-key fallback", () => {
    const a = v2Row();
    (a.game as AnyRecord).gameId = null;
    (a.pitcher as AnyRecord).id = null;
    const b = v2Row({ key: a.key });
    (b.game as AnyRecord).gameId = null;
    (b.pitcher as AnyRecord).id = null;
    const match = findV2Row(index([a, b]), legacyRow({ gameId: null, pitcherId: null }), SLATE);
    expect(match.row).toBeNull();
    expect(match.reason).toBe("stable-id-mismatch");
  });

  it("rejects a cross-date match", () => {
    const match = findV2Row(index([v2Row({ slateDate: "2026-07-23" })]), legacyRow(), SLATE);
    expect(match.row).toBeNull();
  });

  it("rejects a cross-game match", () => {
    const match = findV2Row(index([v2Row()]), legacyRow({ gameId: 999, pitcherId: 101 }), SLATE);
    // pitcherId+team+opponent still identifies the same real matchup, so this
    // resolves through tier 2 rather than silently accepting the wrong gamePk.
    expect(match.matchedBy).toBe("matchup");
    const noMatchup = findV2Row(index([v2Row()]), legacyRow({ gameId: 999, opponent: "NYY" }), SLATE);
    expect(noMatchup.row).toBeNull();
  });

  it("rejects a cross-team match", () => {
    const match = findV2Row(index([v2Row()]), legacyRow({ gameId: null, team: "CHC" }), SLATE);
    expect(match.row).toBeNull();
  });

  it("rejects a cross-opponent match", () => {
    const match = findV2Row(index([v2Row()]), legacyRow({ gameId: null, opponent: "NYY" }), SLATE);
    expect(match.row).toBeNull();
  });

  it("rejects a name-only legacy-key match against a different matchup", () => {
    const row = v2Row({ key: "dean-kremer|bal|nyy|2026-07-24" });
    (row.game as AnyRecord).gameId = null;
    (row.pitcher as AnyRecord).id = null;
    (row.pitcher as AnyRecord).opponent = "NYY";
    const match = findV2Row(index([row]), legacyRow({ gameId: null, pitcherId: null }), SLATE);
    expect(match.row).toBeNull();
  });
});

describe("applyResolvedKProjection", () => {
  it("publishes the resolved value as projectedKs and preserves the legacy number", () => {
    const legacy = legacyRow();
    const resolved = resolve(legacy, artifactWith([v2Row()]));
    const applied = applyResolvedKProjection(legacy, resolved);
    expect(applied.projectedKs).toBe(6.4);
    expect(applied.effectiveProjectedKs).toBe(6.4);
    expect(applied.legacyProjectedKs).toBe(5.0);
    expect(applied.v2ProjectedKs).toBe(6.4);
    expect(applied.projectionSource).toBe("v2");
    expect(applied.v2Confidence).toBe("high");
  });

  it("recomputes kAdjustment from the resolved value", () => {
    const legacy = legacyRow();
    const applied = applyResolvedKProjection(legacy, resolve(legacy, artifactWith([v2Row()])));
    expect(applied.kAdjustment).toBe(Math.round((6.4 - 5.5) * 5));
  });

  it("is idempotent across repeated resolution passes", () => {
    const artifact = artifactWith([v2Row()]);
    const once = applyResolvedKProjection(legacyRow(), resolve(legacyRow(), artifact));
    const twice = applyResolvedKProjection(once, resolve(once, artifact));
    expect(twice).toEqual(once);
  });
});

describe("resolveKProjectionsForPayload", () => {
  it("counts sources, reasons and confidence across the slate", () => {
    const lowConfidence = v2Row({
      key: "other|nyy|bos|2026-07-24",
      game: { gameId: 778, gameKey: "NYY@BOS", gameDate: null, venue: null, pitcherIsHome: true },
      pitcher: { id: 202, name: "Other Guy", team: "NYY", opponent: "BOS", handedness: "L" },
    });
    (lowConfidence.v2 as AnyRecord).confidence = "low";

    const result = resolveKProjectionsForPayload({
      pitchers: [
        legacyRow(),
        legacyRow({ pitcher: "Other Guy", pitcherId: 202, gameId: 778, team: "NYY", opponent: "BOS", projectedKs: 4.2, legacyProjectedKs: 4.2 }),
      ],
      artifact: artifactWith([v2Row(), lowConfidence]),
      publicSlateDate: SLATE,
    });

    expect(result.diagnostics.v2Rows).toBe(1);
    expect(result.diagnostics.legacyFallbackRows).toBe(1);
    expect(result.diagnostics.unavailableRows).toBe(0);
    expect(result.diagnostics.fallbackReasons["low-v2-confidence"]).toBe(1);
    expect(result.diagnostics.confidenceCounts).toEqual({ high: 1, low: 1 });
    expect(result.pitchers.map((row: AnyRecord) => row.projectedKs)).toEqual([6.4, 4.2]);
  });

  it("falls every row back to legacy when V2 generation produced nothing", () => {
    const result = resolveKProjectionsForPayload({
      pitchers: [legacyRow()],
      artifact: null,
      publicSlateDate: SLATE,
      artifactValid: false,
    });
    expect(result.diagnostics.v2Rows).toBe(0);
    expect(result.pitchers[0].projectedKs).toBe(5.0);
    expect(result.pitchers[0].projectionSource).toBe("legacy-fallback");
  });
});

/**
 * The X pipeline's only K data source is the live page scrape, so these
 * assert that whatever the website publishes is what selection ranks, what
 * the plan freezes, and what the caption prints -- with no second projection
 * calculation anywhere along the way.
 */
describe("X pipeline consistency with the resolved projection", () => {
  const publishedRow = (overrides: AnyRecord = {}): AnyRecord => {
    const legacy = legacyRow(overrides.legacy as AnyRecord ?? {});
    const applied = applyResolvedKProjection(legacy, resolve(legacy, artifactWith([v2Row()])));
    return {
      pitcher: applied.pitcher,
      pitcherId: applied.pitcherId,
      gameId: applied.gameId,
      team: applied.team,
      opponent: applied.opponent,
      status: "VALID",
      kLine: applied.kLine,
      oddsOver: "-115",
      oddsUnder: "-105",
      bookmaker: "dk",
      projectedKs: applied.projectedKs,
      projectedIP: 5.5,
      legacyProjectedKs: applied.legacyProjectedKs,
      v2ProjectedKs: applied.v2ProjectedKs,
      projectionSource: applied.projectionSource,
      projectionFallbackReason: applied.projectionFallbackReason,
      v2Confidence: applied.v2Confidence,
      isCurrentStarter: true,
      gameStarted: false,
      opposingLineupConfirmed: true,
      ...overrides,
    };
  };

  it("selects and ranks on the resolved projection, not the legacy one", () => {
    const { selected } = selectConfirmedKRows({ rows: [publishedRow()], atCutoff: true });
    expect(selected).toHaveLength(1);
    // legacy 5.0 vs line 5.5 would be UNDER; resolved 6.4 is OVER
    expect(selected[0].projectedKs).toBe(6.4);
    expect(selected[0].direction).toBe("OVER");
    expect(selected[0].projectionEdge).toBeCloseTo(0.9, 5);
  });

  it("freezes the resolved values and their provenance into the edition artifact", () => {
    const { selected } = selectConfirmedKRows({ rows: [publishedRow()], atCutoff: true });
    const artifact = buildKArtifact({
      slateDate: SLATE,
      snapshot: {},
      selectedRows: selected,
      selectionStatus: "READY",
    });
    const [frozen] = artifact.rows;
    expect(frozen.projectedKs).toBe(6.4);
    expect(frozen.projectionEdge).toBeCloseTo(0.9, 5);
    expect(frozen.side).toBe("OVER");
    expect(frozen.odds).toBe("-115");
    expect(frozen.legacyProjectedKs).toBe(5.0);
    expect(frozen.v2ProjectedKs).toBe(6.4);
    expect(frozen.projectionSource).toBe("v2");
    expect(frozen.projectionFallbackReason).toBeNull();
    expect(frozen.v2Confidence).toBe("high");
  });

  it("captions the frozen projection and direction, never a recomputed one", () => {
    const { selected } = selectConfirmedKRows({ rows: [publishedRow()], atCutoff: true });
    const artifact = buildKArtifact({ slateDate: SLATE, snapshot: {}, selectedRows: selected, selectionStatus: "READY" });
    const { skipped, caption } = buildKCaptionFromArtifact(artifact);
    expect(skipped).toBe(false);
    expect(caption).toContain("Model projection: 6.4 K");
    expect(caption).toContain("Recommended side: Over 5.5");
    expect(caption).toContain("Projection edge: +0.9 K");
    // the legacy projection never reaches the caption
    expect(caption).not.toContain("5.0 K");
  });

  it("keeps a stale V2 artifact from changing selection, freeze or caption", () => {
    const legacy = legacyRow();
    const stale = artifactWith([v2Row({ slateDate: "2026-07-23" })], "2026-07-23");
    const applied = applyResolvedKProjection(legacy, resolve(legacy, stale));
    const row = publishedRow({
      projectedKs: applied.projectedKs,
      legacyProjectedKs: applied.legacyProjectedKs,
      v2ProjectedKs: applied.v2ProjectedKs,
      projectionSource: applied.projectionSource,
      projectionFallbackReason: applied.projectionFallbackReason,
      v2Confidence: applied.v2Confidence,
    });
    const { selected } = selectConfirmedKRows({ rows: [row], atCutoff: true });
    const artifact = buildKArtifact({ slateDate: SLATE, snapshot: {}, selectedRows: selected, selectionStatus: "READY" });
    const [frozen] = artifact.rows;
    expect(frozen.projectedKs).toBe(5.0);
    expect(frozen.side).toBe("UNDER");
    expect(frozen.projectionSource).toBe("legacy-fallback");
    expect(frozen.projectionFallbackReason).toBe("stale-v2-artifact");
  });

  it("uses the same contract for the morning, confirmed and fallback editions", () => {
    // Editions differ only in the cutoff/opposing-lineup relaxation; the
    // projection contract each one selects on is identical.
    const rows = [publishedRow({ opposingLineupConfirmed: false })];
    const morning = selectConfirmedKRows({ rows, atCutoff: false });
    const confirmed = selectConfirmedKRows({ rows, atCutoff: true });
    const fallback = selectConfirmedKRows({ rows, atCutoff: true, maxTableSize: 3 });
    expect(morning.selected).toHaveLength(0);
    expect(morning.heldForOpposingCount).toBe(1);
    for (const result of [confirmed, fallback]) {
      expect(result.selected[0].projectedKs).toBe(6.4);
      expect(result.selected[0].direction).toBe("OVER");
      expect(result.selected[0].projectionSource).toBe("v2");
    }
  });
});
