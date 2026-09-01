import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export const MLB_K_HISTORY_STATSAPI_SCHEMA_VERSION = 1;
export const MLB_STATS_API = "https://statsapi.mlb.com/api/v1";

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertDate(value, label) {
  const text = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
  return text;
}

function sanitizeUrl(value) {
  const url = new URL(value);
  for (const key of [...url.searchParams.keys()]) {
    if (/key|token|secret|password|authorization/i.test(key)) url.searchParams.set(key, "REDACTED");
  }
  url.username = "";
  url.password = "";
  return url.toString();
}

function writeAtomic(filePath, bytes) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const backupPath = `${filePath}.bak-${process.pid}-${Date.now()}`;
  writeFileSync(temporaryPath, bytes);
  let backedUp = false;
  try {
    if (existsSync(filePath)) {
      renameSync(filePath, backupPath);
      backedUp = true;
    }
    renameSync(temporaryPath, filePath);
    if (backedUp) rmSync(backupPath, { force: true });
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    if (backedUp && !existsSync(filePath) && existsSync(backupPath)) renameSync(backupPath, filePath);
    throw error;
  }
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function metadataPath(filePath) {
  return `${filePath}.manifest.json`;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function verifiedCachedPeopleResources(directory, requestedDateRange) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json") && !name.endsWith(".manifest.json"))
    .sort()
    .flatMap((name) => {
      const filePath = path.join(directory, name);
      try {
        const metadata = readJson(metadataPath(filePath));
        if (metadata.resourceType !== "starting-pitcher-metadata") return [];
        const cached = verifiedCachedResource(filePath, metadata.sourceUrl, requestedDateRange);
        return cached ? [{ status: "skipped_verified", filePath, ...cached, requestAttempts: 0 }] : [];
      } catch {
        return [];
      }
    });
}

function verifiedCachedResource(filePath, expectedUrl, requestedDateRange) {
  const sidecarPath = metadataPath(filePath);
  if (!existsSync(filePath) || !existsSync(sidecarPath)) return null;
  try {
    const bytes = readFileSync(filePath);
    const metadata = readJson(sidecarPath);
    if (metadata.status !== "complete") return null;
    if (metadata.sourceUrl !== sanitizeUrl(expectedUrl)) return null;
    if (metadata.requestedDateRange?.startDate !== requestedDateRange.startDate
      || metadata.requestedDateRange?.endDate !== requestedDateRange.endDate) return null;
    if (metadata.byteCount !== bytes.length || metadata.sha256 !== sha256(bytes)) return null;
    JSON.parse(bytes.toString("utf8"));
    return { bytes, metadata };
  } catch {
    return null;
  }
}

export async function fetchWithRetry(url, {
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
  maxAttempts = 3,
  backoffMs = 250,
  onAttempt = () => {},
} = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    onAttempt({ url: sanitizeUrl(url), attempt });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      JSON.parse(text);
      return { bytes: Buffer.from(text, "utf8"), attempts: attempt };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < maxAttempts) await sleep(backoffMs * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Request failed after ${maxAttempts} attempt(s): ${sanitizeUrl(url)}: ${lastError}`);
}

async function acquireJsonResource({
  filePath,
  url,
  requestedDateRange,
  retrievalTimestamp,
  fetchOptions,
  resourceType,
}) {
  const cached = verifiedCachedResource(filePath, url, requestedDateRange);
  if (cached) return { status: "skipped_verified", filePath, bytes: cached.bytes, metadata: cached.metadata, requestAttempts: 0 };

  try {
    const response = await fetchWithRetry(url, fetchOptions);
    const metadata = {
      schemaVersion: MLB_K_HISTORY_STATSAPI_SCHEMA_VERSION,
      provider: "MLB StatsAPI",
      resourceType,
      sourceUrl: sanitizeUrl(url),
      retrievalTimestamp,
      requestedDateRange,
      byteCount: response.bytes.length,
      sha256: sha256(response.bytes),
      gameCount: resourceType === "game-boxscore" ? 1 : 0,
      status: "complete",
    };
    writeAtomic(filePath, response.bytes);
    writeAtomic(metadataPath(filePath), Buffer.from(stableJson(metadata), "utf8"));
    return { status: "complete", filePath, bytes: response.bytes, metadata, requestAttempts: response.attempts };
  } catch (error) {
    const metadata = {
      schemaVersion: MLB_K_HISTORY_STATSAPI_SCHEMA_VERSION,
      provider: "MLB StatsAPI",
      resourceType,
      sourceUrl: sanitizeUrl(url),
      retrievalTimestamp,
      requestedDateRange,
      byteCount: 0,
      sha256: null,
      gameCount: 0,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
    writeAtomic(metadataPath(filePath), Buffer.from(stableJson(metadata), "utf8"));
    return { status: "failed", filePath, bytes: null, metadata, requestAttempts: fetchOptions.maxAttempts };
  }
}

async function mapLimit(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), Math.max(1, items.length)) }, worker));
  return results;
}

function flattenSchedule(payload) {
  const scheduleEntries = (payload?.dates ?? []).flatMap((block) => (block?.games ?? []).map((game) => ({
    scheduleDate: block?.date ?? null,
    game,
  })))
    .filter(({ game }) => game?.gameType === "R" && Number.isFinite(Number(game?.gamePk)))
    .map(({ scheduleDate, game }) => ({
      gameId: Number(game.gamePk),
      scheduleDate,
      officialDate: game.officialDate ?? (String(game.gameDate ?? "").slice(0, 10) || null),
      gameDate: game.gameDate ?? null,
      status: game?.status?.detailedState ?? game?.status?.abstractGameState ?? null,
      codedGameState: game?.status?.codedGameState ?? null,
      // A postponed entry can later report abstractGameState=Final after its
      // rescheduled game finishes. Only the concrete final code establishes
      // that this schedule entry itself is a completed outcome.
      isFinal: game?.status?.codedGameState === "F",
      awayTeamId: Number(game?.teams?.away?.team?.id) || null,
      awayTeam: game?.teams?.away?.team?.name ?? null,
      homeTeamId: Number(game?.teams?.home?.team?.id) || null,
      homeTeam: game?.teams?.home?.team?.name ?? null,
      venueId: Number(game?.venue?.id) || null,
      venue: game?.venue?.name ?? null,
      doubleHeader: game?.doubleHeader ?? "N",
      gameNumber: Number(game?.gameNumber) || 1,
    }))
    .sort((a, b) => (a.scheduleDate ?? "").localeCompare(b.scheduleDate ?? "")
      || (a.gameDate ?? "").localeCompare(b.gameDate ?? "")
      || a.gameId - b.gameId);
  const byGameId = new Map();
  const duplicateGameIds = [];
  for (const game of scheduleEntries) {
    const existing = byGameId.get(game.gameId);
    if (existing) {
      duplicateGameIds.push(game.gameId);
      // Prefer the concrete completed entry over a postponement/reference.
      // Otherwise retain the first source entry in deterministic source order.
      if (!existing.isFinal && game.isFinal) byGameId.set(game.gameId, game);
    } else byGameId.set(game.gameId, game);
  }
  const games = [...byGameId.values()]
    .sort((a, b) => a.officialDate.localeCompare(b.officialDate) || a.gameId - b.gameId);
  return {
    scheduleEntries,
    games,
    duplicateGameIds: [...new Set(duplicateGameIds)].sort((a, b) => a - b),
  };
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function starterRowsForTeam(teamSide, teamId, teamName, side) {
  const rows = [];
  for (const player of Object.values(teamSide?.players ?? {})) {
    const pitching = player?.stats?.pitching;
    if (finite(pitching?.gamesStarted) !== 1) continue;
    rows.push({
      pitcherId: finite(player?.person?.id),
      pitcherName: player?.person?.fullName ?? null,
      pitcherHand: player?.person?.pitchHand?.code ?? null,
      teamId,
      team: teamName,
      side,
      actualStrikeouts: finite(pitching?.strikeOuts ?? pitching?.strikeouts),
      actualBattersFaced: finite(pitching?.battersFaced),
      actualInnings: pitching?.inningsPitched == null ? null : String(pitching.inningsPitched),
      actualPitchCount: finite(pitching?.numberOfPitches ?? pitching?.pitchesThrown),
      actualWalks: finite(pitching?.baseOnBalls ?? pitching?.walks),
      actualHits: finite(pitching?.hits),
    });
  }
  return rows.sort((a, b) => (a.pitcherId ?? Number.MAX_SAFE_INTEGER) - (b.pitcherId ?? Number.MAX_SAFE_INTEGER));
}

function normalizeBoxscore(game, boxscore) {
  const away = boxscore?.teams?.away ?? {};
  const home = boxscore?.teams?.home ?? {};
  return {
    ...game,
    teamBattingTotals: {
      away: away?.teamStats?.batting ?? null,
      home: home?.teamStats?.batting ?? null,
    },
    startingPitchers: [
      ...starterRowsForTeam(away, game.awayTeamId, game.awayTeam, "away"),
      ...starterRowsForTeam(home, game.homeTeamId, game.homeTeam, "home"),
    ],
  };
}

function chunk(values, size) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

function directorySize(directory) {
  if (!existsSync(directory)) return 0;
  return readdirSync(directory, { withFileTypes: true }).reduce((sum, entry) => {
    const entryPath = path.join(directory, entry.name);
    return sum + (entry.isDirectory() ? directorySize(entryPath) : statSync(entryPath).size);
  }, 0);
}

function countMissing(starters) {
  const fields = ["pitcherId", "pitcherName", "pitcherHand", "actualStrikeouts", "actualBattersFaced", "actualInnings", "actualPitchCount", "actualWalks", "actualHits"];
  return Object.fromEntries(fields.map((field) => [field, starters.filter((row) => row[field] === null || row[field] === undefined || row[field] === "").length]));
}

export async function acquireMlbKHistoryStatsApi({
  startDate,
  endDate,
  outputRoot,
  concurrency = 3,
  timeoutMs = 15_000,
  maxAttempts = 3,
  backoffMs = 250,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
} = {}) {
  const startedAtMs = Date.now();
  const start = assertDate(startDate, "startDate");
  const end = assertDate(endDate, "endDate");
  if (end < start) throw new Error("endDate must not precede startDate");
  if (start.slice(0, 4) !== end.slice(0, 4)) throw new Error("Pilot date range must stay within one season");
  if (!outputRoot) throw new Error("outputRoot is required");
  const season = Number(start.slice(0, 4));
  const requestedDateRange = { startDate: start, endDate: end };
  const runDirectory = path.join(outputRoot, String(season), `${start}_to_${end}`);
  const retrievalTimestamp = now().toISOString();
  let totalRequests = 0;
  const fetchOptions = {
    fetchImpl,
    timeoutMs,
    maxAttempts,
    backoffMs,
    onAttempt: () => { totalRequests += 1; },
  };

  const scheduleUrl = `${MLB_STATS_API}/schedule?sportId=1&gameType=R&startDate=${start}&endDate=${end}&hydrate=team,venue`;
  const scheduleResource = await acquireJsonResource({
    filePath: path.join(runDirectory, "schedule.json"),
    url: scheduleUrl,
    requestedDateRange,
    retrievalTimestamp,
    fetchOptions,
    resourceType: "regular-season-schedule",
  });
  if (!scheduleResource.bytes) {
    const failure = {
      schemaVersion: MLB_K_HISTORY_STATSAPI_SCHEMA_VERSION,
      provider: "MLB StatsAPI",
      requestedDateRange,
      retrievalTimestamp,
      status: "failed",
      sourceUrl: sanitizeUrl(scheduleUrl),
      byteCount: 0,
      sha256: null,
      gameCount: 0,
      failedRequests: [scheduleResource.metadata],
      totalRequests,
      elapsedMilliseconds: Date.now() - startedAtMs,
      totalStorageBytes: directorySize(runDirectory),
    };
    const failureManifestPath = path.join(runDirectory, "manifest.json");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      writeAtomic(failureManifestPath, Buffer.from(stableJson(failure), "utf8"));
      const measured = directorySize(runDirectory);
      if (failure.totalStorageBytes === measured) break;
      failure.totalStorageBytes = measured;
    }
    return failure;
  }

  const { scheduleEntries, games, duplicateGameIds } = flattenSchedule(JSON.parse(scheduleResource.bytes.toString("utf8")));
  if (scheduleResource.metadata.gameCount !== scheduleEntries.length) {
    scheduleResource.metadata.gameCount = scheduleEntries.length;
    writeAtomic(metadataPath(scheduleResource.filePath), Buffer.from(stableJson(scheduleResource.metadata), "utf8"));
  }
  const completedScheduleEntries = scheduleEntries.filter((game) => game.isFinal);
  const completedGames = games.filter((game) => game.isFinal);
  const boxscoreResources = await mapLimit(completedGames, concurrency, async (game) => {
    const url = `${MLB_STATS_API}/game/${game.gameId}/boxscore`;
    const resource = await acquireJsonResource({
      filePath: path.join(runDirectory, "boxscores", `${game.gameId}.json`),
      url,
      requestedDateRange,
      retrievalTimestamp,
      fetchOptions,
      resourceType: "game-boxscore",
    });
    return { game, resource };
  });

  const normalizedGames = boxscoreResources
    .filter(({ resource }) => resource.bytes)
    .map(({ game, resource }) => normalizeBoxscore(game, JSON.parse(resource.bytes.toString("utf8"))))
    .sort((a, b) => a.officialDate.localeCompare(b.officialDate) || a.gameId - b.gameId);
  const starterIds = [...new Set(normalizedGames.flatMap((game) => game.startingPitchers.map((row) => row.pitcherId)).filter(Number.isFinite))].sort((a, b) => a - b);
  const peopleDirectory = path.join(runDirectory, "people");
  const cachedPeopleResources = verifiedCachedPeopleResources(peopleDirectory, requestedDateRange);
  const cachedPeopleIds = new Set(cachedPeopleResources.flatMap((resource) => {
    const payload = JSON.parse(resource.bytes.toString("utf8"));
    return (payload?.people ?? []).map((person) => finite(person?.id)).filter((id) => id != null);
  }));
  const missingStarterIds = starterIds.filter((id) => !cachedPeopleIds.has(id));
  const acquiredPeopleResources = await mapLimit(chunk(missingStarterIds, 50), Math.min(2, concurrency), async (ids) => {
    const url = `${MLB_STATS_API}/people?personIds=${ids.join(",")}`;
    return acquireJsonResource({
      filePath: path.join(peopleDirectory, `starting-pitchers-${sha256(Buffer.from(ids.join(","), "utf8")).slice(0, 16)}.json`),
      url,
      requestedDateRange,
      retrievalTimestamp,
      fetchOptions,
      resourceType: "starting-pitcher-metadata",
    });
  });
  const peopleResources = [...cachedPeopleResources, ...acquiredPeopleResources];
  const people = new Map(peopleResources.filter((resource) => resource.bytes).flatMap((resource) => {
    const payload = JSON.parse(resource.bytes.toString("utf8"));
    return (payload?.people ?? []).map((person) => [finite(person?.id), person]);
  }).filter(([id]) => id != null));
  for (const game of normalizedGames) {
    for (const starter of game.startingPitchers) {
      const person = people.get(starter.pitcherId);
      starter.pitcherName ??= person?.fullName ?? null;
      starter.pitcherHand ??= person?.pitchHand?.code ?? null;
    }
  }

  const normalized = {
    schemaVersion: MLB_K_HISTORY_STATSAPI_SCHEMA_VERSION,
    provider: "MLB StatsAPI",
    requestedDateRange,
    games: normalizedGames,
  };
  const normalizedPath = path.join(runDirectory, "normalized-outcomes.json");
  const normalizedBytes = Buffer.from(stableJson(normalized), "utf8");
  writeAtomic(normalizedPath, normalizedBytes);
  writeAtomic(metadataPath(normalizedPath), Buffer.from(stableJson({
    schemaVersion: MLB_K_HISTORY_STATSAPI_SCHEMA_VERSION,
    provider: "MLB StatsAPI",
    resourceType: "deterministic-normalized-outcomes",
    sourceUrl: sanitizeUrl(scheduleUrl),
    retrievalTimestamp,
    requestedDateRange,
    byteCount: normalizedBytes.length,
    sha256: sha256(normalizedBytes),
    gameCount: normalizedGames.length,
    status: "complete",
  }), "utf8"));

  const starters = normalizedGames.flatMap((game) => game.startingPitchers.map((starter) => ({ gameId: game.gameId, gameDate: game.officialDate, ...starter })));
  const failedResources = [scheduleResource, ...boxscoreResources.map(({ resource }) => resource), ...peopleResources]
    .filter((resource) => resource.status === "failed");
  const completeBoxscores = boxscoreResources.filter(({ resource }) => resource.bytes).length;
  const rowsWithCoreOutcomes = starters.filter((row) => row.actualStrikeouts != null
    && row.actualBattersFaced != null && row.actualInnings != null && row.actualPitchCount != null).length;
  const manifest = {
    schemaVersion: MLB_K_HISTORY_STATSAPI_SCHEMA_VERSION,
    provider: "MLB StatsAPI",
    retrievalTimestamp,
    requestedDateRange,
    sourceUrl: sanitizeUrl(scheduleUrl),
    byteCount: normalizedBytes.length,
    sha256: sha256(normalizedBytes),
    gameCount: normalizedGames.length,
    status: failedResources.length || completeBoxscores !== completedGames.length ? "partial" : "complete",
    scheduledGameCount: scheduleEntries.length,
    uniqueScheduledGameCount: games.length,
    completedGameCount: completedScheduleEntries.length,
    uniqueCompletedGameCount: completedGames.length,
    boxscoresAcquired: completeBoxscores,
    uniqueStartingPitchers: starterIds.length,
    startingPitcherRows: starters.length,
    rowsWithActualK_BF_IP_PitchCount: rowsWithCoreOutcomes,
    missingFields: countMissing(starters),
    postponedGames: [...new Set(scheduleEntries.filter((game) => /postpon|suspend|cancel/i.test(game.status ?? "")).map((game) => game.gameId))],
    doubleheaderGames: [...new Set(scheduleEntries.filter((game) => game.doubleHeader !== "N" || game.gameNumber > 1).map((game) => game.gameId))],
    duplicateGameIds,
    failedRequests: failedResources.map((resource) => ({
      resourceType: resource.metadata.resourceType,
      sourceUrl: resource.metadata.sourceUrl,
      error: resource.metadata.error,
    })),
    totalRequests,
    skippedVerifiedFiles: [scheduleResource, ...boxscoreResources.map(({ resource }) => resource), ...peopleResources]
      .filter((resource) => resource.status === "skipped_verified").length,
    elapsedMilliseconds: Date.now() - startedAtMs,
    totalStorageBytes: 0,
    resources: [scheduleResource, ...boxscoreResources.map(({ resource }) => resource), ...peopleResources].map((resource) => ({
      resourceType: resource.metadata.resourceType,
      sourceUrl: resource.metadata.sourceUrl,
      status: resource.status,
      byteCount: resource.metadata.byteCount,
      sha256: resource.metadata.sha256,
    })),
  };
  const manifestPath = path.join(runDirectory, "manifest.json");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    writeAtomic(manifestPath, Buffer.from(stableJson(manifest), "utf8"));
    const measured = directorySize(runDirectory);
    if (manifest.totalStorageBytes === measured) break;
    manifest.totalStorageBytes = measured;
  }
  return { ...manifest, runDirectory };
}
