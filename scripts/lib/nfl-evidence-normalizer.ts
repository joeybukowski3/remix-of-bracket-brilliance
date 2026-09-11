/**
 * WU2 -- pure normalization layer for external NFL research evidence.
 * normalizeExternalEvidence() is the ONLY boundary a raw research finding
 * (from a future Grok or ChatGPT adapter) is allowed to cross on its way to
 * becoming a trusted EvidenceRecord. It is deliberately decoupled from any
 * model/API -- it takes a plain RawEvidenceCandidate and a deterministic
 * EvidenceNormalizationContext (season/week/teams/kickoff), never a network
 * call, and never an API key.
 *
 * Hard failures (structurally unsafe -- wrong game, malformed timestamps,
 * missing required fields, quote integrity failure) reject the candidate
 * entirely: normalizeExternalEvidence returns { ok: false, reasons }.
 *
 * Soft failures (low-quality source, unsupported "sharp money" language,
 * post-kickoff timing, JKB-metric masquerading) do NOT drop the record --
 * per the architecture's "never silently overwrite/drop history" rule, they
 * still produce an EvidenceRecord, just with verificationStatus: "rejected"
 * and/or pregameSafe: false so downstream consumers can mechanically filter
 * it out.
 */

import { contentHash, type JsonValue } from "./nfl-production-prediction-archive";
import {
  EVIDENCE_CATEGORIES,
  EVIDENCE_CONFIDENCE_LEVELS,
  EVIDENCE_RELEVANCE_AREAS,
  EVIDENCE_SCHEMA_VERSION,
  EVIDENCE_SOURCE_TYPES,
  EVIDENCE_VERIFICATION_STATUSES,
  type EvidenceConfidence,
  type EvidenceFreshness,
  type EvidenceNormalizationContext,
  type EvidenceRecord,
  type EvidenceSubjectValidation,
  type EvidenceVerificationStatus,
  type RawEvidenceCandidate,
} from "./nfl-evidence-types";
import { freshnessThresholdsForCategory, isRejectedSourceByPolicy, isUnsupportedSharpMoneyClaim, sourceTier } from "./nfl-evidence-policy";
import { validateSubjectIdentities } from "./nfl-evidence-subject-identity";

export const NORMALIZER_VERSION = "nfl-evidence-normalizer-v1" as const;

export type NormalizeResult = { ok: true; evidence: EvidenceRecord } | { ok: false; reasons: string[] };

const GAME_ID_PATTERN = /^(\d{4})_(\d{2})_([A-Za-z]+)_([A-Za-z]+)$/;

/** Postgame-result language a pregame claim must never carry. */
const FORBIDDEN_POSTGAME_PATTERN =
  /\b(final score|defeated|won the game|game[- ]winning|walked off|final:|postgame|after the win|after the loss)\b/i;

/** Mechanical proxy for "external claim restates a JKB-only internal metric as if independently researched." */
const JKB_METRIC_LANGUAGE_PATTERN = /\b(power rating|epa\/play|power v0\.|jkb (fair|projected) (spread|total)|model[- ]market edge)\b/i;

function isParseableIso(value: string | null): boolean {
  if (value == null) return true; // absence is checked separately per-field
  return Number.isFinite(Date.parse(value));
}

function isValidUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Hard, structural validation. Any failure here means the candidate never
 * becomes an EvidenceRecord at all -- these are the "this cannot be safely
 * placed anywhere" cases, not quality judgments.
 */
function validateStructural(candidate: RawEvidenceCandidate, context: EvidenceNormalizationContext, subjectValidation: EvidenceSubjectValidation): string[] {
  const reasons: string[] = [];

  if (candidate.model !== "grok" && candidate.model !== "chatgpt") {
    reasons.push(`invalid model namespace "${candidate.model}" (must be "grok" or "chatgpt")`);
  }

  if (candidate.gameId !== context.gameId) {
    reasons.push(`gameId "${candidate.gameId}" does not match expected context gameId "${context.gameId}"`);
  } else {
    const match = GAME_ID_PATTERN.exec(candidate.gameId);
    if (!match) {
      reasons.push(`gameId "${candidate.gameId}" does not match <season>_<week>_<AWAY>_<HOME>`);
    } else {
      const [, seasonStr, weekStr, awayToken, homeToken] = match;
      if (Number(seasonStr) !== context.season) reasons.push(`gameId season ${seasonStr} does not match context.season ${context.season}`);
      if (Number(weekStr) !== context.week) reasons.push(`gameId week ${weekStr} does not match context.week ${context.week}`);
      if (awayToken.toLowerCase() !== context.awayTeam) reasons.push(`gameId away token ${awayToken} does not match context.awayTeam ${context.awayTeam}`);
      if (homeToken.toLowerCase() !== context.homeTeam) reasons.push(`gameId home token ${homeToken} does not match context.homeTeam ${context.homeTeam}`);
    }
  }

  if (!candidate.claim || candidate.claim.trim().length === 0) {
    reasons.push("claim is empty");
  }

  if (!EVIDENCE_CATEGORIES.includes(candidate.category)) {
    reasons.push(`invalid category "${candidate.category}"`);
  }

  if (!candidate.source || !candidate.source.name || candidate.source.name.trim().length === 0) {
    reasons.push("source.name is required");
  }
  if (!candidate.source || !EVIDENCE_SOURCE_TYPES.includes(candidate.source.sourceType)) {
    reasons.push(`invalid source.sourceType "${candidate.source?.sourceType}"`);
  }
  if (!candidate.source || !candidate.source.url || !isValidUrl(candidate.source.url)) {
    reasons.push("source.url is required and must be a well-formed URL");
  }
  if (!candidate.source || !candidate.source.retrievedAt || !Number.isFinite(Date.parse(candidate.source.retrievedAt))) {
    reasons.push("source.retrievedAt is required and must be a parseable ISO timestamp");
  }
  if (candidate.source?.publishedAt != null && !isParseableIso(candidate.source.publishedAt)) {
    reasons.push(`source.publishedAt "${candidate.source.publishedAt}" is not a parseable ISO timestamp`);
  }

  const teams = candidate.subjects?.teams ?? [];
  const allowedTeams = new Set([context.homeTeam, context.awayTeam]);
  for (const team of teams) {
    if (!allowedTeams.has(team)) {
      reasons.push(`subjects.teams entry "${team}" is not one of this game's teams (${context.homeTeam}/${context.awayTeam}) -- wrong-game association`);
    }
    if (!context.knownTeamAbbrs.has(team)) {
      reasons.push(`subjects.teams entry "${team}" is not a known team alias`);
    }
  }

  for (const player of subjectValidation.players) {
    if (player.status === "rejected") {
      reasons.push(`subjects.players entry "${player.input}" is conclusively rostered on an unrelated team (${player.team}) -- wrong-team player association`);
    }
  }
  for (const coach of subjectValidation.coaches) {
    if (coach.status === "rejected") {
      reasons.push(`subjects.coaches entry "${coach.input}" is conclusively associated with an unrelated team (${coach.team}) -- wrong-team coach association`);
    }
  }

  if (candidate.confidence != null && !EVIDENCE_CONFIDENCE_LEVELS.includes(candidate.confidence)) {
    reasons.push(`invalid confidence "${candidate.confidence}"`);
  }

  for (const area of candidate.relevance?.areas ?? []) {
    if (!EVIDENCE_RELEVANCE_AREAS.includes(area)) {
      reasons.push(`invalid relevance area "${area}"`);
    }
  }

  if (candidate.quote) {
    if (!candidate.quote.speaker || candidate.quote.speaker.trim().length === 0) {
      reasons.push("quote.speaker is required when a quote is present");
    }
    if (!candidate.quote.exactText || candidate.quote.exactText.trim().length === 0) {
      reasons.push("quote.exactText is required when a quote is present");
    }
    if (!candidate.rawExcerpt || !candidate.quote.exactText || !candidate.rawExcerpt.includes(candidate.quote.exactText)) {
      reasons.push("quote.exactText must appear verbatim inside rawExcerpt -- a paraphrase cannot be stored as a quote");
    }
  }

  return reasons;
}

function canonicalClaimKey(claim: string): string {
  return claim.trim().replace(/\s+/g, " ").toLowerCase();
}

function computeEvidenceId(candidate: RawEvidenceCandidate, referenceTimestamp: string): string {
  const key = {
    model: candidate.model,
    gameId: candidate.gameId,
    category: candidate.category,
    claim: canonicalClaimKey(candidate.claim),
    sourceUrl: candidate.source.url,
    timestamp: referenceTimestamp,
  };
  return `${candidate.model}-${candidate.gameId}-${contentHash(key as unknown as JsonValue).slice(0, 16)}`;
}

function computeFreshness(category: RawEvidenceCandidate["category"], publishedAt: string | null, retrievedAt: string, kickoffUtc: string): EvidenceFreshness {
  const referenceMs = publishedAt != null && Number.isFinite(Date.parse(publishedAt)) ? Date.parse(publishedAt) : Date.parse(retrievedAt);
  const kickoffMs = Date.parse(kickoffUtc);
  if (!Number.isFinite(referenceMs) || !Number.isFinite(kickoffMs)) return "unknown";
  const hoursBeforeKickoff = (kickoffMs - referenceMs) / (60 * 60 * 1000);
  if (hoursBeforeKickoff < 0) return "unknown"; // post-kickoff timing is a pregame-safety concern, not a freshness one
  const thresholds = freshnessThresholdsForCategory(category);
  if (hoursBeforeKickoff <= thresholds.fresh) return "fresh";
  if (hoursBeforeKickoff <= thresholds.aging) return "aging";
  return "stale";
}

function baseVerificationStatus(tier: 1 | 2 | 3 | 4): EvidenceVerificationStatus {
  if (tier === 1) return "verified";
  if (tier === 2 || tier === 3) return "single_source";
  return "unverified";
}

function defaultConfidenceForTier(tier: 1 | 2 | 3 | 4): EvidenceConfidence {
  if (tier === 1) return "high";
  if (tier === 4) return "low";
  return "medium";
}

/**
 * The one function a future adapter/orchestrator calls. Pure -- no I/O, no
 * mutation of its inputs, deterministic for a given (candidate, context)
 * pair (see nfl-evidence-normalizer.test.ts's determinism assertion).
 */
export function normalizeExternalEvidence(candidate: RawEvidenceCandidate, context: EvidenceNormalizationContext): NormalizeResult {
  const subjectValidation = validateSubjectIdentities(
    { players: candidate.subjects?.players ?? [], coaches: candidate.subjects?.coaches ?? [] },
    { homeTeam: context.homeTeam, awayTeam: context.awayTeam },
    context.subjectIdentity ?? null
  );

  const structuralIssues = validateStructural(candidate, context, subjectValidation);
  if (structuralIssues.length > 0) {
    return { ok: false, reasons: structuralIssues };
  }

  const publishedAt = candidate.source.publishedAt ?? null;
  const retrievedAt = candidate.source.retrievedAt;
  const kickoffMs = Date.parse(context.kickoffUtc);

  const publishedAfterKickoff = publishedAt != null && Number.isFinite(Date.parse(publishedAt)) && Date.parse(publishedAt) >= kickoffMs;
  const retrievedAfterKickoff = Number.isFinite(Date.parse(retrievedAt)) && Date.parse(retrievedAt) >= kickoffMs;
  const containsPostgameLanguage = FORBIDDEN_POSTGAME_PATTERN.test(candidate.claim);

  const pregameSafe = !publishedAfterKickoff && !retrievedAfterKickoff && !containsPostgameLanguage;

  const tier = sourceTier(candidate.source.sourceType);
  const policyRejected = isRejectedSourceByPolicy({
    sourceType: candidate.source.sourceType,
    sourceName: candidate.source.name,
    url: candidate.source.url,
  });
  const sharpMoneyUnsupported = isUnsupportedSharpMoneyClaim({
    category: candidate.category,
    claim: candidate.claim,
    sourceType: candidate.source.sourceType,
  });
  const jkbMetricMasquerade = JKB_METRIC_LANGUAGE_PATTERN.test(candidate.claim) && candidate.source.sourceType !== "official_nfl" && candidate.source.sourceType !== "official_team";

  let verificationStatus = baseVerificationStatus(tier);
  if (policyRejected || sharpMoneyUnsupported || jkbMetricMasquerade) {
    verificationStatus = "rejected";
  }
  if (!EVIDENCE_VERIFICATION_STATUSES.includes(verificationStatus)) {
    // Defensive; the branches above are exhaustive, but never let a rejected
    // record accidentally read "verified" -- structural guarantee, not just
    // a policy default.
    verificationStatus = "unverified";
  }

  let confidence: EvidenceConfidence = candidate.confidence ?? defaultConfidenceForTier(tier);
  if (verificationStatus === "rejected" && confidence !== "low") {
    confidence = "low";
  }

  const referenceTimestamp = publishedAt ?? retrievedAt;
  const evidenceId = computeEvidenceId(candidate, referenceTimestamp);
  const normalizedAt = new Date().toISOString();

  const evidence: EvidenceRecord = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    evidenceId,
    model: candidate.model,
    gameId: candidate.gameId,
    season: context.season,
    week: context.week,
    claim: candidate.claim.trim(),
    category: candidate.category,
    source: {
      name: candidate.source.name,
      url: candidate.source.url,
      sourceType: candidate.source.sourceType,
      author: candidate.source.author ?? null,
      publishedAt,
      retrievedAt,
    },
    subjects: {
      teams: candidate.subjects?.teams ?? [],
      players: candidate.subjects?.players ?? [],
      coaches: candidate.subjects?.coaches ?? [],
    },
    subjectValidation,
    confidence,
    verificationStatus,
    pregameSafe,
    relevance: {
      summary: candidate.relevance?.summary ?? "",
      areas: candidate.relevance?.areas ?? [],
    },
    quote: candidate.quote ?? null,
    rawExcerpt: candidate.rawExcerpt ?? null,
    freshness: computeFreshness(candidate.category, publishedAt, retrievedAt, context.kickoffUtc),
    supersessionStatus: "current",
    supersedesEvidenceId: candidate.supersedesEvidenceId ?? null,
    normalizedAt,
    provenance: {
      candidateHash: contentHash(candidate as unknown as JsonValue),
      normalizerVersion: NORMALIZER_VERSION,
      contextVersionAtNormalization: context.contextVersion,
    },
  };

  return { ok: true, evidence };
}
