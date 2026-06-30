import { useMemo, useState } from "react";
import type { HrDashboardBatter } from "@/pages/MlbHrProps";
import { panel, signalCategory, type NumerologyCardPlayer } from "./NumerologyAuditCard";
import { ExplorerFilters } from "./ExplorerFilters";
import { ExplorerTable, compareRowsBySort, nextSortState, type ExplorerRow, type SortField, type SortState } from "./ExplorerTable";
export function NumerologyExplorer({exact,root,hrBatters}:{exact:NumerologyCardPlayer[];root:NumerologyCardPlayer[];hrBatters?:HrDashboardBatter[]}){const[query,setQuery]=useState(""),[team,setTeam]=useState("all"),[matchType,setMatchType]=useState("all"),[fields,setFields]=useState<string[]>([]),[types,setTypes]=useState<string[]>([]),[sort,setSort]=useState<SortState>(null);const handleSort=(field:SortField)=>setSort(prev=>nextSortState(prev,field));const rows=useMemo<ExplorerRow[]>(()=>[...exact.map(p=>({...p,matchType:"Exact Match" as const})),...root.map(p=>({...p,matchType:"Root Match" as const}))],[exact,root]),teams=[...new Set(rows.map(p=>p.team))].sort(),filtered=rows.filter(p=>{if(team!=="all"&&p.team!==team)return false;if(matchType!=="all"&&p.matchType!==matchType)return false;if(query&&!`${p.playerName} ${p.team} ${p.opponent}`.toLowerCase().includes(query.toLowerCase()))return false;const signals=p.scoreBreakdown?.signals??[];if(fields.length&&!fields.some(f=>signals.some(s=>s.field===f)||p.matches?.some(m=>m.field===f)))return false;if(types.length&&!types.some(t=>signals.some(s=>signalCategory(s)===t)))return false;return true}).sort((a,b)=>{
  if(sort)return compareRowsBySort(a,b,sort);
  // Default ranking when no column sort is active (unchanged from prior behavior):
  // 1. Exact primary count descending
  const aExact=a.scoreBreakdown?.exactPrimaryCount??0;
  const bExact=b.scoreBreakdown?.exactPrimaryCount??0;
  if(bExact!==aExact)return bExact-aExact;
  // 2. Birthday exact target match
  const aBdExact=a.scoreBreakdown?.hasBirthdayExact?1:0;
  const bBdExact=b.scoreBreakdown?.hasBirthdayExact?1:0;
  if(bBdExact!==aBdExact)return bBdExact-aBdExact;
  // 3. Combo bonus (birthday+jersey, multiple strong fields)
  const aCombo=a.scoreBreakdown?.exactComboBonus??0;
  const bCombo=b.scoreBreakdown?.exactComboBonus??0;
  if(bCombo!==aCombo)return bCombo-aCombo;
  // 4. Birthday strong match (reduces to target)
  const aBdStrong=a.scoreBreakdown?.hasBirthdayStrong?1:0;
  const bBdStrong=b.scoreBreakdown?.hasBirthdayStrong?1:0;
  if(bBdStrong!==aBdStrong)return bBdStrong-aBdStrong;
  // 5. Calculated score desc
  const aCalc=a.scoreBreakdown?.calculatedScore??a.numerologyScore;
  const bCalc=b.scoreBreakdown?.calculatedScore??b.numerologyScore;
  if(bCalc!==aCalc)return bCalc-aCalc;
  // 6. Model rating as final tiebreaker only
  return (b.baseballScore??0)-(a.baseballScore??0);
});return <section id="explorer" className="mb-4 scroll-mt-20"><div className="mb-1.5 flex items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-wide text-[#e9c349]">Player Explorer</span><span className="text-xs text-[#958ea0]">Ranked results. Expand any row for the full scoring audit.</span></div><div className={`${panel} overflow-hidden`}><ExplorerFilters query={query} setQuery={setQuery} team={team} setTeam={setTeam} teams={teams} matchType={matchType} setMatchType={setMatchType} fields={fields} setFields={setFields} types={types} setTypes={setTypes}/><p className="px-4 py-2 text-xs text-[#958ea0]">Showing {filtered.length} players</p><ExplorerTable rows={filtered} hrBatters={hrBatters??[]} sort={sort} onSort={handleSort}/></div></section>}
