import { z } from "zod";
import { normalizeNflTeamAbbr } from "@/lib/nfl/identity/identity";
import { roleEvidenceSchema } from "./roleContext";
import { dstInputSchema, rankDstMatchups } from "./dstMatchup";
import { evaluateOptimizerEligibility } from "./optimizerEligibility";
import type { DfsEnrichedSlateAnalysis } from "./slateAnalyzer";

export const lineupContextSchema = z.object({
  schemaVersion: z.literal("nfl-dfs-lineup-context-v1"),
  season: z.number().int(), week: z.number().int().min(1).max(18), generatedAt: z.string(),
  roles: z.array(roleEvidenceSchema), defenses: z.array(dstInputSchema),
  sources: z.array(z.object({ path: z.string(), sha256: z.string() })), warnings: z.array(z.string()),
});
export type DfsLineupContextArtifact = z.infer<typeof lineupContextSchema>;

export function attachDfsLineupContext(analysis: DfsEnrichedSlateAnalysis, artifact: DfsLineupContextArtifact | null, target: { season: number; week: number; asOf: string }): DfsEnrichedSlateAnalysis {
  const compatible = artifact?.season === target.season && artifact.week === target.week && Date.parse(artifact.generatedAt) <= Date.parse(target.asOf);
  const roles = compatible ? artifact.roles : [];
  const defenses = compatible ? artifact.defenses : [];
  const dst = rankDstMatchups(analysis.rows.filter(row => row.kind === "dst").map(row => {
    const candidates = defenses.filter(d => d.team === normalizeNflTeamAbbr(row.team) && d.gameId === row.canonicalGameId && d.opponent === row.opponent);
    return { dkId: row.dkId, input: row.identityStatus === "resolved" && !row.identityConflict && candidates.length === 1 ? candidates[0] : null };
  }), target.asOf);
  return { ...analysis, rows: analysis.rows.map(row => {
    if (row.kind === "dst") return { ...row, slateEligible: true, dstMatchup: dst.get(row.dkId)! };
    const candidates = roles.filter(e => e.playerId === row.playerId && e.team === normalizeNflTeamAbbr(row.team) && e.position === row.position && e.gameId === row.canonicalGameId && e.season === target.season && e.week === target.week);
    const roleContext = evaluateOptimizerEligibility({
      position: row.position, projectedFantasyPoints: row.projectedFantasyPoints,
      evidence: candidates.length === 1 ? candidates[0] : null, dkStatus: row.dkStatus, asOf: target.asOf,
      identityResolved: row.identityStatus === "resolved" && !row.identityConflict && row.canonicalGameId != null && row.teamMismatchStatus === "none",
    });
    return { ...row, slateEligible: true, roleContext, optimizerEligibility: roleContext.optimizerEligibility, eligibilityReasons: roleContext.reasonCodes };
  }) };
}
