import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import teamsJson from "../../../public/data/nfl/teams.json";
import fixture from "../../../scripts/fixtures/nfl-personnel/personnel-evidence.fixture.json";
import {
  PERSONNEL_EVIDENCE_SCHEMA_VERSION,
  validatePersonnelEvidenceDataset,
} from "../../../scripts/lib/nfl-personnel/schema.mjs";
import {
  buildPersonIdentity,
  detectSameNameCollisions,
  normalizeCoachName,
  normalizePlayerName,
  stableId,
} from "../../../scripts/lib/nfl-personnel/identity.mjs";
import { buildReturningProductionMetric, metricIsUnavailable } from "../../../scripts/lib/nfl-personnel/returning-production.mjs";
import { collectDatasetTransactions, reconcileTransactions } from "../../../scripts/lib/nfl-personnel/transactions.mjs";
import { evaluatePersonnelCompleteness } from "../../../scripts/lib/nfl-personnel/completeness.mjs";
import { runPersonnelEvidenceGenerator } from "../../../scripts/generate-nfl-personnel-evidence.mjs";
import {
  buildNflOffseasonEvidenceDataset,
  mergeGeneratedPersonnelEvidenceDataset,
} from "@/lib/nfl/offseasonEvidence";

const ROOT = resolve(__dirname, "../../..");
const FIXTURE_PATH = join(ROOT, "scripts/fixtures/nfl-personnel/personnel-evidence.fixture.json");

function clone<T>(value: T): T {
  return structuredClone(value);
}

function validationCodes(validation: ReturnType<typeof validatePersonnelEvidenceDataset>) {
  return validation.errors.map((error) => error.code);
}

describe("NFL personnel evidence schema validation", () => {
  it("validates the synthetic fixture without requiring all 32 teams", () => {
    const validation = validatePersonnelEvidenceDataset(fixture, teamsJson);

    expect(fixture.schemaVersion).toBe(PERSONNEL_EVIDENCE_SCHEMA_VERSION);
    expect(validation.valid).toBe(true);
    expect(validation.warnings.some((warning) => warning.code === "same_name_collision")).toBe(true);
  });

  it("rejects unsupported schema versions and incomplete 32-team gates", () => {
    const badVersion = clone(fixture);
    badVersion.schemaVersion = "nfl-personnel-evidence-v9";

    expect(validationCodes(validatePersonnelEvidenceDataset(badVersion, teamsJson))).toContain(
      "unsupported_schema_version",
    );
    expect(validationCodes(validatePersonnelEvidenceDataset(fixture, teamsJson, { requireAllTeams: true }))).toContain(
      "incomplete_team_count",
    );
  });

  it("validates canonical teams and source references", () => {
    const badTeam = clone(fixture);
    badTeam.teams[0].teamId = "nfl-zzz";
    expect(validationCodes(validatePersonnelEvidenceDataset(badTeam, teamsJson))).toContain("invalid_team_id");

    const badSourceRef = clone(fixture);
    badSourceRef.teams[0].transactions[0].sourceRefs[0].sourceId = "missing-source";
    expect(validationCodes(validatePersonnelEvidenceDataset(badSourceRef, teamsJson))).toContain(
      "unknown_source_ref",
    );
  });

  it("rejects malformed retained shares, missing complete denominators, and zero-filled unavailable data", () => {
    const numeratorTooHigh = clone(fixture);
    numeratorTooHigh.teams[0].returningProduction.metrics.offensiveSnaps.numerator = 1200;
    expect(validationCodes(validatePersonnelEvidenceDataset(numeratorTooHigh, teamsJson))).toContain(
      "numerator_exceeds_denominator",
    );

    const completeMissingDenominator = clone(fixture);
    completeMissingDenominator.teams[0].returningProduction.metrics.defensiveSnaps.coverageComplete = true;
    expect(validationCodes(validatePersonnelEvidenceDataset(completeMissingDenominator, teamsJson))).toContain(
      "complete_missing_denominator",
    );

    const zeroFilled = clone(fixture);
    zeroFilled.teams[0].returningProduction.metrics.starts.value = 0;
    expect(validationCodes(validatePersonnelEvidenceDataset(zeroFilled, teamsJson))).toContain(
      "zero_filled_unavailable_metric",
    );
  });

  it("detects invalid dates, placeholder URLs, inconsistent QB status, and contradictory coaching status", () => {
    const badDates = clone(fixture);
    badDates.generatedAt = "not-a-date";
    badDates.sources[0].sourceUrl = "https://example.com/tbd";
    badDates.teams[0].quarterbackContinuity.status = "open_competition";
    badDates.teams[1].coachingContinuity.headCoach.status = "vacancy";

    const codes = validationCodes(validatePersonnelEvidenceDataset(badDates, teamsJson));
    expect(codes).toContain("invalid_date");
    expect(codes).toContain("placeholder_source_url");
    expect(codes).toContain("inconsistent_qb_status");
    expect(codes).toContain("contradictory_coaching_status");
  });

  it("contains no score, edge, pick, rating, or projection fields", () => {
    expect(JSON.stringify(fixture)).not.toMatch(/"(score|rating|edge|pick|projection)"/i);

    const bad = clone(fixture);
    bad.teams[0].qualityScore = 1;
    expect(validationCodes(validatePersonnelEvidenceDataset(bad, teamsJson))).toContain("forbidden_score_field");
  });
});

describe("NFL personnel identity helpers", () => {
  it("normalizes suffixes, punctuation, whitespace, apostrophes and hyphens", () => {
    expect(normalizePlayerName("  Route Player Jr. ")).toBe("route player");
    expect(normalizePlayerName("D.J. O'Neil-Smith III")).toBe("dj o neil smith");
    expect(normalizeCoachName("O'Brian  Smith")).toBe("o brian smith");
  });

  it("uses provider IDs when available and stable name-position-team fallback otherwise", () => {
    expect(buildPersonIdentity({ providerId: "provider-1", name: "Alex Same", position: "LB" }).identityKey).toBe(
      "provider:provider-1",
    );
    expect(buildPersonIdentity({ name: "Alex Same", position: "LB", teamId: "nfl-buf" }).identityKey).toBe(
      "name:alex-same:lb:nfl-buf",
    );
    expect(stableId(["NFL", "Route Player Jr.", "2026"])).toBe("nfl:route-player-jr:2026");
  });

  it("surfaces same-name collisions without merging provider-backed players", () => {
    const collisions = detectSameNameCollisions([
      { playerName: "Alex Same", providerId: "a" },
      { playerName: "Alex Same", providerId: "b" },
    ]);

    expect(collisions).toEqual([
      {
        normalizedName: "alex same",
        count: 2,
        providerIds: ["a", "b"],
        unresolvedCount: 0,
      },
    ]);
  });
});

describe("NFL personnel transaction reconciliation", () => {
  it("orders transactions chronologically and preserves a linked multi-team trade", () => {
    const result = reconcileTransactions(collectDatasetTransactions(fixture));

    expect(result.conflicts).toEqual([]);
    expect(result.movements.find((movement) => movement.movementId === "fixture-multi-team-trade-route")).toMatchObject({
      teams: ["nfl-buf", "nfl-mia", "nfl-ne"],
    });
    expect(result.transactions.map((tx) => tx.transactionDate)).toEqual(
      [...result.transactions.map((tx) => tx.transactionDate)].sort(),
    );
  });

  it("preserves release followed by later signing and retirement handling", () => {
    const result = reconcileTransactions(collectDatasetTransactions(fixture));
    const releaseIndex = result.transactions.findIndex((tx) => tx.transactionId === "fixture-release-signing-ne-release");
    const signingIndex = result.transactions.findIndex((tx) => tx.transactionId === "fixture-release-signing-buf-addition");

    expect(releaseIndex).toBeLessThan(signingIndex);
    expect(result.transactions.find((tx) => tx.transactionId === "fixture-retirement-mia")?.toTeamId).toBeNull();
  });

  it("merges duplicate source records and preserves conflicts for incompatible duplicates", () => {
    const duplicate = clone(fixture.teams[2].transactions[0]);
    duplicate.sourceRefs = [{ sourceId: "fixture-transactions", sourceRowId: "trade-route-4b" }];
    const merged = reconcileTransactions([...collectDatasetTransactions(fixture), duplicate]);
    const row = merged.transactions.find((tx) => tx.transactionId === duplicate.transactionId)!;

    expect(row.sourceRefs.map((ref) => ref.sourceRowId)).toEqual(["trade-route-4", "trade-route-4b"]);

    duplicate.toTeamId = "nfl-buf";
    const conflicted = reconcileTransactions([...collectDatasetTransactions(fixture), duplicate]);
    expect(conflicted.conflicts.some((conflict) => conflict.message.includes("conflicting toTeamId"))).toBe(true);
  });

  it("flags malformed movement chains and post-retirement additions", () => {
    const brokenMovement = clone(fixture.teams[0].transactions[0]);
    brokenMovement.transactionId = "fixture-broken-movement";
    brokenMovement.movementId = "fixture-broken-movement";

    const postRetirement = clone(fixture.teams[1].transactions.find((tx) => tx.transactionId === "fixture-retirement-mia")!);
    postRetirement.transactionId = "fixture-post-retirement-addition";
    postRetirement.type = "free_agent_signing";
    postRetirement.toTeamId = "nfl-buf";
    postRetirement.transactionDate = "2026-06-02";

    const result = reconcileTransactions([...collectDatasetTransactions(fixture), brokenMovement, postRetirement]);
    expect(result.conflicts.some((conflict) => conflict.message.includes("must include at least one trade departure and one trade addition"))).toBe(true);
    expect(result.conflicts.some((conflict) => conflict.message.includes("addition after retirement"))).toBe(true);
  });
});

describe("NFL personnel returning production and injury rules", () => {
  it("calculates retained shares only when numerator and denominator exist", () => {
    expect(buildReturningProductionMetric({ numerator: 25, denominator: 100 }).value).toBe(0.25);
    expect(buildReturningProductionMetric({ numerator: 25, denominator: null }).value).toBeNull();
    expect(metricIsUnavailable(buildReturningProductionMetric())).toBe(true);
  });

  it("does not infer medical readiness from injury-return evidence", () => {
    const injury = fixture.teams[0].injuryReturns[0];

    expect(injury.expectedReturnStatus).toBe("unknown");
    expect(injury.notes).toContain("No medical readiness inferred");
  });
});

describe("NFL personnel compatibility adapter", () => {
  it("supplements the stable offseason evidence contract and preserves manual evidence", () => {
    const base = buildNflOffseasonEvidenceDataset();
    const merged = mergeGeneratedPersonnelEvidenceDataset(base, fixture);
    const bufBase = base.records.find((record) => record.abbr === "buf")!;
    const bufMerged = merged.records.find((record) => record.abbr === "buf")!;

    expect(bufMerged.personnel.length).toBeGreaterThan(bufBase.personnel.length);
    expect(bufMerged.sources.some((source) => source.sourceId === "jkb-manual-offseason-2026")).toBe(true);
    expect(bufMerged.sources.some((source) => source.sourceId === "fixture-transactions")).toBe(true);
    expect(JSON.stringify(bufMerged)).not.toMatch(/qualityScore|improvement|decline/);
  });

  it("lets generated QB competition evidence supersede the current manual-derived value without erasing other fields", () => {
    const merged = mergeGeneratedPersonnelEvidenceDataset(buildNflOffseasonEvidenceDataset(), fixture);
    const miami = merged.records.find((record) => record.abbr === "mia")!;

    expect(miami.quarterbackContinuity).toBe("competition");
    expect(miami.coaching.length).toBeGreaterThan(0);
  });

  it("keeps generated coaching neutral", () => {
    const merged = mergeGeneratedPersonnelEvidenceDataset(buildNflOffseasonEvidenceDataset(), fixture);
    const miami = merged.records.find((record) => record.abbr === "mia")!;

    expect(miami.coaching.some((item) => item.kind === "new_head_coach")).toBe(true);
    expect(JSON.stringify(miami)).not.toMatch(/qualityScore|coachScore|rating/);
  });
});

describe("NFL personnel completeness gates and generator", () => {
  it("returns scoring-gate failures for fixture data", () => {
    const result = evaluatePersonnelCompleteness(fixture, teamsJson, {
      asOfDate: "2026-07-17",
      maxSourceAgeDays: 30,
    });

    expect(result.readyForScoring).toBe(false);
    expect(result.mandatoryFailures).toContain("expected all 32 canonical teams, received 3");
    expect(result.perTeamFailures["nfl-ne"]).toContain("QB continuity is not known or explicitly open competition");
    expect(result.advisoryWarnings.some((warning) => warning.includes("injury-return evidence unavailable"))).toBe(true);
  });

  it("produces deterministic generator output", () => {
    const first = runPersonnelEvidenceGenerator(fixture).json;
    const second = runPersonnelEvidenceGenerator(fixture).json;

    expect(second).toBe(first);
  });

  it("supports validate-only and dry-run CLI behavior without writing output", () => {
    const validateOnly = execFileSync("node", [
      "scripts/generate-nfl-personnel-evidence.mjs",
      "--season=2026",
      "--prior-season=2025",
      `--input=${FIXTURE_PATH}`,
      "--validate-only",
    ], { cwd: ROOT, encoding: "utf8" });
    expect(validateOnly).toContain('"validateOnly": true');
    expect(validateOnly).toContain('"wrote": false');

    const dir = mkdtempSync(join(tmpdir(), "nfl-personnel-dry-"));
    const output = join(dir, "personnel-evidence.json");
    try {
      const dryRun = execFileSync("node", [
        "scripts/generate-nfl-personnel-evidence.mjs",
        "--season=2026",
        "--prior-season=2025",
        `--input=${FIXTURE_PATH}`,
        `--output=${output}`,
        "--dry-run",
      ], { cwd: ROOT, encoding: "utf8" });
      expect(dryRun).toContain('"dryRun": true');
      expect(existsSync(output)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes deterministic bytes when output is requested", () => {
    const dir = mkdtempSync(join(tmpdir(), "nfl-personnel-write-"));
    const a = join(dir, "a.json");
    const b = join(dir, "b.json");
    try {
      for (const output of [a, b]) {
        execFileSync("node", [
          "scripts/generate-nfl-personnel-evidence.mjs",
          "--season=2026",
          "--prior-season=2025",
          `--input=${FIXTURE_PATH}`,
          `--output=${output}`,
        ], { cwd: ROOT });
      }
      expect(readFileSync(b, "utf8")).toBe(readFileSync(a, "utf8"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
