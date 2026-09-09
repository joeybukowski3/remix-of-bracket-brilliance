/**
 * Leakage-safe, per-game rolling EPA-allowed rank for every team, built
 * entirely from the canonical nflverse `epa_team_game` cache
 * (data/nfl/nflverse/epa-team-game/epa_team_game_<season>.csv) -- the same
 * per-game EPA authority the frozen Season/Last-5 `matchup-epa.json`
 * artifact (src/lib/nfl/epaData.ts) is built from. This module answers a
 * different question than that artifact: not "what is team X's EPA allowed
 * right now", but "what would team X's EPA-allowed rank have been entering
 * game G", for every historical game G. Used only by the Yardage Props
 * Review Last-10 tables' "Opp Def Rank" / "Opp Off Rank" columns.
 *
 * Methodology (documented, not invented ad hoc): for team T's game at
 * chronological position i (across every season/week in the input, sorted),
 * the pregame rolling value is the mean off_epa/play allowed (an opponent's
 * own off_epa in a game where T was the opponent -- i.e. what T's defense
 * allowed) over T's trailing up to 10 games strictly before game i. Rank 1
 * = stingiest defense (lowest EPA allowed) among every team with at least
 * one trailing game at that same chronological point; a team with zero
 * trailing games (its first-ever game in the input) has no pregame rank
 * (null), never a fabricated rank 1 or league-average fallback.
 *
 * Symmetric offense rank (own EPA/play, not allowed) is produced from the
 * same rows for "Opp Off Rank" (the opposing offense's pregame rank).
 *
 * Pure, dependency-free -- no filesystem/network access here.
 */

const TRAILING_GAMES = 10;

/**
 * `epa_team_game_<season>.csv` (nflfastR play-by-play) uses a different team
 * code than `stats_player_week_<season>.csv` (nflverse weekly stats) for two
 * franchises: the Rams ("LAR" vs "LA") and Washington ("WSH" vs "WAS"). Every
 * other team code agrees between the two files. `nfl-yardage-history-core.mjs`
 * joins this module's rolling rank index against `opponentTeam`/`team` codes
 * that come from `stats_player_week` (via `normalizeHistoryStatRows`) and from
 * `teams.json`'s `nflverseAbbr` (which also uses the `stats_player_week`
 * convention -- see `buildNflverseTeamMap`), so an unaliased "LAR"/"WSH" key
 * here would never match and would silently rank those two teams' games as
 * null forever. Aliasing at ingestion keeps every downstream key in this
 * module on the single `stats_player_week` convention.
 */
const EPA_TEAM_CODE_ALIAS = { LAR: "LA", WSH: "WAS" };

function normalizeEpaTeamCode(code) {
  const upper = String(code).toUpperCase();
  return EPA_TEAM_CODE_ALIAS[upper] ?? upper;
}

/**
 * @param {ReadonlyArray<Record<string,string>>} rows - parsed epa_team_game_<season>.csv rows (string cells).
 * @returns {{ gameId: string, season: number, week: number, team: string, opponent: string, offEpa: number, offPlays: number }[]}
 */
export function normalizeEpaTeamGameRows(rows) {
  const out = [];
  for (const row of rows) {
    const season = Number(row.season);
    const week = Number(row.week);
    const offEpa = Number(row.off_epa);
    const offPlays = Number(row.off_plays);
    if (!Number.isInteger(season) || !Number.isInteger(week) || week < 1) continue;
    if (!row.team || !row.opponent) continue;
    if (!Number.isFinite(offEpa) || !Number.isFinite(offPlays) || offPlays <= 0) continue;
    out.push({
      gameId: row.game_id,
      season,
      week,
      team: normalizeEpaTeamCode(row.team),
      opponent: normalizeEpaTeamCode(row.opponent),
      offEpa,
      offPlays,
    });
  }
  return out;
}

/** Chronological ordering: season, then week. Ties (same season/week) are not orderable further -- acceptable, since a team plays at most one game per (season, week). */
function byChronology(a, b) {
  return a.season - b.season || a.week - b.week;
}

/**
 * The trailing-10-game mean of `offEpa`/`offPlays` over `games` strictly
 * before `cutoff` (by {@link byChronology}) -- the single formula behind
 * every pregame rolling EPA/play value this module produces, whether the
 * cutoff is a game that's actually in `games` ({@link buildPregameRollingEpa},
 * one historical game rolling into the next) or an arbitrary
 * not-yet-played (season, week) ({@link buildPregameRollingEpaAt}, this
 * week's upcoming matchup). Same leakage rule either way: only games
 * strictly earlier than `cutoff` are ever included.
 *
 * @param {{season:number, week:number}[]} games - already sorted by {@link byChronology}.
 * @param {{season:number, week:number}} cutoff
 * @returns {{ value: number|null, trailingGames: number }}
 */
function trailingMeanBeforeCutoff(games, cutoff) {
  const prior = games.filter((g) => byChronology(g, cutoff) < 0).slice(-TRAILING_GAMES);
  if (prior.length === 0) return { value: null, trailingGames: 0 };
  const value = prior.reduce((s, g) => s + g.offEpa, 0) / prior.reduce((s, g) => s + g.offPlays, 0);
  return { value, trailingGames: prior.length };
}

function groupByTeamAndAllowed(rows) {
  const byTeam = new Map();
  for (const row of rows) {
    const list = byTeam.get(row.team) ?? [];
    list.push(row);
    byTeam.set(row.team, list);
  }
  // Defensive (allowed) rows: for team T, every OTHER team's offensive row where opponent === T.
  const allowedByTeam = new Map();
  for (const row of rows) {
    const list = allowedByTeam.get(row.opponent) ?? [];
    list.push(row);
    allowedByTeam.set(row.opponent, list);
  }
  return { byTeam, allowedByTeam };
}

/**
 * Build, for every (team, season, week) present in the input, the pregame
 * trailing-10 offensive EPA/play and defensive (allowed) EPA/play -- using
 * ONLY games strictly earlier in chronological order for that team.
 *
 * @param {ReturnType<typeof normalizeEpaTeamGameRows>} rows
 * @returns {Map<string, { season:number, week:number, team:string, offEpaPerPlay:number|null, defEpaAllowedPerPlay:number|null, trailingGames:number }>} keyed by `${team}|${season}|${week}`
 */
export function buildPregameRollingEpa(rows) {
  const { byTeam, allowedByTeam } = groupByTeamAndAllowed(rows);

  const out = new Map();
  for (const [team, games] of byTeam) {
    const sorted = [...games].sort(byChronology);
    const allowedSorted = [...(allowedByTeam.get(team) ?? [])].sort(byChronology);

    for (const game of sorted) {
      const own = trailingMeanBeforeCutoff(sorted, game);
      const allowed = trailingMeanBeforeCutoff(allowedSorted, game);

      out.set(`${team}|${game.season}|${game.week}`, {
        season: game.season,
        week: game.week,
        team,
        offEpaPerPlay: own.value,
        defEpaAllowedPerPlay: allowed.value,
        trailingGames: own.trailingGames,
      });
    }
  }
  return out;
}

/**
 * Same pregame trailing-10-game methodology as {@link buildPregameRollingEpa}
 * (identical {@link trailingMeanBeforeCutoff} formula, identical leakage
 * rule), but evaluated at an arbitrary `(season, week)` cutoff instead of
 * requiring a played game for that team at that exact cutoff -- e.g. this
 * week's not-yet-played matchup, which has no `epa_team_game` row of its
 * own yet. Every team that has played at least one prior game (own or
 * allowed) gets an entry at `${team}|${season}|${week}`; a team with zero
 * such games resolves to `null` values, never a fabricated rank.
 *
 * @param {ReturnType<typeof normalizeEpaTeamGameRows>} rows
 * @param {number} season
 * @param {number} week
 * @returns {Map<string, { season:number, week:number, team:string, offEpaPerPlay:number|null, defEpaAllowedPerPlay:number|null, trailingGames:number }>} keyed by `${team}|${season}|${week}`, same shape as {@link buildPregameRollingEpa}.
 */
export function buildPregameRollingEpaAt(rows, season, week) {
  const { byTeam, allowedByTeam } = groupByTeamAndAllowed(rows);
  const cutoff = { season, week };

  const teams = new Set([...byTeam.keys(), ...allowedByTeam.keys()]);
  const out = new Map();
  for (const team of teams) {
    const sorted = [...(byTeam.get(team) ?? [])].sort(byChronology);
    const allowedSorted = [...(allowedByTeam.get(team) ?? [])].sort(byChronology);

    const own = trailingMeanBeforeCutoff(sorted, cutoff);
    const allowed = trailingMeanBeforeCutoff(allowedSorted, cutoff);

    out.set(`${team}|${season}|${week}`, {
      season,
      week,
      team,
      offEpaPerPlay: own.value,
      defEpaAllowedPerPlay: allowed.value,
      trailingGames: own.trailingGames,
    });
  }
  return out;
}

/**
 * Rank every team's pregame value at a given (season, week) cutoff --
 * lower EPA allowed is a better (rank 1) defense; higher own EPA is a
 * better (rank 1) offense. Teams with a null pregame value (no trailing
 * games yet) are excluded from ranking entirely, never assigned a
 * fabricated rank.
 *
 * @param {ReturnType<typeof buildPregameRollingEpa>} rollingIndex
 * @param {number} season
 * @param {number} week
 * @param {"offense"|"defense"} side
 * @returns {Map<string, number>} team -> rank (1 = best)
 */
export function rankTeamsAt(rollingIndex, season, week, side) {
  const field = side === "offense" ? "offEpaPerPlay" : "defEpaAllowedPerPlay";
  const entries = [];
  for (const value of rollingIndex.values()) {
    if (value.season !== season || value.week !== week) continue;
    if (value[field] == null) continue;
    entries.push({ team: value.team, value: value[field] });
  }
  // Offense: higher EPA/play is better -> sort descending. Defense (allowed): lower is better -> sort ascending.
  entries.sort((a, b) => (side === "offense" ? b.value - a.value : a.value - b.value));
  const ranks = new Map();
  entries.forEach((entry, index) => ranks.set(entry.team, index + 1));
  return ranks;
}

export { TRAILING_GAMES };
