import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "pga");
const PGA_HISTORY_PATH = path.join(DATA_DIR, "player-history.json");
const STATS_PATH = path.join(DATA_DIR, "player-stats-raw.json");
const LIV_PATH = path.join(DATA_DIR, "round-history-liv.json");
const DPWT_PATH = path.join(DATA_DIR, "round-history-dpwt.json");
const ALIASES_PATH = path.join(DATA_DIR, "player-aliases.json");

export const DEFAULT_TREND_CONFIG = Object.freeze({
  lookbackDays: 214,
  recencyDays: 28,
  officialMinRounds: 20,
  provisionalMinRounds: 12,
  recentRounds: 20,
  baselineRounds: 50,
  minEventRoundField: 8,
  minActualStrokes: 45,
  maxActualStrokes: 100,
  maxFieldRelative: 20,
  maxAdjustedPerformance: 20.75,
  maxWeightedRecent20: 8,
});

export function normalizeKey(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function normalizeEvent(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(the|presented by|championship|tournament)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

function readJson(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Could not parse ${path.relative(ROOT, filePath)}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function numeric(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function rounded(value, places = 2) {
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

function dateValue(value) {
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function incrementReason(reasons, reason, count = 1) {
  reasons[reason] = (reasons[reason] ?? 0) + count;
}

function mergeReasons(...sets) {
  const merged = {};
  for (const reasons of sets) {
    for (const [reason, count] of Object.entries(reasons ?? {})) incrementReason(merged, reason, count);
  }
  return merged;
}

function loadAliases() {
  const payload = readJson(ALIASES_PATH, { aliases: {} });
  const source = payload?.aliases && typeof payload.aliases === "object" ? payload.aliases : payload;
  const aliases = new Map();
  for (const [alias, canonical] of Object.entries(source ?? {})) aliases.set(normalizeKey(alias), String(canonical));
  return aliases;
}

function canonicalName(value, aliases) {
  const raw = String(value ?? "").trim();
  return aliases.get(normalizeKey(raw)) ?? raw;
}

export function normalizeRoundScore(value, options = {}) {
  const config = { ...DEFAULT_TREND_CONFIG, ...options.config };
  if (value == null || value === "") return { usable: false, reason: "missing_round_score" };
  const rawScore = Number(value);
  if (!Number.isFinite(rawScore) || !Number.isInteger(rawScore)) {
    return { usable: false, reason: "non_integer_round_score" };
  }

  const declaredUnit = String(options.declaredUnit ?? "").toLowerCase().replace(/[^a-z]/g, "_");
  let strokes = rawScore;
  let sourceScoreUnit = "inferred_actual_strokes";
  if (["relative_to_par", "to_par", "relative"].includes(declaredUnit)) {
    const coursePar = numeric(options.coursePar);
    if (coursePar == null || coursePar < 60 || coursePar > 80) {
      return { usable: false, reason: "relative_to_par_missing_course_par" };
    }
    strokes = rawScore + coursePar;
    sourceScoreUnit = "relative_to_par_converted_with_course_par";
  } else if (["strokes", "actual_strokes", "stroke"].includes(declaredUnit)) {
    sourceScoreUnit = "declared_actual_strokes";
  } else if (declaredUnit) {
    return { usable: false, reason: "unsupported_score_unit" };
  }

  // Repository audit: historical values outside 45-100 were Modified Stableford
  // points or multi-round team totals, not individual 18-hole stroke scores.
  if (strokes < config.minActualStrokes || strokes > config.maxActualStrokes) {
    const ambiguous = !declaredUnit && rawScore >= -15 && rawScore <= 20;
    return { usable: false, reason: ambiguous ? "unsupported_or_ambiguous_score_unit" : "round_score_out_of_range" };
  }
  return { usable: true, rawScore, strokes, scoreUnit: "actual_strokes", sourceScoreUnit };
}

export function eventIdentity(row) {
  const tour = String(row.tour ?? "UNKNOWN").toUpperCase();
  const eventId = String(row.eventId ?? "").trim();
  const season = Number(row.season ?? String(row.eventDate ?? "").slice(0, 4));
  if (eventId) return `${tour}:${Number.isFinite(season) ? season : "unknown"}:${eventId}`;
  return `${tour}:${String(row.eventDate ?? "").slice(0, 10)}:${normalizeEvent(row.eventName)}`;
}

export function flattenPgaHistory(payload, aliases = new Map(), config = DEFAULT_TREND_CONFIG) {
  const rounds = [];
  const rejectedReasons = {};
  let rawRoundCount = 0;
  for (const player of payload?.players ?? []) {
    const playerName = canonicalName(player.player, aliases);
    const results = Object.values(player.eventHistory ?? {}).flat();
    for (const result of results) {
      const eventDate = String(result.eventDate ?? "").slice(0, 10);
      for (const [roundKey, scoreValue] of Object.entries(result.rounds ?? {})) {
        rawRoundCount += 1;
        const roundNumber = numeric(String(roundKey).replace(/[^0-9]/g, ""));
        if (!playerName || !eventDate || roundNumber == null) {
          incrementReason(rejectedReasons, "missing_round_identity");
          continue;
        }
        const score = normalizeRoundScore(scoreValue, { config });
        if (!score.usable) {
          incrementReason(rejectedReasons, score.reason);
          continue;
        }
        const row = {
          tour: "PGA",
          player: playerName,
          playerId: player.playerId ?? null,
          season: numeric(result.season) ?? numeric(eventDate.slice(0, 4)),
          eventId: result.eventId ?? null,
          eventName: result.eventName ?? result.eventSlug ?? "PGA Tour event",
          eventDate,
          courseName: result.courseName ?? null,
          round: roundNumber,
          rawScore: score.rawScore,
          strokes: score.strokes,
          scoreUnit: score.scoreUnit,
          sourceScoreUnit: score.sourceScoreUnit,
          finishPosition: numeric(result.finishPosition),
          finishText: result.finishText ?? null,
          status: result.status ?? null,
          major: Boolean(result.majorType),
          sourceUrl: "https://www.pgatour.com/",
          sourceOperation: "PlayerTournamentHistory.playerProfileTournamentResults",
        };
        row.eventIdentity = eventIdentity(row);
        rounds.push(row);
      }
    }
  }
  return { rounds, rawRoundCount, rejectedReasons };
}

export function normalizeExternalPayload(payload, fallbackTour, aliases = new Map(), config = DEFAULT_TREND_CONFIG) {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.rounds) ? payload.rounds : [];
  const normalized = [];
  const rejectedReasons = {};
  for (const source of rows) {
    const score = normalizeRoundScore(source.strokes ?? source.roundScore ?? source.score, {
      config,
      declaredUnit: source.scoreUnit,
      coursePar: source.coursePar ?? source.par,
    });
    if (!score.usable) {
      incrementReason(rejectedReasons, score.reason);
      continue;
    }
    const row = {
      tour: String(source.tour ?? fallbackTour).toUpperCase(),
      player: canonicalName(source.player ?? source.playerName ?? source.name, aliases),
      playerId: source.playerId ?? null,
      season: numeric(source.season) ?? numeric(String(source.eventDate ?? source.date ?? "").slice(0, 4)),
      eventId: source.eventId ?? source.tournamentId ?? null,
      eventName: source.eventName ?? source.tournament ?? "External tour event",
      eventDate: String(source.eventDate ?? source.date ?? "").slice(0, 10),
      courseName: source.courseName ?? source.course ?? null,
      round: numeric(source.round ?? source.roundNumber),
      rawScore: score.rawScore,
      strokes: score.strokes,
      scoreUnit: score.scoreUnit,
      sourceScoreUnit: score.sourceScoreUnit,
      finishPosition: numeric(source.finishPosition ?? source.position),
      finishText: source.finishText ?? source.positionText ?? null,
      status: source.status ?? null,
      major: Boolean(source.major),
      sourceUrl: source.sourceUrl ?? payload?.sourceUrl ?? null,
      sourceOperation: source.sourceOperation ?? null,
    };
    if (!row.player || row.round == null || !row.eventDate) {
      incrementReason(rejectedReasons, "missing_round_identity");
      continue;
    }
    row.eventIdentity = eventIdentity(row);
    normalized.push(row);
  }
  return { rounds: normalized, rawRoundCount: rows.length, rejectedReasons };
}

export function dedupeRounds(rounds) {
  const priority = { PGA: 3, DPWT: 2, LIV: 1 };
  const byKey = new Map();
  const conflicts = new Set();
  const rejectedByTour = {};
  for (const row of rounds) {
    const playerIdentity = String(row.playerId ?? "").trim() || normalizeKey(row.player);
    const key = `${playerIdentity}|${row.eventIdentity}|${row.round}`;
    if (conflicts.has(key)) {
      incrementReason(rejectedByTour[row.tour] ??= {}, "conflicting_duplicate_round");
      continue;
    }
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    if (existing.strokes !== row.strokes || existing.scoreUnit !== row.scoreUnit) {
      byKey.delete(key);
      conflicts.add(key);
      incrementReason(rejectedByTour[existing.tour] ??= {}, "conflicting_duplicate_round");
      incrementReason(rejectedByTour[row.tour] ??= {}, "conflicting_duplicate_round");
      continue;
    }
    incrementReason(rejectedByTour[row.tour] ??= {}, "duplicate_round");
    if ((priority[row.tour] ?? 0) > (priority[existing.tour] ?? 0)) byKey.set(key, row);
  }
  return { rounds: [...byKey.values()], rejectedByTour };
}

function buildStatsMap(payload, aliases) {
  return new Map((Array.isArray(payload) ? payload : payload?.players ?? []).map((row) => [
    normalizeKey(canonicalName(row.player ?? row.playerName, aliases)),
    numeric(row.sgTotal),
  ]));
}

function buildRecentStartsMap(payload, aliases) {
  return new Map((payload?.players ?? []).map((player) => [
    normalizeKey(canonicalName(player.player, aliases)),
    (player.recentResults ?? []).slice(0, 5),
  ]));
}

function buildEventStrength(rounds, statsMap) {
  const playersByEvent = new Map();
  for (const row of rounds) {
    if (!playersByEvent.has(row.eventIdentity)) playersByEvent.set(row.eventIdentity, new Set());
    playersByEvent.get(row.eventIdentity).add(normalizeKey(row.player));
  }
  const globalValues = [...statsMap.values()].filter(Number.isFinite).sort((a, b) => a - b);
  const globalMedian = globalValues.length ? globalValues[Math.floor(globalValues.length / 2)] : 0;
  const result = new Map();
  for (const [identity, players] of playersByEvent) {
    const values = [...players].map((key) => statsMap.get(key)).filter(Number.isFinite).sort((a, b) => b - a).slice(0, 30);
    const fieldStrength = average(values) ?? globalMedian;
    result.set(identity, clamp((fieldStrength - globalMedian) * 0.45, -0.75, 0.75));
  }
  return result;
}

export function buildAdjustedRounds(rounds, statsMap = new Map(), config = DEFAULT_TREND_CONFIG) {
  const groups = new Map();
  for (const row of rounds) {
    const groupKey = `${row.eventIdentity}|round-${row.round}|${row.scoreUnit}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(row);
  }
  const eventStrength = buildEventStrength(rounds, statsMap);
  const adjusted = [];
  const excludedByTour = {};
  const validationErrors = [];
  for (const [groupKey, rows] of groups) {
    if (rows.length < config.minEventRoundField) {
      for (const row of rows) incrementReason(excludedByTour[row.tour] ??= {}, "insufficient_group_size");
      continue;
    }
    if (new Set(rows.map((row) => row.scoreUnit)).size !== 1) {
      validationErrors.push(`${groupKey} contains mixed score units.`);
      continue;
    }
    const fieldAverage = average(rows.map((row) => row.strokes));
    if (fieldAverage == null) continue;
    for (const row of rows) {
      const fieldRelative = fieldAverage - row.strokes;
      const strength = eventStrength.get(row.eventIdentity) ?? 0;
      const adjustedPerformance = fieldRelative + strength;
      if (Math.abs(fieldRelative) > config.maxFieldRelative) {
        validationErrors.push(`${row.player} ${groupKey} tracked-cohort-relative ${fieldRelative.toFixed(2)} exceeds ${config.maxFieldRelative}.`);
      }
      if (Math.abs(adjustedPerformance) > config.maxAdjustedPerformance) {
        validationErrors.push(`${row.player} ${groupKey} adjusted performance ${adjustedPerformance.toFixed(2)} exceeds ${config.maxAdjustedPerformance}.`);
      }
      adjusted.push({ ...row, eventRoundGroupKey: groupKey, fieldSize: rows.length, fieldAverage, fieldRelative, eventStrength: strength, adjustedPerformance });
    }
  }
  return { rounds: adjusted, excludedByTour, validationErrors };
}

export function finishValue(start) {
  const position = numeric(start.finishPosition);
  const status = String(start.status ?? "").toLowerCase();
  if (status.includes("withdraw") || status.includes("disqual")) return 0;
  if (status.includes("miss") || String(start.finishText ?? "").toUpperCase() === "MC") return 10;
  if (position == null) return 38;
  if (position === 1) return 100;
  if (position <= 5) return 90;
  if (position <= 10) return 80;
  if (position <= 20) return 68;
  if (position <= 40) return 52;
  return 38;
}

function percentileMap(rows, accessor) {
  const sorted = rows.map((row) => ({ key: row.key, value: accessor(row) })).filter((row) => Number.isFinite(row.value)).sort((a, b) => a.value - b.value || a.key.localeCompare(b.key));
  const map = new Map();
  sorted.forEach((row, index) => map.set(row.key, sorted.length <= 1 ? 50 : (index / (sorted.length - 1)) * 100));
  return map;
}

export function buildPlayerSummaries(adjustedRounds, statsMap = new Map(), options = {}) {
  const config = { ...DEFAULT_TREND_CONFIG, ...options.config };
  const asOf = options.asOf instanceof Date ? options.asOf : new Date(options.asOf ?? Date.now());
  const cutoff = new Date(asOf);
  cutoff.setUTCDate(cutoff.getUTCDate() - config.lookbackDays);
  const byPlayer = new Map();
  for (const row of adjustedRounds) {
    const parsedDate = dateValue(row.eventDate);
    if (!parsedDate || parsedDate < cutoff || parsedDate > asOf) continue;
    const key = normalizeKey(row.player);
    if (!byPlayer.has(key)) byPlayer.set(key, []);
    byPlayer.get(key).push(row);
  }

  const summaries = [];
  for (const [key, playerRounds] of byPlayer) {
    playerRounds.sort((left, right) => String(right.eventDate).localeCompare(String(left.eventDate))
      || Number(right.round) - Number(left.round)
      || String(left.eventIdentity).localeCompare(String(right.eventIdentity)));
    const recent = playerRounds.slice(0, config.recentRounds);
    const baselinePool = playerRounds.slice(config.recentRounds, config.baselineRounds);
    const recent20 = weightedAverage(recent.map((row) => row.adjustedPerformance), 8);
    const statsBaseline = statsMap.get(key);
    const baseline = weightedAverage(baselinePool.map((row) => row.adjustedPerformance), 24)
      ?? (Number.isFinite(statsBaseline) ? statsBaseline : recent20);
    const vsBaseline = recent20 != null && baseline != null ? recent20 - baseline : null;
    const starts = [...(options.recentStartsByPlayer?.get(key) ?? [])];
    if (!starts.length) {
      const seenStarts = new Set();
      for (const row of playerRounds) {
        if (seenStarts.has(row.eventIdentity)) continue;
        seenStarts.add(row.eventIdentity);
        starts.push(row);
        if (starts.length >= 5) break;
      }
    }
    const finishForm = weightedAverage(starts.map(finishValue), 2.5);
    const latestRoundDate = recent[0]?.eventDate ?? null;
    const latestDate = dateValue(latestRoundDate);
    const daysSinceLatest = latestDate ? Math.floor((asOf.getTime() - latestDate.getTime()) / 86_400_000) : 9999;
    const roundsUsed = recent.length;
    const confidence = roundsUsed >= config.officialMinRounds && daysSinceLatest <= config.recencyDays
      ? "official"
      : roundsUsed >= config.provisionalMinRounds ? "provisional" : "unranked";
    const sourceCounts = recent.reduce((counts, row) => {
      counts[row.tour] = (counts[row.tour] ?? 0) + 1;
      return counts;
    }, {});
    summaries.push({ key, player: recent[0]?.player ?? key, recent20, baseline, vsBaseline, finishForm, roundsUsed, startsUsed: starts.length, latestRoundDate, daysSinceLatest, confidence, sourceCounts, recentRounds: recent, baselineRounds: baselinePool, recentStarts: starts });
  }

  const rankable = summaries.filter((row) => row.confidence !== "unranked" && row.recent20 != null);
  const recentPct = percentileMap(rankable, (row) => row.recent20);
  const deltaPct = percentileMap(rankable, (row) => row.vsBaseline);
  rankable.forEach((row) => {
    row.recent20Percentile = recentPct.get(row.key) ?? 50;
    row.vsBaselinePercentile = deltaPct.get(row.key) ?? 50;
    row.trendScore = 0.70 * row.recent20Percentile + 0.20 * row.vsBaselinePercentile + 0.10 * (row.finishForm ?? 50);
  });
  rankable.sort((a, b) => b.trendScore - a.trendScore || b.recent20 - a.recent20 || a.player.localeCompare(b.player));
  rankable.forEach((row, index) => { row.rank = index + 1; });
  const rankMap = new Map(rankable.map((row) => [row.key, row]));
  return summaries.map((row) => ({ ...row, ...(rankMap.get(row.key) ?? { rank: null, trendScore: null, recent20Percentile: null, vsBaselinePercentile: null }) }))
    .sort((a, b) => (a.rank ?? 99999) - (b.rank ?? 99999) || a.player.localeCompare(b.player));
}

function sourceHealth(tour, rawRoundCount, normalizedRounds, usableRounds, rejectedReasons, sourceUrl) {
  const newestUsableRoundDate = usableRounds.map((row) => row.eventDate).filter(Boolean).sort().at(-1) ?? null;
  const rejectedRoundCount = Object.values(rejectedReasons).reduce((sum, count) => sum + count, 0);
  return {
    status: usableRounds.length ? "available" : "unavailable",
    tour,
    rawRoundCount,
    normalizedRoundCount: normalizedRounds.length,
    usableRoundCount: usableRounds.length,
    rejectedRoundCount,
    rejectedReasons,
    newestUsableRoundDate,
    sourceUrl,
  };
}

export function validateTrendOutput(context) {
  const { adjustedRounds, rankings, sources, config, asOf } = context;
  const errors = [...(context.validationErrors ?? [])];
  if (sources.PGA.status !== "available") errors.push("PGA has no usable normalized rounds.");
  if (!rankings.some((row) => row.rank != null)) errors.push("No players qualified for a JKB Trend rank.");
  for (const row of adjustedRounds) {
    if (row.scoreUnit !== "actual_strokes") errors.push(`${row.player} has non-normalized score unit ${row.scoreUnit}.`);
    if (row.fieldSize < config.minEventRoundField) errors.push(`${row.eventRoundGroupKey} has only ${row.fieldSize} rows.`);
    if (Math.abs(row.fieldRelative) > config.maxFieldRelative) errors.push(`${row.player} has extreme tracked-cohort-relative value ${row.fieldRelative}.`);
    if (Math.abs(row.adjustedPerformance) > config.maxAdjustedPerformance) errors.push(`${row.player} has extreme adjusted performance ${row.adjustedPerformance}.`);
  }
  for (const row of rankings) {
    if (row.recent20 != null && Math.abs(row.recent20) > config.maxWeightedRecent20) {
      errors.push(`${row.player} recent20 ${row.recent20.toFixed(2)} exceeds ${config.maxWeightedRecent20}.`);
    }
  }
  const newest = dateValue(sources.PGA.newestUsableRoundDate);
  if (!newest || Math.floor((asOf.getTime() - newest.getTime()) / 86_400_000) > config.recencyDays) {
    errors.push(`Newest usable PGA round ${sources.PGA.newestUsableRoundDate ?? "missing"} is stale.`);
  }
  if (errors.length) throw new Error(`JKB Trend validation failed:\n- ${errors.slice(0, 20).join("\n- ")}${errors.length > 20 ? `\n- ... ${errors.length - 20} more` : ""}`);
  return {
    status: "valid",
    checkedAt: asOf.toISOString(),
    minimumTrackedCohortSize: config.minEventRoundField,
    maximumTrackedCohortRelative: config.maxFieldRelative,
    maximumAdjustedPerformance: config.maxAdjustedPerformance,
    maximumWeightedRecent20: config.maxWeightedRecent20,
    checks: ["actual-strokes-only comparison groups", "coherent event identity", "duplicate observation removal", "minimum tracked-cohort size", "chronological recent-20 selection", "tracked-cohort-relative and weighted-output bounds", "recent PGA source freshness"],
  };
}

function prepareInputs(payloads, config, aliases) {
  const PGA = flattenPgaHistory(payloads.pgaHistory, aliases, config);
  const LIV = normalizeExternalPayload(payloads.liv, "LIV", aliases, config);
  const DPWT = normalizeExternalPayload(payloads.dpwt, "DPWT", aliases, config);
  const deduped = dedupeRounds([...PGA.rounds, ...LIV.rounds, ...DPWT.rounds]);
  const validationErrors = [];
  const metadataByEvent = new Map();
  for (const row of deduped.rounds) {
    if (!metadataByEvent.has(row.eventIdentity)) metadataByEvent.set(row.eventIdentity, new Set());
    metadataByEvent.get(row.eventIdentity).add(row.eventDate);
  }
  for (const [identity, dates] of metadataByEvent) {
    if (dates.size > 1) validationErrors.push(`${identity} resolves to multiple event dates: ${[...dates].join(", ")}.`);
  }
  return { PGA, LIV, DPWT, deduped, validationErrors };
}

export function generateTrendArtifacts(payloads, options = {}) {
  const config = { ...DEFAULT_TREND_CONFIG, ...options.config };
  const asOf = options.asOf instanceof Date ? options.asOf : new Date(options.asOf ?? Date.now());
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const aliases = options.aliases ?? new Map();
  const prepared = prepareInputs(payloads, config, aliases);
  const statsMap = buildStatsMap(payloads.stats, aliases);
  const recentStartsByPlayer = buildRecentStartsMap(payloads.pgaHistory, aliases);
  const adjusted = buildAdjustedRounds(prepared.deduped.rounds, statsMap, config);
  const rankings = buildPlayerSummaries(adjusted.rounds, statsMap, { config, asOf, recentStartsByPlayer });
  const sources = {};
  for (const tour of ["PGA", "LIV", "DPWT"]) {
    const input = prepared[tour];
    const normalized = prepared.deduped.rounds.filter((row) => row.tour === tour);
    const usable = adjusted.rounds.filter((row) => row.tour === tour);
    const rejectedReasons = mergeReasons(input.rejectedReasons, prepared.deduped.rejectedByTour[tour], adjusted.excludedByTour[tour]);
    const sourceUrl = tour === "PGA" ? "https://www.pgatour.com/" : tour === "LIV" ? "https://www.livgolf.com/leaderboard" : "https://www.europeantour.com/dpworld-tour/schedule/";
    sources[tour] = sourceHealth(tour, input.rawRoundCount, normalized, usable, rejectedReasons, sourceUrl);
  }
  const validation = validateTrendOutput({ adjustedRounds: adjusted.rounds, rankings, sources, config, asOf, validationErrors: [...prepared.validationErrors, ...adjusted.validationErrors] });
  const newestUsableRoundDate = Object.values(sources).map((source) => source.newestUsableRoundDate).filter(Boolean).sort().at(-1) ?? null;
  const playerRows = rankings.map((row) => ({
    player: row.player,
    rank: row.rank,
    trendScore: rounded(row.trendScore, 1),
    recent20: rounded(row.recent20),
    baseline: rounded(row.baseline),
    vsBaseline: rounded(row.vsBaseline),
    recent20Percentile: rounded(row.recent20Percentile, 1),
    vsBaselinePercentile: rounded(row.vsBaselinePercentile, 1),
    finishForm: rounded(row.finishForm, 1),
    roundsUsed: row.roundsUsed,
    startsUsed: row.startsUsed,
    latestRoundDate: row.latestRoundDate,
    confidence: row.confidence,
    sourceCounts: row.sourceCounts,
  }));
  const roundHistory = {
    version: 2,
    schemaVersion: "pga-round-history-actual-strokes-v2",
    source: "pga-tour-player-profile-results",
    sourceOperation: "PlayerTournamentHistory.playerProfileTournamentResults",
    generatedAt,
    health: sources.PGA,
    rounds: prepared.deduped.rounds.filter((row) => row.tour === "PGA"),
  };
  const rankingsArtifact = {
    version: 2,
    schemaVersion: "jkb-trend-rankings-v2",
    name: "JKB Trend Rank",
    generatedAt,
    asOf: asOf.toISOString(),
    newestUsableRoundDate,
    playerCount: playerRows.length,
    rankedPlayerCount: playerRows.filter((row) => row.rank != null).length,
    methodology: {
      lookbackDays: config.lookbackDays,
      recentRounds: config.recentRounds,
      baselineRounds: config.baselineRounds,
      officialMinRounds: config.officialMinRounds,
      provisionalMinRounds: config.provisionalMinRounds,
      recentRoundMaxAgeDays: config.recencyDays,
      comparisonPopulation: "available_tracked_players",
      minimumTrackedCohortSize: config.minEventRoundField,
      weights: { recent20: 0.70, versusBaseline: 0.20, lastFiveFinishes: 0.10 },
      scoreSchema: "Only actual 18-hole stroke scores in the validated 45-100 range are compared. Repository values outside that range are Modified Stableford points or multi-round team totals, not legitimate individual stroke-play rounds. Explicit relative-to-par rows require authoritative course par and are converted before grouping; ambiguous points, totals, and missing values are rejected.",
      note: "Each score is measured in strokes against the available tracked-player cohort for the same canonical event identity (official ID when available) and round, then adjusted by the existing bounded SG Total field-strength estimate. This is not a complete tournament-field average.",
    },
    validation,
    sources,
    players: playerRows,
  };
  return { roundHistory, rankingsArtifact, internalRankings: rankings, adjustedRounds: adjusted.rounds };
}

function diagnosticRow(row, includedIn) {
  return {
    eventId: row.eventId,
    eventName: row.eventName,
    eventDate: row.eventDate,
    courseName: row.courseName,
    roundNumber: row.round,
    storedRawScore: row.rawScore,
    interpretedScoreUnit: row.scoreUnit,
    eventRoundGroupKey: row.eventRoundGroupKey,
    trackedCohortSize: row.fieldSize,
    trackedCohortAverage: rounded(row.fieldAverage),
    playerVersusTrackedCohort: rounded(row.fieldRelative),
    fieldStrengthAdjustment: rounded(row.eventStrength),
    adjustedPerformance: rounded(row.adjustedPerformance),
    sourceTour: row.tour,
    shouldBeIncluded: true,
    includedIn,
  };
}

export function buildDiagnostics(result, playerNames) {
  const wanted = new Set(playerNames.map(normalizeKey));
  return {
    generatedAt: result.rankingsArtifact.generatedAt,
    asOf: result.rankingsArtifact.asOf,
    players: result.internalRankings.filter((row) => wanted.has(row.key)).map((row) => ({
      player: row.player,
      rank: row.rank,
      recent20: rounded(row.recent20),
      baseline: rounded(row.baseline),
      vsBaseline: rounded(row.vsBaseline),
      recent20Percentile: rounded(row.recent20Percentile, 1),
      vsBaselinePercentile: rounded(row.vsBaselinePercentile, 1),
      finishForm: rounded(row.finishForm, 1),
      trendScore: rounded(row.trendScore, 1),
      recentStarts: row.recentStarts.map((start) => ({ eventId: start.eventId ?? null, eventName: start.eventName ?? null, eventDate: start.eventDate ?? null, finishText: start.finishText ?? null, status: start.status ?? null })),
      recent20Rounds: row.recentRounds.map((round) => diagnosticRow(round, "recent20")),
      baselineRounds: row.baselineRounds.map((round) => diagnosticRow(round, "baseline")),
    })),
  };
}

function configFromEnvironment() {
  return {
    lookbackDays: Number(process.env.JKB_TREND_LOOKBACK_DAYS || DEFAULT_TREND_CONFIG.lookbackDays),
    recencyDays: Number(process.env.JKB_TREND_RECENCY_DAYS || DEFAULT_TREND_CONFIG.recencyDays),
    officialMinRounds: Number(process.env.JKB_TREND_OFFICIAL_MIN_ROUNDS || DEFAULT_TREND_CONFIG.officialMinRounds),
    provisionalMinRounds: Number(process.env.JKB_TREND_PROVISIONAL_MIN_ROUNDS || DEFAULT_TREND_CONFIG.provisionalMinRounds),
    recentRounds: Number(process.env.JKB_TREND_RECENT_ROUNDS || DEFAULT_TREND_CONFIG.recentRounds),
    baselineRounds: Number(process.env.JKB_TREND_BASELINE_ROUNDS || DEFAULT_TREND_CONFIG.baselineRounds),
    minEventRoundField: Number(process.env.JKB_TREND_MIN_FIELD || DEFAULT_TREND_CONFIG.minEventRoundField),
    minActualStrokes: DEFAULT_TREND_CONFIG.minActualStrokes,
    maxActualStrokes: DEFAULT_TREND_CONFIG.maxActualStrokes,
    maxFieldRelative: DEFAULT_TREND_CONFIG.maxFieldRelative,
    maxAdjustedPerformance: DEFAULT_TREND_CONFIG.maxAdjustedPerformance,
    maxWeightedRecent20: DEFAULT_TREND_CONFIG.maxWeightedRecent20,
  };
}

function parseArgs(values) {
  const args = { diagnosticPlayers: [] };
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (token === "--validate-input-only") args.validateInputOnly = true;
    else if (token === "--output-dir") args.outputDir = values[++index];
    else if (token === "--diagnostic-output") args.diagnosticOutput = values[++index];
    else if (token === "--diagnostic-player") args.diagnosticPlayers.push(values[++index]);
    else throw new Error(`Unknown argument ${token}`);
  }
  return args;
}

function writeJson(filePath, payload) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function loadPayloads() {
  return {
    pgaHistory: readJson(PGA_HISTORY_PATH, { players: [] }),
    stats: readJson(STATS_PATH, []),
    liv: readJson(LIV_PATH, { rounds: [] }),
    dpwt: readJson(DPWT_PATH, { rounds: [] }),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = configFromEnvironment();
  const aliases = loadAliases();
  const payloads = loadPayloads();
  if (args.validateInputOnly) {
    const prepared = prepareInputs(payloads, config, aliases);
    if (!prepared.PGA.rounds.length) throw new Error("PGA round-schema validation found zero normalized rounds.");
    if (prepared.validationErrors.length) throw new Error(`PGA event-identity validation failed: ${prepared.validationErrors.join("; ")}`);
    console.log(`[jkb-trend] Round schema valid: ${prepared.PGA.rounds.length}/${prepared.PGA.rawRoundCount} PGA rows normalized; ${prepared.PGA.rawRoundCount - prepared.PGA.rounds.length} rejected before grouping.`);
    return;
  }

  const asOf = process.env.JKB_TREND_AS_OF ? new Date(process.env.JKB_TREND_AS_OF) : new Date();
  const result = generateTrendArtifacts(payloads, { config, asOf, aliases });
  const outputDir = path.resolve(ROOT, args.outputDir ?? DATA_DIR);
  writeJson(path.join(outputDir, "round-history-pga.json"), result.roundHistory);
  writeJson(path.join(outputDir, "jkb-trend-rankings.json"), result.rankingsArtifact);
  if (args.diagnosticOutput) writeJson(path.resolve(ROOT, args.diagnosticOutput), buildDiagnostics(result, args.diagnosticPlayers));
  console.log(`[jkb-trend] PGA ${result.rankingsArtifact.sources.PGA.usableRoundCount} usable rounds · LIV ${result.rankingsArtifact.sources.LIV.status} · DPWT ${result.rankingsArtifact.sources.DPWT.status}`);
  console.log(`[jkb-trend] Ranked ${result.rankingsArtifact.rankedPlayerCount} players; validated output written to ${path.relative(ROOT, outputDir)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`[jkb-trend] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
