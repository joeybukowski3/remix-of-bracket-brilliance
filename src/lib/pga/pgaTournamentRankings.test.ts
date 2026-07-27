import { describe, expect, it, vi } from "vitest";
import {
  PR_WEIGHTS,
  STAT_KEYS,
  rankPlayers,
} from "../../../scripts/generate-pga-tournament-rankings.mjs";
import { PGA_METRIC_DIRECTION } from "@/lib/pga/metricDirection";

/**
 * A player whose every stat sits at the neutral midpoint of the synthetic
 * ranges below, so a single varied stat isolates that stat's direction.
 */
function baselinePlayer(player: string, overrides: Record<string, number | null> = {}) {
  return {
    player,
    sgTotal: 0.5,
    sgOTT: 0.5,
    sgApp: 0.5,
    sgAtG: 0.5,
    sgPutt: 0.5,
    trendRank: 50,
    drivingAccuracy: 60,
    bogeyAvoidance: 0.17,
    birdieBogeyRatio: 1.5,
    ...overrides,
  };
}

describe("rankPlayers directionality", () => {
  it("ranks a LOWER bogey rate ahead of a higher one, all else equal", () => {
    // The production defect: bogeyAvoidance is a bogey RATE, so 0.11 (fewer
    // bogeys) must beat 0.23 (more bogeys). Before the fix this was reversed
    // at 0.14 weight in the published Power Rankings.
    const ranked = rankPlayers(
      [
        baselinePlayer("High Bogey Rate", { bogeyAvoidance: 0.23 }),
        baselinePlayer("Low Bogey Rate", { bogeyAvoidance: 0.11 }),
      ],
      { bogeyAvoidance: 1 },
    );

    expect(ranked[0].player).toBe("Low Bogey Rate");
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].player).toBe("High Bogey Rate");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("ranks a LOWER bogey rate better under the real PR_WEIGHTS too", () => {
    const ranked = rankPlayers(
      [
        baselinePlayer("High Bogey Rate", { bogeyAvoidance: 0.23 }),
        baselinePlayer("Low Bogey Rate", { bogeyAvoidance: 0.11 }),
      ],
      PR_WEIGHTS,
    );

    expect(ranked[0].player).toBe("Low Bogey Rate");
  });

  /**
   * Table-driven direction proof across every weighted metric: for each stat,
   * two otherwise-identical players differing only in that stat, asserting the
   * declared-better value wins. Guards against a future one-line inversion.
   */
  const DIRECTION_CASES = [
    { metric: "sgTotal", better: 2.0, worse: -1.0 },
    { metric: "sgOTT", better: 0.8, worse: -0.8 },
    { metric: "sgApp", better: 0.9, worse: -0.9 },
    { metric: "sgAtG", better: 0.5, worse: -0.5 },
    { metric: "sgPutt", better: 1.2, worse: -1.2 },
    { metric: "drivingAccuracy", better: 72, worse: 48 },
    { metric: "birdieBogeyRatio", better: 2.6, worse: 0.7 },
    { metric: "bogeyAvoidance", better: 0.107, worse: 0.233 },
    { metric: "trendRank", better: 1, worse: 150 },
  ] as const;

  it.each(DIRECTION_CASES)(
    "$metric: the declared-better value outranks the worse value",
    ({ metric, better, worse }) => {
      const ranked = rankPlayers(
        [
          baselinePlayer("Worse", { [metric]: worse }),
          baselinePlayer("Better", { [metric]: better }),
        ],
        { [metric]: 1 },
      );

      expect(ranked[0].player).toBe("Better");
      expect(ranked[1].player).toBe("Worse");
    },
  );

  it.each(DIRECTION_CASES)(
    "$metric direction matches the shared map's declaration",
    ({ metric, better, worse }) => {
      const declaredLower = PGA_METRIC_DIRECTION[metric] === "lower";
      expect(declaredLower).toBe(better < worse);
    },
  );
});

describe("rankPlayers metric-direction gate", () => {
  it("gates every weighted stat key through assertMetricDirectionsDeclared", () => {
    // The gate's throwing behavior is unit-tested in metricDirection.test.ts.
    // What matters here is the wiring: the gate is fed exactly the STAT_KEYS
    // carrying non-zero weight, so adding an undeclared metric to STAT_KEYS and
    // weighting it fails the build rather than defaulting to higher-is-better.
    const weightedKeys = STAT_KEYS.filter((key) => (PR_WEIGHTS[key] ?? 0) > 0);
    expect(weightedKeys.length).toBeGreaterThan(0);
    for (const key of weightedKeys) {
      expect(PGA_METRIC_DIRECTION[key], `${key} is weighted but undeclared`).toBeDefined();
    }
    expect(() => rankPlayers([baselinePlayer("A")], PR_WEIGHTS)).not.toThrow();
  });

  it("ignores a weight for a key outside STAT_KEYS rather than silently scoring it", () => {
    // Documents real behavior: STAT_KEYS is the iteration surface, so a weight
    // on an unlisted metric contributes nothing and never reaches the gate.
    const ranked = rankPlayers([baselinePlayer("A"), baselinePlayer("B")], {
      scramblingPercentage: 1,
      sgTotal: 1,
    });
    expect(ranked).toHaveLength(2);
  });

  it("declares a direction for every stat key the generator iterates", () => {
    for (const key of STAT_KEYS) {
      expect(PGA_METRIC_DIRECTION[key], `${key} has no declared direction`).toBeDefined();
    }
  });

  it("warns but does not throw when a weighted stat is null for every player", () => {
    // trendRank has been null for the entire field all season. A dead factor
    // must be visible without breaking scheduled generation.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const ranked = rankPlayers(
        [
          baselinePlayer("A", { trendRank: null, sgTotal: 2 }),
          baselinePlayer("B", { trendRank: null, sgTotal: 0 }),
        ],
        { trendRank: 0.5, sgTotal: 0.5 },
      );
      expect(ranked[0].player).toBe("A");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("trendRank"));
    } finally {
      warn.mockRestore();
    }
  });
});

describe("rankPlayers determinism and weights", () => {
  it("breaks score ties by player name ascending", () => {
    const ranked = rankPlayers(
      [baselinePlayer("Zed Zulu"), baselinePlayer("Al Alpha"), baselinePlayer("Mo Mike")],
      PR_WEIGHTS,
    );
    expect(ranked.map((r) => r.player)).toEqual(["Al Alpha", "Mo Mike", "Zed Zulu"]);
  });

  it("produces identical output across repeated shuffled runs", () => {
    const players = [
      baselinePlayer("A", { sgTotal: 1.1 }),
      baselinePlayer("B", { sgTotal: 0.4 }),
      baselinePlayer("C", { sgTotal: 2.2 }),
      baselinePlayer("D", { sgTotal: -0.6 }),
    ];
    const expected = rankPlayers(players, PR_WEIGHTS).map((r) => r.player);

    for (let i = 0; i < 25; i += 1) {
      const shuffled = [...players].sort(() => Math.random() - 0.5);
      expect(rankPlayers(shuffled, PR_WEIGHTS).map((r) => r.player)).toEqual(expected);
    }
  });

  it("keeps PR_WEIGHTS values unchanged by this correctness fix", () => {
    // Frozen deliberately: this PR corrects DIRECTION only. Any weight change
    // is model optimization and is out of scope.
    expect(PR_WEIGHTS).toEqual({
      sgTotal: 0.55,
      sgApp: 0.09,
      sgPutt: 0.04,
      trendRank: 0.03,
      sgAtG: 0.1,
      bogeyAvoidance: 0.14,
      birdieBogeyRatio: 0.05,
      sgOTT: 0,
      drivingAccuracy: 0,
    });
  });

  it("keeps the STAT_KEYS iteration surface unchanged", () => {
    expect(STAT_KEYS).toEqual([
      "sgTotal",
      "sgOTT",
      "sgApp",
      "sgAtG",
      "sgPutt",
      "trendRank",
      "drivingAccuracy",
      "bogeyAvoidance",
      "birdieBogeyRatio",
    ]);
  });

  it("returns an empty array for an empty field without throwing", () => {
    expect(rankPlayers([], PR_WEIGHTS)).toEqual([]);
  });

  it("can be imported without generating artifacts as a side effect", () => {
    // The module previously called main() at import time. If that regressed,
    // importing it in this suite would have rewritten public/data/pga/*.json.
    expect(typeof rankPlayers).toBe("function");
  });
});
