import { describe, expect, it } from "vitest";
import { buildResearchRow, checkLeakage, PROVENANCE } from "./nfl-research-join.mjs";

function baseInput(overrides = {}) {
  return {
    provenance: PROVENANCE.LIVE_PAPER_TRADING,
    market: "passing",
    playerId: "gsis:00-0036945",
    playerName: "Brock Purdy",
    team: "sf",
    opponent: "lar",
    gameId: "2026_01_SF_LAR",
    season: 2026,
    week: 1,
    observedAt: "2026-09-09T12:00:00Z",
    commenceTime: "2026-09-10T00:20:00Z",
    bookmaker: "draftkings",
    projectionYards: 250,
    sportsbookLine: 245.5,
    overPrice: -115,
    underPrice: -105,
    actualYards: null,
    ...overrides,
  };
}

describe("checkLeakage", () => {
  it("passes when the line was observed strictly before kickoff", () => {
    expect(checkLeakage({ observedAt: "2026-09-09T12:00:00Z", commenceTime: "2026-09-10T00:20:00Z" })).toBe(true);
  });

  it("rejects a line observed at kickoff", () => {
    expect(checkLeakage({ observedAt: "2026-09-10T00:20:00Z", commenceTime: "2026-09-10T00:20:00Z" })).toBe("line_observed_at_or_after_kickoff");
  });

  it("rejects a line observed after kickoff (no future-line leakage)", () => {
    expect(checkLeakage({ observedAt: "2026-09-10T03:00:00Z", commenceTime: "2026-09-10T00:20:00Z" })).toBe("line_observed_at_or_after_kickoff");
  });

  it("rejects an invalid timestamp", () => {
    expect(checkLeakage({ observedAt: "not-a-date", commenceTime: "2026-09-10T00:20:00Z" })).toBe("invalid_timestamp");
  });
});

describe("buildResearchRow", () => {
  it("builds a row and computes rawEdgeYards from projection - line", () => {
    const { row, rejected } = buildResearchRow(baseInput());
    expect(rejected).toBeNull();
    expect(row.rawEdgeYards).toBeCloseTo(4.5, 5);
  });

  it("rejects a row whose line was observed after kickoff -- join integrity / no leakage", () => {
    const { row, rejected } = buildResearchRow(baseInput({ observedAt: "2026-09-10T05:00:00Z" }));
    expect(row).toBeNull();
    expect(rejected).toBe("line_observed_at_or_after_kickoff");
  });

  it("rejects a row missing projection or line", () => {
    expect(buildResearchRow(baseInput({ projectionYards: null })).rejected).toBe("missing_projection_or_line");
    expect(buildResearchRow(baseInput({ sportsbookLine: null })).rejected).toBe("missing_projection_or_line");
  });

  it("computes actualVsLine/projectionError/lineError/outcome=over when actual exceeds the line", () => {
    const { row } = buildResearchRow(baseInput({ actualYards: 280 }));
    expect(row.actualVsLine).toBeCloseTo(34.5, 5);
    expect(row.projectionError).toBeCloseTo(250 - 280, 5);
    expect(row.lineError).toBeCloseTo(245.5 - 280, 5);
    expect(row.outcome).toBe("over");
  });

  it("computes outcome=under when actual is below the line", () => {
    const { row } = buildResearchRow(baseInput({ actualYards: 200 }));
    expect(row.outcome).toBe("under");
  });

  it("handles an exact push", () => {
    const { row } = buildResearchRow(baseInput({ actualYards: 245.5 }));
    expect(row.outcome).toBe("push");
    expect(row.actualVsLine).toBe(0);
  });

  it("leaves actual-dependent fields null when actualYards is not yet known (live paper trading, pregame)", () => {
    const { row } = buildResearchRow(baseInput());
    expect(row.actualYards).toBeNull();
    expect(row.actualVsLine).toBeNull();
    expect(row.projectionError).toBeNull();
    expect(row.lineError).toBeNull();
    expect(row.outcome).toBeNull();
  });

  it("computes no-vig probabilities from over/under prices", () => {
    const { row } = buildResearchRow(baseInput({ overPrice: -110, underPrice: -110 }));
    expect(row.noVigOverProb).toBeCloseTo(0.5, 5);
    expect(row.noVigUnderProb).toBeCloseTo(0.5, 5);
  });

  it("relates the line to the estimated interval: below/inside/above", () => {
    const range = { estimatedLow: 240, estimatedHigh: 260, nominalLevel: 90, intervalVersion: "v1" };
    expect(buildResearchRow(baseInput({ sportsbookLine: 235, estimatedRange: range })).row.intervalRelation).toBe("belowInterval");
    expect(buildResearchRow(baseInput({ sportsbookLine: 250, estimatedRange: range })).row.intervalRelation).toBe("insideInterval");
    expect(buildResearchRow(baseInput({ sportsbookLine: 265, estimatedRange: range })).row.intervalRelation).toBe("aboveInterval");
  });

  it("preserves provenance verbatim", () => {
    const { row } = buildResearchRow(baseInput({ provenance: PROVENANCE.HISTORICAL }));
    expect(row.provenance).toBe(PROVENANCE.HISTORICAL);
  });
});
