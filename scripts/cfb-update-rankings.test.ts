// Rankings-only artifact update (scripts/cfb-update-rankings.ts): normalizes
// the raw CFBD /rankings cache into data/generated/cfb/2026-rankings.json and
// protects last-known-good data on endpoint failure or invalid payloads.
//
// Runs the real script as a child process (its module executes main() at
// import time) against an isolated temp "repo root" via the CFB_TEST_ROOT env
// var seam, matching scripts/cfb-update-market-odds.test.ts.
//
// FIXTURE DATA ONLY — the schools used below are an arbitrary slice of the FBS
// team table. They are NOT a real AP poll and must never be treated as one.

import { describe, expect, it, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CFB_TEAM_METADATA } from "../src/data/cfb/teamMetadata";
import type { CfbOfficialRankingsArtifact } from "../src/data/cfb/season2026/officialRankings";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const VITE_NODE_CLI = resolve(REPO_ROOT, "node_modules", "vite-node", "dist", "cli.mjs");
const SCRIPT = resolve(REPO_ROOT, "scripts", "cfb-update-rankings.ts");
const ARTIFACT = ["data", "generated", "cfb", "2026-rankings.json"];
const RAW = ["data", "cfb", "cfbd", "raw", "rankings-2026.json"];

const FIXTURE_TEAMS = CFB_TEAM_METADATA.slice(0, 25);

function ranks(schools: readonly string[] = FIXTURE_TEAMS.map((t) => t.name)) {
  return schools.map((school, index) => ({ rank: index + 1, school, points: 1500 - index * 40 }));
}

function apPayload(week = 1, seasonType = "preseason", pollRanks = ranks()) {
  return [{ season: 2026, seasonType, week, polls: [{ poll: "AP Top 25", ranks: pollRanks }] }];
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readArtifact(root: string): CfbOfficialRankingsArtifact {
  return JSON.parse(readFileSync(resolve(root, ...ARTIFACT), "utf8")) as CfbOfficialRankingsArtifact;
}

function setupRoot(previous: unknown, raw?: unknown): string {
  const root = mkdtempSync(join(tmpdir(), "cfb-update-rankings-"));
  if (previous !== undefined) writeJson(resolve(root, ...ARTIFACT), previous);
  if (raw !== undefined) writeJson(resolve(root, ...RAW), raw);
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

const EMPTY_ARTIFACT = {
  season: 2026,
  source: "cfbd:/rankings",
  generatedAt: null,
  polls: { ap: null, cfp: null },
};

const GOOD_PRIOR_AP = {
  pollName: "AP Top 25",
  seasonType: "regular",
  week: 4,
  ranks: Object.fromEntries(FIXTURE_TEAMS.map((team, index) => [team.id, index + 1])),
};

describe("cfb-update-rankings.ts", () => {
  let tempRoot: string | null = null;
  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  it("publishes a valid AP poll into the artifact, mapped to production team ids", () => {
    tempRoot = setupRoot(EMPTY_ARTIFACT, apPayload());
    expect(run(tempRoot).status).toBe(0);

    const artifact = readArtifact(tempRoot);
    expect(artifact.polls.ap?.pollName).toBe("AP Top 25");
    expect(artifact.polls.ap?.seasonType).toBe("preseason");
    expect(Object.keys(artifact.polls.ap?.ranks ?? {})).toHaveLength(25);
    expect(artifact.polls.ap?.ranks[FIXTURE_TEAMS[0].id]).toBe(1);
    expect(artifact.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  }, 30000);

  it("case C — no CFP poll yet is NOT a failure and publishes cfp: null", () => {
    tempRoot = setupRoot(EMPTY_ARTIFACT, apPayload());
    const result = run(tempRoot);
    expect(result.status).toBe(0);
    expect(readArtifact(tempRoot).polls.cfp).toBeNull();
  }, 30000);

  it("case A — endpoint failure (missing raw cache) preserves the artifact byte-for-byte and fails the run", () => {
    const prior = { ...EMPTY_ARTIFACT, generatedAt: "2026-08-20T12:00:00.000Z", polls: { ap: GOOD_PRIOR_AP, cfp: null } };
    tempRoot = setupRoot(prior); // no raw cache at all
    const before = readFileSync(resolve(tempRoot, ...ARTIFACT));

    const result = run(tempRoot);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/keeping last-known-good artifact untouched/);
    expect(readFileSync(resolve(tempRoot, ...ARTIFACT)).equals(before)).toBe(true);
  }, 30000);

  it("case A — a malformed (non-array) payload never overwrites a valid artifact", () => {
    const prior = { ...EMPTY_ARTIFACT, polls: { ap: GOOD_PRIOR_AP, cfp: null } };
    tempRoot = setupRoot(prior, { unexpected: "object" });
    const before = readFileSync(resolve(tempRoot, ...ARTIFACT));

    expect(run(tempRoot).status).not.toBe(0);
    expect(readFileSync(resolve(tempRoot, ...ARTIFACT)).equals(before)).toBe(true);
  }, 30000);

  it("case B — an invalid poll (duplicate rank) keeps last-known-good ranks and fails the run", () => {
    const bad = ranks();
    bad[5] = { ...bad[5], rank: 3 };
    const prior = { ...EMPTY_ARTIFACT, polls: { ap: GOOD_PRIOR_AP, cfp: null } };
    tempRoot = setupRoot(prior, apPayload(1, "preseason", bad));

    const result = run(tempRoot);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/kept last-known-good/);
    expect(readArtifact(tempRoot).polls.ap).toEqual(GOOD_PRIOR_AP);
  }, 30000);

  it("case B — a short poll (24 teams) never blanks the ranked field", () => {
    const prior = { ...EMPTY_ARTIFACT, polls: { ap: GOOD_PRIOR_AP, cfp: null } };
    tempRoot = setupRoot(prior, apPayload(1, "preseason", ranks().slice(0, 24)));

    expect(run(tempRoot).status).not.toBe(0);
    expect(Object.keys(readArtifact(tempRoot).polls.ap?.ranks ?? {})).toHaveLength(25);
  }, 30000);

  it("case B — an unmapped school is rejected rather than silently fuzzy-matched", () => {
    const bad = ranks();
    bad[2] = { ...bad[2], school: "Nowhere Tech" };
    tempRoot = setupRoot(EMPTY_ARTIFACT, apPayload(1, "preseason", bad));

    const result = run(tempRoot);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/Nowhere Tech/);
    expect(readArtifact(tempRoot).polls.ap).toBeNull();
  }, 30000);

  it("case D — teams outside the poll are simply absent from the rank map (no 26+ ranks)", () => {
    tempRoot = setupRoot(EMPTY_ARTIFACT, apPayload());
    expect(run(tempRoot).status).toBe(0);

    const map = readArtifact(tempRoot).polls.ap?.ranks ?? {};
    const unranked = CFB_TEAM_METADATA.find((team) => !(team.id in map));
    expect(unranked).toBeDefined();
    expect(Math.max(...Object.values(map))).toBe(25);
  }, 30000);

  it("selects the latest weekly AP poll once weekly polls begin", () => {
    const payload = [
      ...apPayload(1, "preseason"),
      { season: 2026, seasonType: "regular", week: 3, polls: [{ poll: "AP Top 25", ranks: ranks() }] },
      { season: 2026, seasonType: "regular", week: 2, polls: [{ poll: "AP Top 25", ranks: ranks() }] },
    ];
    tempRoot = setupRoot(EMPTY_ARTIFACT, payload);
    expect(run(tempRoot).status).toBe(0);
    expect(readArtifact(tempRoot).polls.ap?.week).toBe(3);
    expect(readArtifact(tempRoot).polls.ap?.seasonType).toBe("regular");
  }, 30000);

  it("publishes CFP alongside AP once the committee poll appears", () => {
    const payload = [
      ...apPayload(10, "regular"),
      {
        season: 2026,
        seasonType: "regular",
        week: 10,
        polls: [{ poll: "Playoff Committee Rankings", ranks: ranks() }],
      },
    ];
    tempRoot = setupRoot(EMPTY_ARTIFACT, payload);
    expect(run(tempRoot).status).toBe(0);

    const artifact = readArtifact(tempRoot);
    expect(artifact.polls.ap).not.toBeNull();
    expect(artifact.polls.cfp?.pollName).toBe("Playoff Committee Rankings");
    expect(Object.keys(artifact.polls.cfp?.ranks ?? {})).toHaveLength(25);
  }, 30000);

  it("is deterministic: an unchanged poll leaves the artifact byte-identical (no generatedAt churn)", () => {
    tempRoot = setupRoot(EMPTY_ARTIFACT, apPayload());
    expect(run(tempRoot).status).toBe(0);
    const first = readFileSync(resolve(tempRoot, ...ARTIFACT));

    expect(run(tempRoot).status).toBe(0);
    const second = readFileSync(resolve(tempRoot, ...ARTIFACT));

    expect(second.equals(first)).toBe(true);
  }, 30000);
});
