/**
 * WU6.9 -- orchestrator telemetry aggregation/printing coverage. Only
 * printLiveSummary's telemetry section is under test here; the rest of the
 * summary's attempts/successes/failures counters already have their own
 * hand-rolled StageOutcome fixtures elsewhere (nfl-ai-slate-executor.test.ts
 * exercises the underlying stage execution). No real child process is ever
 * spawned -- GameExecutionResult fixtures are constructed directly.
 */
import { describe, expect, it } from "vitest";
import { printLiveSummary } from "./run-nfl-ai-handicap-slate";
import { TELEMETRY_MARKER_PREFIX, TELEMETRY_SCHEMA_VERSION, type TelemetryMarkerRecord } from "./lib/nfl-ai-telemetry";
import type { GameExecutionResult, StageOutcome } from "./lib/nfl-ai-slate-executor";

function stage(overrides: Partial<StageOutcome> & Pick<StageOutcome, "stage">): StageOutcome {
  return { action: "none", ran: false, ok: true, detail: "", ...overrides };
}

function telemetryRecord(overrides: Partial<TelemetryMarkerRecord> = {}): TelemetryMarkerRecord {
  return {
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    provider: "grok",
    gameId: "2026_02_DET_BUF",
    cliMode: "initial",
    stage: "A",
    telemetry: { usage: { inputTokens: 100, outputTokens: 100, reasoningTokens: 0, cachedTokens: 0, totalTokens: 200 }, costUsd: 0.2 } as TelemetryMarkerRecord["telemetry"],
    ...overrides,
  };
}

function gameResult(overrides: Partial<GameExecutionResult> = {}): GameExecutionResult {
  return {
    gameId: "2026_02_DET_BUF",
    ok: true,
    context: stage({ stage: "context", action: "reuse", ok: true }),
    providers: [],
    presentation: stage({ stage: "presentation", action: "skip", ok: true }),
    failures: [],
    ...overrides,
  };
}

function captureConsoleLog(fn: () => void): string {
  let captured = "";
  const original = console.log;
  console.log = (msg: unknown) => { captured += `${String(msg)}\n`; };
  try {
    fn();
  } finally {
    console.log = original;
  }
  return captured;
}

describe("printLiveSummary -- WU6.9 telemetry aggregation", () => {
  it("prints zero telemetry captured when no handicap stage carries any", () => {
    const results = [gameResult({ providers: [{ provider: "grok", research: stage({ stage: "research" }), handicap: stage({ stage: "handicap", action: "none" }) }] })];
    const output = captureConsoleLog(() => printLiveSummary(results));
    expect(output).toMatch(/Telemetry \(0 marker\(s\) captured, 0 from repricing passes\)/);
    expect(output).toMatch(/\(no telemetry captured\)/);
  });

  it("aggregates telemetry across multiple games/providers and prints per-provider totals", () => {
    const results = [
      gameResult({
        providers: [
          { provider: "grok", research: stage({ stage: "research" }), handicap: stage({ stage: "handicap", action: "initial", ran: true, ok: true, telemetry: [telemetryRecord({ stage: "A" }), telemetryRecord({ stage: "B" })] }) },
        ],
      }),
      gameResult({
        gameId: "2026_02_OTHER",
        providers: [
          { provider: "chatgpt", research: stage({ stage: "research" }), handicap: stage({ stage: "handicap", action: "initial", ran: true, ok: true, telemetry: [telemetryRecord({ provider: "chatgpt", stage: "A", telemetry: { usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0, cachedTokens: 0, totalTokens: 2 }, costUsd: null } as TelemetryMarkerRecord["telemetry"] })] }) },
        ],
      }),
    ];
    const output = captureConsoleLog(() => printLiveSummary(results));
    expect(output).toMatch(/Telemetry \(3 marker\(s\) captured, 0 from repricing passes\)/);
    expect(output).toMatch(/grok: 2 call\(s\) with telemetry, 400 total tokens, \$0\.4000 total cost/);
    expect(output).toMatch(/chatgpt: 1 call\(s\) with telemetry, 2 total tokens, unavailable total cost/);
  });

  it("reports repricing markers as Stage B only and counts them separately", () => {
    const results = [
      gameResult({
        providers: [
          { provider: "grok", research: stage({ stage: "research" }), handicap: stage({ stage: "handicap", action: "repricing", ran: true, ok: true, telemetry: [telemetryRecord({ cliMode: "repricing", stage: "B" })] }) },
        ],
      }),
    ];
    const output = captureConsoleLog(() => printLiveSummary(results));
    expect(output).toMatch(/Telemetry \(1 marker\(s\) captured, 1 from repricing passes, Stage B only: true\)/);
  });

  it("a handicap stage with no telemetry field at all never breaks the summary or counts toward totals", () => {
    const results = [
      gameResult({
        providers: [
          { provider: "grok", research: stage({ stage: "research" }), handicap: stage({ stage: "handicap", action: "initial", ran: true, ok: true }) }, // telemetry omitted entirely
        ],
      }),
    ];
    expect(() => captureConsoleLog(() => printLiveSummary(results))).not.toThrow();
    const output = captureConsoleLog(() => printLiveSummary(results));
    expect(output).toMatch(/Telemetry \(0 marker\(s\) captured, 0 from repricing passes\)/);
  });

  it("a failed handicap stage (no telemetry emitted) does not appear in telemetry totals but still counts as a failure", () => {
    const results = [
      gameResult({
        ok: false,
        providers: [
          { provider: "grok", research: stage({ stage: "research" }), handicap: stage({ stage: "handicap", action: "initial", ran: true, ok: false, detail: "boom", telemetry: [] }) },
        ],
        failures: ["grok handicap: boom"],
      }),
    ];
    const output = captureConsoleLog(() => printLiveSummary(results));
    expect(output).toMatch(/Telemetry \(0 marker\(s\) captured, 0 from repricing passes\)/);
    expect(output).toMatch(/grok handicap: boom/);
  });
});
