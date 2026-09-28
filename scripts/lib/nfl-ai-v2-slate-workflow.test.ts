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
