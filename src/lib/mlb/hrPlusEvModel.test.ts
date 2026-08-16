import { describe, expect, it } from "vitest";
import {
  COMPONENT_RATIO_CAP,
  EXPECTED_PA_BY_ORDER,
  EXPECTED_PA_FALLBACK,
  MATCHUP_WEIGHTS,
  PITCHING_EXPOSURE_WEIGHTS,
  TOTAL_MATCHUP_CAP,
  americanOddsToImpliedProbability,
  capTotalMatchupMultiplier,
  combineWeightedMultipliers,
  comparePlusEvRows,
  computeExpectedValue,
  computeHrPa,
  computeHrProbability,
  evaluateHrPlusEv,
  expectedPaForBattingOrder,
  handednessSplitKey,
  labelFromEv,
  normalizePitcherHand,
  parseAmericanOdds,
  pitchingExposureMultiplier,
  probabilityToAmericanOdds,
  starterSusceptibilityMultiplier,
  type HrPlusEvBatterSource,
} from "./hrPlusEvModel";

function baseSource(overrides: Partial<HrPlusEvBatterSource> = {}): HrPlusEvBatterSource {
  return {
    player: "Test Batter",
    team: "BAL",
    opponent: "CHC",
    opposingPitcher: "Justin Steele",
    battingOrder: 3,
    bats: "R",
    pitcherHand: "L",
    parkFactor: 1,
    weatherBoost: 0,
    opposingPitcherHrVs: 50,
    hrOddsYes: "+425",
    seasonHomeRuns: 20,
    seasonPlateAppearances: 400,
    handednessSplits: {
      vsLeft: { homeRuns: 8, plateAppearances: 160 },
      vsRight: { homeRuns: 12, plateAppearances: 240 },
    },
    ...overrides,
  };
}

describe("HR/PA", () => {
  it("divides season HR by plate appearances, not at-bats", () => {
    expect(computeHrPa(21, 439)).toBeCloseTo(21 / 439, 12);
  });

  it("returns null for missing or non-positive PA", () => {
    expect(computeHrPa(10, 0)).toBeNull();
    expect(computeHrPa(10, null)).toBeNull();
    expect(computeHrPa(null, 400)).toBeNull();
    expect(computeHrPa(4, -10)).toBeNull();
  });

  it("allows a true zero-HR season rate", () => {
    expect(computeHrPa(0, 350)).toBe(0);
  });
});

describe("expected PA", () => {
  it("uses the batting-order table", () => {
    for (const [order, expected] of Object.entries(EXPECTED_PA_BY_ORDER)) {
      expect(expectedPaForBattingOrder(Number(order))).toEqual({
        expectedPa: expected,
        source: "batting-order",
      });
    }
  });

  it("falls back to 4.2 when batting order is unavailable", () => {
    expect(expectedPaForBattingOrder(null)).toEqual({ expectedPa: EXPECTED_PA_FALLBACK, source: "fallback" });
    expect(expectedPaForBattingOrder(0)).toEqual({ expectedPa: EXPECTED_PA_FALLBACK, source: "fallback" });
    expect(expectedPaForBattingOrder(10)).toEqual({ expectedPa: EXPECTED_PA_FALLBACK, source: "fallback" });
  });
});

describe("handedness mapping", () => {
  it("maps L/R pitcher hands onto the matching split key", () => {
    expect(normalizePitcherHand("L")).toBe("L");
    expect(normalizePitcherHand("RHP")).toBe("R");
    expect(normalizePitcherHand("switch")).toBeNull();
    expect(handednessSplitKey("L")).toBe("vsLeft");
    expect(handednessSplitKey("R")).toBe("vsRight");
    expect(handednessSplitKey(null)).toBeNull();
  });

  it("uses the split matching the starter hand, not a generic platoon boost", () => {
    const vsLeft = evaluateHrPlusEv(baseSource({
      pitcherHand: "L",
      seasonHomeRuns: 20,
      seasonPlateAppearances: 400,
      handednessSplits: {
        vsLeft: { homeRuns: 12, plateAppearances: 160 },
        vsRight: { homeRuns: 8, plateAppearances: 240 },
      },
    }));
    expect(vsLeft.hitterHandHrPa).toBeCloseTo(12 / 160, 12);
    expect(vsLeft.factors.hitterHandedness.status).toBe("ok");

    const vsRight = evaluateHrPlusEv(baseSource({
      pitcherHand: "R",
      seasonHomeRuns: 20,
      seasonPlateAppearances: 400,
      handednessSplits: {
        vsLeft: { homeRuns: 12, plateAppearances: 160 },
        vsRight: { homeRuns: 8, plateAppearances: 240 },
      },
    }));
    expect(vsRight.hitterHandHrPa).toBeCloseTo(8 / 240, 12);
  });
});

describe("starter / bullpen weighting and caps", () => {
  it("maps a 50 HR-VS score to a neutral starter multiplier", () => {
    expect(starterSusceptibilityMultiplier(50)).toBe(1);
    expect(starterSusceptibilityMultiplier(100)).toBeCloseTo(1.2, 8);
    expect(starterSusceptibilityMultiplier(0)).toBeCloseTo(0.8, 8);
    expect(starterSusceptibilityMultiplier(null)).toBeNull();
  });

  it("weights pitching exposure 65% starter / 35% bullpen", () => {
    expect(PITCHING_EXPOSURE_WEIGHTS.starter).toBe(0.65);
    expect(PITCHING_EXPOSURE_WEIGHTS.bullpen).toBe(0.35);
    expect(pitchingExposureMultiplier(1.2, 1)).toBeCloseTo(1.13, 8);
    expect(pitchingExposureMultiplier(1, 1.2)).toBeCloseTo(1.07, 8);
  });

  it("caps the total matchup multiplier at 0.70x–1.30x", () => {
    expect(capTotalMatchupMultiplier(1.8)).toBe(TOTAL_MATCHUP_CAP.max);
    expect(capTotalMatchupMultiplier(0.4)).toBe(TOTAL_MATCHUP_CAP.min);
    expect(capTotalMatchupMultiplier(1.17)).toBeCloseTo(1.17, 8);
  });

  it("combines component excesses by weight instead of adding raw percents", () => {
    const combined = combineWeightedMultipliers([
      { multiplier: 1.2, weight: MATCHUP_WEIGHTS.starter },
      { multiplier: 1, weight: 0.7 },
    ]);
    expect(combined).toBeCloseTo(1 + 0.3 * 0.2, 8);
  });
});

describe("HR probability, odds, and EV", () => {
  it("converts adjusted HR/PA and expected PA into 1-(1-p)^n", () => {
    expect(computeHrProbability(0.05, 4.4)).toBeCloseTo(1 - (1 - 0.05) ** 4.4, 12);
  });

  it("converts probability to mathematically correct American fair odds", () => {
    expect(probabilityToAmericanOdds(0.5)).toBe(-100);
    expect(probabilityToAmericanOdds(0.24)).toBe(317);
    expect(probabilityToAmericanOdds(0)).toBeNull();
    expect(probabilityToAmericanOdds(1)).toBeNull();
  });

  it("converts American odds into implied probability", () => {
    expect(americanOddsToImpliedProbability(425)).toBeCloseTo(100 / 525, 12);
    expect(americanOddsToImpliedProbability(-110)).toBeCloseTo(110 / 210, 12);
    expect(parseAmericanOdds("+425")).toBe(425);
    expect(parseAmericanOdds("-315")).toBe(-315);
    expect(parseAmericanOdds("oops")).toBeNull();
  });

  it("matches the +425 / 24% = +26.0% EV sanity check", () => {
    expect(computeExpectedValue(0.24, 425)).toBeCloseTo(0.26, 12);
  });
});

describe("value-label boundaries", () => {
  it("uses the published EV cutoffs", () => {
    expect(labelFromEv(0.15)).toBe("STRONG +EV");
    expect(labelFromEv(0.149)).toBe("MODERATE +EV");
    expect(labelFromEv(0.05)).toBe("MODERATE +EV");
    expect(labelFromEv(0.049)).toBe("FAIR");
    expect(labelFromEv(-0.049)).toBe("FAIR");
    expect(labelFromEv(-0.05)).toBe("OVERPRICED");
    expect(labelFromEv(null)).toBe("UNAVAILABLE");
  });
});

describe("missing data", () => {
  it("marks valuation unavailable without season HR/PA", () => {
    const valuation = evaluateHrPlusEv(baseSource({
      seasonHomeRuns: null,
      seasonPlateAppearances: null,
      handednessSplits: null,
    }));
    expect(valuation.available).toBe(false);
    expect(valuation.label).toBe("UNAVAILABLE");
    expect(valuation.ev).toBeNull();
    expect(valuation.unavailableReasons.join(" ")).toMatch(/Season HR\/PA/i);
  });

  it("does not substitute HR/AB when only at-bats exist", () => {
    const valuation = evaluateHrPlusEv({
      player: "AB Only",
      team: "BAL",
      opponent: "CHC",
      opposingPitcher: "Justin Steele",
      hrOddsYes: "+300",
    });
    expect(valuation.seasonHrPa).toBeNull();
    expect(valuation.available).toBe(false);
  });

  it("marks valuation unavailable without sportsbook odds", () => {
    const valuation = evaluateHrPlusEv(baseSource({ hrOddsYes: null }));
    expect(valuation.available).toBe(false);
    expect(valuation.label).toBe("UNAVAILABLE");
    expect(valuation.unavailableReasons.join(" ")).toMatch(/odds/i);
  });

  it("does not invent a pitcher or bullpen multiplier from a raw rate without a league baseline", () => {
    const valuation = evaluateHrPlusEv(baseSource({
      pitcherHrPaVsBatterHand: 0.04,
      bullpenHrPa: 0.035,
    }));
    expect(valuation.factors.pitcherHandedness.multiplier).toBe(1);
    expect(valuation.factors.bullpen.multiplier).toBe(1);
    expect(valuation.factors.pitcherHandedness.status).toBe("neutral-missing");
    expect(valuation.factors.bullpen.status).toBe("neutral-missing");
  });

  it("uses a league-neutral rate, not the hitter's HR/PA, for pitcher and bullpen factors", () => {
    const valuation = evaluateHrPlusEv(baseSource({
      pitcherHrPaVsBatterHand: 0.04,
      leaguePitcherHrPa: 0.032,
      bullpenHrPa: 0.028,
      leagueBullpenHrPa: 0.035,
    }));
    expect(valuation.factors.pitcherHandedness.status).toBe("ok");
    expect(valuation.factors.bullpen.status).toBe("ok");
    expect(valuation.factors.pitcherHandedness.multiplier).toBeCloseTo(0.04 / 0.032, 8);
    expect(valuation.factors.bullpen.multiplier).toBeCloseTo(0.028 / 0.035, 8);
  });

  it("defaults missing secondary matchup data to 1.00x and discloses it", () => {
    const valuation = evaluateHrPlusEv(baseSource({
      pitcherHrPaVsBatterHand: null,
      bullpenHrPa: null,
      last50PaHomeRuns: null,
      last100PaHomeRuns: null,
    }));
    expect(valuation.factors.pitcherHandedness.multiplier).toBe(1);
    expect(valuation.factors.bullpen.multiplier).toBe(1);
    expect(valuation.factors.recentTrend.multiplier).toBe(1);
    expect(valuation.factors.pitcherHandedness.status).toBe("neutral-missing");
    expect(valuation.factors.bullpen.status).toBe("neutral-missing");
    expect(valuation.factors.recentTrend.status).toBe("neutral-missing");
    expect(valuation.missingComponents).toEqual(expect.arrayContaining([
      "Pitcher HR/PA vs hitter hand",
      "Opponent bullpen HR/PA",
      "Weather",
      "Recent HR/PA trend",
    ]));
  });

  it("can still value a zero-HR season when odds exist", () => {
    const valuation = evaluateHrPlusEv(baseSource({
      seasonHomeRuns: 0,
      seasonPlateAppearances: 200,
      handednessSplits: {
        vsLeft: { homeRuns: 0, plateAppearances: 80 },
        vsRight: { homeRuns: 0, plateAppearances: 120 },
      },
    }));
    expect(valuation.available).toBe(true);
    expect(valuation.jkbHrProbability).toBe(0);
    expect(valuation.label).toBe("OVERPRICED");
  });
});

describe("rolling 50/100 PA", () => {
  it("does not treat whole-game or persisted counts as exact last-50/100 PA", () => {
    const valuation = evaluateHrPlusEv(baseSource({
      last50PaHomeRuns: 4,
      last50PaPlateAppearances: 52,
      last100PaHomeRuns: 7,
      last100PaPlateAppearances: 104,
    }));
    expect(valuation.last50HrPa).toBeNull();
    expect(valuation.last100HrPa).toBeNull();
    expect(valuation.factors.recentTrend.multiplier).toBe(1);
    expect(valuation.factors.recentTrend.status).toBe("neutral-missing");
    expect(valuation.factors.recentTrend.reason).toMatch(/exact last 50\/100 PA/i);
  });
});

describe("evaluateHrPlusEv integration", () => {
  it("prefers explicit season HR/PA over split sums", () => {
    const valuation = evaluateHrPlusEv(baseSource({
      seasonHomeRuns: 25,
      seasonPlateAppearances: 500,
    }));
    expect(valuation.seasonHomeRuns).toBe(25);
    expect(valuation.seasonPlateAppearances).toBe(500);
    expect(valuation.seasonHrPa).toBeCloseTo(0.05, 12);
  });

  it("derives season HR/PA from complete vsL+vsR splits when explicit season counts are absent", () => {
    const valuation = evaluateHrPlusEv(baseSource({
      seasonHomeRuns: null,
      seasonPlateAppearances: null,
    }));
    expect(valuation.seasonHomeRuns).toBe(20);
    expect(valuation.seasonPlateAppearances).toBe(400);
    expect(valuation.seasonHrPa).toBeCloseTo(0.05, 12);
  });

  it("does not convert weatherBoost into an HR-rate multiplier", () => {
    const withBoost = evaluateHrPlusEv(baseSource({ weatherBoost: 7.5 }));
    const withZero = evaluateHrPlusEv(baseSource({ weatherBoost: 0 }));
    expect(withBoost.factors.weather.multiplier).toBe(1);
    expect(withBoost.factors.weather.status).toBe("neutral-missing");
    expect(withBoost.factors.weather.reason).toMatch(/not a calibrated HR-rate multiplier/i);
    expect(withZero.factors.weather.multiplier).toBe(1);
    expect(withZero.factors.weather.status).toBe("neutral-missing");
  });

  it("restrains a huge hand-split ratio before it enters the mix", () => {
    const valuation = evaluateHrPlusEv(baseSource({
      pitcherHand: "L",
      seasonHomeRuns: 10,
      seasonPlateAppearances: 400,
      handednessSplits: {
        vsLeft: { homeRuns: 20, plateAppearances: 80 },
        vsRight: { homeRuns: 0, plateAppearances: 320 },
      },
    }));
    expect(valuation.factors.hitterHandedness.multiplier).toBe(COMPONENT_RATIO_CAP.max);
  });

  it("sorts available EV above unavailable rows", () => {
    const priced = evaluateHrPlusEv(baseSource({ player: "Priced", hrOddsYes: "+400" }));
    const missing = evaluateHrPlusEv(baseSource({ player: "Missing", hrOddsYes: null }));
    expect(comparePlusEvRows(priced, missing)).toBeLessThan(0);
    expect(comparePlusEvRows(missing, priced)).toBeGreaterThan(0);
  });
});
