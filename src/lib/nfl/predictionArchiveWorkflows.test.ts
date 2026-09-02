import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());
const matchup = readFileSync(resolve(ROOT, ".github/workflows/nfl-matchup-projections.yml"), "utf8");
const yardage = readFileSync(resolve(ROOT, ".github/workflows/nfl-yardage-projections.yml"), "utf8");

function commitBlock(workflow: string): string {
  const start = workflow.indexOf("- name: Commit and push refreshed data");
  if (start < 0) throw new Error("commit step missing");
  return workflow.slice(start);
}

describe("WU1 prediction archive workflow persistence", () => {
  it("preserves the shared safe writer lock and existing push retry pattern", () => {
    for (const workflow of [matchup, yardage]) {
      expect(workflow).toContain("group: main-data-writers-${{ github.repository }}");
      expect(workflow).toContain("cancel-in-progress: false");
      expect(workflow).toContain("for attempt in 1 2 3 4 5");
      expect(workflow).toContain("git rebase origin/main");
      expect(workflow).toContain("git push origin HEAD:main");
    }
  });

  it("keeps each existing live artifact in its commit allowlist", () => {
    expect(commitBlock(matchup)).toContain("git add public/data/nfl/matchup-projections.json");
    expect(commitBlock(yardage)).toContain("public/data/nfl/${{ steps.current-week.outputs.season }}/yardage-projections.json");
  });

  it("stages only validated spread archive paths in the matchup workflow", () => {
    const block = commitBlock(matchup);
    expect(block).toContain("^data/nfl/predictions/2026/[0-9]{2}/jkb-power-number\\.jsonl$");
    expect(block).toContain("^data/nfl/predictions/manifests/sources/[0-9a-f]{64}\\.json$");
    expect(block).toContain('git add -- "$archive_path"');
    expect(block).toContain("Refusing unexpected prediction archive path");
  });

  it("stages only the three yardage model partitions and required manifests", () => {
    const block = commitBlock(yardage);
    expect(block).toContain("nfl-(passing-direct-ridge|rushing-carries-x-shrunk-ypc|receiving-targets-x-shrunk-ypt)\\.jsonl$");
    expect(block).toContain("manifests/(sources|fitted-models)/[0-9a-f]{64}\\.json$");
    expect(block).toContain('git add -- "$archive_path"');
    expect(block).toContain("Refusing unexpected prediction archive path");
  });

  it("never uses a blanket Git add for archive persistence", () => {
    for (const workflow of [matchup, yardage]) {
      const block = commitBlock(workflow);
      expect(block).not.toMatch(/git add\s+(?:-A|--all|\.)\b/);
      expect(block).not.toMatch(/git add(?:\s+--)??\s+['"]?data\/nfl\/predictions['"]?\s*$/m);
    }
  });
});
