/**
 * WU6.9 -- minimal, provider-neutral machine-readable telemetry marker,
 * originally for the handicap CLIs (run-nfl-grok-handicap.ts /
 * run-nfl-chatgpt-handicap.ts) only.
 *
 * WU7.3 -- extended (not replaced) to also cover the research CLIs
 * (run-nfl-grok-research.ts / run-nfl-chatgpt-research.ts), so the slate
 * executor/orchestrator can report research token usage/cost the same
 * marker-based way, without scraping arbitrary stdout. `kind` distinguishes
 * a "research" marker (no Stage A/B concept -- `stage` is omitted) from a
 * "handicap" marker (always carries `stage`). The schema version is
 * unchanged: nothing has ever persisted an old-shape marker to disk (it is a
 * live stdout-only signal, never archived), so this is a safe additive
 * extension, not a breaking one.
 *
 * Problem this solves: Stage A/B (and now research) token/cost telemetry is
 * already computed and console.log'd as pretty-printed JSON by those
 * scripts, but WU6's orchestrator (nfl-ai-slate-executor.ts) previously
 * discarded a successful child process's stdout entirely, and even after
 * WU6.8 retained it, a pretty-printed multi-line JSON blob interleaved with
 * other log lines is not reliably machine-parseable from captured stdout.
 *
 * Fix: each CLI, immediately after accepting a research pass or a Stage A/B
 * result, prints ONE extra line -- a single-line, compact JSON object
 * prefixed with a stable marker string -- alongside its existing
 * human-readable pretty-printed console.log (which is left completely
 * unchanged, for a human reading the terminal). The executor greps stdout
 * for lines starting with the marker and JSON.parses only those.
 *
 * This is deliberately NOT a general logging/observability subsystem: no
 * log levels, no destinations, no buffering -- one marker line per accepted
 * research pass or Stage A/B result, nothing else.
 */
import type { GrokAnalysisTelemetry } from "./nfl-grok-analysis-adapter";
import type { ChatGptAnalysisTelemetry } from "./nfl-chatgpt-analysis-adapter";
import type { GrokResearchTelemetry } from "./nfl-grok-research-adapter";
import type { ChatGptResearchTelemetry } from "./nfl-chatgpt-research-adapter";
import type { EvidenceModel } from "./nfl-evidence-types";

export const TELEMETRY_MARKER_PREFIX = "::NFL_AI_TELEMETRY::";
export const TELEMETRY_SCHEMA_VERSION = "nfl-ai-telemetry-v1" as const;

/** Whether this marker describes a research pass or a handicap Stage A/B result -- the two
 * populations are aggregated separately (see aggregateTelemetryByProvider's caller). */
export type TelemetryKind = "handicap" | "research";

/** The CLI-level lifecycle action that produced this telemetry -- distinct from the underlying
 * adapter's own `telemetry.mode` (e.g. "stageBInitial"), which repricing reuses verbatim. */
export type TelemetryCliMode = "initial" | "update" | "repricing" | "research_initial" | "research_update";
export type TelemetryStage = "A" | "B";

export type AnyProviderTelemetry = GrokAnalysisTelemetry | ChatGptAnalysisTelemetry | GrokResearchTelemetry | ChatGptResearchTelemetry;

export interface TelemetryMarkerRecord {
  schemaVersion: typeof TELEMETRY_SCHEMA_VERSION;
  /** Optional -- defaults to "handicap" when omitted by a caller/parse (see emitTelemetryMarker/
   * parseTelemetryMarkers), so existing WU6.9 fixtures that never set it keep type-checking. */
  kind?: TelemetryKind;
  provider: EvidenceModel;
  gameId: string;
  cliMode: TelemetryCliMode;
  /** Only ever present for kind: "handicap" -- a research marker has no Stage A/B concept. */
  stage?: TelemetryStage;
  telemetry: AnyProviderTelemetry;
}

/**
 * Prints exactly one marker line to stdout. Call once per accepted research
 * pass or Stage A/B result -- never for a failed/null telemetry (there is
 * nothing useful to aggregate from a request that never completed).
 * `kind` defaults to "handicap" so every WU6.9 call site (which never passed
 * `kind`) keeps emitting exactly what it always has, unchanged.
 */
export function emitTelemetryMarker(input: { kind?: TelemetryKind; provider: EvidenceModel; gameId: string; cliMode: TelemetryCliMode; stage?: TelemetryStage; telemetry: AnyProviderTelemetry }): void {
  const record: TelemetryMarkerRecord = {
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    kind: input.kind ?? "handicap",
    provider: input.provider,
    gameId: input.gameId,
    cliMode: input.cliMode,
    telemetry: input.telemetry,
    ...(input.stage ? { stage: input.stage } : {}),
  };
  console.log(`${TELEMETRY_MARKER_PREFIX}${JSON.stringify(record)}`);
}

/**
 * Extracts every valid telemetry marker line from a captured stdout blob.
 * Never throws: a missing marker, a line that fails to JSON.parse, or a
 * schemaVersion mismatch is silently skipped, never surfaced as an error --
 * malformed/missing telemetry must never fail an otherwise-successful
 * handicap run (see nfl-ai-slate-executor.ts's caller).
 */
export function parseTelemetryMarkers(stdout: string): TelemetryMarkerRecord[] {
  const records: TelemetryMarkerRecord[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(TELEMETRY_MARKER_PREFIX)) continue;
    try {
      const parsed = JSON.parse(trimmed.slice(TELEMETRY_MARKER_PREFIX.length)) as Partial<TelemetryMarkerRecord>;
      if (parsed && parsed.schemaVersion === TELEMETRY_SCHEMA_VERSION && parsed.provider && parsed.gameId && parsed.telemetry) {
        // `kind` defaults to "handicap" for tolerance of a marker line emitted by an older build
        // of a CLI (rolling deploys, mixed worker versions) that predates WU7.3's `kind` field.
        records.push({ ...(parsed as TelemetryMarkerRecord), kind: parsed.kind ?? "handicap" });
      }
    } catch {
      // Malformed marker line -- skip it, never throw. A future format change or a truncated
      // stdout capture must not turn an otherwise-successful research/handicap run into a failure.
    }
  }
  return records;
}

export interface AggregatedProviderCost {
  provider: EvidenceModel;
  callsWithTelemetry: number;
  totalTokens: number | null;
  totalCostUsd: number | null;
}

/** Not every telemetry shape has a costUsd field at all (ChatGptResearchTelemetry has none --
 * OpenAI's Responses API exposes no per-request research cost, unlike its analysis counterpart
 * which at least has the field, always null). Reading it structurally, rather than assuming every
 * union member has it, is what lets research and handicap telemetry share one aggregator. */
function readCostUsd(telemetry: AnyProviderTelemetry): number | null {
  return "costUsd" in telemetry ? (telemetry.costUsd ?? null) : null;
}

/**
 * Sums tokens/cost per provider across every telemetry marker found. A
 * provider whose telemetry never reports a value for a field (e.g.
 * ChatGPT's costUsd, always null or absent -- OpenAI's Responses API does
 * not expose per-request USD cost) reports `null` for that total rather
 * than a fabricated 0, so a reader can never mistake "unavailable" for
 * "zero cost". Callers that want research and handicap totals kept separate
 * (see run-nfl-ai-handicap-slate.ts) should filter by `kind` before calling
 * this -- it aggregates whatever record set it is given, without itself
 * distinguishing research from handicap.
 */
export function aggregateTelemetryByProvider(records: readonly TelemetryMarkerRecord[]): AggregatedProviderCost[] {
  const byProvider = new Map<EvidenceModel, TelemetryMarkerRecord[]>();
  for (const record of records) {
    const existing = byProvider.get(record.provider) ?? [];
    existing.push(record);
    byProvider.set(record.provider, existing);
  }

  return Array.from(byProvider.entries()).map(([provider, providerRecords]) => {
    const tokenValues = providerRecords.map((r) => r.telemetry.usage.totalTokens).filter((v): v is number => v != null);
    const costValues = providerRecords.map((r) => readCostUsd(r.telemetry)).filter((v): v is number => v != null);
    return {
      provider,
      callsWithTelemetry: providerRecords.length,
      totalTokens: tokenValues.length > 0 ? tokenValues.reduce((a, b) => a + b, 0) : null,
      totalCostUsd: costValues.length > 0 ? costValues.reduce((a, b) => a + b, 0) : null,
    };
  });
}
