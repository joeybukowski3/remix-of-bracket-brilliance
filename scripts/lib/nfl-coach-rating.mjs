/**
 * Coaching Rating v1 — deterministic composite of the two forward-supported
 * coaching signals, plus a small-sample reliability modifier.
 *
 * Provenance / evidence (data/nfl/coaching/coaching-ratings-research.json,
 * 731 leakage-safe coach-seasons, 1999–2025):
 *
 *   - win_over_market_expectation_per_game  KEEP     (primary; weak but real
 *     persistence, best forward signal — seasoned fwd-next-season r ≈ 0.19)
 *   - career_straight_up_win_pct            KEEP     (secondary, roster/QB
 *     confounded — shrunk hard, seasoned fwd-next-season r ≈ 0.19 but split-half
 *     SB r ≈ 0.75 so mostly persistence of the SUPPORTING CAST)
 *   - experience / tenure / playoff games   KEEP-BUT-SHRINK — used ONLY as a
 *     reliability modifier (adding it as a fitted additive term REDUCED
 *     out-of-sample r and its sign flipped across folds), never a score engine.
 *   - every ATS path (career / recent / favorite / underdog / division /
 *     after-bye)                            CONTEXT-ONLY or DROP — forward r ≈ 0.
 *     ATS is NOT an input to this rating. It is displayed as context only.
 *
 * The composite weights were fit by OLS against a blend of same-season and
 * next-season win-over-market-expectation, validated with rolling-origin
 * (train season < T, test season == T) across 2009–2025: out-of-sample
 * r ≈ 0.15 (same season) / ≈ 0.22 (next season), sign-consistent every fold.
 * Shrinkage constants kA/kB were chosen from the research-recommended priors
 * (kA≈32, kB≈40); out-of-sample r is flat (±0.005) across kA∈[16,64],
 * kB∈[20,80], so the simpler research prior is used rather than a tuned value.
 *
 * Everything here is a pure function of its inputs. Frozen parameters live in
 * COACHING_RATING_V1 — never mutate it, bump the version instead.
 */

export const COACHING_RATING_VERSION = "coaching-v1.0.0";

/**
 * Immutable fitted parameters. Regenerating them is a versioned event:
 * change RATING_VERSION and record the new provenance, do not silently edit.
 */
export const COACHING_RATING_V1 = Object.freeze({
  version: COACHING_RATING_VERSION,
  fitted_at: "2026-09-06",
  target: "blend of same-season and next-season win-over-market-expectation per game",
  validation: "rolling-origin (train season<T, test season==T), 2009–2025",
  shrinkage: Object.freeze({
    // empirical-Bayes pseudo-counts (Beta / Normal priors)
    k_win_over_expectation: 32, // prior mean 0 win-over-expectation per game
    k_career_win_pct: 40, // prior mean .500
  }),
  weights: Object.freeze({
    // raw_score = intercept + w_woe * woe_shrunk + w_win_pct * (win_pct_shrunk - 0.5)
    intercept: -0.02906,
    w_win_over_expectation: 0.26546,
    w_career_win_pct: 0.22121,
  }),
  // moments of raw_score across the 731 fitted coach-seasons — used to z-score.
  // moments of the FULL raw_score (intercept included) over the 731 fitted rows.
  raw_score_population: Object.freeze({ mean: -0.019181, sd: 0.023539, n: 731 }),
  // presentation: rating = clamp(round(50 + points_per_sd * z_adjusted), 0, 100)
  transform: Object.freeze({ center: 50, points_per_sd: 10, min: 0, max: 100 }),
  // reliability modifier (multiplies z before the transform)
  reliability: Object.freeze({
    full_sample_games: 50, // >= this: reliability 1.0 (normal fitted shrinkage)
    floor_games: 17, // [floor, full): linear ramp 0.5 -> 1.0
    ramp_floor: 0.5, // reliability at exactly floor_games
    // < floor_games: reliability 0 (league-average prior, first-year / tiny sample)
  }),
  // coaching-advantage designation
  even_threshold: 4, // |rating differential| <= 4 -> EVEN (practical noise floor ~3 + margin)
});

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/**
 * Normal-prior shrinkage of a per-game mean toward 0.
 * @param {number} rawPerGame  observed win-over-expectation per game
 * @param {number} n           number of games behind that mean
 * @param {number} [k]         pseudo-count (defaults to frozen k)
 */
export function shrinkWinOverExpectation(rawPerGame, n, k = COACHING_RATING_V1.shrinkage.k_win_over_expectation) {
  if (!Number.isFinite(rawPerGame) || !Number.isFinite(n) || n <= 0) return 0;
  return rawPerGame * (n / (n + k));
}

/**
 * Beta-prior shrinkage of a win rate toward .500.
 * @param {number} winPct   observed straight-up win pct (ties already 0.5)
 * @param {number} games    career games behind that pct
 * @param {number} [k]      pseudo-count (defaults to frozen k)
 * @returns {number} shrunk win pct in [0,1]
 */
export function shrinkCareerWinPct(winPct, games, k = COACHING_RATING_V1.shrinkage.k_career_win_pct) {
  if (!Number.isFinite(winPct) || !Number.isFinite(games) || games <= 0) return 0.5;
  return winPct * (games / (games + k)) + 0.5 * (k / (games + k));
}

/**
 * Small-sample reliability multiplier in [0,1]. Encodes the research finding
 * that coach signal is an "average-band prior" under 17 career games, heavily
 * shrunk 17–49, and stable at 50+.
 */
export function reliabilityModifier(careerGames, cfg = COACHING_RATING_V1.reliability) {
  if (!Number.isFinite(careerGames) || careerGames < cfg.floor_games) return 0;
  if (careerGames >= cfg.full_sample_games) return 1;
  const span = cfg.full_sample_games - cfg.floor_games;
  return cfg.ramp_floor + (1 - cfg.ramp_floor) * ((careerGames - cfg.floor_games) / span);
}

/**
 * Component values for one coach's entering-signal snapshot.
 * @param {object} e  { win_over_expectation_per_game, win_over_expectation_n,
 *                       career_win_pct, career_games }
 */
export function ratingComponents(e, params = COACHING_RATING_V1) {
  const woeRaw = Number.isFinite(e.win_over_expectation_per_game) ? e.win_over_expectation_per_game : null;
  const woeN = Number.isFinite(e.win_over_expectation_n) ? e.win_over_expectation_n : 0;
  const winPctRaw = Number.isFinite(e.career_win_pct) ? e.career_win_pct : null;
  const games = Number.isFinite(e.career_games) ? e.career_games : 0;
  return {
    win_over_expectation_raw: woeRaw,
    win_over_expectation_shrunk: shrinkWinOverExpectation(woeRaw ?? 0, woeN, params.shrinkage.k_win_over_expectation),
    career_win_pct_raw: winPctRaw,
    career_win_pct_shrunk: shrinkCareerWinPct(winPctRaw ?? 0.5, games, params.shrinkage.k_career_win_pct),
    experience_modifier: reliabilityModifier(games, params.reliability),
    career_games: games,
    has_signal: woeRaw != null && winPctRaw != null && games >= 1,
  };
}

/**
 * Fitted composite raw score (units: expected forward win-over-market-expectation
 * per game). Prior mean when there is no signal.
 */
export function rawScore(components, params = COACHING_RATING_V1) {
  const w = params.weights;
  if (!components.has_signal) return params.raw_score_population.mean;
  return (
    w.intercept +
    w.w_win_over_expectation * components.win_over_expectation_shrunk +
    w.w_career_win_pct * (components.career_win_pct_shrunk - 0.5)
  );
}

/** z-score of a raw score against the frozen fitted population. */
export function rawZ(score, params = COACHING_RATING_V1) {
  const p = params.raw_score_population;
  return (score - p.mean) / p.sd;
}

/**
 * Full rating for one coach.
 * @returns {{ coaching_rating:number, raw_score:number, raw_z:number,
 *             z_adjusted:number, components:object, first_year:boolean,
 *             small_sample:boolean, rating_is_prior:boolean }}
 */
export function computeCoachRating(entering, params = COACHING_RATING_V1) {
  const components = ratingComponents(entering, params);
  const score = rawScore(components, params);
  const z = components.has_signal ? rawZ(score, params) : 0;
  const zAdjusted = z * components.experience_modifier;
  const t = params.transform;
  const rating = clamp(Math.round(t.center + t.points_per_sd * zAdjusted), t.min, t.max);
  const games = components.career_games;
  return {
    coaching_rating: rating,
    raw_score: round6(score),
    raw_z: round4(z),
    z_adjusted: round4(zAdjusted),
    components: {
      win_over_expectation_raw: round4(components.win_over_expectation_raw),
      win_over_expectation_shrunk: round4(components.win_over_expectation_shrunk),
      career_win_pct_raw: round4(components.career_win_pct_raw),
      career_win_pct_shrunk: round4(components.career_win_pct_shrunk),
      experience_modifier: round4(components.experience_modifier),
    },
    first_year: games < params.reliability.floor_games,
    small_sample: games < params.reliability.full_sample_games,
    rating_is_prior: !components.has_signal,
  };
}

/** Assign 1-based ranks (1 = highest rating). Ties share the lower rank number. */
export function assignRanks(entries) {
  const sorted = [...entries].sort((a, b) => b.coaching_rating - a.coaching_rating || b.raw_z - a.raw_z);
  const withRank = sorted.map((e, i) => ({ ...e, rating_rank: i + 1 }));
  return withRank;
}

/**
 * Coaching-advantage designation for a matchup.
 * @returns {"HOME"|"AWAY"|"EVEN"}
 */
export function coachingAdvantage(homeRating, awayRating, threshold = COACHING_RATING_V1.even_threshold) {
  if (!Number.isFinite(homeRating) || !Number.isFinite(awayRating)) return "EVEN";
  const diff = homeRating - awayRating;
  if (Math.abs(diff) <= threshold) return "EVEN";
  return diff > 0 ? "HOME" : "AWAY";
}

/** 0–100 rating -> descriptive band (matches the published legend). */
export function ratingBand(rating) {
  if (rating >= 90) return "elite";
  if (rating >= 80) return "strong";
  if (rating >= 70) return "above average";
  if (rating >= 60) return "slightly above average";
  if (rating >= 40) return "average";
  if (rating >= 30) return "below average";
  if (rating >= 20) return "poor";
  return "extreme";
}

function round4(x) { return x == null || !Number.isFinite(x) ? null : Number(x.toFixed(4)); }
function round6(x) { return x == null || !Number.isFinite(x) ? null : Number(x.toFixed(6)); }
