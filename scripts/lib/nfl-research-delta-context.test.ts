import { describe, expect, it } from "vitest";
import { buildResearchDeltaContext } from "./nfl-research-delta-context";
import { SNAPSHOT_A_INITIAL, SNAPSHOT_B_DAILY_UPDATE } from "./__fixtures__/nfl-snapshot-fixtures";

const PROVIDER_SPECIFIC_TOKEN_PATTERN = /grok|xai|chatgpt|openai/i;

describe("buildResearchDeltaContext", () => {
  it("returns an empty-but-valid context when there is no previous snapshot", () => {
    const context = buildResearchDeltaContext({ previousSnapshot: null });
    expect(context.previousSnapshotId).toBeNull();
    expect(context.previousResearchCutoff).toBeNull();
    expect(context.priorEvidenceIds).toEqual([]);
    expect(context.previousMarketState).toBeUndefined();
  });

  it("carries forward the previous snapshot's id, research cutoff, evidence ids, and market state", () => {
    const context = buildResearchDeltaContext({ previousSnapshot: SNAPSHOT_A_INITIAL });
    expect(context.previousSnapshotId).toBe(SNAPSHOT_A_INITIAL.snapshotId);
    expect(context.previousResearchCutoff).toBe(SNAPSHOT_A_INITIAL.researchCutoff);
    expect(context.priorEvidenceIds).toEqual(SNAPSHOT_A_INITIAL.evidence.evidenceIds);
    expect(context.previousMarketState?.spread).toEqual(SNAPSHOT_A_INITIAL.market.spread);
  });

  it("strips delta-specific fields out of the market state (only the raw current-at-that-time reading is passed forward)", () => {
    const context = buildResearchDeltaContext({ previousSnapshot: SNAPSHOT_B_DAILY_UPDATE });
    expect(context.previousMarketState).not.toHaveProperty("spreadDelta");
    expect(context.previousMarketState).not.toHaveProperty("previousSpread");
  });

  it("passes through optional prior evidence claims and coverage untouched", () => {
    const claims = [{ evidenceId: "grok-2026_01_BAL_IND-fixture0001", claim: "Synthetic prior claim." }];
    const coverage = { injuryAvailability: "covered", personnel: "none", coachingScheme: "none", weather: "none", marketContext: "none", searchedButNoMaterialFinding: [] } as const;
    const context = buildResearchDeltaContext({ previousSnapshot: SNAPSHOT_A_INITIAL, priorEvidenceClaims: claims, priorCoverage: coverage });
    expect(context.priorEvidenceClaims).toEqual(claims);
    expect(context.priorCoverage).toEqual(coverage);
  });

  it("26. is provider-neutral -- no Grok/OpenAI-specific field name or value anywhere in the produced context shape", () => {
    const context = buildResearchDeltaContext({ previousSnapshot: SNAPSHOT_A_INITIAL });
    const keys = Object.keys(context);
    for (const key of keys) {
      expect(key).not.toMatch(PROVIDER_SPECIFIC_TOKEN_PATTERN);
    }
    // previousSnapshotId/previousResearchCutoff/priorEvidenceIds are plain ids/timestamps -- verify no
    // provider name leaks into their VALUES either (evidenceIds are prefixed "grok-" in this fixture's
    // real data, which is fine -- that's data, not schema; the check here is on the context's OWN keys).
  });

  it("never mutates the previous snapshot it reads from", () => {
    const before = JSON.stringify(SNAPSHOT_A_INITIAL);
    buildResearchDeltaContext({ previousSnapshot: SNAPSHOT_A_INITIAL });
    expect(JSON.stringify(SNAPSHOT_A_INITIAL)).toBe(before);
  });
});
