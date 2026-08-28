import { describe, expect, it } from "vitest";
import { assessDfsResearch, assessDfsResearchArtifactCompatibility } from "@/lib/nfl/dfs/research";
import { buildProjectionRow } from "@/lib/nfl/dfs/__fixtures__/projectionRowFactory";
import { buildMetric, buildResearchArtifact, buildResearchContext, buildResearchRow } from "@/lib/nfl/dfs/__fixtures__/researchFactory";

describe("assessDfsResearchArtifactCompatibility", () => {
  it("reports not-provided when no research artifact is supplied", () => {
    expect(assessDfsResearchArtifactCompatibility(null, 2026, 1)).toEqual({ status: "not-provided" });
  });

  it("reports compatible when season and week match exactly", () => {
    const artifact = buildResearchArtifact({ season: 2026, week: 1, rows: [] });
    expect(assessDfsResearchArtifactCompatibility(artifact, 2026, 1)).toEqual({ status: "compatible", season: 2026, week: 1 });
  });

  it("reports wrong-week when the artifact's own season/week differs, without substituting", () => {
    const artifact = buildResearchArtifact({ season: 2026, week: 2, rows: [] });
    expect(assessDfsResearchArtifactCompatibility(artifact, 2026, 1)).toEqual({
      status: "wrong-week",
      artifactSeason: 2026,
      artifactWeek: 2,
      expectedSeason: 2026,
      expectedWeek: 1,
    });
  });

  it("reports wrong-week for a season mismatch even when the week number matches", () => {
    const artifact = buildResearchArtifact({ season: 2025, week: 1, rows: [] });
    expect(assessDfsResearchArtifactCompatibility(artifact, 2026, 1).status).toBe("wrong-week");
  });
});

describe("assessDfsResearch — exact playerId join", () => {
  it("attaches the canonical research context/matchupEdges for a matched playerId", () => {
    const projectionRows = [buildProjectionRow({ playerId: "gsis:1", playerName: "Player One", position: "WR" })];
    const context = buildResearchContext({ seasonPpg: buildMetric({ value: 14.2, rank: 5 }) });
    const artifact = buildResearchArtifact({
      season: 2026,
      week: 1,
      rows: [buildResearchRow({ playerId: "gsis:1", position: "WR", context })],
    });

    const result = assessDfsResearch(projectionRows, artifact, 2026, 1);
    const research = result.byPlayerId.get("gsis:1");

    expect(research?.status).toBe("available");
    expect(research?.context).toBe(context);
    expect(research?.context?.seasonPpg.value).toBe(14.2);
  });

  it("does not alter the projection row when research is missing for a player", () => {
    const projectionRow = buildProjectionRow({ playerId: "gsis:2", playerName: "Player Two", position: "WR" });
    const artifact = buildResearchArtifact({ season: 2026, week: 1, rows: [] });

    const result = assessDfsResearch([projectionRow], artifact, 2026, 1);
    const research = result.byPlayerId.get("gsis:2");

    expect(research?.status).toBe("missing");
    expect(research?.context).toBeNull();
    expect(research?.matchupEdges).toBeNull();
    expect(projectionRow.projectedFantasyPoints).toBe(15); // unchanged from the factory default
  });

  it("reports null/N/A research and no compatibility crash when no artifact is supplied at all", () => {
    const projectionRow = buildProjectionRow({ playerId: "gsis:3", playerName: "Player Three", position: "RB" });
    const result = assessDfsResearch([projectionRow], null, 2026, 1);

    expect(result.compatibility).toEqual({ status: "not-provided" });
    expect(result.byPlayerId.get("gsis:3")?.status).toBe("missing");
    expect(result.byPlayerId.get("gsis:3")?.context).toBeNull();
  });

  it("does not join a wrong-week research artifact -- treats every player as missing research, core projection intact", () => {
    const projectionRow = buildProjectionRow({ playerId: "gsis:4", playerName: "Player Four", position: "TE", projectedFantasyPoints: 9.5 });
    const artifact = buildResearchArtifact({
      season: 2026,
      week: 2,
      rows: [buildResearchRow({ playerId: "gsis:4", position: "TE" })],
    });

    const result = assessDfsResearch([projectionRow], artifact, 2026, 1);

    expect(result.compatibility.status).toBe("wrong-week");
    expect(result.byPlayerId.get("gsis:4")?.status).toBe("missing");
    expect(result.byPlayerId.get("gsis:4")?.context).toBeNull();
    expect(projectionRow.projectedFantasyPoints).toBe(9.5);
  });

  it("follows the canonical join's position-mismatch policy: a same-playerId, different-position research row is not joined", () => {
    const projectionRow = buildProjectionRow({ playerId: "gsis:5", playerName: "Player Five", position: "WR" });
    const artifact = buildResearchArtifact({
      season: 2026,
      week: 1,
      rows: [buildResearchRow({ playerId: "gsis:5", position: "RB" })],
    });

    const result = assessDfsResearch([projectionRow], artifact, 2026, 1);
    const research = result.byPlayerId.get("gsis:5");

    expect(research?.status).toBe("position-mismatch");
    expect(research?.context).toBeNull();
    expect(result.mismatchedPositionPlayerIds).toContain("gsis:5");
  });
});

describe("assessDfsResearch — matchup grade derivation", () => {
  it("derives matchupGrade via the canonical getMatchupGrade helper from opponentFpaSeason.rank, never recomputing it", () => {
    const projectionRow = buildProjectionRow({ playerId: "gsis:6", playerName: "Player Six", position: "WR" });
    const context = buildResearchContext({ opponentFpaSeason: buildMetric({ rank: 3 }) });
    const artifact = buildResearchArtifact({
      season: 2026,
      week: 1,
      rows: [buildResearchRow({ playerId: "gsis:6", position: "WR", context })],
    });

    const result = assessDfsResearch([projectionRow], artifact, 2026, 1);
    expect(result.byPlayerId.get("gsis:6")?.matchupGrade?.id).toBe("great");
  });

  it("returns a null matchupGrade when there is no opponentFpaSeason rank", () => {
    const projectionRow = buildProjectionRow({ playerId: "gsis:7", playerName: "Player Seven", position: "WR" });
    const artifact = buildResearchArtifact({
      season: 2026,
      week: 1,
      rows: [buildResearchRow({ playerId: "gsis:7", position: "WR" })],
    });

    const result = assessDfsResearch([projectionRow], artifact, 2026, 1);
    expect(result.byPlayerId.get("gsis:7")?.matchupGrade).toBeNull();
  });
});

describe("assessDfsResearch — unsupported/position-specific evidence fields", () => {
  it("passes through null evidence fields for a position that does not carry them, without fabricating a value", () => {
    const projectionRow = buildProjectionRow({ playerId: "gsis:8", playerName: "Player Eight", position: "QB" });
    const context = buildResearchContext(); // all evidence fields default to null via createEmptyWeeklyFantasyResearchContext
    const artifact = buildResearchArtifact({
      season: 2026,
      week: 1,
      rows: [buildResearchRow({ playerId: "gsis:8", position: "QB", context })],
    });

    const result = assessDfsResearch([projectionRow], artifact, 2026, 1);
    const research = result.byPlayerId.get("gsis:8");
    expect(research?.context?.evidence.touches.value).toBeNull();
    expect(research?.context?.evidence.targetShare.value).toBeNull();
  });
});
