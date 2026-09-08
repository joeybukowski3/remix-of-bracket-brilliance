import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { attachDfsLineupContext, lineupContextSchema } from "./lineupContext";
import { buildDfsSlateAnalysis, enrichDfsSlateAnalysis } from "./slateAnalyzer";
import { assessDfsSlateCompatibility } from "./artifactCompatibility";
import { assessDfsResearch } from "./research";
import { parseDraftKingsNflClassicCsv } from "./draftKingsCsv";
import { buildDkRow } from "./__fixtures__/dkRowFactory";
import { weeklyFantasyProjectionProductionArtifactSchema } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import type { CanonicalNflTeam, NflGameRecord } from "@/lib/nfl/standings";
const read=(path:string)=>JSON.parse(readFileSync(path,"utf8"));
const artifact=lineupContextSchema.parse(read("public/data/nfl/dfs/2026/week-01.json"));
const fantasy=weeklyFantasyProjectionProductionArtifactSchema.parse(read("public/data/fantasy/projections/2026/week-01.json"));
const projections=Object.values(fantasy.rows).flat();
const teams=read("public/data/nfl/teams.json").teams as CanonicalNflTeam[];
const games=read("public/data/nfl/2026/games.json").games as NflGameRecord[];
const target={season:2026,week:1,asOf:artifact.generatedAt};
const dkRows=parseDraftKingsNflClassicCsv(readFileSync("src/lib/nfl/dfs/__fixtures__/draftkings-nfl-classic-week1-2026.csv","utf8")).rows;
function slate(rows=dkRows){
  return enrichDfsSlateAnalysis(buildDfsSlateAnalysis({dkRows:rows,projectionRows:projections,teams}),assessDfsResearch(projections,null,2026,1),assessDfsSlateCompatibility({dkRows:rows,projectionArtifact:fantasy,researchArtifact:null,selectedSeason:2026,selectedWeek:1,canonicalGames:games,offensiveIdentityResolutions:[]}));
}
describe("lineup context integration",()=>{
  it("preserves every existing metric and all uploaded rows",()=>{
    const before=slate(),snapshot=JSON.stringify(before);const after=attachDfsLineupContext(before,artifact,target);
    expect(after.rows).toHaveLength(before.rows.length);expect(JSON.stringify(before)).toBe(snapshot);
    before.rows.forEach((r,i)=>{expect(after.rows[i]).toMatchObject(r);expect(after.rows[i].slateEligible).toBe(true);});
    expect(after.summary).toEqual(before.summary);
  });
  it("normalizes only uploaded defenses, irrespective of off-slate context",()=>{
    const before=slate();const full=attachDfsLineupContext(before,artifact,target);
    const uploaded=new Set(before.rows.filter(r=>r.kind==="dst").map(r=>r.team.toLowerCase()));
    const subset={...artifact,defenses:artifact.defenses.filter(d=>uploaded.has(d.team))};
    expect(attachDfsLineupContext(before,subset,target)).toEqual(full);
    for(const r of full.rows.filter(r=>r.kind==="dst")){expect(r.dstMatchup?.dstMatchupRank).toBeLessThanOrEqual(uploaded.size);expect(r.projectedFantasyPoints).toBeNull();expect(r).not.toHaveProperty("optimizerEligibility");}
  });
  it("rejects wrong-week and future context without losing ranks",()=>{
    for(const source of [{...artifact,week:2},{...artifact,generatedAt:"2030-01-01T00:00:00Z"}]){
      const r=attachDfsLineupContext(slate(),source,target);expect(r.rows.filter(r=>r.kind==="dst").every(r=>r.dstMatchup?.dstMatchupScore===null)).toBe(true);
      expect(r.rows.filter(r=>r.kind==="offense").filter(r=>r.position==="QB").every(r=>r.optimizerEligibility==="unknown")).toBe(true);
    }
  });
  it("does not resolve duplicated role or defense records by last-write wins",()=>{
    const duplicate={...artifact,roles:[...artifact.roles,...artifact.roles],defenses:[...artifact.defenses,...artifact.defenses]};
    const r=attachDfsLineupContext(slate(),duplicate,target);expect(r.rows.filter(r=>r.kind==="dst").every(r=>r.dstMatchup?.dstMatchupRank===null)).toBe(true);
  });
  it.each(["Stetson Bennett IV","Sam Howell","Carson Wentz","Joe Flacco"])("keeps %s visible and excludes via current backup evidence",name=>{
    const p=projections.find(r=>r.playerName===name)!;expect(p).toBeDefined();
    const source=artifact.roles.find(r=>r.playerId===p.playerId)!;
    const before=slate([buildDkRow({dkId:p.playerId,name,teamAbbrev:p.team.toUpperCase()})]);
    // This regression isolates canonical role matching from the separate CSV game parser tests.
    before.rows[0].canonicalGameId=source.gameId;before.rows[0].opponent=p.opponent;
    const r=attachDfsLineupContext(before,artifact,target).rows[0];
    expect(r.kind).toBe("offense");if(r.kind!=="offense")throw new Error("Expected offense");
    expect(r.slateEligible).toBe(true);expect(r.optimizerEligibility).toBe("ineligible");expect(r.eligibilityReasons).toContain("QB_BACKUP_CONFIRMED");expect(r.projectedFantasyPoints).toBe(p.projectedFantasyPoints);
  });
  it("does not accept role evidence for another team or game",()=>{
    const wrong={...artifact,roles:artifact.roles.map(r=>({...r,team:"xxx"}))};
    const r=attachDfsLineupContext(slate(),wrong,target);expect(r.rows.filter(r=>r.kind==="offense").filter(r=>r.position==="QB").every(r=>r.optimizerEligibility==="unknown")).toBe(true);
  });
});
