import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("generate-nfl-team-pregame-features CLI", () => {
  it("writes a deterministic, schema-valid artifact with no unresolved games or duplicate rows", () => {
    const dir = mkdtempSync(join(tmpdir(), "nfl-team-pregame-features-"));
    const output = join(dir, "team-pregame-features-test.json");
    try {
      execFileSync(
        "npx",
        [
          "tsx",
          "scripts/generate-nfl-team-pregame-features.ts",
          "--seasons=2025",
          `--output=${output}`,
          "--generated-at=2026-08-25T00:00:00.000Z",
        ],
        { cwd: join(__dirname, ".."), stdio: "pipe", shell: true },
      );
      expect(existsSync(output)).toBe(true);
      const artifact = JSON.parse(readFileSync(output, "utf8"));
      expect(artifact._meta.schemaVersion).toBe("nfl-team-pregame-features-artifact-v1");
      expect(artifact._meta.seasons).toEqual([2025]);
      expect(artifact._meta.qa.duplicateKeysDetected).toBe(0);
      expect(artifact.rows.length).toBeGreaterThan(0);

      const week1 = artifact.rows.filter((r: { week: number }) => r.week === 1);
      expect(week1.length).toBeGreaterThan(0);
      for (const row of week1) {
        expect(row.gamesPlayedPriorThisSeason).toBe(0);
        expect(row.seasonPrior.gamesIncluded).toBe(0);
        expect(row.last3.gamesIncluded).toBe(0);
      }

      const keys = new Set(artifact.rows.map((r: { season: number; week: number; team: string }) => `${r.season}|${r.week}|${r.team}`));
      expect(keys.size).toBe(artifact.rows.length);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
