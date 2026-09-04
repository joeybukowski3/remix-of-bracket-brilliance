import { describe, expect, it } from "vitest";
import { computeShadowVsProductionErrors, type ShadowVsProductionRow } from "./shadowVsProductionEvaluation";

function row(overrides: Partial<ShadowVsProductionRow> = {}): ShadowVsProductionRow {
  return {
    playerId: "p1", gameId: "2026_01_HOU_BUF", season: 2026, week: 1,
    productionCarries: 9.3, shadowCarries: 18.2, actualCarries: 17,
    ...overrides,
  };
}

describe("computeShadowVsProductionErrors", () => {
  it("computes carries error from the archived pregame values, not a recomputation", () => {
    const [result] = computeShadowVsProductionErrors([row()], () => null, () => null, () => null);
    expect(result.productionCarriesError).toBeCloseTo(Math.abs(9.3 - 17));
    expect(result.shadowCarriesError).toBeCloseTo(Math.abs(18.2 - 17));
  });

  it("returns null shadow error (not zero, not a fabricated number) when shadow was unavailable that week", () => {
    const [result] = computeShadowVsProductionErrors([row({ shadowCarries: null })], () => null, () => null, () => null);
    expect(result.shadowCarriesError).toBeNull();
    // production error is unaffected by shadow being unavailable.
    expect(result.productionCarriesError).toBeCloseTo(Math.abs(9.3 - 17));
  });

  it("uses the caller-supplied share accessors rather than deriving shares itself (no hidden recomputation)", () => {
    const r = row();
    const [result] = computeShadowVsProductionErrors(
      [r],
      () => 0.6,   // actual share
      () => 0.35,  // production share
      () => 0.79,  // shadow share
    );
    expect(result.productionShareError).toBeCloseTo(Math.abs(0.35 - 0.6));
    expect(result.shadowShareError).toBeCloseTo(Math.abs(0.79 - 0.6));
  });

  it("is deterministic and does not mutate its input rows", () => {
    const rows = [row(), row({ playerId: "p2" })];
    const snapshot = JSON.stringify(rows);
    computeShadowVsProductionErrors(rows, () => null, () => null, () => null);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
});
