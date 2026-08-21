import { resolveWeeklyEligibility } from "@/lib/fantasy/weekly/eligibility";
import type { WeeklyInputBenchmark } from "@/lib/fantasy/weekly/__fixtures__/benchmarks";

export type BenchmarkCandidateOutput = {
  benchmarkId: string;
  score: number | null;
  confidence: "low" | "medium" | "high";
};

export function validateBenchmarkContracts(
  fixtures: readonly WeeklyInputBenchmark[],
  outputs: readonly BenchmarkCandidateOutput[] = [],
): string[] {
  const errors: string[] = [];
  const outputById = new Map(outputs.map((output) => [output.benchmarkId, output]));
  for (const fixture of fixtures) {
    const eligibility = resolveWeeklyEligibility({
      identityResolved: true,
      homeAway: fixture.input.homeAway,
      availabilityStatus: fixture.input.availability.status,
    });
    if (eligibility.eligible !== fixture.expectations.eligible) {
      errors.push(`${fixture.id}: eligibility contract changed`);
    }
    const output = outputById.get(fixture.id);
    if (!output) continue;
    if (!eligibility.eligible && output.score != null) errors.push(`${fixture.id}: ineligible player received a score`);
    if (fixture.expectations.missingAuthorities.length && output.confidence === "high") {
      errors.push(`${fixture.id}: missing authority received high confidence`);
    }
  }
  for (const position of ["rb", "wr", "te"]) {
    const elite = fixtures.find((fixture) => fixture.id.startsWith(`${position}-`) && fixture.scenario === "elite-poor");
    const average = fixtures.find((fixture) => fixture.id.startsWith(`${position}-`) && fixture.scenario === "average-favorable");
    const eliteScore = elite ? outputById.get(elite.id)?.score : null;
    const averageScore = average ? outputById.get(average.id)?.score : null;
    if (eliteScore != null && averageScore != null && eliteScore <= averageScore) {
      errors.push(`${position.toUpperCase()}: modest matchup downgrade erased elite baseline strength`);
    }
  }
  return errors;
}
