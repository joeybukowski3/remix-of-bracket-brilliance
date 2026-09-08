import { describe, expect, it } from "vitest";
import { evaluateOptimizerEligibility } from "./optimizerEligibility";
import type { DfsRoleEvidence } from "./roleContext";

const asOf = "2026-09-07T23:55:00Z";
function evidence(position: DfsRoleEvidence["position"], overrides: Partial<DfsRoleEvidence> = {}): DfsRoleEvidence {
  return { playerId: "gsis:test", team: "buf", position, season: 2026, week: 1, gameId: "g", kickoff: "2026-09-13T17:00:00Z",
    depthRank: 1, depthAsOf: "2026-09-06T11:29:30Z", starterEvidence: position === "QB" ? "confirmed" : "unavailable", roleConflict: false,
    projectedCarries: null, projectedTargets: null, usageAsOf: asOf, usageEvidence: [], availability: "active", availabilityAsOf: asOf, availabilityStale: false, sourceReferences: [], ...overrides };
}
function run(position: DfsRoleEvidence["position"], points = 15, overrides: Partial<DfsRoleEvidence> = {}, dkStatus: string | null = null) {
  return evaluateOptimizerEligibility({ position, projectedFantasyPoints: points, evidence: evidence(position,overrides), dkStatus, asOf });
}
describe("optimizer eligibility v1", () => {
  it("allows a sourced QB starter without invented attempts", () => {
    const r = run("QB"); expect(r.optimizerEligibility).toBe("eligible"); expect(r.projectedUsage).toEqual({ carries: null, targets: null });
  });
  it.each([2,3])("excludes sourced QB depth %i despite positive baseline", depthRank => {
    const r = run("QB",20,{depthRank,starterEvidence:"backup"}); expect(r.optimizerEligible).toBe(false); expect(r.reasonCodes).toContain("QB_BACKUP_CONFIRMED");
  });
  it("keeps ambiguous QB evidence unknown", () => expect(run("QB",20,{starterEvidence:"ambiguous",roleConflict:true}).optimizerEligibility).toBe("unknown"));
  it("excludes a low-projection QB starter", () => expect(run("QB",7.99).reasonCodes).toContain("PROJECTION_BELOW_POSITION_THRESHOLD"));
  it("does not turn no-contrary-evidence into proof of a start", () => expect(run("QB",20,{depthRank:null,starterEvidence:"unavailable"}).optimizerEligible).toBeNull());
  it.each(["RB","TE"] as const)("allows primary and committee %s without historical volume", position => {
    expect(run(position).optimizerEligible).toBe(true);
    const committee=run(position,5,{depthRank:2}); expect(committee.optimizerEligible).toBe(true); expect(committee.reasonCodes).toContain("COMMITTEE_ROLE_ALLOWED");
  });
  it("allows an RB receiving role even with few carries", () => expect(run("RB",4,{depthRank:3,projectedCarries:1,projectedTargets:2}).optimizerEligible).toBe(true));
  it("excludes a deep RB below both weekly usage thresholds", () => expect(run("RB",4,{depthRank:4,projectedCarries:1,projectedTargets:0.4}).optimizerEligible).toBe(false));
  it("does not interpret a missing RB receiving allocation as zero", () => {
    const r=run("RB",4,{depthRank:4,projectedCarries:1});expect(r.optimizerEligible).toBeNull();expect(r.projectedUsage.targets).toBeNull();
  });
  it("allows WR target opportunity", () => expect(run("WR",5,{depthRank:3,projectedTargets:2}).optimizerEligible).toBe(true));
  it("excludes low-role WR", () => expect(run("WR",2.99,{depthRank:5,projectedTargets:1}).optimizerEligible).toBe(false));
  it("does not treat WR slot depth 2 as a primary role", () => expect(run("WR",5,{depthRank:2,projectedTargets:1}).optimizerEligible).toBe(false));
  it("leaves missing WR allocation unknown", () => expect(run("WR",5,{depthRank:4}).optimizerEligibility).toBe("unknown"));
  it("excludes backup TE with negligible points and targets", () => expect(run("TE",1,{depthRank:3,projectedTargets:0.5}).optimizerEligible).toBe(false));
  it("allows secondary TE above target floor", () => expect(run("TE",2,{depthRank:3,projectedTargets:1.5}).optimizerEligible).toBe(true));
  it.each(["OUT","IR"])("excludes DK %s", status => expect(run("QB",20,{},status).optimizerEligible).toBe(false));
  it.each(["out","reserve"] as const)("excludes current sourced %s", availability => expect(run("RB",10,{availability}).optimizerEligible).toBe(false));
  it("allows questionable but leaves doubtful for review", () => { expect(run("RB",10,{},"Q").optimizerEligible).toBe(true);expect(run("RB",10,{},"D").optimizerEligible).toBeNull(); });
  it("does not use a stale injury feed as proof of out", () => {
    const r=run("RB",10,{availability:"out",availabilityStale:true,availabilityAsOf:"2025-11-01T00:00:00Z"});expect(r.availability).toBe("unknown");expect(r.optimizerEligible).toBe(true);expect(r.reasonCodes).toContain("STALE_AVAILABILITY_DATA");
  });
  it("fresh reserve wins over questionable DK", () => expect(run("RB",10,{availability:"reserve"},"Q").optimizerEligible).toBe(false));
  it.each(["2026-08-01T00:00:00Z","2026-09-08T00:00:00Z"])("disregards stale/future roles: %s", depthAsOf => expect(run("QB",20,{depthAsOf}).optimizerEligible).toBeNull());
  it("expires weekly projected usage without making it zero", () => {const r=run("WR",8,{depthRank:4,projectedTargets:6,usageAsOf:"2026-08-01T00:00:00Z"});expect(r.optimizerEligible).toBeNull();expect(r.projectedUsage.targets).toBeNull();});
  it("discloses a role conflict even above the usage floor", () => expect(run("WR",8,{roleConflict:true,projectedTargets:6}).optimizerEligible).toBeNull());
  it.each(["QB","RB","WR","TE"] as const)("all unknown %s decisions explain why", position => {
    const r=evaluateOptimizerEligibility({position,projectedFantasyPoints:null,evidence:null,dkStatus:null,asOf});expect(r.optimizerEligibility).toBe("unknown");expect(r.reasonCodes.length).toBeGreaterThan(0);
  });
});
