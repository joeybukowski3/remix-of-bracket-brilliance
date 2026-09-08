import { computeDepthChartStaleness } from "@/lib/nfl/props/currentWeekDepthChart";
import { OPTIMIZER_ELIGIBILITY_V1 as POLICY } from "./policies/optimizerEligibilityV1";
import { isFreshDfsSource, type DfsRoleContext, type DfsRoleEvidence, type EligibilityReason } from "./roleContext";

export function evaluateOptimizerEligibility(input: {
  position: DfsRoleEvidence["position"]; projectedFantasyPoints: number | null;
  evidence: DfsRoleEvidence | null; dkStatus: string | null; asOf: string;
  identityResolved?: boolean;
}): DfsRoleContext {
  const { position, evidence: e, asOf } = input;
  const policy = POLICY.positions[position];
  const reasons: EligibilityReason[] = [];
  const depthFresh = e != null && !computeDepthChartStaleness(e.depthAsOf, asOf).isStale;
  const usageFresh = e != null && isFreshDfsSource(e.usageAsOf, asOf, POLICY.maxUsageAgeHours);
  const availabilityFresh = e != null && !e.availabilityStale && isFreshDfsSource(e.availabilityAsOf, asOf, POLICY.maxAvailabilityAgeHours);
  if (e?.depthAsOf && !depthFresh) reasons.push("STALE_ROLE_DATA");
  if (e?.usageAsOf && !usageFresh) reasons.push("STALE_USAGE_DATA");
  if (e?.injuryFeedStale || e?.availabilityStale || (e?.availabilityAsOf && !availabilityFresh)) reasons.push("STALE_AVAILABILITY_DATA");
  const depthRank = depthFresh ? e!.depthRank : null;
  const starterEvidence = depthFresh ? e!.starterEvidence : "unavailable";
  const conflict = depthFresh && (e!.roleConflict || starterEvidence === "ambiguous");
  const carries = usageFresh ? e!.projectedCarries : null;
  const targets = usageFresh ? e!.projectedTargets : null;
  const roleClass: DfsRoleContext["roleClass"] = conflict ? "unknown" : depthRank === 1 ? "primary"
    : depthRank != null && depthRank <= policy.roleDepth ? "committee"
      : depthRank == null ? "unknown" : position === "QB" || depthRank > policy.roleDepth + 1 ? "backup" : "secondary";
  const dk = ({ Q: "questionable", D: "doubtful", OUT: "out", IR: "reserve" } as const)[input.dkStatus?.trim().toUpperCase() ?? ""];
  const sourcedAvailability = availabilityFresh ? e!.availability : "unknown";
  // Restrictive current designations win; blank DK status is never proof of health.
  const statuses = [dk, sourcedAvailability];
  const availability = statuses.includes("out") ? "out" : statuses.includes("reserve") ? "reserve"
    : statuses.includes("doubtful") ? "doubtful" : statuses.includes("questionable") ? "questionable" : sourcedAvailability;
  const points = input.projectedFantasyPoints;
  const projectionThresholdResult = points == null || !Number.isFinite(points) ? "unknown" : points >= policy.points ? "pass" : "fail";
  let usageThresholdResult: DfsRoleContext["usageThresholdResult"] = "unknown";
  if (position === "QB") {
    if (!conflict && starterEvidence === "confirmed") { usageThresholdResult = "pass"; reasons.push("STARTER_CONFIRMED"); }
    else if (!conflict && starterEvidence === "backup") { usageThresholdResult = "fail"; reasons.push("QB_BACKUP_CONFIRMED"); }
    else reasons.push("NO_CURRENT_STARTER_EVIDENCE");
  } else {
    const numericPass = (policy.carries != null && carries != null && carries >= policy.carries)
      || (policy.targets != null && targets != null && targets >= policy.targets);
    if (numericPass) { usageThresholdResult = "pass"; reasons.push("WEEKLY_USAGE_ALLOWED"); }
    else if (roleClass === "primary" || roleClass === "committee") {
      usageThresholdResult = "pass";
      reasons.push(roleClass === "primary" ? "PRIMARY_ROLE_ALLOWED" : "COMMITTEE_ROLE_ALLOWED");
    } else if (position === "RB" ? carries != null && targets != null : targets != null) {
      usageThresholdResult = "fail"; reasons.push("USAGE_BELOW_POSITION_THRESHOLD");
    } else reasons.push("USAGE_UNAVAILABLE");
  }
  if (projectionThresholdResult === "fail") reasons.push("PROJECTION_BELOW_POSITION_THRESHOLD");
  if (projectionThresholdResult === "unknown") reasons.push("PROJECTION_UNAVAILABLE");
  if (conflict) reasons.push("ROLE_CONFLICT");
  if (roleClass === "unknown") reasons.push("UNRESOLVED_ROLE");
  if (availability === "out") reasons.push("OUT");
  if (availability === "reserve") reasons.push("RESERVE");
  if (availability === "doubtful") reasons.push("DOUBTFUL");
  if (availability === "questionable") reasons.push("QUESTIONABLE_ALLOWED");
  if (availability === "unknown") reasons.push("AVAILABILITY_UNAVAILABLE");
  if (input.identityResolved === false) reasons.push("IDENTITY_UNRESOLVED");
  const excluded = availability === "out" || availability === "reserve" || projectionThresholdResult === "fail" || usageThresholdResult === "fail";
  const uncertain = conflict || availability === "doubtful" || projectionThresholdResult === "unknown" || usageThresholdResult === "unknown" || input.identityResolved === false;
  const optimizerEligibility = excluded ? "ineligible" : uncertain ? "unknown" : "eligible";
  return {
    optimizerEligibility, optimizerEligible: optimizerEligibility === "unknown" ? null : optimizerEligibility === "eligible",
    roleClass, roleCertainty: conflict ? "conflicting" : depthRank != null ? "sourced" : usageFresh && (carries != null || targets != null) ? "inferred" : "unavailable",
    availability, starterEvidence, depthRank, projectedUsage: { carries, targets },
    usageEvidence: e?.usageEvidence ?? [], projectionThresholdResult, usageThresholdResult,
    reasonCodes: reasons, sourceReferences: [...(e?.sourceReferences ?? []), ...(dk ? [{ source: "DraftKings CSV Status", asOf: null, detail: `Contest signal: ${input.dkStatus}; observation timestamp unavailable` }] : [])],
    asOf, policyVersion: POLICY.version,
  };
}
