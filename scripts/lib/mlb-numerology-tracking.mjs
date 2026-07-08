import fs from "node:fs";
import path from "node:path";
import { getEmailTeamColors, getEmailTeamLogoUrl, hexToRgbTriplet } from "./mlb-team-email-assets.mjs";

export const NUMEROLOGY_SCORE_THRESHOLD = 50;
export const NUMEROLOGY_MODEL_VERSION = "mlb-numerology-live-board-v0.2";
export const MLB_NUMEROLOGY_LIVE_URL = "https://www.joeknowsball.com/mlb/numerology";

export function getTodayEt(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function getYesterdayEt(now = new Date()) {
  const parts = getTodayEt(now).split("-").map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function ensureDirForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function loadJsonSafe(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.warn(`[mlb-numerology] Failed to parse ${filePath}: ${error.message}`);
    return fallback;
  }
}

export function writeJson(filePath, value) {
  ensureDirForFile(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function toFiniteNumber(value, fallback = null) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function roundNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

export function normalizeText(value) {
  return String(value ?? "").trim();
}

export function normalizeTeamCode(value) {
  return normalizeText(value).toUpperCase();
}

export function normalizeName(value) {
  return normalizeText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/gi, "")
    .replace(/[^a-z0-9\s'-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function digitalRoot(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  let total = digits.split("").reduce((sum, digit) => sum + Number(digit), 0);
  while (total > 9) {
    total = String(total).split("").reduce((sum, digit) => sum + Number(digit), 0);
  }
  return total;
}

export function nameNumber(value) {
  const letters = normalizeText(value).toUpperCase().replace(/[^A-Z]/g, "");
  if (!letters) return null;
  const total = letters.split("").reduce((sum, char) => sum + (char.charCodeAt(0) - 64), 0);
  return digitalRoot(total);
}

function addSignal(signals, label, matched, weight, detail) {
  signals.push({
    label,
    matched,
    weight,
    points: matched ? weight : 0,
    detail,
  });
}

export function computeNumerologyScore(row, date) {
  const dailyNumber = digitalRoot(date);
  const player = normalizeText(row?.player);
  const team = normalizeTeamCode(row?.team);
  const opponent = normalizeTeamCode(row?.opponent);
  const battingOrder = toFiniteNumber(row?.battingOrder, null);
  const playerId = normalizeText(row?.playerId);
  const hrScore = toFiniteNumber(row?.hrScore, null);
  const last7HR = toFiniteNumber(row?.last7HR, 0);
  const last30HR = toFiniteNumber(row?.last30HR, 0);

  const playerNameNumber = nameNumber(player);
  const playerIdNumber = digitalRoot(playerId);
  const battingOrderNumber = battingOrder == null ? null : digitalRoot(battingOrder);
  const teamNumber = nameNumber(team);
  const opponentNumber = nameNumber(opponent);
  const gameKeyNumber = nameNumber(row?.gameKey);
  const last7Number = digitalRoot(last7HR);
  const last30Number = digitalRoot(last30HR);

  const signals = [];
  addSignal(signals, "Player name number", playerNameNumber === dailyNumber, 18, `${playerNameNumber ?? "?"} vs daily ${dailyNumber ?? "?"}`);
  addSignal(signals, "Player ID number", playerIdNumber === dailyNumber, 16, `${playerIdNumber ?? "?"} vs daily ${dailyNumber ?? "?"}`);
  addSignal(signals, "Batting-order number", battingOrderNumber === dailyNumber, 16, `${battingOrderNumber ?? "?"} vs daily ${dailyNumber ?? "?"}`);
  addSignal(signals, "Team number", teamNumber === dailyNumber, 10, `${teamNumber ?? "?"} vs daily ${dailyNumber ?? "?"}`);
  addSignal(signals, "Opponent number", opponentNumber === dailyNumber, 8, `${opponentNumber ?? "?"} vs daily ${dailyNumber ?? "?"}`);
  addSignal(signals, "Game-key number", gameKeyNumber === dailyNumber, 8, `${gameKeyNumber ?? "?"} vs daily ${dailyNumber ?? "?"}`);
  addSignal(signals, "Player ID contains daily number", playerId && dailyNumber != null && playerId.includes(String(dailyNumber)), 8, `ID ${playerId || "?"}`);
  addSignal(signals, "Last 7 HR number", last7Number === dailyNumber && last7HR > 0, 6, `${last7HR} HR`);
  addSignal(signals, "Last 30 HR number", last30Number === dailyNumber && last30HR > 0, 6, `${last30HR} HR`);

  let hrContextPoints = 0;
  let hrContextDetail = "HR quality unavailable";
  if (hrScore >= 75) {
    hrContextPoints = 20;
    hrContextDetail = `elite HR score ${roundNumber(hrScore, 1)}`;
  } else if (hrScore >= 65) {
    hrContextPoints = 14;
    hrContextDetail = `strong HR score ${roundNumber(hrScore, 1)}`;
  } else if (hrScore >= 55) {
    hrContextPoints = 8;
    hrContextDetail = `solid HR score ${roundNumber(hrScore, 1)}`;
  } else if (hrScore >= 45) {
    hrContextPoints = 4;
    hrContextDetail = `watchlist HR score ${roundNumber(hrScore, 1)}`;
  }
  signals.push({
    label: "HR context boost",
    matched: hrContextPoints > 0,
    weight: 20,
    points: hrContextPoints,
    detail: hrContextDetail,
  });

  const rawScore = signals.reduce((sum, signal) => sum + signal.points, 0);
  return {
    dailyNumber,
    playerNameNumber,
    playerIdNumber,
    battingOrderNumber,
    numerologyScore: Math.min(100, Math.round(rawScore)),
    signals,
    matchedSignals: signals.filter((signal) => signal.points > 0),
  };
}

export function buildPlayFromRow(row, { date, isTopPlay = false } = {}) {
  const score = computeNumerologyScore(row, date);
  return {
    date,
    player: normalizeText(row.player),
    playerId: toFiniteNumber(row.playerId, null),
    team: normalizeTeamCode(row.team),
    opponent: normalizeTeamCode(row.opponent),
    gameId: toFiniteNumber(row.gameId, null),
    gameKey: normalizeText(row.gameKey),
    battingOrder: toFiniteNumber(row.battingOrder, null),
    position: normalizeText(row.position),
    opposingPitcher: normalizeText(row.opposingPitcher),
    opposingPitcherId: toFiniteNumber(row.opposingPitcherId, null),
    ballpark: normalizeText(row.ballpark),
    pitcherHand: normalizeText(row.pitcherHand),
    lineupStatus: normalizeText(row.lineupStatus),
    starterConfirmed: row.starterConfirmed === true,
    hrScore: roundNumber(toFiniteNumber(row.hrScore, null), 1),
    hrScoreRank: toFiniteNumber(row.hrScoreRank, null),
    candidateHrQualityScore: roundNumber(toFiniteNumber(row.candidateHrQualityScore, null), 1),
    candidateRank: toFiniteNumber(row.candidateRank, null),
    last7HR: toFiniteNumber(row.last7HR, 0),
    last30HR: toFiniteNumber(row.last30HR, 0),
    hrOddsYes: normalizeText(row.hrOddsYes),
    hrOddsBook: normalizeText(row.hrOddsBook),
    marketImpliedProbability: toFiniteNumber(row.marketImpliedProbability, null),
    explanation: normalizeText(row.explanation),
    angleTags: Array.isArray(row.angleTags) ? row.angleTags.map(normalizeText).filter(Boolean) : [],
    numerologyScore: score.numerologyScore,
    dailyNumber: score.dailyNumber,
    numerologyNumbers: {
      playerName: score.playerNameNumber,
      playerId: score.playerIdNumber,
      battingOrder: score.battingOrderNumber,
    },
    numerologySignals: score.matchedSignals,
    allNumerologySignals: score.signals,
    isTopPlay,
    qualifiesOver50: score.numerologyScore > NUMEROLOGY_SCORE_THRESHOLD,
  };
}

function qualifiesDefaultActivity(row) {
  const activity = row?.recentActivity;
  if (!activity) return true;
  if (typeof activity.qualifiesDefault === "boolean") return activity.qualifiesDefault;
  if (activity.atBatsPrevious2 != null) return toFiniteNumber(activity.atBatsPrevious2, 0) >= 3;
  if (activity.atBats != null) return toFiniteNumber(activity.atBats, 0) >= 3;
  return true;
}

function getLiveBoardRows(payload) {
  const exact = Array.isArray(payload?.exactNumberMatches) ? payload.exactNumberMatches : [];
  const root = Array.isArray(payload?.rootNumberMatches) ? payload.rootNumberMatches : [];
  if (exact.length || root.length) {
    return [
      ...exact.map((row) => ({ row, matchType: "Exact Match", matchPriority: 0 })),
      ...root.map((row) => ({ row, matchType: "Root Match", matchPriority: 1 })),
    ];
  }

  const featured = Array.isArray(payload?.featuredPlays) ? payload.featuredPlays : [];
  const watchlist = Array.isArray(payload?.watchlist) ? payload.watchlist : [];
  return [
    ...featured.map((row) => ({ row, matchType: "Featured", matchPriority: 2 })),
    ...watchlist.map((row) => ({ row, matchType: "Watchlist", matchPriority: 3 })),
  ];
}

function normalizeMatchKey(value) {
  return normalizeName(value).replace(/\s+/g, "");
}

function buildHrEnrichmentIndex(hrPayload) {
  const batters = Array.isArray(hrPayload?.batters) ? hrPayload.batters : [];
  const idTeam = new Map();
  const nameTeam = new Map();
  const nameOnly = new Map();

  for (const row of batters) {
    const team = normalizeTeamCode(row?.team);
    const playerId = normalizeText(row?.playerId);
    const name = normalizeMatchKey(row?.player);
    if (playerId && team) idTeam.set(`${playerId}|${team}`, row);
    if (name && team) nameTeam.set(`${name}|${team}`, row);
    if (name && !nameOnly.has(name)) nameOnly.set(name, row);
  }

  return {
    available: Boolean(hrPayload),
    sourceDate: normalizeText(hrPayload?.date),
    generatedAt: normalizeText(hrPayload?.generatedAt),
    modelVersion: normalizeText(hrPayload?.modelVersion),
    batterCount: batters.length,
    find(row) {
      if (!hrPayload) return { status: "missing-hr-source", row: null };
      const team = normalizeTeamCode(row?.team);
      const playerId = normalizeText(row?.playerId ?? row?.personId);
      const name = normalizeMatchKey(row?.playerName ?? row?.player);
      const match = (playerId && team ? idTeam.get(`${playerId}|${team}`) : null)
        ?? (name && team ? nameTeam.get(`${name}|${team}`) : null)
        ?? (name ? nameOnly.get(name) : null)
        ?? null;
      return { status: match ? "enriched" : "no-hr-match", row: match };
    },
  };
}

function mapScoredSignal(signal) {
  return {
    label: normalizeText(signal.label || signal.field),
    matched: true,
    points: toFiniteNumber(signal.points, 0),
    weight: toFiniteNumber(signal.rawPoints, toFiniteNumber(signal.points, 0)),
    detail: normalizeText(signal.description),
    field: normalizeText(signal.field),
    type: normalizeText(signal.type),
    value: signal.value ?? null,
  };
}

function mapMatchSignal(match) {
  return {
    label: normalizeText(match.label || match.field),
    matched: true,
    points: toFiniteNumber(match.points, null),
    weight: null,
    detail: normalizeText(match.description),
    field: normalizeText(match.field),
    type: normalizeText(match.type) || "live-board-match",
    value: match.value ?? null,
    root: match.root ?? null,
  };
}

// Priority order for surfacing what actually drove a live-board player's
// score: scoreBreakdown.signals (richest — points/type/description) takes
// precedence over the simpler `matches` array, which in turn beats
// positiveSignals and the single-string primarySignal fallback. Every
// matched signal is returned (no arbitrary cap) so the email can show every
// score-driving match, not just the first few.
function extractLiveSignals(row) {
  const scoreBreakdownSignals = Array.isArray(row?.scoreBreakdown?.signals) ? row.scoreBreakdown.signals : [];
  if (scoreBreakdownSignals.length) {
    return scoreBreakdownSignals.filter((signal) => toFiniteNumber(signal?.points, 0) > 0).map(mapScoredSignal);
  }
  if (Array.isArray(row?.matches) && row.matches.length) {
    return row.matches.map(mapMatchSignal);
  }
  const positiveSignals = Array.isArray(row?.positiveSignals) ? row.positiveSignals : [];
  if (positiveSignals.length) {
    return positiveSignals.filter((signal) => toFiniteNumber(signal?.points, 0) > 0).map(mapScoredSignal);
  }
  if (row?.primarySignal) {
    return [{
      label: normalizeText(row.primarySignal),
      matched: true,
      points: null,
      weight: null,
      detail: "Primary live-board signal",
      field: "primarySignal",
      type: "live-board-match",
      value: null,
    }];
  }
  return [];
}

function buildHrContext(hrRow, status) {
  if (!hrRow) return { enrichmentStatus: status };
  return {
    enrichmentStatus: status,
    gameId: toFiniteNumber(hrRow.gameId, null),
    gameKey: normalizeText(hrRow.gameKey),
    opposingPitcher: normalizeText(hrRow.opposingPitcher),
    opposingPitcherId: toFiniteNumber(hrRow.opposingPitcherId, null),
    pitcherHand: normalizeText(hrRow.pitcherHand),
    ballpark: normalizeText(hrRow.ballpark),
    hrScore: roundNumber(toFiniteNumber(hrRow.hrScore, null), 1),
    hrScoreRank: toFiniteNumber(hrRow.hrScoreRank ?? hrRow.qualityRank, null),
    hrOddsYes: normalizeText(hrRow.hrOddsYes),
    hrOddsBook: normalizeText(hrRow.hrOddsBook),
    marketImpliedProbability: toFiniteNumber(hrRow.marketImpliedProbability ?? hrRow.hrImplied, null),
    barrelRate: roundNumber(toFiniteNumber(hrRow.barrelRate, null), 1),
    hardHitRate: roundNumber(toFiniteNumber(hrRow.hardHitRate, null), 1),
    iso: roundNumber(toFiniteNumber(hrRow.iso, null), 3),
    last7HR: toFiniteNumber(hrRow.last7HR, null),
    last30HR: toFiniteNumber(hrRow.last30HR, null),
    opposingPitcherHrVs: roundNumber(toFiniteNumber(hrRow.opposingPitcherHrVs, null), 1),
    explanation: normalizeText(hrRow.explanation),
    angleTags: Array.isArray(hrRow.angleTags) ? hrRow.angleTags.map(normalizeText).filter(Boolean) : [],
  };
}

function buildPlayFromLiveBoard(row, { date, matchType, matchPriority, hrIndex }) {
  const { status, row: hrRow } = hrIndex.find(row);
  const hrContext = buildHrContext(hrRow, status);
  const numerologyScore = toFiniteNumber(row?.numerologyScore, 0);
  const baseballScore = toFiniteNumber(row?.baseballScore ?? row?.modelRating, null);
  const player = normalizeText(row?.playerName ?? row?.player);
  const team = normalizeTeamCode(row?.team);
  const opponent = normalizeTeamCode(row?.opponent);

  return {
    date,
    player,
    playerId: toFiniteNumber(row?.playerId ?? row?.personId, null),
    personId: toFiniteNumber(row?.personId ?? row?.playerId, null),
    team,
    opponent,
    gameId: hrContext.gameId ?? toFiniteNumber(row?.gameId, null),
    gameKey: hrContext.gameKey || normalizeText(row?.gameKey),
    matchup: team && opponent ? `${team} vs ${opponent}` : "",
    matchType,
    matchPriority,
    opposingPitcher: hrContext.opposingPitcher || normalizeText(row?.opposingPitcher),
    opposingPitcherId: hrContext.opposingPitcherId ?? toFiniteNumber(row?.opposingPitcherId, null),
    pitcherHand: hrContext.pitcherHand || normalizeText(row?.pitcherHand),
    ballpark: hrContext.ballpark || normalizeText(row?.ballpark),
    lineupStatus: normalizeText(row?.lineupStatus),
    battingOrder: toFiniteNumber(row?.battingOrder, null),
    jerseyNumber: toFiniteNumber(row?.jerseyNumber, null),
    recommendedMarket: normalizeText(row?.recommendedMarket),
    numerologyScore,
    dailyNumber: digitalRoot(date),
    baseballScore,
    modelRating: baseballScore,
    finalScore: toFiniteNumber(row?.finalScore, numerologyScore),
    marketScore: roundNumber(toFiniteNumber(row?.marketScore ?? row?.hrScore, null), 1),
    hrScore: hrContext.hrScore ?? roundNumber(toFiniteNumber(row?.hrScore, null), 1),
    hrScoreRank: hrContext.hrScoreRank,
    hrOddsYes: hrContext.hrOddsYes,
    hrOddsBook: hrContext.hrOddsBook,
    marketImpliedProbability: hrContext.marketImpliedProbability,
    barrelRate: hrContext.barrelRate,
    hardHitRate: hrContext.hardHitRate,
    iso: hrContext.iso,
    last7HR: hrContext.last7HR,
    last30HR: hrContext.last30HR,
    opposingPitcherHrVs: hrContext.opposingPitcherHrVs,
    explanation: hrContext.explanation || normalizeText(row?.summary || row?.marketExplanation),
    angleTags: hrContext.angleTags ?? [],
    hrEnrichmentStatus: hrContext.enrichmentStatus,
    recentActivity: row?.recentActivity ?? null,
    matches: Array.isArray(row?.matches) ? row.matches : [],
    scoreBreakdown: row?.scoreBreakdown ?? null,
    primarySignal: normalizeText(row?.primarySignal ?? row?.primaryPatternLabel),
    numerologySignals: extractLiveSignals(row),
    allNumerologySignals: extractLiveSignals(row),
    isTopPlay: false,
    qualifiesOver50: numerologyScore > NUMEROLOGY_SCORE_THRESHOLD,
  };
}

function livePlayDedupKey(play) {
  if (play.playerId && play.team) return `id|${play.playerId}|${play.team}`;
  return `name|${normalizeMatchKey(play.player)}|${play.team}`;
}

function compareLivePlays(left, right) {
  if (right.numerologyScore !== left.numerologyScore) return right.numerologyScore - left.numerologyScore;
  if ((right.modelRating ?? 0) !== (left.modelRating ?? 0)) return (right.modelRating ?? 0) - (left.modelRating ?? 0);
  if (left.matchPriority !== right.matchPriority) return left.matchPriority - right.matchPriority;
  if ((right.hrScore ?? 0) !== (left.hrScore ?? 0)) return (right.hrScore ?? 0) - (left.hrScore ?? 0);
  return left.player.localeCompare(right.player);
}

export function buildDailyNumerologyCard(rawPayload, options = {}) {
  const date = normalizeText(options.date) || normalizeText(rawPayload?.date) || getTodayEt();
  const threshold = toFiniteNumber(options.threshold, NUMEROLOGY_SCORE_THRESHOLD);
  const generatedAt = options.generatedAt || new Date().toISOString();
  const hrIndex = buildHrEnrichmentIndex(options.hrPayload ?? null);
  const exactCount = Array.isArray(rawPayload?.exactNumberMatches) ? rawPayload.exactNumberMatches.length : 0;
  const rootCount = Array.isArray(rawPayload?.rootNumberMatches) ? rawPayload.rootNumberMatches.length : 0;
  const sourceRows = getLiveBoardRows(rawPayload);
  const deduped = new Map();

  for (const { row, matchType, matchPriority } of sourceRows) {
    if (!qualifiesDefaultActivity(row)) continue;
    const play = buildPlayFromLiveBoard(row, { date, matchType, matchPriority, hrIndex });
    if (!play.player || !play.team || !play.opponent) continue;
    const key = livePlayDedupKey(play);
    const current = deduped.get(key);
    if (!current || compareLivePlays(play, current) < 0) deduped.set(key, play);
  }

  const plays = Array.from(deduped.values()).sort(compareLivePlays);

  const topPlayKey = plays[0] ? playKey(plays[0]) : null;
  const allQualifiedPlaysOver50 = plays
    .filter((play) => play.numerologyScore > threshold)
    .map((play) => ({ ...play, isTopPlay: playKey(play) === topPlayKey }));

  const topPlay = plays[0] ? { ...plays[0], isTopPlay: true } : null;

  return {
    date,
    generatedAt,
    modelVersion: NUMEROLOGY_MODEL_VERSION,
    methodologyVersion: normalizeText(rawPayload?.methodologyVersion) || NUMEROLOGY_MODEL_VERSION,
    livePageUrl: MLB_NUMEROLOGY_LIVE_URL,
    source: {
      primary: "numerology-daily.json",
      sourceDate: normalizeText(rawPayload?.date),
      sourceGeneratedAt: normalizeText(rawPayload?.generatedAt),
      methodologyVersion: normalizeText(rawPayload?.methodologyVersion),
      exactCount,
      rootCount,
      boardCount: sourceRows.length,
      filteredBoardCount: plays.length,
      hrEnrichment: {
        status: hrIndex.available ? "loaded" : "missing-hr-source",
        sourceDate: hrIndex.sourceDate,
        generatedAt: hrIndex.generatedAt,
        modelVersion: hrIndex.modelVersion,
        batterCount: hrIndex.batterCount,
        enriched: plays.filter((play) => play.hrEnrichmentStatus === "enriched").length,
        noHrMatch: plays.filter((play) => play.hrEnrichmentStatus === "no-hr-match").length,
        missingHrSource: plays.filter((play) => play.hrEnrichmentStatus === "missing-hr-source").length,
      },
    },
    scoreThreshold: threshold,
    dailyNumber: rawPayload?.dailyProfile?.universalDayRoot ?? digitalRoot(date),
    dailyProfile: rawPayload?.dailyProfile ?? null,
    topPlay,
    allQualifiedPlaysOver50,
    plays,
    slateContext: buildSlateContext(rawPayload, plays),
  };
}

function buildSlateContext(rawPayload, plays) {
  const scheduledTeams = Array.isArray(rawPayload?.activityFilter?.scheduledTeams) ? rawPayload.activityFilter.scheduledTeams : [];
  const qualifiedCount = plays.filter((play) => play.qualifiesOver50).length;
  return {
    games: scheduledTeams.length ? Math.round(scheduledTeams.length / 2) : null,
    scheduledTeams,
    battersRanked: plays.length,
    qualifiedOver50: qualifiedCount,
    topParks: Array.from(new Set(plays.slice(0, 8).map((play) => play.ballpark).filter(Boolean))).slice(0, 3),
    dataStatus: normalizeText(rawPayload?.dataStatus),
    generationMode: normalizeText(rawPayload?.generationMode),
    updatePhase: normalizeText(rawPayload?.updatePhase),
  };
}

export function playKey(play) {
  return [
    normalizeText(play?.date),
    normalizeText(play?.playerId || play?.player),
    normalizeText(play?.gameId || play?.gameKey),
  ].join("|");
}

export function buildTrackingRecordsFromCard(card) {
  const plays = [];
  if (card?.topPlay) {
    plays.push({ ...card.topPlay, selectionType: "top-play", isTopPlay: true, qualifiesOver50: card.topPlay.qualifiesOver50 });
  }
  for (const play of card?.allQualifiedPlaysOver50 ?? []) {
    plays.push({ ...play, selectionType: "over-50", isTopPlay: play.isTopPlay === true, qualifiesOver50: true });
  }

  const seen = new Set();
  return plays
    .filter((play) => {
      const key = `${play.selectionType}|${playKey(play)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((play) => ({
      id: `${play.selectionType}|${playKey(play)}`,
      date: card.date,
      generatedAt: card.generatedAt,
      modelVersion: card.modelVersion,
      selectionType: play.selectionType,
      isTopPlay: play.isTopPlay === true,
      qualifiesOver50: play.qualifiesOver50 === true,
      player: play.player,
      playerId: play.playerId,
      team: play.team,
      opponent: play.opponent,
      gameId: play.gameId,
      gameKey: play.gameKey,
      matchType: play.matchType,
      battingOrder: play.battingOrder,
      lineupStatus: play.lineupStatus,
      jerseyNumber: play.jerseyNumber,
      numerologyScore: play.numerologyScore,
      dailyNumber: play.dailyNumber,
      baseballScore: play.baseballScore,
      hrScore: play.hrScore,
      hrScoreRank: play.hrScoreRank,
      hrOddsYes: play.hrOddsYes,
      hrOddsBook: play.hrOddsBook,
      hrEnrichmentStatus: play.hrEnrichmentStatus,
      numerologySignals: play.numerologySignals,
      resultStatus: play.gameId ? "pending" : "missing-data",
      hitHomeRun: null,
      stats: null,
      finalizedAt: null,
      source: play.gameId ? "pending" : "missing-game-id",
    }));
}

export function mergePerformanceRecords(existingPayload, incomingRecords) {
  const existing = Array.isArray(existingPayload?.records) ? existingPayload.records : [];
  const byId = new Map(existing.map((record) => [record.id, record]));
  for (const record of incomingRecords) {
    const current = byId.get(record.id);
    if (!current || current.resultStatus === "pending" || current.resultStatus === "missing-data") {
      byId.set(record.id, { ...current, ...record });
    }
  }
  const records = Array.from(byId.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
  return {
    generatedAt: new Date().toISOString(),
    modelVersion: NUMEROLOGY_MODEL_VERSION,
    records,
  };
}

export function summarizePerformance(performancePayload, asOfDate = getTodayEt()) {
  const records = Array.isArray(performancePayload?.records) ? performancePayload.records : [];
  return {
    generatedAt: new Date().toISOString(),
    modelVersion: NUMEROLOGY_MODEL_VERSION,
    asOfDate,
    allTime: buildSummaryBucket(records),
    last7Days: buildSummaryBucket(filterSince(records, asOfDate, 7)),
    last14Days: buildSummaryBucket(filterSince(records, asOfDate, 14)),
    topPlay: buildSummaryBucket(records.filter((record) => record.selectionType === "top-play")),
    over50: buildSummaryBucket(records.filter((record) => record.selectionType === "over-50")),
  };
}

function filterSince(records, asOfDate, days) {
  const asOf = new Date(`${asOfDate}T12:00:00Z`);
  if (Number.isNaN(asOf.getTime())) return records;
  const cutoff = new Date(asOf);
  cutoff.setUTCDate(cutoff.getUTCDate() - days + 1);
  return records.filter((record) => {
    const date = new Date(`${record.date}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date >= cutoff && date <= asOf;
  });
}

function buildSummaryBucket(records) {
  const finalized = records.filter((record) => record.resultStatus === "final");
  const pending = records.filter((record) => record.resultStatus === "pending");
  const missing = records.filter((record) => record.resultStatus === "missing-data" || record.resultStatus === "did-not-play" || record.resultStatus === "postponed");
  const hrHits = finalized.filter((record) => record.hitHomeRun === true).length;
  return {
    totalRecords: records.length,
    finalized: finalized.length,
    pending: pending.length,
    missingOrNoResult: missing.length,
    hrHits,
    hrHitRate: finalized.length ? roundNumber(hrHits / finalized.length, 3) : null,
    averageHits: averageStat(finalized, "hits"),
    averageTotalBases: averageStat(finalized, "totalBases"),
    averageRBI: averageStat(finalized, "rbi"),
    averageRuns: averageStat(finalized, "runs"),
    averageAtBats: averageStat(finalized, "atBats"),
  };
}

function averageStat(records, statName) {
  const values = records
    .map((record) => toFiniteNumber(record?.stats?.[statName], null))
    .filter((value) => value != null);
  if (!values.length) return null;
  return roundNumber(values.reduce((sum, value) => sum + value, 0) / values.length, 2);
}

export function extractBattingStatLine(playerEntry) {
  const batting = playerEntry?.stats?.batting ?? null;
  if (!batting) return null;
  return {
    atBats: toFiniteNumber(batting.atBats, 0),
    hits: toFiniteNumber(batting.hits, 0),
    runs: toFiniteNumber(batting.runs, 0),
    rbi: toFiniteNumber(batting.rbi, 0),
    baseOnBalls: toFiniteNumber(batting.baseOnBalls, 0),
    strikeOuts: toFiniteNumber(batting.strikeOuts, 0),
    totalBases: toFiniteNumber(batting.totalBases, 0),
    homeRuns: toFiniteNumber(batting.homeRuns, 0),
    stolenBases: toFiniteNumber(batting.stolenBases, 0),
  };
}

export function applyStatLineToRecord(record, statLine, { status = "final", source = "mlb-statsapi" } = {}) {
  if (!statLine) {
    return {
      ...record,
      resultStatus: status === "final" ? "did-not-play" : status,
      hitHomeRun: false,
      stats: null,
      finalizedAt: status === "final" ? new Date().toISOString() : null,
      source,
    };
  }
  const homeRuns = toFiniteNumber(statLine.homeRuns, 0);
  return {
    ...record,
    resultStatus: status,
    hitHomeRun: homeRuns > 0,
    stats: statLine,
    finalizedAt: status === "final" ? new Date().toISOString() : null,
    source,
  };
}

export function renderEmailText(card, summary) {
  const lines = [];
  lines.push(`MLB NUMEROLOGY PLAYS — ${card.date}`);
  lines.push(`Daily number: ${card.dailyProfile?.universalDayCompound ?? "?"}/${card.dailyNumber} | Threshold: >${card.scoreThreshold}`);
  lines.push("Experimental numerology/model signals for MLB batters. Not guaranteed. Not validated betting edges. Not locks.");
  lines.push(`Full board: ${card.livePageUrl ?? MLB_NUMEROLOGY_LIVE_URL}`);
  lines.push("");
  if (card.topPlay) {
    lines.push("===================");
    lines.push("TOP PLAY");
    lines.push("===================");
    lines.push(formatPlayLine(card.topPlay));
    lines.push(`Match type: ${card.topPlay.matchType || "Live board"}`);
    lines.push(`Lineup: ${formatLineup(card.topPlay)} | Activity: ${formatActivity(card.topPlay)}`);
    lines.push("Numerology matches:");
    for (const line of formatNumerologyMatchLines(card.topPlay)) lines.push(`  - ${line}`);
    lines.push(`HR context: ${formatHrContext(card.topPlay)}`);
    if (card.topPlay.explanation) lines.push(`Note: ${card.topPlay.explanation}`);
    lines.push("");
  }
  lines.push("===================");
  lines.push(`ALL PLAYS OVER ${card.scoreThreshold}`);
  lines.push("===================");
  if (!card.allQualifiedPlaysOver50.length) {
    lines.push("No plays cleared the threshold today.");
  } else {
    lines.push(
      card.allQualifiedPlaysOver50
        .map((play, index) => `${index + 1}. ${play.player} (${play.team} vs ${play.opponent}) — ${play.numerologyScore}`)
        .join("\n")
    );
    lines.push("");
    card.allQualifiedPlaysOver50.forEach((play, index) => {
      lines.push(`--- ${index + 1}. ${formatPlayLine(play)} ---`);
      lines.push(`   ${play.matchType || "Live board"} | ${formatLineup(play)} | ${formatActivity(play)}`);
      lines.push("   Numerology matches:");
      for (const line of formatNumerologyMatchLines(play)) lines.push(`     - ${line}`);
      lines.push(`   HR context: ${formatHrContext(play)}`);
      lines.push("");
    });
  }
  lines.push("===================");
  lines.push("TRACKING SNAPSHOT");
  lines.push("===================");
  lines.push(`Top Play: ${formatBucket(summary?.topPlay)}`);
  lines.push(`All >50 Plays: ${formatBucket(summary?.over50)}`);
  lines.push("");
  lines.push(`View the full MLB Numerology board: ${card.livePageUrl ?? MLB_NUMEROLOGY_LIVE_URL}`);
  lines.push("Experimental numerology/model signals only. Not guaranteed. Not validated betting edges. Not locks.");
  return lines.join("\n");
}

// ─── Email HTML (table-based layout, inline styles only) ──────────────────
//
// Built for real email clients (Gmail, Outlook, Apple Mail), not a browser:
//   - every layout element is a <table>; no CSS grid/flexbox anywhere
//   - every style is inline; no <style> block, no external stylesheet
//   - every image uses an absolute URL with alt text
//   - the whole email is wrapped in a full-width outer table with a single
//     centered ~680px inner table, the standard technique for centering
//     reliably in Outlook's Word rendering engine

const EMAIL_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const EMAIL_MAX_WIDTH = 680;
const EMAIL_INK = "#0f172a";
const EMAIL_MUTED = "#64748b";
const EMAIL_BORDER = "#e2e8f0";
const EMAIL_PAGE_BG = "#f1f5f9";

function renderMatchListHtml(play) {
  const lines = formatNumerologyMatchLines(play);
  return `<ul style="margin:0;padding-left:18px;color:${EMAIL_INK};font-size:13px;line-height:1.6;">${lines
    .map((line) => `<li style="margin:0 0 4px;">${escapeHtml(line)}</li>`)
    .join("")}</ul>`;
}

/** Colored, rounded numerology-score badge. Falls back to a plain rectangle where border-radius isn't honored. */
function renderScoreBadgeHtml(score, { large = false } = {}) {
  const size = large ? "font-size:22px;padding:8px 16px;" : "font-size:14px;padding:4px 10px;";
  return `<span style="display:inline-block;${size}font-weight:700;font-family:${EMAIL_FONT};color:#ffffff;background-color:#0f172a;border-radius:999px;line-height:1.2;">${escapeHtml(String(score))}</span>`;
}

function renderTeamLogoImgHtml(team, { size = 40 } = {}) {
  const url = getEmailTeamLogoUrl(team);
  const label = escapeHtml(team || "MLB team logo");
  return `<img src="${url}" width="${size}" height="${size}" alt="${label} logo" style="display:block;width:${size}px;height:${size}px;border:0;outline:none;text-decoration:none;" />`;
}

function renderSectionHeadingHtml(title, subtitle) {
  return `
  <tr>
    <td style="padding:28px 24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="border-bottom:2px solid ${EMAIL_INK};padding-bottom:8px;">
          <span style="font-family:${EMAIL_FONT};font-size:18px;font-weight:800;color:${EMAIL_INK};">${escapeHtml(title)}</span>
        </td></tr>
      </table>
      ${subtitle ? `<div style="font-family:${EMAIL_FONT};font-size:12px;color:${EMAIL_MUTED};margin-top:6px;">${escapeHtml(subtitle)}</div>` : ""}
    </td>
  </tr>`;
}

function renderHeaderHtml(card) {
  return `
  <tr>
    <td style="background-color:${EMAIL_INK};padding:28px 24px;">
      <div style="font-family:${EMAIL_FONT};font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#7dd3fc;">Joe Knows Ball</div>
      <div style="font-family:${EMAIL_FONT};font-size:26px;font-weight:800;color:#ffffff;margin-top:6px;">MLB Numerology Plays</div>
      <div style="font-family:${EMAIL_FONT};font-size:13px;color:#cbd5e1;margin-top:6px;">${escapeHtml(card.date)} · Daily number ${escapeHtml(card.dailyProfile?.universalDayCompound ?? "?")}/${escapeHtml(String(card.dailyNumber ?? "?"))} · Plays shown score over ${card.scoreThreshold}</div>
      <div style="font-family:${EMAIL_FONT};font-size:12px;color:#94a3b8;margin-top:10px;line-height:1.5;">Experimental numerology/model signals for today's MLB batters. Not guaranteed. Not validated betting edges. Not locks.</div>
    </td>
  </tr>`;
}

function renderTopPlayHeroHtml(topPlay) {
  if (!topPlay) {
    return `
    <tr><td style="padding:24px 24px 0;">
      <div style="font-family:${EMAIL_FONT};font-size:13px;color:${EMAIL_MUTED};">No top play available today.</div>
    </td></tr>`;
  }
  const colors = getEmailTeamColors(topPlay.team);
  const tintRgb = hexToRgbTriplet(colors.primary);
  return `
  <tr>
    <td style="padding:24px 24px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${EMAIL_BORDER};border-left:6px solid ${colors.primary};border-radius:10px;background-color:rgba(${tintRgb},0.06);">
        <tr>
          <td style="padding:18px 20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="52" valign="top" style="padding-right:14px;">${renderTeamLogoImgHtml(topPlay.team, { size: 44 })}</td>
                <td valign="top">
                  <div style="font-family:${EMAIL_FONT};font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:${colors.primary};">Top Play</div>
                  <div style="font-family:${EMAIL_FONT};font-size:19px;font-weight:800;color:${EMAIL_INK};margin-top:2px;">${escapeHtml(topPlay.player)}</div>
                  <div style="font-family:${EMAIL_FONT};font-size:13px;color:${EMAIL_MUTED};margin-top:2px;">${escapeHtml(topPlay.team)} vs ${escapeHtml(topPlay.opponent)} · ${escapeHtml(topPlay.matchType || "Live board")}</div>
                </td>
                <td width="70" valign="top" align="right">${renderScoreBadgeHtml(topPlay.numerologyScore, { large: true })}</td>
              </tr>
            </table>
            <div style="font-family:${EMAIL_FONT};font-size:13px;color:${EMAIL_INK};line-height:1.6;margin-top:14px;">${escapeHtml(topPlay.explanation || "No note available.")}</div>
            <div style="font-family:${EMAIL_FONT};font-size:12px;color:${EMAIL_MUTED};margin-top:10px;">Lineup: ${escapeHtml(formatLineup(topPlay))} · Activity: ${escapeHtml(formatActivity(topPlay))}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

/** Compact summary table above the detailed cards -- short fields only. */
function renderSummaryTableHtml(plays) {
  if (!plays.length) return "";
  const rows = plays.map((play) => `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid ${EMAIL_BORDER};font-family:${EMAIL_FONT};font-size:12px;color:${EMAIL_INK};vertical-align:top;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td width="20" style="padding-right:6px;">${renderTeamLogoImgHtml(play.team, { size: 18 })}</td>
              <td style="font-weight:700;">${escapeHtml(play.player)}</td>
            </tr></table>
          </td>
          <td style="padding:8px 10px;border-bottom:1px solid ${EMAIL_BORDER};font-family:${EMAIL_FONT};font-size:12px;color:${EMAIL_MUTED};vertical-align:top;white-space:nowrap;">${escapeHtml(play.team)} vs ${escapeHtml(play.opponent)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid ${EMAIL_BORDER};vertical-align:top;text-align:center;">${renderScoreBadgeHtml(play.numerologyScore)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid ${EMAIL_BORDER};font-family:${EMAIL_FONT};font-size:12px;color:${EMAIL_MUTED};vertical-align:top;white-space:nowrap;">${escapeHtml(formatLineup(play))}</td>
        </tr>`).join("");

  return `
  <tr>
    <td style="padding:12px 24px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${EMAIL_BORDER};border-radius:8px;overflow:hidden;">
        <tr style="background-color:#f8fafc;">
          <th align="left" style="padding:8px 10px;font-family:${EMAIL_FONT};font-size:10px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;color:${EMAIL_MUTED};">Player</th>
          <th align="left" style="padding:8px 10px;font-family:${EMAIL_FONT};font-size:10px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;color:${EMAIL_MUTED};">Matchup</th>
          <th align="center" style="padding:8px 10px;font-family:${EMAIL_FONT};font-size:10px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;color:${EMAIL_MUTED};">Score</th>
          <th align="left" style="padding:8px 10px;font-family:${EMAIL_FONT};font-size:10px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;color:${EMAIL_MUTED};">Lineup</th>
        </tr>
        ${rows}
      </table>
    </td>
  </tr>`;
}

/** One bordered, team-accented card per play — the primary detailed layout (stacked, not a wide table). */
function renderPlayCardHtml(play, index) {
  const colors = getEmailTeamColors(play.team);
  const oddsLine = play.hrOddsYes
    ? `${escapeHtml(play.hrOddsYes)}${play.hrOddsBook ? ` at ${escapeHtml(play.hrOddsBook)}` : ""}`
    : null;

  return `
  <tr>
    <td style="padding:12px 24px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${EMAIL_BORDER};border-top:4px solid ${colors.primary};border-radius:10px;">
        <tr>
          <td style="padding:16px 18px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="40" valign="top" style="padding-right:12px;">${renderTeamLogoImgHtml(play.team, { size: 32 })}</td>
                <td valign="top">
                  <div style="font-family:${EMAIL_FONT};font-size:15px;font-weight:800;color:${EMAIL_INK};">${index}. ${escapeHtml(play.player)}</div>
                  <div style="font-family:${EMAIL_FONT};font-size:12px;color:${EMAIL_MUTED};margin-top:2px;">${escapeHtml(play.team)} vs ${escapeHtml(play.opponent)} · ${escapeHtml(play.matchType || "Live board")}</div>
                </td>
                <td width="60" valign="top" align="right">${renderScoreBadgeHtml(play.numerologyScore)}</td>
              </tr>
            </table>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;">
              <tr>
                <td width="50%" valign="top" style="font-family:${EMAIL_FONT};font-size:11px;color:${EMAIL_MUTED};padding-right:8px;">
                  <span style="font-weight:700;color:${EMAIL_INK};">Lineup spot:</span> ${escapeHtml(formatLineup(play))}
                </td>
                <td width="50%" valign="top" style="font-family:${EMAIL_FONT};font-size:11px;color:${EMAIL_MUTED};">
                  <span style="font-weight:700;color:${EMAIL_INK};">Recent activity:</span> ${escapeHtml(formatActivity(play))}
                </td>
              </tr>
            </table>

            <div style="font-family:${EMAIL_FONT};font-size:11px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;color:${colors.primary};margin-top:14px;">Numerology matches</div>
            <div style="margin-top:4px;">${renderMatchListHtml(play)}</div>

            <div style="font-family:${EMAIL_FONT};font-size:11px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;color:${colors.primary};margin-top:14px;">HR context</div>
            <div style="font-family:${EMAIL_FONT};font-size:12.5px;color:${EMAIL_INK};line-height:1.6;margin-top:4px;">${escapeHtml(formatHrContext(play))}</div>

            ${oddsLine ? `<div style="font-family:${EMAIL_FONT};font-size:12px;color:${EMAIL_MUTED};margin-top:10px;"><span style="font-weight:700;color:${EMAIL_INK};">Odds:</span> ${oddsLine}</div>` : ""}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function renderTrackingSnapshotHtml(summary, threshold) {
  return `
  <tr>
    <td style="padding:12px 24px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${EMAIL_BORDER};border-radius:8px;">
        <tr>
          <td width="50%" style="padding:14px 16px;border-right:1px solid ${EMAIL_BORDER};vertical-align:top;">
            <div style="font-family:${EMAIL_FONT};font-size:10px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;color:${EMAIL_MUTED};">Top Play (tracking)</div>
            <div style="font-family:${EMAIL_FONT};font-size:12px;color:${EMAIL_INK};margin-top:4px;line-height:1.5;">${escapeHtml(formatBucket(summary?.topPlay))}</div>
          </td>
          <td width="50%" style="padding:14px 16px;vertical-align:top;">
            <div style="font-family:${EMAIL_FONT};font-size:10px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;color:${EMAIL_MUTED};">All &gt;${escapeHtml(String(threshold))} Plays</div>
            <div style="font-family:${EMAIL_FONT};font-size:12px;color:${EMAIL_INK};margin-top:4px;line-height:1.5;">${escapeHtml(formatBucket(summary?.over50))}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function renderFooterHtml(card) {
  return `
  <tr>
    <td style="padding:24px 24px 28px;text-align:center;">
      <a href="${MLB_NUMEROLOGY_LIVE_URL}" style="display:inline-block;font-family:${EMAIL_FONT};font-size:13px;font-weight:700;color:#ffffff;background-color:${EMAIL_INK};padding:10px 20px;border-radius:999px;text-decoration:none;">View the full MLB Numerology board</a>
      <div style="font-family:${EMAIL_FONT};font-size:11px;color:${EMAIL_MUTED};line-height:1.6;margin-top:16px;">Experimental numerology/model signals only. Not guaranteed. Not validated betting edges. Not locks.</div>
      <div style="font-family:${EMAIL_FONT};font-size:10px;color:#94a3b8;margin-top:6px;">Joe Knows Ball · ${escapeHtml(card.date)}</div>
    </td>
  </tr>`;
}

export function renderEmailHtml(card, summary) {
  const plays = card.allQualifiedPlaysOver50 ?? [];
  const bodyRows = [
    renderHeaderHtml(card),
    renderTopPlayHeroHtml(card.topPlay),
    renderSectionHeadingHtml(`All Plays Over ${card.scoreThreshold}`, plays.length ? `${plays.length} qualifying play${plays.length === 1 ? "" : "s"} today` : null),
    plays.length
      ? renderSummaryTableHtml(plays)
      : `<tr><td style="padding:12px 24px 0;"><div style="font-family:${EMAIL_FONT};font-size:13px;color:${EMAIL_MUTED};">No plays cleared the threshold today.</div></td></tr>`,
    plays.length ? plays.map((play, index) => renderPlayCardHtml(play, index + 1)).join("") : "",
    renderSectionHeadingHtml("Tracking Snapshot"),
    renderTrackingSnapshotHtml(summary, card.scoreThreshold),
    renderFooterHtml(card),
  ].join("");

  // Buttondown wraps this in its own <html>/<head>/<body> template, so this
  // returns only the email-body fragment: a full-width outer table (sets
  // the page background) containing a single centered ~680px inner table
  // (the actual email content) -- no doctype/html/head/meta/title/body.
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${EMAIL_PAGE_BG};">
      <tr>
        <td align="center" style="padding:20px 10px;">
          <table role="presentation" width="${EMAIL_MAX_WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${EMAIL_MAX_WIDTH}px;background-color:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${EMAIL_BORDER};">
            ${bodyRows}
          </table>
        </td>
      </tr>
    </table>`;
}

function formatPlayLine(play) {
  return `${play.player} (${play.team} vs ${play.opponent}) — Numerology ${play.numerologyScore}, Model ${play.modelRating ?? play.baseballScore ?? "—"}, HR score ${play.hrScore ?? "—"}, odds ${play.hrOddsYes || "—"}`;
}

// Renders every available field for one matched signal — label, field,
// value, points, type, and description — so the email shows the actual
// numerology match, not just its label. Omits any field the source data
// didn't provide rather than printing a placeholder.
function describeNumerologyMatch(signal) {
  const meta = [];
  if (signal.field) meta.push(`field: ${signal.field}`);
  if (signal.value != null) meta.push(`value: ${signal.value}`);
  if (signal.root != null) meta.push(`root: ${signal.root}`);
  if (signal.points != null) meta.push(`points: +${signal.points}`);
  if (signal.type) meta.push(`type: ${signal.type}`);
  const base = signal.label || "Signal";
  const metaText = meta.length ? ` (${meta.join(", ")})` : "";
  const detailText = signal.detail && signal.detail !== signal.label ? ` — ${signal.detail}` : "";
  return `${base}${metaText}${detailText}`;
}

// Every score-driving match is included — no 4-item cap — since the
// number of matches that contributed to a score is itself meaningful.
function formatNumerologyMatchLines(play) {
  const signals = Array.isArray(play?.numerologySignals) ? play.numerologySignals : [];
  if (!signals.length) return ["No matched numerology signals listed."];
  return signals.map(describeNumerologyMatch);
}

function formatBucket(bucket) {
  if (!bucket) return "no tracking data yet";
  const rate = bucket.hrHitRate == null ? "pending" : `${Math.round(bucket.hrHitRate * 100)}% HR hit rate`;
  return `${bucket.finalized}/${bucket.totalRecords} finalized, ${bucket.hrHits} HR hits, ${rate}, avg TB ${bucket.averageTotalBases ?? "—"}`;
}

function formatLineup(play) {
  const pieces = [];
  if (play.battingOrder != null) pieces.push(`batting ${play.battingOrder}`);
  if (play.lineupStatus) pieces.push(play.lineupStatus);
  return pieces.length ? pieces.join(", ") : "lineup unavailable";
}

function formatActivity(play) {
  const activity = play?.recentActivity;
  if (!activity) return "activity unavailable";
  const previous2 = activity.atBatsPrevious2 ?? activity.atBats;
  const previous5 = activity.atBatsPrevious5;
  const parts = [];
  if (previous2 != null) parts.push(`${previous2} AB previous 2 games`);
  if (previous5 != null) parts.push(`${previous5} AB previous 5 games`);
  return parts.length ? parts.join(", ") : "activity checked";
}

function formatHrContext(play) {
  if (play.hrEnrichmentStatus === "missing-hr-source") return "HR props source missing; numerology ranking unchanged.";
  if (play.hrEnrichmentStatus === "no-hr-match") return "No HR props match; numerology ranking unchanged.";
  const parts = [];
  if (play.hrScore != null) parts.push(`HR score ${play.hrScore}`);
  if (play.hrOddsYes) parts.push(`odds ${play.hrOddsYes}${play.hrOddsBook ? ` at ${play.hrOddsBook}` : ""}`);
  if (play.marketImpliedProbability != null) parts.push(`market implied probability ${roundNumber(play.marketImpliedProbability * 100, 1)}%`);
  if (play.barrelRate != null) parts.push(`barrel ${play.barrelRate}%`);
  if (play.hardHitRate != null) parts.push(`hard-hit ${play.hardHitRate}%`);
  if (play.iso != null) parts.push(`ISO ${play.iso}`);
  if (play.last7HR != null || play.last30HR != null) parts.push(`HR form L7/L30 ${play.last7HR ?? "—"}/${play.last30HR ?? "—"}`);
  if (play.opposingPitcherHrVs != null) parts.push(`pitcher HR vulnerability ${play.opposingPitcherHrVs}`);
  return parts.length ? parts.join("; ") : "HR context unavailable; numerology ranking unchanged.";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
