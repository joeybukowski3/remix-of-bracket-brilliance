import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  deriveCandidateManifest,
  deriveGovernancePaths,
  derivePublicationAllowlist,
  serializeNflV03Artifact,
} from "../scripts/lib/nfl-v03-publication.mjs";
import {
  parsePublicationArgs,
  runNflV03Publication,
} from "../scripts/publish-nfl-v03-artifacts.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const SOURCE_DATA = join(ROOT, "public", "data", "nfl");
const SOURCE_CACHE = join(ROOT, "data", "nfl", "nflverse", "stats-team-week");
const FIXED_AT = "2026-07-21T16:00:00.000Z";
const CURRENT_FULL = "2026/full-season-team-metrics.json";
const CURRENT_FINAL = "2026/final-eight-team-metrics.json";
const tempRoots = new Set();

afterEach(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
  tempRoots.clear();
});

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "jkb-nfl-v03-fixture-"));
  tempRoots.add(root);
  const dataDir = join(root, "public", "data", "nfl");
  const cacheDir = join(root, "data", "nfl", "nflverse", "stats-team-week");
  cpSync(SOURCE_DATA, dataDir, { recursive: true });
  cpSync(SOURCE_CACHE, cacheDir, { recursive: true });
  return { root, dataDir };
}

function fileBytes(rootDir, paths = deriveCandidateManifest()) {
  return new Map(
    paths.map((path) => [path, readFileSync(join(rootDir, ...path.split("/")))])
  );
}

function expectBytesEqual(rootDir, snapshots) {
  for (const [path, expected] of snapshots) {
    expect(readFileSync(join(rootDir, ...path.split("/"))).equals(expected), path).toBe(true);
  }
}

function mutateArtifact(path, mutate) {
  return ({ candidateDir, candidateArtifacts }) => {
    mutate(candidateArtifacts[path]);
    writeFileSync(
      join(candidateDir, ...path.split("/")),
      serializeNflV03Artifact(candidateArtifacts[path])
    );
  };
}

function appendNote(path, text) {
  return mutateArtifact(path, (artifact) => artifact._meta.notes.push(text));
}

function argsFor(dataDir, extra = []) {
  return parsePublicationArgs([
    `--input-dir=${dataDir}`,
    `--output-dir=${dataDir}`,
    ...extra,
  ]);
}

function trackedTempDependency(bucket) {
  return {
    onTempRoot: (path) => bucket.push(path),
  };
}

describe("NFL v0.3 publication runner integration", () => {
  it("plan-only mode performs no live writes and cleans temporary storage", async () => {
    const { dataDir } = createFixture();
    const before = fileBytes(dataDir);
    const temp = [];
    const result = await runNflV03Publication(
      argsFor(dataDir),
      () => {},
      trackedTempDependency(temp)
    );
    expect(result.mode).toBe("plan");
    expect(result.changed).toEqual([]);
    expectBytesEqual(dataDir, before);
    expect(temp).toHaveLength(1);
    expect(existsSync(temp[0])).toBe(false);
  });

  it("successful --write changes only allowlisted files", async () => {
    const { dataDir } = createFixture();
    const before = fileBytes(dataDir);
    const result = await runNflV03Publication(
      argsFor(dataDir, ["--write", `--generated-at=${FIXED_AT}`]),
      () => {},
      { mutateCandidateTree: appendNote(CURRENT_FULL, "Controlled integration change.") }
    );
    expect(result.published).toEqual([CURRENT_FULL]);
    expect(result.published.every((path) => derivePublicationAllowlist().includes(path))).toBe(true);
    for (const [path, bytes] of before) {
      const now = readFileSync(join(dataDir, ...path.split("/")));
      expect(now.equals(bytes), path).toBe(path !== CURRENT_FULL);
    }
  });

  it("changed write without --generated-at fails before live writes", async () => {
    const { dataDir } = createFixture();
    const before = fileBytes(dataDir);
    await expect(
      runNflV03Publication(argsFor(dataDir, ["--write"]), () => {}, {
        mutateCandidateTree: appendNote(CURRENT_FULL, "Timestamp required."),
      })
    ).rejects.toThrow(/generated-at/);
    expectBytesEqual(dataDir, before);
  });

  it("no-op write does not require --generated-at", async () => {
    const { dataDir } = createFixture();
    const before = fileBytes(dataDir);
    const result = await runNflV03Publication(argsFor(dataDir, ["--write"]), () => {});
    expect(result.changed).toEqual([]);
    expect(result.published).toEqual([]);
    expectBytesEqual(dataDir, before);
  });

  it("repeated runner execution with identical inputs produces no changes", async () => {
    const { dataDir } = createFixture();
    const first = await runNflV03Publication(argsFor(dataDir), () => {});
    const afterFirst = fileBytes(dataDir);
    const second = await runNflV03Publication(argsFor(dataDir), () => {});
    expect(first.changed).toEqual([]);
    expect(second.changed).toEqual([]);
    expectBytesEqual(dataDir, afterFirst);
  });

  it("missing required candidate fails with no live writes", async () => {
    const { dataDir } = createFixture();
    const before = fileBytes(dataDir);
    const temp = [];
    await expect(
      runNflV03Publication(argsFor(dataDir), () => {}, {
        onTempRoot: (path) => temp.push(path),
        mutateCandidateTree: ({ candidateDir }) =>
          unlinkSync(join(candidateDir, ...CURRENT_FULL.split("/"))),
      })
    ).rejects.toThrow(/Missing required candidate|manifest mismatch/);
    expectBytesEqual(dataDir, before);
    expect(temp).toHaveLength(1);
    expect(existsSync(temp[0])).toBe(false);
  });

  it("unexpected candidate fails with no live writes", async () => {
    const { dataDir } = createFixture();
    const before = fileBytes(dataDir);
    await expect(
      runNflV03Publication(argsFor(dataDir), () => {}, {
        mutateCandidateTree: ({ candidateDir }) =>
          writeFileSync(join(candidateDir, "unexpected.json"), "{}\n"),
      })
    ).rejects.toThrow(/manifest mismatch/);
    expectBytesEqual(dataDir, before);
  });

  it("candidate validation failure leaves live bytes unchanged", async () => {
    const { dataDir } = createFixture();
    const before = fileBytes(dataDir);
    await expect(
      runNflV03Publication(argsFor(dataDir), () => {}, {
        mutateCandidateTree: mutateArtifact(CURRENT_FULL, (artifact) => {
          artifact._meta.modelVersion = "nfl-power-v0.2.0";
        }),
      })
    ).rejects.toThrow(/modelVersion/);
    expectBytesEqual(dataDir, before);
  });

  it("governance live bytes remain exactly unchanged", async () => {
    const { dataDir } = createFixture();
    const governanceBefore = fileBytes(dataDir, deriveGovernancePaths());
    await runNflV03Publication(
      argsFor(dataDir, ["--write", `--generated-at=${FIXED_AT}`]),
      () => {},
      { mutateCandidateTree: appendNote(CURRENT_FULL, "Governance byte check.") }
    );
    expectBytesEqual(dataDir, governanceBefore);
  });

  it("failure after the first replacement restores all modified files", async () => {
    const { dataDir } = createFixture();
    const before = fileBytes(dataDir);
    await expect(
      runNflV03Publication(
        argsFor(dataDir, ["--write", `--generated-at=${FIXED_AT}`]),
        () => {},
        {
          mutateCandidateTree: ({ candidateDir, candidateArtifacts }) => {
            for (const path of [CURRENT_FULL, CURRENT_FINAL]) {
              candidateArtifacts[path]._meta.notes.push("Rollback integration change.");
              writeFileSync(
                join(candidateDir, ...path.split("/")),
                serializeNflV03Artifact(candidateArtifacts[path])
              );
            }
          },
          afterReplace: ({ index }) => {
            if (index === 0) throw new Error("Injected replacement failure");
          },
        }
      )
    ).rejects.toThrow(/Injected replacement failure/);
    expectBytesEqual(dataDir, before);
  });
});

describe("NFL v0.3 publication runner focused policies", () => {
  it("rejects malformed and non-UTC timestamps", () => {
    expect(() => parsePublicationArgs(["--write", "--generated-at=bad"])).toThrow();
    expect(() =>
      parsePublicationArgs(["--write", "--generated-at=2026-02-30T12:00:00Z"])
    ).toThrow(/valid/);
    expect(() =>
      parsePublicationArgs(["--write", "--generated-at=2026-07-21T12:00:00-04:00"])
    ).toThrow(/UTC/);
  });

  it("same explicit timestamp and inputs remain byte-identical", async () => {
    const { dataDir } = createFixture();
    const mutate = appendNote(CURRENT_FULL, "Deterministic controlled change.");
    const first = await runNflV03Publication(
      argsFor(dataDir, ["--write", `--generated-at=${FIXED_AT}`]),
      () => {},
      { mutateCandidateTree: mutate }
    );
    expect(first.published).toEqual([CURRENT_FULL]);
    const afterFirst = fileBytes(dataDir);
    const second = await runNflV03Publication(
      argsFor(dataDir, ["--write", `--generated-at=${FIXED_AT}`]),
      () => {},
      { mutateCandidateTree: mutate }
    );
    expect(second.changed).toEqual([]);
    expect(second.published).toEqual([]);
    expectBytesEqual(dataDir, afterFirst);
  });

  it("blocks historical changes without exact authorization", async () => {
    const { dataDir } = createFixture();
    const historical = "2025/full-season-team-metrics.json";
    const mutate = appendNote(historical, "Historical controlled change.");
    await expect(
      runNflV03Publication(argsFor(dataDir), () => {}, { mutateCandidateTree: mutate })
    ).rejects.toThrow(/Historical artifact change blocked/);

    const result = await runNflV03Publication(
      argsFor(dataDir, [
        "--write",
        `--generated-at=${FIXED_AT}`,
        "--allow-historical",
        `--historical-path=${historical}`,
      ]),
      () => {},
      { mutateCandidateTree: mutate }
    );
    expect(result.published).toEqual([historical]);
  });
});
