import { describe, expect, it } from "vitest";
import { auditPprOutcomes } from "./outcomeAudit";

describe("historical PPR outcome audit", () => {
  it("separates exact matches, missing upstream values, and genuine mismatches", () => {
    const audit = auditPprOutcomes([
      { season: 2023, week: 1, playerId: "gsis:a", calculated: 20, upstream: 20 },
      { season: 2023, week: 1, playerId: "gsis:b", calculated: 10.0000000001, upstream: 10 },
      { season: 2023, week: 1, playerId: "gsis:c", calculated: 8, upstream: 9 },
      { season: 2023, week: 1, playerId: "gsis:d", calculated: 0, upstream: null },
    ]);
    expect(audit).toMatchObject({ rows: 4, auditedRows: 3, exactMatches: 2, mismatchCount: 1, missingUpstream: 1, maximumDelta: 1 });
    expect(audit.mismatches[0]).toMatchObject({ playerId: "gsis:c", calculated: 8, upstream: 9, delta: 1 });
  });
});
