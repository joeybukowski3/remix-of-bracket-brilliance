import { describe, expect, it } from "vitest";
import { buildRookieFallback } from "@/lib/fantasy/rosResearch/rookieFallback";

const noHistoryUniverse = [
  { playerId: "gsis:rookie-1", playerName: "Rookie With PAR", position: "WR" as const },
  { playerId: "gsis:rookie-2", playerName: "Rookie Without PAR", position: "RB" as const },
];

describe("buildRookieFallback", () => {
  it("applies the PAR-consensus fallback only for the given no-history universe, labeled distinctly from a historical baseline", () => {
    const result = buildRookieFallback(noHistoryUniverse, [
      { playerId: "gsis:rookie-1", playerName: "Rookie With PAR", position: "WR", parConsensusProjectedPpg: 12.5 },
    ]);
    const resolved = result.players.find((p) => p.playerId === "gsis:rookie-1")!;
    expect(resolved.hasHistoricalBaseline).toBe(false);
    expect(resolved.fallback).toEqual({ applied: true, source: "par-consensus-2026-projected-ppg", ppg: 12.5, reason: null });
  });

  it("never fabricates a number when no PAR row resolves for a no-history player", () => {
    const result = buildRookieFallback(noHistoryUniverse, []);
    const unresolved = result.players.find((p) => p.playerId === "gsis:rookie-2")!;
    expect(unresolved.fallback.applied).toBe(false);
    expect(unresolved.fallback.ppg).toBeNull();
    expect(unresolved.fallback.reason).toMatch(/no live PAR consensus row/);
  });

  it("reports accurate resolved/unresolved counts", () => {
    const result = buildRookieFallback(noHistoryUniverse, [
      { playerId: "gsis:rookie-1", playerName: "Rookie With PAR", position: "WR", parConsensusProjectedPpg: 12.5 },
    ]);
    expect(result.counts).toEqual({ playersWithNoHistory: 2, resolvedByFallback: 1, unresolvedNoFallbackAvailable: 1 });
  });

  it("treats a null projectedPpg on a matched PAR row the same as no match (never fabricates zero)", () => {
    const result = buildRookieFallback(noHistoryUniverse, [
      { playerId: "gsis:rookie-1", playerName: "Rookie With PAR", position: "WR", parConsensusProjectedPpg: null },
    ]);
    const row = result.players.find((p) => p.playerId === "gsis:rookie-1")!;
    expect(row.fallback.applied).toBe(false);
  });
});
