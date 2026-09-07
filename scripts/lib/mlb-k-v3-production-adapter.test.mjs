/**
 * mlb-k-v3-production-adapter.test.mjs
 * Run via: node --test scripts/lib/mlb-k-v3-production-adapter.test.mjs
 *
 * Production-shaped tests for the v3 integration. These exercise the adapter the
 * daily generator actually calls, with artifact-shaped inputs, rather than the
 * research helpers.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  LEAGUE_BF_PER_IP_FALLBACK,
  LEAGUE_IP_PER_START_FALLBACK,
  V3_PRODUCTION_CONFIG,
  V3_PRODUCTION_OPPONENT_CONFIG,
  V3_SUPPORTED_ROLES,
  buildPitcherLog,
  buildSeasonSplit,
  buildV3Projection,
  inningsTextToOuts,
  normalizeStart,
  resolveLeagueKRate,
  resolveSeasonBattersFaced,
} from "./mlb-k-v3-production-adapter.mjs";

import { sampleSizeAlpha } from "./mlb-k-projection-v3.mjs";
import { computeWorkloadProjection } from "../mlb-k/compute-workload-projection.mjs";

// ------------------------------- fixtures -------------------------------

/** An artifact-shaped completed start. Fields match strikeout-prop-details.json. */
const start = (date, overrides = {}) => ({
  gamePk: 900000 + Number(String(date).replace(/\D/g, "").slice(-4)),
  season: 2026,
  date,
  opponentAbbr: "OPP",
  site: "home",
  isHome: true,
  inningsPitched: "6.0",
  outsRecorded: 18,
  strikeouts: 6,
  hitsAllowed: 5,
  walksAllowed: 1,
  pitchCount: 95,
  battersFaced: 24,
  gamesStarted: 1,
  ...overrides,
});

const buildDetail = (starts, { seasonGames = 28, seasonOuts = 489, seasonBf = 657, windowSize = 10 } = {}) => {
  const homeGames = Math.ceil(seasonGames / 2);
  const awayGames = seasonGames - homeGames;
  const homeOuts = Math.round((seasonOuts * homeGames) / seasonGames);
  const homeBf = Math.round((seasonBf * homeGames) / seasonGames);
  return {
    pitcherId: 668909,
    pitcher: "Fixture Pitcher",
    pitcherLastFiveStarts: starts.slice(0, 5),
    pitcherLast10Starts: starts.slice(0, windowSize),
    pitcherVenueSplits: {
      home: { site: "home", season: { gamesUsed: homeGames, totalOuts: homeOuts, battersFaced: homeBf } },
      away: {
        site: "away",
        season: { gamesUsed: awayGames, totalOuts: seasonOuts - homeOuts, battersFaced: seasonBf - homeBf },
      },
    },
  };
};

/** A v2 result shaped like kProjectionV2's own output. */
const v2Result = (overrides = {}) => ({
  modelVersion: "mlb-k-projection-v2-production",
  projectedStrikeouts: 6.08,
  projectedKRate: 0.2792,
  projectedBattersFaced: 21.775,
  projectedInnings: 4.946,
  pitcherSkillRate: 0.3127,
  pitcherSkillRateShrunk: 0.2713,
  opponentEnvironmentRate: 0.2273,
  matchupAdjustment: 0.0049,
  confidence: "high",
  components: [],
  fallbacks: [],
  warnings: [],
  ...overrides,
});

const workloadRow = (overrides = {}) => ({
  role: "starter",
  pitcherContext: { seasonBattersFaced: 657, seasonKRate: 0.31 },
  ...overrides,
});

const project = (args = {}) =>
  buildV3Projection({
    slateDate: "2026-09-06",
    pitcherIsHome: true,
    opponent: "DET",
    leagueContext: { kRate: 0.2208 },
    leagueIpPerStart: 5.2,
    leagueBfPerIp: 4.3,
    ...args,
  });

// ------------------------------- parsing -------------------------------

describe("innings parsing", () => {
  it("reads fractional innings as thirds, not decimals", () => {
    assert.strictEqual(inningsTextToOuts("5.2"), 17);
    assert.strictEqual(inningsTextToOuts("6.0"), 18);
    assert.strictEqual(inningsTextToOuts("1.1"), 4);
    assert.strictEqual(inningsTextToOuts("7"), 21);
  });

  it("treats an unreadable innings value as absent, never as zero", () => {
    assert.strictEqual(inningsTextToOuts(null), null);
    assert.strictEqual(inningsTextToOuts(""), null);
    assert.strictEqual(inningsTextToOuts("abc"), null);
  });

  it("drops a start with no readable workload rather than defaulting it", () => {
    assert.strictEqual(normalizeStart({ date: "2026-08-01", inningsPitched: null, outsRecorded: null }), null);
    assert.strictEqual(normalizeStart({ inningsPitched: "6.0", outsRecorded: 18 }), null); // no date
  });

  it("prefers the ten-start window and falls back to five", () => {
    const starts = Array.from({ length: 10 }, (_, i) => start(`2026-08-${String(i + 10).padStart(2, "0")}`));
    assert.strictEqual(buildPitcherLog(buildDetail(starts)).length, 10);
    assert.strictEqual(buildPitcherLog({ pitcherLastFiveStarts: starts.slice(0, 5) }).length, 5);
    assert.strictEqual(buildPitcherLog({}).length, 0);
  });
});

describe("season split assembly", () => {
  it("sums home and away into season totals", () => {
    const split = buildSeasonSplit(buildDetail([], { seasonGames: 28, seasonOuts: 489, seasonBf: 657 }));
    assert.strictEqual(split.seasonGamesStarted, 28);
    assert.ok(Math.abs(split.seasonIpPerStart - 489 / 3 / 28) < 1e-9);
    assert.strictEqual(split.seasonBattersFaced, 657);
  });

  it("returns null rather than a fabricated split when venue data is absent", () => {
    assert.strictEqual(buildSeasonSplit({}), null);
    assert.strictEqual(buildSeasonSplit({ pitcherVenueSplits: { home: {}, away: {} } }), null);
  });
});

// ------------------------------- shrinkage alpha -------------------------------

describe("sample-size alpha provenance", () => {
  it("prefers the workload artifact's pregame season batters faced", () => {
    const resolved = resolveSeasonBattersFaced({
      workloadRow: workloadRow(),
      seasonSplit: { seasonBattersFaced: 100 },
    });
    assert.strictEqual(resolved.seasonBattersFaced, 657);
    assert.strictEqual(resolved.source, "workload.pitcherContext.seasonBattersFaced");
  });

  it("falls back to the venue-split sum and says so", () => {
    const resolved = resolveSeasonBattersFaced({ workloadRow: null, seasonSplit: { seasonBattersFaced: 400 } });
    assert.strictEqual(resolved.seasonBattersFaced, 400);
    assert.strictEqual(resolved.source, "details.pitcherVenueSplits.season.battersFaced");
  });

  it("reports unavailability rather than inventing a value", () => {
    const resolved = resolveSeasonBattersFaced({ workloadRow: null, seasonSplit: null });
    assert.strictEqual(resolved.seasonBattersFaced, null);
    assert.strictEqual(resolved.source, "unavailable");
  });

  it("falls back to the production alpha when season BF is unavailable", () => {
    const starts = Array.from({ length: 10 }, (_, i) => start(`2026-08-${String(i + 10).padStart(2, "0")}`));
    const out = project({
      detail: { ...buildDetail(starts), pitcherVenueSplits: null },
      workloadRow: { role: "starter", pitcherContext: {} },
      v2: v2Result(),
    });
    assert.strictEqual(out.alpha, 0.55);
    assert.strictEqual(out.alphaSource, "fallback:missing-season-bf");
    assert.ok(out.flags.includes("SHRINKAGE_ALPHA_FELL_BACK_TO_PRODUCTION"));
  });

  it("uses BF/(BF+125) and is bounded", () => {
    assert.ok(Math.abs(sampleSizeAlpha(375).alpha - 0.75) < 1e-12);
    assert.strictEqual(sampleSizeAlpha(0).alpha, 0);
    assert.ok(sampleSizeAlpha(1e9).alpha <= 1);
  });
});

describe("league K rate provenance", () => {
  it("prefers the slate's own league context", () => {
    const out = resolveLeagueKRate({ leagueContext: { kRate: 0.2208 }, v2: v2Result() });
    assert.strictEqual(out.leagueKRate, 0.2208);
    assert.strictEqual(out.source, "leagueContext.kRate");
  });

  it("recovers the anchor from the v2 matchup adjustment when context is missing", () => {
    const out = resolveLeagueKRate({ leagueContext: null, v2: v2Result() });
    assert.strictEqual(out.source, "recovered-from-v2-matchup");
    assert.ok(Math.abs(out.leagueKRate - (0.2273 - 0.0049 / 0.75)) < 1e-12);
  });
});

// ------------------------------- role gating -------------------------------

describe("role gating", () => {
  const starts = Array.from({ length: 10 }, (_, i) =>
    start(`2026-08-${String(i + 10).padStart(2, "0")}`, { inningsPitched: "1.0", outsRecorded: 3, battersFaced: 5, pitchCount: 20 }),
  );

  it("only claims to support starters", () => {
    assert.deepStrictEqual(V3_SUPPORTED_ROLES, ["starter"]);
  });

  it("declines an opener instead of clamping him to the starter floor", () => {
    const out = project({ detail: buildDetail(starts), workloadRow: workloadRow({ role: "opener" }), v2: v2Result() });
    assert.strictEqual(out.projectedKs, null);
    assert.strictEqual(out.finalProjectedIP, null);
    assert.ok(out.flags.includes("ROLE_OUT_OF_V3_SCOPE_OPENER"));
  });

  it("declines a reliever", () => {
    const out = project({ detail: buildDetail(starts), workloadRow: workloadRow({ role: "reliever" }), v2: v2Result() });
    assert.strictEqual(out.projectedKs, null);
    assert.ok(out.flags.includes("ROLE_OUT_OF_V3_SCOPE_RELIEVER"));
  });

  it("still carries the model version on a declined row, so the schema is stable", () => {
    const out = project({ detail: buildDetail(starts), workloadRow: workloadRow({ role: "opener" }), v2: v2Result() });
    assert.strictEqual(out.modelVersion, "mlb-k-projection-v3");
    assert.strictEqual(out.siteAdjustment, 0);
    assert.strictEqual(out.opponentAdjustment, 0);
  });
});

// ------------------------------- core behaviour -------------------------------

describe("v3 production projection", () => {
  const steady = Array.from({ length: 10 }, (_, i) => start(`2026-08-${String(i + 10).padStart(2, "0")}`));

  it("keeps site and opponent adjustments at exactly zero", () => {
    const out = project({ detail: buildDetail(steady), workloadRow: workloadRow(), v2: v2Result() });
    assert.strictEqual(out.siteAdjustment, 0);
    assert.strictEqual(out.opponentAdjustment, 0);
    assert.strictEqual(out.inputs.config.siteScale, 0);
    assert.strictEqual(out.inputs.config.opponentScale, 0);
  });

  it("decomposes into terms that sum to the projected innings", () => {
    const out = project({ detail: buildDetail(steady), workloadRow: workloadRow(), v2: v2Result() });
    const sum = out.neutralIP + out.regimeAdjustment + out.siteAdjustment + out.opponentAdjustment;
    assert.ok(Math.abs(sum - out.finalProjectedIP) < 1e-3, `${sum} vs ${out.finalProjectedIP}`);
  });

  it("derives BF as innings times BF/IP, inside the starter envelope", () => {
    const out = project({ detail: buildDetail(steady), workloadRow: workloadRow(), v2: v2Result() });
    assert.ok(Math.abs(out.projectedBF - out.finalProjectedIP * out.expectedBFPerIP) < 1e-2);
    assert.ok(out.projectedBF >= 12 && out.projectedBF <= 30);
    assert.ok(out.finalProjectedIP >= 3 && out.finalProjectedIP <= 8.5);
  });

  it("applies the shrunk skill and matchup to produce the K rate", () => {
    const out = project({ detail: buildDetail(steady), workloadRow: workloadRow(), v2: v2Result() });
    const expectedShrunk = 0.2208 + out.alpha * (0.3127 - 0.2208);
    assert.ok(Math.abs(out.shrunkSkillRate - expectedShrunk) < 1e-4);
    assert.ok(Math.abs(out.projectedKRate - (expectedShrunk + 0.0049)) < 1e-3);
    assert.ok(Math.abs(out.projectedKs - out.projectedKRate * out.projectedBF) < 1e-2);
  });

  it("reuses v2's K-rate components rather than recomputing them", () => {
    const out = project({ detail: buildDetail(steady), workloadRow: workloadRow(), v2: v2Result() });
    assert.strictEqual(out.pitcherSkillRate, 0.3127);
    assert.strictEqual(out.matchupAdjustment, 0.0049);
    assert.strictEqual(out.opponentEnvironmentRate, 0.2273);
  });

  it("reports the side-by-side deltas against v2", () => {
    const out = project({ detail: buildDetail(steady), workloadRow: workloadRow(), v2: v2Result() });
    assert.ok(Math.abs(out.v3MinusV2Ks - (out.projectedKs - 6.08)) < 1e-3);
    assert.ok(Math.abs(out.v3MinusV2IP - (out.finalProjectedIP - 4.946)) < 1e-3);
    assert.ok(Math.abs(out.v3MinusV2BF - (out.projectedBF - 21.775)) < 1e-3);
  });

  it("is deterministic", () => {
    const args = { detail: buildDetail(steady), workloadRow: workloadRow(), v2: v2Result() };
    assert.deepStrictEqual(project(args), project(args));
  });

  it("never reads a market line, even when one is supplied", () => {
    const args = { detail: buildDetail(steady), workloadRow: workloadRow(), v2: v2Result() };
    const withMarket = buildV3Projection({
      slateDate: "2026-09-06",
      pitcherIsHome: true,
      opponent: "DET",
      leagueContext: { kRate: 0.2208 },
      leagueIpPerStart: 5.2,
      leagueBfPerIp: 4.3,
      kLine: 7.5,
      oddsOver: "-158",
      oddsUnder: "+124",
      market: { kLine: 7.5 },
      ...args,
    });
    assert.deepStrictEqual(withMarket, project(args));
  });

  it("excludes the slate's own game from every window", () => {
    // The window is widened to 11 so the SAME ten prior starts survive in both
    // cases; otherwise adding today's game would evict the oldest prior and the
    // two projections would differ for a reason that has nothing to do with
    // leakage.
    const withToday = [start("2026-09-06", { inningsPitched: "9.0", outsRecorded: 27, battersFaced: 34 }), ...steady];
    const a = project({
      detail: buildDetail(withToday, { windowSize: 11 }),
      workloadRow: workloadRow(),
      v2: v2Result(),
    });
    const b = project({ detail: buildDetail(steady), workloadRow: workloadRow(), v2: v2Result() });
    assert.strictEqual(a.finalProjectedIP, b.finalProjectedIP);
    assert.strictEqual(a.projectedKs, b.projectedKs);
  });

  it("flags a missing ten-start window instead of failing", () => {
    const detail = buildDetail(steady);
    delete detail.pitcherLast10Starts;
    const out = project({ detail, workloadRow: workloadRow(), v2: v2Result() });
    assert.ok(out.flags.includes("LAST10_WINDOW_UNAVAILABLE_USING_LAST5"));
    assert.ok(out.projectedKs !== null);
  });

  it("declines rather than guessing when there is no history at all", () => {
    const out = project({ detail: { pitcherId: 1 }, workloadRow: workloadRow(), v2: v2Result() });
    assert.strictEqual(out.projectedKs, null);
    assert.ok(out.flags.includes("V3_PROJECTION_UNAVAILABLE"));
  });

  it("uses the documented league fallbacks when no league level is supplied", () => {
    const out = buildV3Projection({
      slateDate: "2026-09-06",
      pitcherIsHome: true,
      opponent: "DET",
      leagueContext: { kRate: 0.2208 },
      detail: buildDetail(steady),
      workloadRow: workloadRow(),
      v2: v2Result(),
    });
    assert.strictEqual(out.inputs.leagueIPPerStart, LEAGUE_IP_PER_START_FALLBACK);
    assert.strictEqual(out.inputs.leagueBFPerIP, LEAGUE_BF_PER_IP_FALLBACK);
  });
});

// ------------------------------- outlier handling -------------------------------

describe("abnormal short outing", () => {
  const normal = Array.from({ length: 10 }, (_, i) => start(`2026-08-${String(i + 10).padStart(2, "0")}`));

  it("moves the projection far less than an unweighted mean would", () => {
    // One unexplained 1-inning exit: short, but almost no traffic allowed.
    const withShort = [
      start("2026-08-20", { inningsPitched: "1.0", outsRecorded: 3, battersFaced: 4, hitsAllowed: 1, walksAllowed: 0, pitchCount: 20 }),
      ...normal.slice(1),
    ];
    const clean = project({ detail: buildDetail(normal), workloadRow: workloadRow(), v2: v2Result() });
    const shocked = project({ detail: buildDetail(withShort), workloadRow: workloadRow(), v2: v2Result() });
    const drop = clean.finalProjectedIP - shocked.finalProjectedIP;
    // An unweighted 10-start mean would lose 0.5 IP; robust weighting keeps it well under that.
    assert.ok(drop > 0, "a short start should still pull the projection down");
    assert.ok(drop < 0.35, `expected a damped drop, got ${drop}`);
  });

  it("lets a performance-explained blowup move the projection more than an unexplained exit", () => {
    const unexplained = [
      start("2026-08-20", { inningsPitched: "1.0", outsRecorded: 3, battersFaced: 4, hitsAllowed: 1, walksAllowed: 0, pitchCount: 20 }),
      ...normal.slice(1),
    ];
    const explained = [
      start("2026-08-20", { inningsPitched: "1.0", outsRecorded: 3, battersFaced: 11, hitsAllowed: 7, walksAllowed: 3, pitchCount: 55 }),
      ...normal.slice(1),
    ];
    const a = project({ detail: buildDetail(unexplained), workloadRow: workloadRow(), v2: v2Result() });
    const b = project({ detail: buildDetail(explained), workloadRow: workloadRow(), v2: v2Result() });
    assert.ok(b.finalProjectedIP < a.finalProjectedIP, "the explained blowup should count for more");
  });
});

// ------------------------------- representative fixtures -------------------------------

/**
 * Regression fixtures across the pitcher population. Each asserts a RELATIONSHIP
 * or a bound, not a hand-copied constant, so they stay meaningful if a future
 * recalibration moves the numbers slightly.
 */
describe("representative fixtures", () => {
  const tenStarts = (ip, outs, bf, extra = {}) =>
    Array.from({ length: 10 }, (_, i) =>
      start(`2026-08-${String(i + 10).padStart(2, "0")}`, { inningsPitched: ip, outsRecorded: outs, battersFaced: bf, ...extra }),
    );

  it("elite high-K established starter: deep sample shrinks least, K rate near raw skill", () => {
    const out = project({
      detail: buildDetail(tenStarts("6.2", 20, 26), { seasonGames: 30, seasonOuts: 570, seasonBf: 760 }),
      workloadRow: workloadRow({ pitcherContext: { seasonBattersFaced: 760 } }),
      v2: v2Result({ pitcherSkillRate: 0.33 }),
    });
    assert.ok(out.alpha > 0.85, `expected a high alpha, got ${out.alpha}`);
    // With alpha near 1 the shrunk skill sits close to the raw skill.
    assert.ok(out.shrunkSkillRate > 0.3, `expected light shrinkage, got ${out.shrunkSkillRate}`);
    assert.ok(out.finalProjectedIP > 6, `expected a deep workload, got ${out.finalProjectedIP}`);
  });

  it("average starter: lands mid-envelope with a mid alpha", () => {
    const out = project({
      detail: buildDetail(tenStarts("5.1", 16, 22), { seasonGames: 26, seasonOuts: 420, seasonBf: 580 }),
      workloadRow: workloadRow({ pitcherContext: { seasonBattersFaced: 580 } }),
      v2: v2Result({ pitcherSkillRate: 0.22 }),
    });
    assert.ok(out.finalProjectedIP > 4.5 && out.finalProjectedIP < 6);
    assert.ok(out.projectedBF > 18 && out.projectedBF < 26);
    assert.ok(out.projectedKRate > 0.15 && out.projectedKRate < 0.3);
  });

  it("low-K starter: K rate stays above the floor and below league-average skill", () => {
    const out = project({
      detail: buildDetail(tenStarts("5.0", 15, 22), { seasonGames: 26, seasonOuts: 400, seasonBf: 570 }),
      workloadRow: workloadRow({ pitcherContext: { seasonBattersFaced: 570 } }),
      v2: v2Result({ pitcherSkillRate: 0.155, matchupAdjustment: -0.01 }),
    });
    assert.ok(out.projectedKRate >= 0.1, "must respect MIN_K_RATE");
    assert.ok(out.projectedKRate < 0.2, `expected a low K rate, got ${out.projectedKRate}`);
  });

  it("small-sample starter: heavy shrinkage on BOTH workload and K skill", () => {
    const thin = [start("2026-08-20", { inningsPitched: "3.0", outsRecorded: 9, battersFaced: 18, hitsAllowed: 8, walksAllowed: 3 })];
    const out = project({
      detail: buildDetail(thin, { seasonGames: 1, seasonOuts: 9, seasonBf: 18 }),
      workloadRow: workloadRow({ pitcherContext: { seasonBattersFaced: 18 } }),
      v2: v2Result({ pitcherSkillRate: 0.33 }),
    });
    // The league prior must pull a one-start record well off its own 3.0 IP.
    assert.ok(out.finalProjectedIP > 3.8, `expected the league prior to lift this, got ${out.finalProjectedIP}`);
    assert.ok(out.alpha < 0.2, `expected heavy K shrinkage, got ${out.alpha}`);
    assert.ok(out.shrunkSkillRate < 0.25, "a one-start skill reading must be pulled hard to league");
  });

  it("starter with one abnormal short outing: stays close to his own level", () => {
    const mostlyNormal = [
      start("2026-08-20", { inningsPitched: "1.0", outsRecorded: 3, battersFaced: 4, hitsAllowed: 1, walksAllowed: 0, pitchCount: 18 }),
      ...tenStarts("6.0", 18, 24).slice(1),
    ];
    const out = project({
      detail: buildDetail(mostlyNormal, { seasonGames: 28, seasonOuts: 500, seasonBf: 670 }),
      workloadRow: workloadRow({ pitcherContext: { seasonBattersFaced: 670 } }),
      v2: v2Result(),
    });
    assert.ok(out.finalProjectedIP > 5.4, `one bad exit must not define him, got ${out.finalProjectedIP}`);
    assert.ok(out.finalProjectedIP < 6.1);
  });
});

// ------------------------------- Gavin regression fixture -------------------------------

/**
 * Gavin Williams, 2026-09-06 vs DET. A VALIDATION fixture: no v3 weight, cap or
 * threshold was chosen by inspecting this row. Inputs are his real pregame
 * values as archived; expectations are the research figures with deterministic
 * tolerances.
 */
describe("Gavin Williams 2026-09-06 regression fixture", () => {
  const gavinStarts = [
    { date: "2026-09-01", inningsPitched: "7.0", outsRecorded: 21, battersFaced: 25, pitchCount: 97, strikeouts: 13, hitsAllowed: 2, walksAllowed: 1, site: "home", isHome: true },
    { date: "2026-08-25", inningsPitched: "1.1", outsRecorded: 4, battersFaced: 11, pitchCount: 62, strikeouts: 3, hitsAllowed: 6, walksAllowed: 1, site: "away", isHome: false },
    { date: "2026-08-20", inningsPitched: "5.2", outsRecorded: 17, battersFaced: 24, pitchCount: 96, strikeouts: 11, hitsAllowed: 4, walksAllowed: 3, site: "home", isHome: true },
    { date: "2026-08-14", inningsPitched: "4.1", outsRecorded: 13, battersFaced: 24, pitchCount: 91, strikeouts: 5, hitsAllowed: 7, walksAllowed: 4, site: "home", isHome: true },
    { date: "2026-08-08", inningsPitched: "5.2", outsRecorded: 17, battersFaced: 22, pitchCount: 102, strikeouts: 7, hitsAllowed: 3, walksAllowed: 2, site: "away", isHome: false },
    { date: "2026-08-02", inningsPitched: "5.2", outsRecorded: 17, battersFaced: 19, pitchCount: 89, strikeouts: 10, hitsAllowed: 1, walksAllowed: 1, site: "home", isHome: true },
    { date: "2026-07-28", inningsPitched: "7.0", outsRecorded: 21, battersFaced: 24, pitchCount: 101, strikeouts: 12, hitsAllowed: 3, walksAllowed: 1, site: "away", isHome: false },
    { date: "2026-07-23", inningsPitched: "7.0", outsRecorded: 21, battersFaced: 23, pitchCount: 97, strikeouts: 11, hitsAllowed: 2, walksAllowed: 0, site: "home", isHome: true },
    { date: "2026-07-18", inningsPitched: "6.0", outsRecorded: 18, battersFaced: 25, pitchCount: 84, strikeouts: 11, hitsAllowed: 7, walksAllowed: 0, site: "home", isHome: true },
    { date: "2026-07-09", inningsPitched: "7.0", outsRecorded: 21, battersFaced: 26, pitchCount: 103, strikeouts: 11, hitsAllowed: 3, walksAllowed: 1, site: "away", isHome: false },
  ].map((s) => ({ gamePk: 1, season: 2026, opponentAbbr: "OPP", gamesStarted: 1, ...s }));

  const gavinDetail = {
    pitcherId: 668909,
    pitcher: "Gavin Williams",
    pitcherLastFiveStarts: gavinStarts.slice(0, 5),
    pitcherLast10Starts: gavinStarts,
    pitcherVenueSplits: {
      home: { site: "home", season: { gamesUsed: 15, totalOuts: 269, battersFaced: 361 } },
      away: { site: "away", season: { gamesUsed: 13, totalOuts: 220, battersFaced: 296 } },
    },
  };

  const gavin = () =>
    buildV3Projection({
      detail: gavinDetail,
      workloadRow: { role: "starter", pitcherContext: { seasonBattersFaced: 657 } },
      v2: v2Result(),
      slateDate: "2026-09-06",
      pitcherIsHome: true,
      opponent: "DET",
      leagueContext: { kRate: 0.2208 },
      leagueIpPerStart: 5.2,
      leagueBfPerIp: 4.3,
    });

  const near = (actual, expected, tol, label) =>
    assert.ok(Math.abs(actual - expected) <= tol, `${label}: expected ~${expected} +/-${tol}, got ${actual}`);

  it("reproduces the researched season and window levels", () => {
    const g = gavin();
    near(g.seasonIPPerStart, 5.821, 0.01, "season IP/start");
    near(g.last10IPPerStart, 5.833, 0.06, "robust L10 IP/start");
    near(g.last5IPPerStart, 5.046, 0.06, "robust L5 IP/start");
  });

  it("reproduces the neutral and final innings", () => {
    const g = gavin();
    near(g.neutralIP, 5.6, 0.15, "neutral IP");
    near(g.finalProjectedIP, 5.6, 0.15, "final projected IP");
  });

  it("keeps site and opponent at zero", () => {
    const g = gavin();
    assert.strictEqual(g.siteAdjustment, 0);
    assert.strictEqual(g.opponentAdjustment, 0);
  });

  it("reproduces the projected batters faced", () => {
    near(gavin().projectedBF, 22.86, 0.6, "projected BF");
  });

  it("reproduces the sample-size alpha", () => {
    near(gavin().alpha, 0.84, 0.01, "alpha");
    assert.strictEqual(gavin().alphaSource, "sample-size");
  });

  it("reproduces the projected K rate and strikeouts", () => {
    const g = gavin();
    near(g.projectedKRate, 0.306, 0.005, "projected K rate");
    near(g.projectedKs, 6.99, 0.25, "projected Ks");
  });

  it("projects materially higher than v2 did, which is the whole point", () => {
    const g = gavin();
    assert.ok(g.projectedKs > 6.08, "v3 must exceed the v2 replay of 6.08");
    assert.ok(g.v3MinusV2Ks > 0.4, `expected a clear positive delta, got ${g.v3MinusV2Ks}`);
  });

  it("still sits under a 7.5 line: v3 narrows the gap, it does not invert the call", () => {
    assert.ok(gavin().projectedKs < 7.5);
  });

  it("is deterministic", () => {
    assert.deepStrictEqual(gavin(), gavin());
  });
});

// ------------------------------- v2 invariants -------------------------------

describe("v2 is unchanged by the v3 integration", () => {
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

  it("still reports the v2 workload model version and its own numbers", () => {
    const v2 = computeWorkloadProjection(v2Input);
    assert.strictEqual(v2.modelVersion, "mlb-k-workload-v2");
    assert.ok(v2.projection.expectedInnings > 0);
    assert.ok(v2.projection.expectedBF > 0);
  });

  it("keeps its own per-role limits, which is exactly why v3 defers to it for openers", () => {
    const opener = computeWorkloadProjection({
      ...v2Input,
      workloadData: {
        ...v2Input.workloadData,
        completeness: { score: 1, counts: { currentSeasonAppearances: 8, currentSeasonStarterAppearances: 8, currentSeasonReliefAppearances: 0 } },
        starts: [
          { inningsPitched: 1, battersFaced: 5, pitches: 20, strikeouts: 1 },
          { inningsPitched: 1, battersFaced: 4, pitches: 18, strikeouts: 1 },
          { inningsPitched: 1.1, battersFaced: 6, pitches: 22, strikeouts: 2 },
        ],
      },
    });
    assert.strictEqual(opener.role, "opener");
    assert.ok(opener.projection.expectedInnings < 3, "v2 can project below the starter floor; v3 cannot");
  });

  it("is unaffected by v3 config being handed to it", () => {
    assert.deepStrictEqual(
      computeWorkloadProjection(v2Input),
      computeWorkloadProjection({ ...v2Input, v3Config: V3_PRODUCTION_CONFIG, v3OpponentConfig: V3_PRODUCTION_OPPONENT_CONFIG }),
    );
  });
});
