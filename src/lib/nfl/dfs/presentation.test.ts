import { historyFixture } from "./__fixtures__/historyFactory";
import { buildMatchupEdges, buildMetric, buildResearchContext } from "./__fixtures__/researchFactory";
import { selectFantasyMatchupEdges, type NflOffenseMatchupEdges } from "@/lib/nfl/matchupEdges";
import { buildDstRow } from "./optimizer/__fixtures__/optimizerRowFactory";
import { describe, expect, it } from "vitest";
import {
  buildDfsDstDisplayEdges,
  dfsMatchupValue,
  dfsSortValue,
  type DfsSortKey,
  describeDfsDiagnostic,
  filterDfsRows,
  formatDfsPointsPer1k,
  formatDfsProjection,
  formatDfsRankDiff,
  formatDfsSalary,
  getDfsRankDiffTone,
  getDfsStatusBadge,
  selectDfsBoardRows,
  sortDfsRows,
} from "@/lib/nfl/dfs/presentation";
import type { DfsEnrichedOffensiveRow } from "@/lib/nfl/dfs/slateAnalyzer";

function row(overrides: Partial<DfsEnrichedOffensiveRow> & Pick<DfsEnrichedOffensiveRow, "dkId" | "playerName" | "position">): DfsEnrichedOffensiveRow {
  return {
    kind: "offense",
    rosterPosition: `${overrides.position}/FLEX`,
    salary: 5000,
    team: "no",
    game: null,
    gameInfoRaw: "NO@DET",
    dkAvgPointsPerGame: null,
    dkStatus: null,
    identityStatus: "resolved",
    playerId: `gsis:${overrides.dkId}`,
    identityConflict: false,
    projectedFantasyPoints: 10,
    projectionSource: "JKB Full PPR",
    jkbWeeklyPositionRank: 1,
    jkbSlatePositionRank: 1,
    jkbOverallSlateProjectionRank: 1,
    dkPositionSalaryRank: 1,
    dkOverallSalaryRank: 1,
    posRankDiff: 0,
    overallRankDiff: 0,
    pointsPer1k: 2,
    research: null,
    teamMismatchStatus: "none",
    opponent: "det",
    homeAway: "away",
    canonicalGameId: null,
    ...overrides,
  };
}

describe("getDfsRankDiffTone", () => {
  it("returns a strong positive tone for a large positive diff", () => {
    expect(getDfsRankDiffTone(15)).toBe("gold");
  });
  it("returns a positive tone for a moderate positive diff", () => {
    expect(getDfsRankDiffTone(6)).toBe("green");
    expect(getDfsRankDiffTone(9)).toBe("dark-green");
  });
  it("returns neutral for zero", () => {
    expect(getDfsRankDiffTone(0)).toBe("neutral");
  });
  it("returns a negative tone for a moderate negative diff", () => {
    expect(getDfsRankDiffTone(-4)).toBe("red");
  });
  it("returns a strong negative tone for a large negative diff", () => {
    expect(getDfsRankDiffTone(-12)).toBe("strong-red");
  });
  it("returns missing for null", () => {
    expect(getDfsRankDiffTone(null)).toBe("missing");
  });
});

describe("formatDfsRankDiff", () => {
  it("prefixes a positive diff with +", () => {
    expect(formatDfsRankDiff(15)).toBe("+15");
  });
  it("shows E for exact agreement", () => {
    expect(formatDfsRankDiff(0)).toBe("E");
  });
  it("shows a negative diff as-is", () => {
    expect(formatDfsRankDiff(-4)).toBe("-4");
  });
  it("shows a dash for missing", () => {
    expect(formatDfsRankDiff(null)).toBe("—");
  });
});

describe("formatDfsSalary / formatDfsProjection / formatDfsPointsPer1k", () => {
  it("formats salary with thousands separators", () => {
    expect(formatDfsSalary(8200)).toBe("$8,200");
  });
  it("formats projection to one decimal", () => {
    expect(formatDfsProjection(18.666)).toBe("18.7");
  });
  it("formats points per 1k to two decimals", () => {
    expect(formatDfsPointsPer1k(2.5)).toBe("2.50");
  });
  it("formats missing values as a dash", () => {
    expect(formatDfsSalary(null)).toBe("—");
    expect(formatDfsProjection(null)).toBe("—");
    expect(formatDfsPointsPer1k(null)).toBe("—");
  });
});

describe("getDfsStatusBadge", () => {
  it("returns null for a blank status", () => {
    expect(getDfsStatusBadge(null)).toBeNull();
    expect(getDfsStatusBadge("")).toBeNull();
  });
  it("returns a danger badge for OUT and IR", () => {
    expect(getDfsStatusBadge("OUT")).toEqual({ label: "OUT", tone: "danger" });
    expect(getDfsStatusBadge("IR")).toEqual({ label: "IR", tone: "danger" });
  });
  it("returns a caution badge for Q and D", () => {
    expect(getDfsStatusBadge("Q")).toEqual({ label: "Q", tone: "caution" });
    expect(getDfsStatusBadge("D")).toEqual({ label: "D", tone: "caution" });
  });
  it("still renders an unknown status rather than dropping it", () => {
    expect(getDfsStatusBadge("GTD")).toEqual({ label: "GTD", tone: "neutral" });
  });
});

describe("describeDfsDiagnostic", () => {
  it("produces a human-readable message with field/row location", () => {
    expect(describeDfsDiagnostic("DUPLICATE_DK_ID", "dkId", 18)).toBe('A DraftKings ID appears more than once. ("dkId", row 18)');
  });
  it("falls back to a generic message for an unmapped code", () => {
    expect(describeDfsDiagnostic("SOME_UNKNOWN_CODE", null, null)).toBe("This row could not be validated.");
  });
});

describe("selectDfsBoardRows", () => {
  it("VALUE includes only offensive rows", () => {
    const rows = [row({ dkId: "1", playerName: "A", position: "QB" }), { ...row({ dkId: "2", playerName: "B", position: "WR" }), kind: "dst" as const }];
    expect(selectDfsBoardRows(rows as never, "VALUE")).toHaveLength(1);
  });
  it("a position view filters to that position only", () => {
    const rows = [row({ dkId: "1", playerName: "A", position: "QB" }), row({ dkId: "2", playerName: "B", position: "WR" })];
    expect(selectDfsBoardRows(rows, "WR")).toEqual([rows[1]]);
  });
});

describe("filterDfsRows", () => {
  it("filters by player search case-insensitively", () => {
    const rows = [row({ dkId: "1", playerName: "Derek Sample", position: "QB" }), row({ dkId: "2", playerName: "Miles Anderson", position: "QB" })];
    expect(filterDfsRows(rows, { search: "derek", availableOnly: false, direction: "all" })).toEqual([rows[0]]);
  });
  it("excludes OUT/IR when availableOnly is set", () => {
    const rows = [row({ dkId: "1", playerName: "A", position: "QB", dkStatus: "OUT" }), row({ dkId: "2", playerName: "B", position: "QB", dkStatus: null })];
    expect(filterDfsRows(rows, { search: "", availableOnly: true, direction: "all" })).toEqual([rows[1]]);
  });
  it("filters by direction (jkb-higher/dk-higher/agreement)", () => {
    const rows = [
      row({ dkId: "1", playerName: "Pos", position: "QB", posRankDiff: 5 }),
      row({ dkId: "2", playerName: "Neg", position: "QB", posRankDiff: -5 }),
      row({ dkId: "3", playerName: "Zero", position: "QB", posRankDiff: 0 }),
    ];
    expect(filterDfsRows(rows, { search: "", availableOnly: false, direction: "jkb-higher" }).map((r) => r.dkId)).toEqual(["1"]);
    expect(filterDfsRows(rows, { search: "", availableOnly: false, direction: "dk-higher" }).map((r) => r.dkId)).toEqual(["2"]);
    expect(filterDfsRows(rows, { search: "", availableOnly: false, direction: "agreement" }).map((r) => r.dkId)).toEqual(["3"]);
  });
});

describe("sortDfsRows", () => {
  it("sorts by Rank Diff descending and never mutates the input array", () => {
    const rows = [row({ dkId: "1", playerName: "Low", position: "QB", posRankDiff: -5 }), row({ dkId: "2", playerName: "High", position: "QB", posRankDiff: 15 })];
    const original = [...rows];
    const sorted = sortDfsRows(rows, "rankDiff");
    expect(sorted.map((r) => r.dkId)).toEqual(["2", "1"]);
    expect(rows).toEqual(original);
  });
  it("sorts by salary descending", () => {
    const rows = [row({ dkId: "1", playerName: "Cheap", position: "QB", salary: 4000 }), row({ dkId: "2", playerName: "Rich", position: "QB", salary: 9000 })];
    expect(sortDfsRows(rows, "salary").map((r) => r.dkId)).toEqual(["2", "1"]);
  });
  it("sorts nulls last regardless of key", () => {
    const rows = [row({ dkId: "1", playerName: "Has Proj", position: "QB", projectedFantasyPoints: 20 }), row({ dkId: "2", playerName: "No Proj", position: "QB", projectedFantasyPoints: null })];
    expect(sortDfsRows(rows, "proj").map((r) => r.dkId)).toEqual(["1", "2"]);
  });
});

// Rank Diff = DK salary rank - JKB slate rank. Positive => JKB ranks the player
// higher than DK pricing implies (better value); negative => DK prices the
// player more aggressively than JKB ranks him; zero => agreement. Every
// presentation surface (tone, formatting, direction filter, sort) must honor
// this one sign convention.
describe("Rank Diff sign semantics", () => {
  it("positive diff (JKB higher than DK price) is a green/positive tone and renders with a leading +", () => {
    expect(formatDfsRankDiff(6)).toBe("+6");
    expect(["gold", "dark-green", "green", "light-green"]).toContain(getDfsRankDiffTone(6));
  });
  it("negative diff (DK prices more aggressively than JKB) is a red tone and renders with a leading -", () => {
    expect(formatDfsRankDiff(-6)).toBe("-6");
    expect(["light-red", "red", "strong-red"]).toContain(getDfsRankDiffTone(-6));
  });
  it("zero diff is agreement: neutral tone, rendered as E", () => {
    expect(formatDfsRankDiff(0)).toBe("E");
    expect(getDfsRankDiffTone(0)).toBe("neutral");
  });
  it("direction filter uses the same sign convention as the tone/format helpers", () => {
    const rows = [
      row({ dkId: "1", playerName: "JKB values", position: "QB", posRankDiff: 8 }),
      row({ dkId: "2", playerName: "DK values", position: "QB", posRankDiff: -8 }),
      row({ dkId: "3", playerName: "Agree", position: "QB", posRankDiff: 0 }),
    ];
    expect(filterDfsRows(rows, { search: "", availableOnly: false, direction: "jkb-higher" }).map((r) => r.dkId)).toEqual(["1"]);
    expect(filterDfsRows(rows, { search: "", availableOnly: false, direction: "dk-higher" }).map((r) => r.dkId)).toEqual(["2"]);
    expect(getDfsRankDiffTone(rows[0].posRankDiff)).toMatch(/green/);
    expect(getDfsRankDiffTone(rows[1].posRankDiff)).toMatch(/red/);
  });
  it("sort by rankDiff puts the largest positive (best JKB value) first", () => {
    const rows = [
      row({ dkId: "a", playerName: "A", position: "QB", posRankDiff: -3 }),
      row({ dkId: "b", playerName: "B", position: "QB", posRankDiff: 12 }),
      row({ dkId: "c", playerName: "C", position: "QB", posRankDiff: 0 }),
    ];
    expect(sortDfsRows(rows, "rankDiff").map((r) => r.dkId)).toEqual(["b", "c", "a"]);
  });
});


describe("new analytical sorting and matchup presentation", () => {
  const lowEdges = buildMatchupEdges();
  lowEdges.epa.rankDifference = -5; lowEdges.success.rankDifference = -9; lowEdges.trenches.rankDifference = -3;
  const highEdges = buildMatchupEdges();
  highEdges.epa.rankDifference = 5; highEdges.success.rankDifference = 9; highEdges.trenches.rankDifference = 3;
  const low = row({ dkId: "lo", playerName: "Alpha", position: "QB", team: "ari", jkbWeeklyPositionRank: 1,
    research: { status: "available", matchupGrade: null, matchupEdges: lowEdges, context: buildResearchContext({ opponentFpaSeason: buildMetric({ value: 10, rank: 2 }), opponentFpaLast5: buildMetric({ value: 30 }) }) } });
  const high = row({ dkId: "hi", playerName: "Zulu", position: "QB", team: "wsh", jkbWeeklyPositionRank: 9,
    research: { status: "available", matchupGrade: null, matchupEdges: highEdges, context: buildResearchContext({ opponentFpaSeason: buildMetric({ value: 30, rank: 5 }), opponentFpaLast5: buildMetric({ value: 10 }) }) } });
  const missing = row({ dkId: "na", playerName: "Missing", position: "QB", jkbWeeklyPositionRank: null });
  it.each(["weeklyRank", "fpaSeason", "fpaLast5", "epa", "success", "trenches", "matchup"] as DfsSortKey[])("sorts %s in both directions with missing last", key => {
    const expected = Number(dfsSortValue(low, key)) < Number(dfsSortValue(high, key)) ? [low, high] : [high, low];
    expect(sortDfsRows([missing, high, low], key, "asc")).toEqual([...expected, missing]);
    expect(sortDfsRows([missing, high, low], key, "desc")).toEqual([...expected].reverse().concat(missing));
  });
  it.each(["player", "teamOpp"] as DfsSortKey[])("sorts %s alphabetically", key => {
    expect(sortDfsRows([high, low], key, "asc")).toEqual([low, high]);
    expect(sortDfsRows([high, low], key, "desc")).toEqual([high, low]);
  });
  it.each(["QB", "RB", "WR", "TE"] as const)("preserves the canonical %s trench selection", position => {
    const edges: NflOffenseMatchupEdges = { passProtectionEdge: highEdges.trenches, runBlockingEdge: lowEdges.trenches, passEpaEdge: highEdges.epa, rushEpaEdge: lowEdges.epa, passSuccessEdge: highEdges.success, rushSuccessEdge: lowEdges.success };
    const selected = selectFantasyMatchupEdges(position, edges);
    const player = { ...low, position, research: { ...low.research!, matchupEdges: selected } };
    expect(dfsMatchupValue(player, "trenches")).toBe(position === "RB" ? -3 : 3);
    expect(dfsMatchupValue(player, "epa")).toBe(position === "RB" ? -5 : 5);
  });
  it("joins DST only to the exact opponent passing pair and rejects conflicting copies", () => {
    const dst = buildDstRow({ dkId: "d", team: "no", gameKey: "g", salary: 3000, percentile: 70 });
    dst.opponent = "DET";
    dst.team = "NO";
    const edges = buildMatchupEdges();
    for (const key of ["epa", "success", "trenches"] as const) {
      edges[key] = { ...edges[key], rankDifference: 7, offenseRank: 3, defenseRank: 10,
        offense: { team: "det", rank: 3, value: 1, formattedValue: "1", label: "Pass offense" },
        defense: { team: "no", rank: 10, value: 1, formattedValue: "1", label: "Pass defense" } };
    }
    const joined = buildDfsDstDisplayEdges([dst], [{ matchupEdges: edges }, { matchupEdges: edges }]);
    expect(dfsMatchupValue(dst, "epa", { dstEdges: joined })).toBe(-7);
    expect(buildDfsDstDisplayEdges([{ ...dst, opponent: "kc" }], [{ matchupEdges: edges }]).size).toBe(0);
    expect(buildDfsDstDisplayEdges([dst], [{ matchupEdges: { ...edges, mode: "rush" } }]).size).toBe(0);
    expect(buildDfsDstDisplayEdges([dst], [{ matchupEdges: edges }, { matchupEdges: { ...edges, epa: { ...edges.epa, rankDifference: 8 } } }]).size).toBe(0);
    expect(dfsMatchupValue(dst, "trenches")).toBeNull();
  });
  it("sorts DST score and rank separately", () => {
    const a = buildDstRow({ dkId: "a", team: "no", gameKey: "g", salary: 3000, percentile: 70 });
    const b = buildDstRow({ dkId: "b", team: "det", gameKey: "g", salary: 3000, percentile: 80 });
    a.dstMatchup!.dstMatchupRank = 2; b.dstMatchup!.dstMatchupRank = 1;
    expect(sortDfsRows([a, b], "dstScore", "desc")[0]).toBe(b);
    expect(sortDfsRows([a, b], "dstRank", "asc")[0]).toBe(b);
  });
});


it("sorts DEF VS AVG by the same canonical history summary displayed in the board", () => {
  const { index } = historyFixture();
  index.defenseDeltas["kc:passing:QB"] = [-10, -20];
  const a = row({ dkId: "a", playerName: "A", position: "QB", opponent: "det" });
  const b = row({ dkId: "b", playerName: "B", position: "QB", opponent: "kc" });
  const missing = row({ dkId: "c", playerName: "C", position: "QB", opponent: "nyg" });
  expect(sortDfsRows([b, missing, a], "defenseAvg", "desc", { historyIndex: index })).toEqual([a, b, missing]);
  expect(sortDfsRows([a, missing, b], "defenseAvg", "asc", { historyIndex: index })).toEqual([b, a, missing]);
});
