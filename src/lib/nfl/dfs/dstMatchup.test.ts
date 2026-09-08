import { describe, expect, it } from "vitest";
import { rankDstMatchups, dstPercentile, type DstMatchupInput, type DstComponentKey } from "./dstMatchup";
const asOf="2026-09-07T23:55:00Z";
function input(overrides: Partial<Record<DstComponentKey,number|null>> = {}): DstMatchupInput {
  const values={opponentPoints:24,opponentOffense:60,trenches:0,historicalPpg:6,...overrides};
  return {team:"buf",opponent:"hou",gameId:"g",kickoff:"2026-09-13T17:00:00Z",warnings:[],components:Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{value,source:"test",asOf,detail:"test window",maxAgeHours:48}])) as DstMatchupInput["components"]};
}
describe("DST matchup v1",()=>{
  it.each([["opponentPoints",18],["opponentOffense",30],["trenches",10],["historicalPpg",12]] as const)("correct favorable direction for %s",(key,value)=>{
    const r=rankDstMatchups([{dkId:"a",input:input()},{dkId:"b",input:input({[key]:value})}],asOf);
    expect(r.get("b")!.dstMatchupScore).toBeGreaterThan(r.get("a")!.dstMatchupScore!);expect(r.get("b")!.componentScores[key].percentile).toBe(100);
  });
  it("renormalizes a missing component at adequate coverage",()=>{
    const r=rankDstMatchups([{dkId:"a",input:input({historicalPpg:null})}],asOf).get("a")!;
    expect(r.componentCoverage).toBe(.8);expect(r.status).toBe("partial");expect(r.dstMatchupScore).toBe(50);expect(r.componentScores.opponentPoints.effectiveWeight).toBeCloseTo(.4375);expect(r.componentScores.historicalPpg.percentile).toBeNull();
  });
  it("allows exactly 60% original coverage and two components",()=>expect(rankDstMatchups([{dkId:"a",input:input({trenches:null,historicalPpg:null})}],asOf).get("a")!.status).toBe("partial"));
  it("fails closed below 60% coverage",()=>{
    const r=rankDstMatchups([{dkId:"a",input:input({opponentPoints:null,opponentOffense:null})}],asOf).get("a")!;expect(r.dstMatchupScore).toBeNull();expect(r.dstMatchupRank).toBeNull();expect(r.dstMatchupPercentile).toBeNull();expect(r.status).toBe("unavailable");
  });
  it("competition ranks and tied midrank percentiles are deterministic",()=>{
    const rows=[{dkId:"b",input:input()},{dkId:"a",input:input()},{dkId:"c",input:input({opponentPoints:30})}];
    const r=rankDstMatchups(rows,asOf),reversed=rankDstMatchups([...rows].reverse(),asOf);
    expect(r.get("a")!.dstMatchupRank).toBe(1);expect(r.get("b")!.dstMatchupRank).toBe(1);expect(r.get("c")!.dstMatchupRank).toBe(3);expect(r.get("a")!.dstMatchupPercentile).toBe(75);expect(r.get("a")).toEqual(reversed.get("a"));
  });
  it("does not fabricate fantasy points or offensive eligibility",()=>{
    const r=rankDstMatchups([{dkId:"a",input:input()}],asOf).get("a")!;expect(r).not.toHaveProperty("projectedFantasyPoints");expect(r).not.toHaveProperty("optimizerEligibility");
  });
  it("expires weekly factors and rejects future sources",()=>{
    const a=input();a.components.opponentPoints.asOf="2026-08-01T00:00:00Z";a.components.opponentOffense.asOf="2026-09-08T00:00:00Z";
    expect(rankDstMatchups([{dkId:"a",input:a}],asOf).get("a")!.dstMatchupScore).toBeNull();
  });
  it("has honest missing and singleton percentiles",()=>{expect(dstPercentile(1,[1],true)).toBe(50);expect(rankDstMatchups([{dkId:"a",input:null}],asOf).get("a")!.componentCoverage).toBe(0);});
});
