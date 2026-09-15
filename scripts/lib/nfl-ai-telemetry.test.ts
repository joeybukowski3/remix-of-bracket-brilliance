import { describe, expect, test } from "vitest";
import {
  TELEMETRY_MARKER_PREFIX,
  TELEMETRY_SCHEMA_VERSION,
  aggregateTelemetryByProvider,
  emitTelemetryMarker,
  parseTelemetryMarkers,
  type TelemetryMarkerRecord,
} from "./nfl-ai-telemetry";
import type { GrokAnalysisTelemetry } from "./nfl-grok-analysis-adapter";
import type { ChatGptAnalysisTelemetry } from "./nfl-chatgpt-analysis-adapter";

function grokTelemetry(overrides: Partial<GrokAnalysisTelemetry> = {}): GrokAnalysisTelemetry {
  return {
    mode: "stageAInitial",
    model: "grok-4",
    reasoningEffort: "high",
    httpStatus: 200,
    latencyMs: 1234,
    toolsEnabled: false,
    usage: { inputTokens: 100, outputTokens: 200, reasoningTokens: 50, cachedTokens: 0, totalTokens: 300 },
    costInUsdTicks: 1500,
    costUsd: 0.15,
    ...overrides,
  };
}

function chatgptTelemetry(overrides: Partial<Pick<ChatGptAnalysisTelemetry, "usage">> = {}): ChatGptAnalysisTelemetry {
  return {
    mode: "stageAInitial",
    model: "gpt-5",
    reasoningEffort: "high",
    httpStatus: 200,
    latencyMs: 4321,
    toolsEnabled: false,
    responseId: "resp_123",
    responseStatus: "completed",
    incompleteReason: null,
    configuredMaxOutputTokens: 4096,
    retryMaxOutputTokens: null,
    wasTruncationRetry: false,
    firstAttempt: null,
    usage: { inputTokens: 90, outputTokens: 180, reasoningTokens: 40, cachedTokens: 0, totalTokens: 270 },
    costUsd: null,
    ...overrides,
  };
}

describe("emitTelemetryMarker / parseTelemetryMarkers", () => {
  test("round-trips a single marker line through stdout capture", () => {
    let captured = "";
    const originalLog = console.log;
    console.log = (msg: string) => { captured += `${msg}\n`; };
    try {
      emitTelemetryMarker({ provider: "grok", gameId: "2026_02_DET_BUF", cliMode: "initial", stage: "A", telemetry: grokTelemetry() });
    } finally {
      console.log = originalLog;
    }

    expect(captured.trim().startsWith(TELEMETRY_MARKER_PREFIX)).toBe(true);
    const parsed = parseTelemetryMarkers(captured);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      schemaVersion: TELEMETRY_SCHEMA_VERSION,
      provider: "grok",
      gameId: "2026_02_DET_BUF",
      cliMode: "initial",
      stage: "A",
    });
  });

  test("extracts only marker lines from stdout interleaved with other output", () => {
    const record: TelemetryMarkerRecord = {
      schemaVersion: TELEMETRY_SCHEMA_VERSION,
      provider: "chatgpt",
      gameId: "2026_02_DET_BUF",
      cliMode: "repricing",
      stage: "B",
      telemetry: chatgptTelemetry(),
    };
    const stdout = [
      "=== STAGE B: MARKET DECISION ===",
      JSON.stringify({ pretty: "printed", not: "a marker" }, null, 2),
      `${TELEMETRY_MARKER_PREFIX}${JSON.stringify(record)}`,
      "some trailing log line",
    ].join("\n");

    const parsed = parseTelemetryMarkers(stdout);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].cliMode).toBe("repricing");
    expect(parsed[0].stage).toBe("B");
  });

  test("returns an empty array for stdout with no marker lines", () => {
    expect(parseTelemetryMarkers("nothing interesting here\nno markers at all\n")).toEqual([]);
  });

  test("returns an empty array for empty stdout", () => {
    expect(parseTelemetryMarkers("")).toEqual([]);
  });

  test("never throws and skips a line with malformed JSON after the marker prefix", () => {
    const stdout = `${TELEMETRY_MARKER_PREFIX}{not valid json`;
    expect(() => parseTelemetryMarkers(stdout)).not.toThrow();
    expect(parseTelemetryMarkers(stdout)).toEqual([]);
  });

  test("never throws and skips a marker line with a mismatched schemaVersion", () => {
    const stdout = `${TELEMETRY_MARKER_PREFIX}${JSON.stringify({ schemaVersion: "some-future-version", provider: "grok", gameId: "x", telemetry: {} })}`;
    expect(parseTelemetryMarkers(stdout)).toEqual([]);
  });

  test("never throws and skips a marker line missing required fields", () => {
    const stdout = `${TELEMETRY_MARKER_PREFIX}${JSON.stringify({ schemaVersion: TELEMETRY_SCHEMA_VERSION })}`;
    expect(parseTelemetryMarkers(stdout)).toEqual([]);
  });
});

describe("aggregateTelemetryByProvider", () => {
  function record(provider: "grok" | "chatgpt", telemetry: GrokAnalysisTelemetry | ChatGptAnalysisTelemetry, cliMode: TelemetryMarkerRecord["cliMode"] = "initial", stage: TelemetryMarkerRecord["stage"] = "A"): TelemetryMarkerRecord {
    return { schemaVersion: TELEMETRY_SCHEMA_VERSION, provider, gameId: "2026_02_DET_BUF", cliMode, stage, telemetry };
  }

  test("returns an empty array for no records", () => {
    expect(aggregateTelemetryByProvider([])).toEqual([]);
  });

  test("sums tokens and cost across multiple records for the same provider", () => {
    const records = [
      record("grok", grokTelemetry({ usage: { inputTokens: 100, outputTokens: 100, reasoningTokens: 0, cachedTokens: 0, totalTokens: 200 }, costUsd: 0.1 }), "initial", "A"),
      record("grok", grokTelemetry({ usage: { inputTokens: 50, outputTokens: 50, reasoningTokens: 0, cachedTokens: 0, totalTokens: 100 }, costUsd: 0.05 }), "initial", "B"),
    ];
    const aggregated = aggregateTelemetryByProvider(records);
    expect(aggregated).toHaveLength(1);
    expect(aggregated[0]).toEqual({ provider: "grok", callsWithTelemetry: 2, totalTokens: 300, totalCostUsd: 0.15000000000000002 });
  });

  test("keeps separate providers separate", () => {
    const records = [
      record("grok", grokTelemetry(), "initial", "A"),
      record("chatgpt", chatgptTelemetry(), "initial", "A"),
    ];
    const aggregated = aggregateTelemetryByProvider(records);
    expect(aggregated.map((a) => a.provider).sort()).toEqual(["chatgpt", "grok"]);
  });

  test("reports totalCostUsd as null (never a fabricated 0) when a provider never reports cost", () => {
    const records = [record("chatgpt", chatgptTelemetry(), "initial", "A")];
    const aggregated = aggregateTelemetryByProvider(records);
    expect(aggregated[0].totalCostUsd).toBeNull();
    expect(aggregated[0].totalTokens).toBe(270);
  });

  test("reports totalTokens as null when totalTokens is null on every record", () => {
    const records = [record("grok", grokTelemetry({ usage: { inputTokens: null, outputTokens: null, reasoningTokens: null, cachedTokens: null, totalTokens: null } }), "initial", "A")];
    const aggregated = aggregateTelemetryByProvider(records);
    expect(aggregated[0].totalTokens).toBeNull();
  });
});
