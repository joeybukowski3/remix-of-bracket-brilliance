import { describe, expect, it } from "vitest";
import { buildPitcherLastFiveSummary, buildOpponentLastFiveGames } from "./mlb-strikeout-prop-details-core.mjs";

function start({ outsRecorded, strikeouts, isHome = null }) {
  return { outsRecorded, strikeouts, isHome };
}

describe("buildPitcherLastFiveSummary strikeoutsPerInning", () => {
  it("is total strikeouts / total outs across the starts, not an average of each start's own K/IP rate", () => {
    // Game A: 2 K over 3 outs (1 inning) -> 6.0 K/inning rate on its own.
    // Game B: 1 K over 24 outs (8 innings) -> 0.125 K/inning rate on its own.
    // Averaging the two per-game rates would give (6 + 0.125) / 2 = 3.0625.
    // The correct total/total rate is (2 + 1) / ((3 + 24) / 3) = 3 / 9 = 0.333...
    const summary = buildPitcherLastFiveSummary([
      start({ outsRecorded: 3, strikeouts: 2 }),
      start({ outsRecorded: 24, strikeouts: 1 }),
    ]);
    expect(summary.strikeoutsPerInning).toBeCloseTo(1 / 3, 5);
    expect(summary.strikeoutsPerInning).not.toBeCloseTo(3.0625, 1);
  });

  it("excludes a start with zero or missing outs from both the numerator and denominator instead of fabricating a rate", () => {
    const summary = buildPitcherLastFiveSummary([
      start({ outsRecorded: 15, strikeouts: 5 }),
      start({ outsRecorded: 0, strikeouts: 3 }),
      start({ outsRecorded: null, strikeouts: 2 }),
    ]);
    // Only the first (valid) start contributes: 5 K / 15 outs -> 1.0 K/inning.
    expect(summary.strikeoutsPerInning).toBe(1);
  });

  it("returns null (never NaN/Infinity/0) when every start is missing outs", () => {
    const summary = buildPitcherLastFiveSummary([
      start({ outsRecorded: null, strikeouts: 4 }),
      start({ outsRecorded: 0, strikeouts: 1 }),
    ]);
    expect(summary.strikeoutsPerInning).toBeNull();
  });

  it("returns null when there are no starts at all", () => {
    expect(buildPitcherLastFiveSummary([]).strikeoutsPerInning).toBeNull();
  });
});

describe("buildOpponentLastFiveGames home/away passthrough", () => {
  it("preserves isHome and derives the matching site label for each historical game", () => {
    const rows = buildOpponentLastFiveGames([
      { date: "2026-07-01", opponent: "BOS", isHome: true },
      { date: "2026-07-02", opponent: "NYY", isHome: false },
      { date: "2026-07-03", opponent: "TB", isHome: null },
    ]);
    expect(rows.map((row) => [row.isHome, row.site])).toEqual([
      [true, "home"],
      [false, "away"],
      [null, null],
    ]);
  });

  it("never fabricates a site when isHome is absent from the source game", () => {
    const [row] = buildOpponentLastFiveGames([{ date: "2026-07-01", opponent: "BOS" }]);
    expect(row.isHome).toBeNull();
    expect(row.site).toBeNull();
  });
});
