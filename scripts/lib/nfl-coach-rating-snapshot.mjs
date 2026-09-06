/**
 * Coaching Rating v1 — historical point-in-time rating snapshots.
 *
 * A snapshot for (season S, week W) contains every active head coach entering
 * that week, rated by the FROZEN Coaching Rating v1 composite, computed strictly
 * from games whose kickoff is earlier than the first kickoff of that week.
 *
 * Leakage guarantee
 * -----------------
 *   generated_from_cutoff = min(kickoff_utc) over every scheduled game of
 *   (S, W). A coach's accumulator only ingests completed games with
 *   kickoff_utc < generated_from_cutoff. Therefore:
 *     - week-W results never feed the week-W snapshot;
 *     - a game G in (S, W) may consume this snapshot because
 *       generated_from_cutoff <= G.kickoff, and by construction the snapshot's
 *       newest ingested kickoff is strictly earlier than generated_from_cutoff.
 *
 * Nothing here refits the model. Weights come from COACHING_RATING_V1 only.
 */

import { createCoachAccumulator, toCoachGame } from "./nfl-coach-context.mjs";
import { buildCoachAppearances, deriveCoachSegments } from "./nfl-coach-core.mjs";
import { COACHING_RATING_V1, COACHING_RATING_VERSION, computeCoachRating } from "./nfl-coach-rating.mjs";

export const RATING_SNAPSHOT_SCHEMA_VERSION = "nfl-coach-rating-snapshot-v1";

/** Kickoff sort key mirroring nfl-coach-context-build (dependency-flat). */
function kickoffSortKey(row) {
  const gameday = String(row.gameday ?? "").trim() || "9999-99-99";
  const gametime = String(row.gametime ?? "").trim() || "00:00";
  const week = String(Number(row.week) || 0).padStart(2, "0");
  return `${gameday}T${gametime}|${week}|${String(row.game_id).trim()}`;
}

/** Approx ET->UTC ISO (matches nfl-coach-context-build.etToUtcIsoSafe). */
function etToUtcIso(gameday, gametime) {
  const day = String(gameday ?? "").trim();
  if (!day) return null;
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = String(gametime ?? "00:00").trim().split(":").map(Number);
  if (![y, m, d].every(Number.isFinite)) return null;
  const offset = m >= 3 && m <= 10 ? 4 : 5;
  const iso = `${day}T${String(hh || 0).padStart(2, "0")}:${String(mm || 0).padStart(2, "0")}:00`;
  const ts = Date.parse(`${iso}Z`) + offset * 3600 * 1000;
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}

const weekKey = (season, week) => `${season}|${String(week).padStart(2, "0")}`;

/** Is (season, week) within [start, end] inclusive using (season, week) ordering? */
function withinSegment(seg, season, week) {
  const s = seg.effective_start;
  const e = seg.effective_end;
  const afterStart = season > s.season || (season === s.season && week >= s.week);
  const beforeEnd = season < e.season || (season === e.season && week <= e.week);
  return afterStart && beforeEnd;
}

function recordString(w, l, t) {
  return t ? `${w}-${l}-${t}` : `${w}-${l}`;
}
function tupleRecord(tuple) {
  if (!Array.isArray(tuple)) return "0-0";
  const [w, l, p] = tuple;
  return p ? `${w}-${l}-${p}` : `${w}-${l}`;
}

/**
 * Build point-in-time rating snapshots.
 *
 * @param {object[]} rows      raw games.csv records (all seasons)
 * @param {object}   options
 * @param {object}   options.aliases           curated coach-name aliases
 * @param {object[]} options.interim           curated interim triples
 * @param {number[]} [options.seasons]         seasons to emit (default: all seasons with completed games)
 * @param {string}   options.sourceTimestamp
 * @returns {{ snapshots: Map<string,object>, warnings: string[] }}
 *          key = "<season>/<week>", value = { season, week, generated_from_cutoff, ... , coaches: [...] }
 */
export function buildRatingSnapshots(rows, { aliases = {}, interim = [], seasons = null, sourceTimestamp = "n/a" } = {}) {
  const warnings = [];
  const { appearances, warnings: apWarn } = buildCoachAppearances(rows, { aliases });
  warnings.push(...apWarn);
  const segments = deriveCoachSegments(appearances, { interim });

  // completed games in strict kickoff order
  const completed = rows
    .map((row) => ({ row, game: toCoachGame(row) }))
    .filter((e) => e.game != null)
    .map((e) => ({ ...e, kickoff: etToUtcIso(e.row.gameday, e.row.gametime), sortKey: kickoffSortKey(e.row) }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  // appearance metadata keyed by gameId -> { home, away }
  const apByGame = new Map();
  for (const ap of appearances) {
    if (!apByGame.has(ap.gameId)) apByGame.set(ap.gameId, {});
    apByGame.get(ap.gameId)[ap.isHome ? "home" : "away"] = ap;
  }

  // week-start kickoff for EVERY scheduled (season, week), completed or not
  const weekStart = new Map();
  const weekSeasons = new Set();
  for (const row of rows) {
    const season = Number(row.season);
    const week = Number(row.week);
    if (!Number.isInteger(season) || !Number.isInteger(week)) continue;
    const gt = String(row.game_type ?? "").trim();
    if (gt !== "REG" && gt !== "") {
      // still track playoff weeks; identity uses REG+POST alike
    }
    const kickoff = etToUtcIso(row.gameday, row.gametime);
    if (!kickoff) continue;
    weekSeasons.add(season);
    const k = weekKey(season, week);
    if (!weekStart.has(k) || kickoff < weekStart.get(k)) weekStart.set(k, kickoff);
  }

  const emitSeasons = seasons
    ? new Set(seasons.map(Number))
    : new Set([...weekSeasons]);

  // Targets: (season, week) sorted by week-start kickoff so the ingest pointer
  // only ever moves forward.
  const targets = [...weekStart.entries()]
    .map(([k, cutoff]) => {
      const [season, week] = k.split("|").map(Number);
      return { season, week, cutoff };
    })
    .filter((t) => emitSeasons.has(t.season))
    .sort((a, b) => a.cutoff.localeCompare(b.cutoff));

  const accumulators = new Map(); // coachId -> accumulator
  const getAcc = (coachId) => {
    if (!accumulators.has(coachId)) accumulators.set(coachId, createCoachAccumulator());
    return accumulators.get(coachId);
  };

  const snapshots = new Map();
  let cursor = 0;

  for (const target of targets) {
    // ingest every completed game strictly before this week's first kickoff
    while (cursor < completed.length && (completed[cursor].kickoff ?? "") < target.cutoff) {
      const { game } = completed[cursor];
      const meta = apByGame.get(game.gameId);
      cursor += 1;
      if (!meta || !meta.home || !meta.away) {
        warnings.push(`missing coach appearance metadata for ${game.gameId}`);
        continue;
      }
      const rawRow = completed[cursor - 1].row;
      for (const side of ["home", "away"]) {
        const ap = meta[side];
        const isHome = side === "home";
        getAcc(ap.coachId).record(game, {
          isHome,
          team: ap.team,
          opponent: ap.opponent,
          week: game.week,
          restDays: isHome ? game.homeRest : game.awayRest,
          qbName: (isHome ? rawRow.home_qb_name : rawRow.away_qb_name) || null,
          teamIsDivisionGame: game.divGame,
        });
      }
    }

    // active head coaches entering (season, week): one segment per franchise
    const activeByTeam = new Map();
    for (const seg of segments) {
      if (!withinSegment(seg, target.season, target.week)) continue;
      // if two segments somehow cover the same (team, week), the later start wins
      const prev = activeByTeam.get(seg.team);
      if (!prev || seg.effective_start.season > prev.effective_start.season ||
        (seg.effective_start.season === prev.effective_start.season && seg.effective_start.week > prev.effective_start.week)) {
        activeByTeam.set(seg.team, seg);
      }
    }

    const coaches = [];
    for (const [team, seg] of [...activeByTeam.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const acc = accumulators.get(seg.coach_id);
      const snap = acc
        ? acc.snapshot({ season: target.season, team })
        : { win_over_expectation_per_game: null, win_over_expectation_n: 0, career_win_pct: null, career_games: 0 };
      const rated = computeCoachRating(
        {
          win_over_expectation_per_game: snap.win_over_expectation_per_game,
          win_over_expectation_n: snap.win_over_expectation_n,
          career_win_pct: snap.career_win_pct,
          career_games: snap.career_games,
        },
        COACHING_RATING_V1
      );
      coaches.push({
        coach_id: seg.coach_id,
        coach: seg.coach_name,
        team,
        coaching_rating: rated.coaching_rating,
        raw_score: rated.raw_score,
        raw_z: rated.raw_z,
        z_adjusted: rated.z_adjusted,
        reliability_modifier: rated.components.experience_modifier,
        components: rated.components,
        career_wl: acc ? recordString(snap.career_wins, snap.career_losses, snap.career_ties) : "0-0",
        tenure_wl: acc && snap.tenure_games > 0 ? recordString(snap.tenure_wins, snap.tenure_losses, snap.tenure_ties) : "0-0",
        season_wl: acc ? recordString(snap.season_wins, snap.season_losses, snap.season_ties) : "0-0",
        career_ats: acc ? recordString(snap.career_ats_wins, snap.career_ats_losses, snap.career_ats_pushes) : "0-0",
        tenure_ats: acc && snap.tenure_games > 0 ? recordString(snap.tenure_ats_wins, snap.tenure_ats_losses, snap.tenure_ats_pushes) : "0-0",
        season_ats: acc ? recordString(snap.season_ats_wins, snap.season_ats_losses, snap.season_ats_pushes) : "0-0",
        recent_ats: acc ? tupleRecord(snap.last17_ats) : "0-0",
        career_games: snap.career_games,
        tenure_year: acc ? snap.tenure_year : 1,
        small_sample: rated.small_sample,
        first_year: rated.first_year,
        rating_is_prior: rated.rating_is_prior,
        interim: Boolean(seg.interim_flag),
      });
    }

    snapshots.set(`${target.season}/${target.week}`, {
      schemaVersion: RATING_SNAPSHOT_SCHEMA_VERSION,
      rating_version: COACHING_RATING_VERSION,
      season: target.season,
      week: target.week,
      generated_from_cutoff: target.cutoff,
      newest_ingested_kickoff: cursor > 0 ? completed[cursor - 1].kickoff : null,
      source_timestamp: sourceTimestamp,
      coach_count: coaches.length,
      coaches,
    });
  }

  return { snapshots, warnings };
}

/**
 * Select the leakage-safe coaching snapshot for a historical game.
 * @param {Map<string,object>|object} snapshotsByWeek  key "<season>/<week>"
 * @param {number} season
 * @param {number} week
 * @param {string|null} gameKickoffUtc
 * @returns {object|null} the snapshot, or null when none is valid pregame
 */
export function selectSnapshotForGame(snapshotsByWeek, season, week, gameKickoffUtc) {
  const get = (k) => (snapshotsByWeek instanceof Map ? snapshotsByWeek.get(k) : snapshotsByWeek[k]);
  const snap = get(`${season}/${week}`);
  if (!snap) return null;
  if (gameKickoffUtc && snap.generated_from_cutoff && snap.generated_from_cutoff > gameKickoffUtc) {
    // snapshot cutoff is AFTER this game — would leak; refuse
    return null;
  }
  return snap;
}
