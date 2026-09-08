/** Read-only Week 1 slate audit. Optional --output writes this report only. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { parseDraftKingsNflClassicCsv } from "../src/lib/nfl/dfs/draftKingsCsv";
import { buildDfsSlateAnalysis, enrichDfsSlateAnalysis } from "../src/lib/nfl/dfs/slateAnalyzer";
import { assessDfsSlateCompatibility } from "../src/lib/nfl/dfs/artifactCompatibility";
import { assessDfsResearch } from "../src/lib/nfl/dfs/research";
import { resolveOffensiveIdentity, isDraftKingsOffensiveRow } from "../src/lib/nfl/dfs/identity";
import { attachDfsLineupContext, lineupContextSchema } from "../src/lib/nfl/dfs/lineupContext";
import { weeklyFantasyProjectionProductionArtifactSchema } from "../src/lib/fantasy/weekly/projections/production/artifactContract";
import { OPTIMIZER_ELIGIBILITY_V1 } from "../src/lib/nfl/dfs/policies/optimizerEligibilityV1";
import type { CanonicalNflTeam, NflGameRecord } from "../src/lib/nfl/standings";
const { values } = parseArgs({ options: { csv: { type:"string" }, context:{type:"string",default:"public/data/nfl/dfs/2026/week-01.json"}, "as-of":{type:"string",default:"2026-09-07T23:55:00Z"}, output:{type:"string"} } });
if(!values.csv) throw new Error("--csv required");
const text=readFileSync(values.csv,"utf8");
const parsed=parseDraftKingsNflClassicCsv(text);if(!parsed.accepted) throw new Error(JSON.stringify(parsed.diagnostics));
const read=(path:string)=>JSON.parse(readFileSync(path,"utf8"));
const p=weeklyFantasyProjectionProductionArtifactSchema.parse(read("public/data/fantasy/projections/2026/week-01.json"));
const projections=Object.values(p.rows).flat();
const games=read("public/data/nfl/2026/games.json").games as NflGameRecord[];
const baseline=buildDfsSlateAnalysis({dkRows:parsed.rows,projectionRows:projections,teams:read("public/data/nfl/teams.json").teams as CanonicalNflTeam[]});
const compatibility=assessDfsSlateCompatibility({dkRows:parsed.rows,selectedSeason:2026,selectedWeek:1,projectionArtifact:p,researchArtifact:null,canonicalGames:games,offensiveIdentityResolutions:parsed.rows.filter(isDraftKingsOffensiveRow).map(r=>resolveOffensiveIdentity(r,projections))});
const artifact=lineupContextSchema.parse(read(values.context!));
const enriched=enrichDfsSlateAnalysis(baseline,assessDfsResearch(projections,null,2026,1),compatibility);
const analysis=attachDfsLineupContext(enriched,artifact,{season:2026,week:1,asOf:values["as-of"]!});
const unchanged=baseline.rows.every(before=>{const after=analysis.rows.find(r=>r.dkId===before.dkId)!;return Object.keys(before).every(k=>JSON.stringify(before[k])===JSON.stringify(after[k]));});
if(!unchanged || baseline.rows.length!==analysis.rows.length) throw new Error("Baseline metric/visibility regression");
const lines=["# WU6C Week 1 Validation", "", `Audit as-of: ${values["as-of"]}. Input: ${values.csv}.`, `CSV SHA-256: ${createHash("sha256").update(text).digest("hex")}.`, `Rows: ${baseline.rows.length}; all baseline fields and rows preserved: ${unchanged}.`, "", "## Resolved Offense", "", "| Position | Resolved | Eligible | Ineligible | Unknown | Points floor | Usage / role rule |", "| --- | ---: | ---: | ---: | ---: | ---: | --- |"];
const distributions:string[]=["", "## Projection Distribution", "", "Linear interpolated quantiles; uploaded resolved players only.", "", "| Position | Min | P10 | P25 | Median | P75 | P90 | Max |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"];
const examples:string[]=["", "## Near-Cutoff Examples", "", "Nearest points floors; values are raw JKB points and usable weekly opportunity.","", "| Position | Player | Points | Carries | Targets | Role | Eligibility |", "| --- | --- | ---: | ---: | ---: | --- | --- |"];
const f=(v:number|null|undefined)=>v==null?"N/A":v.toFixed(2);
const quantiles=(values:number[])=>{const a=[...values].sort((a,b)=>a-b);return [0,.1,.25,.5,.75,.9,1].map(q=>{const n=(a.length-1)*q;return a.length?a[Math.floor(n)]+(a[Math.ceil(n)]-a[Math.floor(n)])*(n%1):null;});};
for(const pos of ["QB","RB","WR","TE"] as const){
  const rows=analysis.rows.filter(r=>r.kind==="offense").filter(r=>r.position===pos&&r.projectedFantasyPoints!=null);
  const policy=OPTIMIZER_ELIGIBILITY_V1.positions[pos];
  lines.push(`| ${pos} | ${rows.length} | ${rows.filter(r=>r.optimizerEligibility==="eligible").length} | ${rows.filter(r=>r.optimizerEligibility==="ineligible").length} | ${rows.filter(r=>r.optimizerEligibility==="unknown").length} | ${policy.points} | ${pos==="QB"?"Unique current sourced starter":`${policy.carries==null?"":`${policy.carries} carries OR `}${policy.targets} targets OR sourced depth <= ${policy.roleDepth}`} |`);
  distributions.push(`| ${pos} | ${quantiles(rows.map(r=>r.projectedFantasyPoints!)).map(f).join(" | ")} |`);
  for(const r of [...rows].sort((a,b)=>Math.abs(a.projectedFantasyPoints!-policy.points)-Math.abs(b.projectedFantasyPoints!-policy.points)).slice(0,4)) examples.push(`| ${pos} | ${r.playerName} | ${f(r.projectedFantasyPoints)} | ${f(r.roleContext?.projectedUsage.carries)} | ${f(r.roleContext?.projectedUsage.targets)} | ${r.roleContext?.roleClass} | ${r.optimizerEligibility} |`);
}
lines.push(...distributions,...examples,"","## Backup QB Regression","","| Player | JKB Points | Depth | Starter Evidence | Eligibility | Reasons |","| --- | ---: | ---: | --- | --- | --- |");
for(const name of ["Stetson Bennett IV","Sam Howell","Carson Wentz","Joe Flacco"]){const r=analysis.rows.find(r=>r.kind==="offense"&&r.playerName===name);lines.push(r&&r.kind==="offense"?`| ${name} | ${f(r.projectedFantasyPoints)} | ${r.roleContext?.depthRank} | ${r.roleContext?.starterEvidence} | ${r.optimizerEligibility} | ${r.eligibilityReasons?.join(", ")} |`:`| ${name} | Absent | | | | |`);}
const dst=analysis.rows.filter(r=>r.kind==="dst").sort((a,b)=>(a.dstMatchup?.dstMatchupRank??Infinity)-(b.dstMatchup?.dstMatchupRank??Infinity)||a.team.localeCompare(b.team));
lines.push("","## Uploaded DST Rankings","","Composite, not projected fantasy points. No predictive calibration claimed.","","| DST | Opponent | Score | Percentile | Rank | Coverage | Opp points | OFF | Trench edge | DK Avg PPG |","| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
for(const r of dst){const d=r.dstMatchup!;lines.push(`| ${r.team} | ${r.opponent} | ${f(d.dstMatchupScore)} | ${f(d.dstMatchupPercentile)} | ${d.dstMatchupRank??"N/A"} | ${f(d.componentCoverage*100)}% | ${f(d.componentScores.opponentPoints.value)} | ${f(d.componentScores.opponentOffense.value)} | ${f(d.componentScores.trenches.value)} | ${f(r.dkAvgPointsPerGame)} |`);}
lines.push("",`Top five: ${dst.slice(0,5).map(r=>r.team).join(", ")}. Bottom five: ${dst.slice(-5).map(r=>r.team).join(", ")}.`,"","## Limitations","","- 2025 Week 12 injury feed is disregarded. Weekly roster capture is date-only; depth snapshot is September 6 11:29:30 UTC; yardage generated September 6 16:21:14 UTC.","- WR depth is a formation-slot ordinal. Only depth 1 supplies the WR role-only allowance; other WRs need numeric targets.","- Rushing is published per-player carries, not a finite pool. Receiving uses production targets; missing/equal-split allocation is not zero.","- OFF is canonical preseason context. Trenches use ESPN 2025 full season. Market freshness has an upstream commit timestamp, not individual line observation times.","- No canonical DST fantasy PPG history or point-in-time historical feature reconstruction supports calibration. The historical PPG factor is unavailable; scores use 80% weight coverage.","- Unknown availability alone is disclosed but does not exclude otherwise qualifying players. Clear backup evidence overrides positive QB baseline projections.","- All projections, rank populations, Rank Diff, Pts/$1K and 813 uploaded rows are preserved; DK Avg PPG is a benchmark, not consensus.");
const report=lines.join("\n")+"\n";
if(values.output){mkdirSync(dirname(values.output),{recursive:true});writeFileSync(values.output,report);}else console.log(report);
console.log(`Validated ${analysis.rows.length} rows; baseline fields unchanged: ${unchanged}`);
