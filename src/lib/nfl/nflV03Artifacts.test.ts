import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  NFL_V03_METRIC_KEYS,
  NFL_V03_PERFORMANCE_SEASONS,
  NFL_V03_PRESEASON_SEASONS,
  buildNflV03ArtifactSet,
  stripGeneratedAt,
  validateNflV03ArtifactSet,
} from "../../../scripts/lib/nfl-v03-artifacts.mjs";
import {
  classifyPrimaryTrajectory,
  classifyTrajectoryWithScheduleContext,
} from "../../../scripts/lib/nfl-power-v03-metrics.mjs";
import {
  validateContextFlags,
  validateManualAdjustments,
} from "../../../scripts/lib/nfl-v03-window-engine.mjs";
import {
  loadNflV03Inputs,
  writeNflV03Artifacts,
} from "../../../scripts/generate-nfl-v03-artifacts.mjs";

const ROOT = resolve(__dirname, "../../..");
const INPUT_DIR = join(ROOT, "public", "data", "nfl");
const FIXED_AT = "2026-07-14T12:00:00.000Z";
const SECOND_AT = "2026-07-14T12:05:00.000Z";
const FORBIDDEN = /\b(betting|odds?|moneyline|spread|markets?|picks?|probabilit(?:y|ies)|edge)\b/i;

let tempRoot: string;
let teamsJson: { teams: Array<{ id: string; slug: string; abbr: string; name: string }> };
let inputs: ReturnType<typeof loadNflV03Inputs>;
let first: ReturnType<typeof buildNflV03ArtifactSet>;
let second: ReturnType<typeof buildNflV03ArtifactSet>;

function artifact(season: number, filename: string) {
  return first[`${season}/${filename}`];
}

function manualEntry(overrides: Record<string, unknown> = {}) {
  return {
    team: "buf",
    component: "qb",
    value: 0.5,
    author: "model-owner",
    date: "2026-02-01",
    rationale: "Documented offseason personnel change.",
    sourceRef: "owner-source-1",
    reviewBy: "2026-07-01",
    expires: "2026-09-01",
    status: "active",
    ...overrides,
  };
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return [path];
  });
}

beforeAll(() => {
  tempRoot = mkdtempSync(join(tmpdir(), "nfl-v03-artifacts-"));
  inputs = loadNflV03Inputs({ inputDir: INPUT_DIR, outputDir: tempRoot });
  teamsJson = inputs.teamsJson;
  const inputSnapshot = JSON.stringify(inputs);
  first = buildNflV03ArtifactSet({ ...inputs, generatedAt: FIXED_AT });
  expect(JSON.stringify(inputs)).toBe(inputSnapshot);
  second = buildNflV03ArtifactSet({ ...inputs, generatedAt: SECOND_AT });
}, 60_000);

afterAll(() => {
  if (tempRoot && existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true });
});

describe("NFL v0.3 Stage-1 artifact schemas", () => {
  it("builds the exact 23-file season/type matrix", () => {
    expect(Object.keys(first)).toHaveLength(23);
    for (const season of NFL_V03_PERFORMANCE_SEASONS) {
      expect(artifact(season, "full-season-team-metrics.json")).toBeDefined();
      expect(artifact(season, "final-eight-team-metrics.json")).toBeDefined();
      expect(artifact(season, "context-flags.json")).toBeDefined();
    }
    for (const season of NFL_V03_PRESEASON_SEASONS) {
      expect(artifact(season, "preseason-power-ratings.json")).toBeDefined();
      expect(artifact(season, "manual-adjustments.json")).toBeDefined();
    }
    expect(validateNflV03ArtifactSet(first, { teamsJson })).toBe(true);
  });

  it("uses required metadata, formula, divisor, and trajectory constants everywhere", () => {
    for (const value of Object.values(first)) {
      expect(value._meta).toMatchObject({
        schemaVersion: "nfl-v0.2",
        modelVersion: "nfl-power-v0.3.0",
        validationStatus: "stage-1",
        frozenPublicScaleDivisor: 0.733,
        trajectory: { statement: "lambda = 0", lambda: 0, shrinkageK: 4, cap: 1 },
      });
      expect(
        Object.values(value._meta.formulaWeights).reduce(
          (sum: number, weight: number) => sum + weight,
          0
        )
      ).toBe(1);
    }
  });

  it("keeps full-season and final-eight metric keys and scale identical", () => {
    for (const season of [2022, 2023, 2024, 2025]) {
      const full = artifact(season, "full-season-team-metrics.json");
      const final = artifact(season, "final-eight-team-metrics.json");
      expect(full.metricKeys).toEqual(NFL_V03_METRIC_KEYS);
      expect(final.metricKeys).toEqual(full.metricKeys);
      expect(Object.keys(full.teams[0].metrics)).toEqual(Object.keys(final.teams[0].metrics));
    }
  });

  it("produces 32 complete teams and true kickoff-selected windows for 2022-2025", () => {
    for (const season of [2022, 2023, 2024, 2025]) {
      const full = artifact(season, "full-season-team-metrics.json");
      const final = artifact(season, "final-eight-team-metrics.json");
      expect(full.teams).toHaveLength(32);
      expect(final.teams).toHaveLength(32);
      for (const row of final.teams) {
        expect(row.windowSize).toBeLessThanOrEqual(8);
        expect(row.shortWindow).toBe(row.windowSize < 8);
        expect(row.metrics.offEpaPerPlay.missing).toBe(false);
        expect(row.metrics.defEpaPerPlay.missing).toBe(false);
        expect(row.metrics).toBeDefined();
        expect(row.metricsExFlagged).toBeDefined();
      }
    }
  });

  it("represents unavailable 2026 performance honestly while retaining 2025-derived preseason", () => {
    expect(artifact(2026, "full-season-team-metrics.json").teams).toEqual([]);
    expect(artifact(2026, "final-eight-team-metrics.json").teams).toEqual([]);
    expect(artifact(2026, "context-flags.json").flags).toEqual([]);
    expect(artifact(2026, "preseason-power-ratings.json").ratings).toHaveLength(32);
    expect(JSON.stringify(artifact(2026, "full-season-team-metrics.json"))).not.toMatch(
      /offEpaPerPlay\s*"\s*:\s*0/
    );
  });
});

describe("NFL v0.3 trajectory, context, and manual controls", () => {
  it("honors approved label boundaries and schedule-context classifications", () => {
    expect(classifyPrimaryTrajectory(0.499)).toBe("Stable");
    expect(classifyPrimaryTrajectory(0.5)).toBe("Late Riser");
    expect(classifyPrimaryTrajectory(-0.499)).toBe("Stable");
    expect(classifyPrimaryTrajectory(-0.5)).toBe("Late Decline");
    expect(classifyTrajectoryWithScheduleContext(0.5, 0.249)).toBe(
      "Schedule-Inflated Surge"
    );
    expect(classifyTrajectoryWithScheduleContext(-0.5, -0.249)).toBe(
      "Schedule-Masked Fade"
    );
  });

  it("rejects manual component, combined, rationale, source, team, and status failures", () => {
    expect(
      validateManualAdjustments([manualEntry({ value: 0.751 })], {
        canonicalTeams: teamsJson,
      }).errors.join(" ")
    ).toMatch(/qb adjustment/);
    expect(
      validateManualAdjustments(
        [manualEntry({ component: "coaching", value: 0.251 })],
        { canonicalTeams: teamsJson }
      ).errors.join(" ")
    ).toMatch(/coaching adjustment/);
    expect(
      validateManualAdjustments(
        [
          manualEntry({ value: 0.75 }),
          manualEntry({ value: 0.1, sourceRef: "owner-source-2" }),
          manualEntry({ component: "coaching", value: 0.25, sourceRef: "owner-source-3" }),
        ],
        { canonicalTeams: teamsJson }
      ).errors.join(" ")
    ).toMatch(/exceeds the absolute 1.0 bound/);
    expect(
      validateManualAdjustments([manualEntry({ rationale: "" })], {
        canonicalTeams: teamsJson,
      }).errors.join(" ")
    ).toMatch(/rationale/);
    expect(
      validateManualAdjustments([manualEntry({ sourceRef: "" })], {
        canonicalTeams: teamsJson,
      }).errors.join(" ")
    ).toMatch(/sourceRef/);
    expect(
      validateManualAdjustments([manualEntry({ team: "zzz" })], {
        canonicalTeams: teamsJson,
      }).errors.join(" ")
    ).toMatch(/unknown team/);
    expect(
      validateManualAdjustments([manualEntry({ status: "pending" })], {
        canonicalTeams: teamsJson,
      }).errors.join(" ")
    ).toMatch(/invalid adjustment status/);
  });

  it("lets only confirmed manual flags affect the alternate view", () => {
    const baseline = artifact(2025, "final-eight-team-metrics.json");
    const buf = baseline.teams.find((row: { abbr: string }) => row.abbr === "buf");
    const gameId = buf.windowGames[0];
    const flagged = buildNflV03ArtifactSet({
      ...inputs,
      generatedAt: FIXED_AT,
      existingArtifacts: {
        "2025/context-flags.json": {
          flags: [
            {
              gameId,
              team: "buf",
              flag: "backup-qb",
              origin: "manual",
              confirmed: true,
              source: "owner-source",
              enteredBy: "model-owner",
              date: "2026-01-15",
              note: "Confirmed historical review entry.",
            },
          ],
        },
      },
    });
    const changed = flagged["2025/final-eight-team-metrics.json"].teams.find(
      (row: { abbr: string }) => row.abbr === "buf"
    );
    expect(changed.metrics).toEqual(buf.metrics);
    expect(changed.alternateExcludedGameIds).toEqual([gameId]);
    expect(changed.metricsExFlagged).not.toEqual(changed.metrics);

    for (const season of [2022, 2023, 2024, 2025]) {
      for (const row of artifact(season, "final-eight-team-metrics.json").teams) {
        expect(row.alternateExcludedGameIds).toEqual([]);
        expect(row.metricsExFlagged).toEqual(row.metrics);
      }
    }
  }, 60_000);

  it("hard-fails unknown context flags and malformed existing artifacts", () => {
    const context = validateContextFlags(
      [
        {
          gameId: "2025_18_BUF_NE",
          team: "buf",
          flag: "unknown-flag",
          origin: "screen",
          enteredBy: "screen",
          date: "2026-01-01",
          note: "Invalid fixture.",
        },
      ],
      teamsJson
    );
    expect(context.valid).toBe(false);
    const broken = structuredClone(first);
    broken["2025/context-flags.json"].flags = [{ bad: true }];
    expect(() => validateNflV03ArtifactSet(broken, { teamsJson })).toThrow(/invalid flags/);
  });
});

describe("NFL v0.3 preseason scale and stored movement", () => {
  it("uses first-publication null movement and bounded fixed-scale ratings", () => {
    for (const season of NFL_V03_PRESEASON_SEASONS) {
      const ratings = artifact(season, "preseason-power-ratings.json").ratings;
      expect(ratings).toHaveLength(32);
      expect(ratings.every((row: { rankChange: null }) => row.rankChange === null)).toBe(true);
      expect(ratings.every((row: { ratingChange: null }) => row.ratingChange === null)).toBe(
        true
      );
      for (const row of ratings) {
        expect(row.publicRating).toBeGreaterThanOrEqual(1);
        expect(row.publicRating).toBeLessThanOrEqual(99);
        expect(row.offenseRating).toBeGreaterThanOrEqual(1);
        expect(row.defenseRating).toBeLessThanOrEqual(99);
        expect(row.historical.lambda).toBe(0);
      }
      const mean = ratings.reduce(
        (sum: number, row: { publicRating: number }) => sum + row.publicRating,
        0
      ) / ratings.length;
      expect(mean).toBeCloseTo(50, 0);
    }
  });

  it("computes movement only from a stored changed publication", () => {
    const prior = structuredClone(artifact(2026, "preseason-power-ratings.json"));
    const priorRow = prior.ratings.find((row: { rank: number }) => row.rank === 10);
    priorRow.rank += 2;
    priorRow.publicRating -= 1;
    priorRow.internalZ -= 0.1;
    const next = buildNflV03ArtifactSet({
      ...inputs,
      generatedAt: SECOND_AT,
      existingArtifacts: { "2026/preseason-power-ratings.json": prior },
    });
    const current = next["2026/preseason-power-ratings.json"].ratings.find(
      (row: { abbr: string }) => row.abbr === priorRow.abbr
    );
    expect(current.rankChange).toBe(2);
    expect(current.ratingChange).toBe(1);
  }, 60_000);
});

describe("NFL v0.3 determinism, dry-run, and isolation", () => {
  it("is deterministic except generatedAt and does not mutate inputs", () => {
    expect(stripGeneratedAt(second)).toEqual(stripGeneratedAt(first));
  });

  it("writes nothing in dry-run mode", () => {
    const output = join(tempRoot, "dry-run-output");
    expect(writeNflV03Artifacts(first, output, { dryRun: true })).toEqual([]);
    expect(existsSync(output)).toBe(false);
  });

  it("contains no forbidden artifact fields or language", () => {
    expect(JSON.stringify(first)).not.toMatch(FORBIDDEN);
  });

  it("has no public consumer import or reference", () => {
    const filenames = [
      "full-season-team-metrics.json",
      "final-eight-team-metrics.json",
      "preseason-power-ratings.json",
      "context-flags.json",
      "manual-adjustments.json",
    ];
    const source = sourceFiles(join(ROOT, "src"))
      .filter((path) => !/\.test\.tsx?$/.test(path))
      .filter((path) => !path.endsWith("useNflV03Artifacts.ts"))
      .filter((path) => !path.endsWith("NflV03Review.tsx"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    for (const filename of filenames) expect(source).not.toContain(filename);
  });

  it("hard-fails unknown abbreviations, malformed schemas, NaN, and Infinity", () => {
    const unknown = structuredClone(first);
    unknown["2025/full-season-team-metrics.json"].teams[0].abbr = "zzz";
    expect(() => validateNflV03ArtifactSet(unknown, { teamsJson })).toThrow(/unknown team/);

    const malformed = structuredClone(first);
    malformed["2025/full-season-team-metrics.json"]._meta.validationStatus = "final";
    expect(() => validateNflV03ArtifactSet(malformed, { teamsJson })).toThrow(
      /validationStatus/
    );

    const nan = structuredClone(first);
    nan["2026/preseason-power-ratings.json"].ratings[0].internalZ = Number.NaN;
    expect(() => validateNflV03ArtifactSet(nan, { teamsJson })).toThrow(/non-finite/);

    const infinity = structuredClone(first);
    infinity["2026/preseason-power-ratings.json"].ratings[0].internalZ =
      Number.POSITIVE_INFINITY;
    expect(() => validateNflV03ArtifactSet(infinity, { teamsJson })).toThrow(/non-finite/);
  });
});
