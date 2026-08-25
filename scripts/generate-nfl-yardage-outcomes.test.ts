import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Integration test for the Phase 1 generator CLI. Runs the real script
 * against the real committed caches (2022-2025) into a throwaway temp file
 * -- nothing under version control is touched. This is deliberately a
 * black-box run (not a unit test of internals, which live in
 * src/lib/nfl/props/historicalOutcomes.test.ts) so it also exercises CLI
 * argument parsing and the atomic-write path.
 */
describe("generate-nfl-yardage-outcomes CLI", () => {
  it("writes a deterministic, schema-valid artifact for a single requested season", () => {
    const dir = mkdtempSync(join(tmpdir(), "nfl-yardage-outcomes-"));
    const output = join(dir, "yardage-outcomes-test.json");
    try {
      execFileSync(
        "npx",
        [
          "tsx",
          "scripts/generate-nfl-yardage-outcomes.ts",
          "--seasons=2025",
          `--output=${output}`,
          "--generated-at=2026-08-25T00:00:00.000Z",
        ],
        { cwd: join(__dirname, ".."), stdio: "pipe", shell: true },
      );
      expect(existsSync(output)).toBe(true);
      const artifact = JSON.parse(readFileSync(output, "utf8"));
      expect(artifact._meta.schemaVersion).toBe("nfl-yardage-outcome-artifact-v1");
      expect(artifact._meta.seasons).toEqual([2025]);
      expect(artifact._meta.generatedAt).toBe("2026-08-25T00:00:00.000Z");
      expect(artifact.rows.length).toBeGreaterThan(0);
      expect(artifact._meta.qa.duplicateKeysDetected).toBe(0);
      expect(artifact._meta.qa.rowsEmitted).toBe(artifact.rows.length);

      const keys = new Set(artifact.rows.map((row: { context: { season: number; week: number; playerId: string } }) =>
        `${row.context.season}|${row.context.week}|${row.context.playerId}`));
      expect(keys.size).toBe(artifact.rows.length);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
