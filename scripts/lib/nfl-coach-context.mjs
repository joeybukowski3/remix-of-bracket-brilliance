/**
 * Leakage-safe pregame coach-game context.
 *
 * For every completed game, and for each of the two head coaches, this builds a
 * record computed ONLY from that coach's games whose kickoff is strictly
 * earlier than the target game's kickoff. The target game is never counted in
 * its own pregame record.
 *
 * ATS sign contract (approved, matches nfl-prediction-outcome-resolver.ts):
 *
 *   home_line         = -spread_line            (nfldata spread_line is
 *                                                home-relative, + = home fav)
 *   home_cover_margin = (home_score - away_score) + home_line
 *                     = result - spread_line
 *
 *   home_cover_margin > 0 -> home covered
 *   home_cover_margin < 0 -> away covered
 *   home_cover_margin = 0 -> push
 *
 * Null spread_line -> excluded from ATS counts, still counted straight-up.
 * Pushes are preserved and excluded from the ats_pct denominator.
 */

const MARGIN_SD = 13.86; // empirical NFL final-margin standard deviation

/** Standard normal CDF (Abramowitz & Stegun 7.1.26). */
export function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

/**
 * Normalize a raw games.csv row into a settled-game fact used by the context
 * engine. Returns null for non-final games.
 */
export function toCoachGame(row) {
  const homeScore = row.home_score === "" || row.home_score == null ? null : Number(row.home_score);
  const awayScore = row.away_score === "" || row.away_score == null ? null : Number(row.away_score);
  if (homeScore == null || awayScore == null || !Number.isFinite(homeScore) || !Number.isFinite(awayScore)) {
    return null;
  }
  const spreadRaw = String(row.spread_line ?? "").trim();
  const spreadLine = spreadRaw === "" ? null : Number(spreadRaw);
  if (spreadLine != null && !Number.isFinite(spreadLine)) {
    throw new Error(`Malformed spread_line "${row.spread_line}" for ${row.game_id}`);
  }
  const homeRestRaw = String(row.home_rest ?? "").trim();
  const awayRestRaw = String(row.away_rest ?? "").trim();
  return {
    gameId: String(row.game_id).trim(),
    season: Number(row.season),
    week: Number(row.week),
    gameType: String(row.game_type ?? "").trim(),
    isRegularSeason: String(row.game_type ?? "").trim() === "REG",
    homeScore,
    awayScore,
    homeMargin: homeScore - awayScore,
    spreadLine,
    homeCoverMargin: spreadLine == null ? null : homeScore - awayScore - spreadLine,
    divGame: String(row.div_game ?? "").trim() === "1",
    homeRest: homeRestRaw === "" ? null : Number(homeRestRaw),
    awayRest: awayRestRaw === "" ? null : Number(awayRestRaw),
  };
}

/** Straight-up result for a team ("W" | "L" | "T"). */
export function straightUpResult(game, isHome) {
  const m = isHome ? game.homeMargin : -game.homeMargin;
  return m > 0 ? "W" : m < 0 ? "L" : "T";
}

/** ATS result for a team ("W" | "L" | "P" | null when no line). */
export function atsResult(game, isHome) {
  if (game.homeCoverMargin == null) return null;
  const teamCover = isHome ? game.homeCoverMargin : -game.homeCoverMargin;
  return teamCover > 0 ? "W" : teamCover < 0 ? "L" : "P";
}

/** Was this team the pregame favorite? null for pick'em / no line. */
export function teamIsFavorite(game, isHome) {
  if (game.spreadLine == null || game.spreadLine === 0) return null;
  // spread_line > 0 => home favored
  return isHome ? game.spreadLine > 0 : game.spreadLine < 0;
}

/** team's spread-implied win probability (Φ of expected margin / SD). */
export function impliedWinProb(game, isHome) {
  if (game.spreadLine == null) return null;
  const expectedTeamMargin = isHome ? game.spreadLine : -game.spreadLine;
  return normalCdf(expectedTeamMargin / MARGIN_SD);
}

const emptyWl = () => ({ w: 0, l: 0, t: 0 });
const emptyAts = () => ({ w: 0, l: 0, p: 0 });

function addWl(acc, r) {
  if (r === "W") acc.w += 1;
  else if (r === "L") acc.l += 1;
  else acc.t += 1;
}
function addAts(acc, r) {
  if (r === "W") acc.w += 1;
  else if (r === "L") acc.l += 1;
  else if (r === "P") acc.p += 1;
}
function wlPct(acc) {
  const denom = acc.w + acc.l + acc.t;
  return denom === 0 ? null : Number(((acc.w + 0.5 * acc.t) / denom).toFixed(4));
}
function atsPct(acc) {
  const denom = acc.w + acc.l;
  return denom === 0 ? null : Number((acc.w / denom).toFixed(4));
}
const tup = (acc, kind) => (kind === "ats" ? [acc.w, acc.l, acc.p] : [acc.w, acc.l, acc.t]);

/**
 * A per-coach running accumulator. Feed it the coach's completed games in
 * strict kickoff order; snapshot() returns the pregame context for the NEXT
 * game (i.e. everything seen so far, target excluded by construction).
 */
export function createCoachAccumulator() {
  const state = {
    firstSeason: null,
    lastSeason: null,
    segmentStartKey: null, // {season, week} of current unbroken tenure with current team
    currentTeam: null,
    careerGames: 0,
    tenureGames: 0,
    playoffGames: 0,
    // ordered game log of { season, seasonKeyIndex, wl, ats, ... } for trailing windows
    log: [],
    seasonWl: new Map(), // season -> wl
    seasonAts: new Map(),
    seasonPointsFor: new Map(),
    seasonPointsAgainst: new Map(),
    seasonGames: new Map(),
    career: { wl: emptyWl(), ats: emptyAts() },
    reg: { wl: emptyWl(), ats: emptyAts() },
    playoff: { wl: emptyWl(), ats: emptyAts() },
    tenure: { wl: emptyWl(), ats: emptyAts() },
    favorite: { wl: emptyWl(), ats: emptyAts() },
    underdog: { wl: emptyWl(), ats: emptyAts() },
    division: { wl: emptyWl(), ats: emptyAts() },
    afterBye: { wl: emptyWl(), ats: emptyAts() },
    oneScore: { wl: emptyWl() },
    winOverExpSum: 0,
    winOverExpN: 0,
    lastQbName: null,
    lastGameTeam: null,
  };

  function snapshot(target) {
    // trailing windows over the ordered log
    const last17 = state.log.slice(-17);
    const priorSeason = target.season;
    // A snapshot for a game with a DIFFERENT team than the accumulator's
    // current team is the coach's first game of a NEW tenure -> tenure counters
    // read as fresh (0-0, year 1) even though record() has not run yet.
    const freshTenure = target.team != null && state.currentTeam != null && target.team !== state.currentTeam;
    const noTenureYet = state.currentTeam == null || freshTenure;
    const last2Seasons = state.log.filter((e) => e.season >= priorSeason - 2 && e.season <= priorSeason - 1);
    const last3Seasons = state.log.filter((e) => e.season >= priorSeason - 3 && e.season <= priorSeason - 1);
    const windowWl = (entries) => {
      const acc = emptyWl();
      entries.forEach((e) => addWl(acc, e.wl));
      return tup(acc, "wl");
    };
    const windowAts = (entries) => {
      const acc = emptyAts();
      entries.forEach((e) => e.ats && addAts(acc, e.ats));
      return tup(acc, "ats");
    };

    const seasonWl = state.seasonWl.get(priorSeason) ?? emptyWl();
    const seasonAts = state.seasonAts.get(priorSeason) ?? emptyAts();

    const tenureYear = noTenureYet || !state.segmentStartKey
      ? 1
      : priorSeason - state.segmentStartKey.season + 1;
    const tenureWl = noTenureYet ? emptyWl() : state.tenure.wl;
    const tenureAts = noTenureYet ? emptyAts() : state.tenure.ats;
    const tenureGames = noTenureYet ? 0 : state.tenureGames;

    return {
      career_games: state.careerGames,
      tenure_games: tenureGames,
      playoff_games: state.playoffGames,
      tenure_year: tenureYear,
      // first year AS A HEAD COACH WITH THIS TEAM (the research "first-year coach" cohort)
      first_year: tenureYear <= 1,
      first_year_as_hc: state.firstSeason === priorSeason,
      career_wins: state.career.wl.w, career_losses: state.career.wl.l, career_ties: state.career.wl.t,
      career_win_pct: wlPct(state.career.wl),
      reg_wins: state.reg.wl.w, reg_losses: state.reg.wl.l, reg_ties: state.reg.wl.t,
      playoff_wins: state.playoff.wl.w, playoff_losses: state.playoff.wl.l,
      tenure_wins: tenureWl.w, tenure_losses: tenureWl.l, tenure_ties: tenureWl.t,
      tenure_win_pct: wlPct(tenureWl),
      season_wins: seasonWl.w, season_losses: seasonWl.l, season_ties: seasonWl.t,
      season_win_pct: wlPct(seasonWl),
      last17_wl: windowWl(last17),
      last2_seasons_wl: windowWl(last2Seasons),
      last3_seasons_wl: windowWl(last3Seasons),

      career_ats_wins: state.career.ats.w, career_ats_losses: state.career.ats.l, career_ats_pushes: state.career.ats.p,
      career_ats_pct: atsPct(state.career.ats),
      tenure_ats_wins: tenureAts.w, tenure_ats_losses: tenureAts.l, tenure_ats_pushes: tenureAts.p,
      tenure_ats_pct: atsPct(tenureAts),
      season_ats_wins: seasonAts.w, season_ats_losses: seasonAts.l, season_ats_pushes: seasonAts.p,
      season_ats_pct: atsPct(seasonAts),
      last17_ats: windowAts(last17),
      last2_seasons_ats: windowAts(last2Seasons),
      last3_seasons_ats: windowAts(last3Seasons),

      favorite_wl: tup(state.favorite.wl, "wl"), favorite_ats: tup(state.favorite.ats, "ats"),
      underdog_wl: tup(state.underdog.wl, "wl"), underdog_ats: tup(state.underdog.ats, "ats"),
      division_wl: tup(state.division.wl, "wl"), division_ats: tup(state.division.ats, "ats"),
      after_bye_wl: tup(state.afterBye.wl, "wl"), after_bye_ats: tup(state.afterBye.ats, "ats"),
      one_score_wl: tup(state.oneScore.wl, "wl"),
      playoff_wl: tup(state.playoff.wl, "wl"), playoff_ats: tup(state.playoff.ats, "ats"),

      win_over_expectation_per_game:
        state.winOverExpN === 0 ? null : Number((state.winOverExpSum / state.winOverExpN).toFixed(4)),
      win_over_expectation_n: state.winOverExpN,

      same_qb_games: null, // filled by caller (needs target QB)
      qb_change_flag: null,
      last_qb_name: state.lastQbName,
    };
  }

  /**
   * Record one completed game for this coach.
   * @param {object} game    - normalized game (toCoachGame output)
   * @param {object} ctx     - { isHome, team, opponent, week, restDays, qbName, teamIsDivisionGame }
   */
  function record(game, ctx) {
    const isHome = ctx.isHome;
    const wl = straightUpResult(game, isHome);
    const ats = atsResult(game, isHome);
    const fav = teamIsFavorite(game, isHome);
    const teamMargin = isHome ? game.homeMargin : -game.homeMargin;
    const pf = isHome ? game.homeScore : game.awayScore;
    const pa = isHome ? game.awayScore : game.homeScore;
    const rest = ctx.restDays;

    // segment / tenure tracking
    if (state.currentTeam !== ctx.team) {
      state.currentTeam = ctx.team;
      state.segmentStartKey = { season: game.season, week: game.week };
      state.tenureGames = 0;
      state.tenure = { wl: emptyWl(), ats: emptyAts() };
    }

    state.firstSeason ??= game.season;
    state.lastSeason = game.season;
    state.careerGames += 1;
    state.tenureGames += 1;
    if (!game.isRegularSeason) state.playoffGames += 1;

    addWl(state.career.wl, wl);
    if (ats) addAts(state.career.ats, ats);
    addWl(state.tenure.wl, wl);
    if (ats) addAts(state.tenure.ats, ats);
    const bucket = game.isRegularSeason ? state.reg : state.playoff;
    addWl(bucket.wl, wl);
    if (ats) addAts(bucket.ats, ats);

    if (fav === true) { addWl(state.favorite.wl, wl); if (ats) addAts(state.favorite.ats, ats); }
    else if (fav === false) { addWl(state.underdog.wl, wl); if (ats) addAts(state.underdog.ats, ats); }
    if (ctx.teamIsDivisionGame) { addWl(state.division.wl, wl); if (ats) addAts(state.division.ats, ats); }
    if (rest != null && rest >= 13) { addWl(state.afterBye.wl, wl); if (ats) addAts(state.afterBye.ats, ats); }
    if (Math.abs(teamMargin) > 0 && Math.abs(teamMargin) <= 8) addWl(state.oneScore.wl, wl);

    const p = impliedWinProb(game, isHome);
    if (p != null) {
      state.winOverExpSum += (wl === "W" ? 1 : wl === "T" ? 0.5 : 0) - p;
      state.winOverExpN += 1;
    }

    const s = game.season;
    if (!state.seasonWl.has(s)) {
      state.seasonWl.set(s, emptyWl());
      state.seasonAts.set(s, emptyAts());
      state.seasonPointsFor.set(s, 0);
      state.seasonPointsAgainst.set(s, 0);
      state.seasonGames.set(s, 0);
    }
    addWl(state.seasonWl.get(s), wl);
    if (ats) addAts(state.seasonAts.get(s), ats);
    state.seasonPointsFor.set(s, state.seasonPointsFor.get(s) + pf);
    state.seasonPointsAgainst.set(s, state.seasonPointsAgainst.get(s) + pa);
    state.seasonGames.set(s, state.seasonGames.get(s) + 1);

    state.log.push({ season: s, wl, ats, isReg: game.isRegularSeason });
    state.lastQbName = ctx.qbName ?? state.lastQbName;
  }

  function seasonSummaries() {
    const out = [];
    for (const s of [...state.seasonGames.keys()].sort((a, b) => a - b)) {
      const wl = state.seasonWl.get(s);
      out.push({
        season: s,
        games: state.seasonGames.get(s),
        wins: wl.w, losses: wl.l, ties: wl.t,
        win_pct: wlPct(wl),
        points_for: state.seasonPointsFor.get(s),
        points_against: state.seasonPointsAgainst.get(s),
        ppg: Number((state.seasonPointsFor.get(s) / state.seasonGames.get(s)).toFixed(2)),
      });
    }
    return out;
  }

  return { snapshot, record, seasonSummaries, _state: state };
}
