/**
 * Assemble the public coaching-ratings artifact from raw games.csv rows.
 *
 * Pipeline: games.csv -> leakage-safe per-coach accumulators (only completed
 * games count) -> entering-2026 snapshot for each franchise's 2026 head coach
 * -> frozen Coaching Rating v1 composite.
 *
 * The current/upcoming-season rating is built ONLY from completed prior games
 * (the accumulator never sees a non-final game). No historical evaluation row
 * is touched here — historical leakage handling lives in game-context wiring.
 */

import { buildCoachGameContext } from "./nfl-coach-context-build.mjs";
import { franchiseAbbr, coachIdFromName, normalizeCoachName } from "./nfl-coach-core.mjs";
import { toCoachGame } from "./nfl-coach-context.mjs";
import {
  COACHING_RATING_V1,
  COACHING_RATING_VERSION,
  assignRanks,
  computeCoachRating,
  coachingAdvantage,
  ratingBand,
} from "./nfl-coach-rating.mjs";

const CURRENT_SEASON = 2026;

/** Machine-readable study metadata so a later research-library page can cite it. */
export const COACHING_STUDY_META = Object.freeze({
  title: "Head-coach forward-signal study (Coaching Rating v1)",
  version: "coaching-study-v1",
  date: "2026-09-06",
  dataset: "nflverse nfldata games.csv, 731 leakage-safe coach-seasons, 1999–2025",
  methodology:
    "Coach-season unit. Entering signal = state through end of S-1. Persistence via odd/even split-half (autocorrelation-free) + year-to-year. Forward value via entering signal vs actual win-over-market-expectation during S and S+1. Composite weights fit by OLS, validated rolling-origin 2009–2025.",
  key_findings: [
    "Coach ATS skill did not persist — every ATS window (career, recent, favorite, underdog, division, after-bye) had forward r ≈ 0.",
    "Win-over-market-expectation was the strongest supported forward signal (seasoned fwd-next-season r ≈ 0.19), though its raw persistence is weak (split-half SB r ≈ 0.18).",
    "Straight-up win% is highly persistent (split-half SB r ≈ 0.75) but roster/QB confounded — kept as a hard-shrunk secondary component.",
    "First-year head coaches have no usable prior NFL-HC signal — assigned the league-average prior.",
    "Signal stabilizes materially around 50+ career games; 17–49 is heavily shrunk; <17 is an average-band prior.",
    "Adding experience/tenure as a fitted additive term reduced out-of-sample r and flipped sign across folds — experience is used only as a reliability modifier.",
  ],
  signal_classifications: {
    win_over_market_expectation: "KEEP (primary)",
    career_straight_up_win_pct: "KEEP (secondary, shrunk)",
    experience_tenure_playoff: "KEEP-BUT-SHRINK (reliability modifier only)",
    ats_all_windows: "CONTEXT-ONLY / DROP (not a rating input)",
  },
  limitations: [
    "Forward r ≈ 0.19 — a coach rating explains a small share of forward outcome variance; the rating is analysis context, not a model input.",
    "Leakage-safe research cannot fully remove roster/QB confounding from win%.",
    "No point-in-time historical rating snapshots are materialized yet, so historical evaluation rows cannot carry a coaching rating.",
    "Current roster reflects the repo's canonical 2026 scenario (src/data/nflOffseason2026.ts / games.csv 2026 rows).",
  ],
  model_decision:
    "Ship Coaching Rating v1 as ANALYSIS CONTEXT only. ATS shown as record context, never weighted. Rating is deliberately low-dynamic-range (forward r is small). Not an input to Sides/Totals model math.",
});

function completedRows(rows) {
  return rows.filter((r) => toCoachGame(r) != null);
}

/** franchise abbr -> 2026 head-coach display name, from the 2026 games.csv rows. */
export function currentHeadCoaches(rows, { aliases = {} } = {}) {
  const byTeam = new Map();
  for (const r of rows) {
    if (Number(r.season) !== CURRENT_SEASON) continue;
    for (const side of ["home", "away"]) {
      const raw = r[`${side}_coach`];
      const name = normalizeCoachName(raw, aliases);
      if (!name) continue;
      const abbr = franchiseAbbr(r[`${side}_team`]);
      if (!byTeam.has(abbr)) byTeam.set(abbr, name);
    }
  }
  return byTeam;
}

/**
 * @param {object[]} rows      raw games.csv records (1999..current)
 * @param {object}   options   { aliases, interim, generatedAt, sourceTimestamp }
 * @returns {object} the coaching-ratings.json payload (minus _meta)
 */
export function buildCoachingRatings(rows, { aliases = {}, interim = [], sourceTimestamp = "n/a" } = {}) {
  const completed = completedRows(rows);
  const { coachAccumulators } = buildCoachGameContext(completed, {
    aliases, interim, seasons: [], source: "nflverse (nfldata games.csv)", sourceTimestamp,
  });
  const heads = currentHeadCoaches(rows, { aliases });

  const coaches = [];
  for (const [team, coachName] of [...heads.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const coachId = coachIdFromName(coachName);
    const acc = coachAccumulators.get(coachId);
    const snap = acc ? acc.snapshot({ season: CURRENT_SEASON, team }) : null;

    const entering = snap ?? {
      win_over_expectation_per_game: null, win_over_expectation_n: 0,
      career_win_pct: null, career_games: 0,
    };
    const rated = computeCoachRating(entering, COACHING_RATING_V1);

    const rec = (wl) => (wl ? `${wl.w}-${wl.l}${wl.t ? `-${wl.t}` : ""}` : "0-0");
    const tup3 = (t) => (Array.isArray(t) ? `${t[0]}-${t[1]}${t[2] ? `-${t[2]}` : ""}` : null);
    const s = snap;

    coaches.push({
      coach_id: coachId,
      coach: coachName,
      team,
      status: !s || s.career_games === 0 ? "FIRST_YEAR_HC"
        : s.tenure_games === 0 ? "NEW_TEAM" : "RETURNING",
      tenure_year: s ? s.tenure_year : 1,
      first_year: rated.first_year,
      interim: false,
      small_sample: rated.small_sample,
      rating_is_prior: rated.rating_is_prior,

      coaching_rating: rated.coaching_rating,
      rating_band: ratingBand(rated.coaching_rating),
      rating_rank: null, // filled by assignRanks below
      raw_score: rated.raw_score,
      raw_z: rated.raw_z,
      z_adjusted: rated.z_adjusted,

      win_over_expectation_raw: rated.components.win_over_expectation_raw,
      win_over_expectation_shrunk: rated.components.win_over_expectation_shrunk,
      career_win_pct_raw: rated.components.career_win_pct_raw,
      career_win_pct_shrunk: rated.components.career_win_pct_shrunk,
      experience_modifier: rated.components.experience_modifier,

      // visible record context — DISPLAYED ONLY, never a rating input
      career_wl: s ? rec({ w: s.career_wins, l: s.career_losses, t: s.career_ties }) : "0-0",
      career_win_pct: s ? s.career_win_pct : null,
      career_games: s ? s.career_games : 0,
      tenure_wl: s && s.tenure_games > 0 ? rec({ w: s.tenure_wins, l: s.tenure_losses, t: s.tenure_ties }) : "0-0",
      season_wl: "0-0", // 2026 not started
      career_ats: s ? `${s.career_ats_wins}-${s.career_ats_losses}${s.career_ats_pushes ? `-${s.career_ats_pushes}` : ""}` : "0-0",
      career_ats_pct: s ? s.career_ats_pct : null,
      tenure_ats: s && s.tenure_games > 0 ? `${s.tenure_ats_wins}-${s.tenure_ats_losses}${s.tenure_ats_pushes ? `-${s.tenure_ats_pushes}` : ""}` : "0-0",
      season_ats: "0-0",
      last17_ats: s ? tup3(s.last17_ats) : null,
      playoff_wl: s ? tup3(s.playoff_wl) : null,
      playoff_games: s ? s.playoff_games : 0,
    });
  }

  const ranked = assignRanks(coaches).sort((a, b) => a.rating_rank - b.rating_rank);

  const ratings = ranked.map((c) => c.coaching_rating).sort((a, b) => a - b);
  const distributionSummary = {
    count: ranked.length,
    min: ratings[0],
    p25: ratings[Math.floor(ratings.length * 0.25)],
    median: ratings[Math.floor(ratings.length * 0.5)],
    mean: Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)),
    p75: ratings[Math.floor(ratings.length * 0.75)],
    max: ratings[ratings.length - 1],
    spread: ratings[ratings.length - 1] - ratings[0],
    first_year_count: ranked.filter((c) => c.first_year).length,
    small_sample_count: ranked.filter((c) => c.small_sample).length,
    prior_count: ranked.filter((c) => c.rating_is_prior).length,
  };

  return {
    schemaVersion: "nfl-coaching-ratings-v1",
    ratingVersion: COACHING_RATING_VERSION,
    sourceCutoff: `completed games through ${latestCompletedSeason(completed)} season`,
    fittedParameters: COACHING_RATING_V1,
    study: COACHING_STUDY_META,
    distributionSummary,
    evenThreshold: COACHING_RATING_V1.even_threshold,
    ratingLegend: {
      "90-100": "elite", "80-89": "strong", "70-79": "above average",
      "60-69": "slightly above average", "40-59": "average", "30-39": "below average",
      "20-29": "poor", "0-19": "extreme",
    },
    coaches: ranked,
  };
}

/** Preview a matchup's coaching advantage from the built artifact. */
export function matchupCoachingAdvantage(artifact, homeTeam, awayTeam) {
  const byTeam = new Map(artifact.coaches.map((c) => [c.team, c]));
  const home = byTeam.get(homeTeam);
  const away = byTeam.get(awayTeam);
  if (!home || !away) return { status: "COACH_UNRATED", advantage: "EVEN" };
  return {
    status: "OK",
    home_coach: home.coach,
    away_coach: away.coach,
    home_coaching_rating: home.coaching_rating,
    away_coaching_rating: away.coaching_rating,
    coaching_differential: home.coaching_rating - away.coaching_rating,
    coaching_advantage_team: coachingAdvantage(home.coaching_rating, away.coaching_rating),
  };
}

function latestCompletedSeason(completed) {
  return Math.max(...completed.map((r) => Number(r.season)).filter(Number.isInteger));
}
