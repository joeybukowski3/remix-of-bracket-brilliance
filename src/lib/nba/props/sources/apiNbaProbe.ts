/**
 * API-NBA coverage probe: at most 10 live requests for the whole lifetime of
 * one user approval, run locally under the shared quota manager.
 *
 * Request cap, enforced three times before every request:
 *   1. an in-run attempt counter (never above API_NBA_PROBE_MAX_REQUESTS);
 *   2. approval-funded ledger entries in the persistent store (an approval that
 *      has funded any request, including a crashed or orphaned one, is spent:
 *      a rerun needs a new approval id);
 *   3. the quota manager's own approval budget (liveApproval.maxUnits <= 10).
 * The approval id is also claimed (exclusive create) before the first request,
 * so it can fund at most one run even if ledger entries are lost.
 *
 * Every request is reserved before it is sent (guardedRequest, maxAttempts 1,
 * no retry statuses), and calls are spaced at least 7 s apart. The run aborts
 * on any denial, HTTP or network error, provider/plan error, invalid body,
 * RapidAPI marker, ledger failure, or provider-reported usage rising faster
 * than the calls made. Nothing here reads the environment: the key is passed
 * in, sent only as a request header, and never logged or written.
 */
import { guardedRequest, type FetchLike } from "../../../api-quota/guardedRequest";
import type { QuotaManager } from "../../../api-quota/manager";
import { entryUnits } from "../../../api-quota/windows";
import { estimates, inspectApiSportsBody, parseApiSportsStatusBody } from "../../../api-quota/providers";
import type { Consumer, LiveApproval } from "../../../api-quota/types";
import { API_NBA_BASE_URL, easternDate, parseEnvelope, validators, type ApiNbaGame } from "./apiNba";
import { analyzeProbe, type ProbeAnalysis } from "./apiNbaProbeAnalysis";
import { sha256 } from "./ingest";

export const API_NBA_PROBE_ACCOUNT_ID = "api-sports:nba";
export const API_NBA_PROBE_MAX_REQUESTS = 10;
export const API_NBA_PROBE_MIN_INTERVAL_MS = 7_000;
export const API_NBA_PROBE_MAX_BODY_BYTES = 25 * 1024 * 1024;
export const API_NBA_PROBE_APPROVAL_SCOPE = "API-NBA 10-request evaluation probe";
export const API_NBA_PROBE_WORKFLOW = "api-nba-coverage-probe";
/** Approvals must expire; a longer window than this is refused. */
export const API_NBA_PROBE_MAX_APPROVAL_DAYS = 14;
/** Probe game: first finished regular-season game on or after this Eastern date. */
export const API_NBA_PROBE_GAME_ON_OR_AFTER = "2024-01-15";

export type ProbeStepKind = "status" | "seasons" | "games" | "playerStats" | "teamStats";

export interface ProbeContext {
  /** Raw bodies by step id, from this run only. */
  bodies: ReadonlyMap<string, string>;
}

export interface ProbeStep {
  id: string;
  kind: ProbeStepKind;
  path: string;
  /** Null = cannot be planned from earlier responses; the run aborts. */
  params: (ctx: ProbeContext) => Record<string, string> | null;
}

/** First finished regular-season (stage 2) game on/after the target date, else the first finished one. */
export function chooseProbeGame(gamesBody: string | undefined): ApiNbaGame | null {
  if (!gamesBody) return null;
  const parsed = parseEnvelope(gamesBody);
  if ("error" in parsed || validators.games(parsed.envelope.response)) return null;
  const finished = (parsed.envelope.response as ApiNbaGame[])
    .filter((g) => g.stage === 2 && g.scores?.home?.points != null && g.scores?.visitors?.points != null)
    .sort((a, b) => Date.parse(a.date.start) - Date.parse(b.date.start) || a.id - b.id);
  return finished.find((g) => easternDate(g.date.start) >= API_NBA_PROBE_GAME_ON_OR_AFTER) ?? finished[0] ?? null;
}

const fixed = (params: Record<string, string>) => () => params;
/** Params derived from the probe game chosen from the 2023-24 games response. */
const fromProbeGame = (build: (game: ApiNbaGame) => Record<string, string>) => (ctx: ProbeContext) => {
  const game = chooseProbeGame(ctx.bodies.get("games-2023"));
  return game ? build(game) : null;
};

/**
 * Season games for the free-plan-likely seasons first, then the per-game and
 * per-team pulls, then the seasons most likely to be plan-restricted, so a
 * plan-restriction abort cannot cost the box-score checks.
 */
export const API_NBA_PROBE_STEPS: readonly ProbeStep[] = Object.freeze([
  { id: "status-initial", kind: "status", path: "/status", params: fixed({}) },
  { id: "seasons", kind: "seasons", path: "/seasons", params: fixed({}) },
  { id: "games-2023", kind: "games", path: "/games", params: fixed({ league: "standard", season: "2023" }) },
  { id: "games-2024", kind: "games", path: "/games", params: fixed({ league: "standard", season: "2024" }) },
  { id: "player-stats-game", kind: "playerStats", path: "/players/statistics", params: fromProbeGame((g) => ({ game: String(g.id) })) },
  { id: "team-stats-game", kind: "teamStats", path: "/games/statistics", params: fromProbeGame((g) => ({ id: String(g.id) })) },
  {
    id: "player-stats-team-season",
    kind: "playerStats",
    path: "/players/statistics",
    params: fromProbeGame((g) => ({ team: String(g.teams.home.id), season: "2023" })),
  },
  { id: "games-2025", kind: "games", path: "/games", params: fixed({ league: "standard", season: "2025" }) },
  { id: "games-2026", kind: "games", path: "/games", params: fixed({ league: "standard", season: "2026" }) },
  { id: "status-final", kind: "status", path: "/status", params: fixed({}) },
]);

export type AbortCode =
  | "refused"
  | "request-cap"
  | "quota-denied"
  | "unplannable-step"
  | "network-error"
  | "http-error"
  | "rate-limited"
  | "plan-restriction"
  | "provider-error"
  | "invalid-response"
  | "body-too-large"
  | "rapidapi-detected"
  | "unexpected-host"
  | "subscription-inactive"
  | "unexpected-quota-usage"
  | "insufficient-headroom"
  | "ledger-settle-failed"
  | "artifact-write-failed";

export interface ProbeAbort {
  code: AbortCode;
  stepId: string | null;
  message: string;
}

export interface ProbeStepRecord {
  stepId: string;
  path: string;
  params: Record<string, string>;
  startedAtUtc: string;
  httpStatus: number | null;
  outcome: string;
  detail: string | null;
  unitsCharged: number;
  bodyByteSize: number | null;
  bodySha256: string | null;
  rateLimitHeaders: Record<string, string>;
  rapidApiMarkers: string[];
  corsRapidApiMentions: string[];
  providerDailyUsed: number | null;
}

export interface ProbeResult {
  status: "completed" | "aborted" | "refused";
  runId: string;
  requestsAttempted: number;
  steps: ProbeStepRecord[];
  abort: ProbeAbort | null;
  analysis: ProbeAnalysis | null;
}

/** Writes one artifact; must refuse to overwrite. Paths are relative to the run directory. */
export type ProbeWriter = (relativeName: string, text: string) => Promise<void>;

export interface ProbeDeps {
  manager: QuotaManager;
  apiKey: string;
  fetchImpl: FetchLike;
  writer: ProbeWriter;
  log: (line: string) => void;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  runId: string;
  /**
   * Marks the approval id as used; must fail if it was already claimed. Called
   * once, after all no-network checks and before the first request.
   */
  claimApproval: (approvalId: string) => Promise<void>;
  /** Tests only; the CLI always uses API_NBA_PROBE_STEPS. */
  steps?: readonly ProbeStep[];
}

const DAY_MS = 86_400_000;

/** Checks that need no network. Returns a reason to refuse, or null. */
export function approvalProblem(approval: LiveApproval | null, nowMs: number, planLength: number): string | null {
  if (!approval) return `${API_NBA_PROBE_ACCOUNT_ID} has no liveApproval; create a local approval file (scripts/nba-api-nba-probe-approval.ts)`;
  if (approval.scope !== API_NBA_PROBE_APPROVAL_SCOPE) return `approval ${approval.id} scope is not "${API_NBA_PROBE_APPROVAL_SCOPE}"`;
  if (!Number.isInteger(approval.maxUnits) || approval.maxUnits > API_NBA_PROBE_MAX_REQUESTS) return `approval maxUnits must be an integer <= ${API_NBA_PROBE_MAX_REQUESTS}`;
  if (approval.maxUnits < planLength) return `approval maxUnits ${approval.maxUnits} is below the ${planLength}-request plan`;
  if (approval.expiresAt === null) return "approval must have an expiry";
  const expiresMs = Date.parse(approval.expiresAt);
  if (!(expiresMs > nowMs)) return `approval ${approval.id} has expired`;
  if (expiresMs - nowMs > API_NBA_PROBE_MAX_APPROVAL_DAYS * DAY_MS) return `approval expiry is more than ${API_NBA_PROBE_MAX_APPROVAL_DAYS} days away`;
  return null;
}

export function keyProblem(apiKey: string | undefined): string | null {
  if (!apiKey) return "API_SPORTS_KEY is not set";
  if (/\s/.test(apiKey) || apiKey.length < 16) return "API_SPORTS_KEY is malformed (whitespace or too short)";
  return null;
}

const RATE_HEADER = /^x-ratelimit-/i;
/** RapidAPI and its former Mashape gateway. */
const RAPIDAPI = /rapidapi|mashape/i;
const RAPIDAPI_TOKEN = /[a-z0-9._-]*(?:rapidapi|mashape)[a-z0-9._-]*/gi;
/**
 * CORS lists of request/response header names a server accepts or exposes. API-Sports' direct host
 * lists `x-rapidapi-key` and `x-rapidapi-host` there because it accepts both credential styles, so a
 * mention in these values says nothing about routing. Any other header (server, via, gateway, ...) still counts.
 */
const CORS_HEADER_LISTS: ReadonlySet<string> = new Set(["access-control-allow-headers", "access-control-expose-headers"]);
const API_NBA_HOST = new URL(API_NBA_BASE_URL).host;
const PLAN_TEXT = /plan|subscription|season|access|upgrade/i;

interface CapturedHeaders {
  rate: Record<string, string>;
  /** Abort-worthy: "<header>" for a name match, "<header>=<tokens>" for a value match, "response-host=<host>" for a redirect. Matched tokens only, never full values. */
  rapidApiMarkers: string[];
  /** Diagnostics only: RapidAPI tokens seen in CORS header lists, which do not abort. */
  corsRapidApiMentions: string[];
}

const matchedTokens = (header: string, value: string) => `${header}=${[...new Set(value.match(RAPIDAPI_TOKEN) ?? [])].join(",").slice(0, 80)}`;

function pickRateHeaders(headers: Headers): CapturedHeaders {
  const rate: Record<string, string> = {};
  const rapidApiMarkers: string[] = [];
  const corsRapidApiMentions: string[] = [];
  headers.forEach((value, name) => {
    const header = name.toLowerCase();
    if (RATE_HEADER.test(header)) rate[header] = value.slice(0, 40);
    if (RAPIDAPI.test(header)) rapidApiMarkers.push(header);
    else if (RAPIDAPI.test(value)) (CORS_HEADER_LISTS.has(header) ? corsRapidApiMentions : rapidApiMarkers).push(matchedTokens(header, value));
  });
  return { rate, rapidApiMarkers, corsRapidApiMentions };
}

function dailyUsedFromHeaders(rate: Record<string, string>): number | null {
  const limit = Number(rate["x-ratelimit-requests-limit"]);
  const remaining = Number(rate["x-ratelimit-requests-remaining"]);
  return rate["x-ratelimit-requests-limit"] !== undefined && rate["x-ratelimit-requests-remaining"] !== undefined && Number.isFinite(limit) && Number.isFinite(remaining)
    ? limit - remaining
    : null;
}

/** /status bodies carry account name and email: keep only subscription and request counters. */
function sanitizeStatusBody(bodyText: string): { text: string; sanitized: string[] } {
  try {
    const parsed = JSON.parse(bodyText) as { response?: Record<string, unknown> };
    if (parsed.response && typeof parsed.response === "object" && "account" in parsed.response) {
      const { account: _account, ...rest } = parsed.response;
      return { text: JSON.stringify({ ...parsed, response: rest }), sanitized: ["response.account"] };
    }
  } catch {
    // Not JSON: validated (and rejected) by the caller.
  }
  return { text: bodyText, sanitized: [] };
}

class ProbeAbortError extends Error {
  constructor(readonly abort: ProbeAbort) {
    super(abort.message);
  }
}

function stop(code: AbortCode, stepId: string | null, message: string): never {
  throw new ProbeAbortError({ code, stepId, message });
}

const VALIDATOR_BY_KIND: Record<ProbeStepKind, ((items: unknown[]) => string | null) | null> = {
  status: null,
  seasons: validators.seasons,
  games: validators.games,
  playerStats: validators.playerStats,
  teamStats: validators.teamStats,
};

export async function runApiNbaProbe(deps: ProbeDeps): Promise<ProbeResult> {
  const steps = deps.steps ?? API_NBA_PROBE_STEPS;
  const secret = deps.apiKey;
  const redact = (text: string) => (secret ? text.split(secret).join("[redacted]") : text);
  const log = (line: string) => deps.log(redact(line));
  const write = async (name: string, text: string) => {
    if (secret && text.includes(secret)) stop("artifact-write-failed", null, `refused to write ${name}: content contains the API key`);
    await deps.writer(name, text);
  };

  const result: ProbeResult = { status: "refused", runId: deps.runId, requestsAttempted: 0, steps: [], abort: null, analysis: null };
  const bodies = new Map<string, string>();
  const account = deps.manager.account(API_NBA_PROBE_ACCOUNT_ID);
  const approval = account.liveApproval;
  const refusal =
    keyProblem(deps.apiKey) ??
    approvalProblem(approval, deps.now().getTime(), steps.length) ??
    (steps.length > API_NBA_PROBE_MAX_REQUESTS ? `plan has ${steps.length} steps; the cap is ${API_NBA_PROBE_MAX_REQUESTS}` : null);
  if (refusal) {
    result.abort = { code: "refused", stepId: null, message: refusal };
    log(`REFUSED: ${refusal}`);
    return result;
  }
  const approvalId = approval!.id;
  const budget = Math.min(API_NBA_PROBE_MAX_REQUESTS, approval!.maxUnits);
  const approvalEntries = async () => (await deps.manager.state(API_NBA_PROBE_ACCOUNT_ID)).entries.filter((e) => e.approvalId === approvalId && entryUnits(e) > 0);
  if ((await approvalEntries()).length > 0) {
    result.abort = { code: "refused", stepId: null, message: `approval ${approvalId} has already funded requests; a rerun needs a new approval` };
    log(`REFUSED: ${result.abort.message}`);
    return result;
  }

  try {
    await deps.claimApproval(approvalId);
  } catch (error) {
    result.abort = { code: "refused", stepId: null, message: `approval ${approvalId} could not be claimed (already used?): ${(error as { code?: string }).code ?? (error instanceof Error ? error.name : "error")}` };
    log(`REFUSED: ${result.abort.message}`);
    return result;
  }

  const consumer = (path: string): Consumer => ({ priority: "nonessential", attribution: { sport: "nba", workflow: API_NBA_PROBE_WORKFLOW, endpoint: path, runId: deps.runId } });
  let baselineUsed: number | null = null;
  let lastCompletedMs: number | null = null;
  result.status = "completed";

  try {
    for (const [index, step] of steps.entries()) {
      // Cap layers 1 and 2: in-run counter and the persistent approval ledger.
      if (result.requestsAttempted >= budget) stop("request-cap", step.id, `in-run cap of ${budget} requests reached`);
      if ((await approvalEntries()).length >= budget) stop("request-cap", step.id, `approval ${approvalId} ledger already holds ${budget} requests`);

      const params = step.params({ bodies });
      if (!params) stop("unplannable-step", step.id, `${step.id} could not be planned from earlier responses`);

      if (lastCompletedMs !== null) {
        const wait = API_NBA_PROBE_MIN_INTERVAL_MS - (deps.now().getTime() - lastCompletedMs);
        if (wait > 0) await deps.sleep(wait);
      }

      const query = new URLSearchParams(params).toString();
      const url = `${API_NBA_BASE_URL}${step.path}${query ? `?${query}` : ""}`;
      // Checked before reserving, so a malformed plan can neither reach another host nor spend a unit.
      const target = new URL(url);
      if (target.protocol !== "https:" || target.host !== API_NBA_HOST || target.username || target.password) {
        stop("unexpected-host", step.id, `${step.id} would request ${target.protocol}//${target.host.slice(0, 80)}, not https://${API_NBA_HOST}`);
      }
      let captured: CapturedHeaders = { rate: {}, rapidApiMarkers: [], corsRapidApiMentions: [] };
      const fetchImpl: FetchLike = async (u, init) => {
        const response = await deps.fetchImpl(u, init);
        captured = pickRateHeaders(response.headers);
        // A redirect off the direct API-Sports host is treated like a RapidAPI marker.
        const finalHost = response.url ? new URL(response.url).host : null;
        if (finalHost && finalHost !== API_NBA_HOST) captured.rapidApiMarkers.push(`response-host=${finalHost.slice(0, 80)}`);
        return response;
      };
      const startedAtUtc = deps.now().toISOString();
      const guarded = await guardedRequest({
        manager: deps.manager,
        accountId: API_NBA_PROBE_ACCOUNT_ID,
        consumer: consumer(step.path),
        estimate: estimates.apiSports(step.path),
        url,
        init: { method: "GET", headers: { "x-apisports-key": deps.apiKey, accept: "application/json" } },
        fetchImpl,
        inspectBody: inspectApiSportsBody,
        maxAttempts: 1,
        retryStatuses: [],
        now: deps.now,
      });
      result.requestsAttempted += guarded.attempts;
      lastCompletedMs = deps.now().getTime();

      const record: ProbeStepRecord = {
        stepId: step.id,
        path: step.path,
        params,
        startedAtUtc,
        httpStatus: guarded.kind === "response" ? guarded.httpStatus : null,
        outcome: guarded.kind === "response" ? guarded.outcome : guarded.kind,
        detail: guarded.kind === "response" ? guarded.detail : guarded.kind === "denied" ? `${guarded.denial.code}: ${guarded.denial.message}` : guarded.message,
        unitsCharged: guarded.unitsCharged,
        bodyByteSize: null,
        bodySha256: null,
        rateLimitHeaders: captured.rate,
        rapidApiMarkers: captured.rapidApiMarkers,
        corsRapidApiMentions: captured.corsRapidApiMentions,
        providerDailyUsed: dailyUsedFromHeaders(captured.rate),
      };
      result.steps.push(record);
      log(`[${index + 1}/${steps.length}] ${step.id} ${step.path} -> ${record.httpStatus ?? record.outcome} (${record.outcome}; charged ${record.unitsCharged})`);

      if (guarded.kind === "denied") stop("quota-denied", step.id, `quota manager denied: ${record.detail}`);
      if (guarded.kind === "network-error") stop("network-error", step.id, `network error: ${guarded.message}`);
      const byteSize = Buffer.byteLength(guarded.bodyText, "utf8");
      if (byteSize > API_NBA_PROBE_MAX_BODY_BYTES) stop("body-too-large", step.id, `body is ${byteSize} bytes`);
      const { text: stored, sanitized } = step.kind === "status" ? sanitizeStatusBody(guarded.bodyText) : { text: guarded.bodyText, sanitized: [] as string[] };
      record.bodyByteSize = Buffer.byteLength(stored, "utf8");
      record.bodySha256 = sha256(stored);
      const stem = `${String(index + 1).padStart(2, "0")}-${step.id}`;
      try {
        await write(`${stem}.body.json`, stored);
        await write(
          `${stem}.meta.json`,
          `${JSON.stringify({ schemaVersion: "nba-api-nba-probe-meta-v1", sourceId: "api-sports-nba", runId: deps.runId, approvalId, requestKey: `${step.path}?${query}`, ...record, bodyFile: `${stem}.body.json`, sanitized }, null, 2)}\n`,
        );
      } catch (error) {
        if (error instanceof ProbeAbortError) throw error;
        stop("artifact-write-failed", step.id, `could not save ${stem}: ${error instanceof Error ? error.name : "error"}`);
      }
      bodies.set(step.id, stored);

      // Checked after the (sanitized, gitignored) body is saved so an abort keeps its evidence; still before any further request.
      // A /status subscription or plan naming RapidAPI means the account itself is routed or billed there.
      if (step.kind === "status" && RAPIDAPI.test(stored)) record.rapidApiMarkers.push(matchedTokens("status-body", stored));
      if (record.rapidApiMarkers.length > 0) {
        stop("rapidapi-detected", step.id, `response carries a RapidAPI marker (${record.rapidApiMarkers.join("; ")}); this probe is direct API-Sports only`);
      }
      if (guarded.settleFailed) stop("ledger-settle-failed", step.id, "the ledger could not settle this request; it stays charged at its estimate");
      if (guarded.httpStatus === 429) stop("rate-limited", step.id, "HTTP 429");
      if (guarded.httpStatus < 200 || guarded.httpStatus >= 300) stop("http-error", step.id, `HTTP ${guarded.httpStatus}`);
      if (guarded.outcome === "provider-error") {
        stop(PLAN_TEXT.test(guarded.detail ?? "") ? "plan-restriction" : "provider-error", step.id, `provider error: ${guarded.detail}`);
      }

      if (step.kind === "status") {
        const status = parseApiSportsStatusBody(guarded.bodyText, deps.now().toISOString());
        if (!status.snapshot || status.snapshot.used === null) stop("invalid-response", step.id, "status body has no requests.current");
        if (status.active === false) stop("subscription-inactive", step.id, "subscription is not active");
        await deps.manager.recordProviderUsage(API_NBA_PROBE_ACCOUNT_ID, [status.snapshot]);
        record.providerDailyUsed = status.snapshot.used;
        if (baselineUsed === null) {
          baselineUsed = status.snapshot.used;
          const remaining = steps.slice(index + 1).map((s) => estimates.apiSports(s.path));
          const preflight = await deps.manager.preflight(API_NBA_PROBE_ACCOUNT_ID, consumer("/games"), remaining);
          if (!preflight.decision.allowed) stop("insufficient-headroom", step.id, `remaining plan would be denied: ${preflight.decision.code}: ${preflight.decision.message}`);
        }
      } else {
        const parsed = parseEnvelope(guarded.bodyText);
        if ("error" in parsed) stop("invalid-response", step.id, parsed.error);
        const invalid = VALIDATOR_BY_KIND[step.kind]?.(parsed.envelope.response) ?? null;
        if (invalid) stop("invalid-response", step.id, `unexpected ${step.kind} shape: ${invalid}`);
      }

      // Every request made in this run may have counted, including the baseline /status itself.
      if (baselineUsed !== null && record.providerDailyUsed !== null && record.providerDailyUsed > baselineUsed + result.requestsAttempted) {
        stop("unexpected-quota-usage", step.id, `provider reports ${record.providerDailyUsed} used; baseline ${baselineUsed} + ${result.requestsAttempted} request(s) made`);
      }
    }
  } catch (error) {
    if (!(error instanceof ProbeAbortError)) throw error;
    result.status = "aborted";
    result.abort = { ...error.abort, message: redact(error.abort.message) };
    log(`ABORTED at ${error.abort.stepId ?? "start"}: ${error.abort.code}: ${redact(error.abort.message)}`);
  } finally {
    result.analysis = analyzeProbe(bodies, result.steps);
    try {
      await write("run.json", `${JSON.stringify({ schemaVersion: "nba-api-nba-probe-run-v1", ...result }, null, 2)}\n`);
    } catch {
      log("WARNING: could not write run.json; the quota ledger still holds every charged request");
    }
  }
  return result;
}
