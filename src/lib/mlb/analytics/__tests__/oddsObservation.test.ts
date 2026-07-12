import { describe, expect, it } from "vitest";
import {
  buildQuoteKey,
  impliedProbabilityFromAmerican,
  isNoVigEligible,
  validateOddsObservation,
  type OddsObservation,
} from "../oddsObservation";

function makeObservation(overrides: Partial<OddsObservation> = {}): OddsObservation {
  return {
    gameId: 822876,
    playerId: 607043,
    market: "hr",
    side: "yes",
    line: 0.5,
    bookmaker: "fanduel",
    priceAmerican: 320,
    impliedProbability: impliedProbabilityFromAmerican(320),
    capturedAt: "2026-07-12T15:30:00Z",
    slateDate: "2026-07-12",
    source: "fixture",
    freshness: "generation-run",
    validationStatus: "valid",
    ...overrides,
  };
}

describe("odds observation contract", () => {
  it("computes vig-inclusive implied probability from American prices", () => {
    expect(impliedProbabilityFromAmerican(100)).toBeCloseTo(0.5, 10);
    expect(impliedProbabilityFromAmerican(-110)).toBeCloseTo(110 / 210, 10);
    expect(impliedProbabilityFromAmerican(320)).toBeCloseTo(100 / 420, 10);
    expect(() => impliedProbabilityFromAmerican(0)).toThrow();
  });

  it("validates a well-formed observation", () => {
    expect(validateOddsObservation(makeObservation()).errors).toEqual([]);
  });

  it("rejects malformed prices and probabilities", () => {
    expect(
      validateOddsObservation(makeObservation({ priceAmerican: 50 })).errors.join(),
    ).toContain("priceAmerican");
    expect(
      validateOddsObservation(makeObservation({ impliedProbability: 1.2 })).errors.join(),
    ).toContain("impliedProbability");
  });

  it("different prop lines can never group as the same quote", () => {
    const k55 = buildQuoteKey(makeObservation({ market: "k", side: "over", line: 5.5 }));
    const k65 = buildQuoteKey(makeObservation({ market: "k", side: "over", line: 6.5 }));
    expect(k55).not.toBe(k65);
  });

  it("different sides can never group as the same quote", () => {
    const over = buildQuoteKey(makeObservation({ market: "k", side: "over", line: 5.5 }));
    const under = buildQuoteKey(makeObservation({ market: "k", side: "under", line: 5.5 }));
    expect(over).not.toBe(under);
  });

  it("identical market observations share a quote key", () => {
    expect(buildQuoteKey(makeObservation())).toBe(buildQuoteKey(makeObservation()));
  });

  it("a one-sided market is not no-vig eligible", () => {
    expect(isNoVigEligible([makeObservation({ side: "yes" })])).toBe(false);
  });

  it("two sides at DIFFERENT books are not no-vig eligible", () => {
    expect(
      isNoVigEligible([
        makeObservation({ side: "yes", bookmaker: "fanduel" }),
        makeObservation({ side: "no", bookmaker: "draftkings", priceAmerican: -450, impliedProbability: impliedProbabilityFromAmerican(-450) }),
      ]),
    ).toBe(false);
  });

  it("two sides at DIFFERENT lines are not no-vig eligible", () => {
    expect(
      isNoVigEligible([
        makeObservation({ market: "k", side: "over", line: 5.5 }),
        makeObservation({ market: "k", side: "under", line: 6.5, priceAmerican: -130, impliedProbability: impliedProbabilityFromAmerican(-130) }),
      ]),
    ).toBe(false);
  });

  it("coherent two-sided prices at the same book and line are no-vig eligible", () => {
    expect(
      isNoVigEligible([
        makeObservation({ side: "yes" }),
        makeObservation({ side: "no", priceAmerican: -450, impliedProbability: impliedProbabilityFromAmerican(-450) }),
      ]),
    ).toBe(true);
  });

  it("invalid observations cannot make a market no-vig eligible", () => {
    expect(
      isNoVigEligible([
        makeObservation({ side: "yes" }),
        makeObservation({ side: "no", priceAmerican: -450, impliedProbability: impliedProbabilityFromAmerican(-450), validationStatus: "stale" }),
      ]),
    ).toBe(false);
  });
});
