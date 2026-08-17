import { describe, expect, it } from "vitest";
import {
  COMPONENT_RATIO_CAP,
  EXPECTED_PA_BY_ORDER,
  EXPECTED_PA_FALLBACK,
  MATCHUP_WEIGHTS,
  PITCHING_EXPOSURE_WEIGHTS,
  PLUS_EV_MIN_SEASON_PA,
  RECENT_TREND_CAP,
  TOTAL_MATCHUP_CAP,
  americanOddsToDecimal,
  americanOddsToImpliedProbability,
  capTotalMatchupMultiplier,
  combineWeightedMultipliers,
  comparePlusEvRows,
  computeExpectedValue,
  computePaPerHr,
  computeTrendFactor,
  classifySeasonSample,
  computeHrPa,
  computeHrProbability,
  evaluateHrPlusEv,
  expectedPaForBattingOrder,
  formatSeasonPaHr,
  formatTrendWindow,
  handednessSplitKey,
  isPlusEvEligible,
  labelFromEv,
  normalizePitcherHand,
  parseAmericanOdds,
  pitchingExposureMultiplier,
  probabilityToAmericanOdds,
  starterSusceptibilityMultiplier,
  trendWindowRatio,
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

describe("season PA/HR display", () => {
  it("computes PA per HR", () => {
    expect(computePaPerHr(24, 370)).toBeCloseTo(370 / 24, 12);
  });

  it("returns null instead of Infinity for zero season HR", () => {
    expect(computePaPerHr(0, 325)).toBeNull();
  });

  it("formats a normal season as PA/HR", () => {
    expect(formatSeasonPaHr(24, 370)).toBe(`${(370 / 24).toFixed(1)} PA/HR`);
  });

  it("formats a zero-HR season as an explicit HR/PA count, never Infinity", () => {
    const display = formatSeasonPaHr(0, 325);
    expect(display).toBe("0 HR / 325 PA");
    expect(display).not.toMatch(/infinity/i);
  });

  it("formats missing season data as a dash", () => {
    expect(formatSeasonPaHr(null, null)).toBe("—");
  });
});

describe("+EV eligibility (>300 season PA)", () => {
  it("excludes exactly 300 PA", () => {
    expect(isPlusEvEligible(300)).toBe(false);
  });

  it("excludes 299 PA", () => {
    expect(isPlusEvEligible(299)).toBe(false);
  });

  it("includes 301 PA", () => {
    expect(isPlusEvEligible(301)).toBe(true);
  });

  it("excludes missing PA", () => {
    expect(isPlusEvEligible(null)).toBe(false);
    expect(isPlusEvEligible(undefined)).toBe(false);
  });

  it("PLUS_EV_MIN_SEASON_PA is 300", () => {
    expect(PLUS_EV_MIN_SEASON_PA).toBe(300);
  });

  it("evaluateHrPlusEv marks an ineligible batter unavailable before computing JKB HR%/Fair/EV", () => {
    const valuation = evaluateHrPlusEv(baseSource({ seasonPlateAppearances: 300, seasonHomeRuns: 20 }));
    expect(valuation.eligible).toBe(false);
    expect(valuation.available).toBe(false);
    expect(valuation.jkbHrProbability).toBeNull();
    expect(valuation.fairOddsAmerican).toBeNull();
    expect(valuation.ev).toBeNull();
    expect(valuation.currentRateHrProbability).toBeNull();
    expect(valuation.label).toBe("UNAVAILABLE");
    expect(valuation.unavailableReasons.join(" ")).toMatch(/more than 300 season plate appearances/i);
  });

  it("evaluateHrPlusEv computes a full valuation for a 301 PA batter", () => {
    const valuation = evaluateHrPlusEv(baseSource({ seasonPlateAppearances: 301, seasonHomeRuns: 20 }));
    expect(valuation.eligible).toBe(true);
    expect(valuation.jkbHrProbability).not.toBeNull();
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

describe("Current Rate Fair (raw season rate, no trend/matchup)", () => {
  it("computes probability from raw season HR/PA and expected PA only", () => {
    const valuation = evaluateHrPlusEv(baseSource({
      seasonHomeRuns: 24,
      seasonPlateAppearances: 370,
      battingOrder: 4,
    }));
    const expectedProb = 1 - (1 - 24 / 370) ** 4.3;
    expect(valuation.currentRateHrProbability).toBeCloseTo(expectedProb, 10);
    expect(valuation.currentRateFairOddsAmerican).toBe(probabilityToAmericanOdds(expectedProb));
  });

  it("does not include trend or matchup adjustments", () => {
    const noisy = evaluateHrPlusEv(baseSource({
      seasonHomeRuns: 24,
      seasonPlateAppearances: 370,
      battingOrder: 4,
      opposingPitcherHrVs: 100, // would move Matchup if it leaked in
      last30HomeRuns: 10,
      last30PlateAppearances: 60, // would move Trend if it leaked in
    }));
    const expectedProb = 1 - (1 - 24 / 370) ** 4.3;
    expect(noisy.currentRateHrProbability).toBeCloseTo(expectedProb, 10);
  });

  it("is unavailable (not fair-priced) for a zero-HR season", () => {
    const valuation = evaluateHrPlusEv(baseSource({ seasonHomeRuns: 0, seasonPlateAppearances: 325 }));
    expect(valuation.currentRateHrProbability).toBe(0);
    expect(valuation.currentRateFairOddsAmerican).toBeNull();
  });
});

describe("HR Trend (real L14/L30 calendar windows)", () => {
  it("neutral ratio (1.00) when both windows are equal to the season rate", () => {
    const valuation = evaluateHrPlusEv(baseSource({
      seasonHomeRuns: 20,
      seasonPlateAppearances: 400, // 0.05 HR/PA
      last30HomeRuns: 10,
      last30PlateAppearances: 200, // 0.05 HR/PA
      last14HomeRuns: 5,
      last14PlateAppearances: 100, // 0.05 HR/PA
    }));
    expect(valuation.trendFactor).toBeCloseTo(1.0, 10);
  });

  it("hot recent rate produces TrendFactor > 1.00", () => {
    const valuation = evaluateHrPlusEv(baseSource({
      seasonHomeRuns: 20,
      seasonPlateAppearances: 400, // 0.05 HR/PA
      last30HomeRuns: 10,
      last30PlateAppearances: 100, // 0.10 HR/PA -- hotter than season
      last14HomeRuns: 5,
      last14PlateAppearances: 50, // 0.10 HR/PA -- hotter than season
    }));
    expect(valuation.trendFactor).toBeGreaterThan(1.0);
  });

  it("cold recent rate produces TrendFactor < 1.00", () => {
    const valuation = evaluateHrPlusEv(baseSource({
      seasonHomeRuns: 20,
      seasonPlateAppearances: 400, // 0.05 HR/PA
      last30HomeRuns: 3,
      last30PlateAppearances: 200, // 0.015 HR/PA -- colder than season
      last14HomeRuns: 1,
      last14PlateAppearances: 100, // 0.01 HR/PA -- colder than season
    }));
    expect(valuation.trendFactor).toBeLessThan(1.0);
  });

  it("does not invert the ratio: does not produce >1.00 from a cold streak", () => {
    const valuation = evaluateHrPlusEv(baseSource({
      seasonHomeRuns: 20,
      seasonPlateAppearances: 400,
      last30HomeRuns: 2,
      last30PlateAppearances: 200,
      last14HomeRuns: 1,
      last14PlateAppearances: 100,
    }));
    expect(valuation.trendFactor).toBeLessThan(1.0);
    expect(valuation.trendFactor).not.toBeGreaterThan(1.0);
  });

  it("a real populated 0-HR window is a valid cold signal, not Infinity or a dash", () => {
    const valuation = evaluateHrPlusEv(baseSource({
      seasonHomeRuns: 20,
      seasonPlateAppearances: 400,
      last14HomeRuns: 0,
      last14PlateAppearances: 51,
    }));
    expect(valuation.last14HomeRuns).toBe(0);
    expect(valuation.last14PlateAppearances).toBe(51);
    expect(valuation.last14HrPa).toBe(0);
    expect(formatTrendWindow(0, 51)).toBe("0 HR / 51 PA");
    expect(formatTrendWindow(0, 51)).not.toMatch(/infinity/i);
  });

  it("a genuinely unavailable window is neutral (ratio 1.00), never treated as cold", () => {
    const valuation = evaluateHrPlusEv(baseSource({
      seasonHomeRuns: 20,
      seasonPlateAppearances: 400,
      last14HomeRuns: null,
      last14PlateAppearances: null,
      last30HomeRuns: null,
      last30PlateAppearances: null,
    }));
    expect(valuation.last14HrPa).toBeNull();
    expect(valuation.last30HrPa).toBeNull();
    expect(valuation.trendAvailable).toBe(false);
    expect(valuation.trendFactor).toBeCloseTo(1.0, 10);
    expect(formatTrendWindow(null, null)).toBe("unavailable");
  });

  it("caps TrendFactor at 0.90x on the low end", () => {
    const valuation = evaluateHrPlusEv(baseSource({
      seasonHomeRuns: 20,
      seasonPlateAppearances: 400,
      last30HomeRuns: 0,
      last30PlateAppearances: 100,
      last14HomeRuns: 0,
      last14PlateAppearances: 50,
    }));
    expect(valuation.trendFactor).toBe(RECENT_TREND_CAP.min);
  });

  it("caps TrendFactor at 1.10x on the high end", () => {
    const valuation = evaluateHrPlusEv(baseSource({
      seasonHomeRuns: 10,
      seasonPlateAppearances: 400, // 0.025 HR/PA
      last30HomeRuns: 10,
      last30PlateAppearances: 50, // 0.20 HR/PA -- far hotter
      last14HomeRuns: 6,
      last14PlateAppearances: 25, // 0.24 HR/PA -- far hotter
    }));
    expect(valuation.trendFactor).toBe(RECENT_TREND_CAP.max);
  });

  it("trendWindowRatio is neutral when the season rate is zero or missing", () => {
    expect(trendWindowRatio(0.05, 0)).toBe(1);
    expect(trendWindowRatio(0.05, null)).toBe(1);
    expect(trendWindowRatio(null, 0.05)).toBe(1);
  });

  it("computeTrendFactor formula: 0.70 base + 0.20*r30 + 0.10*r14", () => {
    expect(computeTrendFactor(1, 1)).toBeCloseTo(1.0, 10);
    expect(computeTrendFactor(2, 2)).toBe(RECENT_TREND_CAP.max);
    expect(computeTrendFactor(0, 0)).toBe(RECENT_TREND_CAP.min);
  });

  it("regression sanity check: hotter recent PA/HR than season PA/HR must yield TrendFactor > 1.00", () => {
    // Season: 24 HR / 370 PA => 15.4 PA/HR. L30 PA/HR = 12.8 (128 PA / 10 HR).
    // L14 PA/HR = 10.5 (105 PA / 10 HR). Lower PA/HR = more frequent HRs =
    // objectively hotter than season, so TrendFactor must exceed 1.00.
    const valuation = evaluateHrPlusEv(baseSource({
      seasonHomeRuns: 24,
      seasonPlateAppearances: 370,
      battingOrder: 4,
      last30HomeRuns: 10,
      last30PlateAppearances: 128,
      last14HomeRuns: 10,
      last14PlateAppearances: 105,
      hrOddsYes: "+400",
    }));
    expect(valuation.trendFactor).toBeGreaterThan(1.0);
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

  it("matches the +425 / 24% = +26.0% EV sanity check (positive odds)", () => {
    expect(computeExpectedValue(0.24, 425)).toBeCloseTo(0.26, 12);
  });

  it("supports negative American odds", () => {
    expect(americanOddsToDecimal(-150)).toBeCloseTo(1 + 100 / 150, 10);
    expect(computeExpectedValue(0.5, -150)).toBeCloseTo(0.5 * (1 + 100 / 150) - 1, 10);
  });

  it("evaluateHrPlusEv computes EV with negative book odds", () => {
    const valuation = evaluateHrPlusEv(baseSource({
      seasonHomeRuns: 40,
      seasonPlateAppearances: 400, // 0.10 HR/PA, very high
      hrOddsYes: "-120",
    }));
    expect(valuation.bookOddsAmerican).toBe(-120);
    expect(valuation.ev).not.toBeNull();
    expect(valuation.ev).toBeCloseTo(
      (valuation.jkbHrProbability as number) * americanOddsToDecimal(-120) - 1,
      10,
    );
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

describe("JKB HR% (season rate + trend + matchup + expected PA)", () => {
  it("differs from Current Rate Fair once trend/matchup are non-neutral", () => {
    const valuation = evaluateHrPlusEv(baseSource({
      seasonHomeRuns: 20,
      seasonPlateAppearances: 400,
      opposingPitcherHrVs: 90, // pushes Matchup above neutral
      last30HomeRuns: 8,
      last30PlateAppearances: 100, // hot L30 pushes Trend above neutral
    }));
    expect(valuation.trendFactor).toBeGreaterThan(1.0);
    expect(valuation.totalMatchupMultiplier).toBeGreaterThan(1.0);
    expect(valuation.jkbHrProbability).not.toBeNull();
    expect(valuation.currentRateHrProbability).not.toBeNull();
    expect(valuation.jkbHrProbability as number).toBeGreaterThan(valuation.currentRateHrProbability as number);
  });

  it("chains seasonHrPa -> trendAdjustedHrPa -> jkbHrPa -> jkbHrProbability", () => {
    const valuation = evaluateHrPlusEv(baseSource({
      seasonHomeRuns: 20,
      seasonPlateAppearances: 400,
      last30HomeRuns: 8,
      last30PlateAppearances: 100,
      last14HomeRuns: 4,
      last14PlateAppearances: 50,
    }));
    const expectedTrendAdjusted = (valuation.seasonHrPa as number) * valuation.trendFactor;
    expect(valuation.trendAdjustedHrPa).toBeCloseTo(expectedTrendAdjusted, 10);
    const expectedJkbHrPa = expectedTrendAdjusted * valuation.totalMatchupMultiplier;
    expect(valuation.jkbHrPa).toBeCloseTo(expectedJkbHrPa, 10);
    expect(valuation.jkbHrProbability).toBeCloseTo(
      computeHrProbability(expectedJkbHrPa, valuation.expectedPa),
      10,
    );
  });

  it("JKB Fair is visibly distinct from Current Rate Fair", () => {
    const valuation = evaluateHrPlusEv(baseSource({
      seasonHomeRuns: 20,
      seasonPlateAppearances: 400,
      opposingPitcherHrVs: 90,
      last30HomeRuns: 8,
      last30PlateAppearances: 100,
    }));
    expect(valuation.fairOddsAmerican).not.toBe(valuation.currentRateFairOddsAmerican);
  });
});

describe("zero season HR handling", () => {
  it("keeps JKB HR% at 0 but marks Current Rate Fair, JKB Fair, and EV unavailable", () => {
    const valuation = evaluateHrPlusEv(baseSource({
      seasonHomeRuns: 0,
      seasonPlateAppearances: 325,
      handednessSplits: {
        vsLeft: { homeRuns: 0, plateAppearances: 130 },
        vsRight: { homeRuns: 0, plateAppearances: 195 },
      },
    }));
    expect(valuation.eligible).toBe(true);
    expect(valuation.available).toBe(true);
    expect(valuation.seasonPaPerHr).toBeNull();
    expect(valuation.currentRateHrProbability).toBe(0);
    expect(valuation.currentRateFairOddsAmerican).toBeNull();
    expect(valuation.jkbHrProbability).toBe(0);
    expect(valuation.fairOddsAmerican).toBeNull();
    expect(valuation.ev).toBeNull();
    expect(valuation.label).toBe("UNAVAILABLE");
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
    expect(valuation.eligible).toBe(false);
    expect(valuation.label).toBe("UNAVAILABLE");
    expect(valuation.ev).toBeNull();
    expect(valuation.unavailableReasons.join(" ")).toMatch(/Season HR\/PA/i);
  });

  it("does not fall back to vsL+vsR split sums when authoritative season totals are missing", () => {
    const valuation = evaluateHrPlusEv(baseSource({
      seasonHomeRuns: null,
      seasonPlateAppearances: null,
    }));
    expect(valuation.available).toBe(false);
    expect(valuation.seasonHrPa).toBeNull();
    expect(valuation.sampleLabel).toBeNull();
    expect(valuation.label).toBe("UNAVAILABLE");
    expect(valuation.unavailableReasons.join(" ")).toMatch(/Authoritative season/i);
    expect(valuation.unavailableReasons.join(" ")).toMatch(/Handedness-split sums/i);
    expect(valuation.hitterHandHrPa).toBeCloseTo(8 / 160, 12);
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

  it("defaults missing secondary matchup data to 1.00x and discloses it, including recentTrend staying neutral inside Matchup", () => {
    const valuation = evaluateHrPlusEv(baseSource({
      pitcherHrPaVsBatterHand: null,
      bullpenHrPa: null,
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
});

describe("season sample classification", () => {
  it("uses the published PA boundaries", () => {
    expect(classifySeasonSample(74)).toBe("VERY LIMITED");
    expect(classifySeasonSample(75)).toBe("LIMITED");
    expect(classifySeasonSample(124)).toBe("LIMITED");
    expect(classifySeasonSample(125)).toBe("MODERATE");
    expect(classifySeasonSample(199)).toBe("MODERATE");
    expect(classifySeasonSample(200)).toBe("ESTABLISHED");
    expect(classifySeasonSample(null)).toBeNull();
  });
});

describe("evaluateHrPlusEv integration", () => {
  it("uses only authoritative seasonHomeRuns / seasonPlateAppearances for the baseline", () => {
    const valuation = evaluateHrPlusEv(baseSource({
      seasonHomeRuns: 25,
      seasonPlateAppearances: 500,
    }));
    expect(valuation.seasonHomeRuns).toBe(25);
    expect(valuation.seasonPlateAppearances).toBe(500);
    expect(valuation.seasonHrPa).toBeCloseTo(0.05, 12);
    expect(valuation.sampleLabel).toBe("ESTABLISHED");
    expect(valuation.hitterHandHrPa).toBeCloseTo(8 / 160, 12);
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
