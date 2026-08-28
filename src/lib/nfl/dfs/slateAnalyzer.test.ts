import { describe, expect, it } from "vitest";
import {
  buildDfsSlateAnalysis,
  DFS_PROJECTION_SOURCE,
  enrichDfsSlateAnalysis,
  type DfsAnalyzerOffensiveRow,
  type DfsEnrichedDstRow,
  type DfsEnrichedOffensiveRow,
} from "@/lib/nfl/dfs/slateAnalyzer";
import { assessDfsSlateCompatibility } from "@/lib/nfl/dfs/artifactCompatibility";
import { assessDfsResearch } from "@/lib/nfl/dfs/research";
import { buildDkRow, buildGame, buildTeam } from "@/lib/nfl/dfs/__fixtures__/dkRowFactory";
import { buildProjectionArtifact, buildProjectionRow } from "@/lib/nfl/dfs/__fixtures__/projectionRowFactory";
import { buildMetric, buildResearchArtifact, buildResearchContext, buildResearchRow } from "@/lib/nfl/dfs/__fixtures__/researchFactory";
import type { ValidatedDraftKingsNflClassicRow } from "@/lib/nfl/dfs/contracts";
import type { WeeklyFantasyProjectionProductionRow } from "@/lib/fantasy/weekly/projections/production/artifactContract";

function qb(dkId: string, name: string, salary: number, team = "NO"): ValidatedDraftKingsNflClassicRow {
  return buildDkRow({ dkId, name, position: "QB", rosterPosition: "QB", salary, teamAbbrev: team });
}

function proj(playerId: string, name: string, position: "QB" | "RB" | "WR" | "TE", points: number, positionRank: number, team = "no"): WeeklyFantasyProjectionProductionRow {
  return buildProjectionRow({ playerId, playerName: name, position, projectedFantasyPoints: points, positionRank, team });
}

describe("buildDfsSlateAnalysis — DK positional salary rank", () => {
  it("ranks descending by salary using competition ranking (1, 2, 2, 4) within the uploaded slate", () => {
    const dkRows = [
      qb("q1", "QB One", 9000),
      qb("q2", "QB Two", 8000),
      qb("q3", "QB Three", 8000),
      qb("q4", "QB Four", 7000),
    ];
    const { rows } = buildDfsSlateAnalysis({ dkRows, projectionRows: [], teams: [] });
    const byId = Object.fromEntries(rows.map((row) => [row.dkId, row]));

    expect(byId.q1.dkPositionSalaryRank).toBe(1);
    expect(byId.q2.dkPositionSalaryRank).toBe(2);
    expect(byId.q3.dkPositionSalaryRank).toBe(2);
    expect(byId.q4.dkPositionSalaryRank).toBe(4);
  });

  it("is unaffected by an off-slate player never uploaded", () => {
    const dkRows = [qb("q1", "QB One", 9000), qb("q2", "QB Two", 8000)];
    const { rows } = buildDfsSlateAnalysis({ dkRows, projectionRows: [], teams: [] });
    expect(rows.find((r) => r.dkId === "q1")?.dkPositionSalaryRank).toBe(1);
    expect(rows.find((r) => r.dkId === "q2")?.dkPositionSalaryRank).toBe(2);
  });
});

describe("buildDfsSlateAnalysis — JKB slate position rank", () => {
  it("ranks descending by projectedFantasyPoints among resolved, uploaded-only players, with competition ties", () => {
    const dkRows = [qb("q1", "QB One", 9000), qb("q2", "QB Two", 8000), qb("q3", "QB Three", 8000)];
    const projectionRows = [
      proj("gsis:q1", "QB One", "QB", 25, 1),
      proj("gsis:q2", "QB Two", "QB", 20, 3),
      proj("gsis:q3", "QB Three", "QB", 20, 4),
    ];
    const { rows } = buildDfsSlateAnalysis({ dkRows, projectionRows, teams: [] });
    const byId = Object.fromEntries(rows.map((row) => [row.dkId, row]));

    expect(byId.q1.jkbSlatePositionRank).toBe(1);
    expect(byId.q2.jkbSlatePositionRank).toBe(2);
    expect(byId.q3.jkbSlatePositionRank).toBe(2);
  });

  it("excludes unresolved players and is unaffected by a high-projection off-slate player", () => {
    const dkRows = [qb("q1", "QB One", 9000)];
    const projectionRows = [
      proj("gsis:q1", "QB One", "QB", 20, 5),
      proj("gsis:offslate", "Off Slate Star", "QB", 99, 1),
    ];
    const { rows } = buildDfsSlateAnalysis({ dkRows, projectionRows, teams: [] });
    expect(rows[0].jkbSlatePositionRank).toBe(1);
  });

  it("returns null for a player with no matched projection", () => {
    const dkRows = [qb("q1", "Nobody Matches", 9000)];
    const { rows } = buildDfsSlateAnalysis({ dkRows, projectionRows: [], teams: [] });
    expect(rows[0].jkbSlatePositionRank).toBeNull();
    expect(rows[0].projectedFantasyPoints).toBeNull();
  });

  it("copies the canonical full-week positionRank unchanged, never recomputing it", () => {
    const dkRows = [qb("q1", "QB One", 9000)];
    const projectionRows = [proj("gsis:q1", "QB One", "QB", 20, 7)];
    const { rows } = buildDfsSlateAnalysis({ dkRows, projectionRows, teams: [] });
    expect(rows[0].jkbWeeklyPositionRank).toBe(7);
  });
});

describe("buildDfsSlateAnalysis — Rank Diff (positional)", () => {
  it("matches the +15 DK WR24 / JKB Slate WR9 example", () => {
    const dkRows: ValidatedDraftKingsNflClassicRow[] = [];
    const projectionRows: WeeklyFantasyProjectionProductionRow[] = [];
    const nonTargetValues = Array.from({ length: 24 }, (_, i) => 30 - i).filter((v) => v !== 22);

    for (let p = 1; p <= 24; p += 1) {
      const dkId = `wr${p}`;
      const name = `WR Player ${p}`;
      dkRows.push(buildDkRow({ dkId, name, position: "WR", rosterPosition: "WR/FLEX", salary: (25 - p) * 1000, teamAbbrev: "NO" }));
      const points = p === 24 ? 22 : nonTargetValues[p - 1];
      projectionRows.push(proj(`gsis:${dkId}`, name, "WR", points, p));
    }

    const { rows } = buildDfsSlateAnalysis({ dkRows, projectionRows, teams: [] });
    const target = rows.find((r) => r.dkId === "wr24") as DfsAnalyzerOffensiveRow;

    expect(target.dkPositionSalaryRank).toBe(24);
    expect(target.jkbSlatePositionRank).toBe(9);
    expect(target.posRankDiff).toBe(15);
  });

  it("is zero when DK salary rank and JKB slate rank agree", () => {
    const dkRows = [qb("q1", "QB One", 9000), qb("q2", "QB Two", 8000)];
    const projectionRows = [proj("gsis:q1", "QB One", "QB", 25, 1), proj("gsis:q2", "QB Two", "QB", 20, 2)];
    const { rows } = buildDfsSlateAnalysis({ dkRows, projectionRows, teams: [] });
    rows.forEach((row) => expect((row as DfsAnalyzerOffensiveRow).posRankDiff).toBe(0));
  });

  it("is negative when DraftKings prices a player more aggressively than JKB ranks him", () => {
    const dkRows = [qb("q1", "QB One", 9000), qb("q2", "QB Two", 8000)];
    // DK ranks q1 #1 by salary, but JKB slate-ranks q1 behind q2.
    const projectionRows = [proj("gsis:q1", "QB One", "QB", 15, 2), proj("gsis:q2", "QB Two", "QB", 25, 1)];
    const { rows } = buildDfsSlateAnalysis({ dkRows, projectionRows, teams: [] });
    const q1 = rows.find((r) => r.dkId === "q1") as DfsAnalyzerOffensiveRow;
    expect(q1.dkPositionSalaryRank).toBe(1);
    expect(q1.jkbSlatePositionRank).toBe(2);
    expect(q1.posRankDiff).toBe(-1);
  });

  it("is null when the player has no matched projection", () => {
    const dkRows = [qb("q1", "Nobody Matches", 9000)];
    const { rows } = buildDfsSlateAnalysis({ dkRows, projectionRows: [], teams: [] });
    expect((rows[0] as DfsAnalyzerOffensiveRow).posRankDiff).toBeNull();
  });
});

describe("buildDfsSlateAnalysis — overall ranks and Rank Diff", () => {
  it("computes a DK overall salary rank across offensive positions, excluding DST", () => {
    const dkRows = [
      qb("q1", "QB One", 10000),
      buildDkRow({ dkId: "r1", name: "RB One", position: "RB", rosterPosition: "RB/FLEX", salary: 9000, teamAbbrev: "NO" }),
      buildDkRow({ dkId: "w1", name: "WR One", position: "WR", rosterPosition: "WR/FLEX", salary: 8000, teamAbbrev: "NO" }),
      buildDkRow({ dkId: "dst1", name: "Saints", position: "DST", rosterPosition: "DST", salary: 20000, teamAbbrev: "NO" }),
    ];
    const { rows } = buildDfsSlateAnalysis({ dkRows, projectionRows: [], teams: [buildTeam({ id: "nfl-no", abbr: "no" })] });
    const byId = Object.fromEntries(rows.map((row) => [row.dkId, row]));

    // Overall salary order among offense only: q1 (10000) > r1 (9000) > w1 (8000), DST excluded entirely.
    expect(byId.q1.dkOverallSalaryRank).toBe(1);
    expect(byId.r1.dkOverallSalaryRank).toBe(2);
    expect(byId.w1.dkOverallSalaryRank).toBe(3);
    expect(byId.dst1.dkOverallSalaryRank).toBeNull();
  });

  it("computes a JKB overall slate projection rank across offensive positions, excluding DST", () => {
    const dkRows = [
      qb("q1", "QB One", 5000),
      buildDkRow({ dkId: "r1", name: "RB One", position: "RB", rosterPosition: "RB/FLEX", salary: 5000, teamAbbrev: "NO" }),
      buildDkRow({ dkId: "dst1", name: "Saints", position: "DST", rosterPosition: "DST", salary: 5000, teamAbbrev: "NO" }),
    ];
    const projectionRows = [proj("gsis:q1", "QB One", "QB", 30, 1), proj("gsis:r1", "RB One", "RB", 20, 1)];
    const { rows } = buildDfsSlateAnalysis({ dkRows, projectionRows, teams: [buildTeam({ id: "nfl-no", abbr: "no" })] });
    const byId = Object.fromEntries(rows.map((row) => [row.dkId, row]));

    expect(byId.q1.jkbOverallSlateProjectionRank).toBe(1);
    expect(byId.r1.jkbOverallSlateProjectionRank).toBe(2);
    expect(byId.dst1.jkbOverallSlateProjectionRank).toBeNull();
  });

  it("computes overallRankDiff with the same dkOverallSalaryRank minus jkbOverallSlateProjectionRank sign convention", () => {
    const dkRows = [
      qb("q1", "QB One", 5000),
      buildDkRow({ dkId: "r1", name: "RB One", position: "RB", rosterPosition: "RB/FLEX", salary: 9000, teamAbbrev: "NO" }),
    ];
    const projectionRows = [proj("gsis:q1", "QB One", "QB", 30, 1), proj("gsis:r1", "RB One", "RB", 10, 1)];
    const { rows } = buildDfsSlateAnalysis({ dkRows, projectionRows, teams: [] });
    const q1 = rows.find((r) => r.dkId === "q1") as DfsAnalyzerOffensiveRow;

    // q1: DK overall salary rank 2 (lower salary than r1), JKB overall rank 1 (higher projection).
    expect(q1.dkOverallSalaryRank).toBe(2);
    expect(q1.jkbOverallSlateProjectionRank).toBe(1);
    expect(q1.overallRankDiff).toBe(1);
  });
});

describe("buildDfsSlateAnalysis — points per $1K", () => {
  it("computes projectedFantasyPoints / salary * 1000 at full precision", () => {
    const dkRows = [qb("q1", "QB One", 8000)];
    const projectionRows = [proj("gsis:q1", "QB One", "QB", 20, 1)];
    const { rows } = buildDfsSlateAnalysis({ dkRows, projectionRows, teams: [] });
    expect((rows[0] as DfsAnalyzerOffensiveRow).pointsPer1k).toBe(2.5);
  });

  it("does not prematurely round a repeating decimal", () => {
    const dkRows = [qb("q1", "QB One", 3000)];
    const projectionRows = [proj("gsis:q1", "QB One", "QB", 10, 1)];
    const { rows } = buildDfsSlateAnalysis({ dkRows, projectionRows, teams: [] });
    const expected = (10 / 3000) * 1000;
    expect((rows[0] as DfsAnalyzerOffensiveRow).pointsPer1k).toBe(expected);
    expect((rows[0] as DfsAnalyzerOffensiveRow).pointsPer1k).not.toBe(3.33);
  });

  it("handles high and low salary examples", () => {
    const dkRows = [qb("q1", "High Salary", 15000), qb("q2", "Low Salary", 3000)];
    const projectionRows = [proj("gsis:q1", "High Salary", "QB", 30, 1), proj("gsis:q2", "Low Salary", "QB", 15, 2)];
    const { rows } = buildDfsSlateAnalysis({ dkRows, projectionRows, teams: [] });
    const byId = Object.fromEntries(rows.map((row) => [row.dkId, row as DfsAnalyzerOffensiveRow]));
    expect(byId.q1.pointsPer1k).toBe(2);
    expect(byId.q2.pointsPer1k).toBe(5);
  });

  it("is null when there is no matched projection", () => {
    const dkRows = [qb("q1", "Nobody Matches", 9000)];
    const { rows } = buildDfsSlateAnalysis({ dkRows, projectionRows: [], teams: [] });
    expect((rows[0] as DfsAnalyzerOffensiveRow).pointsPer1k).toBeNull();
  });

  it("is null for DST", () => {
    const dkRows = [buildDkRow({ dkId: "dst1", name: "Saints", position: "DST", rosterPosition: "DST", salary: 4000, teamAbbrev: "NO" })];
    const { rows } = buildDfsSlateAnalysis({ dkRows, projectionRows: [], teams: [buildTeam({ id: "nfl-no", abbr: "no" })] });
    expect(rows[0].pointsPer1k).toBeNull();
    expect(rows[0].projectedFantasyPoints).toBeNull();
  });
});

describe("buildDfsSlateAnalysis — DST", () => {
  it("never fabricates a DST projection, even when DST identity resolves", () => {
    const dkRows = [buildDkRow({ dkId: "dst1", name: "Saints", position: "DST", rosterPosition: "DST", salary: 4000, teamAbbrev: "NO" })];
    const { rows } = buildDfsSlateAnalysis({ dkRows, projectionRows: [], teams: [buildTeam({ id: "nfl-no", abbr: "no" })] });
    const dst = rows[0];
    expect(dst.identityStatus).toBe("resolved");
    expect(dst.projectedFantasyPoints).toBeNull();
    expect(dst.jkbSlatePositionRank).toBeNull();
    expect(dst.jkbWeeklyPositionRank).toBeNull();
    expect(dst.posRankDiff).toBeNull();
    expect(dst.pointsPer1k).toBeNull();
  });

  it("still computes a DK positional salary rank among other DST rows", () => {
    const dkRows = [
      buildDkRow({ dkId: "dst1", name: "Saints", position: "DST", rosterPosition: "DST", salary: 4000, teamAbbrev: "NO" }),
      buildDkRow({ dkId: "dst2", name: "Lions", position: "DST", rosterPosition: "DST", salary: 3000, teamAbbrev: "DET" }),
    ];
    const teams = [buildTeam({ id: "nfl-no", abbr: "no" }), buildTeam({ id: "nfl-det", abbr: "det" })];
    const { rows } = buildDfsSlateAnalysis({ dkRows, projectionRows: [], teams });
    const byId = Object.fromEntries(rows.map((row) => [row.dkId, row]));
    expect(byId.dst1.dkPositionSalaryRank).toBe(1);
    expect(byId.dst2.dkPositionSalaryRank).toBe(2);
  });
});

describe("buildDfsSlateAnalysis — duplicate canonical identity policy", () => {
  it("blocks JKB-dependent metrics for both rows in a duplicate canonical identity conflict, but keeps them traceable", () => {
    const dkRows = [qb("dup-a", "Shared Player", 9000), qb("dup-b", "Shared Player", 8000)];
    const projectionRows = [proj("gsis:shared", "Shared Player", "QB", 20, 1)];
    const { rows, summary } = buildDfsSlateAnalysis({ dkRows, projectionRows, teams: [] });
    const byId = Object.fromEntries(rows.map((row) => [row.dkId, row as DfsAnalyzerOffensiveRow]));

    expect(byId["dup-a"].identityConflict).toBe(true);
    expect(byId["dup-b"].identityConflict).toBe(true);
    expect(byId["dup-a"].playerId).toBe("gsis:shared");
    expect(byId["dup-b"].playerId).toBe("gsis:shared");
    expect(byId["dup-a"].projectedFantasyPoints).toBeNull();
    expect(byId["dup-b"].projectedFantasyPoints).toBeNull();
    expect(byId["dup-a"].jkbSlatePositionRank).toBeNull();
    expect(byId["dup-a"].posRankDiff).toBeNull();
    expect(byId["dup-a"].pointsPer1k).toBeNull();
    // DK salary rank is not blocked -- it is a DK-native metric, independent of the JKB match.
    expect(byId["dup-a"].dkPositionSalaryRank).toBe(1);
    expect(byId["dup-b"].dkPositionSalaryRank).toBe(2);
    expect(summary.duplicateCanonicalIdentityCount).toBe(1);
  });
});

describe("buildDfsSlateAnalysis — summary", () => {
  it("reports matched/unmatched counts, position/team/game counts, DST count, and conflicts", () => {
    const dkRows = [
      qb("q1", "QB One", 9000),
      qb("q2", "Nobody Matches", 8000),
      buildDkRow({ dkId: "dst1", name: "Saints", position: "DST", rosterPosition: "DST", salary: 4000, teamAbbrev: "NO" }),
    ];
    const projectionRows = [proj("gsis:q1", "QB One", "QB", 20, 1)];
    const teams = [buildTeam({ id: "nfl-no", abbr: "no" })];
    const { summary } = buildDfsSlateAnalysis({ dkRows, projectionRows, teams });

    expect(summary.totalUploadedRows).toBe(3);
    expect(summary.offensiveRows).toBe(2);
    expect(summary.dstRows).toBe(1);
    expect(summary.resolvedOffensivePlayers).toBe(1);
    expect(summary.unresolvedOffensivePlayers).toBe(1);
    expect(summary.rowsWithProjections).toBe(1);
    expect(summary.duplicateCanonicalIdentityCount).toBe(0);
    expect(summary.positionsPresent).toEqual(["DST", "QB"]);
    expect(summary.teamsPresent).toEqual(["NO"]);
    expect(summary.gamesPresent).toEqual(["NO@DET 09/13/2026 01:00PM ET"]);
  });
});

describe("buildDfsSlateAnalysis — determinism", () => {
  it("returns deep-equivalent output for equivalent input built twice", () => {
    const buildInput = () => ({
      dkRows: [qb("q1", "QB One", 9000), qb("q2", "QB Two", 8000)],
      projectionRows: [proj("gsis:q1", "QB One", "QB", 25, 1), proj("gsis:q2", "QB Two", "QB", 20, 2)],
      teams: [buildTeam({ id: "nfl-no", abbr: "no" })],
    });
    const first = buildDfsSlateAnalysis(buildInput());
    const second = buildDfsSlateAnalysis(buildInput());
    expect(second).toEqual(first);
  });
});

describe("buildDfsSlateAnalysis — boundary: consumes canonical contracts", () => {
  it("preserves scoring provenance as the canonical JKB Full PPR label, never a DK-specific one", () => {
    const dkRows = [qb("q1", "QB One", 9000)];
    const projectionRows = [proj("gsis:q1", "QB One", "QB", 25, 1)];
    const { rows } = buildDfsSlateAnalysis({ dkRows, projectionRows, teams: [] });
    expect((rows[0] as DfsAnalyzerOffensiveRow).projectionSource).toBe(DFS_PROJECTION_SOURCE);
    expect(DFS_PROJECTION_SOURCE).toBe("JKB Full PPR");
  });

  it("copies projectedFantasyPoints from the canonical row object, never recomputing a score", () => {
    const dkRows = [qb("q1", "QB One", 9000)];
    const projectionRow = proj("gsis:q1", "QB One", "QB", 25.375, 1);
    const { rows } = buildDfsSlateAnalysis({ dkRows, projectionRows: [projectionRow], teams: [] });
    expect((rows[0] as DfsAnalyzerOffensiveRow).projectedFantasyPoints).toBe(projectionRow.projectedFantasyPoints);
  });
});

// ---------------------------------------------------------------------------
// WU3: enrichDfsSlateAnalysis (research + compatibility layered on WU2 rows)
// ---------------------------------------------------------------------------

const WEEK1_GAME = buildGame({ gameId: "2026_01_NO_DET", season: 2026, week: 1, awayAbbr: "no", homeAbbr: "det" });

describe("enrichDfsSlateAnalysis — research attachment", () => {
  it("attaches the canonical research context to a resolved offensive row's playerId", () => {
    const dkRows = [qb("q1", "QB One", 9000, "NO")];
    const projectionRow = proj("gsis:q1", "QB One", "QB", 20, 1, "no");
    const analysis = buildDfsSlateAnalysis({ dkRows, projectionRows: [projectionRow], teams: [] });

    const context = buildResearchContext({ seasonPpg: buildMetric({ value: 18.4, rank: 2 }) });
    const researchArtifact = buildResearchArtifact({ season: 2026, week: 1, rows: [buildResearchRow({ playerId: "gsis:q1", position: "QB", context })] });
    const research = assessDfsResearch([projectionRow], researchArtifact, 2026, 1);
    const compatibility = assessDfsSlateCompatibility({
      dkRows, selectedSeason: 2026, selectedWeek: 1,
      projectionArtifact: buildProjectionArtifact({ season: 2026, week: 1 }),
      researchArtifact, canonicalGames: [WEEK1_GAME], offensiveIdentityResolutions: [],
    });

    const enriched = enrichDfsSlateAnalysis(analysis, research, compatibility);
    const row = enriched.rows.find((r) => r.dkId === "q1") as DfsEnrichedOffensiveRow;

    expect(row.research?.status).toBe("available");
    expect(row.research?.context).toBe(context);
  });

  it("keeps the core analyzer row intact when research is missing -- projection fields are unaffected", () => {
    const dkRows = [qb("q1", "QB One", 9000, "NO")];
    const projectionRow = proj("gsis:q1", "QB One", "QB", 20, 1, "no");
    const analysis = buildDfsSlateAnalysis({ dkRows, projectionRows: [projectionRow], teams: [] });

    const research = assessDfsResearch([projectionRow], null, 2026, 1);
    const compatibility = assessDfsSlateCompatibility({
      dkRows, selectedSeason: 2026, selectedWeek: 1,
      projectionArtifact: buildProjectionArtifact({ season: 2026, week: 1 }),
      canonicalGames: [WEEK1_GAME], offensiveIdentityResolutions: [],
    });

    const enriched = enrichDfsSlateAnalysis(analysis, research, compatibility);
    const row = enriched.rows.find((r) => r.dkId === "q1") as DfsEnrichedOffensiveRow;

    expect(row.research?.status).toBe("missing");
    expect(row.research?.context).toBeNull();
    expect(row.projectedFantasyPoints).toBe(20);
    expect(row.dkPositionSalaryRank).toBe(1);
  });

  it("is null for a player whose identity never resolved (no playerId to join on)", () => {
    const dkRows = [qb("q1", "Nobody Matches", 9000, "NO")];
    const analysis = buildDfsSlateAnalysis({ dkRows, projectionRows: [], teams: [] });
    const research = assessDfsResearch([], null, 2026, 1);
    const compatibility = assessDfsSlateCompatibility({
      dkRows, selectedSeason: 2026, selectedWeek: 1,
      projectionArtifact: buildProjectionArtifact({ season: 2026, week: 1 }),
      canonicalGames: [], offensiveIdentityResolutions: [],
    });

    const enriched = enrichDfsSlateAnalysis(analysis, research, compatibility);
    expect((enriched.rows[0] as DfsEnrichedOffensiveRow).research).toBeNull();
  });
});

describe("enrichDfsSlateAnalysis — opponent/game context", () => {
  it("resolves opponent and home/away from the matched canonical game", () => {
    const dkRows = [qb("q1", "QB One", 9000, "NO")];
    const analysis = buildDfsSlateAnalysis({ dkRows, projectionRows: [], teams: [] });
    const research = assessDfsResearch([], null, 2026, 1);
    const compatibility = assessDfsSlateCompatibility({
      dkRows, selectedSeason: 2026, selectedWeek: 1,
      projectionArtifact: buildProjectionArtifact({ season: 2026, week: 1 }),
      canonicalGames: [WEEK1_GAME], offensiveIdentityResolutions: [],
    });

    const enriched = enrichDfsSlateAnalysis(analysis, research, compatibility);
    const row = enriched.rows[0] as DfsEnrichedOffensiveRow;

    expect(row.opponent).toBe("det");
    expect(row.homeAway).toBe("away");
    expect(row.canonicalGameId).toBe("2026_01_NO_DET");
  });

  it("provides canonical opponent/game context for DST without inventing a projection", () => {
    const dkRows = [buildDkRow({ dkId: "dst1", position: "DST", name: "Saints", rosterPosition: "DST", salary: 4000, teamAbbrev: "NO" })];
    const analysis = buildDfsSlateAnalysis({ dkRows, projectionRows: [], teams: [buildTeam({ id: "nfl-no", abbr: "no" })] });
    const research = assessDfsResearch([], null, 2026, 1);
    const compatibility = assessDfsSlateCompatibility({
      dkRows, selectedSeason: 2026, selectedWeek: 1,
      projectionArtifact: buildProjectionArtifact({ season: 2026, week: 1 }),
      canonicalGames: [WEEK1_GAME], offensiveIdentityResolutions: [],
    });

    const enriched = enrichDfsSlateAnalysis(analysis, research, compatibility);
    const dst = enriched.rows[0] as DfsEnrichedDstRow;

    expect(dst.opponent).toBe("det");
    expect(dst.homeAway).toBe("away");
    expect(dst.research).toBeNull();
    expect(dst.projectedFantasyPoints).toBeNull();
  });
});

describe("enrichDfsSlateAnalysis — coverage summary and readiness passthrough", () => {
  it("computes projection and research coverage percentages and passes through readiness", () => {
    const dkRows = [qb("q1", "QB One", 9000, "NO"), qb("q2", "Nobody Matches", 8000, "NO")];
    const projectionRow = proj("gsis:q1", "QB One", "QB", 20, 1, "no");
    const analysis = buildDfsSlateAnalysis({ dkRows, projectionRows: [projectionRow], teams: [] });

    const researchArtifact = buildResearchArtifact({ season: 2026, week: 1, rows: [buildResearchRow({ playerId: "gsis:q1", position: "QB" })] });
    const research = assessDfsResearch([projectionRow], researchArtifact, 2026, 1);
    const compatibility = assessDfsSlateCompatibility({
      dkRows, selectedSeason: 2026, selectedWeek: 1,
      projectionArtifact: buildProjectionArtifact({ season: 2026, week: 1 }),
      researchArtifact, canonicalGames: [WEEK1_GAME], offensiveIdentityResolutions: [],
    });

    const enriched = enrichDfsSlateAnalysis(analysis, research, compatibility);

    expect(enriched.summary.projectionCoveragePct).toBe(50);
    expect(enriched.summary.rowsWithResearch).toBe(1);
    expect(enriched.summary.researchCoveragePct).toBe(100);
    expect(enriched.summary.matchedGames).toBe(1);
    expect(enriched.summary.unmatchedGames).toBe(0);
    expect(enriched.summary.readiness).toBe(compatibility.readiness);
  });
});

describe("enrichDfsSlateAnalysis — boundary: no recomputation", () => {
  it("copies research metrics from the canonical join, never recalculating them", () => {
    const dkRows = [qb("q1", "QB One", 9000, "NO")];
    const projectionRow = proj("gsis:q1", "QB One", "QB", 20, 1, "no");
    const analysis = buildDfsSlateAnalysis({ dkRows, projectionRows: [projectionRow], teams: [] });

    const context = buildResearchContext({ seasonPpg: buildMetric({ value: 22.75, rank: 1 }) });
    const researchArtifact = buildResearchArtifact({ season: 2026, week: 1, rows: [buildResearchRow({ playerId: "gsis:q1", position: "QB", context })] });
    const research = assessDfsResearch([projectionRow], researchArtifact, 2026, 1);
    const compatibility = assessDfsSlateCompatibility({
      dkRows, selectedSeason: 2026, selectedWeek: 1,
      projectionArtifact: buildProjectionArtifact({ season: 2026, week: 1 }),
      researchArtifact, canonicalGames: [WEEK1_GAME], offensiveIdentityResolutions: [],
    });

    const enriched = enrichDfsSlateAnalysis(analysis, research, compatibility);
    const row = enriched.rows[0] as DfsEnrichedOffensiveRow;
    expect(row.research?.context?.seasonPpg.value).toBe(22.75);
    expect(row.research?.context?.seasonPpg.value).toBe(context.seasonPpg.value);
  });
});

describe("enrichDfsSlateAnalysis — determinism", () => {
  it("returns deep-equivalent output for equivalent input built twice", () => {
    const buildEnriched = () => {
      const dkRows = [qb("q1", "QB One", 9000, "NO")];
      const projectionRow = proj("gsis:q1", "QB One", "QB", 20, 1, "no");
      const analysis = buildDfsSlateAnalysis({ dkRows, projectionRows: [projectionRow], teams: [] });
      const researchArtifact = buildResearchArtifact({ season: 2026, week: 1, rows: [buildResearchRow({ playerId: "gsis:q1", position: "QB" })] });
      const research = assessDfsResearch([projectionRow], researchArtifact, 2026, 1);
      const compatibility = assessDfsSlateCompatibility({
        dkRows, selectedSeason: 2026, selectedWeek: 1,
        projectionArtifact: buildProjectionArtifact({ season: 2026, week: 1 }),
        researchArtifact, canonicalGames: [WEEK1_GAME], offensiveIdentityResolutions: [],
        now: new Date("2026-09-10T05:00:00.000Z"),
      });
      return enrichDfsSlateAnalysis(analysis, research, compatibility);
    };
    expect(buildEnriched()).toEqual(buildEnriched());
  });
});
