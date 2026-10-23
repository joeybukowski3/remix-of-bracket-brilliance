/**
 * Capped, serial, read-only probe of the public Wikidata Query Service.
 *
 * Policy honoured (see wikidataQueries.ts PROBE_LIMITS): a descriptive
 * User-Agent with contact information, one request at a time, a gap after each
 * request of at least the larger of the minimum interval and that request's own
 * duration (so processing time stays under half the 60 s-per-60 s budget), a hard request cap, row and byte caps, a client timeout
 * below the service's 60 s query limit plus slack, and NO retry: the first 429,
 * 5xx, timeout, truncated result or oversized body ends the probe, because
 * clients that keep sending after a 429 may be banned.
 *
 * `fetch`, `sleep` and `now` are injected so the behavior is testable offline.
 */
import { createHash } from "node:crypto";
import { PROBE_LIMITS, WIKIDATA_SPARQL_ENDPOINT, type ProbeQuery, type QueryId } from "./wikidataQueries";
import type { RequestRecord, SparqlJson } from "./wikidataTypes";

export const DEFAULT_USER_AGENT =
  "JKB-NBA-PositionAudit/0.1 (https://github.com/joeybukowski3/remix-of-bracket-brilliance; read-only coverage probe) node-fetch";

const GENERIC_AGENT = /^(python-requests|curl|node|node-fetch|undici|axios|java|go-http-client|wget|lwp|mozilla)\b/i;
const CONTACT = /\((?=[^)]*(https?:\/\/|@))[^)]+\)/;
/** Past this many characters of query text (before URL-encoding) the query goes in a POST body instead of the URL. */
const MAX_GET_QUERY_CHARS = 1_800;
/** Wait assumed after an abort when the service gave no usable Retry-After. */
export const DEFAULT_COOLDOWN_SECONDS = 300;

export function assertDescriptiveUserAgent(userAgent: string): void {
  if (GENERIC_AGENT.test(userAgent.trim()) || !/^[^\s/]+\/[\w.-]+\s/.test(userAgent) || !CONTACT.test(userAgent)) {
    throw new Error("User-Agent must be '<client>/<version> (<contact URL or email>) ...' per the Wikimedia User-Agent policy");
  }
}

export type ProbeOutcome = "complete" | "aborted";

export interface ProbeResult {
  outcome: ProbeOutcome;
  abortReason: string | null;
  retryAfterSeconds: number | null;
  raw: Partial<Record<QueryId, SparqlJson>>;
  requests: RequestRecord[];
}

export interface ProbeDeps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  userAgent: string;
  endpoint?: string;
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** `redirect: "error"`: a 3xx must never send this request, or the User-Agent, to another host. */
function buildRequest(endpoint: string, sparql: string, userAgent: string, signal: AbortSignal): [string, RequestInit] {
  const headers: Record<string, string> = { "User-Agent": userAgent, Accept: "application/sparql-results+json" };
  if (sparql.length <= MAX_GET_QUERY_CHARS) return [`${endpoint}?query=${encodeURIComponent(sparql)}`, { method: "GET", headers, signal, redirect: "error" }];
  return [endpoint, { method: "POST", headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" }, body: `query=${encodeURIComponent(sparql)}`, signal, redirect: "error" }];
}

/** Retry-After is either delta-seconds or an HTTP date. */
export function parseRetryAfter(value: string | null, nowMs: number): number | null {
  if (value === null || value.trim() === "") return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds >= 0 ? seconds : null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - nowMs) / 1000));
}

/** Milliseconds still to wait before probing again after an aborted run, or 0 when the cool-down has passed. */
export function cooldownRemainingMs(aborted: { abortedAtUtc: string; retryAfterSeconds: number | null }, nowMs: number): number {
  const abortedAt = Date.parse(aborted.abortedAtUtc);
  if (Number.isNaN(abortedAt)) return DEFAULT_COOLDOWN_SECONDS * 1000;
  const wait = (aborted.retryAfterSeconds ?? DEFAULT_COOLDOWN_SECONDS) * 1000;
  return Math.max(0, abortedAt + wait - nowMs);
}

/** Fewest minutes between the starts of two probe runs, whatever the output directory: a run is 8 requests. */
export const MIN_RERUN_INTERVAL_MS = 10 * 60_000;

/** Kept in one fixed file, so neither a different --out-dir nor a successful run can dodge the spacing. */
export interface ProbeState {
  lastStartedAtUtc: string;
  aborted: { abortedAtUtc: string; retryAfterSeconds: number | null } | null;
}

/** Milliseconds to wait before another run may start: the longer of the re-run spacing and any abort cool-down. */
export function rerunWaitMs(state: ProbeState, nowMs: number): number {
  const startedAt = Date.parse(state.lastStartedAtUtc);
  const spacing = Number.isNaN(startedAt) ? MIN_RERUN_INTERVAL_MS : Math.max(0, startedAt + MIN_RERUN_INTERVAL_MS - nowMs);
  return Math.max(spacing, state.aborted ? cooldownRemainingMs(state.aborted, nowMs) : 0);
}

/** Reads the body while counting bytes, so an oversized response is abandoned instead of buffered. Null when over the cap. */
async function readCapped(response: Response, cap: number): Promise<{ text: string; bytes: number } | { overBytes: number }> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > cap) return { overBytes: declared };
  if (response.body === null) {
    const text = await response.text();
    const bytes = Buffer.byteLength(text, "utf8");
    return bytes > cap ? { overBytes: bytes } : { text, bytes };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      return { overBytes: total };
    }
    chunks.push(value);
  }
  return { text: Buffer.concat(chunks).toString("utf8"), bytes: total };
}

interface Attempt {
  record: RequestRecord;
  json: SparqlJson | null;
  abortReason: string | null;
  retryAfterSeconds: number | null;
}

async function attempt(query: ProbeQuery, deps: ProbeDeps): Promise<Attempt> {
  const startedAt = deps.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_LIMITS.requestTimeoutMs);
  const base = { queryId: query.id, queryHash: sha256(query.sparql), startedAtUtc: new Date(startedAt).toISOString() };
  const finish = (status: number, rows: number, bytes: number, abortReason: string | null, json: SparqlJson | null, retryAfterSeconds: number | null = null): Attempt => ({
    record: { ...base, status, rows, bytes, elapsedMs: deps.now() - startedAt },
    json,
    abortReason,
    retryAfterSeconds,
  });
  try {
    const [url, init] = buildRequest(deps.endpoint ?? WIKIDATA_SPARQL_ENDPOINT, query.sparql, deps.userAgent, controller.signal);
    const response = await deps.fetch(url, init);
    if (response.status === 429 || response.status === 503) {
      const retryAfter = parseRetryAfter(response.headers.get("retry-after"), deps.now());
      return finish(response.status, 0, 0, `HTTP ${response.status} on "${query.id}"; stopping without retry${retryAfter === null ? "" : ` (Retry-After ${retryAfter}s)`}`, null, retryAfter);
    }
    if (response.status !== 200) return finish(response.status, 0, 0, `HTTP ${response.status} on "${query.id}"`, null);
    const body = await readCapped(response, PROBE_LIMITS.maxResponseBytes);
    if ("overBytes" in body) return finish(200, 0, body.overBytes, `response for "${query.id}" exceeded ${PROBE_LIMITS.maxResponseBytes} bytes`, null);
    const { text, bytes } = body;
    const json = JSON.parse(text) as SparqlJson;
    const bindings: unknown = json?.results?.bindings;
    if (!Array.isArray(bindings)) return finish(200, 0, bytes, `response for "${query.id}" is not a SPARQL JSON result`, null);
    const rows = bindings.length;
    if (rows >= PROBE_LIMITS.maxRowsPerQuery) return finish(200, rows, bytes, `result for "${query.id}" hit the ${PROBE_LIMITS.maxRowsPerQuery}-row cap and may be truncated`, null);
    return finish(200, rows, bytes, null, json);
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError" ? `"${query.id}" timed out after ${PROBE_LIMITS.requestTimeoutMs} ms` : `"${query.id}" failed: ${error instanceof Error ? error.message : String(error)}`;
    return finish(0, 0, 0, reason, null);
  } finally {
    clearTimeout(timer);
  }
}

/** Runs the queries one at a time. Stops at the first problem; completed results are kept. */
export async function runProbe(queries: readonly ProbeQuery[], deps: ProbeDeps): Promise<ProbeResult> {
  assertDescriptiveUserAgent(deps.userAgent);
  if (queries.length > PROBE_LIMITS.maxRequests) throw new Error(`Probe plan has ${queries.length} requests; the cap is ${PROBE_LIMITS.maxRequests}`);
  const raw: Partial<Record<QueryId, SparqlJson>> = {};
  const requests: RequestRecord[] = [];
  let previous: { finishedAt: number; elapsedMs: number } | null = null;
  for (const query of queries) {
    if (previous !== null) {
      // The service allows 60 s of processing per client per 60 s: idle at least as long as the last request took.
      const wait = Math.max(PROBE_LIMITS.minIntervalMs, previous.elapsedMs) - (deps.now() - previous.finishedAt);
      if (wait > 0) await deps.sleep(wait);
    }
    const result = await attempt(query, deps);
    previous = { finishedAt: deps.now(), elapsedMs: result.record.elapsedMs };
    requests.push(result.record);
    if (result.abortReason !== null || result.json === null) {
      return { outcome: "aborted", abortReason: result.abortReason ?? `no result for "${query.id}"`, retryAfterSeconds: result.retryAfterSeconds, raw, requests };
    }
    raw[query.id] = result.json;
  }
  return { outcome: "complete", abortReason: null, retryAfterSeconds: null, raw, requests };
}
