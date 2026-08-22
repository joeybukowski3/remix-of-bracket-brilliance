import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Section 23 leakage/architecture test: Phase 4 must have zero dependency
 * on market-line modules, marketAnchor, MIC, AP poll, or production
 * config. Mirrors phase2/phase3's static-import scan.
 */
function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) return [full];
    return [];
  });
}

describe("Phase 4 modules have zero market-line / marketAnchor / MIC / production-config dependency", () => {
  const files = listSourceFiles(__dirname);

  it.each(files)("%s imports nothing market-related or production-config-related", (file) => {
    const content = readFileSync(file, "utf8");
    const importLines = content.match(/^import\s.+$/gm) ?? [];
    for (const line of importLines) {
      expect(line).not.toMatch(/CfbResearchMarketLine/);
      expect(line).not.toMatch(
        /normalizeMarketLines|fetchLines|marketAnchor|CFB_V1_CONFIG|CFB_PIPELINE_CONFIG|CFB_MODEL_CONFIG|\bmic\b|apPoll/i,
      );
    }
  });
});
