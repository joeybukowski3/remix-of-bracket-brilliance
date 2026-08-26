import { describe, expect, it } from "vitest";
import {
  buildDraftPreviewIdentity,
  canonicalPositionForSource,
} from "@/lib/fantasy/draftPreview/identity";
import { SLEEPER_DRAFT_BOARD_2026 } from "@/lib/fantasy/draftPreview/sleeperDraftBoard";
import { FANTASY_RANKINGS } from "@/lib/fantasy/rankings";

describe("canonicalPositionForSource", () => {
  it("maps JKB-tracked positions to themselves", () => {
    expect(canonicalPositionForSource("QB")).toBe("QB");
    expect(canonicalPositionForSource("RB")).toBe("RB");
    expect(canonicalPositionForSource("WR")).toBe("WR");
    expect(canonicalPositionForSource("TE")).toBe("TE");
  });

  it("maps dual-eligibility DB/WR to WR and excludes DEF/K", () => {
    expect(canonicalPositionForSource("DB/WR")).toBe("WR");
    expect(canonicalPositionForSource("DEF")).toBeNull();
    expect(canonicalPositionForSource("K")).toBeNull();
  });

  it("fails closed for an unrecognized source position", () => {
    expect(canonicalPositionForSource("XYZ")).toBeNull();
  });
});

describe("buildDraftPreviewIdentity", () => {
  it("resolves against the real 267-row source and the live JKB authority", () => {
    const result = buildDraftPreviewIdentity(SLEEPER_DRAFT_BOARD_2026, FANTASY_RANKINGS.rows);
    expect(result.totalSourceRows).toBe(267);
    expect(result.resolved.length + result.unresolved.length).toBe(267);
    // Every resolved match really is an exact normalized-key match (never fuzzy).
    for (const match of result.resolved) {
      expect(match.jkbRow.position).toBe(canonicalPositionForSource(match.sleeperRow.sourcePosition));
    }
  });

  it("reports DEF/K rows as out-of-scope, never as a JKB match", () => {
    const result = buildDraftPreviewIdentity(SLEEPER_DRAFT_BOARD_2026, FANTASY_RANKINGS.rows);
    const outOfScope = result.unresolved.filter((u) => u.reason === "out-of-scope-position");
    expect(outOfScope.length).toBeGreaterThan(0);
    expect(outOfScope.every((u) => ["DEF", "K"].includes(u.sleeperRow.sourcePosition))).toBe(true);
  });

  it("never fuzzy-matches a genuinely different player with the same name at a different position/team", () => {
    // Kyle Williams: source has an RB (Tampa Bay); JKB's Kyle Williams is a WR (New England).
    // These are two different real players -- the join must not force a cross-position match.
    const sleeperKyleWilliams = SLEEPER_DRAFT_BOARD_2026.find(
      (row) => row.player === "Kyle Williams" && row.sourcePosition === "RB",
    )!;
    const result = buildDraftPreviewIdentity([sleeperKyleWilliams], FANTASY_RANKINGS.rows);
    expect(result.resolved).toHaveLength(0);
    expect(result.unresolved).toEqual([{ sleeperRow: sleeperKyleWilliams, reason: "no-exact-match" }]);
  });

  it("applies only the reviewed name-suffix aliases (e.g. Brian Thomas Jr.), not a fuzzy guess", () => {
    const brianThomas = SLEEPER_DRAFT_BOARD_2026.find((row) => row.player === "Brian Thomas")!;
    const result = buildDraftPreviewIdentity([brianThomas], FANTASY_RANKINGS.rows);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].jkbRow.player).toBe("Brian Thomas Jr.");
  });

  it("reports duplicate source rows that both join the same JKB player, without silently resolving them", () => {
    // The supplied source lists Dylan Sampson twice (ranks 89 and 188), both RB/CLE.
    const result = buildDraftPreviewIdentity(SLEEPER_DRAFT_BOARD_2026, FANTASY_RANKINGS.rows);
    const dylanSampson = result.duplicateCanonicalMatches.find((d) => d.jkbRow.player === "Dylan Sampson");
    expect(dylanSampson).toBeTruthy();
    expect(dylanSampson!.sleeperRows.map((row) => row.sleeperRank).sort((a, b) => a - b)).toEqual([89, 188]);
  });

  it("throws rather than joining if the JKB authority itself has a duplicate key", () => {
    const duplicateJkb = [
      { overallRank: 1, player: "Test Player", position: "WR" as const },
      { overallRank: 2, player: "Test Player", position: "WR" as const },
    ];
    expect(() => buildDraftPreviewIdentity([], duplicateJkb)).toThrow(/Duplicate JKB ranking key/i);
  });
});
