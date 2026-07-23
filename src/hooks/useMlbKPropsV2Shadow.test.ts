import { describe, expect, it } from "vitest";
import type { PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";
import {
  buildKPropsV2ShadowIndex,
  findKPropsV2ShadowRow,
  validateKPropsV2ShadowPayload,
  type KPropsV2ShadowArtifact,
  type KPropsV2ShadowRow,
} from "@/hooks/useMlbKPropsV2Shadow";

function row(overrides: Partial<PitcherStrikeoutTeamRow> = {}): PitcherStrikeoutTeamRow {
  return {
    rank: 1,
    gameKey: "TB@TOR",
    gameId: 822785,
    pitcherId: 669456,
    pitcher: "Shane Bieber",
    team: "TOR",
    opponent: "TB",
    park: "Rogers Centre",
    parkFactor: 1,
    pitcherKRate: 17.6,
    pitcherWhiffRate: 26.3,
    pitcherKVs: 50,
    opponentTeamKRate: 18.9,
    opponentTeamWhiffRate: null,
    opponentTeamXba: null,
    pitcherKSkillScore: 50,
    opponentTeamStrikeoutScore: 50,
    strikeoutMatchupScore: 50,
    whyItRanksWell: "fixture",
    projectedIP: 4.7,
    projectedK9: 7.2,
    projectedKs: 3.8,
    kLine: 4.5,
    kOddsOver: "+121",
    kOddsUnder: "-155",
    ...overrides,
  };
}

function shadowRow(overrides: Partial<KPropsV2ShadowRow> = {}): KPropsV2ShadowRow {
  return {
    key: "shane-bieber|tor|tb|2026-07-23",
    slateDate: "2026-07-23",
    game: { gameId: 822785, gameKey: "TB@TOR", gameDate: "2026-07-23T19:07:00Z", venue: "Rogers Centre", pitcherIsHome: true },
    pitcher: { id: 669456, name: "Shane Bieber", team: "TOR", opponent: "TB", handedness: "R" },
    market: { kLine: 4.5, oddsOver: "+121", oddsUnder: "-155", book: "draftkings", slateDate: "2026-07-23" },
    legacy: { projectedIP: 4.7, projectedK9: 7.2, projectedKs: 3.8, projectionSource: "legacy", projectionFallbackReason: "MODE_SHADOW_COMPARISON" },
    v2: {
      modelVersion: "mlb-k-projection-v2-shadow",
      projectedStrikeouts: 4.0001,
      projectedKRate: 0.1768,
      projectedBattersFaced: 22.626,
      projectedInnings: 5.085,
      pitcherSkillRate: 0.1868,
      opponentEnvironmentRate: 0.1887,
      matchupAdjustment: -0.01,
      confidence: "high",
      components: [{ key: "pitcher.seasonSkillRate", label: "Pitcher season K skill", group: "pitcher", value: 0.177, weight: 0.44, normalizedWeight: 0.49, contribution: 0.087, source: "derived" }],
      fallbacks: [],
      warnings: [],
    },
    comparison: { v2MinusLegacyKs: 0.2, legacyEdgeToLine: -0.7, v2EdgeToLine: -0.5 },
    inputs: {},
    ...overrides,
  };
}

function artifact(overrides: Partial<KPropsV2ShadowArtifact> = {}): KPropsV2ShadowArtifact {
  return {
    schemaVersion: 1,
    slateDate: "2026-07-23",
    generatedAt: "2026-07-23T13:17:06.284Z",
    sourceDates: { "mlb-odds.json": "NO_TRUSTWORTHY_DATE" },
    modelVersion: "mlb-k-projection-v2-shadow",
    projectionMode: "shadow",
    rows: [shadowRow()],
    diagnostics: { totalRows: 1, v2ComputedRows: 1, legacyOnlyRows: 0, warnings: ["mlb-odds.json has no trustworthy date field."] },
    ...overrides,
  };
}

describe("validateKPropsV2ShadowPayload", () => {
  it("accepts a valid current-slate shadow artifact and keeps nonfatal warnings", () => {
    const result = validateKPropsV2ShadowPayload(artifact(), "2026-07-23");
    expect(result.status).toBe("valid");
    expect(result.artifact?.rows).toHaveLength(1);
    expect(result.artifact?.projectionMode).toBe("shadow");
  });

  it("rejects stale artifacts without exposing rows", () => {
    const result = validateKPropsV2ShadowPayload(artifact({ slateDate: "2026-07-22", rows: [shadowRow({ slateDate: "2026-07-22" })] }), "2026-07-23");
    expect(result.status).toBe("stale");
    expect(result.artifact).toBeNull();
    expect(result.warnings.join(" ")).toContain("does not match");
  });

  it("rejects invalid projection mode and invalid schema", () => {
    expect(validateKPropsV2ShadowPayload({ ...artifact(), projectionMode: "production" }, "2026-07-23").status).toBe("invalid");
    expect(validateKPropsV2ShadowPayload({ ...artifact(), rows: "bad" }, "2026-07-23").status).toBe("invalid");
  });
});

describe("K props V2 shadow row matching", () => {
  it("matches by stable gameId and pitcherId", () => {
    expect(findKPropsV2ShadowRow(row(), artifact(), "2026-07-23")?.key).toBe("shane-bieber|tor|tb|2026-07-23");
  });

  it("does not match across teams or opponents even when IDs match", () => {
    expect(findKPropsV2ShadowRow(row({ team: "TB", opponent: "TOR" }), artifact(), "2026-07-23")).toBeNull();
  });

  it("falls back to normalized identity only when unambiguous", () => {
    const publicRow = row({ gameId: null, pitcherId: null, pitcher: "  shane   bieber ", team: "tor", opponent: "tb" });
    expect(findKPropsV2ShadowRow(publicRow, artifact(), "2026-07-23")?.pitcher.name).toBe("Shane Bieber");
  });

  it("rejects duplicate ambiguous fallback matches", () => {
    const duplicate = artifact({ rows: [shadowRow(), shadowRow({ game: { ...shadowRow().game, gameId: 999 }, pitcher: { ...shadowRow().pitcher, id: 999 } })] });
    const index = buildKPropsV2ShadowIndex(duplicate);
    expect(index.duplicateFallbackKeys).toHaveLength(1);
    expect(findKPropsV2ShadowRow(row({ gameId: null, pitcherId: null }), duplicate, "2026-07-23")).toBeNull();
  });

  it("keeps legacy rows usable when no shadow row matches", () => {
    expect(findKPropsV2ShadowRow(row({ pitcherId: 1 }), artifact(), "2026-07-23")).toBeNull();
  });
});
