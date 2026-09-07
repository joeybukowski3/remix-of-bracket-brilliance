/**
 * Orchestrates the leakage-safe coach-game-context build.
 *
 * Walks every completed game in strict kickoff order. Before recording a game
 * into the two coaches' running accumulators, it snapshots each accumulator --
 * that snapshot is the pregame context for THIS game (target excluded by
 * construction, because record() happens after snapshot()).
 */

import { createCoachAccumulator, toCoachGame } from "./nfl-coach-context.mjs";
import { buildCoachAppearances } from "./nfl-coach-core.mjs";

function sortKey(row) {
  const gameday = String(row.gameday ?? "").trim() || "9999-99-99";
  const gametime = String(row.gametime ?? "").trim() || "00:00";
  const week = String(Number(row.week) || 0).padStart(2, "0");
  return `${gameday}T${gametime}|${week}|${String(row.game_id).trim()}`;
}

/**
 * @param {object[]} rows     raw games.csv records
 * @param {object}   options
 * @param {object}   options.aliases            curated name aliases
 * @param {object[]} options.interim            curated interim triples
 * @param {number[]} [options.seasons]          seasons to EMIT rows for (history is always built from all prior games)
 * @param {string}   options.source
 * @param {string}   options.sourceTimestamp
 * @returns {{ rowsBySeason: Map<number, object[]>, coachAccumulators: Map<string, object>, warnings: string[] }}
 */
export function buildCoachGameContext(rows, { aliases = {}, interim = [], seasons = null, source, sourceTimestamp }) {
  const emitSet = seasons ? new Set(seasons.map(Number)) : null;
  const warnings = [];

  // appearance metadata keyed by gameId -> { home: appearance, away: appearance }
  const { appearances, warnings: apWarn } = buildCoachAppearances(rows, { aliases });
  warnings.push(...apWarn);
  const apByGame = new Map();
  for (const ap of appearances) {
    if (!apByGame.has(ap.gameId)) apByGame.set(ap.gameId, {});
    apByGame.get(ap.gameId)[ap.isHome ? "home" : "away"] = ap;
  }

  const completed = rows
    .map((row) => ({ row, game: toCoachGame(row) }))
    .filter((entry) => entry.game != null)
    .sort((a, b) => sortKey(a.row).localeCompare(sortKey(b.row)));

  const accumulators = new Map(); // coachId -> accumulator
  const getAcc = (coachId) => {
    if (!accumulators.has(coachId)) accumulators.set(coachId, createCoachAccumulator());
    return accumulators.get(coachId);
  };

  const rowsBySeason = new Map();

  for (const { row, game } of completed) {
    const meta = apByGame.get(game.gameId);
    if (!meta || !meta.home || !meta.away) {
      warnings.push(`missing coach appearance metadata for ${game.gameId}`);
      continue;
    }
    const kickoffUtc = etToUtcIsoSafe(row.gameday, row.gametime);
    const homeQb = String(row.home_qb_name ?? "").trim() || null;
    const awayQb = String(row.away_qb_name ?? "").trim() || null;

    for (const side of ["home", "away"]) {
      const ap = meta[side];
      const oppAp = meta[side === "home" ? "away" : "home"];
      const isHome = side === "home";
      const acc = getAcc(ap.coachId);
      const qbName = isHome ? homeQb : awayQb;

      if (emitSet == null || emitSet.has(game.season)) {
        const snap = acc.snapshot({ season: game.season, team: ap.team });
        const qbChange = snap.last_qb_name != null && qbName != null && snap.last_qb_name !== qbName;
        const record = {
          game_id: game.gameId,
          season: game.season,
          week: game.week,
          game_type: game.gameType,
          kickoff_utc: kickoffUtc,
          coach_id: ap.coachId,
          coach_name: ap.coachName,
          team: ap.team,
          opponent: ap.opponent,
          is_home: isHome,
          opp_coach_id: oppAp.coachId,
          opp_coach_name: oppAp.coachName,
          qb_name: qbName,
          pregame: {
            ...snap,
            qb_change_flag: qbChange ? true : qbName != null && snap.last_qb_name != null ? false : null,
            same_qb_games: null,
          },
          provenance: {
            cutoff_rule: "strictly earlier kickoff than this game; target game excluded from its own record",
            source,
            source_timestamp: sourceTimestamp,
            rating_version: null,
          },
        };
        delete record.pregame.last_qb_name;
        if (!rowsBySeason.has(game.season)) rowsBySeason.set(game.season, []);
        rowsBySeason.get(game.season).push(record);
      }
    }

    // NOW record the game (after every snapshot) -> no same-game leakage
    for (const side of ["home", "away"]) {
      const ap = meta[side];
      const isHome = side === "home";
      const acc = getAcc(ap.coachId);
      acc.record(game, {
        isHome,
        team: ap.team,
        opponent: ap.opponent,
        week: game.week,
        restDays: isHome ? game.homeRest : game.awayRest,
        qbName: isHome ? homeQb : awayQb,
        teamIsDivisionGame: game.divGame,
      });
    }
  }

  for (const [, list] of rowsBySeason) {
    list.sort((a, b) => (a.kickoff_utc ?? "").localeCompare(b.kickoff_utc ?? "") || a.game_id.localeCompare(b.game_id));
  }

  return { rowsBySeason, coachAccumulators: accumulators, warnings };
}

// Local, dependency-free ET->UTC (mirrors nfl-schedules-results-core.etToUtcIso
// without importing it, to keep this module's dep graph flat for tests).
function etToUtcIsoSafe(gameday, gametime) {
  const day = String(gameday ?? "").trim();
  const time = String(gametime ?? "").trim();
  if (!day) return null;
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  if (![y, m, d].every(Number.isFinite)) return null;
  // Approx ET offset: EDT (-4) Mar-Nov, EST (-5) otherwise. NFL season games
  // are Sep-Feb; good enough for an ordering/provenance timestamp.
  const month = m;
  const offset = month >= 3 && month <= 10 ? 4 : 5;
  const iso = `${day}T${String(hh).padStart(2, "0")}:${String(mm || 0).padStart(2, "0")}:00`;
  const ts = Date.parse(`${iso}Z`) + offset * 3600 * 1000;
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}
