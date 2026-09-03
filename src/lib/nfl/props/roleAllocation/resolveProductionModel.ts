/**
 * WU4B S6 production packaging -- pure resolution step shared by the
 * production script and its tests. Combines the compact fitted artifact
 * with this week's WU4A team-opportunity rows into a ready-to-use
 * `NflReceivingShareModel`, or a typed failure reason. No filesystem I/O
 * here -- callers read the artifact JSON / team-opportunity rows themselves
 * (see `generate-nfl-current-week-yardage-projections.ts`) so this function
 * is trivially unit-testable against the exact hosted-runner condition:
 * artifact present, research dataset never referenced.
 */
import { loadReceivingRoleAllocationModel } from "./productionArtifact";
import type { NflReceivingShareModel } from "./receivingProduction";

export type NflReceivingV2Resolution =
  | { ok: true; model: NflReceivingShareModel; teamOpportunityDropbacksByTeam: Map<string, number> }
  | { ok: false; reason: string };

export function resolveReceivingV2ProductionModel(args: {
  artifactJson: unknown;
  teamOpportunityRows: readonly { team: string; week: number; projectedPassAttempts: number }[];
  week: number;
}): NflReceivingV2Resolution {
  let model: NflReceivingShareModel;
  try {
    model = loadReceivingRoleAllocationModel(args.artifactJson);
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
  const rows = args.teamOpportunityRows.filter((r) => r.week === args.week);
  if (rows.length === 0) {
    return { ok: false, reason: `WU4A team-opportunity artifact has no week-${args.week} rows.` };
  }
  return { ok: true, model, teamOpportunityDropbacksByTeam: new Map(rows.map((r) => [r.team, r.projectedPassAttempts])) };
}
