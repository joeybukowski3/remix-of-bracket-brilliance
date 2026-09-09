import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { buildAllTouchdownWindows, TD_OPPORTUNITY_WEIGHTS, TD_SCORE_WEIGHTS, TD_SUCCESS_PRIOR_OPPORTUNITIES } from "../src/lib/nfl/touchdown-preview/model.ts";
import { NFL_TOUCHDOWN_PREVIEW_SCHEMA_VERSION, type TouchdownCandidateInput, type TouchdownOpponentGame, type TouchdownPlayerGame, type TouchdownPosition, type TouchdownPreviewArtifact } from "../src/lib/nfl/touchdown-preview/types.ts";
import { aggregateOpponentPositionTouchdowns, indexOpponentGamesByDefense, normalizeTouchdownTeam, opponentGamesForTeam, touchdownTeamGameKey } from "../src/lib/nfl/touchdown-preview/opponentHistory.ts";
import { resolveAnytimeTdForCandidate } from "./lib/nfl-anytime-td-selection.mjs";

const root = process.cwd();
const season = Number(process.argv.find((arg) => arg.startsWith("--season="))?.split("=")[1] ?? 2026);
const week = Number(process.argv.find((arg) => arg.startsWith("--week="))?.split("=")[1] ?? 1);

function csvLine(line: string): string[] {
  const out: string[] = []; let value = ""; let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { out.push(value); value = ""; }
    else value += char;
  }
  out.push(value); return out;
}

async function csvRecords(file: string): Promise<Record<string, string>[]> {
  const text = await readFile(file, "utf8");
  const lines = text.trim().split(/\r?\n/); const header = csvLine(lines.shift() ?? "");
  return lines.filter(Boolean).map((line) => Object.fromEntries(csvLine(line).map((value, index) => [header[index], value])));
}

const normalizedId = (id: string) => id.startsWith("gsis:") ? id : `gsis:${id}`;
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const nullableNumber = (value: unknown) => value != null && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
const position = (value: unknown): TouchdownPosition | null => ["QB", "RB", "WR", "TE"].includes(String(value)) ? String(value) as TouchdownPosition : null;

type WeekStat = Record<string, string> & { _position: TouchdownPosition; _playerId: string; _team: string; _opponent: string };
const stats: WeekStat[] = [];
for (const sourceSeason of [2025, 2026]) {
  const file = path.join(root, "data", "nfl", "nflverse", "player-week-stats", `stats_player_week_${sourceSeason}.csv`);
  if (!existsSync(file)) continue;
  for (const row of await csvRecords(file)) {
    const pos = position(row.position);
    if (row.season_type === "REG" && pos && row.player_id) stats.push({
      ...row,
      _position: pos,
      _playerId: normalizedId(row.player_id),
      _team: normalizeTouchdownTeam(row.team),
      _opponent: normalizeTouchdownTeam(row.opponent_team),
    });
  }
}

type ContextEvent = Record<string, string>;
const context: ContextEvent[] = [];
for (const sourceSeason of [2025, 2026]) {
  const file = path.join(root, "data", "nfl", "nflverse", "touchdown-context", `touchdown_context_${sourceSeason}.csv`);
  if (existsSync(file)) context.push(...await csvRecords(file));
}
const touchdownContextAvailable = context.length > 0;

type ResultGame = {
  gameId: string;
  seasonType: string;
  final: boolean;
  dateUtc?: string | null;
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number | null;
  awayScore: number | null;
};

const resultsByGame = new Map<string, ResultGame>();
for (const sourceSeason of [2025, 2026]) {
  const file = path.join(root, "public", "data", "nfl", String(sourceSeason), "results.json");
  if (!existsSync(file)) continue;
  const parsed = JSON.parse(await readFile(file, "utf8")) as { results?: ResultGame[] };
  for (const game of parsed.results ?? []) if (game.seasonType === "REG" && game.final) resultsByGame.set(game.gameId, game);
}

const contextByPlayerGame = new Map<string, { total: number; rz: number; i10: number; gl: number; yardlinesKnown: boolean }>();
const contextByTeamGame = new Map<string, { total: number; rz: number; gl: number; yardlinesKnown: boolean }>();
for (const row of context) {
  const key = `${normalizedId(row.player_id)}|${row.game_id}`;
  const aggregate = contextByPlayerGame.get(key) ?? { total: 0, rz: 0, i10: 0, gl: 0, yardlinesKnown: true };
  aggregate.total += 1;
  aggregate.yardlinesKnown &&= nullableNumber(row.rz_opportunity) != null && nullableNumber(row.inside_10_opportunity) != null && nullableNumber(row.goal_line_opportunity) != null;
  aggregate.rz += number(row.rz_opportunity); aggregate.i10 += number(row.inside_10_opportunity); aggregate.gl += number(row.goal_line_opportunity);
  contextByPlayerGame.set(key, aggregate);
  const teamKey = touchdownTeamGameKey(row.game_id, row.team);
  const teamAggregate = contextByTeamGame.get(teamKey) ?? { total: 0, rz: 0, gl: 0, yardlinesKnown: true };
  teamAggregate.total += 1;
  teamAggregate.yardlinesKnown &&= aggregate.yardlinesKnown;
  teamAggregate.rz += number(row.rz_opportunity); teamAggregate.gl += number(row.goal_line_opportunity);
  contextByTeamGame.set(teamKey, teamAggregate);
}

function scoreFor(game: ResultGame | undefined, team: string) {
  if (!game) return { teamScore: null, opponentScore: null, homeAway: "away" as const };
  const home = normalizeTouchdownTeam(game.homeAbbr) === normalizeTouchdownTeam(team);
  return { teamScore: home ? game.homeScore : game.awayScore, opponentScore: home ? game.awayScore : game.homeScore, homeAway: home ? "home" as const : "away" as const };
}

const playerGamesById = new Map<string, TouchdownPlayerGame[]>();
for (const row of stats) {
  const game = resultsByGame.get(row.game_id); const team = row._team; const scoring = scoreFor(game, team);
  const contextRow = contextByPlayerGame.get(`${row._playerId}|${row.game_id}`);
  const teamContext = contextByTeamGame.get(touchdownTeamGameKey(row.game_id, team));
  const scorerOpportunities = touchdownContextAvailable ? contextRow?.total ?? 0 : row._position === "QB" ? null : number(row.carries) + number(row.targets);
  const rushingTds = number(row.rushing_tds); const receivingTds = number(row.receiving_tds);
  const playerGame: TouchdownPlayerGame = {
    gameId: row.game_id, season: number(row.season), week: number(row.week), date: game?.dateUtc ?? null, team,
    opponent: row._opponent, homeAway: scoring.homeAway, teamScore: scoring.teamScore, opponentScore: scoring.opponentScore,
    carries: number(row.carries), targets: number(row.targets), scorerOpportunities,
    teamScorerOpportunities: touchdownContextAvailable ? teamContext?.total ?? 0 : null,
    teamRzOpportunities: touchdownContextAvailable && (teamContext?.yardlinesKnown ?? true) ? teamContext?.rz ?? 0 : null,
    teamGoalLineOpportunities: touchdownContextAvailable && (teamContext?.yardlinesKnown ?? true) ? teamContext?.gl ?? 0 : null,
    rushingTds, receivingTds, touchdowns: rushingTds + receivingTds,
    rzOpportunities: touchdownContextAvailable && (contextRow?.yardlinesKnown ?? true) ? contextRow?.rz ?? 0 : null,
    inside10Opportunities: touchdownContextAvailable && (contextRow?.yardlinesKnown ?? true) ? contextRow?.i10 ?? 0 : null,
    goalLineOpportunities: touchdownContextAvailable && (contextRow?.yardlinesKnown ?? true) ? contextRow?.gl ?? 0 : null,
  };
  const list = playerGamesById.get(row._playerId) ?? []; list.push(playerGame); playerGamesById.set(row._playerId, list);
}

const defenseByGame = aggregateOpponentPositionTouchdowns(stats.map((row) => ({
  gameId: row.game_id,
  team: row._team,
  opponent: row._opponent,
  position: row._position,
  rushingTds: number(row.rushing_tds),
  receivingTds: number(row.receiving_tds),
  passingTds: number(row.passing_tds),
  specialTeamsTds: number(row.special_teams_tds),
})));
const opportunityAllowed = new Map<string, { rz: number; i10: number; gl: number; yardlinesKnown: boolean }>();
for (const row of context) {
  const defense = normalizeTouchdownTeam(row.opponent); const key = touchdownTeamGameKey(row.game_id, defense);
  const aggregate = opportunityAllowed.get(key) ?? { rz: 0, i10: 0, gl: 0, yardlinesKnown: true };
  aggregate.yardlinesKnown &&= nullableNumber(row.rz_opportunity) != null && nullableNumber(row.inside_10_opportunity) != null && nullableNumber(row.goal_line_opportunity) != null;
  aggregate.rz += number(row.rz_opportunity); aggregate.i10 += number(row.inside_10_opportunity); aggregate.gl += number(row.goal_line_opportunity);
  opportunityAllowed.set(key, aggregate);
}
const opponentGames: TouchdownOpponentGame[] = [];
for (const [key, aggregate] of defenseByGame) {
  const gameId = key.split("|")[0]; const game = resultsByGame.get(gameId); const scoring = scoreFor(game, aggregate.defense);
  const opportunities = opportunityAllowed.get(key);
  const row: TouchdownOpponentGame = {
    gameId, season: number(gameId.split("_")[0]), week: number(gameId.split("_")[1]), date: game?.dateUtc ?? null,
    defense: aggregate.defense, opponent: aggregate.opponent, homeAway: scoring.homeAway,
    defenseScore: scoring.teamScore, opponentScore: scoring.opponentScore,
    offensiveTdsAllowed: Object.values(aggregate.positionTds).reduce((total, value) => total + value, 0),
    rzOpportunitiesAllowed: touchdownContextAvailable && (opportunities?.yardlinesKnown ?? true) ? opportunities?.rz ?? 0 : null,
    inside10OpportunitiesAllowed: touchdownContextAvailable && (opportunities?.yardlinesKnown ?? true) ? opportunities?.i10 ?? 0 : null,
    goalLineOpportunitiesAllowed: touchdownContextAvailable && (opportunities?.yardlinesKnown ?? true) ? opportunities?.gl ?? 0 : null,
    touchdownsAllowedByPosition: aggregate.positionTds,
  };
  opponentGames.push(row);
}
const opponentGamesByDefense = indexOpponentGamesByDefense(opponentGames);

const yardagePath = path.join(root, "public", "data", "nfl", String(season), "yardage-projections.json");
const yardage = JSON.parse(await readFile(yardagePath, "utf8"));

// Anytime-TD odds are presentation/market context only -- never a JKB TD
// Score input. A missing artifact (never fetched, or the fetch failed and
// preserved a prior file's absence) degrades every candidate to
// oddsSourceState "unavailable" without affecting anything else here.
const anytimeTdMarketPath = path.join(root, "public", "data", "nfl", "nfl-anytime-td-market.json");
const anytimeTdMarketAvailable = existsSync(anytimeTdMarketPath);
const anytimeTdCanonical: Record<string, { gameId: string; anytimeTdOdds: number | null; anytimeTdBook: string | null; marketImpliedProbability: number | null; oddsUpdatedAt: string | null }> =
  anytimeTdMarketAvailable ? (JSON.parse(await readFile(anytimeTdMarketPath, "utf8")).canonical ?? {}) : {};

const candidates = new Map<string, TouchdownCandidateInput>();
for (const row of yardage.rows ?? []) {
  if (row.week !== week || row.status !== "projected") continue;
  const pos = position(row.position); if (!pos) continue;
  if (pos === "QB" && row.market !== "passing") continue;
  if ((pos === "WR" || pos === "TE") && row.market !== "receiving") continue;
  if (pos === "RB" && row.market !== "rushing") continue;
  if (candidates.has(row.playerId)) continue;
  const team = normalizeTouchdownTeam(row.team);
  const opponent = normalizeTouchdownTeam(row.opponent);
  const anytimeTd = resolveAnytimeTdForCandidate({ playerId: row.playerId, gameId: row.gameId, kickoff: row.kickoff ?? null }, anytimeTdCanonical);
  candidates.set(row.playerId, {
    playerId: row.playerId, playerName: row.playerName, team, opponent, homeAway: row.homeAway,
    position: pos, gameId: row.gameId, kickoff: row.kickoff ?? null,
    impliedTeamPoints: nullableNumber(row.featureSnapshot?.market?.impliedTeamTotal),
    playerGames: playerGamesById.get(row.playerId) ?? [], opponentGames: opponentGamesForTeam(opponentGamesByDefense, opponent),
    anytimeTdOdds: anytimeTd.anytimeTdOdds, anytimeTdBook: anytimeTd.anytimeTdBook,
    marketImpliedProbability: anytimeTd.marketImpliedProbability, oddsUpdatedAt: anytimeTd.oddsUpdatedAt, oddsSourceState: anytimeTd.oddsSourceState,
  });
}

const players = buildAllTouchdownWindows([...candidates.values()]);
const impliedCount = players.filter((player) => player.impliedTeamPoints != null).length;
const anytimeTdAvailableCount = players.filter((player) => player.anytimeTdOdds != null).length;
const artifact: TouchdownPreviewArtifact = {
  schemaVersion: NFL_TOUCHDOWN_PREVIEW_SCHEMA_VERSION, modelVersion: "jkb-td-score-v1.0.0", season, week,
  generatedAt: yardage.generatedAt ?? null, defaultWindow: season === 2026 && week === 1 ? "2025" : "2026",
  sourceStatus: {
    playerWeekStats: stats.length ? "available" : "missing", touchdownContext: touchdownContextAvailable ? "available" : "missing",
    marketImpliedPoints: impliedCount === 0 ? "missing" : impliedCount === players.length ? "available" : "partial",
    anytimeTdOdds: !anytimeTdMarketAvailable ? "unsupported" : anytimeTdAvailableCount === 0 ? "missing" : anytimeTdAvailableCount === players.length ? "available" : "partial",
  },
  methodology: {
    normalization: "Conservative full-candidate percentile: count strictly lower / finite population × 100; ties share a percentile; singleton = 50.",
    tdSuccess: `Empirical-Bayes conversion = (rushing+receiving TD + league TD/opportunity × ${TD_SUCCESS_PRIOR_OPPORTUNITIES}) / (scorer opportunities + ${TD_SUCCESS_PRIOR_OPPORTUNITIES}).`,
    positionAdjustment: "Player usage is divided by the candidate-position mean; opponent positional TD rate is divided by the league mean allowed to that position before full-population normalization.",
    componentWeights: TD_SCORE_WEIGHTS, opportunityWeights: TD_OPPORTUNITY_WEIGHTS,
  },
  players,
};
const output = path.join(root, "public", "data", "nfl", String(season), "touchdown-preview.json");
await writeFile(output, `${JSON.stringify(artifact)}\n`, "utf8");
console.log(`Wrote ${players.length} touchdown candidates to ${output}; context=${artifact.sourceStatus.touchdownContext}`);
