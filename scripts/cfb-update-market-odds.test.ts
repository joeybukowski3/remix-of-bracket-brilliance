// Odds-only schedule update (scripts/cfb-update-market-odds.ts): rewrites
// ONLY the `odds` field of each already-committed game, joined strictly by
// CFBD game ID, and preserves last-known-good odds on an endpoint-wide
// failure (missing raw cache) or a per-game absence in an otherwise-
// successful fetch.
//
// Runs the real script as a child process (its module executes main() at
// import time) against an isolated temp "repo root" via the CFB_TEST_ROOT
// env var seam, matching scripts/cfb-v2-build-shadow.fail-closed.test.ts.

import { describe, expect, it, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { CfbGame } from "../src/data/cfb/types";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const VITE_NODE_CLI = resolve(REPO_ROOT, "node_modules", "vite-node", "dist", "cli.mjs");
const SCRIPT = resolve(REPO_ROOT, "scripts", "cfb-update-market-odds.ts");

const EMPTY_ODDS = {
  openingSpread: null,
  currentSpread: null,
  awayMoneyline: null,
  homeMoneyline: null,
  openingTotal: null,
  currentTotal: null,
};

function minimalGame(overrides: Partial<CfbGame> & { id: string }): CfbGame {
  return {
    season: 2026,
    week: 1,
    date: "2026-08-29",
    time: "16:00",
    awayTeamId: "away",
    homeTeamId: "home",
    neutralSite: false,
    venue: "Test Stadium",
    tvNetwork: null,
    gameStatus: "scheduled",
    awayScore: null,
    homeScore: null,
    odds: EMPTY_ODDS,
    model: {
      jkbProjectedSpread: null,
      jkbProjectedTotal: null,
      homeWinProbability: null,
      awayWinProbability: null,
      neutralPowerDifference: null,
      homeFieldAdjustment: null,
      jkbPowerLine: null,
    },
    ...overrides,
  } as CfbGame;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function setupRoot(schedule: CfbGame[], rawLines?: unknown): string {
  const root = mkdtempSync(join(tmpdir(), "cfb-update-market-odds-"));
  writeJson(resolve(root, "data", "generated", "cfb", "2026-schedule-v1.json"), schedule);
  if (rawLines !== undefined) {
    writeJson(resolve(root, "data", "cfb", "cfbd", "raw", "lines-2026.json"), rawLines);
  }
  return root;
}

function run(root: string): { status: number | null; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [VITE_NODE_CLI, SCRIPT], {
      cwd: REPO_ROOT,
      env: { ...process.env, CFB_TEST_ROOT: root },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const e = error as { status: number | null; stdout: string; stderr: string };
    return { status: e.status, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

describe("cfb-update-market-odds.ts", () => {
  let tempRoot: string | null = null;
  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  it("merges fresh odds by CFBD game ID and touches nothing else", () => {
    const schedule = [minimalGame({ id: "1", venue: "Neyland Stadium" }), minimalGame({ id: "2" })];
    tempRoot = setupRoot(schedule, [
      { id: 1, lines: [{ provider: "DraftKings", spread: -7, overUnder: 51.5, homeMoneyline: -280, awayMoneyline: 230 }] },
    ]);

    const result = run(tempRoot);
    expect(result.status).toBe(0);

    const updated = readJson<CfbGame[]>(resolve(tempRoot, "data", "generated", "cfb", "2026-schedule-v1.json"));
    expect(updated.map((g) => g.id)).toEqual(["1", "2"]);
    expect(updated[0].odds.currentSpread).toBe(-7);
    expect(updated[0].venue).toBe("Neyland Stadium");
    expect(updated[1].odds).toEqual(EMPTY_ODDS);
  }, 30000);

  it("endpoint-wide failure (raw lines cache missing): preserves every game's last-known-good odds, does not fail the run", () => {
    const priorOdds = { ...EMPTY_ODDS, currentSpread: -3.5, currentTotal: 47, homeMoneyline: -160, awayMoneyline: 140 };
    const schedule = [minimalGame({ id: "1", odds: priorOdds })];
    tempRoot = setupRoot(schedule); // no raw lines file written at all

    const result = run(tempRoot);
    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).toMatch(/endpoint unavailable \(LKG fallback\)/);

    const updated = readJson<CfbGame[]>(resolve(tempRoot, "data", "generated", "cfb", "2026-schedule-v1.json"));
    expect(updated[0].odds).toEqual(priorOdds);
  }, 30000);

  it("per-game absence in a successful fetch: that game keeps its own last-known-good odds, others still update", () => {
    const priorOdds = { ...EMPTY_ODDS, currentSpread: -3.5, currentTotal: 47, homeMoneyline: -160, awayMoneyline: 140 };
    const schedule = [minimalGame({ id: "1", odds: priorOdds }), minimalGame({ id: "2" })];
    tempRoot = setupRoot(schedule, [
      { id: 2, lines: [{ provider: "DraftKings", spread: 4.5 }] },
      // game 1 absent from the fresh response entirely
    ]);

    const result = run(tempRoot);
    expect(result.status).toBe(0);

    const updated = readJson<CfbGame[]>(resolve(tempRoot, "data", "generated", "cfb", "2026-schedule-v1.json"));
    expect(updated[0].odds).toEqual(priorOdds);
    expect(updated[1].odds.currentSpread).toBe(4.5);
  }, 30000);

  it("is deterministic: running twice against the same inputs produces byte-identical output", () => {
    const schedule = [minimalGame({ id: "1" })];
    tempRoot = setupRoot(schedule, [
      { id: 1, lines: [{ provider: "DraftKings", spread: -7, overUnder: 51.5, homeMoneyline: -280, awayMoneyline: 230 }] },
    ]);

    expect(run(tempRoot).status).toBe(0);
    const first = readFileSync(resolve(tempRoot, "data", "generated", "cfb", "2026-schedule-v1.json"));

    expect(run(tempRoot).status).toBe(0);
    const second = readFileSync(resolve(tempRoot, "data", "generated", "cfb", "2026-schedule-v1.json"));

    expect(first.equals(second)).toBe(true);
  }, 30000);
});
