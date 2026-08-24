// CFB Model V2 — OFFLINE historical support export (WU3A).
//
// This script is NOT production runtime code. It is the one legitimate
// place production-side tooling is allowed to import
// src/lib/cfb/research/** — its sole job is converting the validated,
// frozen Phase 9 finalist's own computation into two compact, versioned,
// market-free production support artifacts. Nothing under
// src/lib/cfb/production/v2/ may import this file or research/** at
// runtime (see production/v2/architectureGuard.test.ts).
//
// Source spec: PHASE9_FINALIST_SPEC (COMPONENT_SIZE connectivity, base
// lambda 10, no staleness) + PHASE4_FINALIST_SCORING_CONFIG (national HFA,
// BLENDED_CURRENT, SUCCESS-only secondary block) + Phase 5's TOTAL_ONLY
// LINEAR calibration / EMPIRICAL_BOOTSTRAP config — i.e. exactly what
// research/phase9/productionCandidateConfig.ts already freezes, reused
// read-only here, never retuned.
//
// Season range: 2020-2025 (PHASE9_TEST_SEASONS), NOT 2019-2025. 2019 is
// deliberately excluded — Phase 3's own prior regression can never produce
// a trainable prior for 2019 (buildPriorsForSeasons needs a season strictly
// before the requested one; 2019's own "before" is 2018, which itself has
// no prior season in the corpus), so 2019 never enters
// runPhase8WalkForwardCore's per-week loop (`if (!priors) continue`) in the
// first place. Exporting "2019" data would mean fabricating a season that
// the validated pipeline itself never produces.

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildSeasonObservations, loadSeasonGames, loadSeasonTeamGames } from "../src/lib/cfb/research/phase2/loadTeamGameObservations";
import type { CfbMetricName, GameObservation } from "../src/lib/cfb/research/phase2/types";
import { buildPriorsForSeasons } from "../src/lib/cfb/research/phase3/buildPriorsForSeasons";
import { loadTeamConferenceById } from "../src/lib/cfb/research/phase8/teamConference";
import { buildWeekGraphSnapshots } from "../src/lib/cfb/research/phase8/scheduleGraph";
import { computeCandidateTeamRatings } from "../src/lib/cfb/research/phase8/candidateRatings";
import { PHASE9_FINALIST_SPEC, PHASE9_TEST_SEASONS } from "../src/lib/cfb/research/phase9/config";
import { PHASE4_FINALIST_SCORING_CONFIG } from "../src/lib/cfb/research/phase8/phase8WalkForward";
import { estimateScoringEnvironment } from "../src/lib/cfb/research/phase4/scoringEnvironment";
import { runPhase9Pipeline } from "../src/lib/cfb/research/phase9/pipeline";
import type { CfbResearchGame } from "../src/lib/cfb/research/types";
import type { CfbDerivedTeamGameMetrics } from "../src/lib/cfb/research/derived/types";
import { CFB_V2_CONFIG_VERSION } from "../src/lib/cfb/production/v2/config";
import { solveLinearSystem } from "../src/lib/cfb/production/v2/linearSolver";

const ROOT = resolve(import.meta.dirname, "..");
const SUPPORT_DIR = resolve(ROOT, "data", "cfb", "v2-support");
const METRIC_SET: CfbMetricName[] = ["ypp", "ppp"];
const PRIOR_LAMBDA = 3; // WU1's frozen preseasonPrior.priorRidgeLambda — matches WU2's own priorCoefficients.ts

// ---------------------------------------------------------------------------
// Artifact/version identifiers.
// ---------------------------------------------------------------------------

const CFB_V2_CONFIG_HASH = CFB_V2_CONFIG_VERSION; // imported live from production config — never a hand-copied literal, so drift is impossible
const PHASE9_CANDIDATE_VERSION = "cfb-research-phase9-production-candidate-validation-v0.1"; // CFB_RESEARCH_PHASE9_VERSION
/** WU3A scoring-artifact-shape revision — bumped from the superseded "cfb-v2-scoring-training-2020-2025-v1" one-row-per-game representation (proven not to reproduce Phase 8/9's fitted coefficients) to the normal-equation-snapshot representation. */
const SCORING_ARTIFACT_VERSION = "cfb-v2-scoring-normal-equations-2020-2025-v1";
const CALIBRATION_ARTIFACT_VERSION = "cfb-v2-calibration-residual-seed-2020-2025-v1";
const GENERATOR_VERSION = "cfb-v2-support-export-v1";

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// Artifact #1 — scoring normal-equation snapshots (WU3A revision, §2 of the
// scoring-artifact-shape directive).
//
// SUPERSEDES the original "one row per team-side per game" representation,
// which was proven (phase9CoefficientParity.test.ts, prior WU3A session) to
// NOT reproduce Phase 8/9's actual fitted scoring coefficients: Phase 8's
// real internal training pool (research/phase8/phase8WalkForwardCore.ts,
// `allObservationRows`) re-accumulates and re-featurizes EVERY earlier game
// in the season at EVERY later as-of-week — i.e. a game from week 3 is
// rebuilt and re-appended (with fresh feature values, since ratings are
// recomputed every week) once per subsequent week for the rest of that
// test season, and the accumulator never resets across seasons either. This
// is a genuinely O(seasons x weeks^2) growing multiset of (possibly
// duplicate-source, differently-featurized) rows — not the same statistical
// object as one immutable row per game.
//
// fitScoringModel (research/phase4/scoringRegression.ts) is a plain ridge
// regression solved via its normal equations (X'X + lambda*I)^-1 X'y, which
// are EXACTLY additive over rows: X'X = sum_i x_i x_i^T, X'y = sum_i x_i y_i.
// Because PHASE4_FINALIST_SCORING_CONFIG uses hfa: "NATIONAL" (a single
// national HFA column, not one column per training season) and pace: "NONE"
// (no pace columns), the feature-column SET is FIXED at exactly 7 (see
// SCORING_FEATURE_NAMES below) regardless of which seasons are present in
// the training pool — so a running (ata, atb, n) accumulator, snapshotted
// at every (season, week) cutoff, is a mathematically EXACT, size-O(1)
// substitute for the full duplicated row multiset: solving
// (ata + lambda*I) \ atb at any snapshot reproduces fitScoringModel's own
// coefficient vector for that exact cutoff to floating-point precision,
// with no per-row storage at all.
//
// Season scope: priors are only ever computed for PHASE9_TEST_SEASONS (see
// buildPriorsForSeasons — its `testSeasons` param IS PHASE9_TEST_SEASONS,
// so priorsBySeason has no entry for 2018/2019). In
// research/phase8/phase8WalkForwardCore.ts, `if (!priors) continue;` is the
// SECOND statement inside the per-week loop, strictly BEFORE any row is
// ever built or appended — so 2018 and 2019 contribute ZERO training rows
// to the accumulator (they only feed seasonMeans, i.e. the
// BLENDED_CURRENT scoring-environment feature's
// previousSeasonMean/allPriorSeasonsMean inputs — see exportCalibration-
// unrelated seasonMeans computation below, unchanged from the prior
// session). The accumulator therefore starts genuinely empty at 2020's own
// first predicted week and grows monotonically, without reset, through
// 2025's last predicted week — exactly mirroring
// runPhase8WalkForwardCore's own `allObservationRows` lifetime.
// ---------------------------------------------------------------------------

/** Matches research/phase4/scoringRegression.ts's buildFeatureColumns output for the frozen NATIONAL/BLENDED_CURRENT/pace=NONE/secondary=[SUCCESS] config — see the runtime assertion in exportScoringNormalEquationSnapshots below, which fails loudly if PHASE4_FINALIST_SCORING_CONFIG ever drifts from these assumptions. */
const SCORING_FEATURE_NAMES = ["intercept", "scoringEnvironment", "offenseRating", "defenseRatingAllowed", "hfa", "SUCCESS_own", "SUCCESS_opponentAllowed"] as const;
const N_SCORING_PARAMS = SCORING_FEATURE_NAMES.length;

export type CfbV2ScoringNormalEquationSnapshot = {
  /**
   * As-of identity: this snapshot is the EXACT training-pool state
   * fitScoringModel would use to predict games at this (season, week) —
   * i.e. every FBS-vs-FBS game with (season < this.season) OR
   * (season === this.season AND week < this.week), re-accumulated the same
   * way Phase 8's own walk-forward does. season=2026/week=1 is a synthetic
   * boundary entry (see exportScoringNormalEquationSnapshots's trailing
   * push) representing the frozen historical state entering a real 2026
   * production season — not a real predicted week.
   */
  season: number;
  week: number;
  /** Matches SCORING_FEATURE_NAMES exactly; stored per-record so a future config change is self-describing rather than silently assumed. */
  featureNames: readonly string[];
  /** Symmetric N_SCORING_PARAMS x N_SCORING_PARAMS accumulated X'X (BEFORE the ridge penalty is added — the ridge lambda is a production-config constant applied at reconstruction time, not baked into the frozen snapshot, so a future config change to lambda alone would not require regenerating this artifact). */
  ata: number[][];
  /** Accumulated X'y, length N_SCORING_PARAMS. */
  atb: number[];
  /** Count of usable (all-features-finite) rows folded into this snapshot — mirrors fitScoringModel's own `usable.length` at this cutoff, including the same `usable.length >= nParams + 2` fallback-eligibility threshold. */
  usableRowCount: number;
};

function isFbsVsFbsGame(g: CfbResearchGame): boolean {
  return (g.homeClassification ?? "").toLowerCase() === "fbs" && (g.awayClassification ?? "").toLowerCase() === "fbs";
}

/** Team's own cumulative PPA-success-rate so far this season (Section "SUCCESS" field — mirrors phase8WalkForwardCore.ts's private teamPaceAndSecondaryAverages, SUCCESS field only; PACE/PPA-per-play/EXPLOSIVENESS are not part of the frozen finalist and are intentionally omitted). */
function teamSuccessSoFar(teamGamesThisSeasonSoFar: readonly CfbDerivedTeamGameMetrics[]): Map<string, number | null> {
  const byTeam = new Map<string, CfbDerivedTeamGameMetrics[]>();
  for (const row of teamGamesThisSeasonSoFar) {
    const arr = byTeam.get(row.teamExternalId) ?? [];
    arr.push(row);
    byTeam.set(row.teamExternalId, arr);
  }
  const result = new Map<string, number | null>();
  for (const [teamId, rows] of byTeam) {
    const finite = rows.map((r) => r.policyVariants.NONE.ppaSuccessRate).filter((v): v is number => v !== null);
    result.set(teamId, finite.length === 0 ? null : finite.reduce((s, v) => s + v, 0) / finite.length);
  }
  return result;
}

/**
 * Recomputes the exact per-game feature vectors research/phase8/phase8WalkForwardCore.ts
 * uses to PREDICT (not train on) a given (season, week)'s own games — i.e.
 * the same ratings/scoringEnvironmentEstimate/successByTeam state buildRow
 * uses for `games.filter(g.week === week)` at that cutoff. Exported for
 * test-only reuse by phase9CoefficientParity.test.ts's independent
 * "recover Phase 8's true coefficients by inference" check — the compact
 * artifact itself stores no row-level features (only aggregate ata/atb),
 * so a coefficient-parity test needs a second, independently-computed
 * source of (features, target) pairs to solve for the true coefficient
 * vector. Self-contained (does not share state with
 * exportScoringNormalEquationSnapshots) — a few hundred ms of extra I/O
 * per call is an acceptable cost for a test-only utility invoked a handful
 * of times.
 */
export function computeCurrentWeekScoringFeatureRows(season: number, week: number): { gameId: string; isHome: boolean; x: number[]; actualPoints: number }[] {
  const priors = buildPriorsForSeasons([season], "PRIOR_D", PRIOR_LAMBDA).get(season);
  if (!priors) return [];

  const warmStartSeason = 2018;
  // BUG FIX (found via the §6/§17 hard-gate test failing on intercept/scoringEnvironment specifically, while offense/defense/hfa/SUCCESS matched to 1e-12): seasonMeans must include EVERY season strictly before `season` — not just [2018, 2019, season] — since allPriorSeasonsMean/previousSeasonMean average over ALL prior seasons' means (mirrors exportScoringNormalEquationSnapshots's own seasonMeans, built from the full allSeasons set). Loading only up through `season` itself (never beyond) still matches the real pipeline, since seasonMeans entries for seasons >= `season` are filtered out by `s < season` below regardless.
  const seasonsToLoad = [...new Set([warmStartSeason, 2019, ...PHASE9_TEST_SEASONS])].filter((s) => s <= season).sort((a, b) => a - b);
  const seasonMeans = new Map<number, number>();
  for (const s of seasonsToLoad) {
    const games = loadSeasonGames(s);
    const scores = games.filter((g) => g.status === "final" && isFbsVsFbsGame(g)).flatMap((g) => [g.homeScore, g.awayScore]).filter((v): v is number => v !== null);
    if (scores.length > 0) seasonMeans.set(s, scores.reduce((sum, v) => sum + v, 0) / scores.length);
  }

  const allGames = loadSeasonGames(season);
  const teamGames = loadSeasonTeamGames(season);
  const games = allGames.filter((g) => g.status === "final" && isFbsVsFbsGame(g));
  const teamIds = [...new Set(games.flatMap((g) => [g.homeExternalId, g.awayExternalId]))];
  const teamConferenceById = loadTeamConferenceById(season);
  const graphSnapshot = buildWeekGraphSnapshots(season, allGames, teamConferenceById).find((g) => g.week === week);
  if (!graphSnapshot) return [];

  const observationsByMetric = new Map<CfbMetricName, GameObservation[]>();
  for (const metric of METRIC_SET) observationsByMetric.set(metric, buildSeasonObservations(teamGames, allGames, metric, "NONE", "gameWeighted"));
  const obsByMetric = new Map<CfbMetricName, GameObservation[]>();
  for (const metric of METRIC_SET) obsByMetric.set(metric, (observationsByMetric.get(metric) ?? []).filter((o) => o.week < week));
  const { ratings } = computeCandidateTeamRatings(teamIds, METRIC_SET, obsByMetric, priors, graphSnapshot, PHASE9_FINALIST_SPEC);

  const teamGamesThisSeasonSoFar = teamGames.filter((r) => r.week < week);
  const successByTeam = teamSuccessSoFar(teamGamesThisSeasonSoFar);

  const allPriorSeasonsScores: number[] = [];
  for (const [s, mean] of seasonMeans) if (s < season) allPriorSeasonsScores.push(mean);
  const allPriorSeasonsMean = allPriorSeasonsScores.length === 0 ? null : allPriorSeasonsScores.reduce((s, v) => s + v, 0) / allPriorSeasonsScores.length;
  const previousSeasonMean = seasonMeans.get(season - 1) ?? null;

  const trainGamesThisSeason = games.filter((g) => g.week < week);
  const currentSeasonScores = trainGamesThisSeason.flatMap((g) => [g.homeScore, g.awayScore]).filter((s): s is number => s !== null);
  const currentSeasonSoFarMean = currentSeasonScores.length === 0 ? null : currentSeasonScores.reduce((s, v) => s + v, 0) / currentSeasonScores.length;
  const scoringEnvironmentEstimate = estimateScoringEnvironment(
    { allPriorSeasonsMean, previousSeasonMean, currentSeasonSoFarMean, currentSeasonGamesSoFar: trainGamesThisSeason.length },
    PHASE4_FINALIST_SCORING_CONFIG.scoringEnvironment,
    PHASE4_FINALIST_SCORING_CONFIG.priorGamesWeight,
  );
  if (scoringEnvironmentEstimate === null) return [];

  const rows: { gameId: string; isHome: boolean; x: number[]; actualPoints: number }[] = [];
  for (const game of games.filter((g) => g.week === week)) {
    for (const side of ["home", "away"] as const) {
      const teamId = side === "home" ? game.homeExternalId : game.awayExternalId;
      const opponentId = side === "home" ? game.awayExternalId : game.homeExternalId;
      const actualPoints = side === "home" ? game.homeScore : game.awayScore;
      const teamRating = ratings.get(teamId);
      const oppRating = ratings.get(opponentId);
      const offenseRating = teamRating?.offense ?? null;
      const opponentDefenseRating = oppRating?.defense ?? null;
      const successOwn = successByTeam.get(teamId) ?? null;
      const successOpponentAllowed = successByTeam.get(opponentId) ?? null;
      if (actualPoints === null || offenseRating === null || opponentDefenseRating === null || successOwn === null || successOpponentAllowed === null) continue;
      const hfa = game.neutralSite ? 0 : side === "home" ? 1 : -1;
      rows.push({ gameId: game.gameId, isHome: side === "home", x: [1, scoringEnvironmentEstimate, offenseRating, opponentDefenseRating, hfa, successOwn, successOpponentAllowed], actualPoints });
    }
  }
  return rows;
}

/** Folds one (x, y) observation into the running normal-equation accumulator — the additive core that makes snapshot-based reconstruction exact. */
function foldObservation(ata: number[][], atb: number[], x: readonly number[], y: number): void {
  for (let i = 0; i < N_SCORING_PARAMS; i += 1) {
    atb[i] += x[i] * y;
    for (let j = 0; j < N_SCORING_PARAMS; j += 1) ata[i][j] += x[i] * x[j];
  }
}

function cloneMatrix(m: readonly (readonly number[])[]): number[][] {
  return m.map((row) => [...row]);
}

function exportScoringNormalEquationSnapshots(): CfbV2ScoringNormalEquationSnapshot[] {
  // Runtime assertion — fails loudly (not silently) if the frozen finalist config ever drifts from the fixed 7-column feature set SCORING_FEATURE_NAMES assumes (see file header).
  if (PHASE4_FINALIST_SCORING_CONFIG.hfa !== "NATIONAL" || PHASE4_FINALIST_SCORING_CONFIG.pace !== "NONE" || PHASE4_FINALIST_SCORING_CONFIG.secondary.length !== 1 || PHASE4_FINALIST_SCORING_CONFIG.secondary[0] !== "SUCCESS") {
    throw new Error("PHASE4_FINALIST_SCORING_CONFIG no longer matches the fixed 7-column feature set this exporter assumes — SCORING_FEATURE_NAMES and foldObservation must be revisited before regenerating this artifact");
  }

  const testSeasons = [...PHASE9_TEST_SEASONS].sort((a, b) => a - b);
  const warmStartSeason = 2018;
  const allSeasons = [...new Set([warmStartSeason, 2019, ...testSeasons])].sort((a, b) => a - b);
  const priorsBySeason = buildPriorsForSeasons(testSeasons, "PRIOR_D", PRIOR_LAMBDA);

  // Same seasonMeans-across-all-loaded-seasons computation phase8WalkForwardCore.ts uses for BLENDED_CURRENT — 2018/2019 feed this mean but (per the file header above) never contribute training rows themselves.
  const seasonMeans = new Map<number, number>();
  const seasonGamesCache = new Map<number, CfbResearchGame[]>();
  const seasonTeamGamesCache = new Map<number, CfbDerivedTeamGameMetrics[]>();
  for (const season of allSeasons) {
    seasonGamesCache.set(season, loadSeasonGames(season));
    seasonTeamGamesCache.set(season, loadSeasonTeamGames(season));
  }
  for (const [season, games] of seasonGamesCache) {
    const scores = games.filter((g) => g.status === "final" && isFbsVsFbsGame(g)).flatMap((g) => [g.homeScore, g.awayScore]).filter((s): s is number => s !== null);
    if (scores.length > 0) seasonMeans.set(season, scores.reduce((s, v) => s + v, 0) / scores.length);
  }

  // The running accumulator — persists across the ENTIRE season loop, never reset, exactly mirroring phase8WalkForwardCore.ts's `allObservationRows` lifetime (declared once, outside the season loop).
  const ata: number[][] = Array.from({ length: N_SCORING_PARAMS }, () => new Array(N_SCORING_PARAMS).fill(0));
  const atb: number[] = new Array(N_SCORING_PARAMS).fill(0);
  let usableRowCount = 0;
  const snapshots: CfbV2ScoringNormalEquationSnapshot[] = [];

  let lastSeasonState: { games: readonly CfbResearchGame[]; teamGames: readonly CfbDerivedTeamGameMetrics[]; teamIds: readonly string[]; graphSnapshot: ReturnType<typeof buildWeekGraphSnapshots>[number]; priors: NonNullable<ReturnType<typeof priorsBySeason.get>>; maxWeek: number; allPriorSeasonsMean: number | null; previousSeasonMean: number | null } | null = null;

  for (const season of testSeasons) {
    const priors = priorsBySeason.get(season);
    if (!priors) continue; // matches phase8WalkForwardCore.ts's `if (!priors) continue;` exactly (defensive — priorsBySeason is keyed by testSeasons already)

    const allGames = seasonGamesCache.get(season)!;
    const teamGames = seasonTeamGamesCache.get(season)!;
    const games = allGames.filter((g) => g.status === "final" && isFbsVsFbsGame(g));
    const weeks = [...new Set(games.map((g) => g.week))].sort((a, b) => a - b);
    const teamIds = [...new Set(games.flatMap((g) => [g.homeExternalId, g.awayExternalId]))];
    const teamConferenceById = loadTeamConferenceById(season);
    const graphSnapshots = buildWeekGraphSnapshots(season, allGames, teamConferenceById);
    const graphByWeek = new Map(graphSnapshots.map((g) => [g.week, g]));

    const observationsByMetric = new Map<CfbMetricName, GameObservation[]>();
    for (const metric of METRIC_SET) observationsByMetric.set(metric, buildSeasonObservations(teamGames, allGames, metric, "NONE", "gameWeighted"));

    const allPriorSeasonsScores: number[] = [];
    for (const [s, mean] of seasonMeans) if (s < season) allPriorSeasonsScores.push(mean);
    const allPriorSeasonsMean = allPriorSeasonsScores.length === 0 ? null : allPriorSeasonsScores.reduce((s, v) => s + v, 0) / allPriorSeasonsScores.length;
    const previousSeasonMean = seasonMeans.get(season - 1) ?? null;

    // week -> the fold step used both by the real per-week loop below AND by the trailing 2026-boundary extrapolation (which reuses the SAME logic one virtual week past the season's last real week).
    function foldWeek(week: number, graphSnapshot: ReturnType<typeof buildWeekGraphSnapshots>[number]): void {
      const obsByMetric = new Map<CfbMetricName, GameObservation[]>();
      for (const metric of METRIC_SET) obsByMetric.set(metric, (observationsByMetric.get(metric) ?? []).filter((o) => o.week < week));
      const { ratings } = computeCandidateTeamRatings(teamIds, METRIC_SET, obsByMetric, priors!, graphSnapshot, PHASE9_FINALIST_SPEC);

      const teamGamesThisSeasonSoFar = teamGames.filter((r) => r.week < week);
      const successByTeam = teamSuccessSoFar(teamGamesThisSeasonSoFar);

      const trainGamesThisSeason = games.filter((g) => g.week < week);
      const currentSeasonScores = trainGamesThisSeason.flatMap((g) => [g.homeScore, g.awayScore]).filter((s): s is number => s !== null);
      const currentSeasonSoFarMean = currentSeasonScores.length === 0 ? null : currentSeasonScores.reduce((s, v) => s + v, 0) / currentSeasonScores.length;

      const scoringEnvironmentEstimate = estimateScoringEnvironment(
        { allPriorSeasonsMean, previousSeasonMean, currentSeasonSoFarMean, currentSeasonGamesSoFar: trainGamesThisSeason.length },
        PHASE4_FINALIST_SCORING_CONFIG.scoringEnvironment,
        PHASE4_FINALIST_SCORING_CONFIG.priorGamesWeight,
      );

      // Re-featurize and RE-FOLD every game with week < this cutoff — the intentional duplication that reproduces phase8WalkForwardCore.ts's `for (const game of trainGamesThisSeason) { push home; push away }` (lines 159-164), including games already folded at earlier week cutoffs with different (now-stale) feature values.
      for (const game of trainGamesThisSeason) {
        for (const side of ["home", "away"] as const) {
          const teamId = side === "home" ? game.homeExternalId : game.awayExternalId;
          const opponentId = side === "home" ? game.awayExternalId : game.homeExternalId;
          const actualPoints = side === "home" ? game.homeScore : game.awayScore;
          const teamRating = ratings.get(teamId);
          const oppRating = ratings.get(opponentId);
          const offenseRating = teamRating?.offense ?? null;
          const opponentDefenseRating = oppRating?.defense ?? null;
          const successOwn = successByTeam.get(teamId) ?? null;
          const successOpponentAllowed = successByTeam.get(opponentId) ?? null;
          // Mirrors fitScoringModel's `usable = trainingRows.filter(row => row.actualPoints !== null && columns.every(c => c.extract(row) !== null))` — a row missing ANY required feature is dropped from the fit, never imputed.
          if (actualPoints === null || offenseRating === null || opponentDefenseRating === null || scoringEnvironmentEstimate === null || successOwn === null || successOpponentAllowed === null) continue;
          const hfa = game.neutralSite ? 0 : side === "home" ? 1 : -1;
          const x = [1, scoringEnvironmentEstimate, offenseRating, opponentDefenseRating, hfa, successOwn, successOpponentAllowed];
          foldObservation(ata, atb, x, actualPoints);
          usableRowCount += 1;
        }
      }
    }

    for (const week of weeks) {
      const graphSnapshot = graphByWeek.get(week);
      if (!graphSnapshot) continue;
      foldWeek(week, graphSnapshot);
      // Snapshot AFTER folding — this IS the exact training-pool state fitScoringModel would receive to predict this week's games (see file header: at this point in the loop, the accumulator already equals what a `season < S || (season === S && week < W)` filter over the full duplicated row multiset would select).
      snapshots.push({ season, week, featureNames: SCORING_FEATURE_NAMES, ata: cloneMatrix(ata), atb: [...atb], usableRowCount });
    }

    const maxWeek = weeks[weeks.length - 1];
    lastSeasonState = { games, teamGames, teamIds, graphSnapshot: graphByWeek.get(maxWeek)!, priors, maxWeek, allPriorSeasonsMean, previousSeasonMean };
  }

  // Trailing synthetic boundary snapshot (season 2026, week 1) — folds in the FINAL real week of the last test season too (the real per-week loop above only ever folds games with week < currentWeek, so the very last week's own games are never folded by the natural loop, matching phase8WalkForwardCore.ts exactly). This represents the frozen historical support state a real 2026 production build should combine with live 2026 observations (§3 of the WU3A scoring-artifact directive). UNLIKE every other snapshot above, this exact state is never itself produced or validated by a real Phase 8/9 walk-forward run (Phase 9 never executes a "week 16 of 2025" cutoff) — it is a documented, same-method EXTRAPOLATION one step past the last season Phase 9 actually tested, not a value with direct Phase 8/9 parity coverage.
  if (lastSeasonState) {
    const { games, teamIds, graphSnapshot, maxWeek } = lastSeasonState;
    const boundaryWeek = maxWeek + 1;
    const season = testSeasons[testSeasons.length - 1];
    const foldBoundary = (): void => {
      // Reuses the same fold logic as foldWeek's inner loop, evaluated one virtual week past the season's last real week (i.e. folding in every game of the season, including its final week) using the last available graph snapshot as season-end connectivity (component structure does not change once the season's games are all final).
      const obsByMetric = new Map<CfbMetricName, GameObservation[]>();
      const teamGamesAll = lastSeasonState!.teamGames;
      const teamGamesThisSeasonSoFar = teamGamesAll; // all of the season's games are now "so far"
      const successByTeam = teamSuccessSoFar(teamGamesThisSeasonSoFar);
      const observationsByMetricAll = new Map<CfbMetricName, GameObservation[]>();
      for (const metric of METRIC_SET) observationsByMetricAll.set(metric, buildSeasonObservations(teamGamesAll, seasonGamesCache.get(season)!, metric, "NONE", "gameWeighted"));
      for (const metric of METRIC_SET) obsByMetric.set(metric, observationsByMetricAll.get(metric) ?? []);
      const { ratings } = computeCandidateTeamRatings(teamIds, METRIC_SET, obsByMetric, lastSeasonState!.priors, graphSnapshot, PHASE9_FINALIST_SPEC);

      const currentSeasonScores = games.flatMap((g) => [g.homeScore, g.awayScore]).filter((s): s is number => s !== null);
      const currentSeasonSoFarMean = currentSeasonScores.length === 0 ? null : currentSeasonScores.reduce((s, v) => s + v, 0) / currentSeasonScores.length;
      const scoringEnvironmentEstimate = estimateScoringEnvironment(
        { allPriorSeasonsMean: lastSeasonState!.allPriorSeasonsMean, previousSeasonMean: lastSeasonState!.previousSeasonMean, currentSeasonSoFarMean, currentSeasonGamesSoFar: games.length },
        PHASE4_FINALIST_SCORING_CONFIG.scoringEnvironment,
        PHASE4_FINALIST_SCORING_CONFIG.priorGamesWeight,
      );

      for (const game of games) {
        for (const side of ["home", "away"] as const) {
          const teamId = side === "home" ? game.homeExternalId : game.awayExternalId;
          const opponentId = side === "home" ? game.awayExternalId : game.homeExternalId;
          const actualPoints = side === "home" ? game.homeScore : game.awayScore;
          const teamRating = ratings.get(teamId);
          const oppRating = ratings.get(opponentId);
          const offenseRating = teamRating?.offense ?? null;
          const opponentDefenseRating = oppRating?.defense ?? null;
          const successOwn = successByTeam.get(teamId) ?? null;
          const successOpponentAllowed = successByTeam.get(opponentId) ?? null;
          if (actualPoints === null || offenseRating === null || opponentDefenseRating === null || scoringEnvironmentEstimate === null || successOwn === null || successOpponentAllowed === null) continue;
          const hfa = game.neutralSite ? 0 : side === "home" ? 1 : -1;
          const x = [1, scoringEnvironmentEstimate, offenseRating, opponentDefenseRating, hfa, successOwn, successOpponentAllowed];
          foldObservation(ata, atb, x, actualPoints);
          usableRowCount += 1;
        }
      }
    };
    foldBoundary();
    snapshots.push({ season: season + 1, week: 1, featureNames: SCORING_FEATURE_NAMES, ata: cloneMatrix(ata), atb: [...atb], usableRowCount });
  }

  return snapshots.sort((a, b) => a.season - b.season || a.week - b.week);
}

// ---------------------------------------------------------------------------
// Artifact #2 — calibration/residual seed. Reuses Phase 9's OWN validated
// pipeline output directly (runPhase9Pipeline -> phase5WalkForwardCore's
// `calibrated` array) — not a re-derivation, the actual validated numbers.
// ---------------------------------------------------------------------------

export type CfbV2CalibrationResidualRow = {
  gameId: string;
  season: number;
  week: number;
  rawExpectedHomePoints: number;
  rawExpectedAwayPoints: number;
  rawProjectedMargin: number;
  rawProjectedTotal: number;
  calibratedExpectedHomePoints: number;
  calibratedExpectedAwayPoints: number;
  calibratedTotal: number;
  actualHomePoints: number;
  actualAwayPoints: number;
  actualTotal: number;
  homeResidual: number;
  awayResidual: number;
};

function exportCalibrationResidualSeed(): CfbV2CalibrationResidualRow[] {
  const { calibrated } = runPhase9Pipeline(PHASE9_FINALIST_SPEC, PHASE9_TEST_SEASONS);
  return calibrated
    .map((c): CfbV2CalibrationResidualRow => ({
      gameId: c.gameId,
      season: c.season,
      week: c.week,
      rawExpectedHomePoints: c.rawExpectedHome,
      rawExpectedAwayPoints: c.rawExpectedAway,
      rawProjectedMargin: c.rawProjectedMargin,
      rawProjectedTotal: c.rawProjectedTotal,
      calibratedExpectedHomePoints: c.calibratedExpectedHome,
      calibratedExpectedAwayPoints: c.calibratedExpectedAway,
      calibratedTotal: c.calibratedProjectedTotal,
      actualHomePoints: c.actualHomePoints,
      actualAwayPoints: c.actualAwayPoints,
      actualTotal: c.actualTotal,
      homeResidual: c.actualHomePoints - c.calibratedExpectedHome,
      awayResidual: c.actualAwayPoints - c.calibratedExpectedAway,
    }))
    .sort((a, b) => a.season - b.season || a.week - b.week || a.gameId.localeCompare(b.gameId));
}

// ---------------------------------------------------------------------------
// Envelope + write.
// ---------------------------------------------------------------------------

type SupportEnvelope<T> = {
  schemaVersion: string;
  artifactVersion: string;
  modelVersion: string;
  configVersion: string;
  phase9CandidateVersion: string;
  sourceSeasonStart: number;
  sourceSeasonEnd: number;
  generatedAt: string;
  generatorVersion: string;
  recordCount: number;
  contentHash: string;
  marketFree: true;
  records: readonly T[];
};

function buildEnvelope<T>(artifactVersion: string, records: readonly T[], generatedAt: string): SupportEnvelope<T> {
  const contentHash = `sha-fnv1a-${fnv1aHex(JSON.stringify(records))}`;
  return {
    schemaVersion: "cfb-v2-support-schema-1",
    artifactVersion,
    modelVersion: "cfb-ipr-v2.0",
    configVersion: CFB_V2_CONFIG_HASH,
    phase9CandidateVersion: PHASE9_CANDIDATE_VERSION,
    sourceSeasonStart: Math.min(...PHASE9_TEST_SEASONS),
    sourceSeasonEnd: Math.max(...PHASE9_TEST_SEASONS),
    generatedAt,
    generatorVersion: GENERATOR_VERSION,
    recordCount: records.length,
    contentHash,
    marketFree: true,
    records,
  };
}

/** Regenerates ONLY the scoring normal-equation snapshot artifact — the calibration/residual artifact is untouched by this path (WU3A scoring-artifact-shape revision directive §8: "Do not change the existing calibration/residual artifact unless required"). */
function writeScoringArtifact(): void {
  const generatedAt = new Date().toISOString();
  const snapshots = exportScoringNormalEquationSnapshots();
  const scoringEnvelope = buildEnvelope(SCORING_ARTIFACT_VERSION, snapshots, generatedAt);
  const scoringPath = resolve(SUPPORT_DIR, "scoring-normal-equations-2020-2025.json");
  writeFileSync(scoringPath, `${JSON.stringify(scoringEnvelope, null, 2)}\n`, "utf8");

  const seasons = new Set(snapshots.map((s) => s.season));
  const maxUsableRowCount = Math.max(...snapshots.map((s) => s.usableRowCount));

  // Lightweight self-check log (not a test assertion): solve the final real-cutoff snapshot's own ata/atb and print the coefficient vector so a human skimming the export log sees a sane points-scale result immediately, without needing to run the test suite.
  const lastRealCutoff = snapshots.filter((s) => s.season <= Math.max(...PHASE9_TEST_SEASONS)).slice(-1)[0];
  if (lastRealCutoff) {
    const ridgeAta = cloneMatrix(lastRealCutoff.ata);
    for (let i = 1; i < N_SCORING_PARAMS; i += 1) ridgeAta[i][i] += PHASE4_FINALIST_SCORING_CONFIG.lambda;
    const coefficients = solveLinearSystem(ridgeAta, lastRealCutoff.atb);
    console.log(`[cfb:v2:support-export] sanity-check coefficients at ${lastRealCutoff.season} wk${lastRealCutoff.week} (n=${lastRealCutoff.usableRowCount}):`, JSON.stringify(SCORING_FEATURE_NAMES.map((name, i) => ({ name, value: coefficients[i] }))));
  }

  console.log(`[cfb:v2:support-export] scoring normal-equation snapshots: ${snapshots.length} snapshots, seasons=${[...seasons].sort().join(",")}, max usableRowCount=${maxUsableRowCount}`);
  console.log(`[cfb:v2:support-export] scoring snapshots written to ${scoringPath} (contentHash=${scoringEnvelope.contentHash})`);
}

/** Regenerates ONLY the calibration/residual artifact. Not invoked by the current CLI entrypoint below (calibration is preserved untouched this session) — kept as an explicit, separately-callable function so a future genuine calibration change never has to touch the scoring path. */
function writeCalibrationArtifact(): void {
  const generatedAt = new Date().toISOString();
  const calibrationRows = exportCalibrationResidualSeed();
  const calibrationEnvelope = buildEnvelope(CALIBRATION_ARTIFACT_VERSION, calibrationRows, generatedAt);
  const calibrationPath = resolve(SUPPORT_DIR, "calibration-residual-seed-2020-2025.json");
  writeFileSync(calibrationPath, `${JSON.stringify(calibrationEnvelope, null, 2)}\n`, "utf8");

  const calibrationSeasons = new Set(calibrationRows.map((r) => r.season));
  console.log(`[cfb:v2:support-export] calibration/residual seed: ${calibrationRows.length} rows, seasons=${[...calibrationSeasons].sort().join(",")}`);
  console.log(`[cfb:v2:support-export] calibration/residual seed written to ${calibrationPath} (contentHash=${calibrationEnvelope.contentHash})`);
}

function main(): void {
  const args = new Set(process.argv.slice(2));
  const runScoring = args.size === 0 || args.has("--scoring") || args.has("--scoring-only");
  const runCalibration = args.has("--calibration") || args.has("--all");
  if (runScoring) writeScoringArtifact();
  if (runCalibration) writeCalibrationArtifact();
  if (!runScoring && !runCalibration) console.log("[cfb:v2:support-export] nothing to do — pass --scoring, --calibration, or --all");
}

// Only run when executed directly (`tsx scripts/cfb-v2-support-export.ts ...`) — NOT when
// computeCurrentWeekScoringFeatureRows is imported by phase9CoefficientParity.test.ts, which
// must not trigger a full artifact regeneration (and file write) as a side effect of a test import.
if (process.argv[1] === import.meta.filename) main();
