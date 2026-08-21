import { resolveWeeklyEligibility } from "@/lib/fantasy/weekly/eligibility";

describe("weekly eligibility", () => {
  it.each([
    ["bye", "active", "bye"], ["home", "out", "out"], ["away", "reserve", "reserve"],
  ] as const)("marks %s/%s ineligible", (homeAway, availabilityStatus, reason) => {
    expect(resolveWeeklyEligibility({ identityResolved: true, homeAway, availabilityStatus }))
      .toEqual({ eligible: false, reasons: [reason] });
  });

  it("marks unresolved identity ineligible", () => {
    expect(resolveWeeklyEligibility({ identityResolved: false, homeAway: "home", availabilityStatus: "active" }))
      .toEqual({ eligible: false, reasons: ["unresolved-identity"] });
  });

  it("does not invent an exclusion for questionable or doubtful players", () => {
    expect(resolveWeeklyEligibility({ identityResolved: true, homeAway: "home", availabilityStatus: "questionable" }).eligible)
      .toBe(true);
    expect(resolveWeeklyEligibility({ identityResolved: true, homeAway: "away", availabilityStatus: "doubtful" }).eligible)
      .toBe(true);
  });
});
