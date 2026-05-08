import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const RAW_OUTPUT_PATH = path.join(DATA_DIR, "hr-props-raw.json");
const BEST_BETS_OUTPUT_PATH = path.join(DATA_DIR, "hr-props-best-bets.json");
const FORCE = process.argv.includes("--force");
const MIN_GENERATION_HOUR_ET = 10;
const GROK_API_URL = "https://api.x.ai/v1/chat/completions";
const GROK_MODEL = "grok-4-1-fast-non-reasoning";
const SEASON = new Date().getFullYear();
const PICK_LIMITS = {
  bestBets: 5,
  valueBets: 3,
  longshots: 2,
};

const DEFAULT_PARK_FACTORS = {
  "Coors Field": 1.4,
  "Great American Ball Park": 1.25,
  "Citizens Bank Park": 1.2,
  "Yankee Stadium": 1.18,
  "Fenway Park": 1.12,
  "Oracle Park": 0.82,
  "Petco Park": 0.85,
  "Marlins Park": 0.88,
  "loanDepot park": 0.88,
};

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getTodayEt() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getCurrentEtHour() {
  const hourText = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    hour12: false,
  }).format(new Date());
  return Number(hourText);
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/gi, "")
    .replace(/[^a-z0-9\s'-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeTeamCode(value) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toFiniteNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pickKey(value) {
  return `${normalizeName(value.player)}|${normalizeTeamCode(value.team)}|${normalizeTeamCode(value.opponent)}`;
}

function parseInningsPitched(value) {
  if (value == null) return null;
  const [whole, partial = "0"] = String(value).split(".");
  const outs = Number(whole) * 3 + Number(partial);
  return Number.isFinite(outs) ? outs / 3 : null;
}

function computeHr9(homeRuns, inningsPitched) {
  const innings = parseInningsPitched(inningsPitched);
  const hr = Number(homeRuns);
  if (!Number.isFinite(innings) || innings <= 0 || !Number.isFinite(hr)) return null;
  return (hr * 9) / innings;
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function average(values) {
  const filtered = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  return filtered.length ? filtered.reduce((sum, value) => sum + value, 0) / filtered.length : null;
}

function parkFactorForVenue(venue) {
  return DEFAULT_PARK_FACTORS[venue] ?? 1;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed ${response.status} for ${url}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed ${response.status} for ${url}`);
  return response.text();
}

async function loadSchedule() {
  const date = getTodayEt();
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=team,linescore,probablePitcher`;
  const json = await fetchJson(url);
  const games = json?.dates?.[0]?.games ?? [];
  return games.map((game) => ({
    gamePk: game.gamePk,
    gameDate: game.gameDate,
    venue: game.venue?.name ?? "Unknown Venue",
    away: {
      id: game?.teams?.away?.team?.id ?? null,
      abbreviation: game?.teams?.away?.team?.abbreviation ?? "AWY",
      name: game?.teams?.away?.team?.name ?? "Away",
      probablePitcher: game?.teams?.away?.probablePitcher ?? null,
    },
    home: {
      id: game?.teams?.home?.team?.id ?? null,
      abbreviation: game?.teams?.home?.team?.abbreviation ?? "HME",
      name: game?.teams?.home?.team?.name ?? "Home",
      probablePitcher: game?.teams?.home?.probablePitcher ?? null,
    },
  }));
}

async function fetchBoxscore(gamePk) {
  return fetchJson(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`);
}

function extractLineupFromTeamBox(boxTeam) {
  if (!boxTeam) return [];
  const order = Array.isArray(boxTeam.battingOrder) ? boxTeam.battingOrder : [];
  const players = boxTeam.players || {};
  const lineup = [];

  if (order.length) {
    for (const playerRef of order) {
      const id = Number(String(playerRef).replace(/..$/, ""));
      const player = players[`ID${id}`];
      if (player) lineup.push(player.person);
      if (lineup.length === 9) break;
    }
  }

  if (lineup.length < 9) {
    const fallback = Object.values(players)
      .filter((player) => player?.battingOrder)
      .sort((a, b) => String(a.battingOrder).localeCompare(String(b.battingOrder)))
      .map((player) => player.person);

    for (const person of fallback) {
      if (!lineup.some((item) => item.id === person.id)) lineup.push(person);
      if (lineup.length === 9) break;
    }
  }

  return lineup.slice(0, 9);
}

async function fetchTeamSeasonSchedule(teamId) {
  if (!teamId) return [];
  const json = await fetchJson(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=${SEASON}&teamId=${teamId}&hydrate=linescore`);
  return (json?.dates || []).flatMap((dateBlock) => dateBlock.games || []);
}

async function fetchLastKnownLineup(teamId) {
  if (!teamId) return [];
  const games = await fetchTeamSeasonSchedule(teamId);
  const latestComplete = games
    .filter((game) => game?.status?.codedGameState === "F" || game?.status?.detailedState === "Final")
    .sort((a, b) => new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime())[0];

  if (!latestComplete?.gamePk) return [];
  const boxscore = await fetchBoxscore(latestComplete.gamePk);
  const teamSide = boxscore?.teams?.home?.team?.id === teamId ? boxscore?.teams?.home : boxscore?.teams?.away;
  return extractLineupFromTeamBox(teamSide);
}

const personCache = new Map();
async function fetchPerson(id) {
  if (!id) return null;
  if (personCache.has(id)) return personCache.get(id);
  const json = await fetchJson(`https://statsapi.mlb.com/api/v1/people/${id}`);
  const person = json?.people?.[0] ?? null;
  personCache.set(id, person);
  return person;
}

const pitcherSeasonCache = new Map();
async function fetchPitcherSeasonStats(id) {
  if (!id) return null;
  if (pitcherSeasonCache.has(id)) return pitcherSeasonCache.get(id);
  const json = await fetchJson(`https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=season&season=${SEASON}&group=pitching`);
  const stats = json?.stats?.[0]?.splits?.[0]?.stat ?? null;
  pitcherSeasonCache.set(id, stats);
  return stats;
}

const batterSeasonCache = new Map();
async function fetchBatterSeasonStats(id) {
  if (!id) return null;
  if (batterSeasonCache.has(id)) return batterSeasonCache.get(id);
  const json = await fetchJson(`https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=season&season=${SEASON}&group=hitting`);
  const stats = json?.stats?.[0]?.splits?.[0]?.stat ?? null;
  batterSeasonCache.set(id, stats);
  return stats;
}

const gameLogCache = new Map();
async function fetchBatterHrGameLog(id) {
  if (!id) return [];
  if (gameLogCache.has(id)) return gameLogCache.get(id);
  const json = await fetchJson(`https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=gameLog&season=${SEASON}&group=hitting`);
  const splits = json?.stats?.[0]?.splits ?? [];
  const rows = splits.map((split) => ({
    date: split.date,
    homeRuns: safeNumber(split.stat?.homeRuns, 0),
  }));
  gameLogCache.set(id, rows);
  return rows;
}

function sumRecentHomeRuns(gameLogs, days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return gameLogs.reduce((sum, row) => {
    const date = new Date(row.date);
    if (Number.isNaN(date.getTime()) || date < cutoff) return sum;
    return sum + safeNumber(row.homeRuns, 0);
  }, 0);
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((value) => value.replace(/^"|"$/g, "").trim());
  return lines.slice(1).map((line) => {
    const values = [];
    let current = "";
    let inQuotes = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === "\"") {
        if (inQuotes && line[index + 1] === "\"") {
          current += "\"";
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (char === "," && !inQuotes) {
        values.push(current);
        current = "";
        continue;
      }
      current += char;
    }
    values.push(current);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

async function fetchStatcastBatterMap() {
  const url = `https://baseballsavant.mlb.com/leaderboard/custom?year=${SEASON}&type=batter&filter=&min=1&selections=player_id,player_name,barrel_batted_rate,hard_hit_percent,exit_velocity_avg,isolated_power,pull_percent&sort=barrel_batted_rate&sortDir=desc&chart=false&csv=true`;
  try {
    const text = await fetchText(url);
    if (!text || text.startsWith("<!DOCTYPE")) return new Map();
    const rows = parseCsv(text);
    return new Map(rows.map((row) => [String(row.player_id), row]));
  } catch {
    return new Map();
  }
}

async function fetchStatcastPitcherMap() {
  const url = `https://baseballsavant.mlb.com/leaderboard/custom?year=${SEASON}&type=pitcher&filter=&min=1&selections=player_id,player_name,hard_hit_percent,exit_velocity_avg&sort=hard_hit_percent&sortDir=desc&chart=false&csv=true`;
  try {
    const text = await fetchText(url);
    if (!text || text.startsWith("<!DOCTYPE")) return new Map();
    const rows = parseCsv(text);
    return new Map(rows.map((row) => [String(row.player_id), row]));
  } catch {
    return new Map();
  }
}

function normalizeMetric(values, value) {
  const filtered = values.filter((entry) => Number.isFinite(entry));
  if (!filtered.length || !Number.isFinite(value)) return 50;
  const min = Math.min(...filtered);
  const max = Math.max(...filtered);
  if (max === min) return 50;
  return ((value - min) / (max - min)) * 100;
}

function formatTopStats(player) {
  const stats = [
    { label: "Barrel%", value: player.barrelRate },
    { label: "Hard Hit%", value: player.hardHitRate },
    { label: "EV", value: player.exitVelo },
    { label: "ISO", value: player.iso },
    { label: "Last 7 HR", value: player.last7HR },
  ];
  return stats
    .sort((left, right) => safeNumber(right.value) - safeNumber(left.value))
    .slice(0, 2)
    .map((entry) => `${entry.label}=${Number(entry.value).toFixed(entry.label === "EV" ? 1 : 1)}`);
}

function validateRawRows(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("Generated zero HR prop rows. Existing files were preserved.");
  }

  const validated = rows.map((row) => {
    if (!isPlainObject(row)) {
      throw new Error("Generated HR prop payload contains a non-object row.");
    }

    const normalized = {
      player: normalizeText(row.player),
      team: normalizeTeamCode(row.team),
      opponent: normalizeTeamCode(row.opponent),
      opposingPitcher: normalizeText(row.opposingPitcher) || "TBD",
      pitcherHand: normalizeText(row.pitcherHand) || "R",
      ballpark: normalizeText(row.ballpark) || "Unknown Venue",
      parkFactor: toFiniteNumber(row.parkFactor),
      barrelRate: toFiniteNumber(row.barrelRate),
      hardHitRate: toFiniteNumber(row.hardHitRate),
      exitVelo: toFiniteNumber(row.exitVelo),
      iso: toFiniteNumber(row.iso),
      hrFBRatio: toFiniteNumber(row.hrFBRatio),
      pullRate: toFiniteNumber(row.pullRate),
      last7HR: toFiniteNumber(row.last7HR),
      last30HR: toFiniteNumber(row.last30HR),
      hrScore: toFiniteNumber(row.hrScore),
      hrScoreRank: toFiniteNumber(row.hrScoreRank),
    };

    if (!normalized.player || !normalized.team || !normalized.opponent) {
      throw new Error(`Generated HR prop row is missing identity fields: ${JSON.stringify(row)}`);
    }

    const requiredNumbers = [
      normalized.parkFactor,
      normalized.barrelRate,
      normalized.hardHitRate,
      normalized.exitVelo,
      normalized.iso,
      normalized.hrFBRatio,
      normalized.pullRate,
      normalized.last7HR,
      normalized.last30HR,
      normalized.hrScore,
      normalized.hrScoreRank,
    ];

    if (requiredNumbers.some((value) => value == null)) {
      throw new Error(`Generated HR prop row has invalid numeric fields for ${normalized.player}.`);
    }

    return normalized;
  });

  return validated;
}

function toStringList(value, limit = 2) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeText(entry))
    .filter(Boolean)
    .slice(0, limit);
}

function buildFallbackBullets(player) {
  return [
    `HR score ${player.hrScore.toFixed(1)} (#${player.hrScoreRank})`,
    `Park ${player.parkFactor.toFixed(2)} vs ${player.opposingPitcher}${player.pitcherHand ? ` (${player.pitcherHand})` : ""}`,
  ];
}

function buildFallbackPick(player) {
  return {
    player: player.player,
    team: player.team,
    opponent: player.opponent,
    opposingPitcher: player.opposingPitcher,
    hrScoreRank: player.hrScoreRank,
    topStats: formatTopStats(player),
    bullets: buildFallbackBullets(player),
  };
}

function createRowLookups(rows) {
  const byExact = new Map();
  const byPlayerTeam = new Map();

  for (const row of rows) {
    byExact.set(pickKey(row), row);
    const playerTeamKey = `${normalizeName(row.player)}|${row.team}`;
    const existing = byPlayerTeam.get(playerTeamKey);
    if (!existing) {
      byPlayerTeam.set(playerTeamKey, row);
    } else {
      byPlayerTeam.set(playerTeamKey, null);
    }
  }

  return { byExact, byPlayerTeam };
}

function normalizePickCandidate(candidate, lookups) {
  if (!isPlainObject(candidate)) return null;

  const player = normalizeText(candidate.player);
  const team = normalizeTeamCode(candidate.team);
  const candidateOpponent = normalizeTeamCode(candidate.opponent ?? candidate.opp);
  const exactKey = `${normalizeName(player)}|${team}|${candidateOpponent}`;
  const playerTeamKey = `${normalizeName(player)}|${team}`;
  const matchedRow = lookups.byExact.get(exactKey) ?? lookups.byPlayerTeam.get(playerTeamKey) ?? null;

  if (!matchedRow) return null;

  return {
    player: matchedRow.player,
    team: matchedRow.team,
    opponent: matchedRow.opponent,
    opposingPitcher: matchedRow.opposingPitcher,
    hrScoreRank: matchedRow.hrScoreRank,
    topStats: toStringList(candidate.topStats).length ? toStringList(candidate.topStats) : formatTopStats(matchedRow),
    bullets: toStringList(candidate.bullets).length ? toStringList(candidate.bullets) : buildFallbackBullets(matchedRow),
  };
}

function buildFallbackSections(rows) {
  return {
    bestBets: rows.slice(0, PICK_LIMITS.bestBets).map(buildFallbackPick),
    valueBets: rows.slice(PICK_LIMITS.bestBets, PICK_LIMITS.bestBets + PICK_LIMITS.valueBets).map(buildFallbackPick),
    longshots: rows
      .slice(PICK_LIMITS.bestBets + PICK_LIMITS.valueBets, PICK_LIMITS.bestBets + PICK_LIMITS.valueBets + PICK_LIMITS.longshots)
      .map(buildFallbackPick),
  };
}

function mergePickSection(sectionName, sourceValue, fallbackPicks, lookups) {
  const limit = PICK_LIMITS[sectionName];
  const picks = Array.isArray(sourceValue)
    ? sourceValue.map((entry) => normalizePickCandidate(entry, lookups)).filter(Boolean)
    : [];
  const merged = [];
  const seen = new Set();

  for (const pick of picks) {
    const key = pickKey(pick);
    if (seen.has(key)) continue;
    merged.push(pick);
    seen.add(key);
    if (merged.length === limit) break;
  }

  for (const pick of fallbackPicks) {
    const key = pickKey(pick);
    if (seen.has(key)) continue;
    merged.push(pick);
    seen.add(key);
    if (merged.length === limit) break;
  }

  if (merged.length < limit) {
    console.warn(`MLB HR props ${sectionName} only produced ${merged.length}/${limit} validated picks.`);
  }

  return merged;
}

function buildFallbackSlatePreview(rows) {
  const featuredParks = Array.from(new Set(rows.slice(0, 8).map((row) => row.ballpark))).slice(0, 3);
  return {
    slateOverview: rows.length
      ? `Model ranked ${rows.length} hitters for today's slate. The strongest park environments in the top of the board are ${featuredParks.join(", ")}.`
      : "No validated HR prop rows were available for today's slate.",
    modelNote: "When AI commentary is unavailable, picks fall back to the model's top-ranked hitters using barrel rate, hard-hit rate, exit velocity, park factor, pitcher HR/9, and recent HR form.",
  };
}

function normalizeSlatePreview(value, fallbackPreview) {
  if (!isPlainObject(value)) return fallbackPreview;
  const slateOverview = normalizeText(value.slateOverview);
  const modelNote = normalizeText(value.modelNote);
  if (!slateOverview || !modelNote) return fallbackPreview;
  return { slateOverview, modelNote };
}

function buildBestBetsPayload(rows, picksResult, previewResult) {
  const fallbackSections = buildFallbackSections(rows);
  const lookups = createRowLookups(rows);
  return {
    date: getTodayEt(),
    generatedAt: new Date().toISOString(),
    slatePreview: normalizeSlatePreview(previewResult, buildFallbackSlatePreview(rows)),
    bestBets: mergePickSection("bestBets", picksResult?.bestBets, fallbackSections.bestBets, lookups),
    valueBets: mergePickSection("valueBets", picksResult?.valueBets, fallbackSections.valueBets, lookups),
    longshots: mergePickSection("longshots", picksResult?.longshots, fallbackSections.longshots, lookups),
  };
}

function extractMessageContent(rawContent) {
  if (typeof rawContent === "string") return rawContent;
  if (Array.isArray(rawContent)) {
    return rawContent.map((item) => (typeof item === "string" ? item : item?.text ?? "")).join("").trim();
  }
  return "";
}

function cleanJsonText(rawText) {
  return rawText.replace(/```json\n?/gi, "").replace(/```\n?/gi, "").trim();
}

function extractJsonSnippet(text) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const firstArray = trimmed.indexOf("[");
  const firstObject = trimmed.indexOf("{");
  const firstIndex = [firstArray, firstObject].filter((value) => value >= 0).sort((left, right) => left - right)[0];
  if (firstIndex === undefined) throw new Error("No JSON opening bracket found in Grok response.");
  const opening = trimmed[firstIndex];
  const closing = opening === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = firstIndex; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === opening) depth += 1;
    if (char === closing) {
      depth -= 1;
      if (depth === 0) return trimmed.slice(firstIndex, index + 1);
    }
  }
  throw new Error("Could not find a complete JSON block in Grok response.");
}

async function callGrokWithRetry(prompt, maxRetries = 3, validate) {
  for (let index = 0; index < maxRetries; index += 1) {
    try {
      const response = await fetch(GROK_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROK_API_KEY || process.env.XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROK_MODEL,
          max_tokens: 8000,
          temperature: 0.2,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await response.json();
      const content = extractMessageContent(data?.choices?.[0]?.message?.content);
      console.log("RAW RESPONSE:", content.slice(0, 300), "...");
      const parsed = JSON.parse(extractJsonSnippet(cleanJsonText(content)));
      if (validate) validate(parsed, content);
      return parsed;
    } catch (error) {
      console.log(`Attempt ${index + 1} failed: ${error instanceof Error ? error.message : error}`);
      if (index < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, index) * 1500));
      } else {
        throw error;
      }
    }
  }
}

function shouldSkip(force) {
  if (force || !existsSync(BEST_BETS_OUTPUT_PATH)) return false;
  try {
    const existing = JSON.parse(readFileSync(BEST_BETS_OUTPUT_PATH, "utf8"));
    return existing?.date === getTodayEt();
  } catch {
    return false;
  }
}

function buildSummary(players, limit) {
  return players.slice(0, limit).map((player) => [
    `player=${player.player}`,
    `team=${player.team}`,
    `opp=${player.opponent}`,
    `pitcher=${player.opposingPitcher}`,
    `pitcherHand=${player.pitcherHand}`,
    `park=${player.ballpark}`,
    `parkFactor=${player.parkFactor}`,
    `barrelRate=${player.barrelRate}`,
    `hardHitRate=${player.hardHitRate}`,
    `exitVelo=${player.exitVelo}`,
    `iso=${player.iso}`,
    `hrFBRatio=${player.hrFBRatio}`,
    `pullRate=${player.pullRate}`,
    `last7HR=${player.last7HR}`,
    `last30HR=${player.last30HR}`,
    `hrScore=${player.hrScore}`,
    `hrScoreRank=${player.hrScoreRank}`,
  ].join(" | ")).join("\n");
}

async function main() {
  ensureDataDir();
  if (!FORCE && getCurrentEtHour() < MIN_GENERATION_HOUR_ET) {
    console.log(`Skipping MLB HR props generation before ${MIN_GENERATION_HOUR_ET}:00 AM ET. Pass --force to override.`);
    return;
  }

  if (shouldSkip(FORCE)) {
    console.log("MLB HR props already generated today. Pass --force to regenerate.");
    return;
  }

  const schedule = await loadSchedule();
  if (!schedule.length) {
    throw new Error("MLB schedule returned zero games for today. Existing HR props files were preserved.");
  }

  const statcastBatters = await fetchStatcastBatterMap();
  const statcastPitchers = await fetchStatcastPitcherMap();
  const batterPool = [];

  for (const game of schedule) {
    const boxscore = await fetchBoxscore(game.gamePk).catch(() => null);
    const currentAwayLineup = extractLineupFromTeamBox(boxscore?.teams?.away);
    const currentHomeLineup = extractLineupFromTeamBox(boxscore?.teams?.home);
    const awayLineup = currentAwayLineup.length ? currentAwayLineup : await fetchLastKnownLineup(game.away.id);
    const homeLineup = currentHomeLineup.length ? currentHomeLineup : await fetchLastKnownLineup(game.home.id);

    const awayPitcherPerson = await fetchPerson(game.away.probablePitcher?.id ?? null);
    const homePitcherPerson = await fetchPerson(game.home.probablePitcher?.id ?? null);
    const awayPitcherStats = await fetchPitcherSeasonStats(game.away.probablePitcher?.id ?? null);
    const homePitcherStats = await fetchPitcherSeasonStats(game.home.probablePitcher?.id ?? null);
    const awayPitcherStatcast = statcastPitchers.get(String(game.away.probablePitcher?.id ?? ""));
    const homePitcherStatcast = statcastPitchers.get(String(game.home.probablePitcher?.id ?? ""));

    const pitcherContexts = [
      {
        lineup: awayLineup,
        battingTeam: game.away,
        opponent: game.home,
        opposingPitcher: game.home.probablePitcher?.fullName ?? "TBD",
        opposingPitcherId: game.home.probablePitcher?.id ?? null,
        pitcherHand: homePitcherPerson?.pitchHand?.code ?? "R",
        pitcherHr9: computeHr9(homePitcherStats?.homeRuns, homePitcherStats?.inningsPitched),
        pitcherHardHitAllowed: safeNumber(homePitcherStatcast?.hard_hit_percent, 37),
        pitcherExitVeloAllowed: safeNumber(homePitcherStatcast?.exit_velocity_avg, 89),
      },
      {
        lineup: homeLineup,
        battingTeam: game.home,
        opponent: game.away,
        opposingPitcher: game.away.probablePitcher?.fullName ?? "TBD",
        opposingPitcherId: game.away.probablePitcher?.id ?? null,
        pitcherHand: awayPitcherPerson?.pitchHand?.code ?? "R",
        pitcherHr9: computeHr9(awayPitcherStats?.homeRuns, awayPitcherStats?.inningsPitched),
        pitcherHardHitAllowed: safeNumber(awayPitcherStatcast?.hard_hit_percent, 37),
        pitcherExitVeloAllowed: safeNumber(awayPitcherStatcast?.exit_velocity_avg, 89),
      },
    ];

    for (const context of pitcherContexts) {
      for (const hitter of context.lineup.slice(0, 9)) {
        const person = await fetchPerson(hitter.id);
        const season = await fetchBatterSeasonStats(hitter.id);
        const gameLogs = await fetchBatterHrGameLog(hitter.id);
        const statcast = statcastBatters.get(String(hitter.id));
        const avg = safeNumber(season?.avg, 0.24);
        const slg = safeNumber(season?.slg, 0.39);
        const iso = Number(Math.max(0, slg - avg).toFixed(3));
        batterPool.push({
          player: hitter.fullName || hitter.name || "Unknown Player",
          team: context.battingTeam.abbreviation,
          opponent: context.opponent.abbreviation,
          opposingPitcher: context.opposingPitcher,
          pitcherHand: context.pitcherHand,
          ballpark: game.venue,
          parkFactor: parkFactorForVenue(game.venue),
          barrelRate: safeNumber(statcast?.barrel_batted_rate, Math.max(4, iso * 55)),
          hardHitRate: safeNumber(statcast?.hard_hit_percent, Math.max(25, slg * 100)),
          exitVelo: safeNumber(statcast?.exit_velocity_avg, 88 + iso * 10),
          iso,
          hrFBRatio: safeNumber(season?.homeRuns && season?.atBats ? (season.homeRuns / Math.max(1, season.atBats)) * 100 : iso * 100, 10),
          pullRate: safeNumber(statcast?.pull_percent, 40),
          last7HR: sumRecentHomeRuns(gameLogs, 7),
          last30HR: sumRecentHomeRuns(gameLogs, 30),
          opposingPitcherHr9: safeNumber(context.pitcherHr9, 1.1),
          opposingPitcherHardHitAllowed: context.pitcherHardHitAllowed,
          opposingPitcherExitVeloAllowed: context.pitcherExitVeloAllowed,
          batterHand: person?.batSide?.code ?? "R",
        });
      }
    }
  }

  const dedupedPool = Array.from(new Map(batterPool.map((player) => [`${normalizeName(player.player)}-${player.team}-${player.opponent}`, player])).values());
  const barrelValues = dedupedPool.map((player) => player.barrelRate);
  const hardHitValues = dedupedPool.map((player) => player.hardHitRate);
  const exitVeloValues = dedupedPool.map((player) => player.exitVelo);
  const pitcherHr9Values = dedupedPool.map((player) => player.opposingPitcherHr9);
  const parkValues = dedupedPool.map((player) => player.parkFactor);
  const pullValues = dedupedPool.map((player) => player.pullRate);
  const recentValues = dedupedPool.map((player) => player.last7HR);

  const scored = dedupedPool.map((player) => {
    const hrScore = (
      normalizeMetric(barrelValues, player.barrelRate) * 0.30
      + normalizeMetric(hardHitValues, player.hardHitRate) * 0.20
      + normalizeMetric(exitVeloValues, player.exitVelo) * 0.15
      + normalizeMetric(pitcherHr9Values, player.opposingPitcherHr9) * 0.15
      + normalizeMetric(parkValues, player.parkFactor) * 0.10
      + normalizeMetric(pullValues, player.pullRate) * 0.05
      + normalizeMetric(recentValues, player.last7HR) * 0.05
    );
    return {
      ...player,
      hrScore: Number(hrScore.toFixed(1)),
    };
  }).sort((left, right) => right.hrScore - left.hrScore || left.player.localeCompare(right.player))
    .map((player, index) => ({
      player: player.player,
      team: player.team,
      opponent: player.opponent,
      opposingPitcher: player.opposingPitcher,
      pitcherHand: player.pitcherHand,
      ballpark: player.ballpark,
      parkFactor: Number(player.parkFactor.toFixed(2)),
      barrelRate: Number(player.barrelRate.toFixed(1)),
      hardHitRate: Number(player.hardHitRate.toFixed(1)),
      exitVelo: Number(player.exitVelo.toFixed(1)),
      iso: Number(player.iso.toFixed(3)),
      hrFBRatio: Number(player.hrFBRatio.toFixed(1)),
      pullRate: Number(player.pullRate.toFixed(1)),
      last7HR: player.last7HR,
      last30HR: player.last30HR,
      hrScore: player.hrScore,
      hrScoreRank: index + 1,
    }));

  const validatedRows = validateRawRows(scored);
  console.log(`Validated ${validatedRows.length} MLB HR prop rows across ${schedule.length} games.`);

  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  let picksResult = null;
  let previewResult = null;

  if (apiKey && validatedRows.length) {
    const top20Summary = buildSummary(validatedRows, 20);
    const top10Summary = buildSummary(validatedRows, 10);
    const picksPrompt = `You are a sharp MLB prop betting analyst. Based on today's HR prop model data:\n${top20Summary}\n\nReturn ONLY a raw JSON object with no markdown. The object has three keys: bestBets (array of 5 top HR prop picks - highest model score players with strong matchup context), valueBets (array of 3 players where HR score is high but they may be underpriced - ranks 4-12 in the model), longshots (array of 2 high upside lower probability picks from ranks 8-20). Each pick has: player (string), team (string), opponent (string), opposingPitcher (string), hrScoreRank (number), topStats (array of exactly 2 strings highlighting their strongest metrics with values), bullets (array of exactly 2 strings referencing specific numbers from the data - barrel rate, exit velo, park factor, pitcher HR/9, or recent form). Do not include any text outside the JSON.`;
    const previewPrompt = `Based on today's MLB HR prop model data:\n${top10Summary}\n\nWrite a short slate preview. Return JSON with two fields: slateOverview (2-3 sentences describing today's slate conditions - parks, pitcher matchups, weather angles that create HR opportunities), modelNote (1-2 sentences explaining how the model is weighting today's picks). Sound like a sharp analyst. No filler. No markdown.`;

    try {
      picksResult = await callGrokWithRetry(picksPrompt, 3, (parsed) => {
        if (!parsed.bestBets || !parsed.valueBets || !parsed.longshots) throw new Error("Missing MLB HR prop sections.");
      });
    } catch (error) {
      console.warn(`Grok HR prop picks were invalid. Falling back to model-ranked picks. ${error instanceof Error ? error.message : error}`);
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      previewResult = await callGrokWithRetry(previewPrompt, 3);
    } catch (error) {
      console.warn(`Grok slate preview was invalid. Falling back to model-generated preview. ${error instanceof Error ? error.message : error}`);
    }
  } else if (!apiKey) {
    console.warn("GROK_API_KEY is not set. Falling back to model-generated HR prop sections.");
  }

  const bestBetsPayload = buildBestBetsPayload(validatedRows, picksResult, previewResult);

  writeFileSync(RAW_OUTPUT_PATH, `${JSON.stringify(validatedRows, null, 2)}\n`, "utf8");
  writeFileSync(BEST_BETS_OUTPUT_PATH, `${JSON.stringify(bestBetsPayload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${RAW_OUTPUT_PATH}`);
  console.log(`Wrote ${BEST_BETS_OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(`MLB HR props generation failed before publish. Existing output files were preserved. ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
