import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import {
  NFL_V03_PERFORMANCE_SEASONS,
  NFL_V03_PRESEASON_SEASONS,
  serializeNflV03Artifact,
  validateNflV03ArtifactSet,
} from "./nfl-v03-artifacts.mjs";

export const NFL_V03_PLACEHOLDER_GENERATED_AT = "1970-01-01T00:00:00.000Z";
export const NFL_V03_HISTORICAL_CUTOFF_SEASON = 2025;

const TYPES = Object.freeze({
  performance: Object.freeze([
    "full-season-team-metrics.json",
    "final-eight-team-metrics.json",
    "context-flags.json",
  ]),
  preseason: Object.freeze([
    "preseason-power-ratings.json",
    "manual-adjustments.json",
  ]),
});

export function deriveCandidateManifest() {
  return Object.freeze([
    ...NFL_V03_PERFORMANCE_SEASONS.flatMap((season) =>
      TYPES.performance.map((filename) => `${season}/${filename}`)
    ),
    ...NFL_V03_PRESEASON_SEASONS.flatMap((season) =>
      TYPES.preseason.map((filename) => `${season}/${filename}`)
    ),
  ].sort((a, b) => a.localeCompare(b)));
}

export function derivePublicationAllowlist() {
  return Object.freeze([
    ...NFL_V03_PERFORMANCE_SEASONS.flatMap((season) => [
      `${season}/full-season-team-metrics.json`,
      `${season}/final-eight-team-metrics.json`,
    ]),
    ...NFL_V03_PRESEASON_SEASONS.map(
      (season) => `${season}/preseason-power-ratings.json`
    ),
  ].sort((a, b) => a.localeCompare(b)));
}

export function deriveGovernancePaths() {
  return Object.freeze([
    ...NFL_V03_PERFORMANCE_SEASONS.map((season) => `${season}/context-flags.json`),
    ...NFL_V03_PRESEASON_SEASONS.map((season) => `${season}/manual-adjustments.json`),
  ].sort((a, b) => a.localeCompare(b)));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function withoutGeneratedAt(value) {
  const copy = clone(value);
  if (copy?._meta && typeof copy._meta === "object") delete copy._meta.generatedAt;
  return copy;
}

export function substantiveEqual(a, b) {
  return JSON.stringify(withoutGeneratedAt(a)) === JSON.stringify(withoutGeneratedAt(b));
}

export function assertUtcIsoTimestamp(value) {
  const match =
    typeof value === "string"
      ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(
          value
        )
      : null;
  if (!match) {
    throw new Error("--generated-at must be an ISO-8601 UTC timestamp ending in Z");
  }
  const [, year, month, day, hour, minute, second, fraction = ""] = match;
  const parsed = new Date(value);
  const expectedMilliseconds = Number(fraction.padEnd(3, "0"));
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day) ||
    parsed.getUTCHours() !== Number(hour) ||
    parsed.getUTCMinutes() !== Number(minute) ||
    parsed.getUTCSeconds() !== Number(second) ||
    parsed.getUTCMilliseconds() !== expectedMilliseconds
  ) {
    throw new Error("--generated-at must be a valid ISO-8601 UTC timestamp");
  }
  return value;
}

function safeTarget(rootDir, relativePath) {
  const root = resolve(rootDir);
  const target = resolve(root, ...relativePath.split("/"));
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error(`Unsafe publication path ${relativePath}`);
  }
  return target;
}

export function snapshotRawFiles(rootDir, paths) {
  return new Map(
    paths.map((path) => {
      const absolute = safeTarget(rootDir, path);
      if (!existsSync(absolute)) throw new Error(`Missing required file ${path}`);
      return [path, readFileSync(absolute)];
    })
  );
}

export function verifyRawFiles(rootDir, snapshots, label = "File") {
  for (const [path, expected] of snapshots) {
    const absolute = safeTarget(rootDir, path);
    if (!existsSync(absolute) || !readFileSync(absolute).equals(expected)) {
      throw new Error(`${label} bytes changed unexpectedly: ${path}`);
    }
  }
  return true;
}

export function readArtifactSet(rootDir, expectedPaths = deriveCandidateManifest()) {
  return Object.fromEntries(
    expectedPaths.map((path) => {
      const absolute = safeTarget(rootDir, path);
      if (!existsSync(absolute)) throw new Error(`Missing required candidate artifact ${path}`);
      const stat = statSync(absolute);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error(`Candidate path is not a regular file: ${path}`);
      }
      try {
        return [path, JSON.parse(readFileSync(absolute, "utf8"))];
      } catch (error) {
        throw new Error(`Malformed candidate JSON ${path}: ${error.message}`);
      }
    })
  );
}

function walkFiles(rootDir, current = rootDir) {
  if (!existsSync(current)) return [];
  return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const path = join(current, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Candidate tree contains symlink ${relative(rootDir, path)}`);
    }
    if (entry.isDirectory()) return walkFiles(rootDir, path);
    return [relative(rootDir, path).split(sep).join("/")];
  });
}

export function assertExactCandidateManifest(rootDir, expectedPaths = deriveCandidateManifest()) {
  const actual = walkFiles(rootDir).sort((a, b) => a.localeCompare(b));
  const expected = [...expectedPaths].sort((a, b) => a.localeCompare(b));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const missing = expected.filter((path) => !actual.includes(path));
    const unexpected = actual.filter((path) => !expected.includes(path));
    throw new Error(
      `Candidate manifest mismatch; missing=[${missing.join(", ")}], unexpected=[${unexpected.join(", ")}]`
    );
  }
  return true;
}

export function restoreGovernanceCandidateBytes({
  candidateDir,
  candidateArtifacts,
  governanceSnapshots,
}) {
  for (const [path, rawBytes] of governanceSnapshots) {
    const original = JSON.parse(rawBytes.toString("utf8"));
    const candidate = candidateArtifacts[path];
    if (!candidate) throw new Error(`Missing governance candidate ${path}`);
    if (!substantiveEqual(candidate, original)) {
      throw new Error(`Generator changed human-controlled governance content in ${path}`);
    }
    const target = safeTarget(candidateDir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, rawBytes);
    candidateArtifacts[path] = original;
  }
  return candidateArtifacts;
}

export function reconcileGeneratedAt({ candidateArtifacts, liveArtifacts, generatedAt = null }) {
  const changed = [];
  const unchanged = [];
  for (const path of derivePublicationAllowlist()) {
    const candidate = candidateArtifacts[path];
    const live = liveArtifacts[path] ?? null;
    if (live && substantiveEqual(candidate, live)) {
      candidate._meta.generatedAt = live._meta.generatedAt;
      unchanged.push(path);
    } else {
      if (generatedAt != null) candidate._meta.generatedAt = assertUtcIsoTimestamp(generatedAt);
      changed.push(path);
    }
  }
  return { changed, unchanged };
}

export function validateCompleteCandidateSet({ candidateDir, candidateArtifacts, teamsJson }) {
  assertExactCandidateManifest(candidateDir);
  validateNflV03ArtifactSet(candidateArtifacts, { teamsJson });
  return true;
}

export function planPublication({
  candidateArtifacts,
  liveArtifacts,
  allowHistorical = false,
  historicalPaths = [],
}) {
  const allowlist = new Set(derivePublicationAllowlist());
  const approvedHistorical = new Set(historicalPaths);
  const changed = [];
  const unchanged = [];
  for (const path of allowlist) {
    const candidateBytes = serializeNflV03Artifact(candidateArtifacts[path]);
    const liveBytes = liveArtifacts[path] ? serializeNflV03Artifact(liveArtifacts[path]) : null;
    if (candidateBytes === liveBytes) {
      unchanged.push(path);
      continue;
    }
    const season = Number(path.split("/")[0]);
    if (
      season <= NFL_V03_HISTORICAL_CUTOFF_SEASON &&
      (!allowHistorical || !approvedHistorical.has(path))
    ) {
      throw new Error(
        `Historical artifact change blocked: ${path}. Authorize with --allow-historical and --historical-path=${path}`
      );
    }
    changed.push(path);
  }
  for (const path of approvedHistorical) {
    if (!allowlist.has(path)) {
      throw new Error(`Historical authorization is not publishable: ${path}`);
    }
    if (Number(path.split("/")[0]) > NFL_V03_HISTORICAL_CUTOFF_SEASON) {
      throw new Error(`--historical-path is only valid for 2022-2025 artifacts: ${path}`);
    }
  }
  return { changed, unchanged };
}

export function publishPlannedArtifacts({
  outputDir,
  candidateArtifacts,
  changedPaths,
  afterReplace = null,
}) {
  const allowlist = new Set(derivePublicationAllowlist());
  const backups = new Map();
  const modified = [];
  try {
    for (const [index, path] of changedPaths.entries()) {
      if (!allowlist.has(path)) {
        throw new Error(`Refusing non-allowlisted publication path ${path}`);
      }
      const target = safeTarget(outputDir, path);
      mkdirSync(dirname(target), { recursive: true });
      backups.set(path, existsSync(target) ? readFileSync(target) : null);
      const temp = `${target}.nfl-v03-publication.tmp`;
      try {
        writeFileSync(temp, serializeNflV03Artifact(candidateArtifacts[path]));
        try {
          renameSync(temp, target);
        } catch (error) {
          if (!existsSync(target) || !["EEXIST", "EPERM"].includes(error?.code)) throw error;
          rmSync(target, { force: true });
          renameSync(temp, target);
        }
      } finally {
        rmSync(temp, { force: true });
      }
      modified.push(path);
      afterReplace?.({ index, path, target });
    }
    for (const path of changedPaths) {
      const target = safeTarget(outputDir, path);
      const expected = serializeNflV03Artifact(candidateArtifacts[path]);
      if (readFileSync(target, "utf8") !== expected) {
        throw new Error(`Published bytes failed verification for ${path}`);
      }
    }
  } catch (error) {
    for (const path of modified.reverse()) {
      const target = safeTarget(outputDir, path);
      const backup = backups.get(path);
      if (backup == null) rmSync(target, { force: true });
      else writeFileSync(target, backup);
    }
    throw error;
  }
}

export function seedExistingArtifacts({ liveDir, candidateDir, paths }) {
  for (const path of paths) {
    const source = safeTarget(liveDir, path);
    if (!existsSync(source)) continue;
    const target = safeTarget(candidateDir, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  }
}
