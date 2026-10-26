/**
 * Walk-forward predictions for the V1 board's projection (baseline v0) and the naive comparison baselines.
 *
 * Every prediction for a game is built from games dated strictly before it: the features come from
 * `computePregameFeatures` (the single leakage gate the board itself uses) and the league per-minute rates are an
 * expanding window over games before the target date, so a game never sees its own day or anything later. Model
 * parameters are the frozen public v0 defaults; nothing is tuned here.
 *
 * Scope: a projection is conditional on appearing (the import has no did-not-play rows), exactly as on the board.
 * A target with no earlier game has no basis for a projection, so it is counted and left out, as the board does.
 *
 * Private research only. The input is hoopR/ESPN-derived; nothing in this folder writes anywhere but data/nba/.
 */
import { buildTeamGameDates, computePregameFeatures, type PregameFeatures } from "../../features";
import { BASELINE_V0_PUBLIC_PARAMS, projectBaseline, projectNaive, type BaselineParams, type BaselinePriors, type StatProjection } from "../../projection";
import { NBA_COMPETITIVE_SEASON_TYPES } from "../../seasonType";
import type { ImportedPlayerGame } from "../playerGameImport";
import { toPlayerGames } from "../slateBuild";

export const METHODS = ["v0", "naive_l5", "naive_l10", "naive_season_to_date"] as const;
export type Method = (typeof METHODS)[number];
export const STATS = ["pts", "reb", "ast"] as const;
export type Stat = (typeof STATS)[number];

const DAY_MS = 86_400_000;

/** A player-game row of any season: the imported shape with the season widened, so research can add prior seasons. */
export type WalkRow = Omit<ImportedPlayerGame, "season"> & { season: string };

/** Pregame projector under test: a pure function of the features and the league rates, so it cannot see the outcome. */
export type Projector = (features: PregameFeatures, priors: BaselinePriors) => StatProjection;

export interface Actual {
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
}

/** One scored player-game. Predictions carry no outcome; `actual` is joined here only for scoring. */
export interface BacktestRow {
  season: string;
  gameDate: string;
  gameId: string;
  playerId: string;
  team: string;
  isHome: boolean;
  priorGames: number;
  /** Games already played this season and, separately, games in the previous regular season, before this one. */
  seasonPriorGames: number;
  previousSeasonGames: number;
  historyTier: "none" | "thin" | "partial" | "full";
  flags: { teamChangedRecently: boolean; returningFromAbsence: boolean; roleChange: boolean };
  /** Days since the player's own team last played, from earlier game dates only. Null at the team's first game. */
  teamRestDays: number | null;
  /** Ex-post: the game's final margin from the player rows. A diagnostic only, never a feature. */
  marginAbs: number | null;
  /** Pregame: the gap between the two teams' average margins in earlier games, a proxy for how lopsided the game may be. */
  expectedAbsMargin: number | null;
  /** Pregame: the opponent's average points allowed in earlier games minus the league's. Positive means a weaker defense. */
  opponentDefense: number | null;
  predictions: Record<Method, StatProjection>;
  /** Extra projectors' predictions by id (empty unless the caller passed projectors). */
  candidates: Record<string, StatProjection>;
  actual: Actual;
}

export interface WalkForwardResult {
  rows: BacktestRow[];
  /** Regular-season target player-games considered. */
  targets: number;
  /** Targets with no earlier game for the player, left out. */
  withoutHistory: number;
  /** Targets left out because no earlier minutes exist to estimate league rates from. */
  withoutPriors: number;
}

/** Expanding league per-minute rates: for each date, the rates over every competitive game dated strictly before it. */
export function expandingLeagueRates(rows: readonly WalkRow[]): (date: string) => BaselinePriors | null {
  const byDate = new Map<string, { minutes: number; pts: number; reb: number; ast: number }>();
  for (const r of rows) {
    if (!NBA_COMPETITIVE_SEASON_TYPES.includes(r.seasonType)) continue;
    const day = byDate.get(r.gameDate) ?? { minutes: 0, pts: 0, reb: 0, ast: 0 };
    day.minutes += r.minutes;
    day.pts += r.pts;
    day.reb += r.reb;
    day.ast += r.ast;
    byDate.set(r.gameDate, day);
  }
  const dates = [...byDate.keys()].sort();
  const cumulative: Array<{ before: string; minutes: number; pts: number; reb: number; ast: number }> = [];
  let sum = { minutes: 0, pts: 0, reb: 0, ast: 0 };
  for (const date of dates) {
    cumulative.push({ before: date, ...sum });
    const day = byDate.get(date)!;
    sum = { minutes: sum.minutes + day.minutes, pts: sum.pts + day.pts, reb: sum.reb + day.reb, ast: sum.ast + day.ast };
  }
  const lookup = new Map(cumulative.map((c) => [c.before, c]));
  return (date) => {
    const c = lookup.get(date);
    if (!c || c.minutes <= 0) return null;
    return { leagueRate: { pts: c.pts / c.minutes, reb: c.reb / c.minutes, ast: c.ast / c.minutes } };
  };
}

/** Final margin per game, from the sum of each team's player points. Ex-post: used only to describe blowouts. */
function marginsByGame(rows: readonly WalkRow[]): Map<string, number> {
  const points = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const teams = points.get(r.gameId) ?? new Map<string, number>();
    teams.set(r.team, (teams.get(r.team) ?? 0) + r.pts);
    points.set(r.gameId, teams);
  }
  const margins = new Map<string, number>();
  for (const [gameId, teams] of points) {
    const totals = [...teams.values()];
    if (totals.length === 2) margins.set(gameId, Math.abs(totals[0] - totals[1]));
  }
  return margins;
}

/** A team's results in earlier games only: games played, average margin, average points allowed. */
interface TeamForm {
  games: number;
  avgMargin: number;
  avgAllowed: number;
}

/** Fewest earlier games before a team's form is used as context. */
export const MIN_FORM_GAMES = 5;

/**
 * Team results as a function of (team, date) that sees only games dated strictly before the date, plus the league's
 * average points per team-game before the date. A team's score is the sum of its players' points.
 */
function teamFormLookup(rows: readonly WalkRow[]): { form: (team: string, date: string) => TeamForm | null; leagueAverage: (date: string) => number | null } {
  const scores = new Map<string, { date: string; byTeam: Map<string, number> }>();
  for (const r of rows) {
    if (!NBA_COMPETITIVE_SEASON_TYPES.includes(r.seasonType)) continue;
    const game = scores.get(r.gameId) ?? { date: r.gameDate, byTeam: new Map<string, number>() };
    game.byTeam.set(r.team, (game.byTeam.get(r.team) ?? 0) + r.pts);
    scores.set(r.gameId, game);
  }
  const perTeam = new Map<string, Array<{ date: string; margin: number; allowed: number }>>();
  const leagueDays = new Map<string, { points: number; teamGames: number }>();
  for (const game of scores.values()) {
    const entries = [...game.byTeam];
    if (entries.length !== 2) continue;
    for (const [i, [team, scored]] of entries.entries()) {
      const allowed = entries[1 - i][1];
      perTeam.set(team, [...(perTeam.get(team) ?? []), { date: game.date, margin: scored - allowed, allowed }]);
      const day = leagueDays.get(game.date) ?? { points: 0, teamGames: 0 };
      leagueDays.set(game.date, { points: day.points + scored, teamGames: day.teamGames + 1 });
    }
  }
  const prefix = new Map<string, Array<{ date: string; games: number; margin: number; allowed: number }>>();
  for (const [team, list] of perTeam) {
    let games = 0;
    let margin = 0;
    let allowed = 0;
    prefix.set(team, list.sort((a, b) => a.date.localeCompare(b.date)).map((g) => ({ date: g.date, games: (games += 1), margin: (margin += g.margin), allowed: (allowed += g.allowed) })));
  }
  const leaguePrefix = [...leagueDays].sort(([a], [b]) => a.localeCompare(b)).reduce<Array<{ date: string; points: number; teamGames: number }>>((acc, [date, day]) => {
    const last = acc.at(-1);
    return [...acc, { date, points: (last?.points ?? 0) + day.points, teamGames: (last?.teamGames ?? 0) + day.teamGames }];
  }, []);
  /** The last cumulative entry dated strictly before `date`. */
  const before = <T extends { date: string }>(list: readonly T[] | undefined, date: string): T | null => {
    let found: T | null = null;
    for (const item of list ?? []) {
      if (item.date >= date) break;
      found = item;
    }
    return found;
  };
  return {
    form: (team, date) => {
      const last = before(prefix.get(team), date);
      return last ? { games: last.games, avgMargin: last.margin / last.games, avgAllowed: last.allowed / last.games } : null;
    },
    leagueAverage: (date) => {
      const last = before(leaguePrefix, date);
      return last && last.teamGames > 0 ? last.points / last.teamGames : null;
    },
  };
}

/** Whole days between the team's previous competitive game date and this one, from dates strictly before it. */
function restDays(dates: readonly string[] | undefined, date: string): number | null {
  const previous = (dates ?? []).filter((d) => d < date).at(-1);
  return previous === undefined ? null : Math.round((Date.parse(date) - Date.parse(previous)) / DAY_MS);
}

export interface WalkForwardOptions {
  /** Which rows are scored. Features and priors still use every earlier game, including other seasons. */
  targetSeasons: readonly string[];
  /** v0 parameters. The frozen public defaults unless a sensitivity run says otherwise. */
  params?: BaselineParams;
  /** Further projectors to score on the same targets, by id. */
  projectors?: Readonly<Record<string, Projector>>;
}

export function walkForward(imported: readonly WalkRow[], options: WalkForwardOptions): WalkForwardResult {
  const playerNumbers = new Map([...new Set(imported.map((r) => r.playerId))].sort().map((id, i) => [id, i + 1]));
  const games = toPlayerGames(imported, playerNumbers);
  const histories = new Map<string, typeof games>();
  imported.forEach((r, i) => histories.set(r.playerId, [...(histories.get(r.playerId) ?? []), games[i]]));
  const teamGameDates = buildTeamGameDates(games);
  const teamDatesByCode = new Map(imported.map((r, i) => [r.team, teamGameDates.get(games[i].teamId)]));
  const priorsFor = expandingLeagueRates(imported);
  const margins = marginsByGame(imported);
  const forms = teamFormLookup(imported);
  const params = options.params ?? BASELINE_V0_PUBLIC_PARAMS;

  const out: BacktestRow[] = [];
  let targets = 0;
  let withoutHistory = 0;
  let withoutPriors = 0;
  imported.forEach((r, i) => {
    if (r.seasonType !== "regular" || !options.targetSeasons.includes(r.season)) return;
    targets += 1;
    const game = games[i];
    const features = computePregameFeatures(histories.get(r.playerId) ?? [], { gameId: game.gameId, cutoffDate: game.gameDate, season: game.season, teamId: game.teamId }, teamGameDates);
    if (features.priorGames === 0) {
      withoutHistory += 1;
      return;
    }
    const priors = priorsFor(r.gameDate);
    if (priors === null) {
      withoutPriors += 1;
      return;
    }
    const naive = projectNaive(features);
    const own = forms.form(r.team, r.gameDate);
    const opp = forms.form(r.opponent, r.gameDate);
    const league = forms.leagueAverage(r.gameDate);
    const enough = own !== null && opp !== null && own.games >= MIN_FORM_GAMES && opp.games >= MIN_FORM_GAMES;
    out.push({
      season: r.season,
      gameDate: r.gameDate,
      gameId: r.gameId,
      playerId: r.playerId,
      team: r.team,
      isHome: r.isHome,
      priorGames: features.priorGames,
      seasonPriorGames: features.seasonPriorGames,
      previousSeasonGames: features.previousRegularSeason?.games ?? 0,
      historyTier: features.historyTier,
      flags: { teamChangedRecently: features.teamChangedRecently, returningFromAbsence: features.returningFromAbsence, roleChange: features.roleChange },
      teamRestDays: restDays(teamDatesByCode.get(r.team), r.gameDate),
      marginAbs: margins.get(r.gameId) ?? null,
      expectedAbsMargin: enough ? Math.abs(own.avgMargin - opp.avgMargin) : null,
      opponentDefense: opp !== null && opp.games >= MIN_FORM_GAMES && league !== null ? opp.avgAllowed - league : null,
      predictions: { v0: projectBaseline(features, priors, params), naive_l5: naive.naive_l5, naive_l10: naive.naive_l10, naive_season_to_date: naive.naive_season_to_date },
      candidates: Object.fromEntries(Object.entries(options.projectors ?? {}).map(([id, project]) => [id, project(features, priors)])),
      actual: { minutes: r.minutes, pts: r.pts, reb: r.reb, ast: r.ast },
    });
  });
  return { rows: out, targets, withoutHistory, withoutPriors };
}
