import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Section 28/30 — proves the one-way dependency IPR (+ Phase 6) -> Phase 7.
 * Phase 0-6 must never import phase7; Phase 7 may import Phase 0-6 (its
 * whole purpose is diagnosing them) but must never write back into any
 * earlier phase module, and must never import production config/MIC.
 */
function listTsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listTsFiles(full);
    if (entry.name.endsWith(".ts")) return [full];
    return [];
  });
}

const RESEARCH_ROOT = resolve(__dirname, "..");

describe("Phase 0-6 never import Phase 7", () => {
  const earlierPhaseDirs = ["derived", "phase2", "phase3", "phase4", "phase5", "phase6"];
  for (const dirName of earlierPhaseDirs) {
    const dir = resolve(RESEARCH_ROOT, dirName);
    let files: string[] = [];
    try {
      files = listTsFiles(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      it(`${dirName}/${file.slice(dir.length + 1)} does not import phase7`, () => {
        const content = readFileSync(file, "utf8");
        const importLines = content.match(/^import\s.+$/gm) ?? [];
        for (const line of importLines) {
          expect(line).not.toMatch(/phase7/i);
        }
      });
    }
  }
});

describe("Phase 7 modules never import CFB_V1_CONFIG / production pipeline / MIC", () => {
  const files = listTsFiles(resolve(RESEARCH_ROOT, "phase7")).filter((f) => !f.endsWith(".test.ts"));
  it.each(files)("%s imports no production config", (file) => {
    const content = readFileSync(file, "utf8");
    const importLines = content.match(/^import\s.+$/gm) ?? [];
    for (const line of importLines) {
      expect(line).not.toMatch(/CFB_V1_CONFIG|CFB_PIPELINE_CONFIG|CFB_MODEL_CONFIG|marketAnchor|\bmic\b/i);
    }
  });
});
