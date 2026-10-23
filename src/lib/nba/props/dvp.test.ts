/** DvP tests. Invented players and numbers only; nothing here is real NBA data. */
import { describe, expect, it } from "vitest";
import { CANONICAL_TEAM_CODES } from "./canonical";
import { blendAllowed, BLEND_PRIOR_GAMES, buildDvpRows, compareDvp, dvpMatrixColumn, sampleBasisFor, tierForRank, type DvpPlayerGameLine, type DvpRow } from "./dvp";
import { classifyPositionMinutes, classifyRosterLabel } from "./dvpPositions";

const SOURCE = { sourceId: "synthetic-box", sourceUpdatedAtUtc: "2026-11-01T12:00:00Z" } as const;

function line(over: Partial<DvpPlayerGameLine> = {}): DvpPlayerGameLine {
  return { season: "2025-26", gameId: "g1", opponentTeam: "BOS", playerId: "p1", minutes: 30, pts: 20, reb: 5, ast: 5, positionLabel: "PG", ...SOURCE, ...over };
}

/** One game per team; team index i allows (i + 1) points to a "C" player, so ranks are predictable. */
function leagueLines(season: "2025-26" | "2026-27", gamesPerTeam = 1): DvpPlayerGameLine[] {
  return CANONICAL_TEAM_CODES.flatMap((team, i) =>
    Array.from({ length: gamesPerTeam }, (_, g) => line({ season, opponentTeam: team, gameId: `${season}-${team}-${g}`, playerId: `${team}-c`, positionLabel: "C", pts: i + 1, reb: 30 - i, ast: 2 })),
  );
}

describe("classifyRosterLabel", () => {
  it.each([
    ["PG", { PG: 1 }],
    ["c", { C: 1 }],
    ["G", { PG: 0.5, SG: 0.5 }],
    ["F", { SF: 0.5, PF: 0.5 }],
    ["G-F", { SG: 0.5, SF: 0.5 }],
    ["F-G", { SG: 0.5, SF: 0.5 }],
    ["F-C", { PF: 0.5, C: 0.5 }],
    ["C-F", { PF: 0.5, C: 0.5 }],
    ["PG-SG", { PG: 0.5, SG: 0.5 }],
    ["sg/sf/pf", { SG: 1 / 3, SF: 1 / 3, PF: 1 / 3 }],
    [" PG , SG ", { PG: 0.5, SG: 0.5 }],
  ])("expands %s deterministically", (label, weights) => {
    const result = classifyRosterLabel(label);
    expect(result.ok && result.weights).toEqual(weights);
    expect(result.ok && result.method).toBe("roster-label");
  });

  it.each([null, undefined, "", "G-C", "PG-F", "Guard", "X", "PG--SG", "G-F-C"])("never guesses for %s", (label) => {
    expect(classifyRosterLabel(label).ok).toBe(false);
  });

  it("flags multi-position players and breaks ties by canonical order", () => {
    const wing = classifyRosterLabel("G-F");
    expect(wing.ok && wing.isMultiPosition).toBe(true);
    expect(wing.ok && wing.primary).toBe("SG");
    const single = classifyRosterLabel("PF");
    expect(single.ok && single.isMultiPosition).toBe(false);
  });
});

describe("classifyPositionMinutes", () => {
  it("converts minutes to weights and picks the heaviest primary", () => {
    const result = classifyPositionMinutes({ SG: 12, SF: 24 }, 36);
    expect(result.ok && result.weights).toEqual({ SG: 12 / 36, SF: 24 / 36 });
    expect(result.ok && result.primary).toBe("SF");
    expect(result.ok && result.method).toBe("position-minutes");
  });

  it("rejects unknown positions, negative minutes and sums that do not match", () => {
    expect(classifyPositionMinutes({ G: 30 }, 30).ok).toBe(false);
    expect(classifyPositionMinutes({ PG: -1, SG: 31 }, 30).ok).toBe(false);
    expect(classifyPositionMinutes({ PG: 20 }, 30).ok).toBe(false);
    expect(classifyPositionMinutes({}, 30).ok).toBe(false);
    expect(classifyPositionMinutes({ PG: 0 }, 0).ok).toBe(false);
  });
});

describe("buildDvpRows", () => {
  it("averages over every game the team played, not only games where the position appeared", () => {
    const { rows } = buildDvpRows([
      line({ gameId: "g1", playerId: "a", positionLabel: "PG", pts: 30 }),
      line({ gameId: "g2", playerId: "b", positionLabel: "C", pts: 10 }),
    ]);
    const pg = rows.find((r) => r.opponentTeam === "BOS" && r.position === "PG" && r.statistic === "PTS")!;
    expect(pg.gamesSampled).toBe(2);
    expect(pg.allowedPerGame).toBe(15);
  });

  it("splits a multi-position player's stats by weight and sums several players per game", () => {
    const { rows } = buildDvpRows([
      line({ playerId: "a", positionLabel: "G-F", pts: 20, reb: 8, ast: 4 }),
      line({ playerId: "b", positionLabel: "SG", pts: 10, reb: 2, ast: 6 }),
    ]);
    const get = (position: string, statistic: string) => rows.find((r) => r.position === position && r.statistic === statistic)!.allowedPerGame;
    expect(get("SG", "PTS")).toBe(20);
    expect(get("SF", "PTS")).toBe(10);
    expect(get("SG", "REB")).toBe(6);
    expect(get("SF", "AST")).toBe(2);
    expect(get("SG", "AST")).toBe(8);
    expect(get("PG", "PTS")).toBe(0);
  });

  it("prefers position minutes over the roster label", () => {
    const { rows } = buildDvpRows([line({ positionLabel: "PG", positionMinutes: { SF: 30 }, pts: 12 })]);
    expect(rows.find((r) => r.position === "SF" && r.statistic === "PTS")!.allowedPerGame).toBe(12);
    expect(rows.find((r) => r.position === "PG" && r.statistic === "PTS")!.allowedPerGame).toBe(0);
  });

  it("excludes unclassified players, reports them, and lowers minutes coverage", () => {
    const { rows, excluded } = buildDvpRows([line({ playerId: "a", minutes: 30, positionLabel: "PG" }), line({ playerId: "b", minutes: 10, positionLabel: "Guard", pts: 99 })]);
    expect(excluded).toEqual([{ season: "2025-26", gameId: "g1", playerId: "b", reason: 'unsupported position label "GUARD"' }]);
    expect(rows[0].minutesCoverage).toBeCloseTo(30 / 40);
    expect(rows.find((r) => r.position === "PG" && r.statistic === "PTS")!.allowedPerGame).toBe(20);
  });

  it("keeps the two seasons separate", () => {
    const { rows } = buildDvpRows([line({ season: "2025-26", pts: 10 }), line({ season: "2026-27", gameId: "g9", pts: 30 })]);
    const pts = (season: string) => rows.find((r) => r.season === season && r.position === "PG" && r.statistic === "PTS")!.allowedPerGame;
    expect(pts("2025-26")).toBe(10);
    expect(pts("2026-27")).toBe(30);
  });

  it("ranks 1 = most allowed once all 30 teams have data, deterministically", () => {
    const { rows } = buildDvpRows(leagueLines("2025-26"));
    const rank = (team: string, statistic = "PTS") => rows.find((r) => r.opponentTeam === team && r.position === "C" && r.statistic === statistic)!.rank;
    expect(rank(CANONICAL_TEAM_CODES[29])).toBe(1);
    expect(rank(CANONICAL_TEAM_CODES[0])).toBe(30);
    expect(rank(CANONICAL_TEAM_CODES[0], "REB")).toBe(1);
  });

  it("gives no rank for an incomplete league", () => {
    const { rows } = buildDvpRows([line()]);
    expect(rows.every((r) => r.rank === null)).toBe(true);
  });

  it.each([
    ["an unsupported season", { season: "2024-25" as never }],
    ["an unknown team", { opponentTeam: "XXX" }],
    ["missing provenance", { sourceId: "" }],
    ["an invalid timestamp", { sourceUpdatedAtUtc: "yesterday" }],
    ["negative stats", { pts: -1 }],
    ["non-finite minutes", { minutes: Number.NaN }],
  ])("throws on %s", (_name, over) => {
    expect(() => buildDvpRows([line(over)])).toThrow();
  });

  it("throws on a duplicate player-game and on mixed sources in one season", () => {
    expect(() => buildDvpRows([line(), line()])).toThrow(/duplicate/);
    expect(() => buildDvpRows([line(), line({ playerId: "p2", sourceId: "other" })])).toThrow(/mixed sources/);
  });

  it("carries provenance and the latest update time", () => {
    const { rows } = buildDvpRows([line(), line({ playerId: "p2", sourceUpdatedAtUtc: "2026-11-02T12:00:00Z" })]);
    expect(rows[0].sourceId).toBe("synthetic-box");
    expect(rows[0].lastUpdatedUtc).toBe("2026-11-02T12:00:00Z");
  });
});

describe("blend and comparison", () => {
  const row = (over: Partial<DvpRow>): DvpRow => ({
    season: "2025-26", opponentTeam: "BOS", position: "C", statistic: "PTS", allowedPerGame: 20, rank: 1, gamesSampled: 82, minutesCoverage: 1, lastUpdatedUtc: SOURCE.sourceUpdatedAtUtc, sourceId: SOURCE.sourceId, ...over,
  });

  it("is the prior season with no current games and the current season with no prior", () => {
    expect(blendAllowed(row({}), null)).toEqual({ allowedPerGame: 20, currentWeight: 0 });
    expect(blendAllowed(null, row({ season: "2026-27", allowedPerGame: 25 }))).toEqual({ allowedPerGame: 25, currentWeight: 1 });
    expect(blendAllowed(null, null)).toBeNull();
  });

  it("shrinks the current season toward last season by games played", () => {
    const blend = blendAllowed(row({ allowedPerGame: 20 }), row({ season: "2026-27", allowedPerGame: 30, gamesSampled: BLEND_PRIOR_GAMES }))!;
    expect(blend.currentWeight).toBe(0.5);
    expect(blend.allowedPerGame).toBe(25);
    const early = blendAllowed(row({ allowedPerGame: 20 }), row({ season: "2026-27", allowedPerGame: 30, gamesSampled: 2 }))!;
    expect(early.allowedPerGame).toBeLessThan(21);
  });

  it("labels sample basis and tier", () => {
    const prior = row({});
    expect(sampleBasisFor(null, null)).toBe("none");
    expect(sampleBasisFor(prior, row({ gamesSampled: 3 }))).toBe("prior-led");
    expect(sampleBasisFor(prior, row({ gamesSampled: 10 }))).toBe("blending");
    expect(sampleBasisFor(prior, row({ gamesSampled: 25 }))).toBe("current-led");
    expect(sampleBasisFor(null, row({ gamesSampled: 3 }))).toBe("none");
    expect([1, 10, 11, 20, 21, 30].map(tierForRank)).toEqual(["favorable", "favorable", "neutral", "neutral", "tough", "tough"]);
    expect(tierForRank(null)).toBeNull();
  });

  it("compares both seasons and the blend for a team, with N/A when data is missing", () => {
    const { rows } = buildDvpRows([...leagueLines("2025-26", 2), ...leagueLines("2026-27", 1).slice(0, 5)]);
    const last = CANONICAL_TEAM_CODES[29];
    const result = compareDvp(rows, last, "C", "PTS");
    expect(result.prior?.rank).toBe(1);
    expect(result.current).toBeNull();
    expect(result.blended?.rank).toBe(1);
    expect(result.blended?.currentWeight).toBe(0);
    expect(result.sampleBasis).toBe("prior-led");
    const early = compareDvp(rows, CANONICAL_TEAM_CODES[0], "C", "PTS");
    expect(early.current?.gamesSampled).toBe(1);
    expect(early.sampleBasis).toBe("prior-led");
    expect(compareDvp([], "BOS", "C", "PTS")).toMatchObject({ prior: null, current: null, blended: null, tier: null });
  });

  it("builds a matrix column per view with missing teams last", () => {
    const { rows } = buildDvpRows([...leagueLines("2025-26"), ...leagueLines("2026-27").slice(0, 3)]);
    const prior = dvpMatrixColumn(rows, "2025-26", "C", "PTS");
    expect(prior).toHaveLength(30);
    expect(prior[0]).toMatchObject({ team: CANONICAL_TEAM_CODES[29], rank: 1 });
    const current = dvpMatrixColumn(rows, "2026-27", "C", "PTS");
    expect(current.slice(0, 3).every((c) => c.allowedPerGame !== null)).toBe(true);
    expect(current.slice(3).every((c) => c.allowedPerGame === null && c.rank === null)).toBe(true);
    const blended = dvpMatrixColumn(rows, "blended", "C", "PTS");
    expect(blended.every((c) => c.allowedPerGame !== null && c.rank !== null)).toBe(true);
  });
});
