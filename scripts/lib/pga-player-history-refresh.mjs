import {
  buildPgaPlayerLookup,
  resolvePgaPlayerMatch,
} from "../../src/lib/pga/playerIdentity.ts";

const VISIBLE_RECENT_COUNT = 5;
const STORED_RECENT_COUNT = 8;

export function extractScopeNames(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.rows)
      ? payload.rows
      : Array.isArray(payload?.players)
        ? payload.players
        : [];

  const names = rows
    .map((row) => typeof row === "string" ? row : row?.player ?? row?.name)
    .map((name) => String(name ?? "").trim())
    .filter(Boolean);

  if (!names.length) throw new Error("Scoped PGA player pool is empty.");
  if (new Set(names).size !== names.length) throw new Error("Scoped PGA player pool contains duplicate names.");
  return names;
}

export function resolveScopedPlayers(historyPayload, scopeNames) {
  const lookup = buildPgaPlayerLookup(historyPayload.players ?? []);
  const resolved = scopeNames.map((name) => {
    const match = resolvePgaPlayerMatch(name, lookup);
    const playerId = String(match.matchedPlayer?.playerId ?? "").trim();
    if (!match.matchedPlayer || !playerId) {
      throw new Error(`Unable to resolve a canonical PGA Tour player ID for ${name}.`);
    }
    return {
      scopeName: name,
      player: match.matchedPlayer.player,
      playerId,
      matchMethod: match.method,
    };
  });

  const ids = resolved.map((row) => row.playerId);
  if (new Set(ids).size !== ids.length) throw new Error("Scoped PGA player pool resolves to duplicate player IDs.");
  return resolved;
}

export function normalizeTournamentResult(event) {
  const parsedFinish = parseFinish(event?.position);
  if (!parsedFinish) return null;

  const eventName = String(event?.tournamentName ?? "").trim();
  const season = Number(event?.year ?? 0) || null;
  const eventId = String(event?.tournamentId ?? "").trim() || null;
  if (!eventId || !season || !eventName) return null;

  const roundScores = Object.fromEntries(
    (event?.roundScores ?? []).map((round) => [Number(round.roundNum), numericOrNull(round.roundScore)]),
  );

  return {
    season,
    eventId,
    eventSlug: slugifyEvent(eventName),
    eventName,
    courseName: String(event?.courseName ?? "").trim() || null,
    eventDate: normalizeDate(event?.date, season),
    majorType: resolveMajorType(eventName),
    finishText: parsedFinish.finishText,
    finishPosition: parsedFinish.finishPosition,
    madeCut: parsedFinish.madeCut,
    status: parsedFinish.status,
    scoreToPar: event?.toPar == null ? null : String(event.toPar),
    totalStrokes: numericOrNull(event?.total),
    rounds: {
      r1: roundScores[1] ?? null,
      r2: roundScores[2] ?? null,
      r3: roundScores[3] ?? null,
      r4: roundScores[4] ?? null,
    },
  };
}

export function normalizePlayerTournamentResults(data, startYear = 2016) {
  const sections = data?.playerProfileTournamentResults?.tournaments ?? [];
  const tournaments = sections.flatMap((section) => section?.tournaments ?? []);
  const byIdentity = new Map();

  for (const event of tournaments) {
    if (Number(event?.year ?? 0) < startYear) continue;
    const result = normalizeTournamentResult(event);
    if (!result) continue;
    const identity = resultIdentity(result);
    if (!byIdentity.has(identity)) byIdentity.set(identity, result);
  }

  return [...byIdentity.values()].sort(sortNewestFirst);
}

export function resultIdentity(result) {
  const eventId = String(result?.eventId ?? "").trim();
  const season = Number(result?.season ?? 0);
  if (!eventId || !season) throw new Error("PGA history result is missing event ID or season.");
  return `${season}:${eventId}`;
}

export function mergeScopedHistory(historyPayload, refreshedByPlayerId, options = {}) {
  const scopeIds = new Set(options.scopePlayerIds ?? refreshedByPlayerId.keys());
  const allowedEventIdentities = options.allowedEventIdentities
    ? new Set(options.allowedEventIdentities)
    : null;
  const asOfDate = options.asOfDate ?? new Date().toISOString().slice(0, 10);
  const changedPlayers = [];
  const addedResults = [];

  const players = (historyPayload.players ?? []).map((player) => {
    const playerId = String(player.playerId ?? "");
    if (!scopeIds.has(playerId)) return player;
    const refreshed = refreshedByPlayerId.get(playerId);
    if (!refreshed) throw new Error(`Missing refreshed profile for scoped player ${player.player} (${playerId}).`);

    const merged = mergePlayerHistory(player, refreshed, asOfDate, allowedEventIdentities);
    if (!merged.changed) return player;
    changedPlayers.push(player.player);
    addedResults.push(...merged.added.map((result) => ({ player: player.player, ...result })));
    return merged.player;
  });

  const foundScopeIds = new Set((historyPayload.players ?? []).map((player) => String(player.playerId ?? "")));
  for (const scopeId of scopeIds) {
    if (!foundScopeIds.has(scopeId)) throw new Error(`Scoped player ID ${scopeId} is absent from player-history.json.`);
  }

  const changed = changedPlayers.length > 0;
  return {
    payload: changed
      ? { ...historyPayload, generatedAt: options.generatedAt ?? new Date().toISOString(), players }
      : historyPayload,
    changed,
    changedPlayers,
    addedResults,
  };
}

export function validateScopedRefresh(before, after, context) {
  const scopeIds = new Set(context.scopePlayerIds.map(String));
  const beforeById = new Map(before.players.map((player) => [String(player.playerId ?? ""), player]));
  const afterById = new Map(after.players.map((player) => [String(player.playerId ?? ""), player]));

  if (before.players.length !== after.players.length) throw new Error("Player count changed during scoped history refresh.");
  if (before.players.map((player) => player.player).join("\n") !== after.players.map((player) => player.player).join("\n")) {
    throw new Error("Player ordering changed during scoped history refresh.");
  }

  for (const [playerId, player] of beforeById) {
    const refreshed = afterById.get(playerId);
    if (!refreshed) throw new Error(`Player ${player.player} disappeared during scoped history refresh.`);
    if (!scopeIds.has(playerId) && JSON.stringify(player) !== JSON.stringify(refreshed)) {
      throw new Error(`Out-of-scope player ${player.player} changed during scoped history refresh.`);
    }
    validateNoDuplicateResults(refreshed);
  }

  const expected = context.expectedEvent;
  if (expected) validateExpectedEvent(after, context.refreshedByPlayerId, scopeIds, expected);
  return true;
}

export function validatePublishedExpectedEvent(payload, scopePlayerIds, expected, requiredParticipantIds = []) {
  const scopeIds = new Set(scopePlayerIds.map(String));
  const expectedIdentity = `${Number(expected.season)}:${String(expected.eventId)}`;
  const participants = [];

  for (const player of payload.players ?? []) {
    if (!scopeIds.has(String(player.playerId ?? ""))) continue;
    const matching = Object.values(player.eventHistory ?? {}).flat()
      .filter((result) => resultIdentity(result) === expectedIdentity);
    if (!matching.length) continue;
    if (matching.length !== 1) throw new Error(`${player.player} has duplicate expected-event history records.`);
    const result = matching[0];
    if (result.eventName !== expected.eventName || result.eventDate !== expected.eventDate) {
      throw new Error(`${player.player} has mismatched expected-event name or date.`);
    }
    if (resultIdentity(player.recentResults?.[0]) !== expectedIdentity) {
      throw new Error(`${player.player} does not have the expected event first in recentResults.`);
    }
    participants.push({ player: player.player, playerId: String(player.playerId ?? "") });
  }

  if (!participants.length) throw new Error(`Expected event ${expected.eventId} is absent from the scoped output.`);
  const participantIds = new Set(participants.map((player) => player.playerId));
  for (const playerId of requiredParticipantIds.map(String)) {
    if (!participantIds.has(playerId)) throw new Error(`Known participant ${playerId} is missing expected event ${expected.eventId}.`);
  }
  return participants.map((player) => player.player);
}

export function visibleRecentResults(player) {
  return (player?.recentResults ?? []).slice(0, VISIBLE_RECENT_COUNT);
}

function mergePlayerHistory(player, refreshedResults, asOfDate, allowedEventIdentities) {
  const { modelRecentResults: deprecatedModelRecentResults, ...playerWithoutModelSnapshot } = player;
  const existingRecent = player.recentResults ?? [];
  const existingIdentities = collectPlayerEventIdentities(player);
  const newestStoredDate = existingRecent.reduce(
    (latest, result) => String(result.eventDate ?? "") > latest ? String(result.eventDate) : latest,
    "",
  );

  const added = refreshedResults.filter((result) => {
    const identity = resultIdentity(result);
    const eventDate = String(result.eventDate ?? "");
    return (!allowedEventIdentities || allowedEventIdentities.has(identity))
      && eventDate
      && eventDate <= asOfDate
      && eventDate > newestStoredDate
      && !existingIdentities.has(identity);
  });

  if (!added.length) {
    return deprecatedModelRecentResults === undefined
      ? { changed: false, player, added: [] }
      : { changed: true, player: playerWithoutModelSnapshot, added: [] };
  }

  const recentResults = dedupeResults([...added, ...existingRecent])
    .sort(sortNewestFirst)
    .slice(0, STORED_RECENT_COUNT);
  const eventHistory = { ...player.eventHistory };

  for (const result of added) {
    const slug = result.eventSlug;
    if (!slug) continue;
    eventHistory[slug] = dedupeResults([result, ...(eventHistory[slug] ?? [])]).sort(sortNewestFirst);
  }

  return {
    changed: true,
    player: { ...playerWithoutModelSnapshot, recentResults, eventHistory },
    added,
  };
}

function validateExpectedEvent(after, refreshedByPlayerId, scopeIds, expected) {
  const expectedId = String(expected.eventId);
  const expectedSeason = Number(expected.season);
  const expectedDate = String(expected.eventDate);
  const participants = [];

  if (!expectedId || !expectedSeason || !/^\d{4}-\d{2}-\d{2}$/.test(expectedDate)) {
    throw new Error("Expected event validation requires event ID, season, and ISO event date.");
  }
  if (expectedDate > expected.asOfDate) throw new Error(`Expected event ${expectedId} has not completed by ${expected.asOfDate}.`);
  const ageDays = Math.floor((Date.parse(`${expected.asOfDate}T00:00:00Z`) - Date.parse(`${expectedDate}T00:00:00Z`)) / 86_400_000);
  if (ageDays < 0 || ageDays > (expected.maxAgeDays ?? 14)) {
    throw new Error(`Expected event ${expectedId} is ${ageDays} days old; refusing stale history refresh.`);
  }

  for (const playerId of scopeIds) {
    const upstream = refreshedByPlayerId.get(playerId) ?? [];
    const upstreamEvent = upstream.find((result) => resultIdentity(result) === `${expectedSeason}:${expectedId}`);
    if (!upstreamEvent) continue;
    participants.push(playerId);
    if (upstreamEvent.eventName !== expected.eventName) {
      throw new Error(`Expected event ${expectedId} upstream name is ${upstreamEvent.eventName}, not ${expected.eventName}.`);
    }
    if (upstreamEvent.eventDate !== expectedDate) {
      throw new Error(`Expected event ${expectedId} upstream date is ${upstreamEvent.eventDate}, not ${expectedDate}.`);
    }
    const output = after.players.find((player) => String(player.playerId ?? "") === playerId);
    if (!output || resultIdentity(output.recentResults[0]) !== `${expectedSeason}:${expectedId}`) {
      throw new Error(`Expected event ${expectedId} is not the newest result for participant ${output?.player ?? playerId}.`);
    }
  }

  if (!participants.length) throw new Error(`Expected event ${expectedId} is missing for every scoped player.`);
  const participantIds = new Set(participants);
  for (const playerId of expected.requiredParticipantIds ?? []) {
    if (scopeIds.has(String(playerId)) && !participantIds.has(String(playerId))) {
      throw new Error(`Known participant ${playerId} is missing expected event ${expectedId}.`);
    }
  }
}

function validateNoDuplicateResults(player) {
  assertUnique(player.recentResults ?? [], `${player.player} recentResults`);
  for (const [slug, results] of Object.entries(player.eventHistory ?? {})) {
    assertUnique(results, `${player.player} eventHistory.${slug}`);
  }
}

function assertUnique(results, label) {
  const identities = results.map(resultIdentity);
  if (new Set(identities).size !== identities.length) throw new Error(`${label} contains duplicate event ID/season records.`);
}

function collectPlayerEventIdentities(player) {
  const identities = new Set();
  for (const result of player.recentResults ?? []) identities.add(resultIdentity(result));
  for (const results of Object.values(player.eventHistory ?? {})) {
    for (const result of results) identities.add(resultIdentity(result));
  }
  return identities;
}

function dedupeResults(results) {
  const seen = new Set();
  return results.filter((result) => {
    const identity = resultIdentity(result);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function parseFinish(value) {
  let finishText = String(value ?? "").trim().toUpperCase();
  if (!finishText || finishText === "-") return null;
  if (finishText === "CUT" || finishText === "MDF") finishText = "MC";
  if (finishText === "W/D") finishText = "WD";
  if (finishText === "MC") return { finishText, finishPosition: null, madeCut: false, status: "missed_cut" };
  if (finishText === "WD") return { finishText, finishPosition: null, madeCut: false, status: "withdrawn" };
  if (finishText === "DQ") return { finishText, finishPosition: null, madeCut: false, status: "disqualified" };
  const positionMatch = finishText.match(/(\d+)/);
  if (!positionMatch) return null;
  return { finishText, finishPosition: Number(positionMatch[1]), madeCut: true, status: "finished" };
}

function slugifyEvent(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function resolveMajorType(eventName) {
  const key = String(eventName ?? "").toLowerCase();
  if (key.includes("masters")) return "masters";
  if (key.includes("pga championship")) return "pga_championship";
  if (key.includes("u.s. open") || key.includes("us open")) return "us_open";
  if (key.includes("open championship") || key === "the open") return "open_championship";
  return null;
}

function normalizeDate(value, season) {
  const text = String(value ?? "").trim();
  if (!text) return season ? `${season}-01-01` : null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parts = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (parts) return `${parts[3]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? (season ? `${season}-01-01` : null) : parsed.toISOString().slice(0, 10);
}

function sortNewestFirst(left, right) {
  return String(right.eventDate ?? "").localeCompare(String(left.eventDate ?? ""))
    || Number(right.season ?? 0) - Number(left.season ?? 0);
}

function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
