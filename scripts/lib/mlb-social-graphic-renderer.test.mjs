import { describe, expect, it } from "vitest";
import {
  SOCIAL_GRAPHIC_GEOMETRY,
  calculateProjectionDifference,
  createLocalMlbLogoResolver,
  extractRenderedRowsFromSvg,
  formatProjectionDifference,
  getHomeRunIndicators,
  getStrikeoutIndicators,
  normalizeHomeRunRows,
  normalizeStrikeoutRows,
  recommendedStrikeoutSide,
  renderMlbSocialSvg,
  selectStrikeoutValuePlays,
} from "./mlb-social-graphic-renderer.mjs";

function hrRow(index, overrides = {}) {
  return {
    playerId: index,
    gameId: 100 + index,
    player: `Hitter ${index}`,
    team: ["NYY", "BOS", "TOR", "CHC", "ATL", "SEA"][index - 1] ?? "NYY",
    hrOddsYes: "+300",
    opposingPitcher: `Pitcher ${index}`,
    hrScore: 76 + index / 10,
    barrelRate: 17,
    hardHitRate: 54,
    last7HR: 2,
    last30HR: 7,
    ...overrides,
  };
}

function kRow(index, overrides = {}) {
  return {
    pitcherId: index,
    gameId: 200 + index,
    pitcher: `Pitcher ${index}`,
    team: ["DET", "STL", "MIL", "TOR", "SEA", "HOU"][index - 1] ?? "DET",
    opponent: ["CWS", "PIT", "COL", "CLE", "ATH", "TEX"][index - 1] ?? "CWS",
    kLine: 6.5,
    oddsOver: "-115",
    oddsUnder: "-105",
    projectedKs: 6.5 + index / 10,
    strikeoutScore: 78 + index,
    ...overrides,
  };
}

const fiveHrRows = () => [1, 2, 3, 4, 5].map((index) => hrRow(index));
const fiveKRows = () => [1, 2, 3, 4, 5].map((index) => kRow(index));

describe("projection difference and recommendation", () => {
  it("calculates projected strikeouts minus the market line", () => {
    expect(calculateProjectionDifference(8.4, 6.5)).toBe(1.9);
    expect(calculateProjectionDifference(4.8, 6.5)).toBe(-1.7);
    expect(calculateProjectionDifference(null, 6.5)).toBeNull();
  });

  it("formats positive and negative differences with explicit signs", () => {
    expect(formatProjectionDifference(1.9)).toBe("+1.9");
    expect(formatProjectionDifference(-1.7)).toBe("−1.7");
  });

  it("selects OVER, UNDER, and no side for a zero edge", () => {
    expect(recommendedStrikeoutSide(0.5)).toBe("OVER");
    expect(recommendedStrikeoutSide(-0.5)).toBe("UNDER");
    expect(recommendedStrikeoutSide(0)).toBeNull();
  });
});

describe("strikeout value selection", () => {
  it("ranks mixed Over and Under plays by absolute edge, not K Score", () => {
    const selected = selectStrikeoutValuePlays([
      kRow(1, { pitcher: "Small Over", projectedKs: 7, strikeoutScore: 99 }),
      kRow(2, { pitcher: "Large Under", projectedKs: 4.5, strikeoutScore: 70 }),
      kRow(3, { pitcher: "Medium Over", projectedKs: 7.8, strikeoutScore: 80 }),
    ]);
    expect(selected.map((row) => row.pitcher)).toEqual(["Large Under", "Medium Over", "Small Over"]);
    expect(selected.map((row) => row.recommendedSide)).toEqual(["UNDER", "OVER", "OVER"]);
  });

  it("uses side-specific odds and never substitutes the opposite side", () => {
    const selected = selectStrikeoutValuePlays([
      kRow(1, { projectedKs: 7.5, oddsOver: "+120", oddsUnder: "-150" }),
      kRow(2, { projectedKs: 5.5, oddsOver: "+130", oddsUnder: "-140" }),
      kRow(3, { projectedKs: 4.5, oddsOver: "+110", oddsUnder: null }),
    ]);
    expect(selected.find((row) => row.pitcher === "Pitcher 1")?.recommendedOdds).toBe("+120");
    expect(selected.find((row) => row.pitcher === "Pitcher 2")?.recommendedOdds).toBe("-140");
    expect(selected.find((row) => row.pitcher === "Pitcher 3")?.recommendedOdds).toBeNull();
  });

  it("excludes zero-edge rows and limits output to five", () => {
    const rows = [kRow(1, { projectedKs: 6.5 }), ...[2, 3, 4, 5, 6, 7].map((index) => kRow(index, { projectedKs: 6.5 + index }))];
    const selected = selectStrikeoutValuePlays(rows, 5);
    expect(selected).toHaveLength(5);
    expect(selected.some((row) => row.pitcher === "Pitcher 1")).toBe(false);
  });

  it("uses deterministic tie breakers", () => {
    const rows = [kRow(1, { pitcher: "Zulu", projectedKs: 7.5, strikeoutScore: 80 }), kRow(2, { pitcher: "Alpha", projectedKs: 5.5, strikeoutScore: 80 })];
    expect(selectStrikeoutValuePlays(rows).map((row) => row.pitcher)).toEqual(["Alpha", "Zulu"]);
  });

  it("does not mutate input rows", () => {
    const rows = fiveKRows();
    const before = structuredClone(rows);
    selectStrikeoutValuePlays(rows);
    expect(rows).toEqual(before);
  });
});

describe("inline indicator rules", () => {
  it("applies Home Run thresholds in priority order and caps at three", () => {
    const indicators = getHomeRunIndicators({ hrScore: 78, barrelPercent: 18, hardHitPercent: 55, last30: 8, last7: 3 });
    expect(indicators).toEqual(["score", "barrel", "hardHit"]);
    expect(indicators).toHaveLength(3);
  });

  it("does not qualify values below the Home Run thresholds", () => {
    expect(getHomeRunIndicators({ hrScore: 77.9, barrelPercent: 17.9, hardHitPercent: 54.9, last30: 7, last7: 2 })).toEqual([]);
  });

  it("applies strikeout projection and K Score thresholds", () => {
    expect(getStrikeoutIndicators({ projectionDifference: -1.5, kScore: 85 })).toEqual(["projection", "score"]);
    expect(getStrikeoutIndicators({ projectionDifference: 1.49, kScore: 84.9 })).toEqual([]);
  });
});

describe("deterministic production SVG", () => {
  it("uses the approved SVG dimensions and exactly five rows", () => {
    const svg = renderMlbSocialSvg({ kind: "hr", slateDate: "2026-07-13", rows: fiveHrRows() });
    expect(SOCIAL_GRAPHIC_GEOMETRY).toMatchObject({ width: 1600, height: 900, rowHeight: 112, rowCount: 5 });
    expect(svg).toContain('viewBox="0 0 1600 900"');
    expect(svg).toContain('width="1600" height="900"');
    expect(extractRenderedRowsFromSvg(svg)).toHaveLength(5);
  });

  it("rejects a non-five-row render instead of padding fabricated plays", () => {
    expect(() => renderMlbSocialSvg({ kind: "hr", slateDate: "2026-07-13", rows: fiveHrRows().slice(0, 4) })).toThrow(/exactly 5 rows/i);
  });

  it("contains no legacy signals column or demo labeling", () => {
    const svg = renderMlbSocialSvg({ kind: "hr", slateDate: "2026-07-13", rows: fiveHrRows() });
    expect(svg).not.toMatch(/KEY SIGNALS/i);
    expect(svg).not.toMatch(/SAMPLE\s*\/\s*DEMO/i);
    expect(svg).not.toMatch(/sample\s*\/\s*demo data/i);
  });

  it("renders the live slate date and production footer text", () => {
    const svg = renderMlbSocialSvg({ kind: "k", slateDate: "2026-07-13", rows: fiveKRows() });
    expect(svg).toContain("Jul 13, 2026");
    expect(svg).toContain("JoeKnowsBall.com/mlb/strikeout-props");
    expect(svg).toContain("Please bet responsibly. 21+");
  });

  it("renders embedded local logos and a safe abbreviation fallback", () => {
    const localLogo = createLocalMlbLogoResolver()("NYY");
    expect(localLogo).toMatch(/^data:image\/svg\+xml;base64,/);
    const embedded = renderMlbSocialSvg({ kind: "hr", slateDate: "2026-07-13", rows: fiveHrRows() });
    expect(embedded).toContain('data-team-logo="NYY"');
    expect(embedded).not.toContain('href="http');
    const fallback = renderMlbSocialSvg({ kind: "hr", slateDate: "2026-07-13", rows: fiveHrRows(), resolveLogo: () => null });
    expect(fallback).toContain('data-team-logo-fallback="NYY"');
  });

  it("uses N/A when recommended-side odds are missing", () => {
    const rows = fiveKRows();
    rows[0] = kRow(1, { projectedKs: 5, oddsOver: "+130", oddsUnder: null });
    const normalized = normalizeStrikeoutRows(rows);
    expect(normalized.find((row) => row.pitcher === "Pitcher 1")?.recommendedOdds).toBeNull();
    expect(renderMlbSocialSvg({ kind: "k", slateDate: "2026-07-13", rows })).toContain(">N/A</text>");
  });

  it("shows a visible minus sign and correct Under odds", () => {
    const rows = fiveKRows();
    rows[0] = kRow(1, { projectedKs: 4.7, oddsOver: "+125", oddsUnder: "-135" });
    const svg = renderMlbSocialSvg({ kind: "k", slateDate: "2026-07-13", rows });
    expect(svg).toContain("−1.8");
    expect(svg).toContain("-135");
  });

  it("replaces the projection triangle with the projection icon at the threshold", () => {
    const rows = fiveKRows();
    rows[0] = kRow(1, { projectedKs: 8, strikeoutScore: 86 });
    const svg = renderMlbSocialSvg({ kind: "k", slateDate: "2026-07-13", rows });
    const firstRow = svg.slice(svg.indexOf('<g data-social-row="0"'), svg.indexOf('<g data-social-row="1"'));
    expect(firstRow).toContain('data-icon="projection"');
    expect(firstRow).not.toContain('points="1034,');
  });

  it("truncates long names and matchup text before metric columns", () => {
    const rows = fiveHrRows();
    rows[0] = hrRow(1, { player: "An Impossibly Long Baseball Player Name", opposingPitcher: "Another Impossibly Long Pitcher Matchup Name" });
    const svg = renderMlbSocialSvg({ kind: "hr", slateDate: "2026-07-13", rows });
    expect(svg).not.toContain(">An Impossibly Long Baseball Player Name</text>");
    expect(svg).toContain(">An Impossibly Long Base…</text>");
    expect(svg).toContain("…");
  });

  it("renders identically for repeated equal inputs", () => {
    const rows = fiveHrRows();
    const first = renderMlbSocialSvg({ kind: "hr", slateDate: "2026-07-13", rows });
    const second = renderMlbSocialSvg({ kind: "hr", slateDate: "2026-07-13", rows });
    expect(second).toBe(first);
  });

  it("normalization is limited, deterministic, and immutable", () => {
    const rows = [1, 2, 3, 4, 5, 6].map((index) => hrRow(index));
    const before = structuredClone(rows);
    expect(normalizeHomeRunRows(rows)).toHaveLength(5);
    expect(rows).toEqual(before);
  });
});
