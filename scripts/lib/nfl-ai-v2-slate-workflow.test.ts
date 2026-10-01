/**
 * AI Picks v2 automation -- the GitHub Actions workflow: it parses, chains on the
 * market refresh, is gated, invokes the right command, and stages ONLY the
 * whitelisted generated files. The staging test runs the workflow's real git
 * pathspecs against a scratch repository, so it proves what would be committed
 * rather than what the YAML happens to say.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import yaml from "js-yaml";
import { V2_COMMIT_PATHSPECS } from "./nfl-ai-v2-persisted-state";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..");
const workflowText = readFileSync(join(REPO_ROOT, ".github", "workflows", "nfl-ai-handicap-v2.yml"), "utf8");
const workflow = yaml.load(workflowText) as Record<string, any>;
const steps: Array<Record<string, any>> = workflow.jobs["run-slate"].steps;
const step = (name: string) => steps.find((s) => s.name === name)!;
const packageScripts = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")).scripts as Record<string, string>;

/** The pathspecs the workflow may ever commit -- the single env var both the detect and stage steps read. */
const specs = String(workflow.jobs["run-slate"].env.GENERATED_PATHSPECS)
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

/** Each of these spawns git/bash several times, which is slow on Windows and under a parallel suite. */
const SPAWN_TIMEOUT_MS = 60_000;
const hasBash = spawnSync("bash", ["--version"]).status === 0;

/** Runs the workflow's real "Stage generated artifacts" script in `cwd`. */
function runStageStep(cwd: string): void {
  const result = spawnSync("bash", ["-c", step("Stage generated artifacts").run], { cwd, encoding: "utf8", env: { ...process.env, GENERATED_PATHSPECS: workflow.jobs["run-slate"].env.GENERATED_PATHSPECS } });
  if (result.status !== 0) throw new Error(`stage step failed: ${result.stderr}`);
}

function git(cwd: string, ...args: string[]) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout;
}

function scratchRepo(files: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "nfl-ai-v2-wf-"));
  git(dir, "init", "--quiet");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "tester");
  writeFileSync(join(dir, "README"), "x");
  git(dir, "add", "README");
  git(dir, "commit", "--quiet", "--message", "init");
  for (const file of files) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), "{}\n");
  }
  return dir;
}

const A = "data/nfl/analysis/2026/3/2026_03_LAC_BUF/grok";
const WANTED = [
  "public/data/nfl/2026/ai-handicaps/2026_03_LAC_BUF.json",
  `${A}/evidence.live-test.json`,
  `${A}/handicap-v2/20260925T210502709Z-2d7fac3cb47c.json`,
  `${A}/v2-attempts.json`,
];
const NEVER = [
  `${A}/research/initial-2026-09-25T21-02-23-450Z/provider-response.raw.json`,
  `${A}/research/initial-2026-09-25T21-02-23-450Z/research-run.json`,
  `${A}/research/initial-2026-09-25T21-02-23-450Z/rejected-findings.json`,
  "data/nfl/game-context/2026/3/2026_03_LAC_BUF.json",
  "src/lib/anything.ts",
  // v1 snapshot lineage: rebuilt for free by the bootstrap, so never committed
  `${A}/latest.json`,
  `${A}/history.json`,
  `${A}/snapshots/snap-1.json`,
  // raw / temporary / unrelated analysis material that must never be staged by accident
  `${A}/prompt-dump.txt`,
  `${A}/stage-b-raw-output.json`,
  `${A}/handicap-v2/raw-failed-output.txt`,
  `${A}/handicap-v2/tmp/scratch.json`,
  `${A}/evidence.json`,
  `${A}/evidence.raw.json`,
  "data/nfl/analysis/2026/3/2026_03_LAC_BUF/notes.json",
  "data/nfl/analysis/2026/3/summary.json",
  "public/data/nfl/2026/ai-handicaps/README.md",
  "public/data/nfl/2026/ai-handicaps/nested/2026_03_LAC_BUF.json",
];

describe("workflow definition", () => {
  it("parses and defines the run-slate job with a deploy job", () => {
    expect(Object.keys(workflow.jobs)).toEqual(["run-slate", "deploy-pages"]);
  });

  it("runs after the market refresh, with a gameday backstop schedule, and manual dispatch defaulting to dry run", () => {
    expect(workflow.on.workflow_run).toEqual({ workflows: ["NFL Betting Lines Daily"], types: ["completed"] });
    expect(workflow.on.schedule).toEqual([{ cron: "17 13 * 1,2,9,10,11,12 0,1,4,6", timezone: "America/New_York" }]);
    expect(workflow.on.workflow_dispatch.inputs.dry_run.default).toBe(true);
  });

  it("only chains on a SUCCESSFUL market refresh and stays off until explicitly enabled", () => {
    const condition: string = workflow.jobs["run-slate"].if;
    expect(condition).toMatch(/vars\.NFL_AI_V2_AUTOMATION_ENABLED == 'true'/);
    expect(condition).toMatch(/workflow_run\.conclusion == 'success'/);
    expect(condition).toMatch(/github\.event_name == 'workflow_dispatch'/);
  });

  it("invokes the v2 slate command, live only when not a dry run, and that command maps to the script", () => {
    const run: string = step("Plan and run the v2 slate").run;
    expect(run).toMatch(/npm run nfl:ai-v2-slate -- .*--dry-run/);
    expect(run).toMatch(/npm run nfl:ai-v2-slate -- .*--live/);
    expect(run).toMatch(/\$EVENT_NAME" = "workflow_dispatch" \] && \[ "\$DRY_RUN" != "false"/);
    expect(packageScripts["nfl:ai-v2-slate"]).toBe("tsx scripts/run-nfl-ai-handicap-v2-slate.ts");
  });

  it("uses the provider secrets by name, never inline", () => {
    const env = step("Plan and run the v2 slate").env;
    expect(env).toMatchObject({ OPENAI_API_KEY: "${{ secrets.OPENAI_API_KEY }}", GROK_API_KEY: "${{ secrets.GROK_API_KEY }}" });
    expect(workflowText).not.toMatch(/THE_ODDS_API_KEY/);
    expect(workflowText).not.toMatch(/sk-[A-Za-z0-9]{10,}/);
  });

  it("shares the main data-writer lock, and a failed slate still commits what succeeded before failing the run", () => {
    expect(workflow.concurrency).toEqual({ group: "main-data-writers-${{ github.repository }}", "cancel-in-progress": false });
    expect(step("Plan and run the v2 slate")["continue-on-error"]).toBe(true);
    expect(steps.indexOf(step("Fail the run if the slate reported failures"))).toBeGreaterThan(steps.indexOf(step("Commit and push generated AI handicap v2 artifacts")));
  });
});

describe("rollout controls and gating", () => {
  /** Evaluates the job-level `if` for a given trigger, with the repo variable set or not. */
  function jobRuns(event: string, opts: { enabled?: boolean; conclusion?: string } = {}): boolean {
    const expr: string = workflow.jobs["run-slate"].if;
    const js = expr.replace(/\s+/g, " ").replace(/==/g, "===").replace(/!=/g, "!==").replace(/github\.event\.workflow_run\.conclusion/g, "conclusion").replace(/github\.event_name/g, "eventName").replace(/vars\.NFL_AI_V2_AUTOMATION_ENABLED/g, "enabled");
    return new Function("eventName", "enabled", "conclusion", `return ${js};`)(event, opts.enabled ? "true" : "", opts.conclusion ?? "") as boolean;
  }

  it("keeps scheduled and chained runs disabled unless NFL_AI_V2_AUTOMATION_ENABLED is true", () => {
    expect(jobRuns("schedule")).toBe(false);
    expect(jobRuns("workflow_run", { conclusion: "success" })).toBe(false);
    expect(jobRuns("schedule", { enabled: true })).toBe(true);
    expect(jobRuns("workflow_run", { enabled: true, conclusion: "success" })).toBe(true);
    expect(jobRuns("workflow_run", { enabled: true, conclusion: "failure" })).toBe(false);
  });

  it("still allows a manual dispatch (dry run by default) while automation is disabled", () => {
    expect(jobRuns("workflow_dispatch")).toBe(true);
    expect(workflow.on.workflow_dispatch.inputs.dry_run.default).toBe(true);
  });

  it("exposes game, provider and max_jobs inputs and passes them to the command, with a repo variable cap for scheduled runs", () => {
    const inputs = workflow.on.workflow_dispatch.inputs;
    expect(inputs.game.type).toBe("string");
    expect(inputs.provider.options).toEqual(["both", "grok", "chatgpt"]);
    expect(inputs.max_jobs.type).toBe("string");
    const s = step("Plan and run the v2 slate");
    expect(s.env.VAR_MAX_JOBS).toBe("${{ vars.NFL_AI_V2_MAX_JOBS }}");
    expect(s.run).toMatch(/--provider=\$\{INPUT_PROVIDER\}/);
    expect(s.run).toMatch(/--max-jobs=\$\{max_jobs\}/);
    expect(s.run).toMatch(/--game=\$\{INPUT_GAME\}/);
  });
});

describe("what the workflow commits", () => {
  it("lists exactly the persisted-state manifest, so the two cannot drift apart", () => {
    expect(specs).toEqual([...V2_COMMIT_PATHSPECS]);
  });

  it("names exact pathspecs, never a blanket add, and no research diagnostics", () => {
    expect(specs).toHaveLength(4);
    for (const name of ["Stage generated artifacts", "Commit and push generated AI handicap v2 artifacts"]) expect(step(name).run).not.toMatch(/git add\s+(?:\.|-A|--all)\b/);
    expect(specs.join("\n")).not.toMatch(/research/);
  });

  it.skipIf(!hasBash)("stages the public artifact and the planner state, and nothing else", () => {
    const repo = scratchRepo([...WANTED, ...NEVER]);
    try {
      runStageStep(repo);
      expect(git(repo, "diff", "--cached", "--name-only").trim().split("\n").sort()).toEqual([...WANTED].sort());
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, SPAWN_TIMEOUT_MS);

  it.skipIf(!hasBash)("still stages what exists when other pathspecs match nothing (a game with no record yet)", () => {
    const repo = scratchRepo(["public/data/nfl/2026/ai-handicaps/2026_03_LAC_BUF.json", `${A}/handicap-v2/r.json`]);
    try {
      runStageStep(repo);
      expect(git(repo, "diff", "--cached", "--name-only").trim().split("\n").sort()).toEqual([`${A}/handicap-v2/r.json`, "public/data/nfl/2026/ai-handicaps/2026_03_LAC_BUF.json"]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, SPAWN_TIMEOUT_MS);

  it.skipIf(!hasBash)("stages nothing when only raw research diagnostics changed, so no empty commit is created", () => {
    const repo = scratchRepo(NEVER);
    try {
      runStageStep(repo);
      expect(spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: repo }).status).toBe(0);
      // ...and the commit step's own guard then exits before the commit itself.
      expect(step("Commit and push generated AI handicap v2 artifacts").run).toMatch(/if git diff --cached --quiet; then[\s\S]*not creating an empty commit[\s\S]*exit 0[\s\S]*git commit/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, SPAWN_TIMEOUT_MS);

  it("has a deterministic commit message and cannot retrigger itself", () => {
    expect(step("Commit and push generated AI handicap v2 artifacts").run).toMatch(/git commit -m "data\(nfl\): update AI handicap v2 analysis"/);
    // GITHUB_TOKEN pushes never start workflows, and this workflow only chains on the betting-lines workflow.
    expect(workflow.on.workflow_run.workflows).not.toContain("NFL AI Handicap v2 Slate");
  });

  it("only runs the change detection step for real (non-dry) runs", () => {
    expect(step("Detect generated artifact changes").if).toMatch(/github\.event_name != 'workflow_dispatch' \|\| inputs\.dry_run == false/);
  });
});

/* -------------------------------------------------------------------------- */
/* Partial state persists; the run still fails                                */
/* -------------------------------------------------------------------------- */

/** Parses the GITHUB_OUTPUT file a step wrote. */
function readOutputs(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0) out[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return out;
}

/** A working clone with a bare `origin` on `main`, so the real commit step's fetch / rebase / push runs unmodified. */
function scratchRepoWithOrigin(files: Record<string, string>): { repo: string; origin: string; outputFile: string; cleanup: () => void } {
  const origin = mkdtempSync(join(tmpdir(), "nfl-ai-v2-origin-"));
  git(origin, "init", "--quiet", "--bare", "--initial-branch=main");
  const repo = mkdtempSync(join(tmpdir(), "nfl-ai-v2-wf-"));
  git(repo, "init", "--quiet", "--initial-branch=main");
  git(repo, "config", "user.email", "t@example.com");
  git(repo, "config", "user.name", "tester");
  git(repo, "config", "commit.gpgsign", "false");
  writeFileSync(join(repo, "README"), "x");
  git(repo, "add", "README");
  git(repo, "commit", "--quiet", "--message", "init");
  git(repo, "remote", "add", "origin", origin);
  git(repo, "push", "--quiet", "origin", "main");
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), content);
  }
  const outputFile = `${repo}-github-output`;
  writeFileSync(outputFile, "");
  return { repo, origin, outputFile, cleanup: () => [repo, origin, outputFile].forEach((p) => rmSync(p, { recursive: true, force: true })) };
}

/** Runs a workflow step's `run` script the way Actions does for `shell: bash` (bash -eo pipefail). */
function runWorkflowStep(name: string, cwd: string, outputFile: string, extraEnv: Record<string, string> = {}) {
  return spawnSync("bash", ["-eo", "pipefail", "-c", step(name).run], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GENERATED_PATHSPECS: workflow.jobs["run-slate"].env.GENERATED_PATHSPECS, GITHUB_OUTPUT: outputFile, ...extraEnv },
  });
}

/** The workflow's persistence tail, in order: detect -> stage -> commit/push -> fail-if-slate-failed. Stage/commit run only when detect says so, as their `if` does. */
function runPersistenceSteps(repo: string, outputFile: string) {
  const detect = runWorkflowStep("Detect generated artifact changes", repo, outputFile);
  const changed = readOutputs(outputFile).changed === "true";
  const stage = changed ? runWorkflowStep("Stage generated artifacts", repo, outputFile) : null;
  const commit = changed ? runWorkflowStep("Commit and push generated AI handicap v2 artifacts", repo, outputFile) : null;
  const fail = runWorkflowStep("Fail the run if the slate reported failures", repo, outputFile);
  return { detect, changed, stage, commit, fail, outputs: readOutputs(outputFile) };
}

const PIT = "data/nfl/analysis/2026/4/2026_04_PIT_CLE";
const committedFiles = (origin: string): string[] =>
  git(origin, "ls-tree", "-r", "--name-only", "main")
    .trim()
    .split("\n")
    .filter((f) => f !== "README")
    .sort();

describe.skipIf(!hasBash)("partial state persists while the run still fails", () => {
  it("detects changes (regression: a trailing blank pathspec made git fatal, so every run read as 'nothing changed')", () => {
    const { repo, outputFile, cleanup } = scratchRepoWithOrigin({ [`${PIT}/grok/evidence.live-test.json`]: "{}\n" });
    try {
      const detect = runWorkflowStep("Detect generated artifact changes", repo, outputFile);
      expect(detect.status, detect.stderr).toBe(0);
      expect(detect.stderr).not.toMatch(/empty string is not a valid pathspec/);
      expect(readOutputs(outputFile).changed).toBe("true");
    } finally {
      cleanup();
    }
  }, SPAWN_TIMEOUT_MS);

  it("reports no change (and exits 0) when nothing in the whitelist changed", () => {
    const { repo, outputFile, cleanup } = scratchRepoWithOrigin({ [`${PIT}/grok/research/initial-x/provider-response.raw.json`]: "{}\n" });
    try {
      const detect = runWorkflowStep("Detect generated artifact changes", repo, outputFile);
      expect(detect.status).toBe(0);
      expect(readOutputs(outputFile).changed).toBe("false");
    } finally {
      cleanup();
    }
  }, SPAWN_TIMEOUT_MS);

  it("research ok -> handicaps failed: commits the evidence and attempt ledger, publishes nothing, and the run exits nonzero", () => {
    const { repo, origin, outputFile, cleanup } = scratchRepoWithOrigin({
      // paid research that succeeded
      [`${PIT}/grok/evidence.live-test.json`]: '{"evidence":[]}\n',
      [`${PIT}/chatgpt/evidence.live-test.json`]: '{"evidence":[]}\n',
      // the failure ledger written by the executor
      [`${PIT}/grok/v2-attempts.json`]: '{"handicap":{"kind":"transport_timeout"}}\n',
      [`${PIT}/chatgpt/v2-attempts.json`]: '{"handicap":{"kind":"validation"}}\n',
      // things that must never be committed: raw diagnostics and failed raw model output
      [`${PIT}/grok/research/initial-x/provider-response.raw.json`]: "{}\n",
      [`${PIT}/chatgpt/research/initial-x/research-run.json`]: "{}\n",
      [`${PIT}/chatgpt/handicap-v2/failed-stage-a-raw-output.txt`]: "raw",
      [`${PIT}/chatgpt/stage-a-raw-output.json`]: "{}\n",
      "slate-report.txt": "report",
    });
    try {
      const run = runPersistenceSteps(repo, outputFile);
      expect(run.detect.status, run.detect.stderr).toBe(0);
      expect(run.stage?.status, run.stage?.stderr).toBe(0);
      expect(run.commit?.status, run.commit?.stderr).toBe(0);
      expect(committedFiles(origin)).toEqual([`${PIT}/chatgpt/evidence.live-test.json`, `${PIT}/chatgpt/v2-attempts.json`, `${PIT}/grok/evidence.live-test.json`, `${PIT}/grok/v2-attempts.json`].sort());
      // no handicap record and no public artifact exist, so none can have been published
      expect(committedFiles(origin).filter((f) => f.startsWith("public/") || f.includes("/handicap-v2/"))).toEqual([]);
      // a state-only commit changes nothing on the site, so Pages is not redeployed for it
      expect(run.outputs.public_changed).toBe("false");
      expect(run.outputs.pushed_commit).toMatch(/^[0-9a-f]{40}$/);
      // ...and the workflow run itself is still failed
      expect(run.fail.status).not.toBe(0);
      expect(run.fail.stdout + run.fail.stderr).toMatch(/slate reported failures/);
    } finally {
      cleanup();
    }
  }, SPAWN_TIMEOUT_MS);

  it("one provider succeeds, one fails: the record, the mixed-state public artifact and the other's ledger persist, and the run still fails", () => {
    const { repo, origin, outputFile, cleanup } = scratchRepoWithOrigin({
      [`${PIT}/grok/evidence.live-test.json`]: "{}\n",
      [`${PIT}/grok/handicap-v2/20261001T150000000Z-abc123def456.json`]: "{}\n",
      "public/data/nfl/2026/ai-handicaps/2026_04_PIT_CLE.json": '{"providers":{"grok":"ok","chatgpt":"unavailable"}}\n',
      [`${PIT}/chatgpt/evidence.live-test.json`]: "{}\n",
      [`${PIT}/chatgpt/v2-attempts.json`]: '{"handicap":{"kind":"validation"}}\n',
      [`${PIT}/chatgpt/research/initial-x/provider-response.raw.json`]: "{}\n",
    });
    try {
      const run = runPersistenceSteps(repo, outputFile);
      expect(run.commit?.status, run.commit?.stderr).toBe(0);
      expect(committedFiles(origin)).toEqual(
        [
          "public/data/nfl/2026/ai-handicaps/2026_04_PIT_CLE.json",
          `${PIT}/chatgpt/evidence.live-test.json`,
          `${PIT}/chatgpt/v2-attempts.json`,
          `${PIT}/grok/evidence.live-test.json`,
          `${PIT}/grok/handicap-v2/20261001T150000000Z-abc123def456.json`,
        ].sort()
      );
      expect(run.outputs.public_changed).toBe("true");
      expect(run.fail.status).not.toBe(0);
    } finally {
      cleanup();
    }
  }, SPAWN_TIMEOUT_MS);

  it("refuses (and unstages) if a raw/diagnostic path somehow reaches the index", () => {
    const { repo, outputFile, cleanup } = scratchRepoWithOrigin({
      [`${PIT}/grok/evidence.live-test.json`]: "{}\n",
      [`${PIT}/grok/research/initial-x/provider-response.raw.json`]: "{}\n",
    });
    try {
      git(repo, "add", "-f", "--", `${PIT}/grok/research/initial-x/provider-response.raw.json`);
      const stage = runWorkflowStep("Stage generated artifacts", repo, outputFile);
      expect(stage.status).not.toBe(0);
      expect(stage.stderr).toMatch(/raw\/diagnostic path was staged/);
      expect(git(repo, "diff", "--cached", "--name-only").trim()).toBe("");
    } finally {
      cleanup();
    }
  }, SPAWN_TIMEOUT_MS);

  it("deploys Pages only when the pushed commit changed public/, never for a state-only commit", () => {
    const expr: string = workflow.jobs["deploy-pages"].if;
    expect(expr).toMatch(/needs\.run-slate\.outputs\.public_changed == 'true'/);
    expect(expr).toMatch(/needs\.run-slate\.outputs\.deploy_ref != ''/);
    expect(workflow.jobs["run-slate"].outputs.public_changed).toBe("${{ steps.commit.outputs.public_changed }}");
  });

  it("commits whatever succeeded even when the slate failed: persistence is not gated on the slate's outcome", () => {
    for (const name of ["Detect generated artifact changes", "Stage generated artifacts", "Commit and push generated AI handicap v2 artifacts"]) {
      expect(String(step(name).if ?? "")).not.toMatch(/steps\.slate\.outcome/);
    }
    expect(step("Fail the run if the slate reported failures").if).toBe("steps.slate.outcome == 'failure'");
  });
});

describe.skipIf(!hasBash)("the slate step reports a failed run instead of losing the report", () => {
  /** Runs the real slate step script with a stand-in `npm` that prints a report and exits with `exitCode`. */
  function runSlateStep(exitCode: number): { status: number | null; summary: string; report: string } {
    const dir = mkdtempSync(join(tmpdir(), "nfl-ai-v2-slate-step-"));
    try {
      const bin = join(dir, "bin");
      mkdirSync(bin);
      writeFileSync(join(bin, "npm"), `#!/usr/bin/env bash\necho "=== V2 SLATE LIVE SUMMARY ==="\necho "Failures (1):"\nexit ${exitCode}\n`, { mode: 0o755 });
      const summaryFile = join(dir, "summary.md");
      writeFileSync(summaryFile, "");
      const result = spawnSync("bash", ["-eo", "pipefail", "-c", step("Plan and run the v2 slate").run], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, PATH: `${bin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`, EVENT_NAME: "schedule", DRY_RUN: "", INPUT_WEEK: "", INPUT_GAME: "", INPUT_PROVIDER: "", INPUT_MAX_JOBS: "", VAR_MAX_JOBS: "", GITHUB_STEP_SUMMARY: summaryFile },
      });
      return { status: result.status, summary: readFileSync(summaryFile, "utf8"), report: readFileSync(join(dir, "slate-report.txt"), "utf8") };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("a failing slate still writes its report to the step summary, then exits nonzero", () => {
    const run = runSlateStep(1);
    expect(run.status).toBe(1);
    expect(run.summary).toContain("Failures (1):");
    expect(run.report).toContain("=== V2 SLATE LIVE SUMMARY ===");
  }, SPAWN_TIMEOUT_MS);

  it("a clean slate exits 0 and writes the same summary", () => {
    const run = runSlateStep(0);
    expect(run.status).toBe(0);
    expect(run.summary).toContain("V2 SLATE LIVE SUMMARY");
  }, SPAWN_TIMEOUT_MS);
});

/* -------------------------------------------------------------------------- */
/* retry_failed: manual-only recovery control                                 */
/* -------------------------------------------------------------------------- */

describe("retry_failed workflow input", () => {
  it("is a boolean, optional, default false, on workflow_dispatch only", () => {
    expect(workflow.on.workflow_dispatch.inputs.retry_failed).toMatchObject({ type: "boolean", required: false, default: false });
    expect(workflow.on.workflow_run).not.toHaveProperty("inputs");
    expect(workflow.on.schedule).toEqual([{ cron: "17 13 * 1,2,9,10,11,12 0,1,4,6", timezone: "America/New_York" }]);
  });

  it("is read from the dispatch input only -- no repository variable, secret or other context can switch it on", () => {
    expect(step("Plan and run the v2 slate").env.INPUT_RETRY_FAILED).toBe("${{ inputs.retry_failed }}");
    expect(workflowText).not.toMatch(/vars\.[A-Z_]*RETRY/);
    expect(step("Plan and run the v2 slate").run.match(/--retry-failed/g)).toHaveLength(1);
  });
});

describe.skipIf(!hasBash)("retry_failed reaches the slate CLI only for an explicit manual dispatch", () => {
  /** Runs the real slate step with a stand-in `npm` that records the arguments it receives, one per line. */
  function slateArgs(env: Record<string, string>): string[] {
    const dir = mkdtempSync(join(tmpdir(), "nfl-ai-v2-retry-"));
    try {
      const bin = join(dir, "bin");
      mkdirSync(bin);
      writeFileSync(join(bin, "npm"), '#!/usr/bin/env bash\nfor a in "$@"; do echo "$a"; done >> "$ARGS_FILE"\n', { mode: 0o755 });
      const argsFile = join(dir, "args.txt");
      writeFileSync(argsFile, "");
      const summaryFile = join(dir, "summary.md");
      writeFileSync(summaryFile, "");
      const result = spawnSync("bash", ["-eo", "pipefail", "-c", step("Plan and run the v2 slate").run], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, PATH: `${bin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`, ARGS_FILE: argsFile, EVENT_NAME: "schedule", DRY_RUN: "", INPUT_WEEK: "", INPUT_GAME: "2026_04_PIT_CLE", INPUT_PROVIDER: "", INPUT_MAX_JOBS: "", VAR_MAX_JOBS: "", INPUT_RETRY_FAILED: "", GITHUB_STEP_SUMMARY: summaryFile, ...env },
      });
      expect(result.status, result.stderr).toBe(0);
      return readFileSync(argsFile, "utf8").split("\n").filter(Boolean);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  const count = (args: string[]) => args.filter((a) => a === "--retry-failed").length;

  it("1. manual dispatch with retry_failed=false does not pass it (live or dry run)", () => {
    expect(count(slateArgs({ EVENT_NAME: "workflow_dispatch", DRY_RUN: "false", INPUT_RETRY_FAILED: "false" }))).toBe(0);
    expect(count(slateArgs({ EVENT_NAME: "workflow_dispatch", DRY_RUN: "true", INPUT_RETRY_FAILED: "false" }))).toBe(0);
    expect(count(slateArgs({ EVENT_NAME: "workflow_dispatch", DRY_RUN: "false", INPUT_RETRY_FAILED: "" }))).toBe(0);
  }, SPAWN_TIMEOUT_MS);

  it("2. manual dispatch with retry_failed=true passes it exactly once, alongside the other flags", () => {
    const live = slateArgs({ EVENT_NAME: "workflow_dispatch", DRY_RUN: "false", INPUT_RETRY_FAILED: "true", INPUT_MAX_JOBS: "2" });
    expect(count(live)).toBe(1);
    expect(live).toEqual(expect.arrayContaining(["--game=2026_04_PIT_CLE", "--max-jobs=2", "--live"]));
    const dry = slateArgs({ EVENT_NAME: "workflow_dispatch", DRY_RUN: "true", INPUT_RETRY_FAILED: "true" });
    expect(count(dry)).toBe(1);
    expect(dry).toContain("--dry-run");
  }, SPAWN_TIMEOUT_MS);

  it("3. a scheduled run never passes it -- even if the input variable were somehow populated", () => {
    expect(count(slateArgs({ EVENT_NAME: "schedule" }))).toBe(0);
    expect(count(slateArgs({ EVENT_NAME: "schedule", INPUT_RETRY_FAILED: "true" }))).toBe(0);
  }, SPAWN_TIMEOUT_MS);

  it("4. a workflow_run (chained) run never passes it -- even if the input variable were somehow populated", () => {
    expect(count(slateArgs({ EVENT_NAME: "workflow_run" }))).toBe(0);
    expect(count(slateArgs({ EVENT_NAME: "workflow_run", INPUT_RETRY_FAILED: "true" }))).toBe(0);
  }, SPAWN_TIMEOUT_MS);
});
