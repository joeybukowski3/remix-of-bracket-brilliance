/**
 * compute-workload-projection-v3.test.mjs
 * Run via: node --test scripts/mlb-k/compute-workload-projection-v3.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

/** Minimal expect shim over node:assert, so this file matches repo convention. */
const expect = (actual) => ({
  toBe: (v) => assert.strictEqual(actual, v),
  toEqual: (v) => assert.deepStrictEqual(actual, v),
  toBeCloseTo: (v, digits = 2) => assert.ok(Math.abs(actual - v) < 10 ** -digits / 2,
    `expected ${actual} close to ${v}`),
  toBeGreaterThan: (v) => assert.ok(actual > v, `expected ${actual} > ${v}`),
  toBeGreaterThanOrEqual: (v) => assert.ok(actual >= v, `expected ${actual} >= ${v}`),
  toBeLessThan: (v) => assert.ok(actual < v, `expected ${actual} < ${v}`),
  toBeLessThanOrEqual: (v) => assert.ok(actual <= v, `expected ${actual} <= ${v}`),
  toHaveLength: (v) => assert.strictEqual(actual.length, v),
  toContain: (v) => assert.ok(actual.includes(v), `expected ${JSON.stringify(actual)} to contain ${v}`),
  toBeNull: () => assert.strictEqual(actual, null),
  not: {
    toBeNull: () => assert.notStrictEqual(actual, null),
  },
});

import {
  BF_PER_IP_MAX,
  BF_PER_IP_MIN,
  DEFAULTS,
  STARTER_BF_MAX,
  STARTER_BF_MIN,
  STARTER_IP_MAX,
  STARTER_IP_MIN,
  blendNeutralIp,
  expectedBfPerIp,
  performanceSupport,
  priorStarts,
  projectBattersFaced,
  regimeEvidence,
  regimeShiftedWeights,
  reliabilityWeight,
  robustIpPerStart,
  siteAdjustment,
} from "./mlb-k-workload-v3-core.mjs";

import {
  OPPONENT_DEFAULTS,
  leagueBaseline,
  opponentAdjustment,
  opponentObservations,
  opponentWorkloadEffect,
  starterExpectedIp,
  summarizeWindow,
} from "./mlb-k-opponent-sp-workload-v3.mjs";

import { computeWorkloadProjection } from "./compute-workload-projection.mjs";

import { computeWorkloadProjectionV3 } from "./compute-workload-projection-v3.mjs";

import { projectStrikeoutsV3, sampleSizeAlpha } from "../lib/mlb-k-projection-v3.mjs";

/** A normal-looking start: about six innings, ordinary traffic. */
const normalStart = (date, overrides = {}) => ({
  date,
  ip: 6,
  outs: 18,
  bf: 24,
  pitches: 95,
  strikeouts: 6,
  hits: 5,
  walks: 1,
  isHome: true,
  ...overrides,
});

describe("neutral IP windows", () => {
  it("returns only starts strictly before the as-of date, newest first", () => {
    const log = [normalStart("2026-08-01"), normalStart("2026-08-20"), normalStart("2026-08-10")];
    const window = priorStarts(log, "2026-08-20");
    expect(window.map((s) => s.date)).toEqual(["2026-08-10", "2026-08-01"]);
  });

  it("never lets the projected game itself into the window", () => {
    const log = [normalStart("2026-08-20"), normalStart("2026-08-19")];
    expect(priorStarts(log, "2026-08-20").map((s) => s.date)).toEqual(["2026-08-19"]);
  });

  it("splits last 10 and last 5 at the right depth", () => {
    const log = Array.from({ length: 14 }, (_, i) => normalStart(`2026-08-${String(i + 1).padStart(2, "0")}`));
    expect(priorStarts(log, "2026-09-01", 10)).toHaveLength(10);
    expect(priorStarts(log, "2026-09-01", 10).slice(0, 5).map((s) => s.date)).toEqual([
      "2026-08-14",
      "2026-08-13",
      "2026-08-12",
      "2026-08-11",
      "2026-08-10",
    ]);
  });

  it("weights the season anchor above last 10 above last 5", () => {
    const blend = blendNeutralIp(
      { seasonIpPerStart: 4, last10IpPerStart: 6, last5IpPerStart: 6 },
      DEFAULTS,
    );
    // 0.45*4 + 0.35*6 + 0.20*6 = 5.10
    expect(blend).toBeCloseTo(5.1, 10);
  });

  it("renormalizes over available windows when the season anchor is missing", () => {
    const blend = blendNeutralIp({ seasonIpPerStart: null, last10IpPerStart: 6, last5IpPerStart: 5 }, DEFAULTS);
    expect(blend).toBeCloseTo((0.35 * 6 + 0.2 * 5) / 0.55, 10);
  });
});

describe("robust recent-start weighting", () => {
  it("keeps a normal start at full weight", () => {
    expect(reliabilityWeight(normalStart("2026-08-01"), 6)).toBe(1);
  });

  it("never discounts a start that ran LONG", () => {
    expect(reliabilityWeight(normalStart("2026-08-01", { ip: 8, outs: 24 }), 5)).toBe(1);
  });

  it("downweights an unexplained one-inning exit to the floor", () => {
    const unexplained = normalStart("2026-08-01", { ip: 1, outs: 3, bf: 4, hits: 1, walks: 0, pitches: 20 });
    const weight = reliabilityWeight(unexplained, 5);
    expect(weight).toBeCloseTo(DEFAULTS.reliabilityFloor, 10);
  });

  it("gives a performance-explained blowup more weight than an unexplained exit", () => {
    const explained = normalStart("2026-08-01", { ip: 1, outs: 3, bf: 11, hits: 7, walks: 3, pitches: 55 });
    const unexplained = normalStart("2026-08-01", { ip: 1, outs: 3, bf: 4, hits: 1, walks: 0, pitches: 20 });
    const explainedWeight = reliabilityWeight(explained, 5);
    const unexplainedWeight = reliabilityWeight(unexplained, 5);
    expect(explainedWeight).toBeGreaterThan(unexplainedWeight);
    // still below a normal start, because it is still an extreme observation
    expect(explainedWeight).toBeLessThan(1);
  });

  it("is continuous, never binary include/exclude", () => {
    const weights = [5, 4, 3, 2, 1].map((ip) =>
      reliabilityWeight(normalStart("2026-08-01", { ip, outs: ip * 3 }), 6),
    );
    for (let i = 1; i < weights.length; i += 1) expect(weights[i]).toBeLessThan(weights[i - 1]);
    expect(Math.min(...weights)).toBeGreaterThanOrEqual(DEFAULTS.reliabilityFloor);
  });

  it("reads no performance support out of a start with no line at all", () => {
    expect(performanceSupport({ ip: 1, outs: 3 })).toBe(0);
  });

  it("pulls the window mean less than an unweighted mean would", () => {
    const window = [
      normalStart("2026-08-20", { ip: 1, outs: 3, bf: 4, hits: 1, walks: 0 }),
      normalStart("2026-08-14"),
      normalStart("2026-08-08"),
      normalStart("2026-08-02"),
      normalStart("2026-07-27"),
    ];
    const robust = robustIpPerStart(window);
    expect(robust.rawMean).toBeCloseTo(5, 10);
    expect(robust.value).toBeGreaterThan(robust.rawMean);
    expect(robust.value).toBeLessThan(6);
  });
});

describe("current workload regime", () => {
  const season = 4.8;
  const sustained = Array.from({ length: 10 }, (_, i) =>
    normalStart(`2026-08-${String(i + 1).padStart(2, "0")}`, { ip: 5.6, outs: 17 }),
  );

  it("recognises a sustained, consistent move above the season anchor", () => {
    const evidence = regimeEvidence({ seasonIpPerStart: season, last10Starts: sustained, last10IpPerStart: 5.6 });
    expect(evidence.consistency).toBe(1);
    expect(evidence.evidence).toBeGreaterThan(0.5);
  });

  it("moves weight OFF the season anchor and onto the recent windows", () => {
    const evidence = regimeEvidence({ seasonIpPerStart: season, last10Starts: sustained, last10IpPerStart: 5.6 });
    const shifted = regimeShiftedWeights(evidence.evidence, DEFAULTS);
    expect(shifted.seasonWeight).toBeLessThan(DEFAULTS.seasonWeight);
    expect(shifted.last10Weight).toBeGreaterThan(DEFAULTS.last10Weight);
    expect(shifted.seasonWeight + shifted.last10Weight + shifted.last5Weight).toBeCloseTo(1, 10);
  });

  it("stays put when recent starts are inconsistent even though the gap is large", () => {
    const noisy = sustained.map((s, i) => (i % 2 ? { ...s, ip: 4.0, outs: 12 } : s));
    const evidence = regimeEvidence({ seasonIpPerStart: season, last10Starts: noisy, last10IpPerStart: 4.8 });
    expect(evidence.evidence).toBe(0);
    expect(regimeShiftedWeights(evidence.evidence, DEFAULTS).seasonWeight).toBe(DEFAULTS.seasonWeight);
  });

  it("earns far less evidence from a tiny sample than from a full window", () => {
    const tiny = regimeEvidence({
      seasonIpPerStart: season,
      last10Starts: sustained.slice(0, 1),
      last10IpPerStart: 5.6,
    });
    const full = regimeEvidence({ seasonIpPerStart: season, last10Starts: sustained, last10IpPerStart: 5.6 });
    expect(tiny.evidence).toBeLessThan(full.evidence / 3);
  });

  it("produces no shift with no evidence", () => {
    expect(regimeShiftedWeights(0, DEFAULTS)).toEqual({ ...DEFAULTS });
  });
});

describe("home / away site adjustment", () => {
  it("shrinks a small-sample split toward zero", () => {
    const big = siteAdjustment({ siteIpPerStart: 6, siteGames: 14, seasonIpPerStart: 5.5 });
    const small = siteAdjustment({ siteIpPerStart: 6, siteGames: 2, seasonIpPerStart: 5.5 });
    expect(Math.abs(small.adjustment)).toBeLessThan(Math.abs(big.adjustment));
  });

  it("caps the site term so it can never dominate the baseline", () => {
    const extreme = siteAdjustment({ siteIpPerStart: 9, siteGames: 40, seasonIpPerStart: 4 });
    expect(extreme.adjustment).toBeCloseTo(DEFAULTS.siteCapIp, 10);
  });

  it("returns a neutral term when the split is unavailable", () => {
    expect(siteAdjustment({ siteIpPerStart: null, siteGames: null, seasonIpPerStart: 5.5 }).adjustment).toBe(0);
  });

  it("is signed toward the site level", () => {
    expect(siteAdjustment({ siteIpPerStart: 5, siteGames: 12, seasonIpPerStart: 5.5 }).adjustment).toBeLessThan(0);
  });
});

describe("opponent starter expected IP", () => {
  const league = 5.2;

  it("shrinks a thin own-log toward the league starter level", () => {
    const log = [normalStart("2026-07-01", { ip: 7, outs: 21 })];
    const { expectedIp } = starterExpectedIp(log, "2026-08-01", league);
    expect(expectedIp).toBeGreaterThan(league);
    expect(expectedIp).toBeLessThan(7);
  });

  it("falls back to the league level with no own starts at all", () => {
    expect(starterExpectedIp([], "2026-08-01", league).expectedIp).toBe(league);
  });

  it("trusts a deep own-log more than a thin one", () => {
    const deep = Array.from({ length: 10 }, (_, i) =>
      normalStart(`2026-07-${String(i + 1).padStart(2, "0")}`, { ip: 7, outs: 21 }),
    );
    const thin = deep.slice(0, 2);
    expect(starterExpectedIp(deep, "2026-08-01", league).expectedIp).toBeGreaterThan(
      starterExpectedIp(thin, "2026-08-01", league).expectedIp,
    );
  });
});

describe("opponent delta and opener fairness", () => {
  const build = (starts) => {
    const byPitcher = new Map();
    for (const s of starts) {
      if (!byPitcher.has(s.pitcherId)) byPitcher.set(s.pitcherId, []);
      byPitcher.get(s.pitcherId).push(s);
    }
    return byPitcher;
  };

  it("scores an opener who threw his usual inning as roughly neutral", () => {
    const opener = Array.from({ length: 8 }, (_, i) => ({
      ...normalStart(`2026-07-${String(i + 1).padStart(2, "0")}`, { ip: 1.1, outs: 3, bf: 5, hits: 1, walks: 0 }),
      pitcherId: 1,
      opponent: "OTH",
    }));
    const vsTeam = {
      ...normalStart("2026-08-01", { ip: 1, outs: 3, bf: 4, hits: 1, walks: 0 }),
      pitcherId: 1,
      opponent: "DET",
    };
    const log = [...opener, vsTeam];
    const observations = opponentObservations({
      team: "DET",
      asOfDate: "2026-09-01",
      startLog: log,
      logByPitcher: build(log),
      leagueIpPerStart: 1.1,
    });
    expect(observations).toHaveLength(1);
    expect(Math.abs(observations[0].delta)).toBeLessThan(0.25);
  });

  it("scores a normal starter going deep as meaningful positive evidence", () => {
    const own = Array.from({ length: 8 }, (_, i) => ({
      ...normalStart(`2026-07-${String(i + 1).padStart(2, "0")}`, { ip: 5.2, outs: 16 }),
      pitcherId: 2,
      opponent: "OTH",
    }));
    const vsTeam = { ...normalStart("2026-08-01", { ip: 6.1, outs: 18 }), pitcherId: 2, opponent: "DET" };
    const log = [...own, vsTeam];
    const observations = opponentObservations({
      team: "DET",
      asOfDate: "2026-09-01",
      startLog: log,
      logByPitcher: build(log),
      leagueIpPerStart: 5.2,
    });
    expect(observations[0].delta).toBeGreaterThan(0.6);
    expect(observations[0].weight).toBe(1);
  });

  it("tracks the weighted over-expected rate", () => {
    const summary = summarizeWindow([
      { delta: 0.5, weight: 1, ip: 6 },
      { delta: 0.4, weight: 1, ip: 6 },
      { delta: -0.2, weight: 1, ip: 5 },
      { delta: 0.3, weight: 1, ip: 6 },
    ]);
    expect(summary.overRate).toBeCloseTo(0.75, 10);
    expect(summary.overCount).toBe(3);
    expect(summary.n).toBe(4);
  });

  it("scales a delta down when the individual starts disagree with its sign", () => {
    const consistent = opponentAdjustment({
      season: { meanDelta: 0.5, overRate: 0.8, n: 20, weightSum: 18, reliability: 0.7 },
      last10: { meanDelta: 0.5, overRate: 0.8 },
      last5: { meanDelta: 0.5, overRate: 0.8 },
    });
    const outlierDriven = opponentAdjustment({
      season: { meanDelta: 0.5, overRate: 0.5, n: 20, weightSum: 18, reliability: 0.7 },
      last10: { meanDelta: 0.5, overRate: 0.5 },
      last5: { meanDelta: 0.5, overRate: 0.5 },
    });
    expect(outlierDriven.adjustment).toBeLessThan(consistent.adjustment);
    expect(outlierDriven.adjustment).toBeGreaterThan(0);
  });

  it("caps the opponent adjustment", () => {
    const extreme = opponentAdjustment({
      season: { meanDelta: 5, overRate: 1, n: 40, weightSum: 100, reliability: 1 },
      last10: { meanDelta: 5, overRate: 1 },
      last5: { meanDelta: 5, overRate: 1 },
    });
    expect(extreme.adjustment).toBeCloseTo(OPPONENT_DEFAULTS.capIp, 10);
    expect(extreme.capped).toBe(true);
  });

  it("returns a neutral adjustment below the minimum opponent sample", () => {
    const effect = opponentWorkloadEffect({
      team: "DET",
      asOfDate: "2026-09-01",
      startLog: [],
      logByPitcher: new Map(),
      leagueIpPerStart: 5.2,
    });
    expect(effect.adjustment).toBe(0);
    expect(effect.reason).toBe("insufficient-opponent-sample");
  });
});

describe("projected batters faced", () => {
  it("derives BF from projected IP and a blended BF/IP", () => {
    const starts = Array.from({ length: 5 }, (_, i) =>
      normalStart(`2026-08-0${i + 1}`, { ip: 6, bf: 24 }),
    );
    const rate = expectedBfPerIp({ seasonBfPerIp: 4.2, last10Starts: starts, last5Starts: starts });
    expect(rate).toBeGreaterThan(4);
    expect(rate).toBeLessThan(4.3);
    expect(projectBattersFaced(6, rate)).toBeCloseTo(6 * rate, 10);
  });

  it("bounds BF/IP inside a defensible envelope", () => {
    expect(expectedBfPerIp({ seasonBfPerIp: 20, last10Starts: [], last5Starts: [] })).toBe(BF_PER_IP_MAX);
    expect(expectedBfPerIp({ seasonBfPerIp: 0.5, last10Starts: [], last5Starts: [] })).toBe(BF_PER_IP_MIN);
  });

  it("bounds projected BF inside the starter envelope", () => {
    expect(projectBattersFaced(9, 5)).toBe(STARTER_BF_MAX);
    expect(projectBattersFaced(1, 3.5)).toBe(STARTER_BF_MIN);
  });
});

describe("sample-size K shrinkage", () => {
  it("uses BF / (BF + 125)", () => {
    expect(sampleSizeAlpha(375).alpha).toBeCloseTo(0.75, 10);
    expect(sampleSizeAlpha(125).alpha).toBeCloseTo(0.5, 10);
  });

  it("is bounded to [0, 1]", () => {
    expect(sampleSizeAlpha(0).alpha).toBe(0);
    expect(sampleSizeAlpha(1e9).alpha).toBeLessThanOrEqual(1);
  });

  it("fails closed to the production alpha when season BF is unavailable", () => {
    expect(sampleSizeAlpha(null).alpha).toBe(0.55);
    expect(sampleSizeAlpha(null).source).toBe("fallback:missing-season-bf");
    expect(sampleSizeAlpha(-5).alpha).toBe(0.55);
  });

  it("shrinks an established pitcher less than production does", () => {
    const established = projectStrikeoutsV3({
      pitcherSkillRate: 0.33,
      leagueKRate: 0.22,
      matchupAdjustment: 0,
      seasonBattersFaced: 500,
      projectedBattersFaced: 24,
      projectedInnings: 6,
    });
    expect(established.shrinkageAlpha).toBeGreaterThan(0.55);
    expect(established.projectedKRate).toBeGreaterThan(0.22 + 0.55 * (0.33 - 0.22));
  });
});

describe("v3 composition", () => {
  const pitcherLog = Array.from({ length: 12 }, (_, i) =>
    normalStart(`2026-08-${String(i + 1).padStart(2, "0")}`, { ip: 5.6, outs: 17, bf: 23 }),
  );
  const seasonSplit = {
    seasonIpPerStart: 4.8,
    seasonGamesStarted: 26,
    seasonBfPerIp: 4.2,
    home: { ipPerStart: 5.1, games: 14 },
    away: { ipPerStart: 4.5, games: 12 },
  };
  const baseInput = {
    asOfDate: "2026-09-06",
    pitcherId: 7,
    pitcherIsHome: true,
    opponent: "DET",
    seasonSplit,
    pitcherLog,
    startLog: [],
    logByPitcher: new Map(),
    leagueIpPerStart: 5.2,
  };

  it("decomposes into separately logged terms that sum to the projection", () => {
    const out = computeWorkloadProjectionV3(baseInput);
    const w = out.workload;
    expect(
      w.neutralIP + w.currentRegimeAdjustment + w.siteAdjustment + w.opponentAdjustment,
    ).toBeCloseTo(w.finalProjectedIP, 3);
  });

  it("moves toward recent workload when the pitcher has clearly changed regime", () => {
    const out = computeWorkloadProjectionV3(baseInput);
    expect(out.workload.seasonIPPerStart).toBe(4.8);
    expect(out.workload.last10IPPerStart).toBeCloseTo(5.6, 3);
    expect(out.workload.currentRegimeAdjustment).toBeGreaterThan(0);
    expect(out.workload.finalProjectedIP).toBeGreaterThan(4.8);
    // but not all the way to the recent level: the season anchor still holds
    expect(out.workload.finalProjectedIP).toBeLessThan(5.6);
  });

  it("keeps the projection inside the starter envelope", () => {
    const out = computeWorkloadProjectionV3(baseInput);
    expect(out.workload.finalProjectedIP).toBeGreaterThanOrEqual(STARTER_IP_MIN);
    expect(out.workload.finalProjectedIP).toBeLessThanOrEqual(STARTER_IP_MAX);
    expect(out.battersFaced.projectedBattersFaced).toBeGreaterThanOrEqual(STARTER_BF_MIN);
    expect(out.battersFaced.projectedBattersFaced).toBeLessThanOrEqual(STARTER_BF_MAX);
  });

  it("is deterministic", () => {
    expect(computeWorkloadProjectionV3(baseInput)).toEqual(computeWorkloadProjectionV3(baseInput));
  });

  it("never reads a market line, even when one is handed to it", () => {
    const withMarket = computeWorkloadProjectionV3({
      ...baseInput,
      kLine: 7.5,
      oddsOver: "-158",
      oddsUnder: "+124",
      vegasTotal: 9,
    });
    expect(withMarket).toEqual(computeWorkloadProjectionV3(baseInput));
  });

  it("flags rather than fabricates when the season split is unavailable", () => {
    const out = computeWorkloadProjectionV3({ ...baseInput, seasonSplit: null });
    expect(out.flags).toContain("SEASON_IP_PER_START_UNAVAILABLE");
    expect(out.workload.finalProjectedIP).not.toBeNull();
  });

  it("returns a null projection rather than a guess with no history at all", () => {
    const out = computeWorkloadProjectionV3({ ...baseInput, seasonSplit: null, pitcherLog: [] });
    expect(out.workload.finalProjectedIP).toBeNull();
    expect(out.battersFaced.projectedBattersFaced).toBeNull();
  });

  it("excludes the projected game from every window", () => {
    const withToday = computeWorkloadProjectionV3({
      ...baseInput,
      pitcherLog: [...pitcherLog, normalStart("2026-09-06", { ip: 9, outs: 27, bf: 34 })],
    });
    expect(withToday).toEqual(computeWorkloadProjectionV3(baseInput));
  });
});

describe("league prior on a thin record", () => {
  it("pulls a one-start pitcher most of the way to the league level", () => {
    const raw = blendNeutralIp({ seasonIpPerStart: 3, last10IpPerStart: 3, last5IpPerStart: 3 }, DEFAULTS);
    const shrunk = blendNeutralIp(
      { seasonIpPerStart: 3, last10IpPerStart: 3, last5IpPerStart: 3, evidenceStarts: 1, leagueIpPerStart: 5.2 },
      DEFAULTS,
    );
    expect(raw).toBe(3);
    expect(shrunk).toBeGreaterThan(4);
  });

  it("leaves a full-season pitcher essentially untouched", () => {
    const raw = blendNeutralIp({ seasonIpPerStart: 6, last10IpPerStart: 6, last5IpPerStart: 6 }, DEFAULTS);
    const shrunk = blendNeutralIp(
      { seasonIpPerStart: 6, last10IpPerStart: 6, last5IpPerStart: 6, evidenceStarts: 30, leagueIpPerStart: 5.2 },
      DEFAULTS,
    );
    expect(Math.abs(shrunk - raw)).toBeLessThan(0.08);
  });

  it("is a no-op without a league level to shrink toward", () => {
    const withNone = blendNeutralIp(
      { seasonIpPerStart: 3, last10IpPerStart: 3, last5IpPerStart: 3, evidenceStarts: 1, leagueIpPerStart: null },
      DEFAULTS,
    );
    expect(withNone).toBe(3);
  });

  it("applies the same prior to BF/IP so a thin record cannot pin it to the ceiling", () => {
    const pinned = expectedBfPerIp({ seasonBfPerIp: 6, last10Starts: [], last5Starts: [] });
    const shrunk = expectedBfPerIp({
      seasonBfPerIp: 6,
      last10Starts: [],
      last5Starts: [],
      evidenceStarts: 1,
      leagueBfPerIp: 4.2,
    });
    expect(pinned).toBe(BF_PER_IP_MAX);
    expect(shrunk).toBeLessThan(BF_PER_IP_MAX);
  });
});

describe("opponent league centring", () => {
  const observations = [
    { delta: 0.4, weight: 1, ip: 6 },
    { delta: 0.3, weight: 1, ip: 6 },
    { delta: -0.1, weight: 1, ip: 5 },
    { delta: 0.2, weight: 1, ip: 6 },
  ];

  it("reports the league offset the raw deltas carry", () => {
    const centre = leagueBaseline(observations);
    expect(centre.meanDelta).toBeCloseTo(0.2, 10);
    expect(centre.overRate).toBeCloseTo(0.75, 10);
  });

  it("scores a league-average opponent at zero once centred", () => {
    const centre = leagueBaseline(observations);
    const summary = summarizeWindow(observations, OPPONENT_DEFAULTS, centre);
    expect(summary.meanDelta).toBeCloseTo(0, 10);
    expect(summary.overRate).toBeCloseTo(0.5, 10);
    expect(summary.rawMeanDelta).toBeCloseTo(0.2, 10);
  });

  it("still separates a team that beats the league offset from one that does not", () => {
    const centre = leagueBaseline(observations);
    const hot = summarizeWindow(observations.map((o) => ({ ...o, delta: o.delta + 0.5 })), OPPONENT_DEFAULTS, centre);
    const cold = summarizeWindow(observations.map((o) => ({ ...o, delta: o.delta - 0.5 })), OPPONENT_DEFAULTS, centre);
    expect(hot.meanDelta).toBeGreaterThan(0.4);
    expect(cold.meanDelta).toBeLessThan(-0.4);
  });

  it("falls back to neutral constants when no centring is supplied", () => {
    const summary = summarizeWindow(observations, OPPONENT_DEFAULTS, null);
    expect(summary.meanDelta).toBeCloseTo(0.2, 10);
  });
});

describe("production v2 is untouched", () => {
  /**
   * v3 lives entirely in new modules. This asserts the v2 workload model still
   * produces its own documented output for a fixed input, so a v3 edit that
   * reached into the shared production path would fail here rather than in a
   * public artifact.
   */
  const v2Input = {
    workloadData: {
      completeness: { score: 1, counts: { currentSeasonAppearances: 20, currentSeasonStarterAppearances: 20, currentSeasonReliefAppearances: 0 } },
      starts: [
        { inningsPitched: 6, battersFaced: 24, pitches: 95, strikeouts: 6 },
        { inningsPitched: 5, battersFaced: 22, pitches: 88, strikeouts: 5 },
        { inningsPitched: 7, battersFaced: 26, pitches: 102, strikeouts: 8 },
      ],
      recentAppearances: [],
    },
    pitcher: { seasonKRate: 0.25, recentKRate: 0.27, whiffRate: 0.28 },
    opponent: { seasonPitchesPerPA: 3.9, recent14PitchesPerPA: 4.0 },
    league: { starterAveragePitches: 86, pitchesPerPA: 3.9, kRate: 0.22, whiffRate: 0.25, outsPerBF: 0.72 },
    context: { listedProbableStarter: true },
  };

  it("still reports the v2 workload model version", () => {
    expect(computeWorkloadProjection(v2Input).modelVersion).toBe("mlb-k-workload-v2");
  });

  it("is deterministic and unaffected by v3 config being present", () => {
    const a = computeWorkloadProjection(v2Input);
    const b = computeWorkloadProjection({ ...v2Input, v3Config: DEFAULTS });
    expect(a).toEqual(b);
  });

  it("produces a v2 projection distinct from the v3 one, as two versions should", () => {
    const v2 = computeWorkloadProjection(v2Input);
    expect(v2.projection.expectedInnings).toBeGreaterThan(0);
    expect(v2.modelVersion).not.toBeNull();
  });
});
