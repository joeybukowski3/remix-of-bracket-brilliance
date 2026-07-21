import { describe, expect, it } from "vitest";
import teamsArtifact from "../../../public/data/nfl/teams.json";
import { getNflOffseasonProfile, type NflOffseasonProfile } from "@/data/nflOffseason2026";
import { WS_TEAMS_2026, type WarrenSharpTeamProfile2026 } from "@/lib/nfl/warrenSharpTeams2026";
import {
  NFL_OFFSEASON_EVIDENCE_DATASET,
  buildNflOffseasonEvidenceDataset,
  buildNflOffseasonEvidenceRecord,
  deduplicateNflEvidence,
  getNflOffseasonEvidenceRecord,
  normalizeNflPersonName,
  validateNflOffseasonEvidence,
  type NflPersonnelEvidenceItem,
} from "@/lib/nfl/offseasonEvidence";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function defaultManualProfiles(): NflOffseasonProfile[] {
  return teamsArtifact.teams.map((team) => getNflOffseasonProfile(team.abbr));
}

function hasPropertyDeep(value: unknown, propertyName: string): boolean {
  if (!value || typeof value !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(value, propertyName)) return true;
  if (Array.isArray(value)) return value.some((entry) => hasPropertyDeep(entry, propertyName));
  return Object.values(value).some((entry) => hasPropertyDeep(entry, propertyName));
}

describe("NFL offseason evidence dataset", () => {
  it("builds exactly 32 deterministic canonical team records", () => {
    const first = buildNflOffseasonEvidenceDataset();
    const second = buildNflOffseasonEvidenceDataset();

    expect(first.records).toHaveLength(32);
    expect(first.records.map((record) => record.teamId)).toEqual(teamsArtifact.teams.map((team) => team.id));
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.metadata.teamCount).toBe(32);
  });

  it("joins source teams by canonical abbreviation and rejects orphan source teams", () => {
    expect(getNflOffseasonEvidenceRecord("nfl-jax")?.abbr).toBe("jax");
    expect(getNflOffseasonEvidenceRecord("JAX")?.teamId).toBe("nfl-jax");
    expect(getNflOffseasonEvidenceRecord("not-a-team")).toBeNull();

    const orphanTeams = clone(WS_TEAMS_2026) as WarrenSharpTeamProfile2026[];
    orphanTeams[0].abbr = "zzz";
    expect(() => buildNflOffseasonEvidenceDataset({ warrenSharpTeams: orphanTeams })).toThrow(/orphan team zzz/);
  });

  it("normalizes person names without merging suffix and punctuation variants incorrectly", () => {
    expect(normalizeNflPersonName("D. J. Moore")).toBe("d j moore");
    expect(normalizeNflPersonName("D.J. Moore")).toBe("dj moore");
    expect(normalizeNflPersonName("Dexter Lawrence II")).toBe("dexter lawrence");
    expect(normalizeNflPersonName("G - Chase Bisontis")).toBe("chase bisontis");
  });

  it("creates stable evidence IDs and preserves source paths, pages, and dates", () => {
    const jacksonville = getNflOffseasonEvidenceRecord("jax")!;
    const first = jacksonville.personnel.find((item) => item.playerName === "Trevor Lawrence")!;
    const second = buildNflOffseasonEvidenceRecord("jax").personnel.find((item) => item.playerName === "Trevor Lawrence")!;

    expect(first.id).toBe(second.id);
    expect(jacksonville.sources.some((source) => source.sourcePath === "src/data/nflWarrenSharpTeams2026.ts")).toBe(true);
    expect(jacksonville.sources.some((source) => source.sourceUpdatedAt === "2026-06-23")).toBe(true);
    expect(jacksonville.sources.every((source) => source.sourceUrl === null)).toBe(true);
    expect(
      jacksonville.coaching.some((item) =>
        item.sources.some((source) => source.sourcePath === "src/data/nflWarrenSharpTeams2026.ts" && typeof source.sourcePage === "number"),
      ),
    ).toBe(true);
  });

  it("merges multiple supporting sources for the same fact", () => {
    const atlanta = getNflOffseasonEvidenceRecord("atl")!;
    const tua = atlanta.personnel.find((item) => item.normalizedPlayerName === "tua tagovailoa")!;

    expect(tua.kind).toBe("free_agent_addition");
    expect(tua.sources.map((source) => source.sourceId).sort()).toEqual([
      "jkb-manual-offseason-2026",
      "warren-sharp-2026-team-profiles",
    ]);
  });

  it("keeps draft additions unproven by default", () => {
    const arizona = getNflOffseasonEvidenceRecord("ari")!;
    const rookie = arizona.personnel.find((item) => item.kind === "draft_addition")!;

    expect(rookie.expectedRole).toBe("developmental");
    expect(rookie.significance).toBe("unknown");
    expect(rookie.notes).toMatch(/Rookie remains unproven by default/);
  });

  it("keeps new coaches as neutral evidence rather than a quality score", () => {
    const atlanta = getNflOffseasonEvidenceRecord("atl")!;
    const headCoach = atlanta.coaching.find((item) => item.role === "head_coach")!;

    expect(headCoach.kind).toBe("new_head_coach");
    expect(headCoach.continuityStatus).toBe("new");
    expect(hasPropertyDeep(atlanta, "score")).toBe(false);
    expect(hasPropertyDeep(atlanta, "qualityScore")).toBe(false);
  });

  it("detects addition/departure and returning/departing conflicts", () => {
    const profiles = defaultManualProfiles();
    const arizona = profiles.find((profile) => profile.abbr === "ari")!;
    arizona.additions.push({ player: "Conflict Player", position: "WR", from: "buf", to: "ari", method: "Trade" });
    arizona.departures.push({ player: "Conflict Player", position: "WR", from: "ari", to: "buf", method: "Trade" });

    const jacksonville = profiles.find((profile) => profile.abbr === "jax")!;
    jacksonville.departures.push({ player: "Trevor Lawrence", position: "QB", from: "jax", to: "buf", method: "Trade" });

    const dataset = buildNflOffseasonEvidenceDataset({ manualProfiles: profiles });

    expect(dataset.validation.errors).toContain("ari: conflict player listed as both addition and departure");
    expect(dataset.validation.errors).toContain("jax: trevor lawrence listed as returning and departing");
    expect(dataset.metadata.unresolvedConflictCount).toBeGreaterThanOrEqual(2);
  });

  it("detects coaching contradictions without silently resolving them", () => {
    const profiles = defaultManualProfiles();
    const carolina = profiles.find((profile) => profile.abbr === "car")!;
    carolina.status = "Changed";
    carolina.headCoach2026 = "Different Coach";

    const dataset = buildNflOffseasonEvidenceDataset({ manualProfiles: profiles });

    expect(dataset.validation.errors).toContain("car: multiple head coaches without explicit transition");
    expect(dataset.records.find((record) => record.abbr === "car")?.confidence.level).toBe("low");
  });

  it("handles unknown quarterbacks and incomplete source coverage by lowering confidence", () => {
    const noQb = buildNflOffseasonEvidenceRecord("sea", { projectedQuarterbacks: {} });
    expect(noQb.quarterbackContinuity).toBe("unknown");
    expect(noQb.confidence.level).toBe("low");
    expect(noQb.confidence.missingReasons).toContain("quarterback continuity unknown");

    const withoutSeattleWs = buildNflOffseasonEvidenceDataset({
      warrenSharpTeams: WS_TEAMS_2026.filter((team) => team.abbr !== "sea"),
    });
    const seattle = withoutSeattleWs.records.find((record) => record.abbr === "sea")!;
    expect(seattle.coverage.additionsComplete).toBe(false);
    expect(seattle.coverage.departuresComplete).toBe(false);
    expect(seattle.coverage.coachingComplete).toBe(false);
    expect(seattle.confidence.level).toBe("low");
  });

  it("reports metadata completeness and confidence distribution without claiming undated sources are current", () => {
    expect(NFL_OFFSEASON_EVIDENCE_DATASET.metadata.teamConfidenceDistribution).toEqual({
      high: 0,
      medium: 32,
      low: 0,
    });
    expect(NFL_OFFSEASON_EVIDENCE_DATASET.metadata.completenessSummary).toMatchObject({
      additionsComplete: 32,
      departuresComplete: 32,
      returningPlayersComplete: 0,
      injuryReturnsComplete: 0,
      coachingComplete: 32,
    });
    expect(NFL_OFFSEASON_EVIDENCE_DATASET.metadata.sourceCutoffDates["src/data/nflWarrenSharpTeams2026.ts"]).toBeNull();
    expect(NFL_OFFSEASON_EVIDENCE_DATASET.metadata.sourceCutoffDates["src/data/nflOffseason2026.ts"]).toBe("2026-06-23");
  });

  it("provides richer and thinner representative records while preserving coverage flags", () => {
    const atlanta = getNflOffseasonEvidenceRecord("atl")!;
    const seattle = getNflOffseasonEvidenceRecord("sea")!;

    expect(atlanta.personnel.length).toBeGreaterThan(seattle.personnel.length);
    expect(atlanta.quarterbackContinuity).toBe("new_starter");
    expect(seattle.quarterbackContinuity).toBe("returning_starter");
    expect(seattle.coverage.injuryReturnsComplete).toBe(false);
  });

  it("deduplicates equivalent evidence rows and preserves multiple sources", () => {
    const sourceA = {
      sourceId: "a",
      sourceName: "A",
      sourceType: "other" as const,
      sourcePath: "a.ts",
      sourceUpdatedAt: null,
      sourcePage: null,
      sourceUrl: null,
      verified: false,
    };
    const sourceB = { ...sourceA, sourceId: "b", sourceName: "B", verified: true };
    const row: NflPersonnelEvidenceItem = {
      id: "temp",
      teamId: "nfl-jax",
      playerName: "Player One",
      normalizedPlayerName: "player one",
      position: "WR",
      kind: "other_addition",
      expectedRole: "unknown",
      significance: "unknown",
      evidenceStatus: "unverified",
      notes: null,
      source: sourceA,
      sources: [sourceA],
    };

    const deduped = deduplicateNflEvidence([
      row,
      {
        ...row,
        kind: "trade_addition",
        evidenceStatus: "verified",
        significance: "notable",
        source: sourceB,
        sources: [sourceB],
      },
    ]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0].kind).toBe("trade_addition");
    expect(deduped[0].evidenceStatus).toBe("verified");
    expect(deduped[0].sources.map((source) => source.sourceId)).toEqual(["a", "b"]);
  });

  it("validates duplicate team records", () => {
    const record = getNflOffseasonEvidenceRecord("jax")!;
    const validation = validateNflOffseasonEvidence([record, structuredClone(record)]);
    expect(validation.errors).toContain("duplicate team record nfl-jax");
    expect(validation.errors).toContain("duplicate team abbreviation jax");
  });
});
