// WU7A checkpoint §1 — proves the ACTUAL git mechanics of publishing
// public/data/cfb/v2/shadow-projections.json, not just a text-pattern
// check on .gitignore. Runs entirely inside an isolated temp git
// repository (never touches the real working tree/index) to avoid any
// risk to the repo's real tracked files.

import { describe, expect, it, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");

function git(cwd: string, args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const e = error as { status: number | null; stdout: string; stderr: string };
    return { status: e.status, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

describe("public/data/cfb/v2/shadow-projections.json — real git-add mechanics (WU7A checkpoint §1)", () => {
  let tempRepo: string | null = null;
  afterEach(() => {
    if (tempRepo) rmSync(tempRepo, { recursive: true, force: true });
    tempRepo = null;
  });

  it("a plain `git add` (no -f) stages the intended artifact, while any other file in the same directory stays ignored", () => {
    tempRepo = mkdtempSync(join(tmpdir(), "cfb-v2-gitignore-check-"));
    git(tempRepo, ["init", "-q"]);
    git(tempRepo, ["config", "user.email", "test@example.com"]);
    git(tempRepo, ["config", "user.name", "test"]);
    copyFileSync(resolve(REPO_ROOT, ".gitignore"), resolve(tempRepo, ".gitignore"));

    const artifactPath = resolve(tempRepo, "public", "data", "cfb", "v2", "shadow-projections.json");
    const otherPath = resolve(tempRepo, "public", "data", "cfb", "v2", "some-other-generated-file.json");
    mkdirSync(resolve(artifactPath, ".."), { recursive: true });
    writeFileSync(artifactPath, JSON.stringify({ test: true }));
    writeFileSync(otherPath, JSON.stringify({ other: true }));

    // The exact command the workflow's commit step runs.
    const addArtifact = git(tempRepo, ["add", "public/data/cfb/v2/shadow-projections.json"]);
    expect(addArtifact.status).toBe(0);
    const staged = git(tempRepo, ["diff", "--cached", "--name-only"]).stdout.trim();
    expect(staged).toBe("public/data/cfb/v2/shadow-projections.json");

    // A DIFFERENT file in the same directory must remain ignored (no -f anywhere).
    const addOther = git(tempRepo, ["add", "public/data/cfb/v2/some-other-generated-file.json"]);
    expect(addOther.status).not.toBe(0);
    expect(addOther.stderr).toMatch(/ignored/i);
  });

  it("no -f is used anywhere in the workflow's commit step, and none is needed", () => {
    const workflow = require("node:fs").readFileSync(resolve(REPO_ROOT, ".github", "workflows", "cfb-v2-shadow-refresh.yml"), "utf8") as string;
    const commitStepIndex = workflow.indexOf("- name: Commit and push browser artifact");
    const commitBlock = workflow.slice(commitStepIndex, commitStepIndex + 1200);
    expect(commitBlock).toContain("git add public/data/cfb/v2/shadow-projections.json");
    expect(commitBlock).not.toMatch(/git add .*-f\b/);
    expect(commitBlock).not.toMatch(/add\.\s*--force|add\s+--force/);
  });
});
