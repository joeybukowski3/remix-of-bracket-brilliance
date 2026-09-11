/**
 * mlb-k-probability-shadow-core.mjs
 *
 * Pure orchestration for the K probability/value SHADOW layer (STEP 8).
 * Joins each published K-prop row (hr-props-raw.json pitchers[] --
 * projectedKs, kLine, kOddsOver/Under, workload confidence) to that same
 * pitcher's V4 recent-form diagnostics in k-props-v2-shadow.json (row.v4 --
 * season/last10/last5 IP and K/IP windows, sample sizes) when available, runs
 * the Monte Carlo model, de-vigs the market, and returns one shadow record
 * per pitcher. No I/O here -- see generate-mlb-k-probability-shadow.mjs for
 * the file-reading entry point, which is what makes this testable without
 * fixtures on disk.
 *
 * DOES NOT MODIFY, RE-RANK, OR FILTER `hr-props-raw.json` rows in any way --
 * it only reads them and produces a SEPARATE, additive record. Best K Prop
 * Bets / K Score / projectedKs are completely untouched (STEP 7).
 */
import { noVigTwoWayProbabilities } from "./mlb-k-odds-math.mjs";
import {
  K_PROBABILITY_MODEL_VERSION,
  DEFAULT_SIMULATIONS,
  describeProbabilityConfidence,
  distributionSummary,
  probabilityFromCounts,
  simulateStrikeoutDistribution,
} from "./mlb-k-probability-model.mjs";

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const round = (value, digits = 4) =>
  finite(value) === null ? null : Math.round(Number(value) * 10 ** digits) / 10 ** digits;

/** Minimum positive edge (probability points) to call a side "value" rather than neutral -- see UI STEP 6 "If neither side has positive edge: display neutral / no value." */
const NEUTRAL_EDGE_EPSILON = 0;

const TEAM_ALIASES = Object.freeze({
  ARZ: "ARI", AZ: "ARI", CHW: "CWS", KCR: "KC", SDP: "SD", SFG: "SF", TBR: "TB", WSN: "WSH",
});

function normalizeTeam(value) {
  const code = String(value ?? "").trim().toUpperCase();
  return TEAM_ALIASES[code] ?? code;
}

function stableKey(gameId, pitcherId) {
  if (!Number.isInteger(gameId) || !Number.isInteger(pitcherId)) return null;
  return `${gameId}|${pitcherId}`;
}

/**
 * Indexes a k-props-v2-shadow.json artifact's rows by gameId+pitcherId so a
 * pitcher's V4 recent-form diagnostics can be looked up in O(1). A key that
 * maps to more than one row is dropped (treated as "no usable diagnostics")
 * rather than resolved arbitrarily, matching the ambiguity handling in
 * mlb-k-production-projection.mjs.
 */
export function buildV4DiagnosticsIndex(shadowArtifact) {
  const index = new Map();
  const ambiguous = new Set();
  const rows = Array.isArray(shadowArtifact?.rows) ? shadowArtifact.rows : [];
  for (const row of rows) {
    const key = stableKey(finite(row?.game?.gameId), finite(row?.pitcher?.id));
    if (!key) continue;
    if (index.has(key)) {
      ambiguous.add(key);
      continue;
    }
    index.set(key, row);
  }
  for (const key of ambiguous) index.delete(key);
  return index;
}

/**
 * Builds the Monte Carlo input from a V4 diagnostics block when one is
 * usable (a real starter row with a computed projection), else null. A
 * declined V4 block (opener/reliever, or a starter V4 outright rejected) has
 * every projection field null and must not be used -- it would silently
 * simulate around a fabricated mean.
 */
function extractWorkloadInputsFromV4(v4) {
  if (!v4 || typeof v4 !== "object") return null;
  const finalProjectedIP = finite(v4.finalProjectedIP);
  const finalProjectedKPerIP = finite(v4.finalProjectedKPerIP);
  if (finalProjectedIP === null || finalProjectedKPerIP === null) return null;
  return {
    finalProjectedIP,
    finalProjectedKPerIP,
    bfPerIP: finite(v4.bfPerIP),
    seasonIPPerStart: finite(v4.seasonIPPerStart),
    last10IPPerStart: finite(v4.last10IPPerStart),
    last5IPPerStart: finite(v4.last5IPPerStart),
    seasonGamesStarted: finite(v4.seasonGamesStarted),
    seasonKPerIP: finite(v4.seasonKPerIP),
    last10KPerIP: finite(v4.last10KPerIP),
    last5KPerIP: finite(v4.last5KPerIP),
    seasonInnings: finite(v4.seasonInnings),
    opponentConfidence: finite(v4.opponentConfidence),
    usedV4Diagnostics: true,
  };
}

/**
 * Fallback workload input built only from what every published row already
 * carries (projectedIP, projectedKRate or projectedKPerInning, workload
 * confidence score) when no V4 diagnostics block is available -- e.g. the row
 * is on legacy/V2, or V4 declined it (opener/reliever/thin sample). Recent-
 * form windows are unavailable in this path, so windowSpread() naturally
 * falls back to 0 and all extra width comes from the (low) trust term below,
 * which is intentionally conservative: with only a workload confidence SCORE
 * (0-1) and no games-started count, trust is read directly off that score
 * rather than recomputed from a sample size the fallback doesn't have.
 */
function extractWorkloadInputsFromLegacyRow(row) {
  const projectedIP = finite(row.projectedIP);
  const projectedKRate = finite(row.projectedKRate);
  const projectedKPerInning = finite(row.projectedKPerInning);
  const bfPerIP = finite(row.projectedBF) && projectedIP ? row.projectedBF / projectedIP : null;
  const finalProjectedKPerIP = projectedKPerInning ?? (projectedKRate !== null && bfPerIP !== null ? projectedKRate * bfPerIP : null);
  if (projectedIP === null || finalProjectedKPerIP === null || projectedIP <= 0 || finalProjectedKPerIP <= 0) return null;

  const confidenceScore = finite(row.workloadConfidenceScore);
  return {
    finalProjectedIP: projectedIP,
    finalProjectedKPerIP,
    bfPerIP,
    seasonIPPerStart: null,
    last10IPPerStart: null,
    last5IPPerStart: null,
    // Fabricate a games-started-shaped trust input from the confidence score
    // (score * 12 lands near the V4 trust curve's own knee) so
    // computeTrust's games/(games+3) formula still produces a sensible,
    // conservative trust value without a real sample-size field to read.
    seasonGamesStarted: confidenceScore !== null ? confidenceScore * 12 : null,
    seasonKPerIP: null,
    last10KPerIP: null,
    last5KPerIP: null,
    seasonInnings: confidenceScore !== null ? confidenceScore * 90 : null,
    opponentConfidence: null,
    usedV4Diagnostics: false,
  };
}

/**
 * Determines lean + best edge from the two (possibly null) side edges. The
 * displayed side is whichever has the larger positive edge (STEP 6); when
 * neither side clears NEUTRAL_EDGE_EPSILON the row is NEUTRAL with no
 * `bestProbabilityEdge`.
 */
function resolveLean(overEdge, underEdge) {
  const over = finite(overEdge);
  const under = finite(underEdge);
  const overQualifies = over !== null && over > NEUTRAL_EDGE_EPSILON;
  const underQualifies = under !== null && under > NEUTRAL_EDGE_EPSILON;

  if (!overQualifies && !underQualifies) {
    return { lean: "NEUTRAL", bestProbabilityEdge: null, bestProbabilitySide: null };
  }
  if (overQualifies && (!underQualifies || over >= under)) {
    return { lean: "OVER", bestProbabilityEdge: round(over, 4), bestProbabilitySide: "OVER" };
  }
  return { lean: "UNDER", bestProbabilityEdge: round(under, 4), bestProbabilitySide: "UNDER" };
}

/**
 * Builds one pitcher's shadow record. `row` is a hr-props-raw.json pitcher
 * object (or any object with the same field names); `v4Diagnostics` is the
 * matched k-props-v2-shadow.json row.v4 block, or null/undefined when there
 * is none.
 */
export function buildKProbabilityShadowRecord(row, v4Diagnostics, options = {}) {
  const simulations = options.simulations ?? DEFAULT_SIMULATIONS;
  const modelVersion = options.modelVersion ?? K_PROBABILITY_MODEL_VERSION;
  const slateDate = options.slateDate ?? row.slateDate ?? null;

  const pitcherId = finite(row.pitcherId);
  const gameId = finite(row.gameId);
  const key = stableKey(gameId, pitcherId) ?? `${row.pitcher ?? "unknown"}|${normalizeTeam(row.team)}|${normalizeTeam(row.opponent)}|${slateDate ?? ""}`;

  const kLine = finite(row.kLine);
  const hasLine = kLine !== null && kLine > 0;

  const market = noVigTwoWayProbabilities(row.kOddsOver, row.kOddsUnder);

  const base = {
    key,
    slateDate,
    pitcherId,
    gameId,
    pitcher: row.pitcher ?? null,
    team: normalizeTeam(row.team),
    opponent: normalizeTeam(row.opponent),
    line: hasLine ? kLine : null,
    overOdds: row.kOddsOver ?? null,
    underOdds: row.kOddsUnder ?? null,
    book: row.kOddsBook ?? null,
    projectedKs: finite(row.projectedKs ?? row.effectiveProjectedKs),
    projectedKsSource: row.projectionSource ?? null,
    modelVersion,
    simulationCount: 0,
    market: {
      overImpliedProbability: round(market.overRawProbability, 4),
      underImpliedProbability: round(market.underRawProbability, 4),
      overNoVigProbability: round(market.overNoVigProbability, 4),
      underNoVigProbability: round(market.underNoVigProbability, 4),
      overround: round(market.overround, 4),
      twoSided: market.twoSided,
    },
    model: { overProbability: null, underProbability: null, meanSimulatedKs: null, medianSimulatedKs: null, stdevSimulatedKs: null },
    edge: { overProbabilityEdge: null, underProbabilityEdge: null, lean: "NEUTRAL", bestProbabilityEdge: null, bestProbabilitySide: null },
    confidence: { grade: null, score: null, workloadTrust: null, kRateTrust: null },
    diagnostics: { ipSd: null, kPerIpSd: null, ipSpread: null, kPerIpSpread: null, bfPerIP: null, usedV4Diagnostics: false },
    status: "declined",
    statusReason: null,
  };

  if (!hasLine) {
    return { ...base, status: "no_market", statusReason: "NO_MARKET_LINE" };
  }

  const workloadInputs = extractWorkloadInputsFromV4(v4Diagnostics) ?? extractWorkloadInputsFromLegacyRow(row);
  if (!workloadInputs) {
    return { ...base, status: "insufficient_projection", statusReason: "MISSING_WORKLOAD_OR_RATE_INPUTS" };
  }

  const simulation = simulateStrikeoutDistribution(
    { ...workloadInputs, pitcherId, slateDate },
    { simulations, modelVersion },
  );
  if (!simulation.ok) {
    return { ...base, status: "insufficient_projection", statusReason: simulation.reason };
  }

  const { overProbability, underProbability } = probabilityFromCounts(simulation.counts, simulation.simulations, kLine);
  const summary = distributionSummary(simulation.counts, simulation.simulations);
  const confidence = describeProbabilityConfidence(simulation.ipTrust, simulation.kTrust, workloadInputs.opponentConfidence);

  const overEdge = market.twoSided && overProbability !== null && market.overNoVigProbability !== null
    ? round(overProbability - market.overNoVigProbability, 4)
    : null;
  const underEdge = market.twoSided && underProbability !== null && market.underNoVigProbability !== null
    ? round(underProbability - market.underNoVigProbability, 4)
    : null;
  const { lean, bestProbabilityEdge, bestProbabilitySide } = resolveLean(overEdge, underEdge);

  return {
    ...base,
    simulationCount: simulation.simulations,
    model: {
      overProbability,
      underProbability,
      meanSimulatedKs: summary.mean,
      medianSimulatedKs: summary.median,
      stdevSimulatedKs: summary.stdev,
    },
    edge: {
      overProbabilityEdge: overEdge,
      underProbabilityEdge: underEdge,
      lean,
      bestProbabilityEdge,
      bestProbabilitySide,
    },
    confidence: {
      grade: confidence.grade,
      score: confidence.score,
      workloadTrust: simulation.ipTrust,
      kRateTrust: simulation.kTrust,
    },
    diagnostics: {
      ipSd: simulation.ipSd,
      kPerIpSd: simulation.kPerIpSd,
      ipSpread: simulation.ipSpread,
      kPerIpSpread: simulation.kPerIpSpread,
      bfPerIP: simulation.bfPerIP,
      usedV4Diagnostics: workloadInputs.usedV4Diagnostics,
    },
    status: market.twoSided ? "computed" : "one_sided_market",
    statusReason: market.twoSided ? null : "ONE_SIDED_ODDS",
  };
}

/**
 * Builds the full shadow artifact payload from an hr-props-raw.json-shaped
 * object and a k-props-v2-shadow.json-shaped object (either may be null/
 * incomplete -- every row degrades gracefully to a status other than
 * "computed" rather than throwing).
 */
export function buildKProbabilityShadowArtifact(rawPayload, shadowArtifact, options = {}) {
  const slateDate = rawPayload?.date ?? shadowArtifact?.slateDate ?? null;
  const pitchers = Array.isArray(rawPayload?.pitchers) ? rawPayload.pitchers : [];
  const v4Index = buildV4DiagnosticsIndex(shadowArtifact);

  const counts = { total: 0, computed: 0, noMarket: 0, oneSided: 0, insufficient: 0 };
  const rows = pitchers.map((row) => {
    counts.total += 1;
    const key = stableKey(finite(row.gameId), finite(row.pitcherId));
    const v4Row = key ? v4Index.get(key) : null;
    const record = buildKProbabilityShadowRecord({ ...row, slateDate }, v4Row?.v4 ?? null, { ...options, slateDate });
    if (record.status === "computed") counts.computed += 1;
    else if (record.status === "no_market") counts.noMarket += 1;
    else if (record.status === "one_sided_market") counts.oneSided += 1;
    else counts.insufficient += 1;
    return record;
  });

  return {
    schemaVersion: 1,
    slateDate,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    modelVersion: options.modelVersion ?? K_PROBABILITY_MODEL_VERSION,
    simulationCount: options.simulations ?? DEFAULT_SIMULATIONS,
    rows,
    diagnostics: {
      totalRows: counts.total,
      computedRows: counts.computed,
      noMarketRows: counts.noMarket,
      oneSidedMarketRows: counts.oneSided,
      insufficientDataRows: counts.insufficient,
    },
  };
}
