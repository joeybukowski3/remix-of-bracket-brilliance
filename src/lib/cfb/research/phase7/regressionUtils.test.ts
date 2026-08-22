import { describe, expect, it } from "vitest";
import { fitMultiOls, predictMultiOls, rSquared } from "./regressionUtils";

describe("fitMultiOls / rSquared", () => {
  it("recovers exact coefficients for a noiseless linear combination", () => {
    const rows = Array.from({ length: 30 }, (_, i) => {
      const x1 = (i % 6) - 3;
      const x2 = (i % 4) - 2;
      return { features: [x1, x2], y: 1.5 + 2 * x1 - 0.5 * x2 };
    });
    const model = fitMultiOls(rows, ["x1", "x2"]);
    expect(model.intercept).toBeCloseTo(1.5, 6);
    expect(model.coefficients[0]).toBeCloseTo(2, 6);
    expect(model.coefficients[1]).toBeCloseTo(-0.5, 6);

    const predicted = rows.map((r) => predictMultiOls(model, r.features));
    expect(rSquared(rows.map((r) => r.y), predicted)).toBeCloseTo(1, 6);
  });

  it("rSquared is finite and never NaN for a realistic noisy fit", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      features: [(i % 10) - 5],
      y: 3 + 0.4 * ((i % 10) - 5) + ((i % 7) - 3) * 0.1,
    }));
    const model = fitMultiOls(rows, ["x"]);
    const predicted = rows.map((r) => predictMultiOls(model, r.features));
    const r2 = rSquared(rows.map((r) => r.y), predicted);
    expect(Number.isFinite(r2)).toBe(true);
  });
});
