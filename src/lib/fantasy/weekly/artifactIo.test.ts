import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { serializeWeeklyFantasyArtifact, writeWeeklyFantasyArtifactAtomic } from "../../../../scripts/lib/fantasy-weekly-artifact-io.ts";

describe("weekly fantasy artifact IO", () => {
  it("fails before writing an invalid partial artifact", () => {
    const directory = mkdtempSync(join(tmpdir(), "fantasy-weekly-d2-"));
    const target = join(directory, "week-01.json");
    expect(() => writeWeeklyFantasyArtifactAtomic(target, { season: 2026 })).toThrow();
    expect(existsSync(target)).toBe(false);
    expect(existsSync(`${target}.tmp`)).toBe(false);
  });

  it("rejects invalid values before deterministic serialization", () => {
    expect(() => serializeWeeklyFantasyArtifact({ season: 2026 })).toThrow();
  });

  it("serializes an existing valid artifact deterministically", () => {
    const artifact = JSON.parse(readFileSync(join(process.cwd(), "public/data/fantasy/weekly/2026/week-01.json"), "utf8"));
    expect(serializeWeeklyFantasyArtifact(artifact)).toBe(serializeWeeklyFantasyArtifact(artifact));
  });
});
