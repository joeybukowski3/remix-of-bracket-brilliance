/**
 * Canonical NFL head-coach identity + tenure-segment derivation.
 *
 * Source: nflverse nfldata games.csv `home_coach` / `away_coach` free-text
 * columns (present per game back to 1999) -- the SAME file the schedules/
 * results pipeline (`nfl-schedules-results-core.mjs`) and the market pipeline
 * (`nfl-market-core.mjs`) already fetch. This module does NOT download it; the
 * generator passes parsed rows in.
 *
 * Design:
 *   - Coach identity is a deterministic slug of the normalized name.
 *   - A "segment" is a maximal unbroken run of a franchise's games under one
 *     coach, ordered strictly by kickoff. A midseason firing (a different
 *     coach appears, then possibly the first returns) produces separate
 *     segments -- one coach is never assumed to hold an entire season.
 *   - Historical franchise relocations are folded onto the current abbr so a
 *     coach's tenure is continuous across a move (none in the modern data,
 *     but STL/SD/OAK rows are handled defensively).
 *
 * Nothing here reads scores, lines, or produces a rating.
 */

/** nflverse team code -> canonical repo abbr, including relocated franchises. */
export const NFLVERSE_FRANCHISE_ABBR = {
  ARI: "ari", ATL: "atl", BAL: "bal", BUF: "buf", CAR: "car", CHI: "chi",
  CIN: "cin", CLE: "cle", DAL: "dal", DEN: "den", DET: "det", GB: "gb",
  HOU: "hou", IND: "ind", JAX: "jax", KC: "kc", MIA: "mia", MIN: "min",
  NE: "ne", NO: "no", NYG: "nyg", NYJ: "nyj", PHI: "phi", PIT: "pit",
  SEA: "sea", SF: "sf", TB: "tb", TEN: "ten",
  LAC: "lac", LA: "lar", LAR: "lar", LV: "lv", WAS: "wsh", WSH: "wsh",
  // relocated / legacy codes fold onto the current franchise
  SD: "lac", STL: "lar", OAK: "lv",
};

export function franchiseAbbr(nflverseCode) {
  const abbr = NFLVERSE_FRANCHISE_ABBR[String(nflverseCode ?? "").trim().toUpperCase()];
  if (!abbr) throw new Error(`Unknown nflverse team code "${nflverseCode}"`);
  return abbr;
}

const DIACRITICS = /[̀-ͯ]/g;

/** Deterministic display-name normalization (whitespace + curated aliases). */
export function normalizeCoachName(raw, aliases = {}) {
  const collapsed = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (collapsed === "") return "";
  if (aliases[collapsed]) return aliases[collapsed];
  // also try a whitespace-insensitive alias match
  for (const [from, to] of Object.entries(aliases)) {
    if (from.replace(/\s+/g, " ").trim() === collapsed) return to;
  }
  return collapsed;
}

/** Stable coach_id: slug of the normalized name. Punctuation/accents dropped. */
export function coachIdFromName(normalizedName) {
  const slug = normalizedName
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/['.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new Error(`Cannot derive coach_id from "${normalizedName}"`);
  return slug;
}

/**
 * Normalize the raw games.csv rows the generator hands in into a flat,
 * kickoff-sorted list of coach appearances (one per side per game).
 *
 * Each row must have: game_id, season, game_type, week, gameday, gametime,
 * home_team, away_team, home_coach, away_coach.
 *
 * `seasons` (optional) restricts to those season ints. Rows with a blank coach
 * are dropped with a recorded warning (never silently), because a segment
 * cannot be anchored without a name.
 */
export function buildCoachAppearances(rows, { aliases = {}, seasons = null } = {}) {
  const seasonSet = seasons ? new Set(seasons.map(Number)) : null;
  const warnings = [];
  const appearances = [];

  for (const row of rows) {
    const season = Number(row.season);
    if (!Number.isInteger(season)) continue;
    if (seasonSet && !seasonSet.has(season)) continue;
    const week = Number(row.week);
    const gameType = String(row.game_type ?? "").trim();
    const gameId = String(row.game_id ?? "").trim();
    if (!gameId || !Number.isInteger(week)) {
      warnings.push(`skipped row with bad game_id/week: ${JSON.stringify(row.game_id)}`);
      continue;
    }
    const gameday = String(row.gameday ?? "").trim() || null;
    const gametime = String(row.gametime ?? "").trim() || null;
    const sortKey = `${gameday ?? "9999-99-99"}T${gametime ?? "00:00"}|${String(week).padStart(2, "0")}|${gameId}`;

    for (const side of ["home", "away"]) {
      const rawCoach = row[`${side}_coach`];
      const name = normalizeCoachName(rawCoach, aliases);
      if (!name) {
        warnings.push(`blank ${side}_coach for ${gameId}`);
        continue;
      }
      appearances.push({
        gameId,
        season,
        week,
        gameType,
        isRegularSeason: gameType === "REG",
        isPlayoff: gameType !== "REG",
        gameday,
        gametime,
        sortKey,
        isHome: side === "home",
        team: franchiseAbbr(row[`${side}_team`]),
        opponent: franchiseAbbr(row[side === "home" ? "away_team" : "home_team"]),
        coachId: coachIdFromName(name),
        coachName: name,
      });
    }
  }

  appearances.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return { appearances, warnings };
}

/**
 * Derive canonical tenure segments from coach appearances.
 *
 * A segment breaks when, walking a single franchise's games in kickoff order,
 * the head coach changes. If coach X returns after coach Y, X gets a second
 * segment. Interim status comes from the curated override triples.
 */
export function deriveCoachSegments(appearances, { interim = [] } = {}) {
  const interimKey = new Set(
    interim
      .filter((entry) => entry && entry.coach_id && entry.team && !entry.not_interim)
      .map((entry) => `${entry.coach_id}|${entry.team}|${entry.season ?? "*"}`)
  );
  const isInterim = (coachId, team, season) =>
    interimKey.has(`${coachId}|${team}|${season}`) || interimKey.has(`${coachId}|${team}|*`);

  // franchise -> appearances (already globally sorted, so per-team order holds)
  const byTeam = new Map();
  for (const ap of appearances) {
    if (!byTeam.has(ap.team)) byTeam.set(ap.team, []);
    byTeam.get(ap.team).push(ap);
  }

  const segments = [];
  for (const [team, teamAps] of byTeam) {
    let current = null;
    for (const ap of teamAps) {
      if (!current || current.coach_id !== ap.coachId) {
        if (current) segments.push(current);
        current = {
          coach_id: ap.coachId,
          coach_name: ap.coachName,
          team,
          role: "HEAD_COACH",
          season_start: ap.season,
          season_end: ap.season,
          effective_start: { season: ap.season, week: ap.week, date: ap.gameday },
          effective_end: { season: ap.season, week: ap.week, date: ap.gameday },
          first_game_id: ap.gameId,
          last_game_id: ap.gameId,
          games: 1,
          interim_flag: isInterim(ap.coachId, team, ap.season),
        };
      } else {
        current.season_end = ap.season;
        current.effective_end = { season: ap.season, week: ap.week, date: ap.gameday };
        current.last_game_id = ap.gameId;
        current.games += 1;
        if (isInterim(ap.coachId, team, ap.season)) current.interim_flag = true;
        // keep the most recent non-normalized spelling stable: prefer first seen
      }
    }
    if (current) segments.push(current);
  }

  // first_year_with_team: earliest segment season for this (coach_id, team)
  const firstYear = new Map();
  for (const seg of segments) {
    const key = `${seg.coach_id}|${seg.team}`;
    firstYear.set(key, Math.min(firstYear.get(key) ?? Infinity, seg.season_start));
  }
  for (const seg of segments) {
    seg.first_year_with_team = firstYear.get(`${seg.coach_id}|${seg.team}`);
  }

  segments.sort(
    (a, b) =>
      a.effective_start.season - b.effective_start.season ||
      a.effective_start.week - b.effective_start.week ||
      a.team.localeCompare(b.team)
  );
  return segments;
}

/** Roll segments up into the coach-history.json record shape. */
export function buildCoachHistory(segments, { source, sourceTimestamp }) {
  return segments.map((seg) => ({
    coach_id: seg.coach_id,
    coach_name: seg.coach_name,
    team: seg.team,
    role: "HEAD_COACH",
    season_start: seg.season_start,
    season_end: seg.season_end,
    effective_start: seg.effective_start,
    effective_end: seg.effective_end,
    interim_flag: seg.interim_flag,
    first_year_with_team: seg.first_year_with_team,
    games: seg.games,
    first_game_id: seg.first_game_id,
    last_game_id: seg.last_game_id,
    source,
    source_timestamp: sourceTimestamp,
  }));
}
