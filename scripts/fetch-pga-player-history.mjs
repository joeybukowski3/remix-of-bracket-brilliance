import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "pga");
const STATS_PATH = path.join(DATA_DIR, "player-stats-raw.json");
const HISTORY_PATH = path.join(DATA_DIR, "player-history.json");
const MAJOR_HISTORY_PATH = path.join(DATA_DIR, "major-history.json");
const GRAPHQL_URL = "https://orchestrator.pgatour.com/graphql";
const TOUR_CODE = "R";
const CURRENT_YEAR = Number(process.env.PGA_HISTORY_DIRECTORY_YEAR || new Date().getFullYear());
const START_YEAR = Number(process.env.PGA_HISTORY_START_YEAR || 2016);
const PLAYER_LIMIT = Number(process.env.PGA_HISTORY_PLAYER_LIMIT || 0);
const DEFAULT_API_KEY = "da2-gsrx5bibzbb4njvhI7t37wqyl4";
const API_KEY = process.env.PGA_API_KEY || process.env.PGA_TOUR_GQL_API_KEY || DEFAULT_API_KEY;

const PLAYER_DIRECTORY_QUERY = `
query PlayerDirectory($tourCode: TourCode!, $statId: String!, $year: Int!) {
  statDetails(tourCode: $tourCode, statId: $statId, year: $year) {
    rows {
      ... on StatDetailsPlayer {
        playerId
        playerName
      }
    }
  }
}`;

const PLAYER_HISTORY_QUERY = `
query PlayerTournamentHistory($playerId: ID!, $tourCode: TourCode) {
  playerProfileTournamentResults(playerId: $playerId, tourCode: $tourCode) {
    tournaments {
      tournamentNum
      tournaments {
        tournamentId
        tournamentName
        courseName
        date
        year
        position
        roundScores {
          roundNum
          roundScore
        }
        total
        toPar
      }
    }
  }
}`;

async function postGraphql(query, variables) {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "x-pgat-platform": "web",
      Referer: "https://www.pgatour.com/",
      Origin: "https://www.pgatour.com",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`PGA Tour GraphQL HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }

  return payload.data ?? {};
}

async function fetchPlayerDirectory() {
  const data = await postGraphql(PLAYER_DIRECTORY_QUERY, {
    tourCode: TOUR_CODE,
    statId: "02675",
    year: CURRENT_YEAR,
  });

  return (data?.statDetails?.rows ?? [])
    .filter((row) => row?.playerId && row?.playerName)
    .map((row) => ({
      playerId: String(row.playerId),
      player: String(row.playerName),
    }));
}

async function fetchPlayerHistory(playerId) {
  const data = await postGraphql(PLAYER_HISTORY_QUERY, {
    playerId,
    tourCode: TOUR_CODE,
  });

  const sections = data?.playerProfileTournamentResults?.tournaments ?? [];
  const tournaments = sections.flatMap((section) => section?.tournaments ?? []);
  const seen = new Set();

  return tournaments
    .filter((event) => {
      const id = String(event?.tournamentId ?? "");
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return Number(event?.year ?? 0) >= START_YEAR;
    })
    .map(normalizeTournamentResult)
    .filter(Boolean)
    .sort(sortNewestFirst);
}

function normalizeTournamentResult(event) {
  const parsedFinish = parseFinish(event?.position);
  if (!parsedFinish) return null;

  const eventName = String(event?.tournamentName ?? "").trim();
  const season = Number(event?.year ?? 0) || null;
  const eventDate = normalizeDate(event?.date, season);
  const roundScores = Object.fromEntries(
    (event?.roundScores ?? []).map((round) => [Number(round.roundNum), numericOrNull(round.roundScore)]),
  );

  return {
    season,
    eventId: String(event?.tournamentId ?? "") || null,
    eventSlug: slugifyEvent(eventName),
    eventName,
    courseName: String(event?.courseName ?? "").trim() || null,
    eventDate,
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

function parseFinish(value) {
  let finishText = String(value ?? "").trim().toUpperCase();
  if (!finishText || finishText === "-") return null;
  if (finishText === "CUT" || finishText === "MDF") finishText = "MC";
  if (finishText === "W/D") finishText = "WD";

  if (finishText === "MC") {
    return { finishText, finishPosition: null, madeCut: false, status: "missed_cut" };
  }
  if (finishText === "WD") {
    return { finishText, finishPosition: null, madeCut: false, status: "withdrawn" };
  }
  if (finishText === "DQ") {
    return { finishText, finishPosition: null, madeCut: false, status: "disqualified" };
  }

  const positionMatch = finishText.match(/(\d+)/);
  if (!positionMatch) return null;
  return {
    finishText,
    finishPosition: Number(positionMatch[1]),
    madeCut: true,
    status: "finished",
  };
}

function buildEventHistory(results) {
  const history = {};
  for (const result of results) {
    if (!result.eventSlug) continue;
    if (!history[result.eventSlug]) history[result.eventSlug] = [];
    history[result.eventSlug].push(result);
  }
  return history;
}

function readLocalStats() {
  try {
    return JSON.parse(readFileSync(STATS_PATH, "utf8"));
  } catch {
    return [];
  }
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function slugifyEvent(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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
  if (parts) {
    return `${parts[3]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return season ? `${season}-01-01` : null;
}

function sortNewestFirst(left, right) {
  const dateCompare = String(right.eventDate ?? "").localeCompare(String(left.eventDate ?? ""));
  if (dateCompare !== 0) return dateCompare;
  return Number(right.season ?? 0) - Number(left.season ?? 0);
}

function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function main() {
  console.log(`[pga-history] Building player directory for ${CURRENT_YEAR}...`);
  const directory = await fetchPlayerDirectory();
  const localStats = readLocalStats();
  const statsByName = new Map(localStats.map((player) => [normalizeName(player.player), player]));
  const selected = PLAYER_LIMIT > 0 ? directory.slice(0, PLAYER_LIMIT) : directory;
  const players = [];
  const majorPlayers = [];
  const errors = [];

  console.log(`[pga-history] Fetching all tournament results since ${START_YEAR} for ${selected.length} players...`);

  for (let index = 0; index < selected.length; index += 1) {
    const directoryPlayer = selected[index];
    try {
      const results = await fetchPlayerHistory(directoryPlayer.playerId);
      const stats = statsByName.get(normalizeName(directoryPlayer.player)) ?? {};
      const majorResults = results.filter((result) => result.majorType != null);

      players.push({
        player: directoryPlayer.player,
        playerId: directoryPlayer.playerId,
        sourcePlayerName: directoryPlayer.player,
        recentResults: results.slice(0, 8),
        eventHistory: buildEventHistory(results),
        stats: {
          sgTotal: stats.sgTotal ?? null,
          sgOTT: stats.sgOTT ?? null,
          sgApp: stats.sgApp ?? null,
          sgAtG: stats.sgAtG ?? null,
          sgPutt: stats.sgPutt ?? null,
          drivingDistance: stats.drivingDistance ?? null,
          drivingAccuracy: stats.drivingAccuracy ?? null,
        },
      });

      majorPlayers.push({
        player: directoryPlayer.player,
        playerId: directoryPlayer.playerId,
        results: majorResults,
      });

      console.log(`[pga-history] ${index + 1}/${selected.length} ${directoryPlayer.player}: ${results.length} starts`);
    } catch (error) {
      const message = `${directoryPlayer.player} (${directoryPlayer.playerId}): ${error instanceof Error ? error.message : String(error)}`;
      console.warn(`[pga-history] ${message}`);
      errors.push(message);
    }

    await new Promise((resolve) => setTimeout(resolve, 125));
  }

  const generatedAt = new Date().toISOString();
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(HISTORY_PATH, JSON.stringify({
    version: 1,
    source: "pga-tour-player-profile-results",
    generatedAt,
    startYear: START_YEAR,
    players,
    errors,
  }, null, 2) + "\n");

  writeFileSync(MAJOR_HISTORY_PATH, JSON.stringify({
    version: 1,
    source: "pga-tour-player-profile-results",
    generatedAt,
    years: Array.from({ length: CURRENT_YEAR - START_YEAR + 1 }, (_, index) => START_YEAR + index),
    players: majorPlayers,
    errors,
  }, null, 2) + "\n");

  console.log(`[pga-history] Wrote ${players.length} player histories to ${HISTORY_PATH}`);
  console.log(`[pga-history] Wrote ${majorPlayers.length} major histories to ${MAJOR_HISTORY_PATH}`);
  if (errors.length) console.log(`[pga-history] Completed with ${errors.length} player errors.`);
}

main().catch((error) => {
  console.error(`[pga-history] Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
