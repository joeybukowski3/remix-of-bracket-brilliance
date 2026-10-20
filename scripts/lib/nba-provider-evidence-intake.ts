/** Validated, offline dashboard evidence intake. The output contains no credential fields. */
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { parseIncompleteProviderEvidence, parsePendingProviderEvidence } from "../../src/lib/nba/props/pipeline/providerEvidence";

export function appendPendingDashboardEvidence(file: string, input: unknown, now: Date): void {
  const dateOnly = typeof input === "object" && input !== null && "observedDate" in input;
  const evidence = dateOnly ? parseIncompleteProviderEvidence(input, now) : parsePendingProviderEvidence(input, now);
  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify({
    provider: "the-odds-api",
    provenance: "user-reported authenticated dashboard",
    status: "pending",
    evidence,
  })}\n`);
}
