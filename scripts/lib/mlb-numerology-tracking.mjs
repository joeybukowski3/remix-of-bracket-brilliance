import fs from "node:fs";
import path from "node:path";

export const NUMEROLOGY_SCORE_THRESHOLD = 50;
export const NUMEROLOGY_MODEL_VERSION = "mlb-numerology-v0.1";

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

export function buildDailyNumerologyCard(rawPayload, options = {}) {
  const date = normalizeText(options.date) || normalizeText(rawPayload?.date) || getTodayEt();
  const threshold = toFiniteNumber(options.threshold, NUMEROLOGY_SCORE_THRESHOLD);
  const batters = Array.isArray(rawPayload?.batters) ? rawPayload.batters : [];
  const generatedAt = options.generatedAt || new Date().toISOString();

  const plays = batters
    .map((row) => buildPlayFromRow(row, { date }))
    .filter((play) => play.player && play.team && play.opponent)
    .sort((left, right) => {
      if (right.numerologyScore !== left.numerologyScore) return right.numerologyScore - left.numerologyScore;
      return (right.hrScore ?? 0) - (left.hrScore ?? 0);
    });

  const topPlayKey = plays[0] ? playKey(plays[0]) : null;
  const allQualifiedPlaysOver50 = plays
    .filter((play) => play.numerologyScore > threshold)
    .map((play) => ({ ...play, isTopPlay: playKey(play) === topPlayKey }));

  const topPlay = plays[0] ? { ...plays[0], isTopPlay: true } : null;

  return {
    date,
    generatedAt,
    modelVersion: NUMEROLOGY_MODEL_VERSION,
    source: {
      hrPropsDate: normalizeText(rawPayload?.date),
      hrPropsGeneratedAt: normalizeText(rawPayload?.generatedAt),
      hrPropsModelVersion: normalizeText(rawPayload?.modelVersion),
      batterCount: batters.length,
    },
    scoreThreshold: threshold,
    dailyNumber: digitalRoot(date),
    topPlay,
    allQualifiedPlaysOver50,
    plays,
    slateContext: buildSlateContext(rawPayload, plays),
  };
}

function buildSlateContext(rawPayload, plays) {
  const games = Array.isArray(rawPayload?.games) ? rawPayload.games : [];
  const qualifiedCount = plays.filter((play) => play.qualifiesOver50).length;
  return {
    games: games.length,
    battersRanked: plays.length,
    qualifiedOver50: qualifiedCount,
    topParks: Array.from(new Set(plays.slice(0, 8).map((play) => play.ballpark).filter(Boolean))).slice(0, 3),
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
      battingOrder: play.battingOrder,
      numerologyScore: play.numerologyScore,
      dailyNumber: play.dailyNumber,
      hrScore: play.hrScore,
      hrScoreRank: play.hrScoreRank,
      hrOddsYes: play.hrOddsYes,
      hrOddsBook: play.hrOddsBook,
      numerologySignals: play.numerologySignals,
      resultStatus: "pending",
      hitHomeRun: null,
      stats: null,
      finalizedAt: null,
      source: "pending",
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
  lines.push(`MLB Numerology Plays — ${card.date}`);
  lines.push(`Daily number: ${card.dailyNumber} | Threshold: >${card.scoreThreshold}`);
  lines.push("");
  if (card.topPlay) {
    lines.push("TOP PLAY");
    lines.push(formatPlayLine(card.topPlay));
    lines.push(`Signals: ${formatSignals(card.topPlay)}`);
    if (card.topPlay.explanation) lines.push(`HR note: ${card.topPlay.explanation}`);
    lines.push("");
  }
  lines.push(`ALL PLAYS OVER ${card.scoreThreshold}`);
  if (!card.allQualifiedPlaysOver50.length) {
    lines.push("No plays cleared the threshold today.");
  } else {
    for (const play of card.allQualifiedPlaysOver50) lines.push(formatPlayLine(play));
  }
  lines.push("");
  lines.push("TRACKING SNAPSHOT");
  lines.push(`Top Play: ${formatBucket(summary?.topPlay)}`);
  lines.push(`All >50 Plays: ${formatBucket(summary?.over50)}`);
  lines.push("");
  lines.push("Experimental numerology/model signals only. These are not guaranteed, validated betting edges, or locks.");
  return lines.join("\n");
}

export function renderEmailHtml(card, summary) {
  const playRows = card.allQualifiedPlaysOver50.map((play) => `
    <tr>
      <td>${escapeHtml(play.player)}</td>
      <td>${escapeHtml(`${play.team} vs ${play.opponent}`)}</td>
      <td>${play.numerologyScore}</td>
      <td>${escapeHtml(formatSignals(play))}</td>
      <td>${escapeHtml(play.hrOddsYes || "—")}</td>
    </tr>`).join("");

  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>MLB Numerology Plays — ${escapeHtml(card.date)}</title></head>
  <body style="font-family:Arial,sans-serif;line-height:1.45;color:#111827;">
    <h1>MLB Numerology Plays — ${escapeHtml(card.date)}</h1>
    <p><strong>Daily number:</strong> ${card.dailyNumber} · <strong>Threshold:</strong> &gt;${card.scoreThreshold}</p>
    ${card.topPlay ? `
      <h2>Top Play</h2>
      <p><strong>${escapeHtml(card.topPlay.player)}</strong> — ${escapeHtml(card.topPlay.team)} vs ${escapeHtml(card.topPlay.opponent)} · Numerology ${card.topPlay.numerologyScore} · HR score ${card.topPlay.hrScore ?? "—"}</p>
      <p><strong>Signals:</strong> ${escapeHtml(formatSignals(card.topPlay))}</p>
      <p>${escapeHtml(card.topPlay.explanation || "No HR note available.")}</p>
    ` : "<p>No top play available.</p>"}
    <h2>All Plays Over ${card.scoreThreshold}</h2>
    ${card.allQualifiedPlaysOver50.length ? `
      <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;">
        <thead><tr><th>Player</th><th>Matchup</th><th>Score</th><th>Signals</th><th>HR odds</th></tr></thead>
        <tbody>${playRows}</tbody>
      </table>
    ` : `<p>No plays cleared the threshold today.</p>`}
    <h2>Tracking Snapshot</h2>
    <ul>
      <li><strong>Top Play:</strong> ${escapeHtml(formatBucket(summary?.topPlay))}</li>
      <li><strong>All &gt;50 Plays:</strong> ${escapeHtml(formatBucket(summary?.over50))}</li>
    </ul>
    <p><em>Experimental numerology/model signals only. These are not guaranteed, validated betting edges, or locks.</em></p>
  </body>
</html>`;
}

function formatPlayLine(play) {
  return `${play.player} (${play.team} vs ${play.opponent}) — Numerology ${play.numerologyScore}, HR score ${play.hrScore ?? "—"}, odds ${play.hrOddsYes || "—"}`;
}

function formatSignals(play) {
  const signals = Array.isArray(play?.numerologySignals) ? play.numerologySignals : [];
  if (!signals.length) return "No matched numerology signals listed.";
  return signals.slice(0, 4).map((signal) => `${signal.label} (+${signal.points})`).join("; ");
}

function formatBucket(bucket) {
  if (!bucket) return "no tracking data yet";
  const rate = bucket.hrHitRate == null ? "pending" : `${Math.round(bucket.hrHitRate * 100)}% HR hit rate`;
  return `${bucket.finalized}/${bucket.totalRecords} finalized, ${bucket.hrHits} HR hits, ${rate}, avg TB ${bucket.averageTotalBases ?? "—"}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
