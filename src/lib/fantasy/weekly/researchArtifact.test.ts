import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getMatchupGrade } from "@/lib/fantasy/matchupGrade";
import { normalizeHistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import { buildWeeklyFantasyResearchContexts } from "@/lib/fantasy/weekly/researchContext";
import { weeklyFantasyProjectionProductionArtifactSchema } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import {
  assertWeeklyFantasyResearchArtifactIdentity,
  nflMatchupEdgeSchema,
  weeklyFantasyResearchArtifactPath,
  weeklyFantasyResearchArtifactSchema,
  weeklyFantasyResearchContextSchema,
} from "@/lib/fantasy/weekly/researchArtifact";

function fixture(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), relativePath), "utf8"));
}

describe("weekly fantasy research artifact", () => {
  const projection = weeklyFantasyProjectionProductionArtifactSchema.parse(
    fixture("public/data/fantasy/projections/2026/week-01.json"),
  );
  const research = weeklyFantasyResearchArtifactSchema.parse(
    fixture("public/data/fantasy/weekly-research/2026/week-01.json"),
  );

  it("uses a separate versioned path and contains no projection authority fields", () => {
    expect(weeklyFantasyResearchArtifactPath(2026, 1)).toBe("/data/fantasy/weekly-research/2026/week-01.json");
    expect(research.schemaVersion).toBe("weekly-fantasy-research-artifact-v1");
    for (const row of research.rows) {
      expect(row).not.toHaveProperty("positionRank");
      expect(row).not.toHaveProperty("projectedFantasyPoints");
    }
  });

  it("generates and validates companion evidence for a production projection row", () => {
    const projected = projection.rows.WR[0];
    const history = normalizeHistoricalPlayerWeek({
      season_type: "REG", season: 2026, week: 1,
      player_id: projected.playerId.replace("gsis:", ""),
      player_display_name: projected.playerName, position: projected.position,
      recent_team: projected.team, opponent_team: projected.opponent,
      passing_yards: 0, attempts: 0, completions: 0, passing_tds: 0, interceptions: 0,
      carries: 0, rushing_yards: 0, rushing_tds: 0,
      receptions: 4, targets: 8, receiving_yards: 40, receiving_tds: 0,
      sack_fumbles_lost: 0, rushing_fumbles_lost: 0, receiving_fumbles_lost: 0,
      passing_2pt_conversions: 0, rushing_2pt_conversions: 0,
      receiving_2pt_conversions: 0, special_teams_tds: 0,
    });
    expect(history).not.toBeNull();
    const context = buildWeeklyFantasyResearchContexts([projected], [history!], 2026, 2).get(projected.playerId)!;
    // Exercise the same output boundary as the CLI, without modifying artifacts.
    const parsed = weeklyFantasyResearchArtifactSchema.parse({
      ...research, week: 2,
      rows: [{ ...research.rows.find((row) => row.playerId === projected.playerId)!, context }],
    });
    expect(parsed.rows[0].context.evidence.targetsPerGameL5).toEqual({
      value: 8, rank: 1, poolSize: 1, sampleSize: 1, sampleSeason: 2026,
      games: [{ season: 2026, week: 1 }],
    });
  });

  it("decodes absent legacy L5 evidence as missing without inventing a value", () => {
    const context = structuredClone(research.rows[0].context);
    const { targetsPerGameL5: omitted, ...evidence } = context.evidence;
    expect(omitted).toBeDefined();
    expect(weeklyFantasyResearchContextSchema.parse({ ...context, evidence }).evidence.targetsPerGameL5).toEqual({
      value: null, rank: null, poolSize: 0, sampleSize: 0, sampleSeason: null, games: [],
    });
  });

  it("rejects malformed L5 evidence and unrelated evidence keys", () => {
    const context = research.rows[0].context;
    expect(() => weeklyFantasyResearchContextSchema.parse({
      ...context, evidence: { ...context.evidence, targetsPerGameL5: { ...context.evidence.targetsPerGameL5, value: "8" } },
    })).toThrow();
    expect(() => weeklyFantasyResearchContextSchema.parse({
      ...context, evidence: { ...context.evidence, arbitraryEvidence: 8 },
    })).toThrow(/Unrecognized key/);
  });

  it("upgrades legacy v1 normalized edges with explicit rank differences", () => {
    const edge = research.rows.find((row) => row.matchupEdges.epa.offense && row.matchupEdges.epa.defense)?.matchupEdges.epa;
    expect(edge).toBeDefined();
    expect(edge?.offenseRank).toBe(edge?.offense?.rank);
    expect(edge?.defenseRank).toBe(edge?.defense?.rank);
    expect(edge?.rankDifference).toBe((edge?.defense?.rank ?? 0) - (edge?.offense?.rank ?? 0));
    expect(edge).toHaveProperty("score");
  });

  it("rejects an explicit rank difference that disagrees with its component ranks", () => {
    expect(() => nflMatchupEdgeSchema.parse({
      score: 0,
      offenseRank: 4,
      defenseRank: 22,
      rankDifference: -18,
      offense: null,
      defense: null,
      source: "test",
      sampleLabel: "test",
    })).toThrow(/defenseRank - offenseRank/);
  });

  it("has an exact one-to-one canonical playerId set for all 498 projection rows", () => {
    assertWeeklyFantasyResearchArtifactIdentity(research);
    const projectionRows = (["QB", "RB", "WR", "TE"] as const).flatMap((position) => projection.rows[position]);
    expect(research.rows).toHaveLength(498);
    expect(new Set(research.rows.map((row) => row.playerId))).toEqual(new Set(projectionRows.map((row) => row.playerId)));
    const positions = new Map(research.rows.map((row) => [row.playerId, row.position]));
    expect(projectionRows.every((row) => positions.get(row.playerId) === row.position)).toBe(true);
  });

  it("stores the unchanged FPA-only matchup grade semantics", () => {
    for (const row of research.rows) {
      expect(row.matchupGrade).toBe(getMatchupGrade(row.context.opponentFpaSeason.rank)?.id ?? null);
    }
    expect(research.matchupGradeAuthority.input).toBe("opponentFpaSeason.rank");
  });

  it("keeps red-zone touches missing because the canonical history has no source field", () => {
    const runningBacks = research.rows.filter((row) => row.position === "RB");
    expect(runningBacks.length).toBeGreaterThan(0);
    expect(runningBacks.every((row) => row.context.evidence.redZoneTouches.value === null)).toBe(true);
    expect(runningBacks.every((row) => row.context.evidence.redZoneTouches.rank === null)).toBe(true);
  });
});
