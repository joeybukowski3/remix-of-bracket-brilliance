/**
 * Data-containment guard. The unit tests use synthetic strings; the repository
 * test runs the same rules against what Git would commit, so `npm test` fails
 * if restricted NBA data is tracked or about to be.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyContent,
  classifyPath,
  classifySourceContent,
  findMissingSource,
  LOCAL_ONLY_RETRIEVAL_TOOLS,
  findViolations,
  RESTRICTED_REPORT_MARKER,
  vercelIgnoreProtects,
} from "../../../../scripts/lib/nba-data-containment.mjs";

describe("containment rules", () => {
  it("flags restricted paths and leaves source paths alone", () => {
    expect(classifyPath("data/nba/raw/stats-nba/playergamelogs/2024-25/regular/x.body.json")).toEqual(
      expect.arrayContaining(["nba-data-directory", "stats-nba-raw-snapshot"]),
    );
    expect(classifyPath("public/data/nba/player-games.jsonl")).toEqual(expect.arrayContaining(["nba-data-directory", "nba-canonical-or-prediction-table"]));
    expect(classifyPath("exports/nba/backtest/run/metrics.json")).toEqual(["nba-backtest-artifact"]);
    expect(classifyPath("tmp\\nba-copy\\predictions-holdout.jsonl")).toEqual(["nba-canonical-or-prediction-table"]);
    for (const source of ["src/lib/nba/props/projection.ts", "src/lib/nba/props/ingest/statsNbaPayload.ts", "scripts/nba-build-dataset.ts", "docs/nba-player-props-phase-1.md", "public/logos/nba.png"]) {
      expect(classifyPath(source)).toEqual([]);
    }
  });

  it("flags local-only NBA.com retrieval tooling if it becomes committable", () => {
    for (const tool of LOCAL_ONLY_RETRIEVAL_TOOLS) expect(classifyPath(tool)).toEqual(["nba-com-retrieval-tool"]);
  });

  it("detects the locally held tuned v0 values in code, JSON and prose, but not the public defaults", () => {
    // Assembled at runtime so this test file does not itself contain the tuned values.
    const [a, b, c, g] = [50, 100, 50, 6];
    const tuned = [
      `rateShrinkMinutes: Object.freeze({ pts: ${a}, reb: ${b}, ast: ${c} })`,
      JSON.stringify({ rateShrinkMinutes: { pts: a, reb: b, ast: c } }),
      `K_rate = PTS ${a} / REB ${b} / AST ${c}`,
      `newPlayerMinutes: ${g},`,
      `newPlayerMinutes: [4, ${g}, 8, 12, 16, 20]`,
    ];
    for (const text of tuned) expect(classifySourceContent(text)).toEqual(["nba-tuned-v0-params"]);
    for (const text of ["rateShrinkMinutes: { pts: 100, reb: 100, ast: 100 }", "newPlayerMinutes: 14,", `newPlayerMinutes: [${g}, 10, 14]`, `newPlayerMinutes: ${g}.5`]) {
      expect(classifySourceContent(text)).toEqual([]);
    }
    expect(findViolations({ paths: ["src/x.ts"], readText: () => tuned[0], scope: "git" })).toEqual([{ path: "src/x.ts", rules: ["nba-tuned-v0-params"] }]);
  });

  it("recognizes restricted content shapes", () => {
    expect(classifyContent('{"resultSets":[{"headers":["PLAYER_ID","GAME_ID"],"rowSet":[]}]}')).toEqual(["raw-stats-nba-payload"]);
    expect(classifyContent('{"schemaVersion": "nba-raw-snapshot-meta-v1"}')).toEqual(["raw-snapshot-metadata"]);
    expect(classifyContent('{"schemaVersion":"nba-player-game-v1","playerId":1}')).toEqual(["nba-canonical-or-model-record"]);
    expect(classifyContent('{"modelVersion":"nba-minutes-v1-candidate"}')).toEqual(["nba-model-output"]);
    // Research-pipeline records (captured lines, results, evaluations) are restricted the same way.
    for (const name of ["pregame-snapshot", "final-result", "prop-evaluation", "capture-attempt", "job-run", "pipeline-game", "line-import-batch", "prop-partition"]) {
      expect(classifyContent(`{"schemaVersion":"nba-${name}-v1","x":1}`)).toEqual(["nba-canonical-or-model-record"]);
    }
    expect(classifyPath("data/nba/pipeline/snapshots.jsonl")).toContain("nba-data-directory");
    expect(classifyContent(`# report\n<!-- ${RESTRICTED_REPORT_MARKER} -->`)).toEqual(["restricted-report-marker"]);
    expect(classifyContent('{"resultSets":[{"headers":["GAME_ID"]}]}')).toEqual([]);
    expect(classifyContent("fetch('https://stats.nba.com/stats/x')")).toEqual([]);
    expect(classifyContent("fetch('https://stats.nba.com/stats/x')", { deployable: true })).toEqual(["nba-ingest-code-in-bundle"]);
  });

  it("flags the private hoopR/ESPN V1 artifacts by name and by record shape, wherever they are copied", () => {
    for (const name of ["player-games.json", "hoopr-import-report.json", "position-map-report.json", "position-review-list.csv", "position-review-list.json", "private-preview-board.json", "positions-2026-27.json", "positions-2025-26.json"]) {
      expect(classifyPath(`public/exports/${name}`), name).toEqual(["nba-v1-private-artifact"]);
    }
    expect(classifyPath("dist/props-v1/raw/hoopr/player_box_2026.json")).toEqual(["nba-v1-private-artifact"]);
    expect(classifyPath("src/lib/nba/props/v1/positionReview.ts")).toEqual([]);
    expect(classifyPath("docs/nba-props-v1.md")).toEqual([]);
    for (const schema of ["jkb-player-games-import-v1", "jkb-hoopr-manifest-v1", "jkb-position-estimates-v1"]) {
      expect(classifyContent(`{"schemaVersion":"${schema}","rows":[]}`), schema).toEqual(["nba-v1-private-record"]);
    }
    expect(classifyContent('{"privatePreview": {"notice": "x"}}')).toEqual(["nba-v1-private-record"]);
    // Source code and prose that merely name the schema are not records.
    expect(classifyContent('const x = { schemaVersion: "jkb-player-games-import-v1" }')).toEqual([]);
  });

  it("scans content only for data-like files in git scope and all text in deployable scope", () => {
    const files: Record<string, string> = {
      "src/lib/nba/props/types.ts": 'schemaVersion: "nba-player-game-v1"',
      "notes/copy.json": '{"schemaVersion":"nba-outcome-v1"}',
      "dist/assets/index-abc.js": 'const v="nba-props-baseline-v0"',
      "dist/assets/app.js": "console.log('ok')",
      "dist/img.png": "binary",
    };
    const readText = (p: string) => files[p] ?? null;
    expect(findViolations({ paths: ["src/lib/nba/props/types.ts", "notes/copy.json"], readText, scope: "git" })).toEqual([
      { path: "notes/copy.json", rules: ["nba-canonical-or-model-record"] },
    ]);
    expect(findViolations({ paths: ["dist/assets/index-abc.js", "dist/assets/app.js", "dist/img.png"], readText, scope: "deployable" })).toEqual([
      { path: "dist/assets/index-abc.js", rules: ["nba-model-code-in-bundle"] },
    ]);
  });

  it("checks required source and the .vercelignore rule", () => {
    expect(findMissingSource({ exists: () => true, isIgnored: (p: string) => p.endsWith("projection.ts"), required: ["a.ts", "src/projection.ts"] })).toEqual([
      { path: "src/projection.ts", problem: "gitignored" },
    ]);
    expect(findMissingSource({ exists: () => false, isIgnored: () => false, required: ["a.ts"] })).toEqual([{ path: "a.ts", problem: "missing" }]);
    expect(vercelIgnoreProtects("# c\ndata/nba/\n")).toBe(true);
    expect(vercelIgnoreProtects("/data/nba/**")).toBe(true);
    expect(vercelIgnoreProtects("data/\n")).toBe(false);
    expect(vercelIgnoreProtects(null)).toBe(false);
  });
});

const repoRoot = path.resolve(__dirname, "../../../..");
const gitAvailable = (() => {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: repoRoot, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!gitAvailable)("repository containment", () => {
  const git = (args: string[]) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const split = (out: string) => out.split("\0").filter(Boolean);

  it("has no restricted NBA data among tracked or committable files", () => {
    const paths = [...new Set([...split(git(["ls-files", "-z"])), ...split(git(["ls-files", "-z", "--others", "--exclude-standard"]))])];
    const readText = (p: string) => {
      const full = path.join(repoRoot, p);
      try {
        return statSync(full).size <= 64 * 1024 * 1024 ? readFileSync(full, "utf8") : null;
      } catch {
        return null;
      }
    };
    expect(findViolations({ paths, readText, scope: "git" })).toEqual([]);
  }, 120_000);

  it("keeps data/nba and the retrieval tooling ignored, and NBA source committable", () => {
    expect(git(["check-ignore", "--no-index", "data/nba/raw/x.body.json"]).trim()).toBe("data/nba/raw/x.body.json");
    for (const tool of LOCAL_ONLY_RETRIEVAL_TOOLS) expect(git(["check-ignore", "--no-index", tool]).trim()).toBe(tool);
    const isIgnored = (p: string) => {
      try {
        git(["check-ignore", "-q", "--no-index", p]);
        return true;
      } catch {
        return false;
      }
    };
    expect(findMissingSource({ exists: (p: string) => existsSync(path.join(repoRoot, p)), isIgnored })).toEqual([]);
    const vercelIgnore = path.join(repoRoot, ".vercelignore");
    expect(vercelIgnoreProtects(existsSync(vercelIgnore) ? readFileSync(vercelIgnore, "utf8") : null)).toBe(true);
  });

  it("serves no NBA research data from the dev server", () => {
    const viteConfig = readFileSync(path.join(repoRoot, "vite.config.ts"), "utf8");
    expect(viteConfig).toContain('"**/data/nba/**"');
  });

  it("ships no NBA data from public/", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(full) : [path.relative(repoRoot, full).split(path.sep).join("/")];
      });
    const paths = walk(path.join(repoRoot, "public"));
    const readText = (p: string) => {
      const full = path.join(repoRoot, p);
      return statSync(full).size <= 64 * 1024 * 1024 ? readFileSync(full, "utf8") : null;
    };
    expect(findViolations({ paths, readText, scope: "deployable" })).toEqual([]);
  }, 120_000);
});
