import { describe, expect, it } from "vitest";
import {
  buildNormalizedAvailability,
  determineCurrentRosterVerified,
  evaluateRankEligibility,
  isProjectionEligible,
  normalizeAvailabilityStatus,
} from "@/lib/fantasy/rosResearch/rankEligibility";

describe("normalizeAvailabilityStatus", () => {
  it("maps active/reserve/released/suspended directly", () => {
    expect(normalizeAvailabilityStatus("ACT", "active")).toBe("ACTIVE");
    expect(normalizeAvailabilityStatus("RES", "reserve")).toBe("RESERVE");
    expect(normalizeAvailabilityStatus("RLS", "released")).toBe("RELEASED");
    expect(normalizeAvailabilityStatus("SUS", "suspended")).toBe("SUSPENDED");
  });

  it("never emits INJURED -- PUP/RES fold into RESERVE per the repo's existing documented precedent", () => {
    expect(normalizeAvailabilityStatus("PUP", "reserve")).toBe("RESERVE");
  });

  it("maps DEV (practice squad) to RESERVE and RET (retired) to UNKNOWN, distinguished by raw code", () => {
    expect(normalizeAvailabilityStatus("DEV", "otherUnavailable")).toBe("RESERVE");
    expect(normalizeAvailabilityStatus("RET", "otherUnavailable")).toBe("UNKNOWN");
  });

  it("maps unknown category (and unmapped raw codes) to UNKNOWN", () => {
    expect(normalizeAvailabilityStatus("ZZZ", "unknown")).toBe("UNKNOWN");
    expect(normalizeAvailabilityStatus(null, "unknown")).toBe("UNKNOWN");
  });
});

describe("determineCurrentRosterVerified", () => {
  it("is true when the current-season roster snapshot itself reports active", () => {
    expect(determineCurrentRosterVerified({ verifiedByCurrentSeasonRoster: true, workbookTeam: null, parTeam: null })).toBe(true);
  });

  it("is true when workbook team and PAR team agree on a real team, after abbreviation normalization", () => {
    expect(determineCurrentRosterVerified({ verifiedByCurrentSeasonRoster: false, workbookTeam: "sf", parTeam: "SF" })).toBe(true);
    // wsh/WAS is an existing, reviewed alias in normalizeNflTeamAbbr -- not fuzzy matching.
    expect(determineCurrentRosterVerified({ verifiedByCurrentSeasonRoster: false, workbookTeam: "wsh", parTeam: "WAS" })).toBe(true);
  });

  it("is false when PAR team is the literal free-agent code, even if a workbook team is present", () => {
    expect(determineCurrentRosterVerified({ verifiedByCurrentSeasonRoster: false, workbookTeam: "kc", parTeam: "FA" })).toBe(false);
  });

  it("is false when the two sources disagree on team", () => {
    expect(determineCurrentRosterVerified({ verifiedByCurrentSeasonRoster: false, workbookTeam: "jax", parTeam: "PHI" })).toBe(false);
  });

  it("is false when either source is missing", () => {
    expect(determineCurrentRosterVerified({ verifiedByCurrentSeasonRoster: false, workbookTeam: null, parTeam: "WAS" })).toBe(false);
    expect(determineCurrentRosterVerified({ verifiedByCurrentSeasonRoster: false, workbookTeam: "was", parTeam: null })).toBe(false);
  });
});

describe("buildNormalizedAvailability -- traced regression cases", () => {
  it("Tyreek Hill: nflverse master-table RES (ambiguous) + PAR team FA escalates to FREE_AGENT, not verified", () => {
    const result = buildNormalizedAvailability({
      status: { category: "reserve", rawCode: "RES", source: "master-player-table", asOf: "2026-08-21" },
      parTeam: "FA",
      parTeamAsOf: "2026-08-13",
      workbookTeam: null,
    });
    expect(result.availabilityStatus).toBe("FREE_AGENT");
    expect(result.availabilitySource).toBe("par-consensus-team");
    expect(result.currentRosterVerified).toBe(false);
    expect(result.statusConflict).toBe(false);
  });

  it("Stefon Diggs: nflverse master-table ACT, but not independently verified (workbook team missing)", () => {
    const result = buildNormalizedAvailability({
      status: { category: "active", rawCode: "ACT", source: "master-player-table", asOf: "2026-08-21" },
      parTeam: "WAS",
      parTeamAsOf: "2026-08-13",
      workbookTeam: null,
    });
    expect(result.availabilityStatus).toBe("ACTIVE");
    expect(result.currentRosterVerified).toBe(false); // ambiguous: active per stale source, no second corroborating source
  });

  it("Deebo Samuel: same pattern as Diggs -- ACTIVE, not verified", () => {
    const result = buildNormalizedAvailability({
      status: { category: "active", rawCode: "ACT", source: "master-player-table", asOf: "2026-08-21" },
      parTeam: "SF",
      parTeamAsOf: "2026-08-13",
      workbookTeam: null,
    });
    expect(result.availabilityStatus).toBe("ACTIVE");
    expect(result.currentRosterVerified).toBe(false);
  });

  it("Brandon Aiyuk: nflverse master-table RLS but workbook+PAR both independently agree on SF -- verified AND flagged as a status conflict", () => {
    const result = buildNormalizedAvailability({
      status: { category: "released", rawCode: "RLS", source: "master-player-table", asOf: "2026-08-21" },
      parTeam: "SF",
      parTeamAsOf: "2026-08-13",
      workbookTeam: "sf",
    });
    expect(result.availabilityStatus).toBe("RELEASED");
    expect(result.currentRosterVerified).toBe(true);
    expect(result.statusConflict).toBe(true);
    expect(result.statusConflictReason).toContain("released");
  });
});

describe("evaluateRankEligibility policies R1/R2/R3", () => {
  it("R1 excludes only RELEASED", () => {
    expect(evaluateRankEligibility("R1", "RELEASED", false).rankEligible).toBe(false);
    expect(evaluateRankEligibility("R1", "FREE_AGENT", false).rankEligible).toBe(true);
    expect(evaluateRankEligibility("R1", "ACTIVE", false).rankEligible).toBe(true);
  });

  it("R2 excludes RELEASED and FREE_AGENT", () => {
    expect(evaluateRankEligibility("R2", "RELEASED", true).rankEligible).toBe(false);
    expect(evaluateRankEligibility("R2", "FREE_AGENT", false).rankEligible).toBe(false);
    expect(evaluateRankEligibility("R2", "ACTIVE", false).rankEligible).toBe(true);
    expect(evaluateRankEligibility("R2", "RESERVE", false).rankEligible).toBe(true);
  });

  it("R3 additionally excludes anyone without a verified current 2026 roster attachment", () => {
    expect(evaluateRankEligibility("R3", "ACTIVE", false).rankEligible).toBe(false);
    expect(evaluateRankEligibility("R3", "ACTIVE", true).rankEligible).toBe(true);
    expect(evaluateRankEligibility("R3", "RELEASED", true).rankEligible).toBe(false); // released is excluded outright, verified or not
  });

  it("always returns a non-null reason when excluded, and null when included", () => {
    const excluded = evaluateRankEligibility("R2", "FREE_AGENT", false);
    expect(excluded.rankEligibilityReason).not.toBeNull();
    const included = evaluateRankEligibility("R2", "ACTIVE", false);
    expect(included.rankEligibilityReason).toBeNull();
  });
});

describe("isProjectionEligible", () => {
  it("is true whenever a PPG value exists, independent of status", () => {
    expect(isProjectionEligible(12.3)).toBe(true);
    expect(isProjectionEligible(0)).toBe(true);
  });

  it("is false only when there is no projected PPG at all", () => {
    expect(isProjectionEligible(null)).toBe(false);
  });
});

describe("no status-based PPG penalty", () => {
  it("evaluateRankEligibility never reads or returns a PPG value", () => {
    const result = evaluateRankEligibility("R3", "RELEASED", false);
    expect(Object.keys(result)).toEqual(["rankEligible", "rankEligibilityReason"]);
  });
});
