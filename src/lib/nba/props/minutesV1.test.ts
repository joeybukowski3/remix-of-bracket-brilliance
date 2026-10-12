import { describe, expect, it } from "vitest";
import { buildTeamGameDates, type PregameTarget } from "./features";
import { computeMinutesV1Features } from "./minutesFeatures";
import { DEFAULT_MINUTES_V1_PARAMS, ewma, minutesSd, projectMinutesV1, projectParticipation, roleAnchor, type MinutesV1Params } from "./minutesV1";
import {
  assertNoHoldout,
  buildMinutesTargets,
  buildParticipationTargets,
  calibrateMinutesV1,
  compareStat,
  evaluateMinutesV1,
  type ScoredTarget,
} from "./minutesV1Backtest";
import { pairedDifference, timeBlock } from "./stats";
import { DEFAULT_SYNTHETIC_LEAGUE, generateSyntheticLeague } from "./__fixtures__/syntheticLeague";
import { playerGame, TEAM_A, TEAM_C } from "./__fixtures__/synthetic";
import type { NbaPlayerGame } from "./types";

const dayOf = (i: number) => new Date(Date.UTC(2024, 10, 1) + i * 2 * 86_400_000).toISOString().slice(0, 10);
const gameAt = (i: number, overrides: Partial<NbaPlayerGame> = {}) =>
  playerGame({ gameId: `00224${String(i + 1).padStart(5, "0")}`, gameDate: dayOf(i), ...overrides });
const teamDatesFor = (teamId: number, indices: number[]) =>
  buildTeamGameDates(indices.map((i) => ({ teamId, gameDate: dayOf(i), seasonType: "regular" as const })));
const targetAt = (i: number, teamId = TEAM_A): PregameTarget => ({ gameId: `00224${String(i + 1).padStart(5, "0")}`, cutoffDate: dayOf(i), season: "2024-25", teamId });
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, k) => from + k);

const NEUTRAL: MinutesV1Params = { ...DEFAULT_MINUTES_V1_PARAMS, roleShrinkGames: 0, halfLifeGames: 1e9 };

describe("computeMinutesV1Features", () => {
  const history = range(0, 12).map((i) => gameAt(i, { minutes: 30 }));
  const dates = teamDatesFor(TEAM_A, range(0, 20));

  it("ignores the target game, later games and same-day rows", () => {
    const base = computeMinutesV1Features(history.slice(0, 8), targetAt(8), dates);
    const tampered = [...history.map((row, i) => (i >= 8 ? { ...row, minutes: 1 } : row)), gameAt(8, { gameId: "0022499999", minutes: 2 })];
    expect(computeMinutesV1Features(tampered, targetAt(8), dates)).toEqual(base);
    expect(base.priorGames).toBe(8);
  });

  it("ignores team schedule dates on or after the cutoff", () => {
    const withFuture = teamDatesFor(TEAM_A, range(0, 60));
    const pastOnly = teamDatesFor(TEAM_A, range(0, 8));
    expect(computeMinutesV1Features(history.slice(0, 8), targetAt(8), withFuture)).toEqual(computeMinutesV1Features(history.slice(0, 8), targetAt(8), pastOnly));
  });

  it("detects the first game back from an absence with the pre-absence level", () => {
    const rows = range(0, 8).map((i) => gameAt(i, { minutes: 32 }));
    const features = computeMinutesV1Features(rows, targetAt(12), dates);
    expect(features.absence).toEqual({ gamesSinceReturn: 0, absenceLength: 4, preAbsence: { games: 8, mean: 32 } });
  });

  it("counts appearances since the return", () => {
    const rows = [...range(0, 8).map((i) => gameAt(i, { minutes: 32 })), gameAt(12, { minutes: 20 }), gameAt(13, { minutes: 24 })];
    const features = computeMinutesV1Features(rows, targetAt(14), dates);
    expect(features.absence).toMatchObject({ gamesSinceReturn: 2, absenceLength: 4, preAbsence: { games: 8, mean: 32 } });
  });

  it("does not report short gaps, thin pre-absence history, or offseason gaps as usable absences", () => {
    const shortGap = [...range(0, 8).map((i) => gameAt(i)), gameAt(10)];
    expect(computeMinutesV1Features(shortGap, targetAt(11), dates).absence).toBeNull();
    const thin = computeMinutesV1Features([gameAt(0), gameAt(1)], targetAt(6), dates);
    expect(thin.absence).toMatchObject({ gamesSinceReturn: 0, preAbsence: null });
    const lastSeason = playerGame({ season: "2023-24", gameId: "0022300050", gameDate: "2024-04-01" });
    expect(computeMinutesV1Features([lastSeason], targetAt(0), dates).absence).toBeNull();
  });

  it("flags a sustained role shift but not a return ramp", () => {
    const shifted = range(0, 16).map((i) => gameAt(i, { minutes: i < 12 ? 18 : 32 }));
    const features = computeMinutesV1Features(shifted, targetAt(16), dates);
    expect(features.roleShift).toMatchObject({ flagged: true });
    expect(features.roleShift!.diff).toBeCloseTo(14);
    const ramp = [...range(0, 12).map((i) => gameAt(i, { minutes: 32 })), gameAt(16, { minutes: 20 }), gameAt(17, { minutes: 22 }), gameAt(18, { minutes: 22 }), gameAt(19, { minutes: 24 })];
    const rampFeatures = computeMinutesV1Features(ramp, targetAt(20), teamDatesFor(TEAM_A, range(0, 21)));
    expect(rampFeatures.absence?.gamesSinceReturn).toBe(4);
    expect(rampFeatures.roleShift?.flagged).toBe(true);
    const inRamp = computeMinutesV1Features(ramp.slice(0, 15), targetAt(19), teamDatesFor(TEAM_A, range(0, 21)));
    expect(inRamp.absence?.gamesSinceReturn).toBe(3);
    expect(inRamp.roleShift?.flagged).toBe(false);
  });

  it("uses only the current stint after a trade and measures participation inside it", () => {
    const before = range(0, 10).map((i) => gameAt(i, { teamId: TEAM_A, minutes: 10 }));
    const after = [12, 13, 15].map((i) => gameAt(i, { teamId: TEAM_C, minutes: 30 }));
    const dates2 = buildTeamGameDates([...range(0, 10).map((i) => ({ teamId: TEAM_A, gameDate: dayOf(i), seasonType: "regular" as const })), ...range(12, 17).map((i) => ({ teamId: TEAM_C, gameDate: dayOf(i), seasonType: "regular" as const }))]);
    const features = computeMinutesV1Features([...before, ...after], targetAt(16, TEAM_C), dates2);
    expect(features.levelPool).toEqual([30, 30, 30]);
    expect(features.teamChangedRecently).toBe(true);
    expect(features.seasonTeam).toEqual({ games: 3, mean: 30 });
    expect(features.participation).toEqual({ teamGames: 4, played: 3 });
  });

  it("computes volatility from up to 10 recent level games", () => {
    const rows = range(0, 12).map((i) => gameAt(i, { minutes: i % 2 === 0 ? 20 : 30 }));
    const features = computeMinutesV1Features(rows, targetAt(12), dates);
    expect(features.volatility?.games).toBe(10);
    expect(features.volatility?.sd).toBeCloseTo(Math.sqrt((10 * 25) / 9));
  });
});

describe("projectMinutesV1", () => {
  const dates = teamDatesFor(TEAM_A, range(0, 20));

  it("computes an exponentially weighted mean", () => {
    expect(ewma([], 3)).toBeNull();
    expect(ewma([10, 20], 1)).toBeCloseTo((10 + 0.5 * 20) / 1.5);
  });

  it("anchors to the player's own role and falls back to newPlayerMinutes", () => {
    const empty = computeMinutesV1Features([], targetAt(0), dates);
    expect(roleAnchor(empty, DEFAULT_MINUTES_V1_PARAMS)).toBe(DEFAULT_MINUTES_V1_PARAMS.newPlayerMinutes);
    expect(projectMinutesV1(empty, DEFAULT_MINUTES_V1_PARAMS).minutes).toBe(DEFAULT_MINUTES_V1_PARAMS.newPlayerMinutes);
    const prev = range(0, 20).map((i) => playerGame({ season: "2023-24", gameId: `00223${String(i + 1).padStart(5, "0")}`, gameDate: `2024-03-${String(i + 1).padStart(2, "0")}`, minutes: 20 }));
    const current = range(0, 5).map((i) => gameAt(i, { minutes: 32 }));
    const features = computeMinutesV1Features([...prev, ...current], targetAt(5), dates);
    expect(roleAnchor(features, DEFAULT_MINUTES_V1_PARAMS)).toBeCloseTo((5 * 32 + 10 * 20) / 15);
  });

  it("shrinks the recent level toward the role anchor by K games", () => {
    const features = computeMinutesV1Features(range(0, 4).map((i) => gameAt(i, { minutes: 30 })), targetAt(4), dates);
    const params = { ...NEUTRAL, roleShrinkGames: 4, previousSeasonWeightGames: 0 };
    expect(projectMinutesV1(features, params).minutes).toBeCloseTo(30);
    const prevSeason = (minutes: number) => range(0, 15).map((i) => playerGame({ season: "2023-24", gameId: `00223${String(i + 1).padStart(5, "0")}`, gameDate: `2024-03-${String(i + 1).padStart(2, "0")}`, minutes }));
    const withPrior = computeMinutesV1Features([...prevSeason(10), ...range(0, 4).map((i) => gameAt(i, { minutes: 12 }))], targetAt(4), dates);
    expect(withPrior.roleShift?.flagged).toBe(false);
    const tuned = { ...params, previousSeasonWeightGames: 10 };
    const anchor = roleAnchor(withPrior, tuned);
    expect(anchor).toBeCloseTo((4 * 12 + 10 * 10) / 14);
    const level = ewma(withPrior.levelPool, params.halfLifeGames)!;
    expect(withPrior.levelPool).toHaveLength(19);
    expect(projectMinutesV1(withPrior, tuned).minutes).toBeCloseTo((19 * level + 4 * anchor) / 23);
  });

  it("switches to the short half-life and role-change shrinkage after a role shift", () => {
    const prev = range(0, 15).map((i) => playerGame({ season: "2023-24", gameId: `00223${String(i + 1).padStart(5, "0")}`, gameDate: `2024-03-${String(i + 1).padStart(2, "0")}`, minutes: 10 }));
    const features = computeMinutesV1Features([...prev, ...range(0, 4).map((i) => gameAt(i, { minutes: 30 }))], targetAt(4), dates);
    const params = { ...DEFAULT_MINUTES_V1_PARAMS, roleShrinkGames: 8, roleChangeShrinkGames: 0, roleChangeHalfLifeGames: 2 };
    const projection = projectMinutesV1(features, params);
    expect(projection.components).toMatchObject({ roleShift: true, shrinkGames: 0 });
    expect(projection.minutes).toBeCloseTo(ewma(features.levelPool, 2)!);
  });

  it("applies the ramp to the pre-absence level on return", () => {
    const rows = range(0, 8).map((i) => gameAt(i, { minutes: 32 }));
    const features = computeMinutesV1Features(rows, targetAt(12), dates);
    const projection = projectMinutesV1(features, { ...NEUTRAL, rampFactors: [0.75, 0.9] });
    expect(projection.components).toMatchObject({ inReturnRamp: true, ramp: 0.75, level: 32 });
    expect(projection.minutes).toBeCloseTo(24);
  });

  it("widens uncertainty with volatility and flag multipliers, clamped to valid minutes", () => {
    const steady = computeMinutesV1Features(range(0, 10).map((i) => gameAt(i, { minutes: 30 })), targetAt(10), dates);
    const noisy = computeMinutesV1Features(range(0, 10).map((i) => gameAt(i, { minutes: i % 2 ? 20 : 40 })), targetAt(10), dates);
    const flags = { inReturnRamp: false, roleShift: false };
    expect(minutesSd(noisy, 30, DEFAULT_MINUTES_V1_PARAMS, flags)).toBeGreaterThan(minutesSd(steady, 30, DEFAULT_MINUTES_V1_PARAMS, flags));
    const prior = DEFAULT_MINUTES_V1_PARAMS.sdPrior.core;
    expect(minutesSd(steady, 30, DEFAULT_MINUTES_V1_PARAMS, flags)).toBeCloseTo(Math.sqrt((5 * prior * prior) / 15));
    const doubled = { ...DEFAULT_MINUTES_V1_PARAMS, sdMultipliers: { ...DEFAULT_MINUTES_V1_PARAMS.sdMultipliers, returning: 2 } };
    expect(minutesSd(steady, 30, doubled, { inReturnRamp: true, roleShift: false })).toBeCloseTo(2 * minutesSd(steady, 30, DEFAULT_MINUTES_V1_PARAMS, flags));
    const bench = projectMinutesV1(computeMinutesV1Features(range(0, 5).map((i) => gameAt(i, { minutes: 2 })), targetAt(5), dates), NEUTRAL);
    expect(bench.p10).toBe(0);
    expect(bench.p90).toBeGreaterThan(bench.minutes);
  });

  it("keeps participation separate and combines it only for unconditional minutes", () => {
    const rows = [0, 1, 2, 4, 5].map((i) => gameAt(i, { minutes: 30 }));
    const features = computeMinutesV1Features(rows, targetAt(6), dates);
    expect(features.participation).toEqual({ teamGames: 6, played: 5 });
    const p = projectParticipation(features, DEFAULT_MINUTES_V1_PARAMS);
    expect(p).toBeCloseTo((5 + 5 * 0.9) / (6 + 5));
    const projection = projectMinutesV1(features, DEFAULT_MINUTES_V1_PARAMS);
    expect(projection.unconditionalMinutes).toBeCloseTo(p * projection.minutes);
  });
});

describe("statistics", () => {
  it("computes the cluster-robust paired difference", () => {
    const items = [
      { candidate: 1, benchmark: 2, cluster: "a" },
      { candidate: 1, benchmark: 3, cluster: "a" },
      { candidate: 2, benchmark: 2, cluster: "b" },
      { candidate: 4, benchmark: 3, cluster: "c" },
    ];
    const result = pairedDifference(items);
    // diffs -1,-2,0,1 -> mean -0.5; cluster residual sums: a=-2, b=0.5, c=1.5
    expect(result.meanDiff).toBeCloseTo(-0.5);
    expect(result.se).toBeCloseTo((Math.sqrt(4 + 0.25 + 2.25) / 4) * Math.sqrt(3 / 2));
    expect(result.clusters).toBe(3);
    expect(pairedDifference([]).meanDiff).toBeNull();
    expect(pairedDifference(items.slice(0, 2)).ci95).toBeNull();
  });

  it("buckets dates into fixed calendar blocks", () => {
    expect(timeBlock("2024-11-01", 14)).toBe(timeBlock("2024-11-02", 14));
    expect(() => timeBlock("2024-11-01", 0)).toThrow(/positive/);
  });
});

describe("minutes-v1 calibration and evaluation", () => {
  const league = generateSyntheticLeague({ ...DEFAULT_SYNTHETIC_LEAGUE, seasons: ["2040-41", "2041-42"], gamesPerSeason: 40 });
  const dev = { name: "dev", seasons: ["2041-42"], seasonTypes: ["regular" as const] };

  it("generates a deterministic league per seed", () => {
    const again = generateSyntheticLeague({ ...DEFAULT_SYNTHETIC_LEAGUE, seasons: ["2040-41", "2041-42"], gamesPerSeason: 40 });
    expect(again.playerGames).toEqual(league.playerGames);
    const other = generateSyntheticLeague({ ...DEFAULT_SYNTHETIC_LEAGUE, seed: 7, seasons: ["2040-41", "2041-42"], gamesPerSeason: 40 });
    expect(other.playerGames).not.toEqual(league.playerGames);
  });

  it("refuses to calibrate on holdout seasons or empty periods", () => {
    const targets = buildMinutesTargets(league.playerGames, league.teamGames, dev);
    expect(() => assertNoHoldout(targets, ["2041-42"])).toThrow(/Holdout season 2041-42/);
    expect(() => calibrateMinutesV1(targets, DEFAULT_MINUTES_V1_PARAMS, { holdoutSeasons: ["2041-42"] })).toThrow(/Holdout/);
    expect(() => calibrateMinutesV1([], DEFAULT_MINUTES_V1_PARAMS, { holdoutSeasons: [] })).toThrow(/empty/);
  });

  it("recovers the direction of the injected return ramp from development data", () => {
    const targets = buildMinutesTargets(league.playerGames, league.teamGames, dev);
    const params = calibrateMinutesV1(targets, DEFAULT_MINUTES_V1_PARAMS, { holdoutSeasons: ["2043-44"] });
    expect(params.rampFactors[0]).toBeLessThan(0.92);
    expect(params.rampFactors[0]).toBeLessThan(params.rampFactors[2]);
    expect(params.sdPrior.core).toBeGreaterThan(0);
  });

  it("builds participation targets inside stints only, excluding each stint's first game", () => {
    const targets = buildParticipationTargets(league.playerGames, league.teamGames, dev);
    expect(targets.length).toBeGreaterThan(0);
    const appearances = league.playerGames.filter((row) => row.season === "2041-42");
    const firstDates = new Map<string, string>();
    for (const row of appearances) {
      const key = `${row.playerId}|${row.teamId}`;
      if (!firstDates.has(key) || row.gameDate < firstDates.get(key)!) firstDates.set(key, row.gameDate);
    }
    for (const target of targets.slice(0, 500)) {
      const firsts = [...firstDates].filter(([key]) => key.startsWith(`${target.playerId}|`)).map(([, d]) => d);
      expect(firsts.every((d) => d !== target.gameDate) || !target.played).toBe(true);
    }
    expect(targets.some((t) => !t.played)).toBe(true);
  });

  it("scores paired MAE and interval coverage", () => {
    const scored: ScoredTarget[] = [0, 1, 2, 3].map((i) => ({
      playerId: i % 2,
      gameDate: dayOf(i),
      actual: { minutes: 30, pts: 10, reb: 5, ast: 2 },
      v0: { minutes: 26, pts: 10, reb: 5, ast: 2 },
      v1: { minutes: 29, pts: 10, reb: 5, ast: 2 },
      interval: { p10: 25, p90: i === 0 ? 29 : 35 },
      segments: { returning: i === 0, roleShift: false, teamChangedRecently: false, v0RoleChange: false, v0Returning: false },
    }));
    const minutes = compareStat(scored, "minutes");
    expect([minutes.maeV0, minutes.maeV1, minutes.byPlayer.meanDiff]).toEqual([4, 1, -3]);
    const evaluation = evaluateMinutesV1(scored);
    expect(evaluation.interval.coverage).toBe(0.75);
    expect(evaluation.interval.bySegment.returning).toEqual({ n: 1, coverage: 0 });
    expect(evaluation.segments.returning.n).toBe(1);
  });
});
