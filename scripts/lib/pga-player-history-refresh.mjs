import {
  buildPgaPlayerLookup,
  normalizePgaPlayerExactName,
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

// Merges a list of per-player PlayerRefreshResult entries (see
// scripts/refresh-pga-player-history.mjs) instead of a Map of guaranteed
// successes. Only "success" results are applied; anything else is left
// untouched by construction, which is what gives failed players fault
// isolation. A success with no matching existing record is bootstrapped as a
// brand-new player and appended after all existing players, ordered
// alphabetically among themselves so reruns are deterministic. New players
// with zero qualifying results are still recorded (an empty starter record is
// legitimate output, not corruption) — only players whose FETCH failed are
// omitted from the artifact entirely (see Part 7 of the refresh contract).
export function mergePartialScopedHistory(historyPayload, playerRefreshResults, options = {}) {
  const asOfDate = options.asOfDate ?? new Date().toISOString().slice(0, 10);
  const allowedEventIdentities = options.allowedEventIdentities
    ? new Set(options.allowedEventIdentities)
    : null;
  const byId = new Map(historyPayload.players.map((player) => [String(player.playerId ?? ""), player]));
  const changedPlayers = [];
  const addedResults = [];
  const successPlayerIds = [];
  const newPlayerRecords = [];

  for (const result of playerRefreshResults) {
    if (result.status !== "success") continue;
    const playerId = String(result.playerId);
    const existing = byId.get(playerId);
    successPlayerIds.push(playerId);

    if (existing) {
      const merged = mergePlayerHistory(existing, result.results, asOfDate, allowedEventIdentities);
      if (merged.changed) {
        byId.set(playerId, merged.player);
        changedPlayers.push(existing.player);
        addedResults.push(...merged.added.map((added) => ({ player: existing.player, ...added })));
      }
      continue;
    }

    const bootstrapBase = {
      player: result.player,
      playerId,
      sourcePlayerName: result.player,
      recentResults: [],
      eventHistory: {},
    };
    const merged = mergePlayerHistory(bootstrapBase, result.results, asOfDate, allowedEventIdentities);
    newPlayerRecords.push(merged.changed ? merged.player : bootstrapBase);
    changedPlayers.push(result.player);
    addedResults.push(...merged.added.map((added) => ({ player: result.player, ...added })));
  }

  const orderedExisting = historyPayload.players.map((player) => byId.get(String(player.playerId ?? "")) ?? player);
  const orderedNew = newPlayerRecords.slice().sort((left, right) => left.player.localeCompare(right.player));
  const players = [...orderedExisting, ...orderedNew];
  const changed = changedPlayers.length > 0 || newPlayerRecords.length > 0;

  return {
    payload: changed
      ? { ...historyPayload, generatedAt: options.generatedAt ?? new Date().toISOString(), players }
      : historyPayload,
    changed,
    changedPlayers,
    addedResults,
    successPlayerIds,
  };
}

// A scoped, per-player refresh can legitimately grow the roster (bootstrapped
// new players resolved through the official field). scopePlayerIds must be
// the set of player IDs that SUCCEEDED this run (existing players that
// changed plus newly bootstrapped players) — every other player, whether
// truly out-of-scope or a scoped player whose refresh failed this run, must
// stay byte-identical, which is exactly the guarantee failed players need.
export function validateScopedRefresh(before, after, context) {
  const scopeIds = new Set(context.scopePlayerIds.map(String));
  const beforeById = new Map(before.players.map((player) => [String(player.playerId ?? ""), player]));
  const afterById = new Map(after.players.map((player) => [String(player.playerId ?? ""), player]));

  if (after.players.length < before.players.length) throw new Error("Player count decreased during scoped history refresh.");

  const afterIds = after.players.map((player) => String(player.playerId ?? ""));
  if (new Set(afterIds).size !== afterIds.length) throw new Error("Duplicate player IDs in output history.");
  validateNoDuplicateCanonicalIdentity(after.players);

  const beforeIds = new Set(beforeById.keys());
  const beforeOrderInAfter = after.players.filter((player) => beforeIds.has(String(player.playerId ?? ""))).map((player) => player.player);
  if (before.players.map((player) => player.player).join("\n") !== beforeOrderInAfter.join("\n")) {
    throw new Error("Existing player ordering changed during scoped history refresh.");
  }

  const newPlayers = after.players.filter((player) => !beforeIds.has(String(player.playerId ?? "")));
  if (newPlayers.length) {
    for (const player of newPlayers) {
      const playerId = String(player.playerId ?? "");
      if (!playerId) throw new Error(`Newly added player ${player.player} has no canonical player ID.`);
      if (!scopeIds.has(playerId)) throw new Error(`Player ${player.player} was added without a successful scoped refresh.`);
    }
    const alphabetical = newPlayers.map((player) => player.player).slice().sort((left, right) => left.localeCompare(right));
    if (newPlayers.map((player) => player.player).join("\n") !== alphabetical.join("\n")) {
      throw new Error("Newly bootstrapped players are not in deterministic alphabetical order.");
    }
    const firstNewIndex = after.players.findIndex((player) => !beforeIds.has(String(player.playerId ?? "")));
    if (firstNewIndex !== before.players.length) {
      throw new Error("Newly bootstrapped players must be appended after all existing players.");
    }
  }

  for (const [playerId, player] of beforeById) {
    const refreshed = afterById.get(playerId);
    if (!refreshed) throw new Error(`Player ${player.player} disappeared during scoped history refresh.`);
    if (!scopeIds.has(playerId) && JSON.stringify(player) !== JSON.stringify(refreshed)) {
      throw new Error(`Out-of-scope or failed player ${player.player} changed during scoped history refresh.`);
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
    // Only enforce this for participants who were actually part of the
    // successful scope this run — a required participant whose refresh
    // failed (and is therefore excluded from scopeIds) is already recorded
    // as a failure and must not also be treated as a fatal validation error.
    if (scopeIds.has(playerId) && !participantIds.has(playerId)) {
      throw new Error(`Known participant ${playerId} is missing expected event ${expected.eventId}.`);
    }
  }
  return participants.map((player) => player.player);
}

// fetchProfile is injected so this per-player fault-isolation step is testable
// without real network access: it must resolve { data, requestSource } or
// reject. A rejection or a structurally malformed response both become a
// PlayerRefreshResult failure instead of throwing, which is what lets one
// player's failure leave every other player unaffected.
export async function refreshScopedPlayer(player, { fetchProfile, startYear }) {
  try {
    const { data, requestSource } = await fetchProfile(player.playerId);
    if (data == null || typeof data !== "object" || !("playerProfileTournamentResults" in data)) {
      return failedRefreshResult(player, "response-normalization", "PGA_MALFORMED_RESPONSE", "PGA Tour GraphQL response is missing playerProfileTournamentResults.");
    }
    const results = normalizePlayerTournamentResults(data, startYear);
    return {
      status: "success",
      scopeName: player.scopeName,
      player: player.player,
      playerId: player.playerId,
      resolutionMethod: player.resolutionMethod,
      results,
      requestSource,
    };
  } catch (error) {
    return failedRefreshResult(player, "history-fetch", "PGA_HISTORY_FETCH_FAILED", error instanceof Error ? error.message : String(error));
  }
}

function failedRefreshResult(player, stage, errorCode, message) {
  return { status: "failed", scopeName: player.scopeName, player: player.player, playerId: player.playerId, resolutionMethod: player.resolutionMethod, stage, errorCode, message };
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

function validateNoDuplicateCanonicalIdentity(players) {
  const idByExactName = new Map();
  for (const player of players) {
    const key = normalizePgaPlayerExactName(player.player);
    const playerId = String(player.playerId ?? "");
    const existingId = idByExactName.get(key);
    if (existingId && existingId !== playerId) {
      throw new Error(`Duplicate canonical player identity for "${player.player}" with different player IDs.`);
    }
    idByExactName.set(key, playerId);
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
