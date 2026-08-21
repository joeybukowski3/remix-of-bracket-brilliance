import type { FantasyAvailabilityStatus } from "@/lib/fantasy/weekly/availability";

export type WeeklyEligibility = {
  eligible: boolean;
  reasons: Array<"bye" | "out" | "reserve" | "unresolved-identity">;
};

export function resolveWeeklyEligibility(input: {
  identityResolved: boolean;
  homeAway: "home" | "away" | "neutral" | "bye" | "unknown";
  availabilityStatus: FantasyAvailabilityStatus;
}): WeeklyEligibility {
  const reasons: WeeklyEligibility["reasons"] = [];
  if (!input.identityResolved) reasons.push("unresolved-identity");
  if (input.homeAway === "bye") reasons.push("bye");
  if (input.availabilityStatus === "out") reasons.push("out");
  if (input.availabilityStatus === "reserve") reasons.push("reserve");
  return { eligible: reasons.length === 0, reasons };
}
