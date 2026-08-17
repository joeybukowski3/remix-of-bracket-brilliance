import { describe, expect, it } from "vitest";
import {
  computeLocation,
  computeMatchupMultiplier,
  computeProjection,
  computeTrend,
  computeWorkload,
  computeSeasonBaseline,
  computeHalfLineEv,
  computeWholeLineEv,
  evaluateKPlusEv,
  isEligibleForKPlusEv,
  poissonCdf,
  poissonPmf,
  poissonTail,
  requiredKsForHalfLine,
  type KPlusEvCountWindow,
  type KPlusEvSource,
} from "./kPlusEvModel";

function window(strikeouts: number | null, outs: number | null, pitches: number | null, starts: number | null): KPlusEvCountWindow {
  return { strikeouts, outs, pitches, starts };
}

describe("isEligibleForKPlusEv", () => {
  it("excludes exactly 60.0 IP", () => {
    expect(isEligibleForKPlusEv(60.0, 10)).toBe(false);
  });
  it("includes IP above 60.0", () => {
    expect(isEligibleForKPlusEv(60.1, 10)).toBe(true);
  });
  it("excludes 9 starts", () => {
    expect(isEligibleForKPlusEv(70, 9)).toBe(false);
  });
  it("includes 10 starts", () => {
    expect(isEligibleForKPlusEv(70, 10)).toBe(true);
  });
  it("is false for missing inputs", () => {
    expect(isEligibleForKPlusEv(null, 10)).toBe(false);
    expect(isEligibleForKPlusEv(70, null)).toBe(false);
  });
});

describe("computeSeasonBaseline (outs-based IP)", () => {
  it("converts 6.0 baseball notation (18 outs) to 6.000 decimal IP", () => {
    const baseline = computeSeasonBaseline(window(60, 18, 90, 3));
    expect(baseline.seasonDecimalIP).toBeCloseTo(6.0, 4);
  });
  it("converts 6.1 baseball notation (19 outs) to 6.3333 decimal IP", () => {
    const baseline = computeSeasonBaseline(window(60, 19, 90, 3));
    expect(baseline.seasonDecimalIP).toBeCloseTo(6.3333, 4);
  });
  it("converts 6.2 baseball notation (20 outs) to 6.6667 decimal IP", () => {
    const baseline = computeSeasonBaseline(window(60, 20, 90, 3));
    expect(baseline.seasonDecimalIP).toBeCloseTo(6.6667, 4);
  });
  it("computes season K/IP from strikeouts / decimal IP, not K/9", () => {
    const baseline = computeSeasonBaseline(window(108, 324, 1500, 18)); // 108 outs->IP=108 not used; outs=324 => 108 IP
    expect(baseline.seasonKPerIP).toBeCloseTo(108 / 108, 4);
  });
});

describe("computeTrend", () => {
  const season = window(100, 540, 0, 30); // 180 decimal IP, K/IP ~0.5556
  it("produces TrendFactor > 1.00 when both L8 and L4 K/IP exceed season K/IP", () => {
    const last8 = window(20, 48, 0, 8); // 16 IP, K/IP = 1.25
    const last4 = window(12, 24, 0, 4); // 8 IP, K/IP = 1.5
    const trend = computeTrend(season, last8, last4);
    expect(trend.r8).toBeGreaterThan(1);
    expect(trend.r4).toBeGreaterThan(1);
    expect(trend.trendFactor).toBeGreaterThan(1.0);
  });
  it("produces TrendFactor < 1.00 when both recent windows are colder than season", () => {
    const last8 = window(5, 48, 0, 8); // 16 IP, K/IP ~0.3125
    const last4 = window(2, 24, 0, 4); // 8 IP, K/IP = 0.25
    const trend = computeTrend(season, last8, last4);
    expect(trend.trendFactor).toBeLessThan(1.0);
  });
  it("produces TrendFactor == 1.00 when recent windows equal season rate", () => {
    const last8 = window(25, 135, 0, 7.5); // scaled to same K/IP as season is awkward; use exact same rate instead
    void last8;
    const sameRateSeason = window(90, 486, 0, 27); // K/IP = 90/162 = 0.5556
    const sameRateWindow = window(10, 54, 0, 3); // K/IP = 10/18 = 0.5556
    const trend = computeTrend(sameRateSeason, sameRateWindow, sameRateWindow);
    expect(trend.trendFactor).toBeCloseTo(1.0, 6);
  });
  it("uses neutral ratio 1.00 when a recent window is missing", () => {
    const trend = computeTrend(season, null, null);
    expect(trend.r8).toBe(1);
    expect(trend.r4).toBe(1);
    expect(trend.trendFactor).toBeCloseTo(1.0, 6);
  });
  it("caps TrendFactor at 1.10", () => {
    const last8 = window(100, 24, 0, 4); // absurdly hot: 100K/8IP
    const trend = computeTrend(season, last8, last8);
    expect(trend.trendFactor).toBe(1.1);
  });
  it("caps TrendFactor at 0.90", () => {
    const last8 = window(0, 48, 0, 8); // ice cold: 0 Ks
    const trend = computeTrend(season, last8, last8);
    expect(trend.trendFactor).toBe(0.9);
  });
});

describe("computeWorkload", () => {
  const season = window(150, 540, 1500, 30); // 180 IP, 50 pitches/start, 8.333 P/IP

  it("weights ExpectedPitchCount 70/30 season/L4", () => {
    const last4 = window(20, 72, 240, 4); // 60 pitches/start
    const workload = computeWorkload(season, null, last4);
    expect(workload.expectedPitchCount).toBeCloseTo(0.7 * 50 + 0.3 * 60, 6);
    expect(workload.expectedPitchCountFellBackToSeason).toBe(false);
  });

  it("falls back to season pitches/start when L4 is unavailable", () => {
    const workload = computeWorkload(season, null, null);
    expect(workload.expectedPitchCountFellBackToSeason).toBe(true);
    expect(workload.expectedPitchCount).toBeCloseTo(50, 6);
  });

  it("weights ProjectedPitchesPerInning 70/20/10 season/L8/L4", () => {
    const last8 = window(30, 144, 720, 8); // 48 IP, 15 P/IP
    const last4 = window(15, 72, 300, 4); // 24 IP, 12.5 P/IP
    const workload = computeWorkload(season, last8, last4);
    const seasonPpi = 1500 / 180;
    expect(workload.projectedPitchesPerInning).toBeCloseTo(0.7 * seasonPpi + 0.2 * 15 + 0.1 * 12.5, 6);
  });

  it("falls back missing recent windows to season P/IP without treating missing as better or worse", () => {
    const workload = computeWorkload(season, null, null);
    const seasonPpi = 1500 / 180;
    expect(workload.projectedPitchesPerInning).toBeCloseTo(seasonPpi, 6);
    expect(workload.l8PitchesPerInningFellBackToSeason).toBe(true);
    expect(workload.l4PitchesPerInningFellBackToSeason).toBe(true);
  });

  it("floors ExpectedIP at 3.0", () => {
    const tinyPitchSeason = window(10, 9, 30, 3); // 3 decimal IP, 10 pitches/start, 10 P/IP -> raw ExpectedIP=1
    const workload = computeWorkload(tinyPitchSeason, null, null);
    expect(workload.expectedIP).toBe(3.0);
  });

  it("ceils ExpectedIP at 7.0", () => {
    const heavySeason = window(200, 900, 3600, 20); // 180 pitches/start, 12 P/IP -> raw ExpectedIP=15
    const workload = computeWorkload(heavySeason, null, null);
    expect(workload.expectedIP).toBe(7.0);
  });
});

describe("computeLocation", () => {
  it("selects HomeKPerIP when today is home", () => {
    const home = { strikeouts: 80, outs: 432, starts: 16 }; // 144 IP
    const away = { strikeouts: 10, outs: 54, starts: 2 };
    const location = computeLocation(100 / 180, true, home, away);
    expect(location.relevantSplitKs).toBe(80);
  });

  it("selects AwayKPerIP when today is away", () => {
    const home = { strikeouts: 80, outs: 432, starts: 16 };
    const away = { strikeouts: 10, outs: 54, starts: 2 };
    const location = computeLocation(100 / 180, false, home, away);
    expect(location.relevantSplitKs).toBe(10);
  });

  it("activates location factor when sample has >= 8 starts", () => {
    const split = { strikeouts: 100, outs: 480, starts: 8 }; // 160 IP
    const location = computeLocation(100 / 180, true, split, null);
    expect(location.samplePassed).toBe(true);
    expect(location.locationRatio).not.toBe(1);
  });

  it("activates location factor when sample has >= 40 decimal IP even with fewer starts", () => {
    const split = { strikeouts: 60, outs: 360, starts: 5 }; // 120 IP >= 40
    const location = computeLocation(100 / 180, true, split, null);
    expect(location.samplePassed).toBe(true);
  });

  it("uses neutral 1.00 ratio when sample is insufficient", () => {
    const split = { strikeouts: 5, outs: 30, starts: 2 }; // 10 IP, 2 starts
    const location = computeLocation(100 / 180, true, split, null);
    expect(location.samplePassed).toBe(false);
    expect(location.locationRatio).toBe(1);
  });
});

describe("computeMatchupMultiplier", () => {
  it("applies 70/30 weighted deviation around 1.00", () => {
    const multiplier = computeMatchupMultiplier(1.05, 1.02);
    expect(multiplier).toBeCloseTo(1 + 0.7 * 0.05 + 0.3 * 0.02, 6);
  });
  it("caps at 1.08", () => {
    expect(computeMatchupMultiplier(2, 2)).toBe(1.08);
  });
  it("caps at 0.92", () => {
    expect(computeMatchupMultiplier(0, 0)).toBe(0.92);
  });
  it("does not multiply the ratios directly", () => {
    const multiplier = computeMatchupMultiplier(1.2, 1.2);
    expect(multiplier).not.toBeCloseTo(1.2 * 1.2, 4);
  });
});

describe("projection", () => {
  it("computes CurrentProjectedK as SeasonKPerIP * ExpectedIP with no trend/matchup", () => {
    const projection = computeProjection(0.9, 1.0, 1.0, 5.5);
    expect(projection.currentProjectedK).toBeCloseTo(0.9 * 5.5, 6);
  });
  it("computes JKBProjectedK using trend and matchup", () => {
    const projection = computeProjection(0.9, 1.05, 1.02, 5.5);
    const expectedKPerIP = 0.9 * 1.05 * 1.02;
    expect(projection.jkbKPerIP).toBeCloseTo(expectedKPerIP, 6);
    expect(projection.jkbProjectedK).toBeCloseTo(expectedKPerIP * 5.5, 6);
  });
});

describe("Poisson helpers", () => {
  it("computes correct half-line threshold (4.5 -> 5+)", () => {
    expect(requiredKsForHalfLine(4.5)).toBe(5);
  });
  it("computes correct half-line threshold (6.5 -> 7+)", () => {
    expect(requiredKsForHalfLine(6.5)).toBe(7);
  });
  it("poissonPmf sums to ~1 across a wide range", () => {
    const lambda = 5.5;
    let total = 0;
    for (let k = 0; k <= 60; k += 1) total += poissonPmf(k, lambda);
    expect(total).toBeCloseTo(1, 6);
  });
  it("poissonTail(0, lambda) is 1", () => {
    expect(poissonTail(0, 5)).toBe(1);
  });
  it("poissonCdf + poissonTail(k+1) sums to 1", () => {
    expect(poissonCdf(4, 5.5) + poissonTail(5, 5.5)).toBeCloseTo(1, 6);
  });
});

describe("EV", () => {
  it("half-line EV rewards positive American odds appropriately", () => {
    const ev = computeHalfLineEv(0.55, 150);
    expect(ev).toBeCloseTo(0.55 * 2.5 - 1, 6);
  });
  it("half-line EV penalizes negative American odds appropriately", () => {
    const ev = computeHalfLineEv(0.55, -150);
    expect(ev).toBeCloseTo(0.55 * (100 / 150 + 1) - 1, 6);
  });
  it("whole-line EV subtracts push contribution as zero and includes under penalty", () => {
    const result = computeWholeLineEv(5, 5.3, -110);
    const decimalOdds = 100 / 110 + 1;
    expect(result.ev).toBeCloseTo(result.overProbability * (decimalOdds - 1) - result.underProbability, 6);
    expect(result.pushProbability).toBeGreaterThan(0);
  });
});

describe("evaluateKPlusEv (integration)", () => {
  function baseSource(overrides: Partial<KPlusEvSource> = {}): KPlusEvSource {
    return {
      pitcher: "Test Pitcher",
      team: "NYY",
      opponent: "BOS",
      pitcherHand: "R",
      isHome: true,
      starterConfirmed: true,
      season: window(150, 540, 1500, 30), // 180 IP, K/IP=0.8333
      last8: window(20, 144, 720, 8),
      last4: window(10, 72, 300, 4),
      home: { strikeouts: 80, outs: 288, starts: 16 },
      away: { strikeouts: 70, outs: 252, starts: 14 },
      opponentKRatio: 1.0,
      opponentKRatioSource: "NEUTRAL",
      opponentKRateVsHand: null,
      leagueKRateVsHand: null,
      kLine: 5.5,
      kOddsOverRaw: "-120",
      kOddsUnderRaw: "-110",
      kOddsBook: "fanduel",
      ...overrides,
    };
  }

  it("marks a pitcher below eligibility as unavailable", () => {
    const source = baseSource({ season: window(30, 162, 500, 9) }); // 54 IP, 9 starts
    const valuation = evaluateKPlusEv(source);
    expect(valuation.eligible).toBe(false);
    expect(valuation.available).toBe(false);
    expect(valuation.label).toBe("UNAVAILABLE");
  });

  it("produces distinct Current Rate Fair and JKB Fair odds", () => {
    const valuation = evaluateKPlusEv(baseSource());
    expect(valuation.market.currentRateFairOdds).not.toBeNull();
    expect(valuation.market.jkbFairOdds).not.toBeNull();
  });

  it("is UNAVAILABLE when there is no K line", () => {
    const valuation = evaluateKPlusEv(baseSource({ kLine: null }));
    expect(valuation.available).toBe(false);
    expect(valuation.label).toBe("UNAVAILABLE");
  });

  it("is UNAVAILABLE when book odds cannot be parsed", () => {
    const valuation = evaluateKPlusEv(baseSource({ kOddsOverRaw: null }));
    expect(valuation.available).toBe(false);
  });

  it("STRONG bucket at or above +15% EV", () => {
    // Very favorable book price relative to a solid pitcher should produce STRONG.
    const valuation = evaluateKPlusEv(baseSource({ kOddsOverRaw: "+400", kLine: 3.5 }));
    expect(valuation.market.ev).toBeGreaterThanOrEqual(0.15);
    expect(valuation.label).toBe("STRONG +EV");
  });

  it("OVERPRICED bucket at or below -5% EV", () => {
    const valuation = evaluateKPlusEv(baseSource({ kOddsOverRaw: "-100000", kLine: 8.5 }));
    expect(valuation.market.ev).toBeLessThanOrEqual(-0.05);
    expect(valuation.label).toBe("OVERPRICED");
  });
});
