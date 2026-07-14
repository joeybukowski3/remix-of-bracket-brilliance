import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NFL_WEEKLY_SOURCE_CACHE_RELATIVE_DIR,
  NFL_WEEKLY_SOURCE_CACHE_SEASONS,
  NFL_WEEKLY_SOURCE_LEGACY_FIELDS,
  NFL_WEEKLY_SOURCE_MANIFEST_VERSION,
  NFL_WEEKLY_SOURCE_REQUIRED_HEADERS,
  analyzeNflWeeklySourceCsv,
  validateNflWeeklySourceCache,
} from "../../../scripts/validate-nfl-weekly-source-cache.mjs";
import { parseCsv } from "../../../scripts/lib/nfl-schedules-results-core.mjs";

const ROOT = resolve(__dirname, "../../..");
const CACHE_DIR = join(ROOT, ...NFL_WEEKLY_SOURCE_CACHE_RELATIVE_DIR.split("/"));
const MANIFEST_PATH = join(CACHE_DIR, "manifest.json");
const TEAMS_JSON = JSON.parse(
  readFileSync(join(ROOT, "public/data/nfl/teams.json"), "utf8")
);

function sourcePath(season: number) {
  return join(CACHE_DIR, `stats_team_week_${season}.csv`);
}

function sourceText(season: number) {
  return readFileSync(sourcePath(season), "utf8");
}

function digest(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("NFL weekly-source cache manifest and byte integrity", () => {
  it("has complete provenance for exactly 2022 through 2025", () => {
    const manifestText = readFileSync(MANIFEST_PATH, "utf8");
    const manifest = JSON.parse(manifestText);

    expect(manifest.schemaVersion).toBe(NFL_WEEKLY_SOURCE_MANIFEST_VERSION);
    expect(manifest.files.map((entry: { season: number }) => entry.season)).toEqual(
      NFL_WEEKLY_SOURCE_CACHE_SEASONS
    );
    expect(manifestText).not.toMatch(/(^|["\s])[A-Za-z]:[\\/]/m);

    for (const entry of manifest.files) {
      const bytes = readFileSync(join(CACHE_DIR, entry.filename));
      expect(bytes.length, entry.filename).toBe(entry.byteSize);
      expect(digest(bytes), entry.filename).toBe(entry.sha256);
      expect(entry.sourceUrl).toBe(
        `https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_${entry.season}.csv`
      );
      expect(entry.sourceLabel).toBe("nflverse (stats_team weekly release)");
      expect(entry.retrievedDateUtc).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("validates required headers and reports REG and POST availability", () => {
    const result = validateNflWeeklySourceCache({ rootDir: ROOT });

    expect(result.valid).toBe(true);
    expect(result.files).toHaveLength(4);
    for (const file of result.files) {
      const rows = parseCsv(sourceText(file.season));
      const headers = Object.keys(rows[0]);
      expect(headers).toEqual(
        JSON.parse(readFileSync(MANIFEST_PATH, "utf8")).files.find(
          (entry: { season: number }) => entry.season === file.season
        ).headerColumns
      );
      expect(NFL_WEEKLY_SOURCE_REQUIRED_HEADERS.every((field) => headers.includes(field))).toBe(
        true
      );
      expect(file.hasRegularSeason).toBe(true);
      expect(file.hasPostseason).toBe(true);
      expect(file.seasonTypes).toEqual(["POST", "REG"]);
      expect(file.forbiddenColumns).toEqual([]);
    }
  });
});

describe("NFL weekly-source cache model compatibility", () => {
  it("resolves canonical teams, rejects duplicates, and has reciprocal opponents", () => {
    const result = validateNflWeeklySourceCache({ rootDir: ROOT });

    for (const file of result.files) {
      expect(file.observedTeamCount).toBe(32);
      expect(file.duplicateKeyCount).toBe(0);
      expect(file.reciprocalOpponentFailureCount).toBe(0);
    }
  });

  it("produces 32 teams and exact all-REG subset/legacy equality", () => {
    const result = validateNflWeeklySourceCache({ rootDir: ROOT });

    for (const file of result.files) {
      expect(file.legacyTeamCount).toBe(32);
      expect(file.subsetTeamCount).toBe(32);
      expect(file.subsetMatchesLegacy).toBe(true);
      expect(file.sourceUnmodified).toBe(true);
    }
  });

  it("matches every supported checked-in production field", () => {
    const result = validateNflWeeklySourceCache({ rootDir: ROOT });

    expect(NFL_WEEKLY_SOURCE_LEGACY_FIELDS).toHaveLength(9);
    expect(result.productionMismatches).toEqual([]);
    for (const file of result.files) expect(file.productionMismatchCount).toBe(0);
  });

  it("rejects a duplicate season/type/week/team key", () => {
    const original = sourceText(2022);
    const firstDataRow = original.split(/\r?\n/)[1];
    const duplicate = `${original.replace(/\s*$/, "")}\n${firstDataRow}\n`;

    expect(() => analyzeNflWeeklySourceCsv(duplicate, 2022, TEAMS_JSON)).toThrow(
      /duplicate key/i
    );
  });

  it("rejects a missing reciprocal opponent row", () => {
    const original = sourceText(2022);
    const parsed = parseCsv(original);
    const sourceRow = parsed.find((row) => row.season_type === "REG")!;
    const reciprocalPrefix = `${sourceRow.season},${sourceRow.week},${sourceRow.opponent_team},${sourceRow.season_type},`;
    const lines = original.split(/\r?\n/);
    const reciprocalIndex = lines.findIndex((line) => line.startsWith(reciprocalPrefix));
    expect(reciprocalIndex).toBeGreaterThan(0);
    lines.splice(reciprocalIndex, 1);

    expect(() => analyzeNflWeeklySourceCsv(lines.join("\n"), 2022, TEAMS_JSON)).toThrow(
      /missing reciprocal opponent row/i
    );
  });

  it("rejects an unknown nflverse team abbreviation", () => {
    const unknownTeam = sourceText(2022).replace(/^(\d+,\d+,)[^,]+/m, "$1XXX");

    expect(() => analyzeNflWeeklySourceCsv(unknownTeam, 2022, TEAMS_JSON)).toThrow(
      /unknown team XXX/i
    );
  });
});

describe("NFL weekly-source cache determinism and isolation", () => {
  it("does not mutate source files and repeated validation is deterministic", () => {
    const before = new Map(
      NFL_WEEKLY_SOURCE_CACHE_SEASONS.map((season) => [
        season,
        readFileSync(sourcePath(season)),
      ])
    );
    const first = validateNflWeeklySourceCache({ rootDir: ROOT });
    const second = validateNflWeeklySourceCache({ rootDir: ROOT });

    expect(second).toEqual(first);
    expect(JSON.stringify(first)).not.toMatch(/NaN|Infinity/);
    for (const [season, bytes] of before) {
      expect(readFileSync(sourcePath(season))).toEqual(bytes);
    }
  }, 15_000);

  it("contains no network acquisition path", () => {
    const validator = readFileSync(
      join(ROOT, "scripts/validate-nfl-weekly-source-cache.mjs"),
      "utf8"
    );

    expect(validator).not.toMatch(/\bfetch\s*\(|axios|https\.request|http\.request/);
  });
});
