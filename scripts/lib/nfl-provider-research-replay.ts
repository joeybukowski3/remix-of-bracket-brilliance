/**
 * WU6.5 -- zero-cost replay of an already-archived, paid-for provider
 * research response that failed CLIENT-SIDE (normalization/hashing) after
 * the API call itself completed successfully. Recovers the WU6.3 DET_BUF
 * incident class: ChatGPT returned 12 candidates for real money, one was
 * malformed, and the entire pass was discarded by an uncaught exception
 * before PR #354's per-candidate quarantine existed.
 *
 * Architecture (never deviates from this):
 *   archived immutable provider response
 *     -> current parser            (parseChatGptResponsesBody, same as a live run)
 *     -> current candidate validation/quarantine (buildRawEvidenceCandidatesFromFindings, PR #354)
 *     -> current evidence normalizer/policy       (normalizeExternalEvidence, unchanged)
 *     -> accepted evidence + rejected findings
 *     -> normal research persistence/bootstrap lifecycle (evidence.live-test.json,
 *        the exact file run-nfl-chatgpt-research.ts's "initial" mode writes)
 *
 * This module is PURE -- no file I/O, no network, no provider API call of
 * any kind. It is the ONLY thing scripts/replay-nfl-provider-research.ts
 * calls to turn an archived raw response into a plan; the CLI script owns
 * every read/write and every safety-check input this module needs (pregame
 * lock status, whether an archive/lineage already exists, etc.) -- kept
 * that way specifically so replay decisions are unit-testable without
 * touching disk or mocking fetch.
 *
 * Provider scope: ChatGPT only. Grok's "initial" research mode currently
 * persists NO raw-response/diagnostics artifact on any path (success or
 * failure) -- see run-nfl-grok-research.ts's runInitial(): only
 * evidence.live-test.json is ever written. There is nothing to replay FROM
 * for Grok today. Faking parity by inventing a Grok raw-response archive
 * format here would misrepresent what the codebase actually persists, so
 * this module deliberately does not attempt it -- see the WU6.5 report for
 * the Grok gap, tracked separately.
 */
import { contentHash, type JsonValue } from "./nfl-production-prediction-archive";
import {
  buildChatGptResponseDiagnostics,
  buildRawEvidenceCandidatesFromFindings,
  checkRawVsParsedConsistency,
  parseChatGptFindings,
  parseChatGptResponsesBody,
  parseChatGptUsageTelemetry,
  type ChatGptGroundingProvenance,
  type ChatGptResponseDiagnostics,
  type ChatGptUsageTelemetry,
  type ParsedChatGptResponsesOutput,
  type RejectedChatGptFinding,
} from "./nfl-chatgpt-research-parsing";
import { summarizeResearchCoverage, type ResearchCoverageSummary } from "./nfl-grok-research-coverage";
import { normalizeExternalEvidence } from "./nfl-evidence-normalizer";
import type { EvidenceNormalizationContext, EvidenceRecord } from "./nfl-evidence-types";

export interface NormalizeRejection {
  claim: string;
  reasons: string[];
}

export interface ChatGptReplayPlan {
  /** True only when the archived response itself reports a clean, non-truncated completion. Replay must never proceed past this being false. */
  responseUsableForReplay: boolean;
  responseUnusableReason: string | null;
  responseId: string | null;
  responseStatus: string | null;
  responseModel: string | null;
  /** Unix-epoch seconds, straight from the archived response body -- never "now". */
  createdAtEpochSeconds: number | null;
  completedAtEpochSeconds: number | null;
  usage: ChatGptUsageTelemetry;
  diagnostics: ChatGptResponseDiagnostics;
  groundingProvenance: ChatGptGroundingProvenance;
  coverage: ResearchCoverageSummary | null;
  /** Every finding the archived response's message JSON contained, before any rejection. */
  candidatesParsedCount: number;
  /** Rejected at the parsing/grounding layer (malformed shape, or a sourceUrl not actually returned by web_search) -- never reaches normalizeExternalEvidence. */
  structurallyRejected: RejectedChatGptFinding[];
  /** Passed parsing/grounding, then normalizeExternalEvidence accepted it. */
  accepted: EvidenceRecord[];
  /** Passed parsing/grounding, then normalizeExternalEvidence rejected it (category/game/subject/quote policy, etc.). */
  policyRejected: NormalizeRejection[];
}

/**
 * The retrievedAt every replayed candidate is stamped with -- the archived
 * response's OWN completion time, never "now". Replaying an old response
 * must not make it look like it was freshly retrieved today; freshness
 * classification (nfl-evidence-normalizer.ts's computeFreshness) depends on
 * this being the real original moment.
 */
export function retrievedAtFromArchivedResponse(parsed: ParsedChatGptResponsesOutput): string {
  const epochSeconds = parsed.completedAt ?? parsed.createdAt;
  if (epochSeconds == null || !Number.isFinite(epochSeconds)) {
    throw new Error("nfl-provider-research-replay: archived response has no createdAt/completedAt -- cannot derive a retrievedAt timestamp for replay");
  }
  return new Date(epochSeconds * 1000).toISOString();
}

/**
 * Pure planning: turns an already-fetched, archived raw OpenAI /v1/responses
 * body into exactly the same shape a live "initial" research pass would have
 * produced -- via the SAME parsing/candidate-building/normalization
 * functions a live run uses (parseChatGptResponsesBody,
 * buildRawEvidenceCandidatesFromFindings from PR #354,
 * normalizeExternalEvidence), never a forked copy of their rules. No I/O, no
 * network -- rawResponseBody is data the caller already has on disk.
 */
export function planChatGptReplay(input: { rawResponseBody: unknown; gameId: string; context: EvidenceNormalizationContext }): ChatGptReplayPlan {
  const parsed = parseChatGptResponsesBody(input.rawResponseBody);
  const diagnostics = buildChatGptResponseDiagnostics(input.rawResponseBody);
  const groundingProvenance = checkRawVsParsedConsistency(diagnostics, parsed);
  const usage = parseChatGptUsageTelemetry((input.rawResponseBody as { usage?: unknown } | null)?.usage, (input.rawResponseBody as { tool_usage?: unknown } | null)?.tool_usage);

  const basePlan = {
    responseId: parsed.responseId,
    responseStatus: parsed.responseStatus,
    responseModel: parsed.model,
    createdAtEpochSeconds: parsed.createdAt,
    completedAtEpochSeconds: parsed.completedAt,
    usage,
    diagnostics,
    groundingProvenance,
  };

  if (groundingProvenance.status === "parser_consistency_error") {
    return { ...basePlan, responseUsableForReplay: false, responseUnusableReason: `raw-vs-parsed grounding consistency check failed: ${groundingProvenance.details}`, coverage: null, candidatesParsedCount: 0, structurallyRejected: [], accepted: [], policyRejected: [] };
  }
  if (parsed.responseStatus !== "completed") {
    return { ...basePlan, responseUsableForReplay: false, responseUnusableReason: `archived response status is "${parsed.responseStatus}", not "completed" -- refusing to replay an incomplete/failed provider response`, coverage: null, candidatesParsedCount: 0, structurallyRejected: [], accepted: [], policyRejected: [] };
  }
  if (!parsed.messageText) {
    return { ...basePlan, responseUsableForReplay: false, responseUnusableReason: "archived response has no final message text to parse", coverage: null, candidatesParsedCount: 0, structurallyRejected: [], accepted: [], policyRejected: [] };
  }

  let rawFindings: unknown[];
  try {
    rawFindings = parseChatGptFindings(parsed.messageText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ...basePlan, responseUsableForReplay: false, responseUnusableReason: `failed to parse findings JSON from archived response: ${message}`, coverage: null, candidatesParsedCount: 0, structurallyRejected: [], accepted: [], policyRejected: [] };
  }

  const retrievedAt = retrievedAtFromArchivedResponse(parsed);
  const { candidates, rejected } = buildRawEvidenceCandidatesFromFindings(rawFindings, {
    model: "chatgpt",
    gameId: input.gameId,
    discoveredSources: parsed.discoveredSources,
    citedSources: parsed.citedSources,
    retrievedAt,
  });

  const coverage = summarizeResearchCoverage(candidates, parsed.searchQueries);

  const accepted: EvidenceRecord[] = [];
  const policyRejected: NormalizeRejection[] = [];
  for (const candidate of candidates) {
    const normalized = normalizeExternalEvidence(candidate, input.context);
    if (normalized.ok) {
      accepted.push(normalized.evidence);
    } else {
      policyRejected.push({ claim: candidate.claim, reasons: normalized.reasons });
    }
  }

  return { ...basePlan, responseUsableForReplay: true, responseUnusableReason: null, coverage, candidatesParsedCount: rawFindings.length, structurallyRejected: rejected, accepted, policyRejected };
}

export interface ReplaySafetyCheckInput {
  isPregameLocked: boolean | null;
  archivedResponseExists: boolean;
  archiveProviderMatchesRequested: boolean;
  archiveGameIdMatchesRequested: boolean;
  archiveModeIsReplaySupported: boolean;
  contextArtifactValid: boolean;
  /** True when ANY snapshot lineage already exists for this game/provider -- replay only ever seeds the FIRST research pass, matching live "initial" mode's own contract. */
  snapshotLineageAlreadyExists: boolean;
  /** True when evidence.live-test.json already has one or more records for this game/provider -- replaying "initial" would silently clobber it (createEvidenceStore always starts empty, matching the live script). */
  liveEvidenceAlreadyExists: boolean;
  /** True when a replay-manifest for this exact archived run already exists. */
  alreadyReplayed: boolean;
}

export interface ReplaySafetyCheckResult {
  ok: boolean;
  /** Present (true) only when every other check passed AND alreadyReplayed is true -- the one case that is a clean no-op, not a failure. */
  noOpAlreadyReplayed: boolean;
  violations: string[];
}

/**
 * All safety checks a replay --apply must pass before any mutation happens.
 * Pure -- every fact is passed in by the CLI, which is the only place that
 * actually reads the filesystem/clock. Returns violations for EVERY failing
 * check (never short-circuits on the first one) so a dry-run can show the
 * complete picture in one pass.
 */
export function checkReplaySafety(input: ReplaySafetyCheckInput): ReplaySafetyCheckResult {
  const violations: string[] = [];

  if (input.alreadyReplayed) {
    // Every OTHER check is irrelevant once this specific archived run has already been replayed --
    // the correct response is a clean no-op report, not a pile of now-moot violations.
    return { ok: true, noOpAlreadyReplayed: true, violations: [] };
  }

  if (!input.archivedResponseExists) violations.push("archived provider response not found at the given run path");
  if (!input.archiveProviderMatchesRequested) violations.push("archived run's provider does not match --provider");
  if (!input.archiveGameIdMatchesRequested) violations.push("archived run's gameId does not match --game");
  if (!input.archiveModeIsReplaySupported) violations.push('only "initial"/"probe" mode archives are supported for replay in this version');
  if (input.isPregameLocked !== false) violations.push(input.isPregameLocked == null ? "pregame lock status could not be determined -- refusing to guess" : "kickoff has already passed -- pregame safety refuses this replay");
  if (!input.contextArtifactValid) violations.push("no valid persisted game-context artifact exists to normalize against (replay never rebuilds context)");
  if (input.snapshotLineageAlreadyExists) violations.push("a snapshot lineage already exists for this game/provider -- replay only seeds the FIRST research pass, matching live initial-mode semantics; this lineage supersedes the archive");
  if (input.liveEvidenceAlreadyExists) violations.push("evidence.live-test.json already has records for this game/provider -- replaying initial mode would silently overwrite them (initial mode always starts from an empty store)");

  return { ok: violations.length === 0, noOpAlreadyReplayed: false, violations };
}

export interface ReplayManifest {
  schemaVersion: "nfl-provider-research-replay-v1";
  replayedFromArchivedResponse: true;
  replayedAt: string;
  replaySourcePath: string;
  replaySourceRunId: string;
  provider: "chatgpt";
  gameId: string;
  mode: string;
  originalResponseId: string | null;
  originalResponseModel: string | null;
  originalCreatedAtEpochSeconds: number | null;
  originalCompletedAtEpochSeconds: number | null;
  candidatesParsedCount: number;
  structurallyRejectedCount: number;
  policyRejectedCount: number;
  acceptedCount: number;
  manifestHash: string;
}

export function buildReplayManifest(input: {
  replayedAt: string;
  replaySourcePath: string;
  replaySourceRunId: string;
  gameId: string;
  mode: string;
  plan: ChatGptReplayPlan;
}): ReplayManifest {
  const withoutHash = {
    schemaVersion: "nfl-provider-research-replay-v1" as const,
    replayedFromArchivedResponse: true as const,
    replayedAt: input.replayedAt,
    replaySourcePath: input.replaySourcePath,
    replaySourceRunId: input.replaySourceRunId,
    provider: "chatgpt" as const,
    gameId: input.gameId,
    mode: input.mode,
    originalResponseId: input.plan.responseId,
    originalResponseModel: input.plan.responseModel,
    originalCreatedAtEpochSeconds: input.plan.createdAtEpochSeconds,
    originalCompletedAtEpochSeconds: input.plan.completedAtEpochSeconds,
    candidatesParsedCount: input.plan.candidatesParsedCount,
    structurallyRejectedCount: input.plan.structurallyRejected.length,
    policyRejectedCount: input.plan.policyRejected.length,
    acceptedCount: input.plan.accepted.length,
  };
  return { ...withoutHash, manifestHash: contentHash(withoutHash as unknown as JsonValue) };
}
