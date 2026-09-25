import { describe, expect, it } from "vitest";
import { buildDstTrenchComponent } from "@/lib/nfl/dfs/dstTrenchContext";
import type { TrenchMetricsArtifact } from "@/lib/nfl/trenchMetricsData";

const m = (pb: [number, number], pr: [number, number]) => ({
  espnSlug: "x",
  metrics: { "off.passBlockWinRate": { valuePct: pb[0], espnRank: pb[1] }, "def.passRushWinRate": { valuePct: pr[0], espnRank: pr[1] } },
});
const artifact = (teams2026: TrenchMetricsArtifact["seasons"][string]["teams"]): TrenchMetricsArtifact => ({
  schemaVersion: "t", generatedAt: "t", source: "t", attribution: "t", metricColumns: {}, provenance: null,
  seasons: {
    "2025": { articleId: "a", throughWeek: 18, sourceUpdatedText: null, sourceLastModified: "2026-01-06T15:51:59Z", teams: { ne: m([64, 13], [35, 19]), jax: m([68, 9], [38, 14]) } },
    "2026": { articleId: "b", throughWeek: 2, sourceUpdatedText: null, sourceLastModified: "2026-09-22T14:10:31Z", teams: teams2026 },
  },
});

describe("buildDstTrenchComponent", () => {
  it("uses 2026 for both sides before six games and applies the current freshness bound", () => {
    // DST = JAX defense vs NE offense: PBWR NE #9, PRWR JAX #30 -> edge 21, value -21.
    const c = buildDstTrenchComponent(artifact({ ne: m([55, 9], [50, 17]), jax: m([46, 26], [37, 30]) }), "ne", "jax", 192);
    expect(c.value).toBe(-21);
    expect(c.detail).toBe("2026 Through Week 2; opponent PBWR rank 9 minus DST PRWR rank 30");
    expect(c.asOf).toBe("2026-09-22T14:10:31Z");
    expect(c.maxAgeHours).toBe(192);
  });

  it("falls back independently per side and labels the mix truthfully", () => {
    const c = buildDstTrenchComponent(artifact({ ne: m([55, 9], [50, 17]) }), "ne", "jax", 192);
    expect(c.value).toBe(-5); // 14 - 9 = 5 -> -5
    expect(c.detail).toBe("Opponent PBWR 2026 Through Week 2 / DST PRWR 2025 Season; opponent PBWR rank 9 minus DST PRWR rank 14");
    expect(c.maxAgeHours).toBe(192);
  });

  it("is fully prior-season with no freshness bound when 2026 is absent", () => {
    const c = buildDstTrenchComponent(artifact({}), "ne", "jax", 192);
    expect(c.value).toBe(-1); // edge = 14 - 13 = 1, negated
    expect(c.detail.startsWith("2025 Season;")).toBe(true);
    expect(c.asOf).toBe("2026-01-06T15:51:59Z");
    expect(c.maxAgeHours).toBeNull();
  });

  it("returns a null value when a side is unavailable in every season", () => {
    const c = buildDstTrenchComponent(artifact({}), "zzz", "jax", 192);
    expect(c.value).toBeNull();
    expect(c.detail).toContain("opponent PBWR rank unknown");
  });
});
