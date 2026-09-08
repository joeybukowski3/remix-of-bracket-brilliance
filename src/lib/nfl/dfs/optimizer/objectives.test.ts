import { describe, expect, it } from "vitest";
import { MINIMUM_OBJECTIVE_COVERAGE } from "@/lib/nfl/dfs/policies/lineupObjectivesV1";
import { normalizeCandidates } from "./features";
import { scoreDstCandidate, scoreOffensiveCandidate } from "./objectives";
import { buildOffensiveRow, type OffensiveFixture } from "./__fixtures__/optimizerRowFactory";

function score(fixtures: readonly OffensiveFixture[], strategy: "ceiling" | "floor" | "balanced") {
  const rows = fixtures.map(buildOffensiveRow);
  const normalized = normalizeCandidates(rows.map((row) => ({ row, projection: null })));
  return rows.map((row, index) => ({ dkId: row.dkId, ...scoreOffensiveCandidate(normalized[index], strategy) }));
}

const wr = (overrides: Partial<OffensiveFixture> & { dkId: string }): OffensiveFixture => ({
  position: "WR",
  team: "aaa",
  gameKey: "g1",
  salary: 5_000,
  projectedFantasyPoints: 12,
  airYardsPerGame: 60,
  targetShare: 0.2,
  targetsPerGame: 6,
  projectedTargets: 6,
  matchupScore: 0,
  ...overrides,
});

describe("scoreOffensiveCandidate", () => {
  it("scores every component on a 0-100 higher-is-better scale", () => {
    const [low, high] = score([wr({ dkId: "a", projectedFantasyPoints: 5 }), wr({ dkId: "b", projectedFantasyPoints: 25 })], "balanced");
    expect(low.score).toBeLessThan(high.score as number);
    const projection = high.components.find((entry) => entry.component === "jkbProjection");
    expect(projection?.normalized).toBe(100);
    expect(projection?.rawValue).toBe(25);
  });

  it("renormalizes the remaining weights when a component is unavailable, never zero-filling it", () => {
    const [withMatchup, withoutMatchup] = score(
      [wr({ dkId: "a" }), wr({ dkId: "b", researchAvailable: false })],
      "balanced",
    );
    // These fixtures carry no production projection row, so the 10% scoring
    // environment component is absent from both candidates.
    expect(withMatchup.missingComponents).toEqual(["scoringEnvironment"]);
    expect(withoutMatchup.missingComponents).toContain("matchup");
    // Balanced matchup weight is a further 10%, so 80% of the original survives.
    expect(withoutMatchup.componentCoverage).toBeCloseTo(0.8, 6);
    const projection = withoutMatchup.components.find((entry) => entry.component === "jkbProjection");
    expect(projection?.policyWeight).toBe(0.4);
    expect(projection?.effectiveWeight).toBeCloseTo(0.4 / 0.8, 6);
    // A zero-filled matchup would have dragged the score down; renormalization does not.
    expect(withoutMatchup.score).toBeGreaterThan(0);
  });

  it("withholds a strategy score below the minimum coverage threshold and says why", () => {
    // Missing scoring environment (10%) plus a missing DK benchmark (20%)
    // leaves exactly the 70% minimum, which is still scorable.
    const [entry] = score([wr({ dkId: "a", dkAvgPointsPerGame: null })], "balanced");
    expect(entry.componentCoverage).toBeCloseTo(MINIMUM_OBJECTIVE_COVERAGE, 6);
    expect(entry.scorable).toBe(true);

    // Dropping the 10% matchup component as well falls below the threshold.
    const [thin] = score([wr({ dkId: "a", dkAvgPointsPerGame: null, researchAvailable: false })], "balanced");
    expect(thin.componentCoverage).toBeLessThan(MINIMUM_OBJECTIVE_COVERAGE);
    expect(thin.scorable).toBe(false);
    expect(thin.score).toBeNull();
    expect(thin.unavailableReason).toMatch(/below the 70% minimum coverage/);
  });

  it("keeps the usage component available for QB from role certainty alone", () => {
    const rows = [
      { position: "QB" as const, dkId: "a", team: "aaa", gameKey: "g1", salary: 6_000, projectedFantasyPoints: 20, matchupScore: 10 },
    ];
    const [entry] = score(rows, "floor");
    const usage = entry.components.find((component) => component.component === "usageRole");
    expect(usage?.normalized).not.toBeNull();
    // QB publishes no explosive-play or workload evidence, so that 15% is dropped.
    expect(entry.missingComponents).toEqual(["workloadEvidence"]);
    expect(entry.componentCoverage).toBeCloseTo(0.85, 6);
    expect(entry.scorable).toBe(true);
  });

  it("treats an absent DK Avg PPG as missing rather than as a zero benchmark", () => {
    const [withBenchmark, withoutBenchmark] = score(
      [wr({ dkId: "a", dkAvgPointsPerGame: 18 }), wr({ dkId: "b", dkAvgPointsPerGame: null })],
      "balanced",
    );
    const benchmark = withoutBenchmark.components.find((entry) => entry.component === "dkBenchmark");
    expect(benchmark?.normalized).toBeNull();
    expect(benchmark?.effectiveWeight).toBe(0);
    expect(withBenchmark.componentCoverage).toBeCloseTo(0.9, 6);
    expect(withoutBenchmark.componentCoverage).toBeCloseTo(0.7, 6);
  });

  it("normalizes team-level scoring environment across distinct teams, not per player row", () => {
    const rows = [
      wr({ dkId: "a", team: "aaa" }),
      wr({ dkId: "b", team: "aaa" }),
      wr({ dkId: "c", team: "bbb" }),
    ].map(buildOffensiveRow);
    const projections = [
      { context: { scoringEnvironment: { marketContextAvailable: true, teamImpliedTotal: 30 } } },
      { context: { scoringEnvironment: { marketContextAvailable: true, teamImpliedTotal: 30 } } },
      { context: { scoringEnvironment: { marketContextAvailable: true, teamImpliedTotal: 18 } } },
    ];
    const normalized = normalizeCandidates(
      rows.map((row, index) => ({ row, projection: projections[index] as never })),
    );
    // Two distinct teams -> endpoints 100 and 0, unaffected by the duplicated team row.
    expect(normalized[0].percentile.impliedTeamTotal).toBe(100);
    expect(normalized[1].percentile.impliedTeamTotal).toBe(100);
    expect(normalized[2].percentile.impliedTeamTotal).toBe(0);
  });

  it("ranks role certainty so that a fragile role scores below a sourced primary role", () => {
    const entries = score(
      [
        wr({ dkId: "a", roleClass: "primary", roleCertainty: "sourced" }),
        wr({ dkId: "b", roleClass: "unknown", roleCertainty: "conflicting" }),
      ],
      "floor",
    );
    const usageOf = (dkId: string) =>
      entries.find((entry) => entry.dkId === dkId)?.components.find((c) => c.component === "usageRole")?.normalized ?? 0;
    expect(usageOf("a")).toBeGreaterThan(usageOf("b"));
  });
});

describe("scoreDstCandidate", () => {
  it("uses the WU6C matchup percentile and never invents a fantasy projection", () => {
    const entry = scoreDstCandidate(
      { dstMatchupScore: 71.5, dstMatchupPercentile: 88 } as never,
      "ceiling",
    );
    expect(entry.score).toBe(88);
    expect(entry.components[0].component).toBe("dstMatchup");
    expect(entry.components[0].label).toMatch(/matchup percentile/i);
    expect(entry.components[0].detail).toMatch(/never a fantasy-point projection/i);
    expect(entry.scorable).toBe(true);
  });

  it("scores DST identically for every strategy", () => {
    const matchup = { dstMatchupScore: 60, dstMatchupPercentile: 42 } as never;
    const scores = (["ceiling", "floor", "balanced"] as const).map((strategy) => scoreDstCandidate(matchup, strategy).score);
    expect(new Set(scores).size).toBe(1);
  });

  it("is unscorable when the WU6C context is unavailable", () => {
    const entry = scoreDstCandidate({ dstMatchupScore: null, dstMatchupPercentile: null } as never, "floor");
    expect(entry.scorable).toBe(false);
    expect(entry.score).toBeNull();
    expect(entry.unavailableReason).toMatch(/DST matchup context/);
  });
});
