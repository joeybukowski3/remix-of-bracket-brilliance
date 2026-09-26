/**
 * NFL AI Picks v2, WU1 -- deterministic current-season FORM FACTS.
 *
 * Pure builder: takes already-loaded rows and returns, for ONE team going into
 * ONE matchup, raw descriptive football facts for (a) the season to date,
 * (b) the most recent completed game, and (c) a rolling window of the last
 * RECENT_WINDOW_GAMES completed games. No file I/O (see
 * nfl-team-form-facts-loader.ts), no model calls.
 *
 * INDEPENDENCE: this module carries ingredients only. It never reads or emits
 * a JKB projected spread/total/winner, market edge, power rating, Current OVR,
 * Team Performance Rating, offense-vs-defense advantage label, matchup score,
 * TD score, or coaching rating. Nothing here says which team is better.
 *
 * POINT-IN-TIME: a game counts only when it is a regular-season game, has a
 * final result, and its scheduled kickoff is STRICTLY BEFORE the matchup's
 * kickoff (and it is not the matchup game itself). Eligibility is decided from
 * the schedule + results, never from which cache rows happen to exist, so a
 * cache that already contains the matchup game or later games cannot leak.
 *
 * AVAILABILITY: each fact block (`points`, `efficiency`, `yardage`,
 * `turnovers`) is `null` unless EVERY game in that scope has the rows the
 * block needs. A partial sample is never presented as the full sample, and a
 * missing value is never replaced with zero. `games: 0` (e.g. Week 1) yields
 * all-null blocks.
 *
 * DEFINITIONS (identical for season, window and single-game scopes; every
 * scope is built by summing per-game numerators/denominators once, then
 * dividing once -- per-game rates are never averaged):
 *
 *  - Efficiency (source: performance_team_game cache, UNFILTERED "all_*"
 *    columns; nflfastR play-by-play): eligible plays are (pass==1 OR rush==1)
 *    with epa present, excluding two-point attempts. Sacks and QB scrambles
 *    count as PASS; accepted-penalty plays that carry a pass/rush indicator are
 *    included. `epaPerPlay` = sum(epa) / eligible plays. `epaPerPass` =
 *    pass epa / dropbacks (pass plays incl. sacks). `epaPerRush` = rush epa /
 *    rush attempts. Success rate = success / plays with success defined, per
 *    unit (overall / pass / rush). Garbage-time-filtered columns are NOT used.
 *    Explosive plays: pass gains >= 15 yards, rush gains >= 10 yards
 *    (scripts/lib/nfl-performance-metrics-core.mjs). `sacks` on the offense
 *    side = sacks taken; on the defense side = sacks made.
 *  - Yards per play (source: stats_team_week, nflverse official team stats):
 *    (passing_yards + rushing_yards) / (attempts + carries + sacks_suffered).
 *    GROSS yards (sack yards are NOT subtracted), counting each sack as a
 *    play. Kneels/spikes follow the official team-stats treatment. The
 *    denominator differs slightly from the EPA play count (official stats
 *    exclude penalty-nullified plays that the PBP EPA set includes), so
 *    `yardage.*.plays` is reported separately from `efficiency.*.epaPlays`.
 *    This is the same convention as public/data/nfl/matchup-metrics.json
 *    `off.yardsPerPlay`.
 *  - Turnovers committed (source: stats_team_week): OFFENSIVE giveaways =
 *    passing_interceptions + sack_fumbles_lost + rushing_fumbles_lost +
 *    receiving_fumbles_lost. All interceptions thrown count (including
 *    pick-sixes); only fumbles LOST count (recovered own fumbles do not).
 *    Turnovers on downs, and defensive / special-teams plays, are excluded.
 *    Takeaways = the opponent's turnovers committed in the same game (exact
 *    game-id join, never inferred). Margin = takeaways - committed.
 *  - Points and W/L/T (source: results.json): final scores only.
 */

export const TEAM_FORM_FACTS_SCHEMA_VERSION = "nfl-team-form-facts-v1" as const;

/** Size of the rolling "recent" window. The ACTUAL sample is `recentWindow.games` -- it can be smaller early in the season. */
export const RECENT_WINDOW_GAMES = 3;

/* -------------------------------------------------------------------------- */
/* Inputs (already parsed and team-code-normalised by the loader)             */
/* -------------------------------------------------------------------------- */

export interface FormScheduleGame {
  gameId: string;
  season: number;
  week: number;
  seasonType: string;
  kickoffUtc: string;
  homeAbbr: string;
  awayAbbr: string;
  neutralSite: boolean | null;
}

export interface FormGameResult {
  gameId: string;
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number | null;
  awayScore: number | null;
  final: boolean;
}

/** One side's unfiltered PBP sums for one game (performance_team_game `all_*` columns). */
export interface FormPlaySums {
  offEpa: number;
  offPlays: number;
  successNum: number;
  successDen: number;
  passEpa: number;
  passPlays: number;
  passSuccessNum: number;
  passSuccessDen: number;
  rushEpa: number;
  rushPlays: number;
  rushSuccessNum: number;
  rushSuccessDen: number;
  explosivePass: number;
  explosiveRush: number;
  sacks: number;
}

export interface FormPerformanceRow {
  gameId: string;
  team: string;
  all: FormPlaySums;
}

/** One team's official box-score-level totals for one game (stats_team_week). */
export interface FormTeamWeekRow {
  gameId: string;
  team: string;
  attempts: number;
  carries: number;
  sacksSuffered: number;
  passingYards: number;
  rushingYards: number;
  passingInterceptions: number;
  sackFumblesLost: number;
  rushingFumblesLost: number;
  receivingFumblesLost: number;
}

/* -------------------------------------------------------------------------- */
/* Output                                                                     */
/* -------------------------------------------------------------------------- */

export interface FormPointsFacts {
  scored: number;
  allowed: number;
  scoredPerGame: number;
  allowedPerGame: number;
}

export interface FormUnitEfficiency {
  epaPlays: number;
  epaPerPlay: number | null;
  dropbacks: number;
  epaPerPass: number | null;
  rushes: number;
  epaPerRush: number | null;
  successRate: number | null;
  passSuccessRate: number | null;
  rushSuccessRate: number | null;
  explosivePasses: number;
  explosiveRushes: number;
  /** explosive passes / dropbacks. */
  explosivePassRate: number | null;
  /** explosive rushes / rush attempts. */
  explosiveRushRate: number | null;
  /** Offense: sacks taken. Defense: sacks made. */
  sacks: number;
}

export interface FormEfficiencyFacts {
  /** What the team produced. */
  offense: FormUnitEfficiency;
  /** What the team allowed (the opponents' offense in the same games). */
  defense: FormUnitEfficiency;
}

export interface FormUnitYardage {
  grossYards: number;
  passYards: number;
  rushYards: number;
  plays: number;
  yardsPerPlay: number | null;
}

export interface FormYardageFacts {
  offense: FormUnitYardage;
  /** Yardage allowed (the opponents' offense in the same games). */
  defense: FormUnitYardage;
}

export interface FormTurnoverFacts {
  committed: number;
  takeaways: number;
  margin: number;
  committedPerGame: number;
  takeawaysPerGame: number;
}

/** The facts for one scope (season to date, a single game, or the rolling window). Blocks are null when any game in scope lacks the source rows. */
export interface FormScopeFacts {
  games: number;
  gameIds: string[];
  wins: number;
  losses: number;
  ties: number;
  /** "W-L" or "W-L-T". */
  record: string;
  points: FormPointsFacts | null;
  efficiency: FormEfficiencyFacts | null;
  yardage: FormYardageFacts | null;
  turnovers: FormTurnoverFacts | null;
}

export interface FormRecentGame {
  gameId: string;
  week: number;
  kickoffUtc: string;
  opponent: string;
  homeAway: "home" | "away";
  neutralSite: boolean | null;
  /** Named `outcome`, not `result`: the Game Context Packet's pregame-safety scan rejects any key named `result` (a postgame-field guard), and this is a PRIOR game's outcome. */
  outcome: "W" | "L" | "T";
  pointsScored: number;
  pointsAllowed: number;
  /** Single-game scope; `facts.games` is always 1. */
  facts: FormScopeFacts;
}

export interface FormRecentWindow {
  requestedGames: number;
  /** ACTUAL number of completed games in the sample (<= requestedGames). */
  games: number;
  facts: FormScopeFacts;
}

export interface TeamFormFacts {
  schemaVersion: typeof TEAM_FORM_FACTS_SCHEMA_VERSION;
  team: string;
  season: number;
  /** Week of the matchup these facts are "as of". */
  asOfWeek: number;
  asOfKickoffUtc: string;
  matchupGameId: string;
  seasonToDate: FormScopeFacts;
  recentGame: FormRecentGame | null;
  recentWindow: FormRecentWindow;
  /** Games scheduled before the matchup kickoff that have no final result -- if non-empty, the results feed is behind and the facts above may be incomplete. */
  incompletePriorGameIds: string[];
}

export interface BuildTeamFormFactsInput {
  team: string;
  matchup: { gameId: string; season: number; week: number; kickoffUtc: string };
  games: readonly FormScheduleGame[];
  results: readonly FormGameResult[];
  performance: readonly FormPerformanceRow[];
  teamWeek: readonly FormTeamWeekRow[];
}

/* -------------------------------------------------------------------------- */
/* Builder                                                                    */
/* -------------------------------------------------------------------------- */

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function rowKey(gameId: string, team: string): string {
  return `${gameId}|${team}`;
}

interface CompletedGame {
  game: FormScheduleGame;
  team: string;
  opponent: string;
  homeAway: "home" | "away";
  scored: number;
  allowed: number;
}

interface RowIndexes {
  performance: Map<string, FormPerformanceRow>;
  teamWeek: Map<string, FormTeamWeekRow>;
}

function sumPerformance(rows: readonly FormPerformanceRow[]): FormUnitEfficiency {
  const t = { epa: 0, plays: 0, sN: 0, sD: 0, pEpa: 0, pPlays: 0, pSN: 0, pSD: 0, rEpa: 0, rPlays: 0, rSN: 0, rSD: 0, xp: 0, xr: 0, sacks: 0 };
  for (const { all } of rows) {
    t.epa += all.offEpa;
    t.plays += all.offPlays;
    t.sN += all.successNum;
    t.sD += all.successDen;
    t.pEpa += all.passEpa;
    t.pPlays += all.passPlays;
    t.pSN += all.passSuccessNum;
    t.pSD += all.passSuccessDen;
    t.rEpa += all.rushEpa;
    t.rPlays += all.rushPlays;
    t.rSN += all.rushSuccessNum;
    t.rSD += all.rushSuccessDen;
    t.xp += all.explosivePass;
    t.xr += all.explosiveRush;
    t.sacks += all.sacks;
  }
  return {
    epaPlays: t.plays,
    epaPerPlay: ratio(t.epa, t.plays),
    dropbacks: t.pPlays,
    epaPerPass: ratio(t.pEpa, t.pPlays),
    rushes: t.rPlays,
    epaPerRush: ratio(t.rEpa, t.rPlays),
    successRate: ratio(t.sN, t.sD),
    passSuccessRate: ratio(t.pSN, t.pSD),
    rushSuccessRate: ratio(t.rSN, t.rSD),
    explosivePasses: t.xp,
    explosiveRushes: t.xr,
    explosivePassRate: ratio(t.xp, t.pPlays),
    explosiveRushRate: ratio(t.xr, t.rPlays),
    sacks: t.sacks,
  };
}

function sumYardage(rows: readonly FormTeamWeekRow[]): FormUnitYardage {
  let passYards = 0;
  let rushYards = 0;
  let plays = 0;
  for (const r of rows) {
    passYards += r.passingYards;
    rushYards += r.rushingYards;
    plays += r.attempts + r.carries + r.sacksSuffered;
  }
  return { grossYards: passYards + rushYards, passYards, rushYards, plays, yardsPerPlay: ratio(passYards + rushYards, plays) };
}

function turnoversCommitted(row: FormTeamWeekRow): number {
  return row.passingInterceptions + row.sackFumblesLost + row.rushingFumblesLost + row.receivingFumblesLost;
}

function collect<T>(games: readonly CompletedGame[], pick: (g: CompletedGame) => T | undefined): T[] | null {
  const out: T[] = [];
  for (const g of games) {
    const value = pick(g);
    if (value === undefined) return null;
    out.push(value);
  }
  return out;
}

function buildScope(games: readonly CompletedGame[], indexes: RowIndexes): FormScopeFacts {
  const count = games.length;
  const wins = games.filter((g) => g.scored > g.allowed).length;
  const losses = games.filter((g) => g.scored < g.allowed).length;
  const ties = count - wins - losses;
  const record = ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;

  const base = { games: count, gameIds: games.map((g) => g.game.gameId), wins, losses, ties, record };
  if (count === 0) return { ...base, points: null, efficiency: null, yardage: null, turnovers: null };

  const scored = games.reduce((sum, g) => sum + g.scored, 0);
  const allowed = games.reduce((sum, g) => sum + g.allowed, 0);
  const points: FormPointsFacts = { scored, allowed, scoredPerGame: scored / count, allowedPerGame: allowed / count };

  const ownPerf = collect(games, (g) => indexes.performance.get(rowKey(g.game.gameId, g.team)));
  const oppPerf = collect(games, (g) => indexes.performance.get(rowKey(g.game.gameId, g.opponent)));
  const efficiency: FormEfficiencyFacts | null = ownPerf && oppPerf ? { offense: sumPerformance(ownPerf), defense: sumPerformance(oppPerf) } : null;

  const ownWeek = collect(games, (g) => indexes.teamWeek.get(rowKey(g.game.gameId, g.team)));
  const oppWeek = collect(games, (g) => indexes.teamWeek.get(rowKey(g.game.gameId, g.opponent)));
  const yardage: FormYardageFacts | null = ownWeek && oppWeek ? { offense: sumYardage(ownWeek), defense: sumYardage(oppWeek) } : null;

  let turnovers: FormTurnoverFacts | null = null;
  if (ownWeek && oppWeek) {
    const committed = ownWeek.reduce((sum, r) => sum + turnoversCommitted(r), 0);
    const takeaways = oppWeek.reduce((sum, r) => sum + turnoversCommitted(r), 0);
    turnovers = { committed, takeaways, margin: takeaways - committed, committedPerGame: committed / count, takeawaysPerGame: takeaways / count };
  }

  return { ...base, points, efficiency, yardage, turnovers };
}

function toCompletedGame(game: FormScheduleGame, team: string, result: FormGameResult): CompletedGame | null {
  if (result.homeScore == null || result.awayScore == null) return null;
  const isHome = game.homeAbbr === team;
  return {
    game,
    team,
    opponent: isHome ? game.awayAbbr : game.homeAbbr,
    homeAway: isHome ? "home" : "away",
    scored: isHome ? result.homeScore : result.awayScore,
    allowed: isHome ? result.awayScore : result.homeScore,
  };
}

function compareChronologically(a: FormScheduleGame, b: FormScheduleGame): number {
  return Date.parse(a.kickoffUtc) - Date.parse(b.kickoffUtc) || a.week - b.week || a.gameId.localeCompare(b.gameId);
}

export function buildTeamFormFacts(input: BuildTeamFormFactsInput): TeamFormFacts {
  const { team, matchup } = input;
  const matchupKickoffMs = Date.parse(matchup.kickoffUtc);
  const resultsByGame = new Map(input.results.map((r) => [r.gameId, r] as const));
  const indexes: RowIndexes = {
    performance: new Map(input.performance.map((r) => [rowKey(r.gameId, r.team), r] as const)),
    teamWeek: new Map(input.teamWeek.map((r) => [rowKey(r.gameId, r.team), r] as const)),
  };

  const priorGames = input.games
    .filter(
      (g) =>
        g.season === matchup.season &&
        g.seasonType === "REG" &&
        g.gameId !== matchup.gameId &&
        (g.homeAbbr === team || g.awayAbbr === team) &&
        Date.parse(g.kickoffUtc) < matchupKickoffMs
    )
    .sort(compareChronologically);

  const completed: CompletedGame[] = [];
  const incompletePriorGameIds: string[] = [];
  for (const game of priorGames) {
    const result = resultsByGame.get(game.gameId);
    const entry = result && result.final ? toCompletedGame(game, team, result) : null;
    if (entry) completed.push(entry);
    else incompletePriorGameIds.push(game.gameId);
  }

  const last = completed[completed.length - 1] ?? null;
  const recentGame: FormRecentGame | null = last
    ? {
        gameId: last.game.gameId,
        week: last.game.week,
        kickoffUtc: last.game.kickoffUtc,
        opponent: last.opponent,
        homeAway: last.homeAway,
        neutralSite: last.game.neutralSite,
        outcome: last.scored > last.allowed ? "W" : last.scored < last.allowed ? "L" : "T",
        pointsScored: last.scored,
        pointsAllowed: last.allowed,
        facts: buildScope([last], indexes),
      }
    : null;

  const windowGames = completed.slice(-RECENT_WINDOW_GAMES);

  return {
    schemaVersion: TEAM_FORM_FACTS_SCHEMA_VERSION,
    team,
    season: matchup.season,
    asOfWeek: matchup.week,
    asOfKickoffUtc: matchup.kickoffUtc,
    matchupGameId: matchup.gameId,
    seasonToDate: buildScope(completed, indexes),
    recentGame,
    recentWindow: { requestedGames: RECENT_WINDOW_GAMES, games: windowGames.length, facts: buildScope(windowGames, indexes) },
    incompletePriorGameIds,
  };
}
