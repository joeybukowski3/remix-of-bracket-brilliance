import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { WeeklyFantasyProjectionProductionRow } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import { weeklyFantasyProjectionProductionArtifactSchema } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import { weeklyFantasyResearchArtifactSchema } from "@/lib/fantasy/weekly/researchArtifact";
import { assessDfsSlateCompatibility } from "@/lib/nfl/dfs/artifactCompatibility";
import { parseDraftKingsNflClassicCsv } from "@/lib/nfl/dfs/draftKingsCsv";
import { isDraftKingsOffensiveRow, resolveOffensiveIdentity } from "@/lib/nfl/dfs/identity";
import { attachDfsLineupContext, lineupContextSchema } from "@/lib/nfl/dfs/lineupContext";
import { NFL_CLASSIC_RULES } from "@/lib/nfl/dfs/nflClassicRules";
import { assessDfsResearch } from "@/lib/nfl/dfs/research";
import { buildDfsSlateAnalysis, enrichDfsSlateAnalysis } from "@/lib/nfl/dfs/slateAnalyzer";
import type { DfsEnrichedAnalyzerRow } from "@/lib/nfl/dfs/slateAnalyzer";
import { generateLineups } from "./generateLineups";
import { buildDstRow, buildOffensiveRow, type OffensiveFixture } from "./__fixtures__/optimizerRowFactory";

const ASOF = "2026-09-07T23:55:00Z";

/**
 * A slate whose only open decision is the fourth WR. Three interchangeable
 * candidates share salary and JKB projection, and each is strongest on a
 * different objective dimension, so the three strategies must diverge.
 */
function contestedSlate(): DfsEnrichedAnalyzerRow[] {
  const anchorDefaults = {
    matchupScore: 20,
    impliedTeamTotal: 22,
    airYardsPerGame: 55,
    targetShare: 0.2,
    targetsPerGame: 6,
    projectedTargets: 6,
    yardsPerCarry: 4.3,
    touchesTotal: 80,
    projectedCarries: 12,
    dkAvgPointsPerGame: 12,
    salary: 5_000,
    gameKey: "g1",
  } satisfies Partial<OffensiveFixture>;

  const anchors: OffensiveFixture[] = [
    { ...anchorDefaults, dkId: "a-qb", position: "QB", team: "aaa", projectedFantasyPoints: 22 },
    { ...anchorDefaults, dkId: "a-rb1", position: "RB", team: "aaa", projectedFantasyPoints: 18 },
    { ...anchorDefaults, dkId: "a-rb2", position: "RB", team: "bbb", projectedFantasyPoints: 17 },
    { ...anchorDefaults, dkId: "a-wr1", position: "WR", team: "aaa", projectedFantasyPoints: 20 },
    { ...anchorDefaults, dkId: "a-wr2", position: "WR", team: "bbb", projectedFantasyPoints: 19 },
    { ...anchorDefaults, dkId: "a-wr3", position: "WR", team: "ccc", projectedFantasyPoints: 18 },
    { ...anchorDefaults, dkId: "a-te", position: "TE", team: "aaa", projectedFantasyPoints: 14 },
  ];

  // Identical salary and projection; only the contextual dimensions differ.
  const contested: OffensiveFixture[] = [
    {
      ...anchorDefaults,
      dkId: "c-ceiling",
      position: "WR",
      team: "ddd",
      gameKey: "g2",
      projectedFantasyPoints: 10,
      matchupScore: 90,
      impliedTeamTotal: 31,
      airYardsPerGame: 120,
      targetShare: 0.34,
      targetsPerGame: 2,
      projectedTargets: 2,
      dkAvgPointsPerGame: 4,
      roleClass: "secondary",
      roleCertainty: "inferred",
    },
    {
      ...anchorDefaults,
      dkId: "c-floor",
      position: "WR",
      team: "eee",
      gameKey: "g2",
      projectedFantasyPoints: 10,
      matchupScore: -90,
      impliedTeamTotal: 16,
      airYardsPerGame: 20,
      targetShare: 0.1,
      targetsPerGame: 11,
      projectedTargets: 11,
      dkAvgPointsPerGame: 9,
      roleClass: "primary",
      roleCertainty: "sourced",
    },
    {
      ...anchorDefaults,
      dkId: "c-balanced",
      position: "WR",
      team: "fff",
      gameKey: "g2",
      projectedFantasyPoints: 10,
      matchupScore: 0,
      impliedTeamTotal: 23,
      airYardsPerGame: 60,
      targetShare: 0.2,
      targetsPerGame: 6,
      projectedTargets: 6,
      dkAvgPointsPerGame: 24,
      roleClass: "committee",
      roleCertainty: "sourced",
    },
  ];

  return [
    ...[...anchors, ...contested].map(buildOffensiveRow),
    buildDstRow({ dkId: "d-1", team: "zzz", gameKey: "g2", salary: 3_000, percentile: 95 }),
    buildDstRow({ dkId: "d-2", team: "yyy", gameKey: "g1", salary: 3_000, percentile: 10 }),
  ];
}

function projectionsFor(rows: readonly DfsEnrichedAnalyzerRow[], totals: Record<string, number>) {
  return rows
    .filter((row) => row.kind === "offense")
    .map((row) => ({
      playerId: "gsis:" + row.dkId,
      context: {
        scoringEnvironment: {
          marketContextAvailable: true,
          teamImpliedTotal: totals[row.dkId] ?? 22,
          leagueAverageImpliedTeamTotal: 22,
          impliedTotalDelta: 0,
        },
      },
    })) as unknown as WeeklyFantasyProjectionProductionRow[];
}

const IMPLIED_TOTALS: Record<string, number> = { "c-ceiling": 31, "c-floor": 16, "c-balanced": 23 };

function generate(rows: DfsEnrichedAnalyzerRow[]) {
  return generateLineups({ rows, projectionRows: projectionsFor(rows, IMPLIED_TOTALS), asOf: ASOF, now: () => 0 });
}

function pickedContested(set: ReturnType<typeof generate>, strategy: string): string | undefined {
  const lineup = set.lineups.find((entry) => entry.strategy === strategy);
  return lineup?.slots.map((slot) => slot.dkId).find((dkId) => dkId.startsWith("c-"));
}

describe("generateLineups strategy behaviour", () => {
  it("produces all three preset lineups with a legal roster shape", () => {
    const set = generate(contestedSlate());
    expect(set.status).toBe("ready");
    expect(set.lineups.map((lineup) => lineup.strategy)).toEqual(["ceiling", "floor", "balanced"]);
    set.lineups.forEach((lineup) => {
      expect(lineup.slots.map((slot) => slot.slot)).toEqual(["QB", "RB1", "RB2", "WR1", "WR2", "WR3", "TE", "FLEX", "DST"]);
      expect(lineup.constraintStatus.salaryWithinCap).toBe(true);
      expect(lineup.constraintStatus.uniqueDkIds).toBe(true);
      expect(lineup.constraintStatus.minimumGamesSatisfied).toBe(true);
      expect(lineup.constraintStatus.allOffenseOptimizerEligible).toBe(true);
      expect(lineup.constraintStatus.dstContextUsable).toBe(true);
      expect(lineup.constraintStatus.allFromUploadedSlate).toBe(true);
    });
  });

  it("sends the ceiling strategy to the best scoring environment, matchup and upside evidence", () => {
    expect(pickedContested(generate(contestedSlate()), "ceiling")).toBe("c-ceiling");
  });

  it("sends the floor strategy to the strongest usage, role and workload evidence", () => {
    expect(pickedContested(generate(contestedSlate()), "floor")).toBe("c-floor");
  });

  it("sends the balanced strategy to the best blend, led by the DK Avg PPG benchmark", () => {
    expect(pickedContested(generate(contestedSlate()), "balanced")).toBe("c-balanced");
  });

  it("never presents a nine-player JKB total and never projects DST fantasy points", () => {
    const set = generate(contestedSlate());
    set.lineups.forEach((lineup) => {
      expect(lineup.jkbOffensePlayerCount).toBe(8);
      const dst = lineup.slots.find((slot) => slot.position === "DST");
      expect(dst?.projectedFantasyPoints).toBeNull();
      expect(dst?.strategyScore.components[0].component).toBe("dstMatchup");
      const offenseSum = lineup.slots
        .filter((slot) => slot.position !== "DST")
        .reduce((sum, slot) => sum + (slot.projectedFantasyPoints as number), 0);
      expect(lineup.jkbOffenseProjectionSubtotal).toBeCloseTo(offenseSum, 6);
    });
  });

  it("lets the DST matchup percentile decide the DST slot for every strategy", () => {
    const set = generate(contestedSlate());
    set.lineups.forEach((lineup) => {
      expect(lineup.slots.find((slot) => slot.position === "DST")?.dkId).toBe("d-1");
    });
  });

  it("excludes a DST with no usable WU6C context and says so", () => {
    const rows = contestedSlate().map((row) =>
      row.kind === "dst" && row.dkId === "d-1"
        ? { ...row, dstMatchup: { ...row.dstMatchup!, dstMatchupScore: null, dstMatchupPercentile: null, status: "unavailable" as const } }
        : row,
    );
    const set = generate(rows);
    expect(set.warnings.join(" ")).toMatch(/no usable WU6C matchup context/);
    set.lineups.forEach((lineup) => expect(lineup.slots.find((slot) => slot.position === "DST")?.dkId).toBe("d-2"));
  });

  it("never selects a player who is not optimizer-eligible", () => {
    const rows = contestedSlate().map((row) =>
      row.kind === "offense" && row.dkId === "a-wr1"
        ? { ...row, optimizerEligibility: "ineligible" as const }
        : row,
    );
    const set = generate(rows);
    set.lineups.forEach((lineup) => expect(lineup.slots.map((slot) => slot.dkId)).not.toContain("a-wr1"));
    // The board itself is untouched: the row is still present in the input.
    expect(rows.some((row) => row.dkId === "a-wr1")).toBe(true);
  });

  it("reports infeasible with reasons rather than silently loosening a constraint", () => {
    const rows = contestedSlate().filter((row) => row.position !== "TE");
    const set = generate(rows);
    expect(set.status).toBe("unavailable");
    expect(set.lineups).toHaveLength(0);
    expect(set.infeasible).toHaveLength(3);
    expect(set.infeasible[0].reasons.join(" ")).toMatch(/eligible TE candidate/);
  });

  it("is deterministic across repeated runs and input orderings", () => {
    const rows = contestedSlate();
    const first = generate(rows);
    const second = generate([...rows].reverse());
    const shape = (set: typeof first) => set.lineups.map((lineup) => lineup.slots.map((slot) => slot.dkId));
    expect(shape(second)).toEqual(shape(first));
    expect(second.lineups.map((lineup) => lineup.objectiveScore)).toEqual(first.lineups.map((lineup) => lineup.objectiveScore));
  });

  it("allows two strategies to agree without forcing artificial diversity", () => {
    // Strip every dimension the strategies disagree on: all three must converge.
    const rows = contestedSlate().filter((row) => !row.dkId.startsWith("c-") || row.dkId === "c-balanced");
    const set = generate(rows);
    expect(set.status).toBe("ready");
    const shapes = set.lineups.map((lineup) => lineup.slots.map((slot) => slot.dkId).sort().join(","));
    expect(new Set(shapes).size).toBe(1);
  });

  it("reads the salary cap from the canonical rules contract", () => {
    const set = generate(contestedSlate());
    expect(set.salaryCap).toBe(NFL_CLASSIC_RULES.salaryCap);
    expect(set.rulesVersion).toBe(NFL_CLASSIC_RULES.version);
    set.lineups.forEach((lineup) => {
      expect(lineup.salaryCap).toBe(NFL_CLASSIC_RULES.salaryCap);
      expect(lineup.salaryUsed + lineup.salaryRemaining).toBe(NFL_CLASSIC_RULES.salaryCap);
    });
  });
});

describe("generateLineups on the real Week 1 slate fixture", () => {
  const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
  const projectionArtifact = weeklyFantasyProjectionProductionArtifactSchema.parse(
    read("public/data/fantasy/projections/2026/week-01.json"),
  );
  const researchArtifact = weeklyFantasyResearchArtifactSchema.parse(
    read("public/data/fantasy/weekly-research/2026/week-01.json"),
  );
  const projections = Object.values(projectionArtifact.rows).flat();
  const teams = read("public/data/nfl/teams.json").teams;
  const games = read("public/data/nfl/2026/games.json").games;
  const dkRows = parseDraftKingsNflClassicCsv(
    readFileSync("src/lib/nfl/dfs/__fixtures__/draftkings-nfl-classic-week1-2026.csv", "utf8"),
  ).rows;

  // The lineup-context artifact is a FROZEN fixture whose newest embedded
  // source timestamp is 2026-09-09T16:35Z; FIXTURE_ASOF sits just after that
  // (and after the artifact's generatedAt), so every 48h freshness window in
  // optimizerEligibilityV1 / dstMatchupV1 is satisfied. Every clock in this
  // block is a fixed string relative to that frozen artifact -- no reliance
  // on `new Date()` -- so this test stays deterministic in 2027+. Using the
  // live public/data/nfl/dfs/2026/week-01.json here instead would make the
  // test pass vacuously once the calendar moves past its 48h windows.
  const FIXTURE_ASOF = "2026-09-10T09:00:00Z";

  const analysis = attachDfsLineupContext(
    enrichDfsSlateAnalysis(
      buildDfsSlateAnalysis({ dkRows, projectionRows: projections, teams }),
      assessDfsResearch(projections, researchArtifact, 2026, 1),
      assessDfsSlateCompatibility({
        dkRows,
        projectionArtifact,
        researchArtifact,
        selectedSeason: 2026,
        selectedWeek: 1,
        canonicalGames: games,
        now: FIXTURE_ASOF,
        offensiveIdentityResolutions: dkRows
          .filter(isDraftKingsOffensiveRow)
          .map((row) => resolveOffensiveIdentity(row, projections)),
      }),
    ),
    lineupContextSchema.parse(read("src/lib/nfl/dfs/__fixtures__/real/lineup-context-2026-week1.json")),
    { season: 2026, week: 1, asOf: FIXTURE_ASOF },
  );

  it("does not mutate the enriched slate it was given", () => {
    const snapshot = JSON.stringify(analysis.rows);
    generateLineups({ rows: analysis.rows, projectionRows: projections, asOf: FIXTURE_ASOF, now: () => 0 });
    expect(JSON.stringify(analysis.rows)).toBe(snapshot);
  });

  it("builds all three presets within the canonical rules (READY path)", () => {
    const set = generateLineups({ rows: analysis.rows, projectionRows: projections, asOf: FIXTURE_ASOF, now: () => 0 });

    expect(set.status).toBe("ready");
    expect(set.infeasible).toHaveLength(0);
    expect(set.lineups).toHaveLength(3);
    expect(set.lineups.map((lineup) => lineup.strategy).sort()).toEqual(["balanced", "ceiling", "floor"]);
    expect(set.candidatePool.offenseEligible).toBeGreaterThan(0);
    expect(set.candidatePool.dstWithUsableContext).toBeGreaterThan(0);
    expect(set.candidatePool.dstWithoutUsableContext).toBe(0);

    set.lineups.forEach((lineup) => {
      expect(lineup.slots).toHaveLength(9);
      expect(lineup.salaryUsed).toBeLessThanOrEqual(NFL_CLASSIC_RULES.salaryCap);
      expect(lineup.constraintStatus.minimumGamesSatisfied).toBe(true);
      expect(lineup.constraintStatus.allOffenseOptimizerEligible).toBe(true);
      expect(lineup.constraintStatus.allOffenseInDfsPool).toBe(true);
      expect(lineup.constraintStatus.dstContextUsable).toBe(true);
      expect(lineup.constraintStatus.allFromUploadedSlate).toBe(true);
    });
  });
});
