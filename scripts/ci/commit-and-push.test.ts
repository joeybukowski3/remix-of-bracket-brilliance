import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = resolve(__dirname, "commit-and-push.sh");
const hasBash = spawnSync("bash", ["--version"], { encoding: "utf8" }).status === 0;

// Real git + a real bare remote; nothing mocked. Skipped only where bash is unavailable.
// Each case spawns several git processes (slow on Windows), so allow far more than vitest's 5 s default.
describe.skipIf(!hasBash)("commit-and-push.sh", { timeout: 60_000 }, () => {
  let root: string;
  let remote: string;
  let work: string;
  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }).trim();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "jkb-push-"));
    remote = join(root, "remote.git");
    work = join(root, "work");
    git(root, "init", "--bare", "-b", "main", remote);
    git(root, "clone", remote, work);
    git(work, "config", "user.name", "test");
    git(work, "config", "user.email", "test@example.com");
    git(work, "config", "commit.gpgsign", "false");
    writeFileSync(join(work, "seed.txt"), "seed\n");
    git(work, "add", "seed.txt");
    git(work, "commit", "-m", "seed");
    git(work, "push", "origin", "HEAD:main");
  }, 60_000); // several git spawns per setup; the 10 s default hook timeout flakes under load on Windows
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const run = (message: string, env: Record<string, string> = {}) =>
    spawnSync("bash", [SCRIPT, message, "main"], {
      cwd: work,
      encoding: "utf8",
      env: { ...process.env, PUSH_SLEEP_BASE: "0", ...env },
    });
  const remoteHead = () => git(remote, "rev-parse", "main");

  it("commits and pushes staged files", () => {
    writeFileSync(join(work, "a.json"), "{}\n");
    git(work, "add", "a.json");
    const result = run("data: add a");
    expect(result.status).toBe(0);
    expect(git(remote, "log", "-1", "--format=%s", "main")).toBe("data: add a");
  });

  it("exits 0 and creates no commit when nothing is staged", () => {
    const before = remoteHead();
    const result = run("data: nothing");
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/no staged changes/i);
    expect(remoteHead()).toBe(before);
  });

  it("refuses an oversized file BEFORE committing, naming it, and leaves the work tree intact", () => {
    writeFileSync(join(work, "ok.json"), "{}\n");
    writeFileSync(join(work, "big.jsonl"), "x".repeat(2048));
    git(work, "add", "ok.json", "big.jsonl");
    const before = remoteHead();
    const headBefore = git(work, "rev-parse", "HEAD");

    const result = run("data: big", { MAX_FILE_BYTES: "1024" });

    expect(result.status).toBe(3);
    expect(`${result.stdout}${result.stderr}`).toMatch(/big\.jsonl/);
    expect(`${result.stdout}${result.stderr}`).toMatch(/::error[ :]/);
    expect(git(work, "rev-parse", "HEAD")).toBe(headBefore); // no commit made
    expect(remoteHead()).toBe(before);
    expect(existsSync(join(work, "big.jsonl"))).toBe(true); // file preserved
    expect(git(work, "diff", "--cached", "--name-only")).toBe(""); // unstaged so a later step cannot sweep it in
  });

  it("rebases over a concurrent push (non-fast-forward) and still lands the commit", () => {
    const other = join(root, "other");
    git(root, "clone", remote, other);
    git(other, "config", "user.name", "other");
    git(other, "config", "user.email", "other@example.com");
    writeFileSync(join(other, "theirs.txt"), "theirs\n");
    git(other, "add", "theirs.txt");
    git(other, "commit", "-m", "theirs");
    git(other, "push", "origin", "HEAD:main");

    writeFileSync(join(work, "mine.txt"), "mine\n");
    git(work, "add", "mine.txt");
    const result = run("data: mine");

    expect(result.status).toBe(0);
    const files = git(remote, "ls-tree", "-r", "--name-only", "main").split("\n");
    expect(files).toEqual(expect.arrayContaining(["theirs.txt", "mine.txt"]));
  });

  it("rebases even when OTHER tracked files are modified but unstaged (two-stage commit workflows)", () => {
    // Stage 1 of the schedules workflow pushes while stage 2's files are still unstaged in the tree.
    const other = join(root, "other2");
    git(root, "clone", remote, other);
    git(other, "config", "user.name", "other");
    git(other, "config", "user.email", "other@example.com");
    writeFileSync(join(other, "theirs.txt"), "theirs\n");
    git(other, "add", "theirs.txt");
    git(other, "commit", "-m", "theirs");
    git(other, "push", "origin", "HEAD:main");

    writeFileSync(join(work, "seed.txt"), "seed modified for stage 2\n"); // tracked, unstaged
    writeFileSync(join(work, "stage1.txt"), "stage1\n");
    git(work, "add", "stage1.txt");
    const result = run("data: stage 1");

    expect(result.status).toBe(0);
    expect(git(remote, "ls-tree", "-r", "--name-only", "main").split("\n")).toEqual(expect.arrayContaining(["theirs.txt", "stage1.txt"]));
    // Normalize CRLF: Windows core.autocrlf rewrites line endings on stash-pop; only the content matters here.
    expect(readFileSync(join(work, "seed.txt"), "utf8").replace(/\r\n/g, "\n")).toBe("seed modified for stage 2\n"); // stage 2's work survives
    expect(git(remote, "show", "main:seed.txt")).toBe("seed"); // ...and was NOT pushed by stage 1
  });

  it("does not retry a GH001 large-file rejection (fails fast with a clear diagnosis)", () => {
    const counter = join(root, "attempts.txt");
    const hook = join(remote, "hooks", "pre-receive");
    mkdirSync(join(remote, "hooks"), { recursive: true });
    writeFileSync(
      hook,
      `#!/bin/sh\necho x >> "${counter.replace(/\\/g, "/")}"\necho "remote: error: File data/big.jsonl is 101.79 MB; this exceeds GitHub's file size limit of 100.00 MB" >&2\necho "remote: error: GH001: Large files detected." >&2\nexit 1\n`,
    );
    chmodSync(hook, 0o755);

    writeFileSync(join(work, "a.json"), "{}\n");
    git(work, "add", "a.json");
    const result = run("data: rejected", { PUSH_ATTEMPTS: "5" });

    expect(result.status).toBe(1);
    expect(readFileSync(counter, "utf8").trim().split("\n")).toHaveLength(1); // exactly one attempt
    const out = `${result.stdout}${result.stderr}`;
    expect(out).toMatch(/GH001|file size limit/);
    expect(out).toMatch(/::error[ :]/);
    expect(out).toMatch(/not retry|will not retry|non-retryable/i);
  });

  it("gives up with a non-zero exit after the configured attempts on a persistent transient failure", () => {
    const counter = join(root, "attempts.txt");
    const hook = join(remote, "hooks", "pre-receive");
    mkdirSync(join(remote, "hooks"), { recursive: true });
    writeFileSync(hook, `#!/bin/sh\necho x >> "${counter.replace(/\\/g, "/")}"\necho "remote: transient failure" >&2\nexit 1\n`);
    chmodSync(hook, 0o755);

    writeFileSync(join(work, "a.json"), "{}\n");
    git(work, "add", "a.json");
    const result = run("data: flaky", { PUSH_ATTEMPTS: "3" });

    expect(result.status).toBe(1);
    expect(readFileSync(counter, "utf8").trim().split("\n")).toHaveLength(3);
    expect(`${result.stdout}${result.stderr}`).toMatch(/::error[ :]/);
  });
});
