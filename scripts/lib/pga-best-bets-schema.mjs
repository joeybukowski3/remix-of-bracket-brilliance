/**
 * PGA Best Bets V3 artifact schema: builders, validators, V2 compatibility
 * derivation, and Model Leans construction.
 *
 * V2 compatibility arrays (outrights/top5/top10/top20) are ALWAYS derived
 * from the frozen V3 recommendations/ladders (or capped Model Leans) below --
 * never an independent selection path. See deriveV2Compatibility.
 */

import { CANONICAL_MARKETS, MODEL_LEANS_CAPS } from "../config/pga-best-bets-config.mjs";

export const SCHEMA_VERSION = 3;

const LEGACY_SECTION_BY_MARKET = Object.freeze({ outright: "outrights", top5: "top5", top10: "top10", top20: "top20" });
const LEGACY_ODDS_KEY_BY_MARKET = Object.freeze({ outright: "outright", top5: "top5", top10: "top10", top20: "top20" });

function formatAmerican(american) {
  if (!Number.isFinite(american)) return null;
  return american > 0 ? `+${american}` : `${american}`;
}

/** One frozen, priced/qualified candidate -> a V3 recommendation entry. Deterministic, no Grok involvement. */
export function buildRecommendationEntry(candidate, copy) {
  return {
    player: candidate.playerName,
    normalizedPlayer: candidate.playerKey,
    market: candidate.market,
    modelRank: candidate.rank ?? null,
    powerRank: candidate.powerRank ?? null,
    odds: {
      american: candidate.price.american,
      decimal: candidate.price.decimal,
      sportsbook: candidate.price.sportsbookName,
      sportsbookKey: candidate.price.sportsbookKey,
      fetchedAt: candidate.price.fetchedAt,
      eventId: candidate.price.eventId,
    },
    probability: {
      model: candidate.probability.blended,
      implied: candidate.probability.rawImplied,
      noVig: candidate.probability.noVig,
      provisionalModelComponent: candidate.probability.provisionalModelComponent,
    },
    probabilityEdge: candidate.probabilityEdge,
    expectedValue: candidate.expectedValue,
    confidence: copy.confidence,
    rationale: copy.rationale,
    risk: copy.risk,
    ladderId: candidate.ladderId ?? null,
  };
}

/** Ladder objects derived from recommendations sharing a ladderId -- never an independent structure. */
export function buildLaddersArray(recommendations) {
  const byLadder = new Map();
  for (const rec of recommendations ?? []) {
    if (!rec.ladderId) continue;
    if (!byLadder.has(rec.ladderId)) {
      byLadder.set(rec.ladderId, { ladderId: rec.ladderId, player: rec.player, normalizedPlayer: rec.normalizedPlayer, legs: [] });
    }
    byLadder.get(rec.ladderId).legs.push(rec.market);
  }
  return [...byLadder.values()].sort((a, b) => a.ladderId.localeCompare(b.ladderId));
}

/**
 * V2 compatibility arrays, derived strictly from the frozen V3
 * recommendations. Every entry carries topStats/bullets as real arrays
 * (never undefined) so the existing PgaBestBets.tsx page -- which calls
 * `.map` on both directly -- cannot crash on this artifact shape.
 */
export function deriveV2Compatibility(recommendations) {
  const sections = { outrights: [], top5: [], top10: [], top20: [] };
  const oddsByPlayer = new Map();

  for (const rec of recommendations ?? []) {
    const odds = oddsByPlayer.get(rec.normalizedPlayer) ?? {};
    odds[LEGACY_ODDS_KEY_BY_MARKET[rec.market]] = formatAmerican(rec.odds.american);
    oddsByPlayer.set(rec.normalizedPlayer, odds);
  }

  for (const rec of recommendations ?? []) {
    const section = LEGACY_SECTION_BY_MARKET[rec.market];
    if (!section) continue;
    sections[section].push({
      player: rec.player,
      tournamentRank: rec.modelRank ?? 0,
      powerRank: rec.powerRank ?? 0,
      topStats: [
        `blendedProbability=${(rec.probability.model * 100).toFixed(1)}%`,
        `expectedValue=${(rec.expectedValue * 100).toFixed(1)}%`,
      ],
      bullets: rec.rationale ?? [],
      risk: rec.risk ?? "",
      angles: [],
      odds: oddsByPlayer.get(rec.normalizedPlayer) ?? null,
    });
  }
  return sections;
}

/**
 * Model Leans compatibility bridge for a `model-leans-only` week: legacy
 * section arrays populated ONLY from the capped, unpriced leans, with
 * explicitly no odds/topStats value language -- this is the one place a V2
 * consumer must not mistake a lean for an official recommendation, so every
 * entry is marked via the `isModelLeanOnly` flag in addition to the
 * artifact-level status.
 */
export function deriveV2CompatibilityFromLeans(modelLeans) {
  const sections = { outrights: [], top5: [], top10: [], top20: [] };
  for (const lean of modelLeans ?? []) {
    const section = LEGACY_SECTION_BY_MARKET[lean.marketContext];
    if (!section) continue;
    sections[section].push({
      player: lean.player,
      tournamentRank: lean.modelRank ?? 0,
      powerRank: lean.powerRank ?? 0,
      topStats: [`provisionalModelProbability=${(lean.provisionalModelProbability * 100).toFixed(1)}%`],
      bullets: [lean.note],
      risk: "",
      angles: [],
      odds: null,
      isModelLeanOnly: true,
    });
  }
  return sections;
}

/** Phrases that assert market/price/value judgement. Model Leans copy must never contain these. */
const FORBIDDEN_LEAN_LANGUAGE = [
  /\bprice\b/i, /\bpriced\b/i, /\bodds\b/i, /\bsportsbook\b/i, /\bmarket value\b/i,
  /\bmispric\w*/i, /\boverlay\b/i, /\bvalue\b/i, /\bbest bet\b/i, /\bexpected value\b/i, /\bedge\b/i,
];

export function containsForbiddenLeanLanguage(text) {
  return FORBIDDEN_LEAN_LANGUAGE.some((pattern) => pattern.test(String(text ?? "")));
}

/**
 * Deterministic Model Leans: context-only classifications built from the
 * provisional model probabilities, used ONLY when verified odds are
 * unavailable. Never includes EV, edge, sportsbook, or price -- see
 * MODEL_LEANS_CAPS for the per-market and total caps.
 */
export function buildModelLeans(rows, caps = MODEL_LEANS_CAPS) {
  const perMarket = { outright: [], top5: [], top10: [], top20: [] };
  const marketContextLabel = { outright: "outright", top5: "top-5", top10: "top-10", top20: "top-20" };

  for (const market of CANONICAL_MARKETS) {
    const ranked = [...(rows ?? [])]
      .filter((row) => Number.isFinite(row.provisionalModelProbability?.[market]))
      .sort((a, b) =>
        b.provisionalModelProbability[market] - a.provisionalModelProbability[market]
        // Small fields legitimately saturate every player's finish probability
        // at 1.0 (e.g. top20 is guaranteed in a 3-player field) -- model rank,
        // not alphabetical order, must break that tie so the strongest player
        // is never arbitrarily excluded by name.
        || (a.rank ?? Infinity) - (b.rank ?? Infinity)
        || a.player.localeCompare(b.player))
      .slice(0, caps[market]);
    for (const row of ranked) {
      perMarket[market].push({
        player: row.player,
        normalizedPlayer: row.playerKey,
        marketContext: market,
        modelRank: row.rank ?? null,
        powerRank: row.powerRank ?? null,
        provisionalModelProbability: row.provisionalModelProbability[market],
        note: `Provisional field-relative model context for a ${marketContextLabel[market]} finish; no verified market line was confirmed for this player this week.`,
      });
    }
  }

  const flat = CANONICAL_MARKETS.flatMap((market) => perMarket[market]).slice(0, caps.total);
  return flat;
}

function unavailableSourceStatus(reason) {
  return { model: "available", grok: "unavailable", odds: "unavailable", article: "unavailable", reason };
}

export function buildUnavailableArtifact({ tournament, tournamentId = null, localScheduleId = null, course = null, generatedAt, reason, oddsDiagnostics = null }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    tournament,
    tournamentId,
    localScheduleId,
    course,
    generatedAt,
    status: "unavailable",
    reason,
    sourceStatus: unavailableSourceStatus(reason),
    oddsDiagnostics,
    recommendations: [],
    modelLeans: [],
    ladders: [],
    portfolioDiagnostics: null,
    probabilityMethod: "provisional-plackett-luce-style-independent-race-approximation",
    fieldCoverage: null,
    methodologyNotes: [],
    dataLimitations: [],
    outrights: [], top5: [], top10: [], top20: [],
  };
}

/**
 * Assembles the authoritative V3 artifact plus its V2 compatibility arrays.
 * `status` must be "official-best-bets" or "model-leans-only" -- use
 * buildUnavailableArtifact for the unavailable case.
 */
export function buildV3Artifact({
  tournament, tournamentId = null, localScheduleId = null, course = null, generatedAt,
  status, reason = null, sourceStatus, oddsDiagnostics, recommendations = [], modelLeans = [],
  portfolioDiagnostics = null, fieldCoverage = null, methodologyNotes = [], dataLimitations = [],
}) {
  if (status !== "official-best-bets" && status !== "model-leans-only") {
    throw new Error(`buildV3Artifact status must be "official-best-bets" or "model-leans-only", got "${status}"`);
  }
  const ladders = buildLaddersArray(recommendations);
  const compat = status === "official-best-bets" ? deriveV2Compatibility(recommendations) : deriveV2CompatibilityFromLeans(modelLeans);

  return {
    schemaVersion: SCHEMA_VERSION,
    tournament,
    tournamentId,
    localScheduleId,
    course,
    generatedAt,
    status,
    reason,
    sourceStatus,
    oddsDiagnostics,
    recommendations,
    modelLeans,
    ladders,
    portfolioDiagnostics,
    probabilityMethod: "provisional-plackett-luce-style-independent-race-approximation",
    fieldCoverage,
    methodologyNotes,
    dataLimitations,
    ...compat,
  };
}

const REQUIRED_TOP_LEVEL_FIELDS = [
  "schemaVersion", "tournament", "tournamentId", "localScheduleId", "course", "generatedAt", "status", "reason",
  "sourceStatus", "oddsDiagnostics", "recommendations", "modelLeans", "ladders", "portfolioDiagnostics",
  "probabilityMethod", "fieldCoverage", "methodologyNotes", "dataLimitations", "outrights", "top5", "top10", "top20",
];

const VALID_STATUSES = new Set(["official-best-bets", "model-leans-only", "unavailable"]);

/** Every numeric value in `value` must be finite (no NaN/Infinity) and the whole structure must be JSON-serializable. */
export function assertFiniteAndSerializable(value, path = "$") {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Non-finite number at ${path}: ${value}`);
    return;
  }
  if (value === null || value === undefined || typeof value === "string" || typeof value === "boolean") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertFiniteAndSerializable(item, `${path}[${index}]`));
    return;
  }
  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) assertFiniteAndSerializable(nested, `${path}.${key}`);
    return;
  }
  throw new Error(`Non-JSON-serializable value at ${path}: ${typeof value}`);
}

export function validateV3Artifact(artifact) {
  const errors = [];
  for (const field of REQUIRED_TOP_LEVEL_FIELDS) {
    if (!(field in (artifact ?? {}))) errors.push(`missing required field: ${field}`);
  }
  if (artifact?.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  if (!VALID_STATUSES.has(artifact?.status)) errors.push(`invalid status: ${artifact?.status}`);

  if (artifact?.status === "official-best-bets" && (!Array.isArray(artifact.recommendations) || artifact.recommendations.length === 0)) {
    errors.push('status "official-best-bets" requires at least one recommendation');
  }
  if (artifact?.status !== "official-best-bets" && Array.isArray(artifact?.recommendations) && artifact.recommendations.length > 0) {
    errors.push(`status "${artifact?.status}" must not carry priced recommendations`);
  }
  if ((artifact?.status === "unavailable") && Array.isArray(artifact?.modelLeans) && artifact.modelLeans.length > 0) {
    errors.push('status "unavailable" must not carry Model Leans');
  }

  const laddersFromRecs = buildLaddersArray(artifact?.recommendations ?? []);
  if (JSON.stringify([...laddersFromRecs].sort((a, b) => a.ladderId.localeCompare(b.ladderId))) !== JSON.stringify([...(artifact?.ladders ?? [])].sort((a, b) => a.ladderId.localeCompare(b.ladderId)))) {
    errors.push("ladders array does not reconcile with recommendations' ladderId fields");
  }

  for (const lean of artifact?.modelLeans ?? []) {
    if ("expectedValue" in lean || "odds" in lean || "probabilityEdge" in lean || "sportsbook" in lean) {
      errors.push(`model lean for ${lean.player} carries a priced-recommendation-only field`);
    }
    if (containsForbiddenLeanLanguage(lean.note)) {
      errors.push(`model lean for ${lean.player} contains forbidden price/value language`);
    }
  }

  try {
    assertFiniteAndSerializable(artifact);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  return { valid: errors.length === 0, errors };
}

/** Diagnostics reconciliation: every count in `portfolioDiagnostics` must be internally consistent. */
export function validatePortfolioDiagnostics(diagnostics) {
  const errors = [];
  if (!diagnostics) return { valid: true, errors };
  const { totalRecommendations, uniqueGolfers, duplicationRate, candidatesCreated, candidatesWithExactPrice } = diagnostics;
  if (candidatesWithExactPrice > candidatesCreated) errors.push("candidatesWithExactPrice cannot exceed candidatesCreated");
  if (uniqueGolfers > totalRecommendations) errors.push("uniqueGolfers cannot exceed totalRecommendations");
  const expectedDuplication = totalRecommendations > 0 ? (totalRecommendations - uniqueGolfers) / totalRecommendations : 0;
  if (Math.abs(expectedDuplication - duplicationRate) > 1e-9) errors.push("duplicationRate does not match (totalRecommendations - uniqueGolfers) / totalRecommendations");
  return { valid: errors.length === 0, errors };
}
