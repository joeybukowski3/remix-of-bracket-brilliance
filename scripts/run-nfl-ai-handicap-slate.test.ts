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

describe("printLiveSummary -- WU6.9 handicap telemetry aggregation", () => {
  it("prints zero telemetry captured when no handicap stage carries any", () => {
    const results = [gameResult({ providers: [{ provider: "grok", research: stage({ stage: "research" }), handicap: stage({ stage: "handicap", action: "none" }) }] })];
    const output = captureConsoleLog(() => printLiveSummary(results));
    expect(output).toMatch(/Handicap usage \(0 marker\(s\) captured\)/);
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
    expect(output).toMatch(/Handicap usage \(3 marker\(s\) captured\)/);
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
    expect(output).toMatch(/Handicap usage \(1 marker\(s\) captured, 1 from repricing passes, Stage B only: true\)/);
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
    expect(output).toMatch(/Handicap usage \(0 marker\(s\) captured\)/);
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
    expect(output).toMatch(/Handicap usage \(0 marker\(s\) captured\)/);
    expect(output).toMatch(/grok handicap: boom/);
  });
});

describe("printLiveSummary -- WU7.3 research telemetry aggregation (kept separate from handicap)", () => {
  function researchTelemetryRecord(overrides: Partial<TelemetryMarkerRecord> = {}): TelemetryMarkerRecord {
    return {
      schemaVersion: TELEMETRY_SCHEMA_VERSION,
      kind: "research",
      provider: "grok",
      gameId: "2026_02_CAR_ATL",
      cliMode: "research_initial",
      telemetry: { usage: { inputTokens: 1000, outputTokens: 500, reasoningTokens: 0, cachedTokens: 0, totalTokens: 1500, serverSideToolCalls: 2 }, costUsd: 0.0375 } as TelemetryMarkerRecord["telemetry"],
      ...overrides,
    };
  }

  it("prints research usage and handicap usage as two distinct sections", () => {
    const results = [
      gameResult({
        providers: [
          {
            provider: "grok",
            research: stage({ stage: "research", action: "initial", ran: true, ok: true, telemetry: [researchTelemetryRecord()] }),
            handicap: stage({ stage: "handicap", action: "none" }),
          },
        ],
      }),
    ];
    const output = captureConsoleLog(() => printLiveSummary(results));
    expect(output).toMatch(/Research usage \(1 marker\(s\) captured\)/);
    expect(output).toMatch(/grok: 1 call\(s\) with telemetry, 1500 total tokens, \$0\.0375 total cost/);
    expect(output).toMatch(/Handicap usage \(0 marker\(s\) captured\)/);
  });

  it("never mixes research and handicap totals for the same provider into one ambiguous number", () => {
    const results = [
      gameResult({
        providers: [
          {
            provider: "grok",
            research: stage({ stage: "research", action: "initial", ran: true, ok: true, telemetry: [researchTelemetryRecord({ telemetry: { usage: { inputTokens: 1000, outputTokens: 500, reasoningTokens: 0, cachedTokens: 0, totalTokens: 1500, serverSideToolCalls: 2 }, costUsd: 0.05 } as TelemetryMarkerRecord["telemetry"] })] }),
            handicap: stage({ stage: "handicap", action: "initial", ran: true, ok: true, telemetry: [telemetryRecord({ telemetry: { usage: { inputTokens: 100, outputTokens: 100, reasoningTokens: 0, cachedTokens: 0, totalTokens: 200 }, costUsd: 0.15 } as TelemetryMarkerRecord["telemetry"] })] }),
          },
        ],
      }),
    ];
    const output = captureConsoleLog(() => printLiveSummary(results));
    const researchSection = output.split("Handicap usage")[0];
    const handicapSection = output.split("Handicap usage")[1];
    expect(researchSection).toMatch(/grok: 1 call\(s\) with telemetry, 1500 total tokens, \$0\.0500 total cost/);
    expect(handicapSection).toMatch(/grok: 1 call\(s\) with telemetry, 200 total tokens, \$0\.1500 total cost/);
  });

  it("ChatGPT research telemetry (no costUsd field at all) reports unavailable cost, never throws", () => {
    const results = [
      gameResult({
        providers: [
          {
            provider: "chatgpt",
            research: stage({
              stage: "research",
              action: "initial",
              ran: true,
              ok: true,
              telemetry: [researchTelemetryRecord({ provider: "chatgpt", telemetry: { usage: { inputTokens: 100, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 50, reasoningTokens: 0, totalTokens: 150 } } as unknown as TelemetryMarkerRecord["telemetry"] })],
            }),
            handicap: stage({ stage: "handicap", action: "none" }),
          },
        ],
      }),
    ];
    expect(() => captureConsoleLog(() => printLiveSummary(results))).not.toThrow();
    const output = captureConsoleLog(() => printLiveSummary(results));
    expect(output).toMatch(/chatgpt: 1 call\(s\) with telemetry, 150 total tokens, unavailable total cost/);
  });

  it("a bootstrap research action (no telemetry field) never appears in research totals", () => {
    const results = [
      gameResult({
        providers: [{ provider: "grok", research: stage({ stage: "research", action: "bootstrap", ran: true, ok: true }), handicap: stage({ stage: "handicap", action: "none" }) }],
      }),
    ];
    const output = captureConsoleLog(() => printLiveSummary(results));
    expect(output).toMatch(/Research usage \(0 marker\(s\) captured\)/);
  });
});
