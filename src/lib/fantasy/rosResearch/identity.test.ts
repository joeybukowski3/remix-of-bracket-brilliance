import { describe, expect, it } from "vitest";
import { buildRosIdentityCrosswalk } from "@/lib/fantasy/rosResearch/identity";
import type { FantasyParSourceRow } from "@/lib/fantasy/parRankings";
import type { FantasyRankingRow } from "@/lib/fantasy/rankings";
import type { ProductionIdentitySourceRow } from "@/lib/fantasy/weekly/productionIdentity";

function parRow(overrides: Partial<FantasyParSourceRow>): FantasyParSourceRow {
  return {
    Player: "Test Player",
    Team: "BUF",
    Position: "QB",
    "Projected Games": 17,
    "2026 Projected Fantasy Points": 300,
    "2026 Projected PPG": 17.6,
    "Historical Replacement PPG": 17.5667,
    "PAR/G": 0.03,
    "Projected Season PAR": 0.5,
    "Projection Status": "authoritative-derived (source-implied scoring)",
    "Source ID": "TestPl00",
    "Consensus Position Rank": 1,
    ...overrides,
  };
}

function jkbRow(overrides: Partial<FantasyRankingRow>): FantasyRankingRow {
  return { overallRank: 1, player: "Test Player", position: "QB", team: "buf", ...overrides };
}

describe("buildRosIdentityCrosswalk", () => {
  it("resolves via a direct stable PFR id when roster/player rows agree exactly", () => {
    const rosterRows: ProductionIdentitySourceRow[] = [
      { gsisId: "00-0000001", pfrId: "TestPl00", playerName: "Test Player", position: "QB", team: "BUF", status: "ACT" },
    ];
    const result = buildRosIdentityCrosswalk({
      rankingRows: [jkbRow({})],
      parRows: [parRow({})],
      playerRows: rosterRows,
      rosterRows,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].identity.resolutionMethod).toBe("stable-id");
    expect(result.rows[0].identity.playerId).toBe("gsis:00-0000001");
    expect(result.counts.resolved).toBe(1);
    expect(result.counts.unresolved).toBe(0);
    expect(result.counts.resolutionMethodCounts["stable-id"]).toBe(1);
  });

  it("falls back to exact normalized name+position when the stable id does not match", () => {
    const rosterRows: ProductionIdentitySourceRow[] = [
      { gsisId: "00-0000002", pfrId: "DifferentId1", playerName: "Test Player", position: "QB", team: "BUF", status: "ACT" },
    ];
    const result = buildRosIdentityCrosswalk({
      rankingRows: [jkbRow({})],
      parRows: [parRow({})],
      playerRows: rosterRows,
      rosterRows,
    });
    expect(result.rows[0].identity.resolutionMethod).toBe("exact-name-position");
    expect(result.rows[0].identity.playerId).toBe("gsis:00-0000002");
  });

  it("never performs fuzzy/similarity matching: a near-miss name is unresolved, not guessed", () => {
    const rosterRows: ProductionIdentitySourceRow[] = [
      { gsisId: "00-0000003", pfrId: "Unrelated1", playerName: "Testt Playerr", position: "QB", team: "BUF", status: "ACT" },
    ];
    const result = buildRosIdentityCrosswalk({
      rankingRows: [jkbRow({})],
      parRows: [parRow({})],
      playerRows: rosterRows,
      rosterRows,
    });
    expect(result.rows[0].identity.playerId).toBeNull();
    expect(result.rows[0].identity.resolutionMethod).toBe("unresolved-no-gsis-match");
  });

  it("reports a JKB row with no PAR consensus match as unresolved-no-par-match", () => {
    const result = buildRosIdentityCrosswalk({
      rankingRows: [jkbRow({ player: "Nobody Here" })],
      parRows: [parRow({})],
      playerRows: [],
      rosterRows: [],
    });
    expect(result.rows[0].identity.resolutionMethod).toBe("unresolved-no-par-match");
    expect(result.rows[0].parMatch.found).toBe(false);
    expect(result.counts.unresolved).toBe(1);
  });

  it("flags an ambiguous PAR name+position match (two distinct source ids) without guessing", () => {
    const result = buildRosIdentityCrosswalk({
      rankingRows: [jkbRow({})],
      parRows: [parRow({ "Source ID": "TestPl00" }), parRow({ "Source ID": "TestPl01", Team: "MIA" })],
      playerRows: [],
      rosterRows: [],
    });
    expect(result.rows[0].parMatch.ambiguous).toBe(true);
    expect(result.counts.ambiguousParMatches).toBe(1);
  });

  it("detects duplicate canonical playerIds across distinct JKB rows", () => {
    const rosterRows: ProductionIdentitySourceRow[] = [
      { gsisId: "00-0000009", pfrId: "TestPl00", playerName: "Test Player", position: "QB", team: "BUF", status: "ACT" },
    ];
    const result = buildRosIdentityCrosswalk({
      rankingRows: [
        jkbRow({ overallRank: 1, player: "Test Player" }),
        jkbRow({ overallRank: 2, player: "Test Player" }),
      ],
      parRows: [parRow({})],
      playerRows: rosterRows,
      rosterRows,
    });
    expect(result.counts.duplicateCanonicalIds).toBe(2);
    expect(result.counts.duplicateCanonicalIdGroups).toHaveLength(1);
    expect(result.counts.duplicateCanonicalIdGroups[0].playerId).toBe("gsis:00-0000009");
  });

  it("never publishes a candidate gsisId when the resolver could not confirm current-roster identity", () => {
    // players.csv row matches by name+position but is absent from the current
    // roster (e.g. a free agent) -- resolveProductionProjectionIdentity
    // surfaces the candidate gsisId without setting resolved=true.
    const playerRows: ProductionIdentitySourceRow[] = [
      { gsisId: "00-0099999", pfrId: "OldPl00", playerName: "Test Player", position: "QB", team: null, status: "RET" },
    ];
    const result = buildRosIdentityCrosswalk({
      rankingRows: [jkbRow({})],
      parRows: [parRow({})],
      playerRows,
      rosterRows: [],
    });
    expect(result.rows[0].identity.resolutionMethod).toBe("unresolved-no-gsis-match");
    expect(result.rows[0].identity.playerId).toBeNull();
    expect(result.rows[0].identity.gsisId).toBeNull();
    expect(result.counts.resolved).toBe(0);
    expect(result.counts.unresolved).toBe(1);
  });

  it("resolves via stable-id-off-roster when a PAR-matched player has an exact PFR-id hit on the master player table but is absent from the current roster", () => {
    // Mirrors Stefon Diggs / Deebo Samuel / Brandon Aiyuk / Tyreek Hill in the
    // real 2026 crosswalk: PAR match found, PFR id agrees exactly with the
    // nflverse master player table, but the player is not on the Week 1
    // active-roster snapshot (free agent / released / reserve).
    const playerRows: ProductionIdentitySourceRow[] = [
      { gsisId: "00-0031588", pfrId: "TestPl00", playerName: "Test Player", position: "QB", team: null, status: "RLS" },
    ];
    const result = buildRosIdentityCrosswalk({
      rankingRows: [jkbRow({})],
      parRows: [parRow({})],
      playerRows,
      rosterRows: [],
    });
    expect(result.rows[0].identity.resolutionMethod).toBe("stable-id-off-roster");
    expect(result.rows[0].identity.playerId).toBe("gsis:00-0031588");
    expect(result.rows[0].identity.offRosterStatus).toBe("RLS");
    expect(result.counts.resolved).toBe(1);
    expect(result.counts.resolutionMethodCounts["stable-id-off-roster"]).toBe(1);
  });

  it("does not use the off-roster fallback for a name-only match whose PFR id disagrees with the PAR source id", () => {
    // Same fixture as the "never publishes a candidate gsisId" test above,
    // restated to make the guard explicit: pfrId "OldPl00" does not match
    // the PAR row's "TestPl00", so this must stay unresolved even though a
    // same-name/-position candidate exists.
    const playerRows: ProductionIdentitySourceRow[] = [
      { gsisId: "00-0099999", pfrId: "OldPl00", playerName: "Test Player", position: "QB", team: null, status: "RET" },
    ];
    const result = buildRosIdentityCrosswalk({
      rankingRows: [jkbRow({})],
      parRows: [parRow({})],
      playerRows,
      rosterRows: [],
    });
    expect(result.rows[0].identity.resolutionMethod).toBe("unresolved-no-gsis-match");
    expect(result.rows[0].identity.playerId).toBeNull();
  });

  it("resolves GSIS directly from exact name+position when no PAR row exists at all", () => {
    // Mirrors Ricky Pearsall in the real 2026 crosswalk: a genuine PAR
    // provider gap (confirmed absent from the source file), not a JKB
    // naming issue -- the player's GSIS identity is still carried when an
    // unambiguous exact roster match exists, with parMatch.found left false
    // rather than fabricating a PAR join.
    const rosterRows: ProductionIdentitySourceRow[] = [
      { gsisId: "00-0039916", pfrId: "PearRi00", playerName: "Nobody Here", position: "QB", team: "BUF", status: "ACT" },
    ];
    const result = buildRosIdentityCrosswalk({
      rankingRows: [jkbRow({ player: "Nobody Here" })],
      parRows: [parRow({})],
      playerRows: rosterRows,
      rosterRows,
    });
    expect(result.rows[0].parMatch.found).toBe(false);
    expect(result.rows[0].identity.resolutionMethod).toBe("exact-name-position");
    expect(result.rows[0].identity.playerId).toBe("gsis:00-0039916");
    expect(result.counts.resolved).toBe(1);
  });

  it("stays unresolved-no-par-match when neither a PAR row nor a direct roster name+position match exists", () => {
    const result = buildRosIdentityCrosswalk({
      rankingRows: [jkbRow({ player: "Truly Nobody" })],
      parRows: [parRow({})],
      playerRows: [],
      rosterRows: [],
    });
    expect(result.rows[0].identity.resolutionMethod).toBe("unresolved-no-par-match");
    expect(result.rows[0].identity.playerId).toBeNull();
  });

  it("is deterministic across repeated runs on the same input", () => {
    const rosterRows: ProductionIdentitySourceRow[] = [
      { gsisId: "00-0000001", pfrId: "TestPl00", playerName: "Test Player", position: "QB", team: "BUF", status: "ACT" },
    ];
    const input = { rankingRows: [jkbRow({})], parRows: [parRow({})], playerRows: rosterRows, rosterRows };
    const first = buildRosIdentityCrosswalk(input);
    const second = buildRosIdentityCrosswalk(input);
    expect(second).toEqual(first);
  });
});
