import { describe, it, expect } from "vitest";
import {
  evaluateSinCityHitter,
  getSinCityResults,
  classifyWind,
  SIN_CITY_THRESHOLDS as T,
  SIN_CITY_FALLBACK_COUNT,
  type SinCityInput,
} from "./mlbHrFilter";

// ─── classifyWind — retained for display context ──────────────────────────────

describe("classifyWind", () => {
  it("returns out for wind pointing toward CF", () => {
    expect(classifyWind("Wrigley Field", "Open", "NE", 15)).toBe("out");
  });
  it("returns in for wind pointing toward home plate", () => {
    expect(classifyWind("Wrigley Field", "Open", "SW", 15)).toBe("in");
  });
  it("returns cross for perpendicular wind", () => {
    expect(classifyWind("Wrigley Field", "Open", "SE", 12)).toBe("cross");
  });
  it("returns calm for low wind speed", () => {
    expect(classifyWind("Wrigley Field", "Open", "NE", 2)).toBe("calm");
    expect(classifyWind("Wrigley Field", "Open", "SW", null)).toBe("calm");
  });
  it("returns unknown for dome", () => {
    expect(classifyWind("Tropicana Field", "Dome", "N", 20)).toBe("unknown");
  });
  it("returns unknown for closed retractable roof", () => {
    expect(classifyWind("Chase Field", "Retractable", "N", 20)).toBe("unknown");
  });
  it("returns out for open retractable roof", () => {
    expect(classifyWind("Chase Field", "Open", "N", 12)).toBe("out");
  });
  it("returns unknown for unmapped stadium", () => {
    expect(classifyWind("Mystery Park", "Open", "N", 15)).toBe("unknown");
  });
});

// ─── Sin City — evaluateSinCityHitter ────────────────────────────────────────

describe("evaluateSinCityHitter", () => {
  const PERFECT: SinCityInput = {
    barrelRate:  14,
    pullAirRate: 22,
    hardHitRate: 48,
    exitVelo:    94,
  };

  // 1. All 4 criteria pass
  it("passes all 4 criteria", () => {
    const r = evaluateSinCityHitter(PERFECT);
    expect(r.matchCount).toBe(4);
    expect(r.qualifies).toBe(true);
    expect(r.criteria.every(c => c.pass)).toBe(true);
    expect(r.totalShortfall).toBe(0);
  });

  // 2. Exactly 3 of 4 pass
  it("passes exactly 3 of 4 (barrel misses)", () => {
    const r = evaluateSinCityHitter({ ...PERFECT, barrelRate: 10 }); // below 12
    expect(r.matchCount).toBe(3);
    expect(r.qualifies).toBe(true);
    expect(r.criteria.find(c => c.name === "Barrel%")!.pass).toBe(false);
  });

  // 3. Only 2 of 4 pass
  it("fails with only 2 of 4", () => {
    const r = evaluateSinCityHitter({ ...PERFECT, barrelRate: 5, pullAirRate: 10 });
    expect(r.matchCount).toBe(2);
    expect(r.qualifies).toBe(false);
  });

  // 4. Exactly at threshold — should pass
  it("passes when barrel = exactly 12", () => {
    const r = evaluateSinCityHitter({ ...PERFECT, barrelRate: T.barrelRate });
    expect(r.criteria.find(c => c.name === "Barrel%")!.pass).toBe(true);
  });
  it("passes when pullAir = exactly 20", () => {
    const r = evaluateSinCityHitter({ ...PERFECT, pullAirRate: T.pullAirRate });
    expect(r.criteria.find(c => c.name === "Pull Air%")!.pass).toBe(true);
  });
  it("passes when hardHit = exactly 45", () => {
    const r = evaluateSinCityHitter({ ...PERFECT, hardHitRate: T.hardHitRate });
    expect(r.criteria.find(c => c.name === "Hard Hit%")!.pass).toBe(true);
  });
  it("passes when exitVelo = exactly 92", () => {
    const r = evaluateSinCityHitter({ ...PERFECT, exitVelo: T.exitVelo });
    expect(r.criteria.find(c => c.name === "Exit Velo")!.pass).toBe(true);
  });

  // 5. Just below threshold — should fail
  it("fails when barrel = 11.9 (just below 12)", () => {
    const r = evaluateSinCityHitter({ ...PERFECT, barrelRate: 11.9 });
    expect(r.criteria.find(c => c.name === "Barrel%")!.pass).toBe(false);
  });
  it("fails when pullAir = 19.9 (just below 20)", () => {
    const r = evaluateSinCityHitter({ ...PERFECT, pullAirRate: 19.9 });
    expect(r.criteria.find(c => c.name === "Pull Air%")!.pass).toBe(false);
  });
  it("fails when hardHit = 44.9 (just below 45)", () => {
    const r = evaluateSinCityHitter({ ...PERFECT, hardHitRate: 44.9 });
    expect(r.criteria.find(c => c.name === "Hard Hit%")!.pass).toBe(false);
  });
  it("fails when exitVelo = 91.9 (just below 92)", () => {
    const r = evaluateSinCityHitter({ ...PERFECT, exitVelo: 91.9 });
    expect(r.criteria.find(c => c.name === "Exit Velo")!.pass).toBe(false);
  });

  // 6. Percentage normalization — display scale only (12.8 = 12.8%)
  it("treats barrelRate=12.8 as 12.8% (passes threshold of 12)", () => {
    const r = evaluateSinCityHitter({ ...PERFECT, barrelRate: 12.8 });
    expect(r.criteria.find(c => c.name === "Barrel%")!.pass).toBe(true);
  });
  it("treats barrelRate=0.128 as 0.128% (fails threshold of 12)", () => {
    const r = evaluateSinCityHitter({ ...PERFECT, barrelRate: 0.128 });
    expect(r.criteria.find(c => c.name === "Barrel%")!.pass).toBe(false);
  });

  // 7. Missing metric values
  it("treats null barrelRate as not passing with shortfall=1", () => {
    const r = evaluateSinCityHitter({ ...PERFECT, barrelRate: null });
    const c = r.criteria.find(c => c.name === "Barrel%")!;
    expect(c.pass).toBe(false);
    expect(c.shortfall).toBe(1);
  });
  it("treats undefined exitVelo as not passing with shortfall=1", () => {
    const r = evaluateSinCityHitter({ ...PERFECT, exitVelo: undefined });
    const c = r.criteria.find(c => c.name === "Exit Velo")!;
    expect(c.pass).toBe(false);
    expect(c.shortfall).toBe(1);
  });
  it("all null — matchCount 0, qualifies false", () => {
    const r = evaluateSinCityHitter({ barrelRate: null, pullAirRate: null, hardHitRate: null, exitVelo: null });
    expect(r.matchCount).toBe(0);
    expect(r.qualifies).toBe(false);
    expect(r.totalShortfall).toBe(4); // 4 criteria × shortfall 1 each
  });

  // Normalized shortfall calculation check
  it("computes correct barrel shortfall for barrelRate=6 (50% below threshold)", () => {
    const r = evaluateSinCityHitter({ ...PERFECT, barrelRate: 6 });
    const c = r.criteria.find(c => c.name === "Barrel%")!;
    // shortfall = (12 - 6) / 12 = 0.5
    expect(c.shortfall).toBeCloseTo(0.5, 5);
  });
  it("shortfall is 0 for passing criteria", () => {
    const r = evaluateSinCityHitter(PERFECT);
    expect(r.criteria.every(c => c.shortfall === 0)).toBe(true);
  });
});

// ─── Sin City — getSinCityResults ─────────────────────────────────────────────

type MockBatter = {
  player: string;
  hrScore: number;
  barrelRate: number | null;
  pullRate: number | null;
  hardHitRate: number | null;
  exitVelo: number | null;
  gameKey: string;
};

function make(
  player: string,
  hrScore: number,
  barrel: number | null,
  pull: number | null,
  hh: number | null,
  ev: number | null,
  gameKey = "A@B",
): MockBatter {
  return { player, hrScore, barrelRate: barrel, pullRate: pull, hardHitRate: hh, exitVelo: ev, gameKey };
}

describe("getSinCityResults", () => {
  const P44 = make("Aaron 4/4",   80, 14, 22, 48, 94); // 4/4
  const P34A = make("Brett 3/4A", 75, 14, 22, 48, 88); // 3/4 (ev misses)
  const P34B = make("Carl 3/4B",  70, 14, 22, 48, 88); // 3/4, lower hrScore
  const P24 = make("Dave 2/4",    85, 6,  10, 48, 94); // 2/4 (barrel+pull miss, high score)
  const P14 = make("Eve 1/4",     60, 6,  10, 40, 88); // 1/4

  // 8. 4/4 sorts above 3/4
  it("places 4/4 hitter above 3/4 hitters", () => {
    const { rows, isFallback } = getSinCityResults([P34A, P44]);
    expect(isFallback).toBe(false);
    expect(rows[0].batter.player).toBe("Aaron 4/4");
  });

  // 9. HR Score sorting within same match count
  it("sorts by hrScore within the same match count", () => {
    const { rows } = getSinCityResults([P34B, P34A]);
    expect(rows[0].batter.player).toBe("Brett 3/4A"); // hrScore 75 > 70
  });

  // 10. No qualifiers triggers exactly 5 fallback rows
  it("returns exactly 5 closest matches when no qualifiers exist", () => {
    const nonQualifiers = [
      make("A", 80, 6,  10, 40, 88),
      make("B", 79, 7,  10, 40, 88),
      make("C", 78, 8,  10, 40, 88),
      make("D", 77, 9,  10, 40, 88),
      make("E", 76, 6,  10, 40, 88),
      make("F", 75, 5,  10, 40, 88),
    ];
    const { rows, isFallback } = getSinCityResults(nonQualifiers);
    expect(isFallback).toBe(true);
    expect(rows.length).toBe(SIN_CITY_FALLBACK_COUNT);
    expect(rows.every(r => r.isFallback)).toBe(true);
  });

  // 11. Fewer than 5 available — return all
  it("returns all rows when fewer than 5 available and none qualify", () => {
    const { rows, isFallback } = getSinCityResults([P24, P14]);
    expect(isFallback).toBe(true);
    expect(rows.length).toBe(2);
  });

  // 12. Normalized-shortfall ordering (closer to threshold = lower shortfall = ranked higher)
  it("ranks closer-to-threshold batter above further-off batter in fallback", () => {
    // Both 2/4. A is closer on barrel (11 vs threshold 12 = shortfall 1/12 ≈ 0.083)
    // B is further (6 vs threshold 12 = shortfall 6/12 = 0.5)
    const closer = make("Closer", 70, 11, 10, 40, 88); // barrel 11 vs 12 (small miss)
    const further = make("Further", 70, 6,  10, 40, 88); // barrel 6 vs 12 (big miss)
    const { rows } = getSinCityResults([further, closer]);
    expect(rows[0].batter.player).toBe("Closer");
  });

  // 13. Search applied before qualification (caller responsibility — test demonstrates)
  it("only evaluates batters in the input list (search/game filter already applied)", () => {
    const filtered = [P44]; // simulate search already done
    const { rows } = getSinCityResults(filtered);
    expect(rows.length).toBe(1);
    expect(rows[0].batter.player).toBe("Aaron 4/4");
  });

  // 14. Game filtering applied before qualification — caller passes filtered list
  it("game filter subset: only batters for that game are evaluated", () => {
    const gameABatters = [P44, P34A].map(b => ({ ...b, gameKey: "A@B" }));
    const gameCBatters = [make("X 2/4", 90, 6, 22, 48, 94, "C@D")];
    const forGameAB = [...gameABatters]; // simulate game filter already applied
    const { rows } = getSinCityResults(forGameAB);
    expect(rows.every(r => r.batter.gameKey === "A@B")).toBe(true);
    expect(rows.find(r => r.batter.player === "X 2/4")).toBeUndefined();
    void gameCBatters; // referenced to avoid unused var
  });

  // 15. True empty state — empty input returns empty output
  it("returns empty rows when input list is empty", () => {
    const { rows, isFallback } = getSinCityResults([]);
    expect(rows).toHaveLength(0);
    expect(isFallback).toBe(true); // no qualifiers in empty set
  });

  // 16. Displayed count matches visible results
  it("row count matches evaluation: all 4/4 and 3/4 shown, 2/4 excluded", () => {
    const batters = [P44, P34A, P34B, P24, P14];
    const { rows, isFallback } = getSinCityResults(batters);
    expect(isFallback).toBe(false);
    // Only 4/4 (1) and 3/4 (2) qualify
    expect(rows.length).toBe(3);
    expect(rows.every(r => r.evaluation.matchCount >= 3)).toBe(true);
  });

  // isFallback flag per-row
  it("fallback rows are labelled isFallback=true", () => {
    const { rows, isFallback } = getSinCityResults([P24, P14]);
    expect(isFallback).toBe(true);
    expect(rows.every(r => r.isFallback)).toBe(true);
  });

  // Qualifiers are labelled isFallback=false
  it("qualifier rows are labelled isFallback=false", () => {
    const { rows } = getSinCityResults([P44, P34A]);
    expect(rows.every(r => !r.isFallback)).toBe(true);
  });
});
