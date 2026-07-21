import { describe, expect, it } from "vitest";
import {
  artifactMatchesCurrentTournament,
  buildUnavailableArtifact,
  finalizeSuccessfulArtifact,
  hasPublishedPicks,
  validateBestBetsInputs,
} from "../../../scripts/run-pga-best-bets-safe.mjs";

const FIELD = {
  validated: true,
  source: "pga-tour-official-field",
  tournament: "3M Open",
  tournamentId: "R2026525",
  localScheduleId: "three-m-open-2026",
  players: ["Keita Nakajima", "Cam Davis"],
};

const MODEL = {
  tournamentName: "3M Open",
  tournamentId: "three-m-open-2026",
  courseName: "TPC Twin Cities",
  rows: [{ rank: 1, player: "Cam Davis" }],
};

describe("PGA best-bets safe runner", () => {
  it("rejects an invalid field or wrong-tournament model", () => {
    expect(() => validateBestBetsInputs({ ...FIELD, validated: false }, MODEL)).toThrow(/unvalidated/i);
    expect(() => validateBestBetsInputs(FIELD, { ...MODEL, tournamentName: "Rocket Classic", tournamentId: "rocket-classic-2026" }))
      .toThrow(/mismatch/i);
  });

  it("matches current artifacts by official id, local id, or normalized name", () => {
    expect(artifactMatchesCurrentTournament({ tournamentId: "R2026525" }, FIELD)).toBe(true);
    expect(artifactMatchesCurrentTournament({ localScheduleId: "three-m-open-2026" }, FIELD)).toBe(true);
    expect(artifactMatchesCurrentTournament({ tournament: "3M Open" }, FIELD)).toBe(true);
    expect(artifactMatchesCurrentTournament({ tournament: "PGA Championship" }, FIELD)).toBe(false);
  });

  it("detects whether an artifact has publishable picks", () => {
    expect(hasPublishedPicks({ outrights: [{ player: "Cam Davis" }] })).toBe(true);
    expect(hasPublishedPicks({ outrights: [], top5: [], top10: [], top20: [] })).toBe(false);
  });

  it("builds a safe current-tournament unavailable artifact instead of preserving stale bets", () => {
    const output = buildUnavailableArtifact(FIELD, MODEL, "GROK_UNAVAILABLE", "2026-07-20T18:00:00.000Z");
    expect(output.tournament).toBe("3M Open");
    expect(output.course).toBe("TPC Twin Cities");
    expect(output.status).toBe("unavailable");
    expect(output.reason).toBe("GROK_UNAVAILABLE");
    expect(output.outrights).toEqual([]);
  });

  it("adds status metadata to successful current-tournament output", () => {
    const output = finalizeSuccessfulArtifact({
      tournament: "3M Open",
      course: "TPC Twin Cities",
      outrights: [{ player: "Cam Davis" }],
      top5: [{ player: "Cam Davis" }],
      top10: [],
      top20: [],
      valueBets: [],
    }, FIELD, MODEL);
    expect(output.schemaVersion).toBe(2);
    expect(output.status).toBe("partial");
    expect(output.reason).toBeNull();
    expect(output.sectionStatus).toEqual({ outrights: 1, top5: 1, top10: 0, top20: 0, article: 0 });
  });

  it("surfaces article availability independently of the 4-market pick status -- a missing article does not downgrade a full pick set", () => {
    const withoutArticle = finalizeSuccessfulArtifact({
      tournament: "3M Open",
      course: "TPC Twin Cities",
      outrights: [{ player: "Cam Davis" }],
      top5: [{ player: "Cam Davis" }],
      top10: [{ player: "Cam Davis" }],
      top20: [{ player: "Cam Davis" }],
      valueBets: [],
      article: null,
    }, FIELD, MODEL);
    expect(withoutArticle.status).toBe("available");
    expect(withoutArticle.sourceStatus.article).toBe("unavailable");
    expect(withoutArticle.sectionStatus.article).toBe(0);

    const withArticle = finalizeSuccessfulArtifact({
      ...withoutArticle,
      article: { title: "3M Open Preview", sections: [] },
    }, FIELD, MODEL);
    expect(withArticle.sourceStatus.article).toBe("available");
    expect(withArticle.sectionStatus.article).toBe(1);
  });

  it("does not mark NO_VALID_PICKS when model picks were retained through an odds failure", () => {
    const output = finalizeSuccessfulArtifact({
      tournament: "3M Open",
      course: "TPC Twin Cities",
      outrights: [{ player: "Cam Davis", odds: null }],
      top5: [{ player: "Cam Davis", odds: null }],
      top10: [{ player: "Cam Davis", odds: null }],
      top20: [{ player: "Cam Davis", odds: null }],
      valueBets: [],
      article: { title: "3M Open Preview", sections: [] },
      sourceStatus: { grok: "available" },
    }, FIELD, MODEL);
    expect(output.status).toBe("available");
    expect(output.reason).toBeNull();
    // Odds genuinely failed -- that much is still reported truthfully.
    expect(output.sourceStatus.odds).toBe("unavailable");
    // ...but a healthy Grok response is no longer relabeled as a Grok fault.
    expect(output.sourceStatus.grok).toBe("available");
  });

  it("reports the generator's observed Grok outcome rather than inferring it from pick counts", () => {
    // Grok really did return nothing usable: the generator says so explicitly.
    const genuineGrokFailure = finalizeSuccessfulArtifact({
      tournament: "3M Open",
      outrights: [], top5: [], top10: [], top20: [],
      valueBets: [],
      sourceStatus: { grok: "invalid-response" },
    }, FIELD, MODEL);
    expect(genuineGrokFailure.sourceStatus.grok).toBe("invalid-response");
    expect(genuineGrokFailure.reason).toBe("NO_VALID_PICKS");

    // Legacy artifacts predate the recorded status, so the old count-based
    // inference still applies as a fallback.
    const legacy = finalizeSuccessfulArtifact({
      tournament: "3M Open",
      outrights: [], top5: [], top10: [], top20: [],
      valueBets: [],
    }, FIELD, MODEL);
    expect(legacy.sourceStatus.grok).toBe("invalid-response");
  });

  it("refuses to finalize a stale prior-tournament artifact", () => {
    expect(() => finalizeSuccessfulArtifact({ tournament: "PGA Championship", outrights: [] }, FIELD, MODEL))
      .toThrow(/current field is 3M Open/i);
  });
});
