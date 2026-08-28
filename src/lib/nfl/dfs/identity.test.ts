import { describe, expect, it } from "vitest";
import {
  findDuplicateDstCanonicalIdentities,
  findDuplicateOffensiveCanonicalIdentities,
  isDraftKingsOffensiveRow,
  resolveDstIdentity,
  resolveOffensiveIdentity,
  type ValidatedDraftKingsOffensiveRow,
} from "@/lib/nfl/dfs/identity";
import { buildDkRow, buildTeam } from "@/lib/nfl/dfs/__fixtures__/dkRowFactory";
import { buildProjectionRow } from "@/lib/nfl/dfs/__fixtures__/projectionRowFactory";

function offensiveRow(overrides: Parameters<typeof buildDkRow>[0]) {
  const row = buildDkRow(overrides);
  if (!isDraftKingsOffensiveRow(row)) throw new Error("expected an offensive row in test setup");
  return row as ValidatedDraftKingsOffensiveRow;
}

describe("resolveOffensiveIdentity", () => {
  it("resolves an exact name+position+team match and copies the canonical playerId", () => {
    const dkRow = offensiveRow({ dkId: "1", name: "Derek Sample", position: "QB", teamAbbrev: "NO" });
    const projection = buildProjectionRow({ playerId: "gsis:00-001", playerName: "Derek Sample", position: "QB", team: "no" });

    const result = resolveOffensiveIdentity(dkRow, [projection]);

    expect(result.status).toBe("resolved");
    expect(result.playerId).toBe("gsis:00-001");
    expect(result.projection).toBe(projection);
    expect(result.dkId).toBe("1");
  });

  it("normalizes punctuation and suffixes the same way the production identity authority does", () => {
    const dkRow = offensiveRow({ dkId: "2", name: "A.J. Brown Jr.", position: "WR", teamAbbrev: "PHI" });
    const projection = buildProjectionRow({ playerId: "gsis:00-002", playerName: "AJ Brown", position: "WR", team: "phi" });

    const result = resolveOffensiveIdentity(dkRow, [projection]);

    expect(result.status).toBe("resolved");
    expect(result.playerId).toBe("gsis:00-002");
  });

  it("normalizes team abbreviation aliases (JAX/JAC, WAS/WSH, LA/LAR, AZ/ARI)", () => {
    const cases: Array<[string, string]> = [
      ["JAX", "jax"],
      ["JAC", "jax"],
      ["WAS", "wsh"],
      ["WSH", "wsh"],
      ["LA", "lar"],
      ["AZ", "ari"],
      ["ARI", "ari"],
    ];

    cases.forEach(([dkTeam, projectionTeam], index) => {
      const dkRow = offensiveRow({ dkId: `alias-${index}`, name: "Alias Player", position: "RB", teamAbbrev: dkTeam });
      const projection = buildProjectionRow({ playerId: `gsis:alias-${index}`, playerName: "Alias Player", position: "RB", team: projectionTeam });

      const result = resolveOffensiveIdentity(dkRow, [projection]);
      expect(result.status, `${dkTeam} -> ${projectionTeam}`).toBe("resolved");
      expect(result.teamMismatch).toBe(false);
    });
  });

  it("returns position-conflict when the name matches only at a different position", () => {
    const dkRow = offensiveRow({ dkId: "3", name: "Multi Position", position: "WR", teamAbbrev: "NO" });
    const projection = buildProjectionRow({ playerId: "gsis:00-003", playerName: "Multi Position", position: "RB", team: "no" });

    const result = resolveOffensiveIdentity(dkRow, [projection]);

    expect(result.status).toBe("position-conflict");
    expect(result.playerId).toBeNull();
  });

  it("resolves via team disambiguation when multiple same-name-same-position candidates exist", () => {
    const dkRow = offensiveRow({ dkId: "4", name: "Duplicate Name", position: "RB", teamAbbrev: "KC" });
    const candidateA = buildProjectionRow({ playerId: "gsis:00-004a", playerName: "Duplicate Name", position: "RB", team: "no" });
    const candidateB = buildProjectionRow({ playerId: "gsis:00-004b", playerName: "Duplicate Name", position: "RB", team: "kc" });

    const result = resolveOffensiveIdentity(dkRow, [candidateA, candidateB]);

    expect(result.status).toBe("resolved");
    expect(result.playerId).toBe("gsis:00-004b");
    expect(result.candidateCount).toBe(2);
  });

  it("returns team-conflict when team is present but matches none of the multiple candidates", () => {
    const dkRow = offensiveRow({ dkId: "5", name: "Duplicate Name", position: "RB", teamAbbrev: "BUF" });
    const candidateA = buildProjectionRow({ playerId: "gsis:00-005a", playerName: "Duplicate Name", position: "RB", team: "no" });
    const candidateB = buildProjectionRow({ playerId: "gsis:00-005b", playerName: "Duplicate Name", position: "RB", team: "kc" });

    const result = resolveOffensiveIdentity(dkRow, [candidateA, candidateB]);

    expect(result.status).toBe("team-conflict");
    expect(result.playerId).toBeNull();
  });

  it("returns ambiguous when team does not uniquely disambiguate multiple candidates", () => {
    const dkRow = offensiveRow({ dkId: "6", name: "Duplicate Name", position: "RB", teamAbbrev: "NO" });
    const candidateA = buildProjectionRow({ playerId: "gsis:00-006a", playerName: "Duplicate Name", position: "RB", team: "no" });
    const candidateB = buildProjectionRow({ playerId: "gsis:00-006b", playerName: "Duplicate Name", position: "RB", team: "no" });

    const result = resolveOffensiveIdentity(dkRow, [candidateA, candidateB]);

    expect(result.status).toBe("ambiguous");
    expect(result.playerId).toBeNull();
  });

  it("returns unresolved when no projection-universe player matches the name", () => {
    const dkRow = offensiveRow({ dkId: "7", name: "Nobody Here", position: "WR", teamAbbrev: "NO" });
    const projection = buildProjectionRow({ playerId: "gsis:00-007", playerName: "Somebody Else", position: "WR", team: "no" });

    const result = resolveOffensiveIdentity(dkRow, [projection]);

    expect(result.status).toBe("unresolved");
    expect(result.playerId).toBeNull();
  });

  it("never fuzzy-rescues a materially different name even when the team matches", () => {
    const dkRow = offensiveRow({ dkId: "8", name: "Jordan Smith", position: "WR", teamAbbrev: "NO" });
    const projection = buildProjectionRow({ playerId: "gsis:00-008", playerName: "Jordan Smithe", position: "WR", team: "no" });

    const result = resolveOffensiveIdentity(dkRow, [projection]);

    expect(result.status).toBe("unresolved");
    expect(result.playerId).toBeNull();
  });

  it("resolves a traded / week-effective-team player: unique name+position still resolves despite a team mismatch", () => {
    const dkRow = offensiveRow({ dkId: "9", name: "Traded Player", position: "WR", teamAbbrev: "KC" });
    const projection = buildProjectionRow({ playerId: "gsis:00-009", playerName: "Traded Player", position: "WR", team: "no" });

    const result = resolveOffensiveIdentity(dkRow, [projection]);

    expect(result.status).toBe("resolved");
    expect(result.playerId).toBe("gsis:00-009");
    expect(result.teamMismatch).toBe(true);
  });

  it("preserves dkId on every resolution outcome", () => {
    const dkRow = offensiveRow({ dkId: "dk-42", name: "Nobody Here", position: "WR", teamAbbrev: "NO" });
    const result = resolveOffensiveIdentity(dkRow, []);
    expect(result.dkId).toBe("dk-42");
  });
});

describe("resolveDstIdentity", () => {
  it("resolves an exact TeamAbbrev match to the canonical team", () => {
    const dkRow = buildDkRow({ dkId: "d1", position: "DST", name: "Saints", teamAbbrev: "NO", rosterPosition: "DST" });
    const team = buildTeam({ id: "nfl-no", abbr: "no" });

    const result = resolveDstIdentity(dkRow, [team]);

    expect(result.status).toBe("resolved");
    expect(result.team).toBe(team);
    expect(result).not.toHaveProperty("projectedFantasyPoints");
  });

  it("normalizes a team alias before matching (WAS -> wsh)", () => {
    const dkRow = buildDkRow({ dkId: "d2", position: "DST", name: "Commanders", teamAbbrev: "WAS", rosterPosition: "DST" });
    const team = buildTeam({ id: "nfl-wsh", abbr: "wsh" });

    const result = resolveDstIdentity(dkRow, [team]);

    expect(result.status).toBe("resolved");
    expect(result.normalizedTeam).toBe("wsh");
    expect(result.team?.id).toBe("nfl-wsh");
  });

  it("returns unresolved for an unknown TeamAbbrev", () => {
    const dkRow = buildDkRow({ dkId: "d3", position: "DST", name: "Nowhere", teamAbbrev: "ZZZ", rosterPosition: "DST" });
    const team = buildTeam({ id: "nfl-no", abbr: "no" });

    const result = resolveDstIdentity(dkRow, [team]);

    expect(result.status).toBe("unresolved");
    expect(result.team).toBeNull();
  });

  it("returns ambiguous when more than one canonical team matches (defensive case)", () => {
    const dkRow = buildDkRow({ dkId: "d4", position: "DST", name: "Saints", teamAbbrev: "NO", rosterPosition: "DST" });
    const teamA = buildTeam({ id: "nfl-no-a", abbr: "no" });
    const teamB = buildTeam({ id: "nfl-no-b", abbr: "no" });

    const result = resolveDstIdentity(dkRow, [teamA, teamB]);

    expect(result.status).toBe("ambiguous");
    expect(result.team).toBeNull();
  });

  it("flags game-participation consistency using already-parsed Game Info", () => {
    const consistentRow = buildDkRow({
      dkId: "d5",
      position: "DST",
      name: "Saints",
      teamAbbrev: "NO",
      rosterPosition: "DST",
      game: { awayTeam: "NO", homeTeam: "DET", date: "09/13/2026", time: "01:00PM", timezone: "ET" },
    });
    const inconsistentRow = buildDkRow({
      dkId: "d6",
      position: "DST",
      name: "Saints",
      teamAbbrev: "NO",
      rosterPosition: "DST",
      game: { awayTeam: "KC", homeTeam: "BUF", date: "09/13/2026", time: "04:25PM", timezone: "ET" },
    });
    const team = buildTeam({ id: "nfl-no", abbr: "no" });

    expect(resolveDstIdentity(consistentRow, [team]).gameParticipationConsistent).toBe(true);
    expect(resolveDstIdentity(inconsistentRow, [team]).gameParticipationConsistent).toBe(false);
  });
});

describe("duplicate canonical identity detection", () => {
  it("detects two distinct DK rows resolving to the same canonical playerId", () => {
    const projection = buildProjectionRow({ playerId: "gsis:shared", playerName: "Shared Player", position: "WR", team: "no" });
    const rowA = offensiveRow({ dkId: "dup-a", name: "Shared Player", position: "WR", teamAbbrev: "NO" });
    const rowB = offensiveRow({ dkId: "dup-b", name: "Shared Player", position: "WR", teamAbbrev: "NO" });

    const resolutions = [rowA, rowB].map((row) => resolveOffensiveIdentity(row, [projection]));
    const duplicates = findDuplicateOffensiveCanonicalIdentities(resolutions);

    expect(duplicates).toEqual([{ canonicalId: "gsis:shared", dkIds: ["dup-a", "dup-b"] }]);
  });

  it("does not flag distinct resolved players as duplicates", () => {
    const projectionA = buildProjectionRow({ playerId: "gsis:a", playerName: "Player A", position: "WR", team: "no" });
    const projectionB = buildProjectionRow({ playerId: "gsis:b", playerName: "Player B", position: "WR", team: "no" });
    const rowA = offensiveRow({ dkId: "solo-a", name: "Player A", position: "WR", teamAbbrev: "NO" });
    const rowB = offensiveRow({ dkId: "solo-b", name: "Player B", position: "WR", teamAbbrev: "NO" });

    const resolutions = [rowA, rowB].map((row) => resolveOffensiveIdentity(row, [projectionA, projectionB]));
    expect(findDuplicateOffensiveCanonicalIdentities(resolutions)).toEqual([]);
  });

  it("detects two distinct DK DST rows resolving to the same canonical team", () => {
    const team = buildTeam({ id: "nfl-no", abbr: "no" });
    const rowA = buildDkRow({ dkId: "dst-dup-a", position: "DST", name: "Saints", teamAbbrev: "NO", rosterPosition: "DST" });
    const rowB = buildDkRow({ dkId: "dst-dup-b", position: "DST", name: "Saints", teamAbbrev: "NO", rosterPosition: "DST" });

    const resolutions = [rowA, rowB].map((row) => resolveDstIdentity(row, [team]));
    const duplicates = findDuplicateDstCanonicalIdentities(resolutions);

    expect(duplicates).toEqual([{ canonicalId: "nfl-no", dkIds: ["dst-dup-a", "dst-dup-b"] }]);
  });
});
