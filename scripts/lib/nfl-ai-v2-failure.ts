/**
 * AI Picks v2 automation -- a structured, SAFE description of why a paid
 * handicap stage failed. The one-game CLI (scripts/run-nfl-handicap-v2.ts) prints
 * a single marker line on stderr; the slate executor reads it back to classify
 * the failure in the attempt ledger and in the run summary.
 *
 * Why it exists: before this, the ledger and the CI summary stored the child's
 * whole stderr, which on a validation failure ends with the model's raw JSON
 * ("Raw Stage A output: ..."), and a timeout could not be told apart from a
 * validation failure. The summary carried here is only the transport error text
 * or the validator's own reasons -- never the provider payload.
 *
 * Markers are advisory: a missing/garbled marker degrades to kind "unknown" with
 * the stderr cut before any raw-output section, so it can never make a failure
 * look like a success or unlock a retry.
 */

export const V2_FAILURE_KINDS = [
  /** Our client AbortController fired: no complete response within the stage's requestTimeoutMs. */
  "transport_timeout",
  /** The request failed before an HTTP response (DNS, connection reset, ...). */
  "transport_error",
  /** The provider answered with a non-2xx HTTP status. */
  "provider_http",
  /** HTTP 200 but no usable output: no message text, non-JSON body, JSON that did not parse, truncated/incomplete. */
  "provider_output",
  /** The model returned JSON that failed the v2 validator (bad evidence id, bad probabilities, ...). */
  "validation",
  /** Anything else, including a failure before any paid call. */
  "unknown",
] as const;
export type V2FailureKind = (typeof V2_FAILURE_KINDS)[number];

export interface V2HandicapFailure {
  kind: V2FailureKind;
  /** The stage that failed, or null when it could not be determined. */
  stage: "A" | "B" | null;
  /** Safe, bounded human text: transport error or validator reasons. Never raw model output. */
  summary: string;
}

export const V2_FAILURE_MARKER = "V2_HANDICAP_FAILURE ";
const RAW_OUTPUT_SECTION = /Raw Stage [AB] output:/;
const MAX_SUMMARY_CHARS = 600;

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();
const bounded = (text: string): string => (text.length > MAX_SUMMARY_CHARS ? `${text.slice(0, MAX_SUMMARY_CHARS)}...` : text);

/** Classifies a provider-adapter `error` string (nfl-grok/chatgpt-analysis-adapter.ts). Unrecognised text is "unknown", never assumed benign. */
export function classifyProviderError(error: string): V2FailureKind {
  // HTTP first: a provider error body may itself say "timed out", which is not OUR client timeout.
  if (/^HTTP \d{3}\b/.test(error)) return "provider_http";
  if (/^Request to .* timed out:/i.test(error)) return "transport_timeout";
  if (/^Request to .* failed:/i.test(error)) return "transport_error";
  if (/Failed to parse analysis JSON|No final message text|non-JSON body|incomplete response|truncated/i.test(error)) return "provider_output";
  return "unknown";
}

/** The failure for a provider call that returned `ok: false`. */
export function providerCallFailure(stage: "A" | "B", error: string): V2HandicapFailure {
  return { kind: classifyProviderError(error), stage, summary: bounded(oneLine(`Stage ${stage} provider call failed: ${error}`)) };
}

/** The failure for a model answer the v2 validator rejected. `reasons` are the validator's own messages. */
export function validationFailure(stage: "A" | "B", reasons: readonly string[]): V2HandicapFailure {
  return { kind: "validation", stage, summary: bounded(oneLine(`Stage ${stage} validation failed: ${reasons.join(" | ")}`)) };
}

export function formatFailureMarker(failure: V2HandicapFailure): string {
  return `${V2_FAILURE_MARKER}${JSON.stringify(failure)}`;
}

function isFailure(value: unknown): value is V2HandicapFailure {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.summary === "string" && (V2_FAILURE_KINDS as readonly string[]).includes(v.kind as string) && (v.stage === "A" || v.stage === "B" || v.stage === null);
}

/** Reads a child process's stderr back into a failure. Never throws and never returns text from a raw-output section. */
export function parseHandicapFailure(stderr: string): V2HandicapFailure {
  const lines = stderr.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!lines[i].startsWith(V2_FAILURE_MARKER)) continue;
    try {
      const parsed: unknown = JSON.parse(lines[i].slice(V2_FAILURE_MARKER.length));
      if (isFailure(parsed)) return { kind: parsed.kind, stage: parsed.stage, summary: bounded(oneLine(parsed.summary)) };
    } catch {
      // fall through to the conservative fallback
    }
    break;
  }
  const beforeRaw = stderr.split(RAW_OUTPUT_SECTION)[0];
  return { kind: "unknown", stage: null, summary: bounded(oneLine(beforeRaw)) || "handicap run failed without a diagnostic" };
}
