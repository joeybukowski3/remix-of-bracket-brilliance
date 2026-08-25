// Odds-only fetch (scripts/cfb-fetch-market-odds.ts): exactly one CFBD
// request (GET /lines?year=<season>), atomic write, and the previously
// cached raw lines file must survive untouched when the run fails before
// ever reaching the network (e.g. missing CFBD_API_KEY) — the same
// atomic-write seam (writeAtomic) used across the CFBD pipeline already
// guarantees a successful fetch can't leave a half-written file; this
// covers the "no request made at all" failure path specifically.
//
// Runs the real script as a child process (its module executes main() at
// import time, so it cannot be imported directly in-process) against an
// isolated temp "repo root" via the CFB_TEST_ROOT env var seam, matching
// the pattern already established by scripts/cfb-v2-build-shadow.fail-
// closed.test.ts.

import { describe, expect, it, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readFileSync as readSrc } from "node:fs";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const VITE_NODE_CLI = resolve(REPO_ROOT, "node_modules", "vite-node", "dist", "cli.mjs");
const SCRIPT = resolve(REPO_ROOT, "scripts", "cfb-fetch-market-odds.ts");

function writeJson(path: string, value: unknown): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function run(root: string, env: Record<string, string | undefined>): { status: number | null; stdout: string; stderr: string } {
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

describe("cfb-fetch-market-odds.ts — source-level guarantees", () => {
  const source = readSrc(SCRIPT, "utf8");

  it("requests exactly one CFBD endpoint: /lines", () => {
    const pathMatches = [...source.matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(pathMatches).toEqual(["/lines"]);
  });

  it("never references any other CFBD endpoint (teams, games, stats, plays, talent, returning production)", () => {
    for (const forbidden of ["/teams", "/games", "/games/teams", "/plays", "/talent", "/player/returning"]) {
      expect(source).not.toContain(`"${forbidden}"`);
    }
  });

  it("reads the API key only from the environment and never logs it", () => {
    expect(source).toContain("process.env.CFBD_API_KEY");
    expect(source).not.toMatch(/console\.(log|warn|error)\([^)]*API_KEY[^)]*\)/);
  });
});

describe("cfb-fetch-market-odds.ts — atomic cache preservation on early failure", () => {
  let tempRoot: string | null = null;
  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  it("missing CFBD_API_KEY: fails without writing, and the previously cached raw lines file is left byte-identical", () => {
    tempRoot = mkdtempSync(join(tmpdir(), "cfb-fetch-market-odds-"));
    const rawPath = resolve(tempRoot, "data", "cfb", "cfbd", "raw", "lines-2026.json");
    writeJson(rawPath, [{ id: 1, lines: [{ provider: "DraftKings", spread: -3 }] }]);
    const before = readFileSync(rawPath);

    const result = run(tempRoot, { CFBD_API_KEY: "" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/CFBD_API_KEY is required/);
    expect(readFileSync(rawPath).equals(before)).toBe(true);
  }, 30000);
});
