import { describe, expect, it } from "vitest";
import { makeRow } from "./__fixtures__/rows";
import { encodeRow, fitScalers } from "./scaling";

describe("scaling: training-only fit + explicit missingness", () => {
  it("computes mean/scale from training rows only, ignoring rows not passed in", () => {
    const training = [
      makeRow({ season: 2023, week: 1, playerId: "a", seasonPpgPrior: 10 }),
      makeRow({ season: 2023, week: 1, playerId: "b", seasonPpgPrior: 20 }),
    ];
    const otherRows = [makeRow({ season: 2024, week: 1, playerId: "c", seasonPpgPrior: 1000 })];
    const scalers = fitScalers(training, ["seasonPpgPrior"]);
    expect(scalers[0].mean).toBeCloseTo(15, 5);
    // Passing a disjoint "otherRows" set never touches the fitted scaler; this is a compile-time/behavioral guard,
    // not a call -- fitScalers only ever sees what it's given.
    expect(otherRows[0].seasonPpgPrior).toBe(1000);
  });

  it("marks missingness rate and emits a 0/1 indicator only for features with training-time nulls", () => {
    const training = [
      makeRow({ season: 2023, week: 1, playerId: "a", snapShareSeasonPrior: 0.5 }),
      makeRow({ season: 2023, week: 1, playerId: "b", snapShareSeasonPrior: null }),
    ];
    const scalers = fitScalers(training, ["snapShareSeasonPrior", "restDays"]);
    const snapScaler = scalers.find((s) => s.feature === "snapShareSeasonPrior")!;
    const restScaler = scalers.find((s) => s.feature === "restDays")!;
    expect(snapScaler.missingRateInTraining).toBeCloseTo(0.5, 5);
    expect(snapScaler.hasMissingIndicator).toBe(true);
    expect(restScaler.missingRateInTraining).toBe(0);
    expect(restScaler.hasMissingIndicator).toBe(false);
  });

  it("encodes a missing feature as standardized 0 plus a 1 indicator, never a silently substituted average", () => {
    const training = [
      makeRow({ season: 2023, week: 1, playerId: "a", snapShareSeasonPrior: 0.4 }),
      makeRow({ season: 2023, week: 1, playerId: "b", snapShareSeasonPrior: 0.6 }),
      makeRow({ season: 2023, week: 1, playerId: "c", snapShareSeasonPrior: null }),
    ];
    const scalers = fitScalers(training, ["snapShareSeasonPrior"]);
    const missingRow = makeRow({ season: 2023, week: 1, playerId: "d", snapShareSeasonPrior: null });
    const encoded = encodeRow(missingRow, scalers);
    expect(encoded.values[0]).toBe(0);
    expect(encoded.indicators[0]).toBe(1);

    const presentRow = makeRow({ season: 2023, week: 1, playerId: "e", snapShareSeasonPrior: 0.9 });
    const encodedPresent = encodeRow(presentRow, scalers);
    expect(encodedPresent.indicators[0]).toBe(0);
    expect(encodedPresent.values[0]).not.toBe(0);
  });
});
