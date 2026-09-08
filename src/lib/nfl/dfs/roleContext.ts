import { z } from "zod";

export const sourceReferenceSchema = z.object({
  source: z.string(), asOf: z.string().nullable(), detail: z.string(),
});
export type DfsSourceReference = z.infer<typeof sourceReferenceSchema>;
const availabilitySchema = z.enum(["active", "questionable", "doubtful", "out", "reserve", "unknown"]);
export const roleEvidenceSchema = z.object({
  playerId: z.string(), team: z.string(), position: z.enum(["QB", "RB", "WR", "TE"]),
  season: z.number().int(), week: z.number().int(), gameId: z.string(), kickoff: z.string(),
  depthRank: z.number().int().positive().nullable(), depthAsOf: z.string().nullable(),
  starterEvidence: z.enum(["confirmed", "backup", "ambiguous", "unavailable"]),
  roleConflict: z.boolean(),
  projectedCarries: z.number().finite().nonnegative().nullable(),
  projectedTargets: z.number().finite().nonnegative().nullable(),
  usageAsOf: z.string().nullable(),
  usageEvidence: z.array(sourceReferenceSchema),
  availability: availabilitySchema, availabilityAsOf: z.string().nullable(),
  availabilityStale: z.boolean(), injuryFeedStale: z.boolean().optional(), sourceReferences: z.array(sourceReferenceSchema),
});
export type DfsRoleEvidence = z.infer<typeof roleEvidenceSchema>;
export type OptimizerEligibility = "eligible" | "ineligible" | "unknown";
export type EligibilityReason = keyof typeof ELIGIBILITY_REASON_LABELS;
export type DfsRoleContext = {
  optimizerEligibility: OptimizerEligibility;
  /** null is unknown, false is a positive exclusion decision. */
  optimizerEligible: boolean | null;
  roleClass: "primary" | "committee" | "secondary" | "backup" | "unknown";
  roleCertainty: "sourced" | "inferred" | "conflicting" | "unavailable";
  availability: z.infer<typeof availabilitySchema>;
  starterEvidence: DfsRoleEvidence["starterEvidence"];
  depthRank: number | null;
  projectedUsage: { carries: number | null; targets: number | null };
  usageEvidence: DfsSourceReference[];
  projectionThresholdResult: "pass" | "fail" | "unknown";
  usageThresholdResult: "pass" | "fail" | "unknown";
  reasonCodes: EligibilityReason[];
  sourceReferences: DfsSourceReference[];
  asOf: string;
  policyVersion: string;
};
export const ELIGIBILITY_REASON_LABELS = {
  QB_BACKUP_CONFIRMED: "Current depth chart lists a backup quarterback",
  NO_CURRENT_STARTER_EVIDENCE: "Current starting quarterback is not established",
  PROJECTION_BELOW_POSITION_THRESHOLD: "JKB projection is below the position minimum",
  PROJECTION_UNAVAILABLE: "JKB projection is unavailable",
  USAGE_BELOW_POSITION_THRESHOLD: "Projected opportunity is below the position minimum",
  USAGE_UNAVAILABLE: "Current weekly opportunity is unavailable",
  ROLE_CONFLICT: "Current role evidence conflicts",
  OUT: "Listed out for this contest or week",
  RESERVE: "Listed on reserve",
  DOUBTFUL: "Doubtful status needs review",
  QUESTIONABLE_ALLOWED: "Questionable status does not exclude a player",
  AVAILABILITY_UNAVAILABLE: "Current availability is not established",
  STALE_AVAILABILITY_DATA: "Older availability evidence was disregarded",
  STALE_ROLE_DATA: "Depth-chart evidence is older than 48 hours or future-dated",
  STALE_USAGE_DATA: "Weekly opportunity evidence is older than 48 hours or future-dated",
  UNRESOLVED_ROLE: "No usable current role evidence",
  COMMITTEE_ROLE_ALLOWED: "Sourced committee role meets the opportunity rule",
  PRIMARY_ROLE_ALLOWED: "Sourced primary role meets the opportunity rule",
  WEEKLY_USAGE_ALLOWED: "Weekly projected opportunity meets the position minimum",
  STARTER_CONFIRMED: "Current depth chart establishes the starting quarterback",
  IDENTITY_UNRESOLVED: "Player or game could not be joined safely",
} as const;

export function isFreshDfsSource(sourceAsOf: string | null, asOf: string, maxHours: number): boolean {
  if (!sourceAsOf) return false;
  const age = Date.parse(asOf) - Date.parse(sourceAsOf);
  return Number.isFinite(age) && age >= 0 && age <= maxHours * 3_600_000;
}
