/**
 * Market normalization and descriptive ATS / over-under grading (Phase 5).
 *
 * Source: nflverse nfldata games.csv — the same file the schedules/results
 * pipeline already ingests (see nfl-schedules-results-core.mjs). Its market
 * columns were previously projected away; this module reads them.
 *
 * The source publishes ONE market line per game. It is not attributed to any
 * sportsbook and is not documented as a multi-book consensus, so nothing here
 * names a book or claims an independently verified closing line. For completed
 * games the value is frozen upstream (verified: 6,967 historical regular-season
 * games unchanged across a two-month window), so it is described as the
 * settled historical market line.
 *
 * Everything produced here is descriptive. No projected spread, fair spread,
 * model edge, win probability, pick, confidence, EV or stake sizing exists in
 * this module or anywhere downstream of it.
 */

export const NFL_MARKET_SOURCE_LABEL = "nflverse (nfldata games.csv)";
export const NFL_MARKET_ATTRIBUTION = "Market data: nflverse / nfldata";

/**
 * Spread sign convention, stated once.
 *
 * nfldata `spread_line` is HOME-relative and positive when the home team is
 * favoured: "A positive number means the home team was favored by that many
 * points. This lines up with the result column." (nfldata DATASETS.md)
 *
 * Conventional display notation inverts it:
 *
 *   spread_line = +3.5  ->  home -3.5, away +3.5
 *   spread_line = -3.5  ->  home +3.5, away -3.5
 *   spread_line =  0    ->  pick'em
 */
export function homeTeamSpread(spreadLine) {
  return spreadLine == null ? null : -spreadLine;
}

export function awayTeamSpread(spreadLine) {
  return spreadLine == null ? null : spreadLine;
}

/** Conventional spread for one side of a game. */
export function teamSpread(game, teamAbbr) {
  if (game.spreadLine == null) return null;
  if (teamAbbr === game.homeAbbr) return homeTeamSpread(game.spreadLine);
  if (teamAbbr === game.awayAbbr) return awayTeamSpread(game.spreadLine);
  return null;
}

const SEASON_TYPES = new Set(["REG", "WC", "DIV", "CON", "SB"]);

/**
 * Parse an optional numeric market field.
 *
 * Blank is a real state (no line published yet) and returns null. A non-blank
 * value that is not finite is a schema failure — never coerced to zero.
 */
function parseMarketNumber(raw, label, gameId) {
  const text = String(raw ?? "").trim();
  if (text === "") return null;
  const value = Number(text);
  if (!Number.isFinite(value)) {
    throw new Error(`Malformed ${label} "${raw}" for game ${gameId}`);
  }
  return value;
}

/** American odds. Must be a non-zero integer when present. */
function parseMoneyline(raw, label, gameId) {
  const value = parseMarketNumber(raw, label, gameId);
  if (value == null) return null;
  if (!Number.isInteger(value) || value === 0) {
    throw new Error(`Malformed ${label} "${raw}" for game ${gameId} — expected non-zero American odds`);
  }
  return value;
}

function parseScore(raw, label, gameId) {
  const text = String(raw ?? "").trim();
  if (text === "") return null;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Malformed ${label} score "${raw}" for game ${gameId}`);
  }
  return value;
}

/**
 * Normalize one games.csv row into a market game record.
 *
 * `location` is authoritative for neutral-site detection. The stadium name is
 * never used: for 2025 international games nfldata reports the designated home
 * team's stadium, so inferring from it would be wrong.
 */
export function parseMarketRow(row, teamMap) {
  const gameId = String(row.game_id ?? "").trim();
  if (!gameId) throw new Error("games.csv row without game_id");

  const seasonType = String(row.game_type ?? "").trim();
  if (!SEASON_TYPES.has(seasonType)) {
    throw new Error(`Unknown game_type "${row.game_type}" for game ${gameId}`);
  }
  const season = Number(row.season);
  if (!Number.isInteger(season)) throw new Error(`Malformed season "${row.season}" for game ${gameId}`);
  const week = Number(row.week);
  if (!Number.isInteger(week) || week < 1) throw new Error(`Malformed week "${row.week}" for game ${gameId}`);

  const home = teamMap.get(String(row.home_team ?? "").trim());
  const away = teamMap.get(String(row.away_team ?? "").trim());
  if (!home) throw new Error(`Unknown home team "${row.home_team}" in game ${gameId}`);
  if (!away) throw new Error(`Unknown away team "${row.away_team}" in game ${gameId}`);

  const homeScore = parseScore(row.home_score, "home", gameId);
  const awayScore = parseScore(row.away_score, "away", gameId);
  if ((homeScore == null) !== (awayScore == null)) {
    throw new Error(`Game ${gameId} has only one score — malformed source row`);
  }

  const location = String(row.location ?? "").trim();
  if (location !== "" && location !== "Home" && location !== "Neutral") {
    throw new Error(`Unknown location "${row.location}" for game ${gameId}`);
  }

  return {
    gameId,
    season,
    week,
    seasonType,
    gameday: String(row.gameday ?? "").trim() || null,
    homeAbbr: home.abbr,
    awayAbbr: away.abbr,
    homeTeam: home.name,
    awayTeam: away.name,
    homeScore,
    awayScore,
    final: homeScore != null && awayScore != null,
    neutralSite: location === "Neutral",
    spreadLine: parseMarketNumber(row.spread_line, "spread_line", gameId),
    totalLine: parseMarketNumber(row.total_line, "total_line", gameId),
    homeMoneyline: parseMoneyline(row.home_moneyline, "home_moneyline", gameId),
    awayMoneyline: parseMoneyline(row.away_moneyline, "away_moneyline", gameId),
  };
}

/**
 * ATS margin for one team: scoring margin adjusted by that team's own spread.
 *
 *   home: (home_score - away_score) - spread_line
 *   away: (away_score - home_score) + spread_line
 *
 * Positive means the team beat its market line; negative means it fell short.
 * This is a description of past results, never a projection.
 */
export function teamAtsMargin(game, teamAbbr) {
  if (!game.final || game.spreadLine == null) return null;
  const margin = game.homeScore - game.awayScore;
  if (teamAbbr === game.homeAbbr) return margin - game.spreadLine;
  if (teamAbbr === game.awayAbbr) return -margin + game.spreadLine;
  return null;
}

/** ATS result for one team. Pushes are preserved, never folded into W or L. */
export function gradeAts(game, teamAbbr) {
  const margin = teamAtsMargin(game, teamAbbr);
  if (margin == null) return null;
  if (margin > 0) return "W";
  if (margin < 0) return "L";
  return "P";
}

/** Over/under result. A whole-number total can push; a half-point one cannot. */
export function gradeOverUnder(game) {
  if (!game.final || game.totalLine == null) return null;
  const actual = game.homeScore + game.awayScore;
  if (actual > game.totalLine) return "O";
  if (actual < game.totalLine) return "U";
  return "P";
}

/** spread_line === 0. Excluded from favourite/underdog splits, kept in overall. */
export function isPickem(game) {
  return game.spreadLine === 0;
}

/**
 * Was this team the market favourite? `null` for pick'em or no line — never
 * forced into one bucket.
 */
export function teamIsFavorite(game, teamAbbr) {
  if (game.spreadLine == null || game.spreadLine === 0) return null;
  const spread = teamSpread(game, teamAbbr);
  if (spread == null) return null;
  return spread < 0;
}

/** Straight-up result for one team. */
export function gradeStraightUp(game, teamAbbr) {
  if (!game.final) return null;
  const margin = teamAbbr === game.homeAbbr
    ? game.homeScore - game.awayScore
    : game.awayScore - game.homeScore;
  if (margin > 0) return "W";
  if (margin < 0) return "L";
  return "T";
}

/** Point margin for one team in one game. */
export function teamPointMargin(game, teamAbbr) {
  if (!game.final) return null;
  return teamAbbr === game.homeAbbr
    ? game.homeScore - game.awayScore
    : game.awayScore - game.homeScore;
}

/**
 * A team's completed regular-season games in chronological order.
 *
 * Postseason is excluded entirely: these are regular-season profiles. Byes
 * simply produce no game, so "last 5" counts games and never calendar weeks.
 * Ordering is by kickoff date then week then game id, so a flexed game cannot
 * silently reorder the log.
 */
export function buildTeamGameLog(games, teamAbbr, season) {
  return games
    .filter(
      (game) =>
        game.season === season &&
        game.seasonType === "REG" &&
        game.final &&
        (game.homeAbbr === teamAbbr || game.awayAbbr === teamAbbr)
    )
    .sort(
      (a, b) =>
        (a.gameday ?? "").localeCompare(b.gameday ?? "") ||
        a.week - b.week ||
        a.gameId.localeCompare(b.gameId)
    );
}

function tally(values, keys) {
  const counts = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const value of values) {
    if (value != null && value in counts) counts[value] += 1;
  }
  return counts;
}

function mean(values) {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Descriptive profile for one team over a set of completed regular-season games.
 *
 * Home/away splits use `neutralSite` to exclude games where the designated home
 * team had no home field — an international game or a relocation is not a home
 * game. Those games still count in the overall ATS, over/under and window
 * records, so nothing is silently dropped from the headline numbers.
 */
export function summarizeGames(gameLog, teamAbbr) {
  const su = gameLog.map((g) => gradeStraightUp(g, teamAbbr));
  const ats = gameLog.map((g) => gradeAts(g, teamAbbr));
  const ou = gameLog.map((g) => gradeOverUnder(g));
  const margins = gameLog.map((g) => teamPointMargin(g, teamAbbr)).filter((v) => v != null);
  const atsMargins = gameLog.map((g) => teamAtsMargin(g, teamAbbr)).filter((v) => v != null);

  const homeGames = gameLog.filter((g) => g.homeAbbr === teamAbbr && !g.neutralSite);
  const awayGames = gameLog.filter((g) => g.awayAbbr === teamAbbr && !g.neutralSite);
  const favGames = gameLog.filter((g) => teamIsFavorite(g, teamAbbr) === true);
  const dogGames = gameLog.filter((g) => teamIsFavorite(g, teamAbbr) === false);

  const atsOf = (list) => tally(list.map((g) => gradeAts(g, teamAbbr)), ["W", "L", "P"]);
  const atsDiffOf = (list) =>
    mean(list.map((g) => teamAtsMargin(g, teamAbbr)).filter((v) => v != null));

  return {
    games: gameLog.length,
    gameIds: gameLog.map((g) => g.gameId),
    record: tally(su, ["W", "L", "T"]),
    pointDifferential: mean(margins),
    ats: tally(ats, ["W", "L", "P"]),
    atsDifferential: mean(atsMargins),
    overUnder: tally(ou, ["O", "U", "P"]),
    homeAts: atsOf(homeGames),
    awayAts: atsOf(awayGames),
    homeAtsDifferential: atsDiffOf(homeGames),
    awayAtsDifferential: atsDiffOf(awayGames),
    homeGames: homeGames.length,
    awayGames: awayGames.length,
    neutralGames: gameLog.filter((g) => g.neutralSite).length,
    favoriteAts: atsOf(favGames),
    underdogAts: atsOf(dogGames),
    favoriteGames: favGames.length,
    underdogGames: dogGames.length,
    pickemGames: gameLog.filter(isPickem).length,
  };
}

/** The N most recent completed regular-season games. */
export function lastNGames(gameLog, n) {
  return n >= gameLog.length ? [...gameLog] : gameLog.slice(gameLog.length - n);
}

/**
 * Current market for one game, in conventional orientation.
 *
 * Every field is independent: a missing spread never borrows from the
 * moneyline, and a missing moneyline is never derived from the spread.
 */
export function currentMarketFor(game) {
  return {
    gameId: game.gameId,
    season: game.season,
    week: game.week,
    seasonType: game.seasonType,
    homeAbbr: game.homeAbbr,
    awayAbbr: game.awayAbbr,
    neutralSite: game.neutralSite,
    spread: {
      home: homeTeamSpread(game.spreadLine),
      away: awayTeamSpread(game.spreadLine),
    },
    moneyline: { home: game.homeMoneyline, away: game.awayMoneyline },
    total: game.totalLine,
    /** Raw source value retained so orientation stays auditable. */
    rawSpreadLine: game.spreadLine,
  };
}

/** League ranks, 1 = best. Higher-is-better metrics only. Ties share a rank. */
export function rankHigherIsBetter(valuesByTeam) {
  const entries = Object.entries(valuesByTeam).filter(([, v]) => v != null && Number.isFinite(v));
  entries.sort((a, b) => b[1] - a[1]);
  const ranks = {};
  let previous = null;
  let previousRank = 0;
  entries.forEach(([team, value], index) => {
    const rank = previous != null && value === previous ? previousRank : index + 1;
    ranks[team] = rank;
    previous = value;
    previousRank = rank;
  });
  return ranks;
}
