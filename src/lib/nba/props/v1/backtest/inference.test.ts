import { describe, expect, it } from "vitest";
import { robustDifference, tCritical95 } from "./inference";

describe("tCritical95", () => {
  it("matches Student-t tables and approaches the normal value", () => {
    expect(tCritical95(12)).toBeCloseTo(2.179, 2);
    expect(tCritical95(25)).toBeCloseTo(2.06, 2);
    expect(tCritical95(1000)).toBeCloseTo(1.962, 2);
    expect(tCritical95(25)).toBeGreaterThan(1.96);
    expect(Number.isNaN(tCritical95(0))).toBe(true);
  });
});

const item = (day: number, playerId: string, candidate: number, benchmark: number) => ({ gameDate: `2025-12-${String(day).padStart(2, "0")}`, playerId, candidate, benchmark });

describe("robustDifference", () => {
  it("returns the mean paired difference with an interval around it", () => {
    const items = Array.from({ length: 120 }, (_, i) => item(1 + (i % 28), `p${i % 12}`, 1 + (i % 3) * 0.1, 2 + (i % 5) * 0.1));
    const d = robustDifference(items);
    expect(d.n).toBe(120);
    expect(d.meanDiff).toBeLessThan(0);
    expect(d.ci95?.[0]).toBeLessThan(d.meanDiff as number);
    expect(d.ci95?.[1]).toBeGreaterThan(d.meanDiff as number);
  });

  it("uses the wider of the player and week clusterings, and a t critical value", () => {
    // Every player keeps the same sign of difference, so player clustering is far wider than week clustering.
    const items = Array.from({ length: 160 }, (_, i) => item(1 + (i % 28), `p${i % 8}`, (i % 8) - 3.5 > 0 ? 3 : 1, 2));
    const d = robustDifference(items);
    expect(d.clusteredBy).toBe("player");
    expect(d.playerClusters).toBe(8);
    expect(d.clusters).toBe(8);
    const half = ((d.ci95 as [number, number])[1] - (d.ci95 as [number, number])[0]) / 2;
    expect(half / (d.se as number)).toBeCloseTo(tCritical95(7), 6);
  });

  it("gives no interval when there are too few clusters to estimate one", () => {
    const one = robustDifference([item(1, "p1", 1, 2), item(2, "p1", 1, 2), item(3, "p1", 2, 2)]);
    expect(one.ci95).toBeNull();
    expect(one.meanDiff).toBeCloseTo(-2 / 3, 12);
    expect(robustDifference([])).toMatchObject({ n: 0, meanDiff: null, ci95: null });
  });
});
