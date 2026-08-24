import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Section 19 architectural safeguard: Phase 1 metric modules must not
 * import market-line modules/types. Static source scan rather than a
 * runtime check — cheaper, and catches the violation at review time
 * instead of only when some code path happens to execute.
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

describe("Phase 1 derived modules have zero market-line dependency", () => {
  const files = listSourceFiles(__dirname);

  it.each(files)("%s does not import CfbResearchMarketLine or market-line modules", (file) => {
    const content = readFileSync(file, "utf8");
    const importLines = content.match(/^import\s.+$/gm) ?? [];
    for (const line of importLines) {
      expect(line).not.toMatch(/CfbResearchMarketLine/);
      expect(line).not.toMatch(/normalizeMarketLines|fetchLines|marketAnchor/i);
    }
  });
});
