import {
  FANTASY_SCORING_VERSION,
  FULL_PPR_SCORING,
  calculateFullPprFantasyPoints,
  type FantasyStatLine,
} from "@/lib/fantasy/weekly/scoring";

const zeroLine = (): FantasyStatLine => ({
  passingYards: 0,
  passingTouchdowns: 0,
  interceptions: 0,
  rushingYards: 0,
  rushingTouchdowns: 0,
  receptions: 0,
  receivingYards: 0,
  receivingTouchdowns: 0,
  fumblesLost: 0,
});

describe("frozen full-PPR scoring", () => {
  it("is explicitly versioned and has no bonuses", () => {
    expect(FANTASY_SCORING_VERSION).toBe("jkb-full-ppr-v1.0.0");
    expect(FULL_PPR_SCORING.bonuses).toEqual([]);
  });

  it("scores a QB stat line", () => {
    expect(calculateFullPprFantasyPoints({
      ...zeroLine(), passingYards: 300, passingTouchdowns: 3, interceptions: 1,
      rushingYards: 30, rushingTouchdowns: 1,
    })).toBe(31);
  });

  it("scores an RB stat line", () => {
    expect(calculateFullPprFantasyPoints({
      ...zeroLine(), rushingYards: 85, rushingTouchdowns: 1,
      receptions: 4, receivingYards: 35, fumblesLost: 1,
    })).toBe(20);
  });

  it("scores WR and TE receiving lines", () => {
    expect(calculateFullPprFantasyPoints({
      ...zeroLine(), receptions: 8, receivingYards: 110, receivingTouchdowns: 1,
    })).toBe(25);
    expect(calculateFullPprFantasyPoints({
      ...zeroLine(), receptions: 5, receivingYards: 55, receivingTouchdowns: 1,
      receivingTwoPointConversions: 1,
    })).toBe(18.5);
  });

  it("scores a zero-stat game as zero", () => {
    expect(calculateFullPprFantasyPoints(zeroLine())).toBe(0);
  });

  it("rejects invalid inputs instead of silently coercing them", () => {
    expect(() => calculateFullPprFantasyPoints({ ...zeroLine(), receptions: Number.NaN })).toThrow();
    expect(() => calculateFullPprFantasyPoints({ ...zeroLine(), fumblesLost: -1 })).toThrow();
  });
});
