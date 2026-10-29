/**
 * Phase 4A evaluation framework tests. Synthetic data only; no network, no
 * real NBA data. The leakage tests mutate the future and require the past to
 * stay byte-identical.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_EVALUATION_LEAGUE, EVALUATION_FIXTURE_VERSION, generateEvaluationLeague } from "./__fixtures__/evaluationLeague";
import { computePregameFeatures } from "./features";
import { DEFAULT_MINUTES_V1_PARAMS } from "./evaluation/minutesV1Candidate";
import { BASELINE_V0_PUBLIC_PARAMS } from "./projection";
import { SOURCE_LICENSES } from "./sources/licenses";
import { SourceUseNotPermittedError } from "./sources/ingest";
import { countHistoryViolations, createDataAccess } from "./evaluation/access";
import { addDays, assertFolds, cutoffMs, resultAvailableMs, rollingFolds, validateSchedule } from "./evaluation/clock";
import { evaluateAcceptance, stableStringify, type AcceptanceCriterion } from "./evaluation/manifest";
import { calibrationBins, median, scoreProbabilities, summarizeErrors, terciles } from "./evaluation/metrics";
import { assertProvenance, runEvaluation, type EvaluationConfig, type EvaluationReport } from "./evaluation/runner";
import type { CutoffPolicy, EvaluationDataset, FoldSpec, ScheduledGame } from "./evaluation/types";
import { CONDITIONAL_METHODS } from "./evaluation/types";
import { playerGame, teamGame } from "./__fixtures__/synthetic";

const POLICY: CutoffPolicy = { leadMinutes: 90, resultLagMinutes: 180 };
const FOLDS: FoldSpec[] = [
  { name: "season-1", trainStart: "2060-10-20", trainEnd: "2060-11-14", validationStart: "2060-11-15", validationEnd: "2060-12-31" },
  { name: "season-2", trainStart: "2061-10-20", trainEnd: "2061-11-14", validationStart: "2061-11-15", validationEnd: "2061-12-31" },
];
const config = (over: Partial<EvaluationConfig> = {}): EvaluationConfig => ({
  cutoffPolicy: POLICY,
  folds: FOLDS,
  baselineParams: BASELINE_V0_PUBLIC_PARAMS,
  minutesV1Params: DEFAULT_MINUTES_V1_PARAMS,
  ...over,
});
const run = (dataset: EvaluationDataset, over: Partial<EvaluationConfig> = {}): EvaluationReport =>
  runEvaluation({ dataset, license: SOURCE_LICENSES.synthetic, config: config(over) });
const results = (report: EvaluationReport) => stableStringify({ folds: report.folds, pooled: report.pooled, diagnostics: report.diagnostics });

describe("metrics", () => {
  it("summarizes error, median error and bias with the sign convention predicted - actual", () => {
    const summary = summarizeErrors([[12, 10], [8, 10], [20, 10], [10, 10]]);
    expect(summary).toMatchObject({ n: 4, mae: 3.5, medianAe: 2, bias: 2.5 });
    expect(summary.rmse).toBeCloseTo(Math.sqrt((4 + 4 + 100 + 0) / 4), 10);
    expect(summarizeErrors([])).toEqual({ n: 0, mae: null, medianAe: null, bias: null, rmse: null });
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });

  it("scores probabilities and bins calibration, including the closed top edge", () => {
    const pairs: Array<[number, 0 | 1]> = [[1, 1], [0.9, 1], [0.9, 0], [0.2, 0]];
    const score = scoreProbabilities(pairs);
    expect(score).toMatchObject({ n: 4, accuracy: 0.75, observedRate: 0.5 });
    expect(score.brier).toBeCloseTo((0 + 0.01 + 0.81 + 0.04) / 4, 10);
    const bins = calibrationBins(pairs);
    expect(bins.map((b) => b.n)).toEqual([1, 0, 2, 1]);
    expect(bins[3]).toMatchObject({ meanPredicted: 1, observedRate: 1 });
    expect(terciles([1, 2, 3, 4, 5, 6])).toEqual([3, 5]);
    expect(terciles([1, 2])).toBeNull();
  });
});

describe("pregame clock and folds", () => {
  it("builds ascending, disjoint rolling folds with training strictly before validation", () => {
    const folds = rollingFolds({ firstTrainStart: "2060-10-20", trainDays: 30, validationDays: 10, stepDays: 10, lastDate: "2061-01-31" });
    expect(folds.length).toBeGreaterThan(3);
    expect(() => assertFolds(folds)).not.toThrow();
    expect(folds[0]).toEqual({ name: "fold-1", trainStart: "2060-10-20", trainEnd: "2060-11-18", validationStart: "2060-11-19", validationEnd: "2060-11-28" });
    expect(addDays("2060-12-31", 1)).toBe("2061-01-01");
    expect(() => rollingFolds({ firstTrainStart: "2060-10-20", trainDays: 30, validationDays: 10, stepDays: 5, lastDate: "2061-01-31" })).toThrow(/overlap/);
  });

  it("rejects folds whose training overlaps validation or whose validation windows overlap", () => {
    const bad: FoldSpec = { name: "x", trainStart: "2060-10-20", trainEnd: "2060-11-20", validationStart: "2060-11-20", validationEnd: "2060-12-01" };
    expect(() => assertFolds([bad])).toThrow(/precede/);
    expect(() => assertFolds([FOLDS[0], { ...FOLDS[1], validationStart: "2060-12-01", trainEnd: "2060-11-30", trainStart: "2060-11-01" }])).toThrow(/overlaps/);
    expect(() => assertFolds([])).toThrow();
  });

  it("requires a schedule whose Eastern date matches the tipoff instant", () => {
    const game: ScheduledGame = { gameId: "g1", gameDate: "2060-10-21", season: "2060-61", seasonType: "regular", tipoffUtc: "2060-10-21T02:00:00Z", homeTeamId: 1, awayTeamId: 2, neutralSite: false };
    expect(() => validateSchedule([game])).toThrow(/Eastern date/);
    expect(validateSchedule([{ ...game, gameDate: "2060-10-20" }]).size).toBe(1);
    expect(() => validateSchedule([{ ...game, gameDate: "2060-10-20" }, { ...game, gameDate: "2060-10-20" }])).toThrow(/Duplicate/);
    expect(() => validateSchedule([{ ...game, gameDate: "2060-10-20", neutralSite: true }])).toThrow(/inconsistent/);
    const neutral = { ...game, gameDate: "2060-10-20", neutralSite: true, homeTeamId: null, awayTeamId: null };
    expect(() => validateSchedule([neutral])).toThrow(/inconsistent/);
    expect(validateSchedule([{ ...neutral, participantTeamIds: [1, 2] as const }]).size).toBe(1);
  });

  it("generates a fixture whose evening tipoffs cross the UTC date boundary", () => {
    const { schedule } = generateEvaluationLeague();
    expect(() => validateSchedule(schedule)).not.toThrow();
    expect(schedule.filter((g) => g.tipoffUtc.slice(0, 10) !== g.gameDate).length).toBeGreaterThan(10);
  });
});

describe("timestamp leakage gate", () => {
  const game = (gameId: string, gameDate: string, tipoffUtc: string, home: number, away: number): ScheduledGame => ({ gameId, gameDate, season: "2060-61", seasonType: "regular", tipoffUtc, homeTeamId: home, awayTeamId: away, neutralSite: false });
  // G1 tips 20:00 ET Oct 20; G2 is the next ET day at 12:00 ET.
  const g1 = game("G1", "2060-10-20", "2060-10-21T00:00:00Z", 1, 2);
  const g2 = game("G2", "2060-10-21", "2060-10-21T16:00:00Z", 1, 3);
  const dataset = (): EvaluationDataset => ({
    sourceId: "synthetic",
    playerGames: [playerGame({ gameId: "G1", gameDate: "2060-10-20", season: "2060-61", playerId: 7, teamId: 1 }), playerGame({ gameId: "G2", gameDate: "2060-10-21", season: "2060-61", playerId: 7, teamId: 1 })],
    teamGames: [teamGame({ gameId: "G1", gameDate: "2060-10-20", season: "2060-61", teamId: 1 })],
    schedule: [g1, g2],
    availability: [],
    finalStatuses: [],
    provenance: { kind: "synthetic-generator", generator: "test", fixtureVersion: "t", seed: 0 },
  });

  it("uses a prior game once its result is available, and not the target game itself", () => {
    const access = createDataAccess(dataset(), validateSchedule([g1, g2]), POLICY);
    const cutoff = cutoffMs(g2, POLICY);
    expect(resultAvailableMs(g1, POLICY)).toBeLessThan(cutoff);
    expect(access.history(7, cutoff).map((r) => r.gameId)).toEqual(["G1"]);
  });

  it("withholds a prior game whose result is not yet available at the cutoff, though its DATE is earlier", () => {
    const slow = { leadMinutes: 90, resultLagMinutes: 900 }; // G1 result at 15:00Z, after the 14:30Z cutoff
    const access = createDataAccess(dataset(), validateSchedule([g1, g2]), slow);
    expect(access.history(7, cutoffMs(g2, slow))).toEqual([]);
    expect(access.teamDates(1, cutoffMs(g2, slow))).toEqual([]);
  });

  it("never treats a row for an unscheduled game as history, and counts it", () => {
    const base = dataset();
    const access = createDataAccess({ ...base, playerGames: [...base.playerGames, playerGame({ gameId: "GHOST", gameDate: "2060-10-19", season: "2060-61", playerId: 7, teamId: 1 })] }, validateSchedule([g1, g2]), POLICY);
    expect(access.history(7, cutoffMs(g2, POLICY)).map((r) => r.gameId)).toEqual(["G1"]);
    expect(access.counters.unscheduledRows).toBe(1);
  });

  it("ignores availability snapshots dated at or after the cutoff", () => {
    const base = dataset();
    const record = (status: "out" | "active", asOfUtc: string) => ({
      schemaVersion: "nba-availability-v1" as const, gameId: "G2", gameDate: "2060-10-21", season: "2060-61", seasonType: "regular" as const, playerId: 7, teamId: 1, status, starter: null, reason: null, asOfUtc, sourceSnapshotId: "t",
    });
    const cutoffIso = new Date(cutoffMs(g2, POLICY)).toISOString();
    const access = createDataAccess({ ...base, availability: [record("active", "2060-10-21T13:00:00.000Z"), record("out", cutoffIso), record("out", "2060-10-21T15:50:00.000Z")] }, validateSchedule([g1, g2]), POLICY);
    expect(access.statusAt(g2, 7)).toBe("active");
    expect(access.counters.availabilityIgnoredAsLate).toBe(2);
  });
});

describe("evaluation on the synthetic league", () => {
  let dataset: EvaluationDataset;
  let report: EvaluationReport;
  beforeAll(() => {
    dataset = generateEvaluationLeague();
    report = run(dataset);
  });

  it("compares the JKB models with previous-game, last-5, last-10 and season-to-date for all four stats", () => {
    const common = report.pooled.conditional.commonSample;
    expect(common.n).toBeGreaterThan(200);
    expect(Object.keys(common.byMethod).sort()).toEqual([...CONDITIONAL_METHODS].sort());
    for (const method of CONDITIONAL_METHODS) {
      for (const stat of ["minutes", "pts", "reb", "ast"] as const) {
        const s = common.byMethod[method][stat];
        expect(s.n).toBe(common.n);
        expect(s.mae).toBeGreaterThan(0);
        expect(s.medianAe).not.toBeNull();
        expect(Number.isFinite(s.bias ?? Number.NaN)).toBe(true);
      }
    }
  });

  it("reports performance by minutes bucket, usage bucket, team change, venue and history", () => {
    const { segments } = report.pooled.conditional;
    expect(Object.keys(segments).sort()).toEqual(["historyTier", "minutesBucket", "teamChange", "usageBucket", "venue"]);
    expect(Object.keys(segments.minutesBucket)).toEqual(expect.arrayContaining(["bench", "core", "rotation"]));
    expect(Object.keys(segments.usageBucket)).toEqual(expect.arrayContaining(["low", "mid", "high"]));
    const n = (name: string) => Object.values(segments[name]).reduce((sum, s) => sum + s.n, 0);
    for (const name of Object.keys(segments)) expect(n(name)).toBe(report.pooled.conditional.commonSample.n);
  });

  it("scores conditional production only on games the player played, never on zero-minute rows", () => {
    const folds = FOLDS;
    const expected = dataset.playerGames.filter((r) => r.minutes > 0 && folds.some((f) => r.gameDate >= f.validationStart && r.gameDate <= f.validationEnd) && dataset.schedule.some((g) => g.gameId === r.gameId)).length;
    // The fixture's data-gap game has no rows, so every positive-minute validation row is a target.
    expect(report.pooled.conditional.targets).toBe(expected);
    expect(dataset.playerGames.some((r) => r.minutes === 0)).toBe(true);
  });

  it("scores availability separately and excludes unestablished absences instead of scoring them as zero minutes", () => {
    const a = report.pooled.availability;
    expect(a.universe).toBeGreaterThan(300);
    expect(a.excluded.unestablished).toBeGreaterThan(0);
    expect(a.withoutPregameStatus).toBeGreaterThan(0);
    const access = createDataAccess(dataset, validateSchedule(dataset.schedule), POLICY);
    let established = 0;
    for (const fold of FOLDS) {
      for (const game of dataset.schedule.filter((g) => g.gameDate >= fold.validationStart && g.gameDate <= fold.validationEnd && access.hasResults(g.gameId))) {
        for (const teamId of access.teamsOf(game)) {
          for (const playerId of access.universe(game, teamId)) if (access.outcome(game.gameId, playerId)) established += 1;
        }
      }
    }
    expect(a.universe).toBe(established);
    for (const model of ["constant_rate", "history_rate", "status_aware"] as const) expect(a.byModel[model].n).toBe(established);
  });

  it("learns from pregame status: status-aware availability beats the constant rate and improves unconditional minutes", () => {
    const a = report.pooled.availability;
    expect(a.byModel.status_aware.brier!).toBeLessThan(a.byModel.constant_rate.brier!);
    expect(a.byStatus.out.observedRate).toBeLessThan(a.byStatus.active.observedRate);
    expect(a.unconditionalMinutes.availabilityWeighted.mae!).toBeLessThan(a.unconditionalMinutes.conditionalOnly.mae!);
  });

  it("flags recent team changes and reports neutral-site games without error", () => {
    expect(report.pooled.conditional.segments.teamChange.recent.n).toBeGreaterThan(0);
    expect(report.diagnostics.neutralSiteGames).toBe(1);
    expect(report.pooled.conditional.segments.venue.neutral.n).toBeGreaterThan(0);
    expect(Object.keys(report.pooled.conditional.segments.venue).sort()).toEqual(["away", "home", "neutral"]);
  });

  it("counts a scheduled game with missing results and skips it", () => {
    expect(report.diagnostics.gamesWithoutResults).toBe(1);
    expect(report.diagnostics.leakageInvariantViolations).toBe(0);
    expect(report.diagnostics.availabilityIgnoredAsLate).toBeGreaterThan(0);
  });

  it("estimates priors, participation and usage cut points from each training window only", () => {
    for (const fold of report.folds) {
      const train = dataset.playerGames.filter((r) => r.minutes > 0 && r.gameDate >= fold.spec.trainStart && r.gameDate <= fold.spec.trainEnd);
      expect(fold.trainingRows).toBe(train.length);
      const minutes = train.reduce((s, r) => s + r.minutes, 0);
      expect(fold.priors.leagueRate.pts).toBeCloseTo(train.reduce((s, r) => s + r.pts, 0) / minutes, 12);
      expect(fold.participationPrior).toBeGreaterThan(0.5);
      expect(fold.participationPrior).toBeLessThan(1);
      expect(fold.usageTerciles).not.toBeNull();
    }
  });
});

describe("leakage: the past is unchanged when the future is mutated", () => {
  const base = generateEvaluationLeague();
  const firstFold = [FOLDS[0]];
  const reference = run(base, { folds: firstFold });
  const cutoffDate = FOLDS[0].validationEnd;

  it("gives identical first-fold results when every later game is deleted", () => {
    const keep = (date: string) => date <= cutoffDate;
    const truncated: EvaluationDataset = {
      ...base,
      playerGames: base.playerGames.filter((r) => keep(r.gameDate)),
      teamGames: base.teamGames.filter((r) => keep(r.gameDate)),
      schedule: base.schedule.filter((g) => keep(g.gameDate)),
      availability: base.availability.filter((r) => keep(r.gameDate)),
      finalStatuses: base.finalStatuses.filter((f) => keep(base.schedule.find((g) => g.gameId === f.gameId)!.gameDate)),
    };
    expect(results(run(truncated, { folds: firstFold }))).toBe(results(reference));
  });

  it("gives identical single-day results when everything after that day is deleted, for days across the season", () => {
    const days = ["2060-11-03", "2060-11-17", "2060-11-29", "2060-12-09", "2060-12-21", "2061-11-29"];
    const schedule = new Map(base.schedule.map((g) => [g.gameId, g]));
    for (const day of days) {
      const trainStart = day < "2061-01-01" ? "2060-10-20" : "2061-10-20";
      const fold: FoldSpec = { name: `day-${day}`, trainStart, trainEnd: addDays(day, -1), validationStart: day, validationEnd: day };
      const keep = (date: string) => date <= day;
      const truncated: EvaluationDataset = {
        ...base,
        playerGames: base.playerGames.filter((r) => keep(r.gameDate)),
        teamGames: base.teamGames.filter((r) => keep(r.gameDate)),
        schedule: base.schedule.filter((g) => keep(g.gameDate)),
        availability: base.availability.filter((r) => keep(r.gameDate)),
        finalStatuses: base.finalStatuses.filter((f) => keep(schedule.get(f.gameId)!.gameDate)),
      };
      const full = run(base, { folds: [fold] });
      expect(full.pooled.conditional.targets, day).toBeGreaterThan(0);
      expect(results(run(truncated, { folds: [fold] })), day).toBe(results(full));
    }
  }, 30_000);

  it("gives identical first-fold results when every later game's box scores are rewritten", () => {
    const rewritten: EvaluationDataset = {
      ...base,
      playerGames: base.playerGames.map((r) => (r.gameDate > cutoffDate ? { ...r, minutes: r.minutes === 0 ? 0 : 48, pts: r.pts * 3 + 11, reb: r.reb + 9, ast: r.ast + 7 } : r)),
      teamGames: base.teamGames.map((r) => (r.gameDate > cutoffDate ? { ...r, pts: r.pts + 40 } : r)),
    };
    expect(results(run(rewritten, { folds: firstFold }))).toBe(results(reference));
  });

  it("is unchanged when late-breaking availability snapshots (after the cutoff) are flipped to the opposite truth", () => {
    const schedule = new Map(base.schedule.map((g) => [g.gameId, g]));
    const flipped: EvaluationDataset = {
      ...base,
      availability: base.availability.map((r) => {
        const game = schedule.get(r.gameId)!;
        if (Date.parse(r.asOfUtc) < cutoffMs(game, POLICY)) return r;
        return { ...r, status: r.status === "active" ? ("out" as const) : ("active" as const) };
      }),
    };
    expect(results(run(flipped, { folds: firstFold })).replace(/"availabilityIgnoredAsLate":\d+/, "")).toBe(results(reference).replace(/"availabilityIgnoredAsLate":\d+/, ""));
  });

  it("changes results when information BEFORE the cutoff is changed (the checks above are not vacuous)", () => {
    const changed: EvaluationDataset = { ...base, playerGames: base.playerGames.map((r) => (r.gameDate < FOLDS[0].validationStart ? { ...r, minutes: r.minutes === 0 ? 0 : Math.min(48, r.minutes + 6) } : r)) };
    expect(results(run(changed, { folds: firstFold }))).not.toBe(results(reference));
  });
});

describe("player and team changes", () => {
  it("flags a first game after a trade and lets the stint features see zero current-team games", () => {
    const schedule = new Map<string, ScheduledGame>();
    const rows = [];
    for (let i = 1; i <= 4; i += 1) {
      const date = `2060-11-0${i}`;
      const game: ScheduledGame = { gameId: `G${i}`, gameDate: date, season: "2060-61", seasonType: "regular", tipoffUtc: `${date}T00:30:00Z`.replace(date, addDays(date, 1)), homeTeamId: i < 4 ? 1 : 2, awayTeamId: 3, neutralSite: false };
      schedule.set(game.gameId, game);
      rows.push(playerGame({ gameId: game.gameId, gameDate: date, season: "2060-61", playerId: 9, teamId: i < 4 ? 1 : 2, minutes: 30 }));
    }
    const dataset: EvaluationDataset = { sourceId: "synthetic", playerGames: rows, teamGames: [], schedule: [...schedule.values()], availability: [], finalStatuses: [], provenance: { kind: "synthetic-generator", generator: "t", fixtureVersion: "t", seed: 0 } };
    const access = createDataAccess(dataset, validateSchedule(dataset.schedule), POLICY);
    const target = schedule.get("G4")!;
    const features = computePregameFeatures(access.history(9, cutoffMs(target, POLICY)), { gameId: "G4", cutoffDate: target.gameDate, season: "2060-61", teamId: 2 }, new Map());
    expect(features).toMatchObject({ priorGames: 3, teamChanged: true, currentTeamStintGames: 0, teamChangedRecently: true });
  });
});

describe("reproducibility and the manifest", () => {
  const dataset = generateEvaluationLeague();
  const first = run(dataset);

  it("gives identical results and hashes on a repeat run", () => {
    const again = run(generateEvaluationLeague());
    expect(results(again)).toBe(results(first));
    expect(again.manifest).toEqual(first.manifest);
  });

  it("does not depend on the order of the input tables", () => {
    const reversed: EvaluationDataset = {
      ...dataset,
      playerGames: [...dataset.playerGames].reverse(),
      teamGames: [...dataset.teamGames].reverse(),
      schedule: [...dataset.schedule].reverse(),
      availability: [...dataset.availability].reverse(),
      finalStatuses: [...dataset.finalStatuses].reverse(),
    };
    const shuffled = run(reversed);
    expect(shuffled.manifest.manifestId).toBe(first.manifest.manifestId);
    expect(shuffled.manifest.resultsSha256).toBe(first.manifest.resultsSha256);
  });

  it("changes the manifest id when the dataset, parameters or windows change", () => {
    const other = run(generateEvaluationLeague({ ...DEFAULT_EVALUATION_LEAGUE, seed: DEFAULT_EVALUATION_LEAGUE.seed + 1 }));
    expect(other.manifest.manifestId).not.toBe(first.manifest.manifestId);
    expect(other.manifest.dataset.provenance).toMatchObject({ seed: DEFAULT_EVALUATION_LEAGUE.seed + 1 });
    const params = run(dataset, { baselineParams: { ...BASELINE_V0_PUBLIC_PARAMS, newPlayerMinutes: 15 } });
    expect(params.manifest.manifestId).not.toBe(first.manifest.manifestId);
    const windows = run(dataset, { folds: [FOLDS[0]] });
    expect(windows.manifest.manifestId).not.toBe(first.manifest.manifestId);
  }, 30_000); // four full evaluations: about 5 s, which sits on Vitest's default 5 s timeout

  it("records model versions, dataset provenance, fixture version, cutoff, windows, metrics and acceptance criteria", () => {
    const m = first.manifest;
    expect(m).toMatchObject({ schemaVersion: "nba-evaluation-manifest-v1", evidenceClass: "synthetic", realDataEligible: false });
    expect(m.models.map((x) => x.id)).toEqual(expect.arrayContaining(["previous_game", "last_5", "last_10", "season_to_date", "jkb_baseline_v0", "jkb_minutes_v1", "availability:status_aware"]));
    expect(m.models.find((x) => x.id === "jkb_baseline_v0")?.version).toBe("nba-props-baseline-v0");
    expect(m.models.find((x) => x.id === "jkb_minutes_v1")?.version).toBe("nba-minutes-v1-candidate");
    expect(m.dataset.provenance).toEqual({ kind: "synthetic-generator", generator: "generateEvaluationLeague", fixtureVersion: EVALUATION_FIXTURE_VERSION, seed: DEFAULT_EVALUATION_LEAGUE.seed });
    expect(m.dataset.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(m.dataset.licenseGate).toMatchObject({ use: "model-development", permitted: true });
    expect(m.featureCutoff).toMatchObject({ policy: POLICY });
    expect(Date.parse(m.featureCutoff.first!)).toBeLessThan(Date.parse(m.featureCutoff.last!));
    expect(m.windows).toEqual(FOLDS);
    expect(m.metrics).toEqual(expect.arrayContaining(["mae", "medianAe", "bias", "n", "brier"]));
    expect(m.acceptance.outcomes.map((o) => o.id)).toEqual(m.acceptance.criteria.map((c) => c.id));
    expect(JSON.stringify(m)).not.toMatch(/generatedAt|Date\.now/);
  });

  it("evaluates pre-registered acceptance criteria and fails an impossible one", () => {
    const impossible: AcceptanceCriterion[] = [{ id: "impossible", kind: "mae-vs-best-naive", method: "jkb_baseline_v0", stat: "pts", maxRatio: 0.01 }, { id: "leak", kind: "leakage-invariants" }];
    const outcomes = evaluateAcceptance(impossible, first);
    expect(outcomes.find((o) => o.id === "impossible")).toMatchObject({ passed: false, threshold: 0.01 });
    expect(outcomes.find((o) => o.id === "leak")).toMatchObject({ passed: true, observed: 0 });
    expect(run(dataset, { acceptance: impossible }).manifest.acceptance.passed).toBe(false);
  });
});

describe("license gate and provenance", () => {
  const dataset = generateEvaluationLeague();

  it("refuses every real, license-blocked source, whatever its data looks like", () => {
    // hoopR/ESPN is not listed: the owner's 2026-10-29 statements record model-development for it (tests in sourceStrategy.test.ts).
    for (const sourceId of ["api-sports-nba", "balldontlie", "stats.nba.com"] as const) {
      expect(() => runEvaluation({ dataset: { ...dataset, sourceId }, license: SOURCE_LICENSES[sourceId], config: config() })).toThrow(SourceUseNotPermittedError);
    }
  });

  it("refuses a real source whose registry record has no grant even if the caller supplies a permissive license", () => {
    const grant = { status: "commercial-licensed" as const, permittedUses: ["model-development" as const], basis: "synthetic test grant", reviewedOn: "2026-10-19" };
    const real: EvaluationDataset = { ...dataset, sourceId: "api-sports-nba", provenance: { kind: "source-snapshots", snapshotIds: ["s1"] } };
    expect(() => runEvaluation({ dataset: real, license: grant, config: config() })).toThrow(SourceUseNotPermittedError);
  });

  it("rejects provenance that contradicts the source id", () => {
    expect(() => run({ ...dataset, provenance: { kind: "source-snapshots", snapshotIds: ["x"] } })).toThrow(/provenance/);
  });

  it("validates its own cutoff policy", () => {
    expect(() => run(dataset, { cutoffPolicy: { leadMinutes: -1, resultLagMinutes: 180 } })).toThrow(/cutoff lead/);
    expect(() => run(dataset, { cutoffPolicy: { leadMinutes: 90, resultLagMinutes: 0 } })).toThrow(/result lag/);
  });
});

describe("review hardening: audit, duplicates, universe, lag, provenance", () => {
  const base = generateEvaluationLeague();
  const schedule = validateSchedule(base.schedule);
  const day = "2060-11-29";
  const dayFold: FoldSpec = { name: "day", trainStart: "2060-10-20", trainEnd: addDays(day, -1), validationStart: day, validationEnd: day };

  it("audits history independently, so a weakened gate would register as violations", () => {
    const target = base.schedule.find((g) => g.gameDate === day)!;
    const access = createDataAccess(base, schedule, POLICY);
    const legit = access.history(base.playerGames.find((r) => r.gameDate === day && r.minutes > 0)!.playerId, cutoffMs(target, POLICY));
    expect(legit.length).toBeGreaterThan(0);
    expect(countHistoryViolations(legit, target, schedule, POLICY)).toBe(0);
    const sameDay = base.playerGames.find((r) => r.gameId === target.gameId)!;
    const future = base.playerGames.find((r) => r.gameDate > day)!;
    const ghost = { ...legit[0], gameId: "NOT-SCHEDULED" };
    expect(countHistoryViolations([...legit, sameDay, future, ghost], target, schedule, POLICY)).toBe(3);
    // A lag long enough that the previous game's result is not yet available: the same rows now violate.
    expect(countHistoryViolations(legit, target, schedule, { leadMinutes: 90, resultLagMinutes: 60 * 24 * 365 * 10 })).toBe(legit.length);
  });

  it("rejects duplicate rows and rows whose date disagrees with the schedule", () => {
    const row = base.playerGames[0];
    expect(() => createDataAccess({ ...base, playerGames: [...base.playerGames, row] }, schedule, POLICY)).toThrow(/Duplicate player-game/);
    expect(() => createDataAccess({ ...base, teamGames: [...base.teamGames, base.teamGames[0]] }, schedule, POLICY)).toThrow(/Duplicate team-game/);
    expect(() => createDataAccess({ ...base, finalStatuses: [...base.finalStatuses, base.finalStatuses[0]] }, schedule, POLICY)).toThrow(/Duplicate final status/);
    expect(() => createDataAccess({ ...base, playerGames: [{ ...row, gameDate: "2099-01-01" }, ...base.playerGames.slice(1)] }, schedule, POLICY)).toThrow(/disagrees with the schedule/);
  });

  it("builds the pregame roster from pregame evidence only (hand-built case)", () => {
    const games: ScheduledGame[] = [];
    const rows = [];
    const teamRows = [];
    for (let i = 1; i <= 16; i += 1) {
      const date = addDays("2060-11-01", 2 * i);
      games.push({ gameId: `U${i}`, gameDate: date, season: "2060-61", seasonType: "regular", tipoffUtc: `${date}T17:00:00Z`, homeTeamId: 1, awayTeamId: 2, neutralSite: false });
      teamRows.push(teamGame({ gameId: `U${i}`, gameDate: date, season: "2060-61", teamId: 1 }));
      const play = (playerId: number) => rows.push(playerGame({ gameId: `U${i}`, gameDate: date, season: "2060-61", playerId, teamId: 1, minutes: 20 }));
      if (i <= 14) play(1); // P1: recent regular
      if (i <= 3) play(5); // P5: long ago, outside the last 10 team games
      if (i === 16) play(2); // P2: first appears AFTER the target
    }
    const target = games[14]; // U15
    const record = (playerId: number, asOfMinutesBeforeTip: number) => ({
      schemaVersion: "nba-availability-v1" as const, gameId: "U15", gameDate: target.gameDate, season: "2060-61", seasonType: "regular" as const, playerId, teamId: 1,
      status: "questionable" as const, starter: null, reason: null, asOfUtc: new Date(Date.parse(target.tipoffUtc) - asOfMinutesBeforeTip * 60_000).toISOString(), sourceSnapshotId: "t",
    });
    const dataset: EvaluationDataset = {
      sourceId: "synthetic", playerGames: rows, teamGames: teamRows, schedule: games, finalStatuses: [],
      availability: [record(4, 120), record(3, 30)], // P4 usable; P3's snapshot is after the 90-minute cutoff
      provenance: { kind: "synthetic-generator", generator: "t", fixtureVersion: "t", seed: 0 },
    };
    const access = createDataAccess(dataset, validateSchedule(games), POLICY);
    expect(access.universe(target, 1)).toEqual([1, 4]);
    expect(access.statusAt(target, 4)).toBe("questionable");
    expect(access.statusAt(target, 3)).toBeNull();
  });

  it("takes the participants of a neutral-site game from the schedule, not from the game's own results", () => {
    const neutral = base.schedule.find((g) => g.neutralSite)!;
    const [a, b] = neutral.participantTeamIds!;
    const stripped: EvaluationDataset = { ...base, teamGames: base.teamGames.filter((r) => r.gameId !== neutral.gameId), playerGames: base.playerGames.filter((r) => r.gameId !== neutral.gameId) };
    expect(createDataAccess(stripped, schedule, POLICY).teamsOf(neutral)).toEqual([a, b]);
  });

  it("is unchanged when late snapshots are deleted outright, not merely flipped", () => {
    const folds = [FOLDS[0]];
    const reference = run(base, { folds });
    const onTime = { ...base, availability: base.availability.filter((r) => Date.parse(r.asOfUtc) < cutoffMs(schedule.get(r.gameId)!, POLICY)) };
    expect(onTime.availability.length).toBeLessThan(base.availability.length);
    const strip = (r: EvaluationReport) => results(r).replace(/"availabilityIgnoredAsLate":\d+/, "");
    expect(strip(run(onTime, { folds }))).toBe(strip(reference));
  });

  it("makes identical predictions, universes and probabilities when the target day's own results are rewritten", () => {
    const rewritten: EvaluationDataset = {
      ...base,
      playerGames: base.playerGames.map((r) => (r.gameDate === day && r.minutes > 0 ? { ...r, pts: r.pts * 4 + 3, reb: r.reb + 8, ast: r.ast + 8, minutes: Math.min(48, r.minutes + 9) } : r)),
      teamGames: base.teamGames.map((r) => (r.gameDate === day ? { ...r, pts: r.pts + 50 } : r)),
    };
    const before = runEvaluation({ dataset: base, license: SOURCE_LICENSES.synthetic, config: config({ folds: [dayFold] }), trace: true });
    const after = runEvaluation({ dataset: rewritten, license: SOURCE_LICENSES.synthetic, config: config({ folds: [dayFold] }), trace: true });
    const pregame = (r: EvaluationReport) => ({
      conditional: r.trace!.conditional.map(({ actual, ...rest }) => rest),
      availability: r.trace!.availability.map(({ actualMinutes, ...rest }) => rest),
    });
    expect(before.trace!.conditional.length).toBeGreaterThan(0);
    expect(pregame(after)).toEqual(pregame(before));
    // Non-vacuous: the rewritten outcomes do change the scores.
    expect(after.pooled.conditional.commonSample.byMethod.last_5.pts.mae).not.toBe(before.pooled.conditional.commonSample.byMethod.last_5.pts.mae);
  });

  it("keeps training games whose results were not yet available out of priors and status rates", () => {
    const lagged = run(base, { cutoffPolicy: { leadMinutes: 90, resultLagMinutes: 60 * 24 * 3 }, folds: [FOLDS[0]] });
    const normal = run(base, { folds: [FOLDS[0]] });
    expect(lagged.folds[0].trainingRows).toBeGreaterThan(0);
    expect(lagged.folds[0].trainingRows).toBeLessThan(normal.folds[0].trainingRows);
  });

  it("cross-checks real-source provenance against the declared source and the rows", () => {
    const real = (over: Partial<EvaluationDataset>): EvaluationDataset => ({ ...base, sourceId: "api-sports-nba", provenance: { kind: "source-snapshots", snapshotIds: ["api-sports-nba/req/1"] }, playerGames: [], teamGames: [], availability: [], ...over });
    expect(() => assertProvenance(real({ provenance: { kind: "source-snapshots", snapshotIds: [] } }))).toThrow(/list its snapshot ids/);
    expect(() => assertProvenance(real({ provenance: { kind: "source-snapshots", snapshotIds: ["balldontlie/req/1"] } }))).toThrow(/does not belong/);
    expect(() => assertProvenance(real({ playerGames: [playerGame({ sourceSnapshotId: "api-sports-nba/other/2" })] }))).toThrow(/not in the declared provenance/);
    expect(() => assertProvenance(real({ playerGames: [playerGame({ sourceSnapshotId: "api-sports-nba/req/1" })] }))).not.toThrow();
  });

  it("requires the leakage criterion and gates the candidate model by default", () => {
    expect(() => run(base, { acceptance: [{ id: "n", kind: "min-sample", n: 1 }] })).toThrow(/leakage-invariants/);
    const report = run(base);
    const ids = report.manifest.acceptance.criteria.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["v1-minutes-vs-naive", "v1-pts-bias", "leakage"]));
  });

  it("records the full license record and framework constants in the manifest", () => {
    const m = run(base).manifest;
    expect(m.dataset.licenseGate).toMatchObject({ use: "model-development", status: "synthetic", basis: SOURCE_LICENSES.synthetic.basis, reviewedOn: SOURCE_LICENSES.synthetic.reviewedOn });
    expect(m.framework).toMatchObject({ version: "nba-evaluation-framework-v2", rosterLookbackTeamGames: 10 });
  });

  it("does not let an unused configured participation prior change the manifest id", () => {
    const a = run(base, { minutesV1Params: { ...DEFAULT_MINUTES_V1_PARAMS, participationPrior: 0.5 } });
    const b = run(base);
    expect(a.manifest.manifestId).toBe(b.manifest.manifestId);
    expect(a.manifest.resultsSha256).toBe(b.manifest.resultsSha256);
  }, 30_000);

  it("reports where absences stay unestablished, by pregame status", () => {
    const { excluded } = run(base).pooled.availability;
    expect(Object.values(excluded.unestablishedByStatus).reduce((a, b) => a + b, 0)).toBe(excluded.unestablished);
  });
});
