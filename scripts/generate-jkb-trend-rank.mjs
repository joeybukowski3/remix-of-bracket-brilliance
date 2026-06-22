import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "pga");
const PGA_HISTORY_PATH = path.join(DATA_DIR, "player-history.json");
const STATS_PATH = path.join(DATA_DIR, "player-stats-raw.json");
const LIV_PATH = path.join(DATA_DIR, "round-history-liv.json");
const DPWT_PATH = path.join(DATA_DIR, "round-history-dpwt.json");
const ALIASES_PATH = path.join(DATA_DIR, "player-aliases.json");
const PGA_ROUNDS_PATH = path.join(DATA_DIR, "round-history-pga.json");
const OUTPUT_PATH = path.join(DATA_DIR, "jkb-trend-rankings.json");

const LOOKBACK_DAYS = Number(process.env.JKB_TREND_LOOKBACK_DAYS || 214);
const RECENCY_DAYS = Number(process.env.JKB_TREND_RECENCY_DAYS || 28);
const OFFICIAL_MIN_ROUNDS = Number(process.env.JKB_TREND_OFFICIAL_MIN_ROUNDS || 20);
const PROVISIONAL_MIN_ROUNDS = Number(process.env.JKB_TREND_PROVISIONAL_MIN_ROUNDS || 12);
const RECENT_ROUNDS = Number(process.env.JKB_TREND_RECENT_ROUNDS || 20);
const BASELINE_ROUNDS = Number(process.env.JKB_TREND_BASELINE_ROUNDS || 50);
const MIN_EVENT_ROUND_FIELD = Number(process.env.JKB_TREND_MIN_FIELD || 8);
const NOW = process.env.JKB_TREND_AS_OF ? new Date(process.env.JKB_TREND_AS_OF) : new Date();

function readJson(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Could not parse ${path.relative(ROOT, filePath)}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizeKey(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function normalizeEvent(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(the|presented by|championship|tournament)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

function dateValue(value) {
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, places = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function average(values) {
  const usable = values.filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function weightedAverage(values, halfLife) {
  if (!values.length) return null;
  let weightedTotal = 0;
  let weightTotal = 0;
  values.forEach((value, index) => {
    if (!Number.isFinite(value)) return;
    const weight = Math.pow(0.5, index / Math.max(halfLife, 1));
    weightedTotal += value * weight;
    weightTotal += weight;
  });
  return weightTotal ? weightedTotal / weightTotal : null;
}

function loadAliases() {
  const payload = readJson(ALIASES_PATH, { aliases: {} });
  const source = payload?.aliases && typeof payload.aliases === "object" ? payload.aliases : payload;
  const aliases = new Map();
  for (const [alias, canonical] of Object.entries(source ?? {})) {
    aliases.set(normalizeKey(alias), String(canonical));
  }
  return aliases;
}

const aliases = loadAliases();
function canonicalName(value) {
  const raw = String(value ?? "").trim();
  return aliases.get(normalizeKey(raw)) ?? raw;
}

function flattenPgaHistory(payload) {
  const rounds = [];
  const seenStarts = new Set();
  for (const player of payload?.players ?? []) {
    const playerName = canonicalName(player.player);
    const results = Object.values(player.eventHistory ?? {}).flat();
    for (const result of results) {
      const startKey = `${normalizeKey(playerName)}|${result.eventId ?? result.eventSlug ?? result.eventName}|${result.eventDate ?? result.season}`;
      if (seenStarts.has(startKey)) continue;
      seenStarts.add(startKey);
      const eventDate = String(result.eventDate ?? "").slice(0, 10);
      for (const [roundKey, scoreValue] of Object.entries(result.rounds ?? {})) {
        const strokes = numeric(scoreValue);
        if (strokes == null) continue;
        const roundNumber = numeric(String(roundKey).replace(/[^0-9]/g, ""));
        if (roundNumber == null) continue;
        rounds.push({
          tour: "PGA",
          player: playerName,
          playerId: player.playerId ?? null,
          eventId: result.eventId ?? result.eventSlug ?? null,
          eventName: result.eventName ?? result.eventSlug ?? "PGA Tour event",
          eventDate,
          courseName: result.courseName ?? null,
          round: roundNumber,
          strokes,
          finishPosition: numeric(result.finishPosition),
          finishText: result.finishText ?? null,
          status: result.status ?? null,
          major: Boolean(result.majorType),
          sourceUrl: "https://www.pgatour.com/",
        });
      }
    }
  }
  return rounds;
}

function normalizeExternalPayload(payload, fallbackTour) {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.rounds) ? payload.rounds : [];
  return rows.map((row) => ({
    tour: String(row.tour ?? fallbackTour).toUpperCase(),
    player: canonicalName(row.player ?? row.playerName ?? row.name),
    playerId: row.playerId ?? null,
    eventId: row.eventId ?? row.tournamentId ?? null,
    eventName: row.eventName ?? row.tournament ?? "External tour event",
    eventDate: String(row.eventDate ?? row.date ?? "").slice(0, 10),
    courseName: row.courseName ?? row.course ?? null,
    round: numeric(row.round ?? row.roundNumber),
    strokes: numeric(row.strokes ?? row.roundScore ?? row.score),
    finishPosition: numeric(row.finishPosition ?? row.position),
    finishText: row.finishText ?? row.positionText ?? null,
    status: row.status ?? null,
    major: Boolean(row.major),
    sourceUrl: row.sourceUrl ?? payload?.sourceUrl ?? null,
  })).filter((row) => row.player && row.round != null && row.strokes != null && row.eventDate);
}

function dedupeRounds(rounds) {
  const priority = { PGA: 3, DPWT: 2, LIV: 1 };
  const byKey = new Map();
  for (const row of rounds) {
    const eventIdentity = `${row.eventDate}|${normalizeEvent(row.eventName)}|${normalizeKey(row.courseName)}`;
    const key = `${normalizeKey(row.player)}|${eventIdentity}|${row.round}`;
    const existing = byKey.get(key);
    if (!existing || (priority[row.tour] ?? 0) > (priority[existing.tour] ?? 0)) byKey.set(key, row);
  }
  return [...byKey.values()];
}

function buildStatsMap(payload) {
  return new Map((Array.isArray(payload) ? payload : payload?.players ?? []).map((row) => [
    normalizeKey(canonicalName(row.player ?? row.playerName)),
    numeric(row.sgTotal),
  ]));
}

function buildEventStrength(rounds, statsMap) {
  const playersByEvent = new Map();
  for (const row of rounds) {
    const eventKey = `${row.eventDate}|${normalizeEvent(row.eventName)}|${normalizeKey(row.courseName)}`;
    if (!playersByEvent.has(eventKey)) playersByEvent.set(eventKey, new Set());
    playersByEvent.get(eventKey).add(normalizeKey(row.player));
  }
  const globalValues = [...statsMap.values()].filter(Number.isFinite).sort((a, b) => a - b);
  const globalMedian = globalValues.length ? globalValues[Math.floor(globalValues.length / 2)] : 0;
  const result = new Map();
  for (const [eventKey, players] of playersByEvent) {
    const values = [...players]
      .map((key) => statsMap.get(key))
      .filter(Number.isFinite)
      .sort((a, b) => b - a)
      .slice(0, 30);
    const fieldStrength = average(values) ?? globalMedian;
    result.set(eventKey, clamp((fieldStrength - globalMedian) * 0.45, -0.75, 0.75));
  }
  return result;
}

function buildAdjustedRounds(rounds, statsMap) {
  const groups = new Map();
  for (const row of rounds) {
    const eventKey = `${row.eventDate}|${normalizeEvent(row.eventName)}|${normalizeKey(row.courseName)}`;
    const groupKey = `${eventKey}|${row.round}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(row);
  }
  const eventStrength = buildEventStrength(rounds, statsMap);
  const adjusted = [];
  for (const rows of groups.values()) {
    if (rows.length < MIN_EVENT_ROUND_FIELD) continue;
    const fieldAverage = average(rows.map((row) => row.strokes));
    if (fieldAverage == null) continue;
    for (const row of rows) {
      const eventKey = `${row.eventDate}|${normalizeEvent(row.eventName)}|${normalizeKey(row.courseName)}`;
      adjusted.push({
        ...row,
        eventKey,
        fieldSize: rows.length,
        fieldAverage,
        fieldRelative: fieldAverage - row.strokes,
        eventStrength: eventStrength.get(eventKey) ?? 0,
        adjustedPerformance: fieldAverage - row.strokes + (eventStrength.get(eventKey) ?? 0),
      });
    }
  }
  return adjusted;
}

function finishValue(start) {
  const position = numeric(start.finishPosition);
  if (String(start.status ?? "").toLowerCase().includes("withdraw") || String(start.status ?? "").toLowerCase().includes("disqual")) return 0;
  if (String(start.status ?? "").toLowerCase().includes("miss") || String(start.finishText ?? "").toUpperCase() === "MC") return 10;
  if (position == null) return 38;
  if (position === 1) return 100;
  if (position <= 5) return 90;
  if (position <= 10) return 80;
  if (position <= 20) return 68;
  if (position <= 40) return 52;
  return 38;
}

function percentileMap(rows, accessor) {
  const sorted = rows
    .map((row) => ({ key: row.key, value: accessor(row) }))
    .filter((row) => Number.isFinite(row.value))
    .sort((a, b) => a.value - b.value);
  const map = new Map();
  sorted.forEach((row, index) => map.set(row.key, sorted.length <= 1 ? 50 : (index / (sorted.length - 1)) * 100));
  return map;
}

function buildPlayerSummaries(adjustedRounds, statsMap) {
  const cutoff = new Date(NOW);
  cutoff.setUTCDate(cutoff.getUTCDate() - LOOKBACK_DAYS);
  const byPlayer = new Map();
  for (const row of adjustedRounds) {
    const parsedDate = dateValue(row.eventDate);
    if (!parsedDate || parsedDate < cutoff || parsedDate > NOW) continue;
    const key = normalizeKey(row.player);
    if (!byPlayer.has(key)) byPlayer.set(key, []);
    byPlayer.get(key).push(row);
  }

  const summaries = [];
  for (const [key, playerRounds] of byPlayer) {
    playerRounds.sort((left, right) => {
      const dateCompare = String(right.eventDate).localeCompare(String(left.eventDate));
      return dateCompare || Number(right.round) - Number(left.round);
    });
    const recent = playerRounds.slice(0, RECENT_ROUNDS);
    const baselinePool = playerRounds.slice(RECENT_ROUNDS, BASELINE_ROUNDS);
    const recent20 = weightedAverage(recent.map((row) => row.adjustedPerformance), 8);
    const statsBaseline = statsMap.get(key);
    const baseline = weightedAverage(baselinePool.map((row) => row.adjustedPerformance), 24)
      ?? (Number.isFinite(statsBaseline) ? statsBaseline : recent20);
    const vsBaseline = recent20 != null && baseline != null ? recent20 - baseline : null;
    const starts = [];
    const seenStarts = new Set();
    for (const row of playerRounds) {
      if (seenStarts.has(row.eventKey)) continue;
      seenStarts.add(row.eventKey);
      starts.push(row);
      if (starts.length >= 5) break;
    }
    const finishForm = weightedAverage(starts.map(finishValue), 2.5);
    const latestRoundDate = recent[0]?.eventDate ?? null;
    const latestDate = dateValue(latestRoundDate);
    const daysSinceLatest = latestDate ? Math.floor((NOW.getTime() - latestDate.getTime()) / 86400000) : 9999;
    const roundsUsed = recent.length;
    const confidence = roundsUsed >= OFFICIAL_MIN_ROUNDS && daysSinceLatest <= RECENCY_DAYS
      ? "official"
      : roundsUsed >= PROVISIONAL_MIN_ROUNDS
        ? "provisional"
        : "unranked";
    const sourceCounts = recent.reduce((counts, row) => {
      counts[row.tour] = (counts[row.tour] ?? 0) + 1;
      return counts;
    }, {});
    summaries.push({
      key,
      player: recent[0]?.player ?? key,
      recent20,
      baseline,
      vsBaseline,
      finishForm,
      roundsUsed,
      startsUsed: starts.length,
      latestRoundDate,
      daysSinceLatest,
      confidence,
      sourceCounts,
    });
  }

  const rankable = summaries.filter((row) => row.confidence !== "unranked" && row.recent20 != null);
  const recentPct = percentileMap(rankable, (row) => row.recent20);
  const deltaPct = percentileMap(rankable, (row) => row.vsBaseline);
  rankable.forEach((row) => {
    row.trendScore = 0.70 * (recentPct.get(row.key) ?? 50)
      + 0.20 * (deltaPct.get(row.key) ?? 50)
      + 0.10 * (row.finishForm ?? 50);
  });
  rankable.sort((a, b) => b.trendScore - a.trendScore || b.recent20 - a.recent20 || a.player.localeCompare(b.player));
  rankable.forEach((row, index) => { row.rank = index + 1; });

  const rankMap = new Map(rankable.map((row) => [row.key, row]));
  return summaries
    .map((row) => ({ ...row, ...(rankMap.get(row.key) ?? { rank: null, trendScore: null }) }))
    .sort((a, b) => (a.rank ?? 99999) - (b.rank ?? 99999) || a.player.localeCompare(b.player));
}

function main() {
  const pgaHistory = readJson(PGA_HISTORY_PATH, { players: [] });
  const stats = readJson(STATS_PATH, []);
  const pgaRounds = flattenPgaHistory(pgaHistory);
  const livRounds = normalizeExternalPayload(readJson(LIV_PATH, { rounds: [] }), "LIV");
  const dpwtRounds = normalizeExternalPayload(readJson(DPWT_PATH, { rounds: [] }), "DPWT");
  const allRounds = dedupeRounds([...pgaRounds, ...livRounds, ...dpwtRounds]);
  const statsMap = buildStatsMap(stats);
  const adjustedRounds = buildAdjustedRounds(allRounds, statsMap);
  const rankings = buildPlayerSummaries(adjustedRounds, statsMap);
  const generatedAt = new Date().toISOString();

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(PGA_ROUNDS_PATH, JSON.stringify({
    version: 1,
    source: "pga-tour-player-profile-results",
    generatedAt,
    rounds: pgaRounds,
  }, null, 2) + "\n");

  writeFileSync(OUTPUT_PATH, JSON.stringify({
    version: 1,
    name: "JKB Trend Rank",
    generatedAt,
    asOf: NOW.toISOString(),
    methodology: {
      lookbackDays: LOOKBACK_DAYS,
      recentRounds: RECENT_ROUNDS,
      baselineRounds: BASELINE_ROUNDS,
      officialMinRounds: OFFICIAL_MIN_ROUNDS,
      provisionalMinRounds: PROVISIONAL_MIN_ROUNDS,
      recentRoundMaxAgeDays: RECENCY_DAYS,
      weights: { recent20: 0.70, versusBaseline: 0.20, lastFiveFinishes: 0.10 },
      note: "Round scores are measured against the same event-round field average, then adjusted by a bounded field-strength estimate derived from available PGA TOUR SG Total baselines.",
    },
    sources: {
      PGA: { rounds: pgaRounds.length, sourceUrl: "https://www.pgatour.com/" },
      LIV: { rounds: livRounds.length, sourceUrl: "https://www.livgolf.com/leaderboard" },
      DPWT: { rounds: dpwtRounds.length, sourceUrl: "https://www.europeantour.com/dpworld-tour/schedule/" },
    },
    players: rankings.map((row) => ({
      player: row.player,
      rank: row.rank,
      trendScore: round(row.trendScore, 1),
      recent20: round(row.recent20),
      baseline: round(row.baseline),
      vsBaseline: round(row.vsBaseline),
      finishForm: round(row.finishForm, 1),
      roundsUsed: row.roundsUsed,
      startsUsed: row.startsUsed,
      latestRoundDate: row.latestRoundDate,
      confidence: row.confidence,
      sourceCounts: row.sourceCounts,
    })),
  }, null, 2) + "\n");

  const ranked = rankings.filter((row) => row.rank != null).length;
  console.log(`[jkb-trend] PGA ${pgaRounds.length} rounds · LIV ${livRounds.length} · DPWT ${dpwtRounds.length}`);
  console.log(`[jkb-trend] Ranked ${ranked} players and wrote ${path.relative(ROOT, OUTPUT_PATH)}`);
}

main();
