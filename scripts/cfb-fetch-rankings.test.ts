// Rankings-only fetch (scripts/cfb-fetch-rankings.ts): exactly one CFBD
// request (GET /rankings?year=<season>), atomic write, no secret logging, and
// the previously cached raw rankings file must survive untouched when the run
// fails before ever reaching the network (e.g. missing CFBD_API_KEY).
//
// Mirrors scripts/cfb-fetch-market-odds.test.ts: the real script is run as a
// child process (its module executes main() at import time) against an isolated
// temp "repo root" via the CFB_TEST_ROOT env var seam.

import { describe, expect, it, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const VITE_NODE_CLI = resolve(REPO_ROOT, "node_modules", "vite-node", "dist", "cli.mjs");
const SCRIPT = resolve(REPO_ROOT, "scripts", "cfb-fetch-rankings.ts");

function writeJson(path: string, value: unknown): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function run(root: string, env: Record<string, string | undefined>) {
  try {
    const stdout = execFileSync(process.execPath, [VITE_NODE_CLI, SCRIPT], {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env, CFB_TEST_ROOT: root },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const e = error as { status: number | null; stdout: string; stderr: string };
    return { status: e.status, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

describe("cfb-fetch-rankings.ts — source-level guarantees", () => {
  const source = readFileSync(SCRIPT, "utf8");

  it("requests exactly one CFBD endpoint: /rankings", () => {
    const pathMatches = [...source.matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(pathMatches).toEqual(["/rankings"]);
  });

  it("never references the broad pipeline endpoints (teams, games, stats, plays, talent, lines)", () => {
    for (const forbidden of ["/teams", "/games", "/games/teams", "/plays", "/talent", "/lines", "/player/returning"]) {
      expect(source).not.toContain(`"${forbidden}"`);
    }
  });

  it("reads the API key only from the environment and never logs it", () => {
    expect(source).toContain("process.env.CFBD_API_KEY");
    expect(source).not.toMatch(/console\.(log|warn|error)\([^)]*API_KEY[^)]*\)/);
  });

  it("writes the raw cache atomically via the shared writeAtomic seam", () => {
    expect(source).toContain("writeAtomic(");
  });
});

describe("cfb-fetch-rankings.ts — atomic cache preservation on early failure", () => {
  let tempRoot: string | null = null;
  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  it("missing CFBD_API_KEY: fails without writing, previously cached raw rankings left byte-identical", () => {
    tempRoot = mkdtempSync(join(tmpdir(), "cfb-fetch-rankings-"));
    const rawPath = resolve(tempRoot, "data", "cfb", "cfbd", "raw", "rankings-2026.json");
    writeJson(rawPath, [{ season: 2026, seasonType: "preseason", week: 1, polls: [] }]);
    const before = readFileSync(rawPath);

    const result = run(tempRoot, { CFBD_API_KEY: "" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/CFBD_API_KEY is required/);
    expect(result.stderr).not.toMatch(/Bearer /);
    expect(readFileSync(rawPath).equals(before)).toBe(true);
  }, 30000);
});
