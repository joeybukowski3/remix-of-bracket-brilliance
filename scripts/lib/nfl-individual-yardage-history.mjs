/** Additive history only. Legacy volume-leader and market-active logs are untouched. */
import { normalizeHistoryStatRows } from "./nfl-yardage-history-core.mjs";
import { buildTrailingPregameAverage, buildPlayerYardsPerGame, buildYardsAllowedPerGame } from "./nfl-yardage-rolling-core.mjs";
import { resolveFinalPreKickoffLineFromIndex, HISTORICAL_LINE_SELECTION_POLICY_VERSION } from "./nfl-yardage-historical-line-core.mjs";

export const INDIVIDUAL_HISTORY_VERSION = "nfl-individual-yardage-history-v1";
const MARKETS = { passing: "passingYards", rushing: "rushingYards", receiving: "receivingYards" };
const POSITIONS = ["QB", "RB", "WR", "TE"];
const id = (value) => `gsis:${String(value).replace(/^gsis:/, "")}`;
const key = (entity, row) => `${entity}|${row.season}|${row.week}`;
const finiteSource = (value) => value == null || String(value).trim() === "" || !Number.isFinite(Number(value)) ? null : Number(value);

/**
 * Preserve missing yardage. A recorded appearance requires positive offensive
 * participation (attempt/carry/target/reception or explicit offensive snaps).
 * An all-zero/no-participation row is unknown/DNP, not a fabricated appearance.
 * Zero yards WITH participation remains a real observation for every market.
 */
export function normalizeIndividualHistoryStatRows(rows, season) {
  return rows.flatMap((raw) => normalizeHistoryStatRows([raw], season).map((row) => ({
    ...row,
    passingYards: finiteSource(raw.passing_yards),
    rushingYards: finiteSource(raw.rushing_yards),
    receivingYards: finiteSource(raw.receiving_yards),
    recordedAppearance: [raw.attempts, raw.carries, raw.targets, raw.receptions, raw.offensive_snaps]
      .some((value) => (finiteSource(value) ?? 0) > 0),
  })));
}

function utc(value, name) {
  if (typeof value !== "string" || !value.endsWith("Z") || !Number.isFinite(Date.parse(value))) throw new Error(`${name} must be a UTC timestamp`);
  return Date.parse(value);
}

/**
 * One bounded context block for the existing artifact. Requests are canonical
 * player/market/position/opponent identities from the current projection universe.
 * asOf is required; targetGameIds are explicitly excluded even if rescheduled.
 * Dates order observations; source-publication timing is NOT reconstructable.
 */
export function buildIndividualYardageHistory({ season, week, asOf, targetGameIds = [], requests, statRows, gameLookup, canonicalToNflverseAbbr, archiveIndex, lastN = 10 }) {
  const cutoff = utc(asOf, "asOf");
  if (!Number.isInteger(lastN) || lastN < 1 || lastN > 10) throw new Error("lastN must be between 1 and 10");
  const excluded = new Set(targetGameIds);
  const teams = new Map([...canonicalToNflverseAbbr].map(([canonical, native]) => [native, canonical]));
  const diagnostics = { excludedCutoff: 0, missingGame: 0, noRecordedAppearance: 0, duplicateIdentity: 0, missingYardage: 0 };
  const candidates = [];
  const counts = new Map();
  for (const row of statRows) {
    if (!POSITIONS.includes(row.position)) continue;
    const game = gameLookup.get(key(row.team, row));
    if (!game || !Number.isFinite(Date.parse(game.dateUtc)) || game.result == null || !teams.has(row.team) || !teams.has(row.opponentTeam) || game.opponentNflverseAbbr !== row.opponentTeam) { diagnostics.missingGame++; continue; }
    if (Date.parse(game.dateUtc) >= cutoff || excluded.has(game.gameId)) { diagnostics.excludedCutoff++; continue; }
    if (!row.recordedAppearance) { diagnostics.noRecordedAppearance++; continue; }
    const identity = `${game.gameId}|${id(row.playerId)}`;
    counts.set(identity, (counts.get(identity) ?? 0) + 1);
    candidates.push({ ...row, game, identity });
  }
  const eligible = candidates.filter((row) => {
    if (counts.get(row.identity) === 1) return true;
    diagnostics.duplicateIdentity++;
    return false;
  });
  const players = {};
  const defenseMatchups = {};
  const cache = new Map();
  const indexesFor = (market, position) => {
    const cacheKey = `${market}:${position}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const field = MARKETS[market];
    const all = eligible.filter((r) => r.position === position);
    const valid = all.filter((r) => Number.isFinite(r[field]));
    const playerDates = new Map(valid.map((r) => [key(r.playerId, r), r.game.dateUtc]));
    const defenseDates = new Map(valid.map((r) => [key(r.opponentTeam, r), r.game.dateUtc]));
    const player = buildTrailingPregameAverage(buildPlayerYardsPerGame(valid, market), 10, playerDates);
    const totals = buildYardsAllowedPerGame(valid, market, position);
    // An incomplete position group must not masquerade as a complete allowance.
    const incomplete = new Set(candidates.filter((r) => r.position === position &&
      (!Number.isFinite(r[field]) || counts.get(r.identity) !== 1)).map((r) => key(r.opponentTeam, r)));
    for (const k of incomplete) totals.delete(k);
    const defense = buildTrailingPregameAverage(totals, 10, defenseDates);
    const result = { valid, player, defense };
    cache.set(cacheKey, result);
    return result;
  };
  const order = (a, b) => Date.parse(b.game.dateUtc) - Date.parse(a.game.dateUtc) || a.game.gameId.localeCompare(b.game.gameId) || id(a.playerId).localeCompare(id(b.playerId));
  function base(row, market) {
    const actualYards = row[MARKETS[market]];
    const line = resolveFinalPreKickoffLineFromIndex(archiveIndex, { playerId: id(row.playerId), canonicalMarket: MARKETS[market], gameId: row.game.gameId, kickoffIso: row.game.dateUtc });
    return {
      rowId: `${row.game.gameId}:${id(row.playerId)}:${market}`, gameId: row.game.gameId,
      season: row.season, week: row.week, dateUtc: row.game.dateUtc,
      playerId: id(row.playerId), playerName: row.playerName, team: teams.get(row.team), opponent: teams.get(row.opponentTeam),
      homeAway: row.game.homeAway, position: row.position, market, actualYards,
      historicalSportsbookLine: line ? { ...line, selectionPolicyVersion: HISTORICAL_LINE_SELECTION_POLICY_VERSION } : null,
      lineResult: !line ? "unavailable" : actualYards > line.point ? "over" : actualYards < line.point ? "under" : "push",
      temporalQuality: "event-time-reconstructed",
    };
  }
  for (const request of [...requests].sort((a, b) => `${a.playerId}:${a.market}:${a.position}:${a.opponent}`.localeCompare(`${b.playerId}:${b.market}:${b.position}:${b.opponent}`))) {
    const { market, position } = request;
    if (!MARKETS[market] || !POSITIONS.includes(position)) throw new Error("Unsupported history market/position");
    const indexes = indexesFor(market, position);
    const playerKey = `${id(request.playerId)}:${market}`;
    if (!players[playerKey]) players[playerKey] = indexes.valid.filter((r) => id(r.playerId) === id(request.playerId)).sort(order).slice(0, lastN).map((r) => {
      const reference = indexes.defense.get(key(r.opponentTeam, r));
      const average = reference?.avg ?? null;
      return { ...base(r, market), comparison: "player-vs-aggregate-positional-allowance",
        opponentPregamePositionalAllowance: average,
        opponentPregamePositionalAllowanceSampleSize: reference?.gamesIncluded ?? 0,
        allowanceScope: "entire-position-group-per-defense-game",
        actualMinusOpponentAllowance: average == null ? null : r[MARKETS[market]] - average,
        missingReferenceReason: average == null ? "no-complete-prior-positional-reference" : null };
    });
    const defenseKey = `${request.opponent}:${market}:${position}`;
    if (!defenseMatchups[defenseKey]) defenseMatchups[defenseKey] = indexes.valid.filter((r) => teams.get(r.opponentTeam) === request.opponent).sort(order).slice(0, lastN).map((r) => {
      const reference = indexes.player.get(key(r.playerId, r));
      const average = reference?.avg ?? null;
      return { ...base(r, market), comparison: "individual-player-vs-own-pregame-average",
        playerPregameTrailing10Average: average, playerReferenceSampleSize: reference?.gamesIncluded ?? 0,
        actualMinusPlayerAverage: average == null ? null : r[MARKETS[market]] - average,
        missingReferenceReason: average == null ? "no-prior-player-reference" : null };
    });
  }
  diagnostics.missingYardage = eligible.filter((r) => Object.values(MARKETS).some((field) => !Number.isFinite(r[field]))).length;
  return { schemaVersion: INDIVIDUAL_HISTORY_VERSION, season, week, asOf, lastN,
    targetGameIds: [...excluded].sort(), cohortPolicy: "individual-recorded-offensive-appearances-v1",
    referencePolicy: "entering-game-trailing-10-recorded-games-v1",
    temporalQuality: "event-time-reconstructed", players, defenseMatchups, diagnostics };
}
