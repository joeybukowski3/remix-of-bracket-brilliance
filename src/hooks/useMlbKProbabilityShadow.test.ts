import { describe, expect, it } from "vitest";
import { resolveKProbabilityShadowPayload, type KProbabilityShadowArtifact } from "@/hooks/useMlbKProbabilityShadow";

function computedRow(overrides: Partial<KProbabilityShadowArtifact["rows"][number]> = {}) {
  return {
    key: "500123|1001",
    slateDate: "2026-09-11",
    pitcherId: 1001,
    gameId: 500123,
    pitcher: "Test Pitcher",
    team: "NYY",
    opponent: "BOS",
    line: 5.5,
    overOdds: "-120",
    underOdds: "-110",
    book: "draftkings",
    projectedKs: 6.1,
    projectedKsSource: "v4",
    modelVersion: "mlb-k-probability-shadow-v1",
    simulationCount: 8000,
    market: { overImpliedProbability: 0.5455, underImpliedProbability: 0.5238, overNoVigProbability: 0.51, underNoVigProbability: 0.49, overround: 1.0692, twoSided: true },
    model: { overProbability: 0.6, underProbability: 0.4, meanSimulatedKs: 6.0, medianSimulatedKs: 6, stdevSimulatedKs: 2.5 },
    edge: { overProbabilityEdge: 0.09, underProbabilityEdge: null, lean: "OVER" as const, bestProbabilityEdge: 0.09, bestProbabilitySide: "OVER" as const },
    confidence: { grade: "HIGH" as const, score: 0.8, workloadTrust: 0.8, kRateTrust: 0.8 },
    diagnostics: { ipSd: 1.2, kPerIpSd: 0.2, ipSpread: 0.1, kPerIpSpread: 0.1, bfPerIP: 4.3, usedV4Diagnostics: true },
    status: "computed" as const,
    statusReason: null,
    ...overrides,
  };
}

function artifact(overrides: Partial<KProbabilityShadowArtifact> = {}): KProbabilityShadowArtifact {
  return {
    schemaVersion: 1,
    slateDate: "2026-09-11",
    generatedAt: "2026-09-11T12:00:00.000Z",
    modelVersion: "mlb-k-probability-shadow-v1",
    simulationCount: 8000,
    rows: [computedRow()],
    diagnostics: { totalRows: 1, computedRows: 1, noMarketRows: 0, oneSidedMarketRows: 0, insufficientDataRows: 0 },
    ...overrides,
  };
}

describe("resolveKProbabilityShadowPayload", () => {
  it("accepts a valid current-slate artifact", () => {
    const result = resolveKProbabilityShadowPayload(artifact(), "2026-09-11");
    expect(result.status).toBe("valid");
    expect(result.artifact?.rows).toHaveLength(1);
  });

  it("treats a mismatched slateDate as stale and hides the artifact entirely", () => {
    const result = resolveKProbabilityShadowPayload(artifact({ slateDate: "2026-09-10" }), "2026-09-11");
    expect(result.status).toBe("stale");
    expect(result.artifact).toBeNull();
  });

  it("accepts the artifact when the page's own slate date is not yet known (null)", () => {
    // The page's dashboard hook can resolve slateDate a tick after this
    // hook's first fetch; until it does, there is nothing to compare
    // against, so an artifact is provisionally valid rather than stale.
    const result = resolveKProbabilityShadowPayload(artifact(), null);
    expect(result.status).toBe("valid");
  });

  it("rejects a structurally invalid payload (missing rows array)", () => {
    const result = resolveKProbabilityShadowPayload({ ...artifact(), rows: "not-an-array" }, "2026-09-11");
    expect(result.status).toBe("invalid");
    expect(result.artifact).toBeNull();
  });

  it("rejects a payload with a malformed slateDate", () => {
    const result = resolveKProbabilityShadowPayload({ ...artifact(), slateDate: "not-a-date" }, "2026-09-11");
    expect(result.status).toBe("invalid");
  });

  it("rejects a payload with an unparsable generatedAt", () => {
    const result = resolveKProbabilityShadowPayload({ ...artifact(), generatedAt: "not-a-timestamp" }, "2026-09-11");
    expect(result.status).toBe("invalid");
  });

  it("rejects a payload missing schemaVersion or modelVersion", () => {
    const { schemaVersion, ...withoutSchemaVersion } = artifact();
    expect(resolveKProbabilityShadowPayload(withoutSchemaVersion, "2026-09-11").status).toBe("invalid");
    expect(resolveKProbabilityShadowPayload({ ...artifact(), modelVersion: "" }, "2026-09-11").status).toBe("invalid");
  });

  it("rejects a row missing a status field", () => {
    const bad = artifact({ rows: [{ ...computedRow(), status: undefined } as unknown as KProbabilityShadowArtifact["rows"][number]] });
    expect(resolveKProbabilityShadowPayload(bad, "2026-09-11").status).toBe("invalid");
  });

  it("rejects a non-object payload (e.g. null, an array, a string) without throwing", () => {
    expect(resolveKProbabilityShadowPayload(null, "2026-09-11").status).toBe("invalid");
    expect(resolveKProbabilityShadowPayload([], "2026-09-11").status).toBe("invalid");
    expect(resolveKProbabilityShadowPayload("garbage", "2026-09-11").status).toBe("invalid");
    expect(resolveKProbabilityShadowPayload(undefined, "2026-09-11").status).toBe("invalid");
  });
});
