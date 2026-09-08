import type { DfsEnrichedAnalyzerRow } from "@/lib/nfl/dfs/slateAnalyzer";
import { ELIGIBILITY_REASON_LABELS } from "@/lib/nfl/dfs/roleContext";
import { OPTIMIZER_ELIGIBILITY_V1 } from "@/lib/nfl/dfs/policies/optimizerEligibilityV1";
import { DST_MATCHUP_V1 } from "@/lib/nfl/dfs/policies/dstMatchupV1";

const number = (value: number | null | undefined) => value == null ? "N/A" : value.toFixed(1);
export function DfsEligibilityIndicator({ row }: { row: DfsEnrichedAnalyzerRow }) {
  if (row.kind !== "offense") return null;
  const status = row.optimizerEligibility ?? "unknown";
  return <span className="mt-1 block text-[10px] font-semibold text-slate-700" title={row.eligibilityReasons?.map(r => ELIGIBILITY_REASON_LABELS[r]).join("; ")}>
    Optimizer: <span className={status === "ineligible" ? "text-rose-700" : status === "eligible" ? "text-emerald-700" : "text-amber-700"}>{status[0].toUpperCase() + status.slice(1)}</span>
  </span>;
}
export function DfsDstIndicator({ row }: { row: DfsEnrichedAnalyzerRow }) {
  if (row.kind !== "dst") return null;
  const d = row.dstMatchup;
  return <span className="block whitespace-normal text-[11px] font-semibold text-slate-700">
    DST Matchup Rank {d?.dstMatchupRank ?? "N/A"} | Score {number(d?.dstMatchupScore)} | Percentile {number(d?.dstMatchupPercentile)}
    <span className="block text-[10px] font-normal">Coverage {Math.round((d?.componentCoverage ?? 0) * 100)}%{d?.status === "partial" ? " (partial)" : ""}</span>
    <span className="block text-[10px] font-normal">No JKB DST projection</span>
  </span>;
}
export function DfsIntelligenceDetail({ row }: { row: DfsEnrichedAnalyzerRow }) {
  const role = row.kind === "offense" ? row.roleContext : null;
  const dst = row.kind === "dst" ? row.dstMatchup : null;
  return <div className="mb-3 space-y-1 text-[11px] text-slate-700">
    <p><strong>DK Avg PPG:</strong> {number(row.dkAvgPointsPerGame)} (CSV benchmark; window unspecified)</p>
    {role && <>
      <p><strong>Optimizer {role.optimizerEligibility}</strong> | Role: {role.roleClass} ({role.roleCertainty}) | Availability: {role.availability}</p>
      <p>JKB projection minimum: {OPTIMIZER_ELIGIBILITY_V1.positions[row.position as keyof typeof OPTIMIZER_ELIGIBILITY_V1.positions].points} | Projected carries: {number(role.projectedUsage.carries)} | Projected targets: {number(role.projectedUsage.targets)}</p>
      <ul className="list-inside list-disc">{role.reasonCodes.map(r => <li key={r}>{ELIGIBILITY_REASON_LABELS[r]}</li>)}</ul>
      <details><summary className="cursor-pointer">Role sources and timing</summary>{role.sourceReferences.map((s,i) => <p className="break-words" key={i}>{s.detail} | {s.asOf ?? "Time unavailable"} | {s.source}</p>)}<p>Evaluated {role.asOf} | {role.policyVersion}</p></details>
    </>}
    {dst && <>
      <DfsDstIndicator row={row} />
      {Object.entries(dst.componentScores).map(([key,c]) => <p key={key} className="break-words"><strong>{DST_MATCHUP_V1.components[key as keyof typeof DST_MATCHUP_V1.components].label}:</strong> {number(c.value)} | Component percentile {number(c.percentile)} | Effective weight {(c.effectiveWeight*100).toFixed(2)}% | {c.detail} | {c.asOf ?? "Time unavailable"}</p>)}
      {dst.warnings.map(w => <p key={w}>{w}</p>)}
      <p>{dst.policyVersion}; matchup composite, not a fantasy-point projection.</p>
    </>}
  </div>;
}
export default function NflDfsLineupMethodology() {
  return <details className="border-y border-slate-200 py-3 text-xs text-slate-700">
    <summary className="cursor-pointer font-bold text-slate-900">Optimizer Eligibility v1 / DST Matchup Score v1 methodology</summary>
    <div className="mt-3 space-y-3">
      <p>All uploaded players remain on the slate. Eligibility adds a separate selection status; JKB projections, salary ranks, slate ranks, Rank Diff and Pts/$1K retain their existing populations.</p>
      <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>Position</th><th>JKB points minimum</th><th>Weekly opportunity / role rule</th></tr></thead><tbody>
        {Object.entries(OPTIMIZER_ELIGIBILITY_V1.positions).map(([pos,p]) => <tr key={pos}><td className="py-1">{pos}</td><td>{p.points}</td><td>{pos === "QB" ? "One sourced current starter; no weekly attempt minimum" : `${p.carries == null ? "" : `${p.carries}+ carries OR `}${p.targets}+ targets OR sourced ${pos === "WR" ? "first-unit role" : `depth 1-${p.roleDepth} primary/committee role`}`}</td></tr>)}
      </tbody></table></div>
      <p>QB2/QB3 without starter evidence are ineligible. Missing or ambiguous starter evidence is unknown. OUT and reserve/IR are ineligible; doubtful is unknown unless another rule excludes; questionable is allowed. Blank DK status is not proof of health. Unknown availability alone does not exclude, but is disclosed. Stale injury evidence is disregarded.</p>
      <p>Depth, weekly opportunity and availability evidence expire after 48 hours. Missing usage is never zero. With sufficient points, a sourced qualifying role can satisfy the usage rule; otherwise missing usage or conflicting roles produce unknown. RB numeric failure requires both carries and targets to be known and below their minima. Rushing carries are the published per-player projection, not the shadow allocation; receiving equal-split fallbacks are unavailable. WR depth is within formation slots.</p>
      <p>DST factors: {Object.values(DST_MATCHUP_V1.components).map(c => `${c.label} ${Math.round(c.weight*100)}%`).join("; ")}. Lower opponent points/OFF and higher defensive trench advantage/historical PPG are favorable.</p>
      <p>Each available factor becomes a 0-100 percentile within uploaded DSTs using tied midranks divided by n-1; a singleton is 50. Score is the weighted mean. At least {DST_MATCHUP_V1.minimumCoverage*100}% original weight and {DST_MATCHUP_V1.minimumComponents} components are required; available weights are then renormalized and partial coverage is shown. Otherwise score/rank/percentile are unavailable. Competition ranks and score percentiles use only scored uploaded DSTs.</p>
      <p>Fresh market implied points use the source commit timestamp (individual line timing unavailable), with fresh JKB opponent team points as fallback. Week 1 uses canonical preseason OFF and 2025 ESPN pass-block/pass-rush ranks. Trench advantage is opponent pass-block rank minus defense pass-rush rank. No canonical DST fantasy PPG archive exists, so its 20% weight is unavailable; DK Avg PPG remains a separate CSV benchmark. This is a matchup composite, not a fantasy-point projection or historically calibrated expected score.</p>
      <p>Policies: {OPTIMIZER_ELIGIBILITY_V1.version}; {DST_MATCHUP_V1.version}.</p>
    </div>
  </details>;
}
