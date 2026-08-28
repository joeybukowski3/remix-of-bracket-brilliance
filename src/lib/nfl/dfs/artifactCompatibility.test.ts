import { describe, expect, it } from "vitest";
import { assessDfsSlateCompatibility, DFS_PROJECTION_FRESHNESS_WARNING_HOURS } from "@/lib/nfl/dfs/artifactCompatibility";
import {
  isDraftKingsOffensiveRow,
  resolveOffensiveIdentity,
  type OffensiveIdentityResolution,
  type ValidatedDraftKingsOffensiveRow,
} from "@/lib/nfl/dfs/identity";
import { buildDkRow, buildGame } from "@/lib/nfl/dfs/__fixtures__/dkRowFactory";
import { buildProjectionArtifact, buildProjectionRow } from "@/lib/nfl/dfs/__fixtures__/projectionRowFactory";
import { buildResearchArtifact } from "@/lib/nfl/dfs/__fixtures__/researchFactory";
import type { NflWeekEffectiveTeamAssignment } from "@/lib/nfl/identity/identity";

function offensiveRow(overrides: Parameters<typeof buildDkRow>[0]) {
  const row = buildDkRow(overrides);
  if (!isDraftKingsOffensiveRow(row)) throw new Error("expected offensive row");
  return row as ValidatedDraftKingsOffensiveRow;
}

function resolve(overrides: Parameters<typeof buildDkRow>[0], projectionRows: Parameters<typeof resolveOffensiveIdentity>[1]): OffensiveIdentityResolution {
  return resolveOffensiveIdentity(offensiveRow(overrides), projectionRows);
}

describe("assessDfsSlateCompatibility — season/week", () => {
  it("is compatible when the projection artifact season/week exactly matches selection", () => {
    const artifact = buildProjectionArtifact({ season: 2026, week: 1 });
    const result = assessDfsSlateCompatibility({
      dkRows: [],
      selectedSeason: 2026,
      selectedWeek: 1,
      projectionArtifact: artifact,
      canonicalGames: [],
      offensiveIdentityResolutions: [],
    });
    expect(result.projection.seasonMatches).toBe(true);
    expect(result.projection.weekMatches).toBe(true);
    expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("blocks on a wrong season and never substitutes another artifact", () => {
    const artifact = buildProjectionArtifact({ season: 2025, week: 1 });
    const result = assessDfsSlateCompatibility({
      dkRows: [],
      selectedSeason: 2026,
      selectedWeek: 1,
      projectionArtifact: artifact,
      canonicalGames: [],
      offensiveIdentityResolutions: [],
    });
    expect(result.readiness).toBe("BLOCKED");
    expect(result.issues.some((i) => i.code === "PROJECTION_SEASON_MISMATCH")).toBe(true);
    expect(result.projection.season).toBe(2025); // exposed as-is, not silently corrected
  });

  it("blocks on a wrong week and never substitutes another artifact", () => {
    const artifact = buildProjectionArtifact({ season: 2026, week: 2 });
    const result = assessDfsSlateCompatibility({
      dkRows: [],
      selectedSeason: 2026,
      selectedWeek: 1,
      projectionArtifact: artifact,
      canonicalGames: [],
      offensiveIdentityResolutions: [],
    });
    expect(result.readiness).toBe("BLOCKED");
    expect(result.issues.some((i) => i.code === "PROJECTION_WEEK_MISMATCH")).toBe(true);
  });

  it("blocks when no projection artifact is supplied", () => {
    const result = assessDfsSlateCompatibility({
      dkRows: [],
      selectedSeason: 2026,
      selectedWeek: 1,
      projectionArtifact: null,
      canonicalGames: [],
      offensiveIdentityResolutions: [],
    });
    expect(result.readiness).toBe("BLOCKED");
    expect(result.issues.some((i) => i.code === "PROJECTION_ARTIFACT_MISSING")).toBe(true);
  });
});

describe("assessDfsSlateCompatibility — DK game vs canonical schedule", () => {
  const games = [
    buildGame({ gameId: "2026_01_NO_DET", season: 2026, week: 1, awayAbbr: "no", homeAbbr: "det" }),
    buildGame({ gameId: "2026_01_KC_BUF", season: 2026, week: 1, awayAbbr: "kc", homeAbbr: "buf" }),
    buildGame({ gameId: "2026_01_DAL_NYG", season: 2026, week: 1, awayAbbr: "dal", homeAbbr: "nyg" }),
  ];

  it("accepts the full weekly slate", () => {
    const dkRows = [
      buildDkRow({ dkId: "1", teamAbbrev: "NO", game: { awayTeam: "NO", homeTeam: "DET", date: "09/13/2026", time: "01:00PM", timezone: "ET" }, gameInfoRaw: "NO@DET 09/13/2026 01:00PM ET" }),
      buildDkRow({ dkId: "2", teamAbbrev: "KC", game: { awayTeam: "KC", homeTeam: "BUF", date: "09/13/2026", time: "04:25PM", timezone: "ET" }, gameInfoRaw: "KC@BUF 09/13/2026 04:25PM ET" }),
      buildDkRow({ dkId: "3", teamAbbrev: "DAL", game: { awayTeam: "DAL", homeTeam: "NYG", date: "09/13/2026", time: "08:20PM", timezone: "ET" }, gameInfoRaw: "DAL@NYG 09/13/2026 08:20PM ET" }),
    ];
    const result = assessDfsSlateCompatibility({
      dkRows, selectedSeason: 2026, selectedWeek: 1,
      projectionArtifact: buildProjectionArtifact({ season: 2026, week: 1 }),
      canonicalGames: games, offensiveIdentityResolutions: [],
    });
    expect(result.games.matched).toHaveLength(3);
    expect(result.games.unmatched).toHaveLength(0);
  });

  it("accepts a Sunday Main subset that omits Thursday/SNF/MNF games", () => {
    const dkRows = [
      buildDkRow({ dkId: "1", teamAbbrev: "NO", game: { awayTeam: "NO", homeTeam: "DET", date: "09/13/2026", time: "01:00PM", timezone: "ET" }, gameInfoRaw: "NO@DET 09/13/2026 01:00PM ET" }),
    ];
    const result = assessDfsSlateCompatibility({
      dkRows, selectedSeason: 2026, selectedWeek: 1,
      projectionArtifact: buildProjectionArtifact({ season: 2026, week: 1 }),
      canonicalGames: games, offensiveIdentityResolutions: [],
    });
    expect(result.readiness).not.toBe("BLOCKED");
    expect(result.games.matched).toHaveLength(1);
    expect(result.games.unmatched).toHaveLength(0);
  });

  it("blocks when an uploaded game does not belong to the selected week", () => {
    const dkRows = [
      buildDkRow({ dkId: "1", teamAbbrev: "SEA", game: { awayTeam: "SEA", homeTeam: "ARI", date: "09/20/2026", time: "01:00PM", timezone: "ET" }, gameInfoRaw: "SEA@ARI 09/20/2026 01:00PM ET" }),
    ];
    const result = assessDfsSlateCompatibility({
      dkRows, selectedSeason: 2026, selectedWeek: 1,
      projectionArtifact: buildProjectionArtifact({ season: 2026, week: 1 }),
      canonicalGames: games, offensiveIdentityResolutions: [],
    });
    expect(result.readiness).toBe("BLOCKED");
    expect(result.issues.some((i) => i.code === "DK_GAME_UNMATCHED")).toBe(true);
    expect(result.games.unmatched).toHaveLength(1);
  });

  it("does not double-count a game from multiple duplicate source rows", () => {
    const dkRows = [
      buildDkRow({ dkId: "1", position: "QB", rosterPosition: "QB", teamAbbrev: "NO", game: { awayTeam: "NO", homeTeam: "DET", date: "09/13/2026", time: "01:00PM", timezone: "ET" }, gameInfoRaw: "NO@DET 09/13/2026 01:00PM ET" }),
      buildDkRow({ dkId: "2", position: "RB", rosterPosition: "RB/FLEX", teamAbbrev: "DET", game: { awayTeam: "NO", homeTeam: "DET", date: "09/13/2026", time: "01:00PM", timezone: "ET" }, gameInfoRaw: "NO@DET 09/13/2026 01:00PM ET" }),
      buildDkRow({ dkId: "3", position: "WR", rosterPosition: "WR/FLEX", teamAbbrev: "NO", game: { awayTeam: "NO", homeTeam: "DET", date: "09/13/2026", time: "01:00PM", timezone: "ET" }, gameInfoRaw: "NO@DET 09/13/2026 01:00PM ET" }),
    ];
    const result = assessDfsSlateCompatibility({
      dkRows, selectedSeason: 2026, selectedWeek: 1,
      projectionArtifact: buildProjectionArtifact({ season: 2026, week: 1 }),
      canonicalGames: games, offensiveIdentityResolutions: [],
    });
    expect(result.games.matched).toHaveLength(1);
  });

  it("normalizes team aliases before matching (WAS DK row against a wsh-coded schedule)", () => {
    const aliasGames = [buildGame({ gameId: "2026_01_WSH_DAL", season: 2026, week: 1, awayAbbr: "wsh", homeAbbr: "dal" })];
    const dkRows = [
      buildDkRow({ dkId: "1", teamAbbrev: "WAS", game: { awayTeam: "WAS", homeTeam: "DAL", date: "09/13/2026", time: "01:00PM", timezone: "ET" }, gameInfoRaw: "WAS@DAL 09/13/2026 01:00PM ET" }),
    ];
    const result = assessDfsSlateCompatibility({
      dkRows, selectedSeason: 2026, selectedWeek: 1,
      projectionArtifact: buildProjectionArtifact({ season: 2026, week: 1 }),
      canonicalGames: aliasGames, offensiveIdentityResolutions: [],
    });
    expect(result.games.matched).toHaveLength(1);
    expect(result.games.matched[0].canonicalGame?.gameId).toBe("2026_01_WSH_DAL");
  });
});

describe("assessDfsSlateCompatibility — team-mismatch adjudication", () => {
  it("does not flag a row with a matching team", () => {
    const projection = buildProjectionRow({ playerId: "gsis:1", playerName: "Same Team", position: "WR", team: "no" });
    const resolution = resolve({ dkId: "1", name: "Same Team", position: "WR", teamAbbrev: "NO" }, [projection]);
    const result = assessDfsSlateCompatibility({
      dkRows: [], selectedSeason: 2026, selectedWeek: 1,
      projectionArtifact: buildProjectionArtifact({ season: 2026, week: 1 }),
      canonicalGames: [], offensiveIdentityResolutions: [resolution],
    });
    expect(result.teamMismatches).toEqual([]);
  });

  it("classifies a team mismatch explained by a canonical week-effective-team record as audited (non-blocking)", () => {
    const projection = buildProjectionRow({ playerId: "gsis:2", playerName: "Traded Player", position: "WR", team: "no" });
    const resolution = resolve({ dkId: "2", name: "Traded Player", position: "WR", teamAbbrev: "KC" }, [projection]);
    const assignments: NflWeekEffectiveTeamAssignment[] = [{ playerId: "gsis:2", season: 2026, week: 1, team: "KC" }];

    const result = assessDfsSlateCompatibility({
      dkRows: [], selectedSeason: 2026, selectedWeek: 1,
      projectionArtifact: buildProjectionArtifact({ season: 2026, week: 1 }),
      canonicalGames: [], offensiveIdentityResolutions: [resolution],
      weekEffectiveTeamAssignments: assignments,
    });

    expect(result.teamMismatches).toEqual([{ dkId: "2", playerId: "gsis:2", dkTeam: "kc", projectionTeam: "no", status: "audited" }]);
    expect(result.readiness).toBe("READY_WITH_WARNINGS");
    expect(result.issues.some((i) => i.code === "TEAM_MISMATCH_AUDITED")).toBe(true);
  });

  it("surfaces an unexplained team mismatch instead of silently treating it as safe", () => {
    const projection = buildProjectionRow({ playerId: "gsis:3", playerName: "Unexplained Player", position: "WR", team: "no" });
    const resolution = resolve({ dkId: "3", name: "Unexplained Player", position: "WR", teamAbbrev: "KC" }, [projection]);

    const result = assessDfsSlateCompatibility({
      dkRows: [], selectedSeason: 2026, selectedWeek: 1,
      projectionArtifact: buildProjectionArtifact({ season: 2026, week: 1 }),
      canonicalGames: [], offensiveIdentityResolutions: [resolution],
    });

    expect(result.teamMismatches).toEqual([{ dkId: "3", playerId: "gsis:3", dkTeam: "kc", projectionTeam: "no", status: "unexplained" }]);
    expect(result.issues.some((i) => i.code === "TEAM_MISMATCH_UNEXPLAINED")).toBe(true);
  });
});

describe("assessDfsSlateCompatibility — freshness", () => {
  it("exposes generatedAt and inputAsOf", () => {
    const artifact = buildProjectionArtifact({ season: 2026, week: 1, generatedAt: "2026-09-10T12:00:00.000Z", inputAsOf: "2026-09-10T10:00:00.000Z" });
    const result = assessDfsSlateCompatibility({
      dkRows: [], selectedSeason: 2026, selectedWeek: 1, projectionArtifact: artifact, canonicalGames: [], offensiveIdentityResolutions: [],
      now: new Date("2026-09-10T11:00:00.000Z"),
    });
    expect(result.projection.generatedAt).toBe("2026-09-10T12:00:00.000Z");
    expect(result.projection.inputAsOf).toBe("2026-09-10T10:00:00.000Z");
  });

  it("is fresh when inputAsOf age is within the warning threshold", () => {
    const artifact = buildProjectionArtifact({ season: 2026, week: 1, inputAsOf: "2026-09-10T00:00:00.000Z" });
    const result = assessDfsSlateCompatibility({
      dkRows: [], selectedSeason: 2026, selectedWeek: 1, projectionArtifact: artifact,
      researchArtifact: buildResearchArtifact({ season: 2026, week: 1, rows: [] }),
      canonicalGames: [], offensiveIdentityResolutions: [],
      now: new Date("2026-09-10T10:00:00.000Z"), // 10h old
    });
    expect(result.projection.freshness).toBe("fresh");
    expect(result.issues.some((i) => i.code === "PROJECTION_ARTIFACT_STALE")).toBe(false);
    expect(result.readiness).toBe("READY");
  });

  it("warns (does not block) when inputAsOf age exceeds the warning threshold", () => {
    const artifact = buildProjectionArtifact({ season: 2026, week: 1, inputAsOf: "2026-09-08T00:00:00.000Z" });
    const result = assessDfsSlateCompatibility({
      dkRows: [], selectedSeason: 2026, selectedWeek: 1, projectionArtifact: artifact, canonicalGames: [], offensiveIdentityResolutions: [],
      now: new Date("2026-09-10T00:00:00.000Z"), // 48h old
    });
    expect(result.projection.freshness).toBe("stale-warning");
    expect(result.projection.ageHours).toBeCloseTo(48, 5);
    expect(result.readiness).toBe("READY_WITH_WARNINGS");
    expect(result.issues.some((i) => i.code === "PROJECTION_ARTIFACT_STALE")).toBe(true);
  });

  it("uses a deterministic injected clock rather than the real current time", () => {
    const artifact = buildProjectionArtifact({ season: 2026, week: 1, inputAsOf: "2026-09-10T00:00:00.000Z" });
    const first = assessDfsSlateCompatibility({
      dkRows: [], selectedSeason: 2026, selectedWeek: 1, projectionArtifact: artifact, canonicalGames: [], offensiveIdentityResolutions: [],
      now: new Date("2026-09-10T05:00:00.000Z"),
    });
    const second = assessDfsSlateCompatibility({
      dkRows: [], selectedSeason: 2026, selectedWeek: 1, projectionArtifact: artifact, canonicalGames: [], offensiveIdentityResolutions: [],
      now: new Date("2026-09-10T05:00:00.000Z"),
    });
    expect(second).toEqual(first);
    expect(first.projection.ageHours).toBe(5);
  });

  it(`documents the threshold as exactly ${DFS_PROJECTION_FRESHNESS_WARNING_HOURS} hours`, () => {
    expect(DFS_PROJECTION_FRESHNESS_WARNING_HOURS).toBe(24);
  });
});

describe("assessDfsSlateCompatibility — research artifact wiring", () => {
  it("warns but does not block when no research artifact is supplied", () => {
    const result = assessDfsSlateCompatibility({
      dkRows: [], selectedSeason: 2026, selectedWeek: 1,
      projectionArtifact: buildProjectionArtifact({ season: 2026, week: 1 }),
      canonicalGames: [], offensiveIdentityResolutions: [],
    });
    expect(result.research.compatibility).toEqual({ status: "not-provided" });
    expect(result.issues.some((i) => i.code === "RESEARCH_ARTIFACT_MISSING")).toBe(true);
    expect(result.readiness).toBe("READY_WITH_WARNINGS");
  });

  it("warns but does not block on a wrong-week research artifact; core projection compatibility remains valid", () => {
    const result = assessDfsSlateCompatibility({
      dkRows: [], selectedSeason: 2026, selectedWeek: 1,
      projectionArtifact: buildProjectionArtifact({ season: 2026, week: 1 }),
      researchArtifact: buildResearchArtifact({ season: 2026, week: 2, rows: [] }),
      canonicalGames: [], offensiveIdentityResolutions: [],
    });
    expect(result.research.compatibility.status).toBe("wrong-week");
    expect(result.issues.some((i) => i.code === "RESEARCH_ARTIFACT_WRONG_WEEK")).toBe(true);
    expect(result.readiness).toBe("READY_WITH_WARNINGS");
    expect(result.projection.seasonMatches).toBe(true);
    expect(result.projection.weekMatches).toBe(true);
  });
});

describe("assessDfsSlateCompatibility — identity coverage (never a whole-slate blocker)", () => {
  it("warns, but does not block, when some offensive players are unresolved", () => {
    const unresolved = resolve({ dkId: "1", name: "Nobody Matches", position: "WR", teamAbbrev: "NO" }, []);
    const result = assessDfsSlateCompatibility({
      dkRows: [], selectedSeason: 2026, selectedWeek: 1,
      projectionArtifact: buildProjectionArtifact({ season: 2026, week: 1 }),
      canonicalGames: [], offensiveIdentityResolutions: [unresolved],
    });
    expect(result.readiness).toBe("READY_WITH_WARNINGS");
    expect(result.issues.some((i) => i.code === "IDENTITY_UNRESOLVED_PLAYERS")).toBe(true);
  });

  it("warns, but does not block, when a duplicate canonical identity conflict exists", () => {
    const projection = buildProjectionRow({ playerId: "gsis:dup", playerName: "Shared Player", position: "WR", team: "no" });
    const rowA = resolve({ dkId: "a", name: "Shared Player", position: "WR", teamAbbrev: "NO" }, [projection]);
    const rowB = resolve({ dkId: "b", name: "Shared Player", position: "WR", teamAbbrev: "NO" }, [projection]);

    const result = assessDfsSlateCompatibility({
      dkRows: [], selectedSeason: 2026, selectedWeek: 1,
      projectionArtifact: buildProjectionArtifact({ season: 2026, week: 1 }),
      canonicalGames: [], offensiveIdentityResolutions: [rowA, rowB],
    });
    expect(result.readiness).toBe("READY_WITH_WARNINGS");
    expect(result.issues.some((i) => i.code === "IDENTITY_CONFLICTS")).toBe(true);
  });
});

describe("assessDfsSlateCompatibility — readiness", () => {
  it("is READY with a fully compatible, warning-free slate", () => {
    const result = assessDfsSlateCompatibility({
      dkRows: [], selectedSeason: 2026, selectedWeek: 1,
      projectionArtifact: buildProjectionArtifact({ season: 2026, week: 1, inputAsOf: "2026-09-10T00:00:00.000Z" }),
      researchArtifact: buildResearchArtifact({ season: 2026, week: 1, rows: [] }),
      canonicalGames: [], offensiveIdentityResolutions: [],
      now: new Date("2026-09-10T01:00:00.000Z"),
    });
    expect(result.readiness).toBe("READY");
  });
});

describe("assessDfsSlateCompatibility — determinism", () => {
  it("returns deep-equivalent output for equivalent input built twice with the same clock", () => {
    const buildInput = () => ({
      dkRows: [buildDkRow({ dkId: "1", teamAbbrev: "NO", game: { awayTeam: "NO", homeTeam: "DET", date: "09/13/2026", time: "01:00PM", timezone: "ET" }, gameInfoRaw: "NO@DET 09/13/2026 01:00PM ET" })],
      selectedSeason: 2026,
      selectedWeek: 1,
      projectionArtifact: buildProjectionArtifact({ season: 2026, week: 1 }),
      canonicalGames: [buildGame({ gameId: "2026_01_NO_DET", season: 2026, week: 1, awayAbbr: "no", homeAbbr: "det" })],
      offensiveIdentityResolutions: [],
      now: new Date("2026-09-10T05:00:00.000Z"),
    });
    expect(assessDfsSlateCompatibility(buildInput())).toEqual(assessDfsSlateCompatibility(buildInput()));
  });
});
