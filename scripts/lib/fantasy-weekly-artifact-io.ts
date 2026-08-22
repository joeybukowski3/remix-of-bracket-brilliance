import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { weeklyFantasyRankingArtifactSchema } from "../../src/lib/fantasy/weekly/productionAuthority.ts";

export function serializeWeeklyFantasyArtifact(value: unknown): string {
  const parsed = weeklyFantasyRankingArtifactSchema.parse(value);
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function writeWeeklyFantasyArtifactAtomic(path: string, value: unknown): void {
  const body = serializeWeeklyFantasyArtifact(value);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  try {
    writeFileSync(temporary, body, "utf8");
    renameSync(temporary, path);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}
