import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

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

describe("Phase 0-8 never import Phase 9", () => {
  const earlierPhaseDirs = ["derived", "phase2", "phase3", "phase4", "phase5", "phase6", "phase7", "phase8"];
  for (const dirName of earlierPhaseDirs) {
    const dir = resolve(RESEARCH_ROOT, dirName);
    let files: string[] = [];
    try {
      files = listTsFiles(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      it(`${dirName}/${file.slice(dir.length + 1)} does not import phase9`, () => {
        const content = readFileSync(file, "utf8");
        const importLines = content.match(/^import\s.+$/gm) ?? [];
        for (const line of importLines) {
          expect(line).not.toMatch(/phase9/i);
        }
      });
    }
  }
});

describe("Phase 9 modules never import CFB_V1_CONFIG / production pipeline / MIC", () => {
  const files = listTsFiles(resolve(RESEARCH_ROOT, "phase9")).filter((f) => !f.endsWith(".test.ts"));
  it.each(files)("%s imports no production config", (file) => {
    const content = readFileSync(file, "utf8");
    const importLines = content.match(/^import\s.+$/gm) ?? [];
    for (const line of importLines) {
      expect(line).not.toMatch(/CFB_V1_CONFIG|CFB_PIPELINE_CONFIG|CFB_MODEL_CONFIG|marketAnchor|\bmic\b/i);
    }
  });
});

describe("Section 14/26 — market lines enter Phase 9 ONLY through marketJoin.ts", () => {
  const files = listTsFiles(resolve(RESEARCH_ROOT, "phase9")).filter((f) => !f.endsWith(".test.ts") && !f.endsWith("marketJoin.ts"));
  it.each(files)("%s does not reference raw market-line data", (file) => {
    const content = readFileSync(file, "utf8");
    expect(content).not.toMatch(/CfbResearchMarketLine|market-lines\.json/i);
  });
});

describe("Phase 9 never modifies Phase 0-8 implementations", () => {
  it("Phase 9 imports Phase 4-8 modules read-only (no re-export/mutation of frozen state)", () => {
    const files = listTsFiles(resolve(RESEARCH_ROOT, "phase9")).filter((f) => !f.endsWith(".test.ts"));
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toMatch(/\bexport\s+\*\s+from\s+["'].*\/phase[2-8]\//);
    }
  });
});
