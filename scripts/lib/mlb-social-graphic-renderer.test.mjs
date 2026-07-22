/**
 * mlb-social-graphic-renderer.test.mjs
 *
 * Not in vitest.config.ts's own include glob (src/**\/*.{test,spec}.{ts,tsx}),
 * but actually executed as part of the full suite via the side-effecting
 * import in src/lib/mlb/mlbSocialGraphicRenderer.test.ts -- must keep using
 * vitest's describe/expect/it (not node:test) for that import to register
 * these tests with vitest's collector.
 */
import { describe, expect, it } from "vitest";
import {
  SOCIAL_GRAPHIC_GEOMETRY,
  calculateProjectionDifference,
  createLocalMlbLogoResolver,
  createRemoteMlbLogoResolver,
  extractRenderedRowsFromSvg,
  formatProjectionDifference,
  getHomeRunIndicators,
  getStrikeoutIndicators,
  normalizeHomeRunRows,
  normalizeStrikeoutRows,
  recommendedStrikeoutSide,
  renderMlbSocialSvg,
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

function firstRowSlice(svg) {
  return svg.slice(svg.indexOf('<g data-social-row="0"'), svg.indexOf('<g data-social-row="1"'));
}

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

describe("normalizeStrikeoutRows -- trusts artifact order, never re-sorts or re-filters", () => {
  it("preserves input order exactly, even when it is NOT sorted by absolute edge", () => {
    // Deliberately "wrong" order by edge magnitude (small, large, medium) --
    // the selection core (mlb-k-x-selection-core.mjs) already decided this
    // order; the renderer must render it as-is, never re-rank it.
    const rows = [
      kRow(1, { pitcher: "Small Over", side: "OVER", projectionEdge: 0.5 }),
      kRow(2, { pitcher: "Large Under", side: "UNDER", projectionEdge: -3.5 }),
      kRow(3, { pitcher: "Medium Over", side: "OVER", projectionEdge: 1.8 }),
    ];
    const normalized = normalizeStrikeoutRows(rows);
    expect(normalized.map((row) => row.pitcher)).toEqual(["Small Over", "Large Under", "Medium Over"]);
    expect(normalized.map((row) => row.recommendedSide)).toEqual(["OVER", "UNDER", "OVER"]);
    expect(normalized.map((row) => row.rank)).toEqual([1, 2, 3]);
  });

  it("trusts artifact-shaped side/projectionEdge directly, never re-deriving them", () => {
    // side/projectionEdge deliberately disagree with what projectedKs/kLine
    // alone would compute -- the artifact-provided fields must win.
    const row = kRow(1, { side: "UNDER", projectionEdge: -9.9, projectedKs: 8, kLine: 5 });
    const [normalized] = normalizeStrikeoutRows([row]);
    expect(normalized.recommendedSide).toBe("UNDER");
    expect(normalized.projectionDifference).toBe(-9.9);
  });

  it("falls back to computing side/edge from projectedKs - kLine only when artifact fields are absent (per-row, never a sort)", () => {
    const rows = [kRow(1, { projectedKs: 7.5, kLine: 6.5 }), kRow(2, { projectedKs: 4.5, kLine: 6.5, oddsUnder: "-140" })];
    const normalized = normalizeStrikeoutRows(rows);
    expect(normalized[0].recommendedSide).toBe("OVER");
    expect(normalized[1].recommendedSide).toBe("UNDER");
    // order still preserved, not re-sorted by edge magnitude
    expect(normalized.map((row) => row.pitcher)).toEqual(["Pitcher 1", "Pitcher 2"]);
  });

  it("uses side-specific odds and never substitutes the opposite side", () => {
    const rows = [
      kRow(1, { side: "OVER", projectionEdge: 1.2, oddsOver: "+120", oddsUnder: "-150" }),
      kRow(2, { side: "UNDER", projectionEdge: -1.0, oddsOver: "+130", oddsUnder: "-140" }),
      kRow(3, { side: "OVER", projectionEdge: 0.8, oddsOver: "+110", oddsUnder: null }),
    ];
    const normalized = normalizeStrikeoutRows(rows);
    expect(normalized[0].recommendedOdds).toBe("+120");
    expect(normalized[1].recommendedOdds).toBe("-140");
    expect(normalized[2].recommendedOdds).toBe("+110");
  });

  it("truncates to limit without reordering", () => {
    const rows = [1, 2, 3, 4, 5, 6, 7].map((n) => kRow(n, { side: n % 2 === 0 ? "UNDER" : "OVER", projectionEdge: n % 2 === 0 ? -n : n }));
    const normalized = normalizeStrikeoutRows(rows, 5);
    expect(normalized).toHaveLength(5);
    expect(normalized.map((row) => row.pitcher)).toEqual(["Pitcher 1", "Pitcher 2", "Pitcher 3", "Pitcher 4", "Pitcher 5"]);
  });

  it("carries projectedIP through for the compact supporting field", () => {
    const [normalized] = normalizeStrikeoutRows([kRow(1, { projectedIP: 5.8 })]);
    expect(normalized.projectedIP).toBe(5.8);
  });

  it("does not mutate input rows", () => {
    const rows = fiveKRows();
    const before = structuredClone(rows);
    normalizeStrikeoutRows(rows);
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
    expect(getHomeRunIndicators({ hrScore: 69.9, barrelPercent: 17.9, hardHitPercent: 54.9, last30: 7, last7: 2 })).toEqual([]);
  });

  it("fire-icon threshold is 70, matching the website's SocialTableHR trigger (not the old 78)", () => {
    expect(getHomeRunIndicators({ hrScore: 69.9 })).toEqual([]);
    expect(getHomeRunIndicators({ hrScore: 70 })).toEqual(["score"]);
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

  it("rejects zero rows before rendering anything", () => {
    expect(() => renderMlbSocialSvg({ kind: "hr", slateDate: "2026-07-13", rows: [] })).toThrow(/at least 1 row/i);
    expect(() => renderMlbSocialSvg({ kind: "k", slateDate: "2026-07-13", rows: [] })).toThrow(/at least 1 row/i);
  });

  it("rejects more than the maximum rather than silently truncating real picks", () => {
    const sixRows = [1, 2, 3, 4, 5, 6].map((index) => hrRow(index));
    expect(() => renderMlbSocialSvg({ kind: "hr", slateDate: "2026-07-13", rows: sixRows })).toThrow(/at most 5 rows/i);
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

  it("K header clearly communicates the value-board purpose (approved title/subtitle)", () => {
    const svg = renderMlbSocialSvg({ kind: "k", slateDate: "2026-07-13", rows: fiveKRows() });
    expect(svg).toContain("MLB STRIKEOUT VALUE PLAYS");
    expect(svg).toContain("Top Qualified Model vs. Market Edges");
  });

  it("K rows render in exactly artifact order end-to-end, never re-sorted by the renderer", () => {
    const rows = [
      kRow(1, { pitcher: "Small Over", side: "OVER", projectionEdge: 0.5 }),
      kRow(2, { pitcher: "Large Under", side: "UNDER", projectionEdge: -3.5 }),
      kRow(3, { pitcher: "Medium Over", side: "OVER", projectionEdge: 1.8 }),
      kRow(4, { pitcher: "Fourth", side: "OVER", projectionEdge: 0.2 }),
      kRow(5, { pitcher: "Fifth", side: "UNDER", projectionEdge: -0.1 }),
    ];
    const svg = renderMlbSocialSvg({ kind: "k", slateDate: "2026-07-13", rows });
    const rendered = extractRenderedRowsFromSvg(svg);
    expect(rendered.map((row) => row.pitcher)).toEqual(["Small Over", "Large Under", "Medium Over", "Fourth", "Fifth"]);
  });

  it("Over and Under badges use visibly distinct, restrained colors", () => {
    const rows = fiveKRows();
    rows[0] = kRow(1, { side: "OVER", projectionEdge: 1.5 });
    rows[1] = kRow(2, { side: "UNDER", projectionEdge: -1.5 });
    const svg = renderMlbSocialSvg({ kind: "k", slateDate: "2026-07-13", rows });
    expect(svg).toContain('fill="#13A66A"'); // Over: restrained green/teal
    expect(svg).toContain('fill="#1D63B3"'); // Under: restrained blue
    expect(svg).not.toContain('fill="#2E3566"'); // old dark navy/purple Under color is gone
  });

  it("shows projected IP as a compact supporting field when present", () => {
    const rows = fiveKRows();
    rows[0] = kRow(1, { projectedIP: 5.8 });
    const svg = renderMlbSocialSvg({ kind: "k", slateDate: "2026-07-13", rows });
    expect(svg).toContain("5.8 IP");
  });

  it("omits the IP suffix cleanly when projectedIP is absent", () => {
    const rows = fiveKRows();
    rows[0] = kRow(1, { projectedIP: undefined });
    const svg = renderMlbSocialSvg({ kind: "k", slateDate: "2026-07-13", rows });
    expect(firstRowSlice(svg)).not.toContain(" IP");
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

  describe("HR Score pill color matches the website's SocialTableHR sc() exactly (no gray floor for real scores)", () => {
    it.each([
      [72, "#22c55e"],
      [67, "#4ade80"],
      [63, "#facc15"],
      [40, "#fb923c"],
    ])("hrScore=%s -> pill fill %s", (hrScore, expectedFill) => {
      const rows = fiveHrRows();
      rows[0] = hrRow(1, { hrScore });
      const svg = renderMlbSocialSvg({ kind: "hr", slateDate: "2026-07-13", rows });
      expect(firstRowSlice(svg)).toContain(`fill="${expectedFill}"`);
    });

    it("a genuinely missing HR score stays muted gray, not a fabricated tier", () => {
      const rows = fiveHrRows();
      rows[0] = hrRow(1, { hrScore: null });
      const svg = renderMlbSocialSvg({ kind: "hr", slateDate: "2026-07-13", rows });
      expect(firstRowSlice(svg)).toContain('fill="#8A97A8"');
    });
  });

  describe("Barrel% / Hard-Hit% / L7 / L30 use data-driven color, not a fixed color regardless of value", () => {
    it("Barrel% and Hard-Hit% follow the website's statCol(hi, mid) bands", () => {
      const rows = fiveHrRows();
      rows[0] = hrRow(1, { barrelRate: 21, hardHitRate: 30 });
      const highRow = firstRowSlice(renderMlbSocialSvg({ kind: "hr", slateDate: "2026-07-13", rows }));
      expect(highRow).toContain('fill="#22c55e"'); // barrel >= 20
      expect(highRow).toContain('fill="#94a3b8"'); // hardHit below 50

      const rows2 = fiveHrRows();
      rows2[0] = hrRow(1, { barrelRate: 5, hardHitRate: 51 });
      const mixedRow = firstRowSlice(renderMlbSocialSvg({ kind: "hr", slateDate: "2026-07-13", rows: rows2 }));
      expect(mixedRow).toContain('fill="#86efac"'); // hardHit >= 50, < 54
    });

    it("L7 and L30 follow the website's green/gold/gray bands", () => {
      const rows = fiveHrRows();
      rows[0] = hrRow(1, { last7HR: 3, last30HR: 5 });
      const svg = renderMlbSocialSvg({ kind: "hr", slateDate: "2026-07-13", rows });
      const firstRow = firstRowSlice(svg);
      expect(firstRow).toContain('fill="#22c55e"'); // last7HR >= 3
      expect(firstRow).toContain('fill="#facc15"'); // last30HR >= 5, < 8
    });
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
    const firstRow = firstRowSlice(svg);
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

// A frozen K (or HR) selection may legitimately return fewer than the
// maximum -- e.g. only 2 K props qualified on a thin slate -- and the
// social graphic must still render that real selection rather than
// refusing to post at all. Real GitHub Actions dry runs against a live
// slate with only 2 qualifying K rows surfaced exactly this failure before
// this fix existed.
describe("K social graphic renders 1-5 rows without padding, truncating, or duplicating", () => {
  for (let count = 1; count <= 5; count += 1) {
    it(`renders exactly ${count} K row(s)`, () => {
      const rows = Array.from({ length: count }, (_, i) => kRow(i + 1));
      const svg = renderMlbSocialSvg({ kind: "k", slateDate: "2026-07-13", rows });
      expect(extractRenderedRowsFromSvg(svg)).toHaveLength(count);
    });
  }

  it("five rows preserve the existing layout exactly -- same row positions as before this change", () => {
    const svg = renderMlbSocialSvg({ kind: "k", slateDate: "2026-07-13", rows: fiveKRows() });
    expect(svg).toContain('<rect x="56" y="196" width="1488" height="112"'); // row 0: legacy rowTop
    expect(svg).toContain('<rect x="56" y="420" width="1488" height="112"'); // row 2: legacy rowTop + 2*rowHeight
  });

  it("never introduces a placeholder or fabricated row -- rendered identities are exactly the input rows, in order", () => {
    const rows = [kRow(1, { pitcher: "Solo Starter" }), kRow(2, { pitcher: "Second Starter" })];
    const svg = renderMlbSocialSvg({ kind: "k", slateDate: "2026-07-13", rows });
    const rendered = extractRenderedRowsFromSvg(svg);
    expect(rendered.map((r) => r.pitcher)).toEqual(["Solo Starter", "Second Starter"]);
  });

  it("never duplicates a row when the count is below the maximum", () => {
    const rows = [kRow(1, { pitcher: "Only Starter" })];
    const svg = renderMlbSocialSvg({ kind: "k", slateDate: "2026-07-13", rows });
    expect(extractRenderedRowsFromSvg(svg)).toHaveLength(1);
    expect(svg.match(/data-social-row="/g)).toHaveLength(1);
  });

  it("rendered row identities exactly match the frozen plan rows -- the assertRowConsistency contract this feeds", () => {
    const rows = [
      kRow(1, { pitcherId: 501, gameId: 9001 }),
      kRow(2, { pitcherId: 502, gameId: 9002 }),
      kRow(3, { pitcherId: 503, gameId: 9003 }),
    ];
    const svg = renderMlbSocialSvg({ kind: "k", slateDate: "2026-07-13", rows });
    const rendered = extractRenderedRowsFromSvg(svg);
    expect(rendered.map((r) => String(r.pitcherId))).toEqual(["501", "502", "503"]);
    expect(rendered.map((r) => String(r.gameId))).toEqual(["9001", "9002", "9003"]);
  });

  it("distributes fewer rows across the same rowTop..footerTop band -- not stranded at the legacy fixed positions", () => {
    const oneRowSvg = renderMlbSocialSvg({ kind: "k", slateDate: "2026-07-13", rows: [kRow(1)] });
    // A single row is centered within the full band, not pinned to the
    // legacy top-row position.
    expect(oneRowSvg).not.toContain('<rect x="56" y="196" width="1488" height="112"');
  });

  it("HR rendering is unaffected -- same row-count acceptance, same legacy 5-row layout", () => {
    for (let count = 1; count <= 5; count += 1) {
      const rows = Array.from({ length: count }, (_, i) => hrRow(i + 1));
      const svg = renderMlbSocialSvg({ kind: "hr", slateDate: "2026-07-13", rows });
      expect(extractRenderedRowsFromSvg(svg)).toHaveLength(count);
    }
  });
});

describe("createRemoteMlbLogoResolver", () => {
  function fakePngResponse(bytes = [1, 2, 3, 4]) {
    return {
      ok: true,
      headers: { get: (name) => (name === "content-type" ? "image/png" : null) },
      arrayBuffer: async () => Uint8Array.from(bytes).buffer,
    };
  }

  it("embeds a real fetched logo as a base64 data URI", async () => {
    const fetchImpl = async (url) => {
      expect(url).toContain("espncdn.com");
      expect(url).toContain("bos.png");
      return fakePngResponse();
    };
    const resolve = await createRemoteMlbLogoResolver({ teams: ["BOS"], fetchImpl });
    const logo = resolve("BOS");
    expect(logo).toMatch(/^data:image\/png;base64,/);
  });

  it("prefetches exactly the distinct teams requested, case-insensitively deduplicated", async () => {
    const requested = [];
    const fetchImpl = async (url) => {
      requested.push(url);
      return fakePngResponse();
    };
    await createRemoteMlbLogoResolver({ teams: ["bos", "BOS", "nyy", ""], fetchImpl });
    expect(requested).toHaveLength(2);
  });

  it("falls back to the local placeholder logo on a non-200 response", async () => {
    const fetchImpl = async () => ({ ok: false, status: 500 });
    const resolve = await createRemoteMlbLogoResolver({ teams: ["BOS"], fetchImpl });
    const logo = resolve("BOS");
    expect(logo).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it("falls back to the local placeholder logo on a network error (never throws, stays screenshot-safe)", async () => {
    const fetchImpl = async () => {
      throw new Error("network unreachable");
    };
    const resolve = await createRemoteMlbLogoResolver({ teams: ["BOS"], fetchImpl });
    const logo = resolve("BOS");
    expect(logo).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it("fetches the shared generic-MLB fallback logo (getEmailTeamLogoUrl's own FALLBACK_LOGO) for an unrecognized team", async () => {
    const requestedUrls = [];
    const fetchImpl = async (url) => {
      requestedUrls.push(url);
      return fakePngResponse();
    };
    const resolve = await createRemoteMlbLogoResolver({ teams: ["ZZZ"], fetchImpl });
    const logo = resolve("ZZZ");
    expect(logo).toMatch(/^data:image\/png;base64,/);
    expect(requestedUrls[0]).toContain("espncdn.com");
  });

  it("falls through to null (renderTeamLogo's own generic circle badge) when the fetch fails and no local placeholder file exists either", async () => {
    const fetchImpl = async () => ({ ok: false, status: 404 });
    const resolve = await createRemoteMlbLogoResolver({ teams: ["ZZZ"], fetchImpl });
    // "zzz.svg" has no local placeholder file, matching createLocalMlbLogoResolver's
    // own null-on-missing-file contract -- renderTeamLogo treats a null/falsy
    // resolveLogo result as "draw the generic circle+abbreviation badge",
    // never throwing.
    expect(resolve("ZZZ")).toBeNull();
  });

  it("resolver embeds into a real SVG render with no external href (screenshot-safe, no live network needed at rasterize time)", async () => {
    const fetchImpl = async () => fakePngResponse();
    const resolve = await createRemoteMlbLogoResolver({ teams: ["BOS", "NYY"], fetchImpl });
    const rows = fiveHrRows();
    const svg = renderMlbSocialSvg({ kind: "hr", slateDate: "2026-07-13", rows, resolveLogo: resolve });
    expect(svg).not.toContain('href="http');
    expect(svg).toContain('data-team-logo="BOS"');
  });
});
