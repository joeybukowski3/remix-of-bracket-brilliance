// Source-level guarantees for the WU6 collector/publisher CLIs. Both scripts run
// main() at import time, so they are asserted at the source level (matching the
// pattern in scripts/cfb-fetch-market-odds.test.ts) plus one child-process run of
// the collector's fail-closed arg/env validation.

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..");
const VITE_NODE_CLI = resolve(REPO_ROOT, "node_modules", "vite-node", "dist", "cli.mjs");
const COLLECT = resolve(REPO_ROOT, "scripts", "market", "collect-betting-splits.ts");
const PUBLISH = resolve(REPO_ROOT, "scripts", "market", "publish-betting-splits.ts");
const REFRESH = resolve(REPO_ROOT, "scripts", "market", "refresh-betting-splits.ts");

const collectSrc = readFileSync(COLLECT, "utf8");
const publishSrc = readFileSync(PUBLISH, "utf8");
const refreshSrc = readFileSync(REFRESH, "utf8");

function run(script: string, args: string[], env: Record<string, string | undefined>) {
  try {
    const stdout = execFileSync(
      process.execPath,
      [VITE_NODE_CLI, script, ...args],
      { cwd: REPO_ROOT, env: { ...process.env, ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const e = error as { status: number | null; stdout: string; stderr: string };
    return { status: e.status, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

describe("collect-betting-splits.ts — source guarantees", () => {
  it("only references the two verified NFL routes", () => {
    expect(collectSrc).toContain("createSportsDataIoClient");
    expect(collectSrc).not.toMatch(/v3\/cfb\//);
    expect(collectSrc).not.toMatch(/BettingSplitsByGameID/);
  });

  it("reads the API key from the environment only and never logs it", () => {
    expect(collectSrc).toContain("process.env.SPORTSDATAIO_API_KEY");
    expect(collectSrc).not.toMatch(/console\.(log|warn|error)\([^)]*apiKey/i);
  });

  it("never imports the public artifact publisher (collect must not publish)", () => {
    expect(collectSrc).not.toMatch(/publishBettingSplitsArtifacts|bettingSplitsPublicArtifacts/);
  });

  it("rejects --league cfb without making a request", () => {
    const result = run(COLLECT, ["--league", "cfb", "--season", "2026", "--week", "1", "--schedule", "x.json"], {
      SPORTSDATAIO_API_KEY: "irrelevant",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/only --league nfl is supported/i);
  });

  it("fails closed when SPORTSDATAIO_API_KEY is missing", () => {
    const result = run(
      COLLECT,
      ["--league", "nfl", "--season", "2026", "--week", "1", "--schedule", "x.json"],
      { SPORTSDATAIO_API_KEY: "" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/SPORTSDATAIO_API_KEY is required/);
  });

  it("fails closed on a missing --schedule", () => {
    const result = run(COLLECT, ["--league", "nfl", "--season", "2026", "--week", "1"], {
      SPORTSDATAIO_API_KEY: "irrelevant",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--schedule/);
  });
});

describe("publish-betting-splits.ts — source guarantees", () => {
  it("calls the WU5 publisher and writes under public/data/market", () => {
    expect(publishSrc).toContain("publishBettingSplitsArtifacts");
    expect(publishSrc).toMatch(/"public",\s*"data",\s*"market"/);
  });

  it("never touches the SportsDataIO client or network", () => {
    expect(publishSrc).not.toMatch(/sportsDataIoClient|SPORTSDATAIO_API_KEY|fetch\(/);
  });
});

describe("refresh-betting-splits.ts — source + CLI guarantees", () => {
  it("orchestrates the existing modules rather than reimplementing them", () => {
    expect(refreshSrc).toContain("runBettingSplitsRefresh");
    expect(refreshSrc).toContain("createSportsDataIoClient");
    expect(refreshSrc).toContain("createBettingSplitFileStore");
    expect(refreshSrc).not.toMatch(/decodeSportsDataIoNflSchedule|normalizeSportsDataIoBettingSplits/);
  });

  it("does not depend on the Scores ScoresByWeek feed", () => {
    expect(refreshSrc).not.toMatch(/ScoresByWeek|getNflScoresByWeek/);
    expect(collectSrc).not.toMatch(/ScoresByWeek|getNflScoresByWeek/);
  });

  it("reads the API key from the environment only and never logs it", () => {
    expect(refreshSrc).toContain("process.env.SPORTSDATAIO_API_KEY");
    expect(refreshSrc).not.toMatch(/console\.(log|warn|error)\([^)]*apiKey/i);
  });

  it("reuses the existing nflverse schedule artifact — no second NFL schedule source", () => {
    expect(refreshSrc).toContain("public/data/nfl/${season}/games.json");
    expect(refreshSrc).not.toMatch(/v3\/cfb\//);
  });

  it("rejects --league cfb without making a request", () => {
    const result = run(REFRESH, ["--league", "cfb", "--season", "2026", "--week", "1"], {
      SPORTSDATAIO_API_KEY: "irrelevant",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/only --league nfl is supported/i);
  }, 20000);

  it("fails closed when SPORTSDATAIO_API_KEY is missing", () => {
    const result = run(REFRESH, ["--league", "nfl", "--season", "2026", "--week", "1", "--dry-run"], {
      SPORTSDATAIO_API_KEY: "",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/SPORTSDATAIO_API_KEY is required/);
  }, 20000);

  it("forwards --season-type and rejects an invalid one", () => {
    const result = run(
      REFRESH,
      ["--league", "nfl", "--season", "2026", "--week", "1", "--season-type", "BOGUS"],
      { SPORTSDATAIO_API_KEY: "irrelevant" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--season-type must be REG, PRE or POST/);
  }, 20000);
});
