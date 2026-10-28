/**
 * Props board V1 inputs: baseline projections, the roster and approximate DvP lines, from a player-game import,
 * season position estimates and a slate. Nothing here fetches data or decides rights: the three outputs go to the
 * existing board builder, whose gates (source rights, freshness, synthetic, past tipoff) are unchanged.
 *
 * Projection = the unchanged baseline v0 (projection.ts): expected minutes from recent minutes, season-to-date and
 * the previous regular season, times a shrunken per-minute rate for PTS, REB and AST. Early in 2026-27 the
 * 2025-26 baseline carries the estimate through that model's own priors. It conditions on the player appearing:
 * there is no pregame availability feed, so a scratch is not modelled.
 *
 * Approximate DvP = the existing DvP builder fed one primary position per player-season (weight 1). It is an
 * estimated primary-position view, not minutes-at-position, and it is display-only: nothing here adjusts a projection.
 * A missing DvP input never blocks a projection.
 */
import { z } from "zod";
import { canonicalGameKey, CANONICAL_TEAM_CODES, etGameDate } from "../canonical";
import type { DvpPlayerGameLine } from "../dvp";
import { buildTeamGameDates, computePregameFeatures } from "../features";
import { normalizePlayerName } from "../pipeline/contracts";
import type { DvpInput, ProjectionRecord, RosterRecord } from "../pipeline/boardBuild";
import { BASELINE_MODEL_VERSION, BASELINE_V0_PUBLIC_PARAMS, projectBaseline, type BaselineParams, type BaselinePriors } from "../projection";
import type { NbaPlayerGame } from "../types";
import type { ImportedPlayerGame, PlayerGameImport } from "./playerGameImport";
import type { DvpPosition } from "../dvpPositions";
import { dvpLabelFor, type PositionEstimateSet } from "./positionEstimates";
import type { SeasonStatsView } from "../seasonStats";
import type { OpponentBoxScores, OpponentRecentSequence } from "../recentForm";
import { buildGameScores, type GameScores } from "./gameResults";
import { buildOpponentBoxScores, buildOpponentRecent } from "./opponentRecentBuild";
import { seasonStatsFor } from "./seasonStatsBuild";

export const SLATE_SEASON = "2026-27";
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const GAME_KEY = /^(\d{4}-\d{2}-\d{2})\|([A-Z]{3})@([A-Z]{3})$/;
const MAX_MISSING_LISTED = 25;

export const slateSchema = z.object({
  season: z.literal(SLATE_SEASON),
  games: z.array(z.object({ gameKey: z.string(), tipoffUtc: z.string().regex(ISO_UTC) })).min(1),
});
export interface SlateGame {
  gameKey: string;
  tipoffUtc: string;
  away: string;
  home: string;
  /** Eastern calendar date: the pregame cutoff (no history on or after it is used). */
  date: string;
}

/** Validates a slate: canonical game keys whose date matches the tipoff in Eastern time. Throws on the first bad game. */
export function parseSlate(raw: unknown): SlateGame[] {
  const parsed = slateSchema.parse(raw);
  const seen = new Set<string>();
  const teamDays = new Set<string>();
  return parsed.games.map(({ gameKey, tipoffUtc }) => {
    const m = GAME_KEY.exec(gameKey);
    if (!m) throw new Error(`slate game "${gameKey}" is not a canonical game key (YYYY-MM-DD|AWY@HOM)`);
    const [, date, away, home] = m;
    if (canonicalGameKey({ gameDate: date, homeCode: home, awayCode: away }) !== gameKey || away === home) throw new Error(`slate game "${gameKey}" has an unknown or repeated team`);
    if (etGameDate(tipoffUtc) !== date) throw new Error(`slate game "${gameKey}": tipoff ${tipoffUtc} is not on ${date} Eastern`);
    if (seen.has(gameKey)) throw new Error(`slate lists ${gameKey} twice`);
    seen.add(gameKey);
    for (const team of [away, home]) {
      if (teamDays.has(`${date}|${team}`)) throw new Error(`slate has ${team} in two games on ${date}`);
      teamDays.add(`${date}|${team}`);
    }
    return { gameKey, tipoffUtc, away, home, date };
  });
}

export interface V1Report {
  source: { sourceId: string; retrievedAtUtc: string; provenance: string; rows: number; rowsBySeason: Record<string, number>; players: number };
  slate: { games: number; teams: number };
  positions: { method: "estimated-primary-position"; estimates: Record<string, number>; overridden: number; asOfUtc: Record<string, string> };
  projections: { playersConsidered: number; playersProjected: number; /** Projected players with no position estimate: shown without DvP context. */ projectedWithoutPosition: number; propsProduced: number; skipped: Array<{ player: string; team: string; reason: string }>; byHistoryTier: Record<string, number> };
  dvp: {
    method: "estimated-primary-position";
    regularSeasonLines: Record<string, number>;
    excludedNonRegularSeason: number;
    linesWithPosition: Record<string, number>;
    linesWithoutPosition: Record<string, number>;
    /** Share of player minutes attributed to an estimated position, per season (0-1). */
    minutesCoverage: Record<string, number | null>;
    playersWithoutPosition: Record<string, string[]>;
    /** "season|opponent" groups with no attributed minutes at all; left out of DvP rather than shown as zeros. */
    teamSeasonsWithoutAnyPosition: string[];
  };
  warnings: string[];
}

export interface V1Inputs {
  projections: ProjectionRecord[];
  /**
   * Season-to-date production by `gameKey|normalized player name`, for the private preview only. Deliberately not part of a
   * ProjectionRecord: the public board builder never receives it.
   */
  seasonStats: Record<string, SeasonStatsView>;
  /** What each opponent allowed to each estimated position over its last ten games, by `gameKey|team|position`; private preview only. */
  opponentRecent: Record<string, OpponentRecentSequence>;
  /** The individual opposing players behind those games, by `gameKey|team`; private preview only. */
  opponentBoxScores: OpponentBoxScores;
  roster: Record<string, RosterRecord>;
  dvp: DvpInput | null;
  report: V1Report;
}

const bump = (counts: Record<string, number>, key: string, by = 1): void => {
  counts[key] = (counts[key] ?? 0) + by;
};

/** Surrogate numeric ids for the feature code, which keys on numbers; the external ids stay strings. */
export const teamNumber = (code: string): number => CANONICAL_TEAM_CODES.indexOf(code as (typeof CANONICAL_TEAM_CODES)[number]) + 1;

export function toPlayerGames(rows: readonly (Omit<ImportedPlayerGame, "season"> & { season: string })[], playerNumbers: ReadonlyMap<string, number>): NbaPlayerGame[] {
  return rows.map((r) => ({
    schemaVersion: "nba-player-game-v1" as const,
    playerId: playerNumbers.get(r.playerId) ?? 0,
    playerName: r.playerName,
    minutes: r.minutes,
    gameId: r.gameId,
    gameDate: r.gameDate,
    season: r.season,
    seasonType: r.seasonType,
    teamId: teamNumber(r.team),
    teamAbbr: r.team,
    opponentTeamId: teamNumber(r.opponent),
    opponentAbbr: r.opponent,
    isHome: r.isHome,
    sourceSnapshotId: "manual-import",
    pts: r.pts,
    reb: r.reb,
    ast: r.ast,
    oreb: 0, dreb: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, stl: 0, blk: 0, tov: 0, pf: 0,
    plusMinus: null,
  }));
}

/** League per-minute rates from every competitive imported game before the first slate date. Null when there are no minutes. */
export function leagueRates(rows: readonly ImportedPlayerGame[], beforeDate: string): BaselinePriors | null {
  const used = rows.filter((r) => r.seasonType !== "preseason" && r.gameDate < beforeDate);
  const minutes = used.reduce((s, r) => s + r.minutes, 0);
  if (minutes <= 0) return null;
  const rate = (pick: (r: ImportedPlayerGame) => number) => used.reduce((s, r) => s + pick(r), 0) / minutes;
  return { leagueRate: { pts: rate((r) => r.pts), reb: rate((r) => r.reb), ast: rate((r) => r.ast) } };
}

/** A player who may be projected on the slate. `position` is null when no estimate exists: the projection still shows, with no DvP context. */
interface SlatePlayer {
  playerId: string;
  name: string;
  team: string;
  position: DvpPosition | null;
}

/**
 * Everyone who can be projected: players with a 2026-27 position estimate (role "out" excluded) plus every other player
 * who has played this season, on the team of their latest game, with no position. A player without an estimate is
 * never dropped from the board, only left without a position.
 */
function slatePlayersFrom(positions: PositionEstimateSet, rows: readonly ImportedPlayerGame[]): SlatePlayer[] {
  const current = [...positions.values()].filter((e) => e.season === SLATE_SEASON);
  const known = new Set(current.map((e) => e.playerId));
  const players: SlatePlayer[] = current.filter((e) => e.role !== "out").map((e) => ({ playerId: e.playerId, name: e.name, team: e.team, position: e.primary }));
  const latest = new Map<string, ImportedPlayerGame>();
  for (const r of rows) {
    if (r.season !== SLATE_SEASON || r.seasonType === "preseason" || known.has(r.playerId)) continue;
    const seen = latest.get(r.playerId);
    if (!seen || r.gameDate > seen.gameDate || (r.gameDate === seen.gameDate && r.gameId > seen.gameId)) latest.set(r.playerId, r);
  }
  for (const r of latest.values()) players.push({ playerId: r.playerId, name: r.playerName, team: r.team, position: null });
  return players;
}

function buildRoster(players: readonly SlatePlayer[], warnings: string[]): Record<string, RosterRecord> {
  const byName = new Map<string, SlatePlayer[]>();
  for (const p of players) byName.set(normalizePlayerName(p.name), [...(byName.get(normalizePlayerName(p.name)) ?? []), p]);
  const entries: Array<[string, RosterRecord]> = [];
  for (const [name, list] of byName) {
    if (list.length > 1) warnings.push(`two 2026-27 players share the name "${name}"; left off the roster, so their prop lines cannot be matched by name`);
    else entries.push([name, { team: list[0].team, position: list[0].position }]);
  }
  // fromEntries defines own properties, so a player named "__proto__" is kept as data and never touches the prototype.
  return Object.fromEntries(entries);
}

function projectGame(
  game: SlateGame,
  slatePlayers: readonly SlatePlayer[],
  histories: ReadonlyMap<string, NbaPlayerGame[]>,
  teamGameDates: ReturnType<typeof buildTeamGameDates>,
  ctx: { priors: BaselinePriors; params: BaselineParams; source: PlayerGameImport; scores: GameScores },
  out: { projections: ProjectionRecord[]; seasonStats: Record<string, SeasonStatsView>; report: V1Report["projections"] },
): void {
  const inGame = slatePlayers.filter((p) => p.team === game.away || p.team === game.home);
  const nameCounts = new Map<string, number>();
  for (const p of inGame) nameCounts.set(normalizePlayerName(p.name), (nameCounts.get(normalizePlayerName(p.name)) ?? 0) + 1);
  for (const player of inGame) {
    out.report.playersConsidered += 1;
    if ((nameCounts.get(normalizePlayerName(player.name)) ?? 0) > 1) {
      // The board keys a prop by game, name and market, so one of two same-name players would silently replace the other.
      out.report.skipped.push({ player: player.name, team: player.team, reason: "shares a name with another player in this game, so a prop could not be matched to the right one" });
      continue;
    }
    const history = histories.get(player.playerId) ?? [];
    const features = computePregameFeatures(history, { gameId: game.gameKey, cutoffDate: game.date, season: SLATE_SEASON, teamId: teamNumber(player.team) }, teamGameDates);
    if (features.priorGames === 0) {
      out.report.skipped.push({ player: player.name, team: player.team, reason: "no game history in the import, so no minutes or rate to project from" });
      continue;
    }
    const projected = projectBaseline(features, ctx.priors, ctx.params);
    out.seasonStats[`${game.gameKey}|${normalizePlayerName(player.name)}`] = seasonStatsFor(history, { gameId: game.gameKey, cutoffDate: game.date, season: SLATE_SEASON }, ctx.scores);
    bump(out.report.byHistoryTier, features.historyTier);
    out.report.playersProjected += 1;
    if (player.position === null) out.report.projectedWithoutPosition += 1;
    for (const market of ["pts", "reb", "ast"] as const) {
      const value = projected[market];
      if (value === null || !Number.isFinite(value)) continue;
      out.projections.push({
        gameKey: game.gameKey,
        tipoffUtc: game.tipoffUtc,
        playerName: player.name,
        team: player.team,
        market,
        value,
        minutes: projected.minutes,
        modelVersion: BASELINE_MODEL_VERSION,
        inputCutoffUtc: ctx.source.retrievedAtUtc,
        inputSourceIds: [ctx.source.sourceId],
      });
      out.report.propsProduced += 1;
    }
  }
}

function buildDvpLines(imported: PlayerGameImport, positions: PositionEstimateSet, report: V1Report["dvp"]): DvpPlayerGameLine[] {
  const lines: DvpPlayerGameLine[] = [];
  const classified: Record<string, number> = {};
  const total: Record<string, number> = {};
  const missing: Record<string, Set<string>> = {};
  for (const r of imported.rows) {
    if (r.seasonType !== "regular") {
      report.excludedNonRegularSeason += 1;
      continue;
    }
    // A season's position applies to that season only: no 2026-27 position is ever used for a 2025-26 game.
    const label = dvpLabelFor(positions, r.season, r.playerId);
    bump(report.regularSeasonLines, r.season);
    bump(total, r.season, r.minutes);
    if (label === null) {
      bump(report.linesWithoutPosition, r.season);
      (missing[r.season] ??= new Set()).add(r.playerId);
    } else {
      bump(report.linesWithPosition, r.season);
      bump(classified, r.season, r.minutes);
    }
    lines.push({ season: r.season, gameId: r.gameId, opponentTeam: r.opponent, playerId: r.playerId, minutes: r.minutes, pts: r.pts, reb: r.reb, ast: r.ast, positionLabel: label, sourceId: imported.sourceId, sourceUpdatedAtUtc: imported.retrievedAtUtc });
  }
  for (const season of Object.keys(total)) report.minutesCoverage[season] = total[season] > 0 ? (classified[season] ?? 0) / total[season] : null;
  for (const [season, ids] of Object.entries(missing)) report.playersWithoutPosition[season] = [...ids].sort().slice(0, MAX_MISSING_LISTED);
  return withoutUnattributedTeamSeasons(lines, report);
}

/**
 * A team-season in which no minutes could be attributed to any position has nothing to average: the DvP builder would
 * still emit rows of zeros and rank them by team code. Those lines are dropped so no rank is invented, and a season
 * missing for any team then has no ranks at all (a rank needs all 30 teams).
 */
function withoutUnattributedTeamSeasons(lines: DvpPlayerGameLine[], report: V1Report["dvp"]): DvpPlayerGameLine[] {
  const attributed = new Set(lines.filter((l) => l.positionLabel !== null).map((l) => `${l.season}|${l.opponentTeam}`));
  const dropped = new Set(lines.filter((l) => !attributed.has(`${l.season}|${l.opponentTeam}`)).map((l) => `${l.season}|${l.opponentTeam}`));
  report.teamSeasonsWithoutAnyPosition = [...dropped].sort();
  return dropped.size === 0 ? lines : lines.filter((l) => !dropped.has(`${l.season}|${l.opponentTeam}`));
}

export interface V1BuildArgs {
  generatedAtUtc: string;
  imported: PlayerGameImport;
  positions: PositionEstimateSet;
  slate: readonly SlateGame[];
  params?: BaselineParams;
}

export function buildV1Inputs(args: V1BuildArgs): V1Inputs {
  const { imported, positions, slate } = args;
  const warnings: string[] = [];
  const retrievedMs = Date.parse(imported.retrievedAtUtc);
  const generatedMs = Date.parse(args.generatedAtUtc);
  if (!Number.isFinite(retrievedMs) || !Number.isFinite(generatedMs)) throw new Error("the import retrieval time and the build time must be real instants");
  if (retrievedMs > generatedMs) throw new Error("the import was retrieved after the build time");
  const rowsBySeason: Record<string, number> = {};
  for (const r of imported.rows) bump(rowsBySeason, r.season);
  const playerIds = [...new Set(imported.rows.map((r) => r.playerId))].sort();
  const playerNumbers = new Map(playerIds.map((id, i) => [id, i + 1]));
  const playerGames = toPlayerGames(imported.rows, playerNumbers);
  const histories = new Map<string, NbaPlayerGame[]>();
  imported.rows.forEach((r, i) => histories.set(r.playerId, [...(histories.get(r.playerId) ?? []), playerGames[i]]));
  const teamGameDates = buildTeamGameDates(playerGames);

  const estimates: Record<string, number> = {};
  let overridden = 0;
  const asOf: Record<string, string> = {};
  for (const e of positions.values()) {
    bump(estimates, e.season);
    asOf[e.season] = e.asOfUtc;
    if (e.overridden) overridden += 1;
  }
  const report: V1Report = {
    source: { sourceId: imported.sourceId, retrievedAtUtc: imported.retrievedAtUtc, provenance: imported.provenance, rows: imported.rows.length, rowsBySeason, players: playerIds.length },
    slate: { games: slate.length, teams: new Set(slate.flatMap((g) => [g.away, g.home])).size },
    positions: { method: "estimated-primary-position", estimates, overridden, asOfUtc: asOf },
    projections: { playersConsidered: 0, playersProjected: 0, projectedWithoutPosition: 0, propsProduced: 0, skipped: [], byHistoryTier: {} },
    dvp: { method: "estimated-primary-position", regularSeasonLines: {}, excludedNonRegularSeason: 0, linesWithPosition: {}, linesWithoutPosition: {}, minutesCoverage: {}, playersWithoutPosition: {}, teamSeasonsWithoutAnyPosition: [] },
    warnings,
  };

  const firstDate = slate.map((g) => g.date).sort()[0];
  const priors = firstDate ? leagueRates(imported.rows, firstDate) : null;
  const projections: ProjectionRecord[] = [];
  const seasonStats: Record<string, SeasonStatsView> = {};
  const slatePlayers = slatePlayersFrom(positions, imported.rows);
  if (priors === null) warnings.push("no competitive minutes before the first slate game: no projection can be built");
  else {
    const scores = buildGameScores(imported.rows);
    for (const game of slate) projectGame(game, slatePlayers, histories, teamGameDates, { priors, params: args.params ?? BASELINE_V0_PUBLIC_PARAMS, source: imported, scores }, { projections, seasonStats, report: report.projections });
  }
  if (slatePlayers.length === 0) warnings.push("no 2026-27 players: nobody is on the slate");

  const lines = buildDvpLines(imported, positions, report.dvp);
  const dvp: DvpInput | null = lines.length > 0 ? { sourceId: imported.sourceId, lines } : null;
  const unlabeled = Object.values(report.dvp.linesWithoutPosition).reduce((a, b) => a + b, 0);
  if (report.dvp.teamSeasonsWithoutAnyPosition.length > 0) warnings.push(`${report.dvp.teamSeasonsWithoutAnyPosition.length} team-season(s) have no position estimate for any opposing player and are left out of DvP (no ranks are invented): ${report.dvp.teamSeasonsWithoutAnyPosition.slice(0, 6).join(", ")}${report.dvp.teamSeasonsWithoutAnyPosition.length > 6 ? ", ..." : ""}`);
  if (unlabeled > 0) warnings.push(`${unlabeled} regular-season player-games have no position estimate for their season; they are excluded from DvP, not guessed`);
  return { projections, seasonStats, opponentRecent: buildOpponentRecent(imported.rows, positions, slate, SLATE_SEASON), opponentBoxScores: buildOpponentBoxScores(imported.rows, positions, slate, SLATE_SEASON), roster: buildRoster(slatePlayers, warnings), dvp, report };
}
