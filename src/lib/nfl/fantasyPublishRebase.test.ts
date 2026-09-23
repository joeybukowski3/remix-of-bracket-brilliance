import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = resolve(process.cwd(), "scripts/ci/discard-unowned-tracked-changes.sh").replace(/\\/g, "/");
const dirs: string[] = [];

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });
}

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "fantasy-publish-"));
  dirs.push(root);
  const origin = join(root, "origin.git");
  const work = join(root, "work");
  git(root, "init", "--bare", "-b", "main", origin);
  git(root, "clone", origin, work);
  mkdirSync(join(work, "public/data/nfl"), { recursive: true });
  mkdirSync(join(work, "public/data/fantasy/projections/2026"), { recursive: true });
  writeFileSync(join(work, "public/data/nfl/matchup-market.json"), "{\"v\":1}\n");
  writeFileSync(join(work, "public/data/fantasy/projections/2026/week-02.json"), "{}\n");
  git(work, "add", ".");
  git(work, "commit", "-m", "init");
  git(work, "push", "origin", "HEAD:main");
  return work;
}

function publish(work: string, cleanFirst: boolean) {
  // Ephemeral input refresh (tracked, outside the owned paths) + owned output.
  writeFileSync(join(work, "public/data/nfl/matchup-market.json"), "{\"v\":2}\n");
  writeFileSync(join(work, "public/data/fantasy/projections/2026/week-03.json"), "{\"rows\":1}\n");
  git(work, "add", "public/data/fantasy/projections/2026");
  git(work, "commit", "-m", "publish week 3");
  if (cleanFirst) execFileSync("bash", [SCRIPT], { cwd: work });
  git(work, "fetch", "origin", "main");
  git(work, "rebase", "origin/main");
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("fantasy publish rebase", () => {
  it("reproduces the failure: an unstaged tracked input change blocks the rebase", () => {
    expect(() => publish(makeRepo(), false)).toThrow();
  });

  it("rebases cleanly after unowned tracked changes are discarded, keeping the fantasy commit", () => {
    const work = makeRepo();
    publish(work, true);
    expect(readFileSync(join(work, "public/data/fantasy/projections/2026/week-03.json"), "utf8")).toContain("rows");
    const market = readFileSync(join(work, "public/data/nfl/matchup-market.json"), "utf8").trim();
    expect(market).toBe("{\"v\":1}");
    expect(git(work, "log", "-1", "--format=%s")).toContain("publish week 3");
  });
});
