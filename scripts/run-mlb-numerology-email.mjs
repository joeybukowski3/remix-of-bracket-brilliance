#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const NUMEROLOGY_PATH = path.join(DATA_DIR, "numerology-daily.json");
const HISTORY_PATH = path.join(DATA_DIR, "numerology-pick-history.json");
const TRACKER_PATH = path.join(DATA_DIR, "numerology-tracker.json");
const EMAIL_PREVIEW_PATH = path.join(ROOT, "artifacts", "numerology-email-preview.html");
const MLB_API = "https://statsapi.mlb.com/api/v1";
const RESEND_API = "https://api.resend.com/emails";
const SITE_URL = "https://joeknowsball.com/mlb/numerology";
const TIMEZONE = "America/New_York";
const SCHEMA_VERSION = 1;
const REQUEST_TIMEOUT_MS = 20_000;

const ESPN_TEAM_CODES = Object.freeze({
  ARI: "ari", ATL: "atl", BAL: "bal", BOS: "bos", CHC: "chc", CWS: "chw",
  CIN: "cin", CLE: "cle", COL: "col", DET: "det", HOU: "hou", KC: "kc",
  LAA: "laa", LAD: "lad", MIA: "mia", MIL: "mil", MIN: "min", NYM: "nym",
  NYY: "nyy", ATH: "ath", PHI: "phi", PIT: "pit", SD: "sd", SF: "sf",
  SEA: "sea", STL: "stl", TB: "tb", TEX: "tex", TOR: "tor", WSH: "wsh",
});

function parseArgs(argv = process.argv.slice(2)) {
  const value = (name) => {
    const equal = argv.find((arg) => arg.startsWith(`${name}=`));
    if (equal) return equal.slice(name.length + 1);
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : null;
  };
  return {
    date: value("--date"),
    fixture: argv.includes("--fixture"),
    noSend: argv.includes("--no-send") || argv.includes("--fixture"),
    forceSend: argv.includes("--force-send"),
  };
}

function finite(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function etDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function shiftDate(dateText, amount) {
  const date = new Date(`${dateText}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function formatLongDate(dateText) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${dateText}T12:00:00Z`));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeTeam(value) {
  const code = String(value ?? "").trim().toUpperCase();
  return ({ ARZ: "ARI", AZ: "ARI", CHW: "CWS", KCR: "KC", SDP: "SD", SFG: "SF", TBR: "TB", WSN: "WSH", OAK: "ATH" })[code] ?? code;
}

function teamLogoUrl(team) {
  const code = ESPN_TEAM_CODES[normalizeTeam(team)] ?? normalizeTeam(team).toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/mlb/500/${code}.png`;
}

function readJson(filePath, fallback) {
  if (!existsSync(filePath)) return structuredClone(fallback);
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Invalid JSON at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function writeJsonAtomic(filePath, payload) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  try {
    renameSync(temporary, filePath);
  } catch {
    if (existsSync(filePath)) rmSync(filePath);
    renameSync(temporary, filePath);
  }
}

async function fetchJson(url, {
  fetchImpl = globalThis.fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
  attempts = 3,
  headers = {},
} = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        headers: { Accept: "application/json", ...headers },
      });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return await response.json();
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 300));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Request failed: ${url}`);
}

function normalizeAmericanOdds(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object") {
    return normalizeAmericanOdds(value.american ?? value.price ?? value.odds ?? value.yes);
  }
  const text = String(value).trim().replace(/[^+\-0-9.]/g, "");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : null;
}

function formatOdds(value) {
  const odds = normalizeAmericanOdds(value);
  if (odds == null) return "Odds unavailable";
  return odds > 0 ? `+${Math.round(odds)}` : String(Math.round(odds));
}

function winningProfit(americanOdds) {
  const odds = normalizeAmericanOdds(americanOdds);
  if (odds == null) return null;
  return odds > 0 ? odds / 100 : 100 / Math.abs(odds);
}

function emptyHistory() {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: null,
    days: [],
  };
}

function emptyTracker() {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: null,
    betting: {
      wins: 0,
      losses: 0,
      voids: 0,
      pending: 0,
      settledBets: 0,
      unitsRisked: 0,
      profitUnits: 0,
      roiPercent: 0,
      winRate: 0,
    },
    topPickPerformance: {
      daysTracked: 0,
      gamesPlayed: 0,
      voids: 0,
      pending: 0,
      plateAppearances: 0,
      atBats: 0,
      hits: 0,
      singles: 0,
      doubles: 0,
      triples: 0,
      homeRuns: 0,
      runs: 0,
      rbi: 0,
      walks: 0,
      strikeouts: 0,
      stolenBases: 0,
      totalBases: 0,
      battingAverage: 0,
      onBasePercentage: 0,
      sluggingPercentage: 0,
      ops: 0,
      hitGames: 0,
      rbiGames: 0,
      runGames: 0,
      multiHitGames: 0,
      homeRunGames: 0,
      hitRate: 0,
      rbiRate: 0,
      runRate: 0,
      multiHitRate: 0,
      homeRunRate: 0,
      averageNumerologyScore: 0,
      averageModelScore: 0,
    },
    topPickScoreBuckets: {
      numerology: {},
      model: {},
    },
    dailyResults: [],
  };
}

function candidatePool(numerology) {
  const combined = [
    ...(numerology.featuredPlays ?? []),
    ...(numerology.bestAvailable ?? []),
    ...(numerology.watchlist ?? []),
  ];
  const seen = new Set();
  return combined
    .filter((player) => {
      const key = `${player.playerId ?? ""}|${player.playerName}|${player.team}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return player.playerName && player.team;
    })
    .sort((a, b) => finite(a.rank, 999) - finite(b.rank, 999) || finite(b.numerologyScore, 0) - finite(a.numerologyScore, 0));
}

function chooseTopThree(numerology) {
  const pool = candidatePool(numerology);
  const withOdds = pool.filter((player) => normalizeAmericanOdds(player.odds) != null);
  const selected = [...withOdds.slice(0, 3)];
  if (selected.length < 3) {
    for (const player of pool) {
      if (selected.includes(player)) continue;
      selected.push(player);
      if (selected.length === 3) break;
    }
  }
  return selected;
}

async function loadMlbDirectory(fetchImpl) {
  const payload = await fetchJson(`${MLB_API}/teams?sportId=1`, { fetchImpl });
  const byAbbreviation = new Map();
  for (const team of payload?.teams ?? []) {
    const abbreviation = normalizeTeam(team.abbreviation ?? team.teamCode);
    byAbbreviation.set(abbreviation, {
      id: finite(team.id),
      name: team.name ?? abbreviation,
      abbreviation,
      logoUrl: teamLogoUrl(abbreviation),
    });
  }
  return byAbbreviation;
}

async function loadSchedule(dateText, fetchImpl) {
  const url = `${MLB_API}/schedule?sportId=1&date=${dateText}&hydrate=team,probablePitcher`;
  const payload = await fetchJson(url, { fetchImpl });
  return payload?.dates?.[0]?.games ?? [];
}

function findGameForTeam(games, teamId, abbreviation) {
  return games.find((game) => {
    const away = game?.teams?.away?.team ?? {};
    const home = game?.teams?.home?.team ?? {};
    if (teamId != null && (finite(away.id) === teamId || finite(home.id) === teamId)) return true;
    const normalized = normalizeTeam(abbreviation);
    return [away.abbreviation, away.teamCode, home.abbreviation, home.teamCode]
      .some((value) => normalizeTeam(value) === normalized);
  }) ?? null;
}

async function enrichPick(player, rank, dateText, directory, games, fetchImpl) {
  const teamCode = normalizeTeam(player.team);
  const teamInfo = directory.get(teamCode) ?? {
    id: null,
    name: teamCode,
    abbreviation: teamCode,
    logoUrl: teamLogoUrl(teamCode),
  };
  const game = findGameForTeam(games, teamInfo.id, teamCode);
  const personId = finite(player.playerId);
  let person = null;
  if (personId != null) {
    try {
      const payload = await fetchJson(`${MLB_API}/people/${personId}`, { fetchImpl });
      person = payload?.people?.[0] ?? null;
    } catch (error) {
      console.warn(`[numerology-email] person enrichment failed for ${player.playerName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const signals = (player.positiveSignals ?? [])
    .filter((signal) => finite(signal.points, 0) > 0)
    .slice(0, 3)
    .map((signal) => ({
      label: signal.label ?? signal.description ?? "Numerology alignment",
      description: signal.description ?? null,
      points: finite(signal.points),
    }));

  return {
    rank,
    playerId: personId,
    player: player.playerName,
    position: person?.primaryPosition?.abbreviation ?? person?.primaryPosition?.name ?? "—",
    team: teamCode,
    teamName: teamInfo.name,
    teamId: teamInfo.id,
    teamLogoUrl: teamInfo.logoUrl,
    opponent: normalizeTeam(player.opponent),
    opposingPitcher: player.opposingPitcher ?? "TBD",
    gamePk: finite(game?.gamePk),
    gameStatusAtSelection: game?.status?.detailedState ?? null,
    gameTime: game?.gameDate ?? null,
    lineupStatus: player.lineupStatus ?? "unknown",
    battingOrder: finite(player.battingOrder),
    numerologyScore: finite(player.numerologyScore, 0),
    modelScore: finite(player.baseballScore ?? player.marketScore),
    odds: normalizeAmericanOdds(player.odds),
    oddsDisplay: formatOdds(player.odds),
    sportsbook: player.book ?? player.sportsbook ?? null,
    recommendedMarket: player.recommendedMarket ?? "Home Run",
    signals,
    summary: player.summary ?? player.marketSelectionReason ?? "Ranked by numerology alignment; baseball model score is shown as context only.",
    result: null,
    hrBetResult: "pending",
    profitUnits: null,
    selectedAt: new Date().toISOString(),
    selectionDate: dateText,
  };
}

async function createOrReuseToday(history, numerology, dateText, fetchImpl) {
  const existing = history.days.find((day) => day.date === dateText);
  if (existing) return existing;
  if (numerology?.date !== dateText) {
    throw new Error(`Numerology date mismatch: expected ${dateText}, received ${numerology?.date ?? "missing"}`);
  }

  const [directory, games] = await Promise.all([
    loadMlbDirectory(fetchImpl),
    loadSchedule(dateText, fetchImpl),
  ]);
  const selected = chooseTopThree(numerology);
  const picks = await Promise.all(selected.map((player, index) => enrichPick(player, index + 1, dateText, directory, games, fetchImpl)));
  const day = {
    date: dateText,
    generatedAt: new Date().toISOString(),
    methodologyVersion: numerology.methodologyVersion ?? null,
    universalDay: {
      rawSum: numerology.dailyProfile?.universalDayRawSum ?? null,
      compound: numerology.dailyProfile?.universalDayCompound ?? null,
      root: numerology.dailyProfile?.universalDayRoot ?? null,
      interpretation: numerology.dailyProfile?.interpretation ?? null,
    },
    status: "pending",
    emailSentAt: null,
    resendEmailId: null,
    picks,
    topPick: picks[0] ?? null,
  };
  history.days.push(day);
  history.days.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return day;
}

function gameIsFinal(game) {
  const state = String(game?.status?.abstractGameState ?? "").toLowerCase();
  const detailed = String(game?.status?.detailedState ?? "").toLowerCase();
  return state === "final" || /final|game over|completed early/.test(detailed);
}

function gameIsVoid(game) {
  const detailed = String(game?.status?.detailedState ?? "").toLowerCase();
  return /postponed|cancelled|canceled|suspended/.test(detailed);
}

function normalizeBattingStats(stat = {}) {
  const atBats = finite(stat.atBats, 0);
  const hits = finite(stat.hits, 0);
  const doubles = finite(stat.doubles, 0);
  const triples = finite(stat.triples, 0);
  const homeRuns = finite(stat.homeRuns, 0);
  const walks = finite(stat.baseOnBalls ?? stat.walks, 0);
  const hitByPitch = finite(stat.hitByPitch, 0);
  const sacrificeFlies = finite(stat.sacFlies ?? stat.sacrificeFlies, 0);
  const plateAppearances = finite(stat.plateAppearances, atBats + walks + hitByPitch + sacrificeFlies);
  const singles = Math.max(0, hits - doubles - triples - homeRuns);
  return {
    status: plateAppearances > 0 ? "graded" : "void",
    plateAppearances,
    atBats,
    hits,
    singles,
    doubles,
    triples,
    homeRuns,
    runs: finite(stat.runs, 0),
    rbi: finite(stat.rbi, 0),
    walks,
    strikeouts: finite(stat.strikeOuts ?? stat.strikeouts, 0),
    stolenBases: finite(stat.stolenBases, 0),
    totalBases: finite(stat.totalBases, singles + doubles * 2 + triples * 3 + homeRuns * 4),
  };
}

async function gradePick(pick, dayDate, games, fetchImpl) {
  let game = pick.gamePk != null ? games.find((candidate) => finite(candidate.gamePk) === finite(pick.gamePk)) : null;
  if (!game) game = findGameForTeam(games, pick.teamId, pick.team);
  if (!game) return { changed: false, reason: "GAME_NOT_FOUND" };

  pick.gamePk = finite(game.gamePk);
  pick.finalGameStatus = game?.status?.detailedState ?? null;
  if (gameIsVoid(game)) {
    pick.result = { status: "void", reason: pick.finalGameStatus, plateAppearances: 0 };
    pick.hrBetResult = "void";
    pick.profitUnits = 0;
    pick.gradedAt = new Date().toISOString();
    return { changed: true, reason: "VOID_GAME" };
  }
  if (!gameIsFinal(game)) return { changed: false, reason: "GAME_NOT_FINAL" };

  const boxscore = await fetchJson(`${MLB_API}/game/${game.gamePk}/boxscore`, { fetchImpl });
  const playerKey = pick.playerId == null ? null : `ID${pick.playerId}`;
  const playerEntry = playerKey ? boxscore?.teams?.away?.players?.[playerKey] ?? boxscore?.teams?.home?.players?.[playerKey] : null;
  const stats = normalizeBattingStats(playerEntry?.stats?.batting ?? {});
  pick.result = stats;
  pick.gradedAt = new Date().toISOString();

  if (stats.status === "void") {
    pick.hrBetResult = "void";
    pick.profitUnits = 0;
  } else if (stats.homeRuns >= 1) {
    pick.hrBetResult = "win";
    pick.profitUnits = round(winningProfit(pick.odds), 2);
  } else {
    pick.hrBetResult = "loss";
    pick.profitUnits = pick.odds == null ? null : -1;
  }
  return { changed: true, reason: "GRADED" };
}

async function gradePendingDays(history, today, fetchImpl) {
  const pendingDays = history.days.filter((day) => day.date < today && day.picks?.some((pick) => pick.hrBetResult === "pending"));
  for (const day of pendingDays) {
    let games = [];
    try {
      games = await loadSchedule(day.date, fetchImpl);
    } catch (error) {
      console.warn(`[numerology-email] schedule unavailable for ${day.date}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    for (const pick of day.picks ?? []) {
      if (pick.hrBetResult !== "pending") continue;
      try {
        await gradePick(pick, day.date, games, fetchImpl);
      } catch (error) {
        console.warn(`[numerology-email] grading failed for ${day.date} ${pick.player}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const states = (day.picks ?? []).map((pick) => pick.hrBetResult);
    day.status = states.every((state) => state !== "pending") ? "graded" : states.some((state) => state !== "pending") ? "partially_graded" : "pending";
    day.topPick = day.picks?.[0] ?? null;
  }
}

function numerologyBucket(score) {
  const value = finite(score, 0);
  if (value >= 85) return "85-100";
  if (value >= 75) return "75-84";
  return "below-75";
}

function modelBucket(score) {
  const value = finite(score);
  if (value == null) return "unavailable";
  if (value >= 75) return "75-100";
  if (value >= 65) return "65-74";
  return "below-65";
}

function summarizePerformance(picks) {
  const graded = picks.filter((pick) => pick.result?.status === "graded");
  const totals = graded.reduce((acc, pick) => {
    for (const key of ["plateAppearances", "atBats", "hits", "singles", "doubles", "triples", "homeRuns", "runs", "rbi", "walks", "strikeouts", "stolenBases", "totalBases"]) {
      acc[key] += finite(pick.result?.[key], 0);
    }
    acc.hitGames += finite(pick.result?.hits, 0) >= 1 ? 1 : 0;
    acc.rbiGames += finite(pick.result?.rbi, 0) >= 1 ? 1 : 0;
    acc.runGames += finite(pick.result?.runs, 0) >= 1 ? 1 : 0;
    acc.multiHitGames += finite(pick.result?.hits, 0) >= 2 ? 1 : 0;
    acc.homeRunGames += finite(pick.result?.homeRuns, 0) >= 1 ? 1 : 0;
    return acc;
  }, {
    plateAppearances: 0, atBats: 0, hits: 0, singles: 0, doubles: 0, triples: 0,
    homeRuns: 0, runs: 0, rbi: 0, walks: 0, strikeouts: 0, stolenBases: 0,
    totalBases: 0, hitGames: 0, rbiGames: 0, runGames: 0, multiHitGames: 0, homeRunGames: 0,
  });
  const games = graded.length;
  const battingAverage = totals.atBats > 0 ? totals.hits / totals.atBats : 0;
  const obpDenominator = totals.atBats + totals.walks;
  const onBasePercentage = obpDenominator > 0 ? (totals.hits + totals.walks) / obpDenominator : 0;
  const sluggingPercentage = totals.atBats > 0 ? totals.totalBases / totals.atBats : 0;
  return {
    games,
    ...totals,
    battingAverage: round(battingAverage, 3),
    onBasePercentage: round(onBasePercentage, 3),
    sluggingPercentage: round(sluggingPercentage, 3),
    ops: round(onBasePercentage + sluggingPercentage, 3),
    hitRate: games > 0 ? round(totals.hitGames / games * 100, 2) : 0,
    rbiRate: games > 0 ? round(totals.rbiGames / games * 100, 2) : 0,
    runRate: games > 0 ? round(totals.runGames / games * 100, 2) : 0,
    multiHitRate: games > 0 ? round(totals.multiHitGames / games * 100, 2) : 0,
    homeRunRate: games > 0 ? round(totals.homeRunGames / games * 100, 2) : 0,
  };
}

function buildBuckets(topPicks, selector, labels) {
  const output = {};
  for (const label of labels) {
    const picks = topPicks.filter((pick) => selector(pick) === label);
    const performance = summarizePerformance(picks);
    output[label] = {
      games: performance.games,
      atBats: performance.atBats,
      hits: performance.hits,
      homeRuns: performance.homeRuns,
      rbi: performance.rbi,
      runs: performance.runs,
      totalBases: performance.totalBases,
      battingAverage: performance.battingAverage,
      hitRate: performance.hitRate,
      homeRunRate: performance.homeRunRate,
    };
  }
  return output;
}

export function rebuildTracker(history) {
  const tracker = emptyTracker();
  const allPicks = history.days.flatMap((day) => day.picks ?? []);
  const settled = allPicks.filter((pick) => ["win", "loss"].includes(pick.hrBetResult));
  const wins = allPicks.filter((pick) => pick.hrBetResult === "win").length;
  const losses = allPicks.filter((pick) => pick.hrBetResult === "loss").length;
  const voids = allPicks.filter((pick) => pick.hrBetResult === "void").length;
  const pending = allPicks.filter((pick) => pick.hrBetResult === "pending").length;
  const profitUnits = allPicks.reduce((sum, pick) => sum + finite(pick.profitUnits, 0), 0);
  const unitsRisked = settled.filter((pick) => pick.odds != null).length;

  tracker.betting = {
    wins,
    losses,
    voids,
    pending,
    settledBets: wins + losses,
    unitsRisked,
    profitUnits: round(profitUnits, 2),
    roiPercent: unitsRisked > 0 ? round(profitUnits / unitsRisked * 100, 2) : 0,
    winRate: wins + losses > 0 ? round(wins / (wins + losses) * 100, 2) : 0,
  };

  const topPicks = history.days.map((day) => day.picks?.[0]).filter(Boolean);
  const topPerformance = summarizePerformance(topPicks);
  const numerologyScores = topPicks.map((pick) => finite(pick.numerologyScore)).filter(Number.isFinite);
  const modelScores = topPicks.map((pick) => finite(pick.modelScore)).filter(Number.isFinite);
  tracker.topPickPerformance = {
    daysTracked: topPicks.length,
    gamesPlayed: topPerformance.games,
    voids: topPicks.filter((pick) => pick.hrBetResult === "void").length,
    pending: topPicks.filter((pick) => pick.hrBetResult === "pending").length,
    plateAppearances: topPerformance.plateAppearances,
    atBats: topPerformance.atBats,
    hits: topPerformance.hits,
    singles: topPerformance.singles,
    doubles: topPerformance.doubles,
    triples: topPerformance.triples,
    homeRuns: topPerformance.homeRuns,
    runs: topPerformance.runs,
    rbi: topPerformance.rbi,
    walks: topPerformance.walks,
    strikeouts: topPerformance.strikeouts,
    stolenBases: topPerformance.stolenBases,
    totalBases: topPerformance.totalBases,
    battingAverage: topPerformance.battingAverage,
    onBasePercentage: topPerformance.onBasePercentage,
    sluggingPercentage: topPerformance.sluggingPercentage,
    ops: topPerformance.ops,
    hitGames: topPerformance.hitGames,
    rbiGames: topPerformance.rbiGames,
    runGames: topPerformance.runGames,
    multiHitGames: topPerformance.multiHitGames,
    homeRunGames: topPerformance.homeRunGames,
    hitRate: topPerformance.hitRate,
    rbiRate: topPerformance.rbiRate,
    runRate: topPerformance.runRate,
    multiHitRate: topPerformance.multiHitRate,
    homeRunRate: topPerformance.homeRunRate,
    averageNumerologyScore: numerologyScores.length ? round(numerologyScores.reduce((a, b) => a + b, 0) / numerologyScores.length, 2) : 0,
    averageModelScore: modelScores.length ? round(modelScores.reduce((a, b) => a + b, 0) / modelScores.length, 2) : 0,
  };
  tracker.topPickScoreBuckets = {
    numerology: buildBuckets(topPicks, (pick) => numerologyBucket(pick.numerologyScore), ["85-100", "75-84", "below-75"]),
    model: buildBuckets(topPicks, (pick) => modelBucket(pick.modelScore), ["75-100", "65-74", "below-65", "unavailable"]),
  };
  tracker.dailyResults = history.days
    .filter((day) => day.date)
    .map((day) => ({
      date: day.date,
      status: day.status,
      wins: (day.picks ?? []).filter((pick) => pick.hrBetResult === "win").length,
      losses: (day.picks ?? []).filter((pick) => pick.hrBetResult === "loss").length,
      voids: (day.picks ?? []).filter((pick) => pick.hrBetResult === "void").length,
      profitUnits: round((day.picks ?? []).reduce((sum, pick) => sum + finite(pick.profitUnits, 0), 0), 2),
      topPick: day.picks?.[0] ? {
        player: day.picks[0].player,
        numerologyScore: day.picks[0].numerologyScore,
        modelScore: day.picks[0].modelScore,
        result: day.picks[0].result,
      } : null,
    }))
    .slice(-60);
  tracker.updatedAt = new Date().toISOString();
  return tracker;
}

function statLine(result) {
  if (!result || result.status !== "graded") return "No plate appearance — void";
  const extras = [];
  if (result.homeRuns) extras.push(`${result.homeRuns} HR`);
  if (result.rbi) extras.push(`${result.rbi} RBI`);
  if (result.runs) extras.push(`${result.runs} R`);
  if (result.walks) extras.push(`${result.walks} BB`);
  if (result.stolenBases) extras.push(`${result.stolenBases} SB`);
  return `${result.hits}-for-${result.atBats}${extras.length ? `, ${extras.join(", ")}` : ""}`;
}

function scoreText(value) {
  return finite(value) == null ? "—" : round(finite(value), 1).toFixed(1);
}

function signedUnits(value) {
  const units = finite(value, 0);
  return `${units >= 0 ? "+" : ""}${units.toFixed(2)}u`;
}

function resultTone(result) {
  if (result === "win") return { label: "WIN", background: "#dcfce7", color: "#166534", icon: "✓" };
  if (result === "loss") return { label: "LOSS", background: "#fee2e2", color: "#991b1b", icon: "×" };
  if (result === "void") return { label: "VOID", background: "#f1f5f9", color: "#475569", icon: "—" };
  return { label: "PENDING", background: "#fef3c7", color: "#92400e", icon: "…" };
}

function renderPickCard(pick) {
  const signalRows = (pick.signals ?? []).map((signal) => `
    <tr><td style="padding:4px 0;color:#475569;font-size:13px;line-height:1.45;">• ${escapeHtml(signal.label)}</td></tr>
  `).join("");
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;margin:0 0 14px;border:1px solid #dbe4ee;border-radius:16px;background:#ffffff;overflow:hidden;">
      <tr>
        <td width="92" valign="top" style="padding:18px 10px 18px 18px;">
          <div style="width:68px;height:68px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;text-align:center;line-height:68px;">
            <img src="${escapeHtml(pick.teamLogoUrl)}" width="58" height="58" alt="${escapeHtml(pick.team)} logo" style="display:inline-block;vertical-align:middle;object-fit:contain;border:0;" />
          </div>
        </td>
        <td valign="top" style="padding:17px 8px 17px 4px;">
          <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;color:#64748b;">#${pick.rank} Numerology HR Pick</div>
          <div style="margin-top:4px;font-size:20px;line-height:1.2;font-weight:800;color:#0f172a;">${escapeHtml(pick.player)}</div>
          <div style="margin-top:3px;font-size:13px;color:#475569;">${escapeHtml(pick.position)} · ${escapeHtml(pick.team)} vs ${escapeHtml(pick.opponent)} · ${escapeHtml(pick.opposingPitcher || "TBD")}</div>
          <div style="margin-top:9px;font-size:14px;color:#0f172a;"><strong>${escapeHtml(pick.oddsDisplay)}</strong>${pick.sportsbook ? ` · ${escapeHtml(pick.sportsbook)}` : ""}${pick.battingOrder ? ` · Batting ${pick.battingOrder}` : ""}</div>
        </td>
        <td width="108" valign="top" style="padding:17px 18px 17px 8px;text-align:right;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700;">Numerology</div>
          <div style="font-size:25px;line-height:1.1;font-weight:900;color:#6d28d9;">${scoreText(pick.numerologyScore)}</div>
          <div style="margin-top:8px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700;">Model</div>
          <div style="font-size:18px;font-weight:800;color:#0f172a;">${scoreText(pick.modelScore)}</div>
        </td>
      </tr>
      <tr>
        <td colspan="3" style="padding:0 18px 17px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #eef2f7;padding-top:10px;">
            ${signalRows || '<tr><td style="padding:4px 0;color:#64748b;font-size:13px;">Numerology details are available on the full dashboard.</td></tr>'}
          </table>
        </td>
      </tr>
    </table>`;
}

function renderResultRow(pick) {
  const tone = resultTone(pick.hrBetResult);
  return `
    <tr>
      <td style="padding:12px 8px;border-bottom:1px solid #e2e8f0;">
        <div style="font-weight:800;color:#0f172a;font-size:14px;">${escapeHtml(pick.player)}</div>
        <div style="font-size:12px;color:#64748b;">${escapeHtml(pick.team)} · Num ${scoreText(pick.numerologyScore)} · Model ${scoreText(pick.modelScore)}</div>
      </td>
      <td style="padding:12px 8px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#334155;">${escapeHtml(statLine(pick.result))}</td>
      <td align="right" style="padding:12px 8px;border-bottom:1px solid #e2e8f0;">
        <span style="display:inline-block;border-radius:999px;padding:4px 8px;background:${tone.background};color:${tone.color};font-size:11px;font-weight:900;">${tone.icon} ${tone.label}</span>
        <div style="margin-top:4px;font-size:12px;color:#475569;">${pick.profitUnits == null ? "No odds" : signedUnits(pick.profitUnits)}</div>
      </td>
    </tr>`;
}

export function renderEmail({ todayDay, priorDay, tracker }) {
  const betting = tracker.betting;
  const top = tracker.topPickPerformance;
  const priorProfit = priorDay ? (priorDay.picks ?? []).reduce((sum, pick) => sum + finite(pick.profitUnits, 0), 0) : 0;
  const priorRecord = priorDay ? `${priorDay.picks.filter((pick) => pick.hrBetResult === "win").length}-${priorDay.picks.filter((pick) => pick.hrBetResult === "loss").length}` : "—";
  const topPrior = priorDay?.picks?.[0] ?? null;
  const todayCards = (todayDay.picks ?? []).map(renderPickCard).join("");
  const priorRows = priorDay ? (priorDay.picks ?? []).map(renderResultRow).join("") : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Today’s top three MLB numerology home run props, yesterday’s grades, and running tracker.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f7;"><tr><td align="center" style="padding:24px 10px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:700px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 30px rgba(15,23,42,.08);">
      <tr><td style="padding:28px 28px 24px;background:linear-gradient(135deg,#111827,#312e81 55%,#6d28d9);color:#ffffff;">
        <div style="font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#c4b5fd;">Joe Knows Ball</div>
        <div style="margin-top:7px;font-size:28px;line-height:1.15;font-weight:900;">MLB Numerology HR Report</div>
        <div style="margin-top:8px;font-size:14px;color:#ddd6fe;">${escapeHtml(formatLongDate(todayDay.date))} · Universal Day ${escapeHtml(todayDay.universalDay?.compound ?? "—")}/${escapeHtml(todayDay.universalDay?.root ?? "—")}</div>
      </td></tr>

      <tr><td style="padding:24px 24px 8px;">
        <div style="font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#7c3aed;">Today’s Card</div>
        <div style="margin-top:4px;font-size:22px;font-weight:900;color:#0f172a;">Top Numerology Home Run Props</div>
        <div style="margin:7px 0 16px;font-size:13px;line-height:1.5;color:#64748b;">Ranked by numerology alignment. The baseball model score is displayed separately as supporting context and does not determine rank.</div>
        ${todayCards || '<div style="padding:18px;border:1px solid #e2e8f0;border-radius:14px;color:#64748b;">No eligible numerology HR props were available.</div>'}
      </td></tr>

      <tr><td style="padding:20px 24px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
          <tr><td colspan="3" style="padding:15px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
            <div style="font-size:12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#475569;">Previous Results</div>
            <div style="margin-top:3px;font-size:18px;font-weight:900;color:#0f172a;">${priorDay ? `${escapeHtml(formatLongDate(priorDay.date))} · ${priorRecord} · ${signedUnits(priorProfit)}` : "No previous graded card yet"}</div>
          </td></tr>
          ${priorRows || '<tr><td colspan="3" style="padding:18px;color:#64748b;font-size:13px;">Results will appear after the first completed slate.</td></tr>'}
        </table>
      </td></tr>

      ${topPrior ? `<tr><td style="padding:4px 24px 20px;">
        <div style="border-radius:16px;background:#faf5ff;border:1px solid #e9d5ff;padding:17px;">
          <div style="font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#7e22ce;">Previous No. 1 Pick</div>
          <div style="margin-top:5px;font-size:18px;font-weight:900;color:#0f172a;">${escapeHtml(topPrior.player)}</div>
          <div style="margin-top:4px;font-size:13px;color:#475569;">${escapeHtml(statLine(topPrior.result))}</div>
          <div style="margin-top:6px;font-size:12px;color:#64748b;">Numerology ${scoreText(topPrior.numerologyScore)} · Model ${scoreText(topPrior.modelScore)} · ${formatOdds(topPrior.odds)}</div>
        </div>
      </td></tr>` : ""}

      <tr><td style="padding:20px 24px;background:#0f172a;color:#ffffff;">
        <div style="font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#c4b5fd;">Running Tracker</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px;">
          <tr>
            <td width="33%" style="padding:10px;border-right:1px solid #334155;text-align:center;"><div style="font-size:24px;font-weight:900;">${betting.wins}-${betting.losses}</div><div style="font-size:11px;color:#94a3b8;text-transform:uppercase;">HR Record</div></td>
            <td width="33%" style="padding:10px;border-right:1px solid #334155;text-align:center;"><div style="font-size:24px;font-weight:900;color:${betting.profitUnits >= 0 ? "#86efac" : "#fca5a5"};">${signedUnits(betting.profitUnits)}</div><div style="font-size:11px;color:#94a3b8;text-transform:uppercase;">Profit</div></td>
            <td width="33%" style="padding:10px;text-align:center;"><div style="font-size:24px;font-weight:900;">${betting.roiPercent.toFixed(1)}%</div><div style="font-size:11px;color:#94a3b8;text-transform:uppercase;">ROI</div></td>
          </tr>
        </table>
        <div style="margin-top:18px;padding-top:16px;border-top:1px solid #334155;font-size:13px;line-height:1.65;color:#cbd5e1;">
          <strong style="color:#ffffff;">No. 1 Pick Performance:</strong> ${top.gamesPlayed} games · ${top.hits} H · ${top.homeRuns} HR · ${top.rbi} RBI · ${top.runs} R · ${top.totalBases} TB<br>
          AVG / OBP / SLG / OPS: ${top.battingAverage.toFixed(3)} / ${top.onBasePercentage.toFixed(3)} / ${top.sluggingPercentage.toFixed(3)} / ${top.ops.toFixed(3)}<br>
          Hit rate ${top.hitRate.toFixed(1)}% · RBI-game rate ${top.rbiRate.toFixed(1)}% · HR-game rate ${top.homeRunRate.toFixed(1)}%<br>
          Average scores: Numerology ${top.averageNumerologyScore.toFixed(1)} · Model ${top.averageModelScore.toFixed(1)}
        </div>
      </td></tr>

      <tr><td align="center" style="padding:24px;background:#ffffff;">
        <a href="${SITE_URL}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#6d28d9;color:#ffffff;text-decoration:none;font-size:14px;font-weight:800;">Open Numerology Dashboard</a>
        <div style="margin-top:14px;font-size:11px;line-height:1.5;color:#94a3b8;">Numerology alignment is an experimental tracking signal, not a guarantee. One unit is tracked per available HR price.</div>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

async function sendEmail({ html, day, fetchImpl }) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NUMEROLOGY_EMAIL_TO;
  const from = process.env.NUMEROLOGY_EMAIL_FROM;
  if (!apiKey || !to || !from) {
    const missing = [!apiKey && "RESEND_API_KEY", !to && "NUMEROLOGY_EMAIL_TO", !from && "NUMEROLOGY_EMAIL_FROM"].filter(Boolean);
    throw new Error(`Missing email environment variables: ${missing.join(", ")}`);
  }
  const recipients = to.split(",").map((value) => value.trim()).filter(Boolean);
  const response = await fetchImpl(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `jkb-numerology-${day.date}`,
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: `🔮 MLB Numerology HR Props — ${formatLongDate(day.date)}`,
      html,
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Resend HTTP ${response.status}: ${text}`);
  return JSON.parse(text);
}

function createFixtureFetch(dateText) {
  const yesterday = shiftDate(dateText, -1);
  return async function fixtureFetch(url, options = {}) {
    const text = String(url);
    if (text === RESEND_API && options.method === "POST") {
      return new Response(JSON.stringify({ id: "fixture-email-id" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (text.includes("/teams?sportId=1")) {
      return new Response(JSON.stringify({ teams: [
        { id: 121, name: "New York Mets", abbreviation: "NYM" },
        { id: 147, name: "New York Yankees", abbreviation: "NYY" },
      ] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (text.includes(`/schedule?sportId=1&date=${dateText}`)) {
      return new Response(JSON.stringify({ dates: [{ games: [{
        gamePk: 900001,
        gameDate: `${dateText}T23:10:00Z`,
        status: { abstractGameState: "Preview", detailedState: "Scheduled" },
        teams: { away: { team: { id: 147, abbreviation: "NYY" } }, home: { team: { id: 121, abbreviation: "NYM" } } },
      }] }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (text.includes(`/schedule?sportId=1&date=${yesterday}`)) {
      return new Response(JSON.stringify({ dates: [{ games: [{
        gamePk: 900000,
        status: { abstractGameState: "Final", detailedState: "Final" },
        teams: { away: { team: { id: 147, abbreviation: "NYY" } }, home: { team: { id: 121, abbreviation: "NYM" } } },
      }] }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (text.includes("/people/")) {
      return new Response(JSON.stringify({ people: [{ primaryPosition: { abbreviation: "OF" } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (text.includes("/game/900000/boxscore")) {
      return new Response(JSON.stringify({ teams: {
        away: { players: {} },
        home: { players: {
          ID1: { stats: { batting: { plateAppearances: 5, atBats: 4, hits: 2, doubles: 1, triples: 0, homeRuns: 1, runs: 2, rbi: 3, baseOnBalls: 1, strikeOuts: 1, stolenBases: 0, totalBases: 6 } } },
          ID2: { stats: { batting: { plateAppearances: 4, atBats: 4, hits: 1, homeRuns: 0, runs: 0, rbi: 0, baseOnBalls: 0, strikeOuts: 2, totalBases: 1 } } },
          ID3: { stats: { batting: { plateAppearances: 0, atBats: 0 } } },
        } },
      } }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: `Unknown fixture URL ${text}` }), { status: 404, headers: { "Content-Type": "application/json" } });
  };
}

function fixtureNumerology(dateText) {
  return {
    date: dateText,
    methodologyVersion: "fixture",
    dailyProfile: { universalDayRawSum: 11, universalDayCompound: 11, universalDayRoot: 2, interpretation: "Fixture day" },
    featuredPlays: [1, 2, 3].map((id) => ({
      rank: id,
      playerId: id,
      playerName: `Fixture Player ${id}`,
      team: "NYM",
      opponent: "NYY",
      opposingPitcher: "Fixture Pitcher",
      lineupStatus: "confirmed",
      battingOrder: id,
      numerologyScore: 90 - id,
      baseballScore: 70 + id,
      odds: 300 + id * 25,
      recommendedMarket: "Home Run",
      positiveSignals: [{ label: `Fixture signal ${id}`, description: "Fixture numerology alignment", points: 20 }],
    })),
    bestAvailable: [],
    watchlist: [],
  };
}

function fixtureHistory(dateText) {
  const yesterday = shiftDate(dateText, -1);
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: null,
    days: [{
      date: yesterday,
      status: "pending",
      picks: [1, 2, 3].map((id) => ({
        rank: id,
        playerId: id,
        player: `Fixture Player ${id}`,
        position: "OF",
        team: "NYM",
        teamId: 121,
        teamLogoUrl: teamLogoUrl("NYM"),
        opponent: "NYY",
        gamePk: 900000,
        numerologyScore: 90 - id,
        modelScore: 70 + id,
        odds: 300 + id * 25,
        oddsDisplay: `+${300 + id * 25}`,
        result: null,
        hrBetResult: "pending",
        profitUnits: null,
      })),
    }],
  };
}

export async function runPipeline({
  date = etDate(),
  fixture = false,
  noSend = false,
  forceSend = false,
  fetchImpl = fixture ? createFixtureFetch(date) : globalThis.fetch,
} = {}) {
  const numerology = fixture ? fixtureNumerology(date) : readJson(NUMEROLOGY_PATH, null);
  if (!numerology) throw new Error(`Missing numerology data at ${NUMEROLOGY_PATH}`);
  const history = fixture ? fixtureHistory(date) : readJson(HISTORY_PATH, emptyHistory());

  await gradePendingDays(history, date, fetchImpl);
  const todayDay = await createOrReuseToday(history, numerology, date, fetchImpl);
  const tracker = rebuildTracker(history);
  const priorDay = [...history.days]
    .filter((day) => day.date < date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] ?? null;
  const html = renderEmail({ todayDay, priorDay, tracker });

  mkdirSync(path.dirname(EMAIL_PREVIEW_PATH), { recursive: true });
  writeFileSync(EMAIL_PREVIEW_PATH, html, "utf8");

  let emailResponse = null;
  const alreadySent = Boolean(todayDay.emailSentAt);
  if (!noSend && (!alreadySent || forceSend)) {
    emailResponse = await sendEmail({ html, day: todayDay, fetchImpl });
    todayDay.emailSentAt = new Date().toISOString();
    todayDay.resendEmailId = emailResponse.id ?? null;
  } else {
    console.log(`[numerology-email] email skipped: noSend=${noSend}, alreadySent=${alreadySent}, forceSend=${forceSend}`);
  }

  history.updatedAt = new Date().toISOString();
  const finalTracker = rebuildTracker(history);
  if (!fixture) {
    writeJsonAtomic(HISTORY_PATH, history);
    writeJsonAtomic(TRACKER_PATH, finalTracker);
  }

  const summary = {
    ok: true,
    date,
    fixture,
    picks: todayDay.picks.length,
    priorDay: priorDay?.date ?? null,
    betting: finalTracker.betting,
    topPickPerformance: finalTracker.topPickPerformance,
    emailSent: Boolean(emailResponse),
    previewPath: EMAIL_PREVIEW_PATH,
  };
  console.log(JSON.stringify(summary, null, 2));
  return { summary, history, tracker: finalTracker, html };
}

async function main() {
  const args = parseArgs();
  const date = args.date ?? etDate();
  const result = await runPipeline({ ...args, date });
  if (args.fixture) {
    const yesterday = result.history.days.find((day) => day.date === shiftDate(date, -1));
    const top = yesterday?.picks?.[0];
    if (top?.hrBetResult !== "win") throw new Error("Fixture top pick should grade as a win");
    if (top?.result?.hits !== 2 || top?.result?.rbi !== 3) throw new Error("Fixture top-pick stats were not retained");
    if (result.tracker.topPickPerformance.gamesPlayed !== 1) throw new Error("Fixture top-pick tracker count mismatch");
    if (!result.html.includes("Fixture Player 1") || !result.html.includes("Numerology")) throw new Error("Fixture email HTML missing required content");
    console.log("[numerology-email] fixture validation passed");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[numerology-email] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
