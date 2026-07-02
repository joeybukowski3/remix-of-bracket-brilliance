/**
 * mlb-ml-edge-core.mjs
 *
 * PURE JS PORT of computeModelEdge in src/lib/mlb/mlbModelEdge.ts, for use
 * in Node scripts (which cannot import TypeScript directly). This mirrors
 * the same porting pattern already used by scripts/generate-mlb-numerology.mjs
 * ("pure JS port of src/lib/numerology").
 *
 * PER PHASE 1 SCOPE: this is a MECHANICAL TRANSLATION, not a new model.
 * The formula, weights, and thresholds below MUST stay byte-for-byte
 * equivalent to src/lib/mlb/mlbModelEdge.ts. If that file's scoring
 * formula ever changes, this file must be updated in the same PR -- do
 * not let the two drift apart. A parity test
 * (scripts/lib/mlb-ml-edge-core.test.mjs) is not sufficient on its own to
 * catch drift; review both files together whenever either changes.
 *
 * Used ONLY by the archival pipeline (generate-mlb-ml-picks.mjs). It does
 * NOT feed the live website in any way -- the live site continues to run
 * computeModelEdge() directly in the browser via mlbModelEdge.ts.
 */

// ── helpers (ported from mlbFormatters.ts) ──────────────────────────────────

function parseIp(ip) {
  if (ip == null) return null;
  const str = String(ip);
  const [whole, fraction] = str.split(".");
  const innings = Number(whole);
  const outs = Number(fraction || 0);
  if (!Number.isFinite(innings) || !Number.isFinite(outs)) return null;
  return innings + outs / 3;
}

function computeK9(strikeouts, inningsPitched) {
  const ip = parseIp(inningsPitched);
  if (strikeouts == null || ip == null || ip <= 0) return null;
  return (strikeouts / ip) * 9;
}

function computeHr9(homeRuns, inningsPitched) {
  const ip = parseIp(inningsPitched);
  if (homeRuns == null || ip == null || ip <= 0) return null;
  return (homeRuns / ip) * 9;
}

function computePercent(numerator, denominator) {
  if (numerator == null || denominator == null || denominator <= 0) return null;
  return (numerator / denominator) * 100;
}

// ── helpers (ported from mlbModelEdge.ts) ───────────────────────────────────

function parseWinPct(record) {
  const [w, l] = (record || "").split("-").map(Number);
  return isNaN(w) || isNaN(l) || w + l === 0 ? 0.5 : w / (w + l);
}

function parseL5Wins(record) {
  const [w] = (record || "").replace(/[^0-9-]/g, "").split("-").map(Number);
  return isNaN(w) ? 2 : Math.min(5, Math.max(0, w));
}

function clamp(v, lo = 15, hi = 88) { return Math.max(lo, Math.min(hi, v)); }

function eraScore(era) {
  if (era == null) return 50;
  const avg = 4.12;
  return era <= avg
    ? clamp(50 + ((avg - era) / 2.12) * 40)
    : clamp(50 - ((era - avg) / 2.88) * 38);
}

function k9Score(k9) {
  if (k9 == null) return 50;
  const avg = 8.6;
  return k9 >= avg
    ? clamp(50 + ((k9 - avg) / 2.4) * 38)
    : clamp(50 - ((avg - k9) / 2.6) * 33);
}

function bbScore(bb) {
  if (bb == null) return 50;
  const avg = 8.3;
  return bb <= avg
    ? clamp(50 + ((avg - bb) / 3.3) * 28)
    : clamp(50 - ((bb - avg) / 3.7) * 33);
}

function hr9Score(hr9) {
  if (hr9 == null) return 50;
  const avg = 1.18;
  return hr9 <= avg
    ? clamp(50 + ((avg - hr9) / 0.68) * 28)
    : clamp(50 - ((hr9 - avg) / 0.82) * 33);
}

function opsScore(ops) {
  if (ops == null) return 50;
  const avg = 0.713;
  return ops >= avg
    ? clamp(50 + ((ops - avg) / 0.137) * 34)
    : clamp(50 - ((avg - ops) / 0.163) * 33);
}

function kPctScore(kPct) {
  if (kPct == null) return 50;
  const avg = 22.2;
  return kPct <= avg
    ? clamp(50 + ((avg - kPct) / 7) * 25)
    : clamp(50 - ((kPct - avg) / 8) * 28);
}

/**
 * @param {object} detail  Same shape as MlbGameDetail (see mlbTypes.ts):
 *   { starters: { away, home }, lineupSummaries: { away, home },
 *     opponentSplits: { awayBattingVsHomeStarter, homeBattingVsAwayStarter },
 *     awayContext, homeContext, game: { away: { abbreviation, record }, home: {...} } }
 * @returns {object} ModelEdgeResult-shaped object, identical to
 *   computeModelEdge() in mlbModelEdge.ts
 */
export function computeModelEdgeCore(detail) {
  const { starters, lineupSummaries, opponentSplits, awayContext, homeContext, game } = detail;
  const aw = starters.away;
  const hw = starters.home;

  const awayEra = aw.era != null ? Number(aw.era) : null;
  const homeEra = hw.era != null ? Number(hw.era) : null;
  const awayK9 = computeK9(aw.strikeOuts, aw.inningsPitched);
  const homeK9 = computeK9(hw.strikeOuts, hw.inningsPitched);
  const awayBB = computePercent(aw.baseOnBalls, aw.battersFaced);
  const homeBB = computePercent(hw.baseOnBalls, hw.battersFaced);
  const awayHR9 = computeHr9(aw.homeRuns, aw.inningsPitched);
  const homeHR9 = computeHr9(hw.homeRuns, hw.inningsPitched);

  // 1. PITCHER QUALITY (30%) — ERA, K/9, BB%, HR/9 + REGRESSION RISK
  const awayRegr = aw.regressionScore ?? 0;
  const homeRegr = hw.regressionScore ?? 0;
  const awayRegrAdj = awayRegr * 2.5;
  const homeRegrAdj = homeRegr * 2.5;

  const awayPit = (eraScore(awayEra) * 0.35 + k9Score(awayK9) * 0.25 + bbScore(awayBB) * 0.22 + hr9Score(awayHR9) * 0.18) + awayRegrAdj;
  const homePit = (eraScore(homeEra) * 0.35 + k9Score(homeK9) * 0.25 + bbScore(homeBB) * 0.22 + hr9Score(homeHR9) * 0.18) + homeRegrAdj;

  // 2. MATCHUP EDGE — lineup OPS vs opposing pitcher hand + lineup K% (25%)
  const awySplit = opponentSplits.awayBattingVsHomeStarter;
  const homSplit = opponentSplits.homeBattingVsAwayStarter;

  const awySplitOPS = awySplit?.ops != null ? Number(awySplit.ops) : lineupSummaries.away.ops;
  const homSplitOPS = homSplit?.ops != null ? Number(homSplit.ops) : lineupSummaries.home.ops;
  const awyK = awySplit?.strikeOuts != null && awySplit.plateAppearances
    ? computePercent(awySplit.strikeOuts, awySplit.plateAppearances)
    : lineupSummaries.away.kPct;
  const homK = homSplit?.strikeOuts != null && homSplit.plateAppearances
    ? computePercent(homSplit.strikeOuts, homSplit.plateAppearances)
    : lineupSummaries.home.kPct;

  const awayMatch = opsScore(awySplitOPS) * 0.65 + kPctScore(awyK) * 0.35;
  const homeMatch = opsScore(homSplitOPS) * 0.65 + kPctScore(homK) * 0.35;

  // 3. LINEUP OFFENSE — OPS, SLG, OBP (20%)
  const s = (v, avg) => (v == null ? 50 : clamp(50 + ((v - avg) / avg) * 50));
  const awayOff = opsScore(lineupSummaries.away.ops) * 0.50 + s(lineupSummaries.away.slg, 0.401) * 0.30 + s(lineupSummaries.away.obp, 0.312) * 0.20;
  const homeOff = opsScore(lineupSummaries.home.ops) * 0.50 + s(lineupSummaries.home.slg, 0.401) * 0.30 + s(lineupSummaries.home.obp, 0.312) * 0.20;

  // 4. RECENT FORM — last 5 + relevant split (15%)
  const awyL5 = parseL5Wins(awayContext.lastFiveRecord);
  const homL5 = parseL5Wins(homeContext.lastFiveRecord);
  const awySplt = parseWinPct(awayContext.awayRecord || game.away.record);
  const homSplt = parseWinPct(homeContext.homeRecord || game.home.record);
  const awayForm = (awyL5 / 5) * 100 * 0.55 + awySplt * 100 * 0.45;
  const homeForm = (homL5 / 5) * 100 * 0.55 + homSplt * 100 * 0.45;

  // 5. SEASON QUALITY — overall win% (10%)
  const awaySzn = parseWinPct(game.away.record) * 100;
  const homeSzn = parseWinPct(game.home.record) * 100;

  // Weighted aggregate
  const awayTotal = awayPit * 0.30 + awayMatch * 0.25 + awayOff * 0.20 + awayForm * 0.15 + awaySzn * 0.10;
  const homeTotal = homePit * 0.30 + homeMatch * 0.25 + homeOff * 0.20 + homeForm * 0.15 + homeSzn * 0.10;

  const diff = awayTotal - homeTotal;
  const absDiff = Math.abs(diff);
  const pick = absDiff < 2.5 ? "push" : diff > 0 ? "away" : "home";

  const confidence = pick === "push" ? 50 : Math.round(Math.min(82, 52 + (absDiff / 5) * 4));

  const factors = [
    { label: "Pitcher Quality", awayScore: Math.round(awayPit), homeScore: Math.round(homePit), weight: 0.30, weightedDifference: (awayPit - homePit) * 0.30, description: "ERA, K/9, BB%, HR/9" },
    { label: "Matchup Edge", awayScore: Math.round(awayMatch), homeScore: Math.round(homeMatch), weight: 0.25, weightedDifference: (awayMatch - homeMatch) * 0.25, description: "Lineup OPS vs pitcher hand · lineup K%" },
    { label: "Lineup Offense", awayScore: Math.round(awayOff), homeScore: Math.round(homeOff), weight: 0.20, weightedDifference: (awayOff - homeOff) * 0.20, description: "OPS, SLG, OBP" },
    { label: "Recent Form", awayScore: Math.round(awayForm), homeScore: Math.round(homeForm), weight: 0.15, weightedDifference: (awayForm - homeForm) * 0.15, description: "Last 5 games · home/away split" },
    { label: "Season Quality", awayScore: Math.round(awaySzn), homeScore: Math.round(homeSzn), weight: 0.10, weightedDifference: (awaySzn - homeSzn) * 0.10, description: "Season win %" },
  ];

  const top = factors.reduce((b, f) => (Math.abs(f.weightedDifference) > Math.abs(b.weightedDifference) ? f : b));
  const pickAbbr = pick === "away" ? game.away.abbreviation : pick === "home" ? game.home.abbreviation : "";

  return {
    pick,
    awayAbbr: game.away.abbreviation,
    homeAbbr: game.home.abbreviation,
    confidence,
    differential: Math.round(absDiff),
    factors,
    topFactor: top.label,
    summary: pick === "push"
      ? "Too close to call — model sees minimal edge either way."
      : `${pickAbbr} model lean driven by ${top.label.toLowerCase()}.`,
  };
}

/**
 * Mirrors getEdgeTierKey/getEdgeTierLabel in mlbModelEdge.ts.
 */
export function getEdgeTierKeyCore(confidence) {
  if (confidence >= 72) return "strong";
  if (confidence >= 64) return "moderate";
  if (confidence >= 56) return "slight";
  return "coin-flip";
}
