/**
 * WU6.9 -- minimal, provider-neutral machine-readable telemetry marker for
 * the handicap CLIs (run-nfl-grok-handicap.ts / run-nfl-chatgpt-handicap.ts).
 *
 * Problem this solves: Stage A/B token/cost telemetry is already computed
 * and console.log'd as pretty-printed JSON by those scripts, but WU6's
 * orchestrator (nfl-ai-slate-executor.ts) previously discarded a successful
 * child process's stdout entirely, and even after WU6.8 retained it, a
 * pretty-printed multi-line JSON blob interleaved with other log lines is
 * not reliably machine-parseable from captured stdout.
 *
 * Fix: each handicap CLI, immediately after accepting a Stage A or Stage B
 * result, prints ONE extra line -- a single-line, compact JSON object
 * prefixed with a stable marker string -- alongside its existing
 * human-readable pretty-printed console.log (which is left completely
 * unchanged, for a human reading the terminal). The executor greps stdout
 * for lines starting with the marker and JSON.parses only those.
 *
 * This is deliberately NOT a general logging/observability subsystem: no
 * log levels, no destinations, no buffering -- one marker line per accepted
 * Stage A/B result, nothing else.
 */
import type { GrokAnalysisTelemetry } from "./nfl-grok-analysis-adapter";
import type { ChatGptAnalysisTelemetry } from "./nfl-chatgpt-analysis-adapter";
import type { EvidenceModel } from "./nfl-evidence-types";

export const TELEMETRY_MARKER_PREFIX = "::NFL_AI_TELEMETRY::";
export const TELEMETRY_SCHEMA_VERSION = "nfl-ai-telemetry-v1" as const;

/** The CLI-level lifecycle action that produced this telemetry -- distinct from the underlying
 * adapter's own `telemetry.mode` (e.g. "stageBInitial"), which repricing reuses verbatim. */
export type TelemetryCliMode = "initial" | "update" | "repricing";
export type TelemetryStage = "A" | "B";

export interface TelemetryMarkerRecord {
  schemaVersion: typeof TELEMETRY_SCHEMA_VERSION;
  provider: EvidenceModel;
  gameId: string;
  cliMode: TelemetryCliMode;
  stage: TelemetryStage;
  telemetry: GrokAnalysisTelemetry | ChatGptAnalysisTelemetry;
}

/**
 * Prints exactly one marker line to stdout. Call once per accepted Stage A
 * or Stage B result -- never for a failed/null telemetry (there is nothing
 * useful to aggregate from a request that never completed).
 */
export function emitTelemetryMarker(input: { provider: EvidenceModel; gameId: string; cliMode: TelemetryCliMode; stage: TelemetryStage; telemetry: GrokAnalysisTelemetry | ChatGptAnalysisTelemetry }): void {
  const record: TelemetryMarkerRecord = { schemaVersion: TELEMETRY_SCHEMA_VERSION, ...input };
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
        records.push(parsed as TelemetryMarkerRecord);
      }
    } catch {
      // Malformed marker line -- skip it, never throw. A future format change or a truncated
      // stdout capture must not turn an otherwise-successful handicap run into a failure.
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

/**
 * Sums tokens/cost per provider across every telemetry marker found. A
 * provider whose telemetry never reports a value for a field (e.g.
 * ChatGPT's costUsd, always null -- OpenAI's Responses API does not expose
 * per-request USD cost) reports `null` for that total rather than a
 * fabricated 0, so a reader can never mistake "unavailable" for "zero cost".
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
    const costValues = providerRecords.map((r) => r.telemetry.costUsd).filter((v): v is number => v != null);
    return {
      provider,
      callsWithTelemetry: providerRecords.length,
      totalTokens: tokenValues.length > 0 ? tokenValues.reduce((a, b) => a + b, 0) : null,
      totalCostUsd: costValues.length > 0 ? costValues.reduce((a, b) => a + b, 0) : null,
    };
  });
}
