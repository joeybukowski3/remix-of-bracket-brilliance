import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  gateRequest,
  runRefreshBackup,
  type BackupConfig,
  type BackupDeps,
  type SlateAnswer,
} from "./mlb-refresh-backup";

const CONFIG: BackupConfig = { mlbDataWorkflow: "mlb.yml", powerRankingsWorkflow: "power.yml" };
// 2026-09-23 10:17 ET (EDT = UTC-4)
const NOW = new Date("2026-09-23T14:17:00Z");
const TODAY = "2026-09-23";
const YESTERDAY = "2026-09-22";

const datedFile = (date: string) => JSON.stringify({ date });
const powerFile = (generatedAt: string) => JSON.stringify({ generatedAt });

interface World {
  hasGames?: SlateAnswer;
  now?: Date;
  files?: Record<string, string | null>;
  activeRuns?: Record<string, number>;
  successfulRunTimes?: Record<string, string[]>;
}

/** In-memory GitHub: dispatching a workflow makes it appear active, like the real queue. */
function makeDeps(world: World) {
  const dispatched: string[] = [];
  const active = { ...world.activeRuns };
  const files: Record<string, string | null> = {
    "public/data/mlb/hr-props-raw.json": datedFile(TODAY),
    "public/data/mlb/strikeout-prop-details.json": datedFile(TODAY),
    "public/data/mlb/power-rankings.json": powerFile("2026-09-23T13:37:57Z"),
    ...world.files,
  };
  const deps: BackupDeps = {
    now: world.now ?? NOW,
    fetchSlate: async () => ({ hasGames: world.hasGames ?? "true", slateDate: TODAY }),
    readArtifact: async (path) => files[path] ?? null,
    countActiveRuns: async (wf) => active[wf] ?? 0,
    recentSuccessfulRunTimes: async (wf) => world.successfulRunTimes?.[wf] ?? [],
    dispatch: async (wf) => {
      dispatched.push(wf);
      active[wf] = (active[wf] ?? 0) + 1;
    },
  };
  return { deps, dispatched };
}

const STALE_HR = {
  "public/data/mlb/hr-props-raw.json": datedFile(YESTERDAY),
  "public/data/mlb/strikeout-prop-details.json": datedFile(YESTERDAY),
};

describe("runRefreshBackup - MLB data target", () => {
  it("does not dispatch when there are no games today", async () => {
    const { deps, dispatched } = makeDeps({ hasGames: "false", files: STALE_HR });
    const report = await runRefreshBackup(deps, CONFIG);
    expect(report.targets.mlbData.action).toBe("noop-no-games");
    expect(dispatched).not.toContain("mlb.yml");
  });

  it("does not dispatch when today's artifacts are already current", async () => {
    const { deps, dispatched } = makeDeps({});
    const report = await runRefreshBackup(deps, CONFIG);
    expect(report.targets.mlbData).toMatchObject({ action: "noop-current", freshness: "current", artifactDate: TODAY });
    expect(dispatched).not.toContain("mlb.yml");
  });

  it("does not dispatch when stale but a generator is already queued or in progress", async () => {
    const { deps, dispatched } = makeDeps({ files: STALE_HR, activeRuns: { "mlb.yml": 1 } });
    const report = await runRefreshBackup(deps, CONFIG);
    expect(report.targets.mlbData).toMatchObject({
      action: "noop-generator-active",
      generatorActive: true,
      generatorDispatched: false,
    });
    expect(dispatched).not.toContain("mlb.yml");
  });

  it("dispatches exactly once when stale and no generator is active", async () => {
    const { deps, dispatched } = makeDeps({ files: STALE_HR });
    const report = await runRefreshBackup(deps, CONFIG);
    expect(report.targets.mlbData).toMatchObject({
      action: "dispatched",
      freshness: "stale",
      artifactDate: YESTERDAY,
      generatorDispatched: true,
    });
    expect(dispatched.filter((wf) => wf === "mlb.yml")).toEqual(["mlb.yml"]);
  });

  it("treats missing artifacts as stale and dispatches", async () => {
    const { deps, dispatched } = makeDeps({
      files: { "public/data/mlb/hr-props-raw.json": null, "public/data/mlb/strikeout-prop-details.json": null },
    });
    const report = await runRefreshBackup(deps, CONFIG);
    expect(report.targets.mlbData.freshness).toBe("missing");
    expect(dispatched).toContain("mlb.yml");
  });

  it("still dispatches when the slate lookup is unknown (the generator re-gates)", async () => {
    const { deps, dispatched } = makeDeps({ hasGames: "unknown", files: STALE_HR });
    const report = await runRefreshBackup(deps, CONFIG);
    expect(report.hasGames).toBe("unknown");
    expect(dispatched).toContain("mlb.yml");
  });

  it("does not duplicate-dispatch on repeated calls", async () => {
    const { deps, dispatched } = makeDeps({ files: STALE_HR });
    await runRefreshBackup(deps, CONFIG);
    const second = await runRefreshBackup(deps, CONFIG);
    await runRefreshBackup(deps, CONFIG);
    expect(second.targets.mlbData.action).toBe("noop-generator-active");
    expect(dispatched.filter((wf) => wf === "mlb.yml")).toHaveLength(1);
  });

  it("reports the Eastern slate date it was given and reads freshness against it", async () => {
    const lateEvening = new Date("2026-09-24T00:30:00Z"); // still Sep 23 in ET
    const { deps } = makeDeps({ now: lateEvening });
    const report = await runRefreshBackup(deps, CONFIG);
    expect(report.slateDate).toBe(TODAY);
    expect(report.targets.mlbData.action).toBe("noop-current");
  });
});

describe("runRefreshBackup - power rankings target", () => {
  const YESTERDAY_POWER = { "public/data/mlb/power-rankings.json": powerFile("2026-09-22T13:00:00Z") };

  it("no-ops when generatedAt falls on today's ET date", async () => {
    const { deps, dispatched } = makeDeps({});
    const report = await runRefreshBackup(deps, CONFIG);
    expect(report.targets.powerRankings).toMatchObject({ action: "noop-current", artifactDate: TODAY });
    expect(dispatched).not.toContain("power.yml");
  });

  it("uses the ET date of generatedAt (00:30 UTC belongs to the previous ET day)", async () => {
    const { deps, dispatched } = makeDeps({
      files: { "public/data/mlb/power-rankings.json": powerFile("2026-09-23T02:30:00Z") },
    });
    const report = await runRefreshBackup(deps, CONFIG);
    expect(report.targets.powerRankings.artifactDate).toBe(YESTERDAY);
    expect(dispatched).toContain("power.yml");
  });

  it("dispatches once when stale, no run today, and none active", async () => {
    const { deps, dispatched } = makeDeps({ files: YESTERDAY_POWER });
    const report = await runRefreshBackup(deps, CONFIG);
    expect(report.targets.powerRankings.action).toBe("dispatched");
    await runRefreshBackup(deps, CONFIG);
    expect(dispatched.filter((wf) => wf === "power.yml")).toHaveLength(1);
  });

  it("no-ops when a generator is already active", async () => {
    const { deps, dispatched } = makeDeps({ files: YESTERDAY_POWER, activeRuns: { "power.yml": 1 } });
    const report = await runRefreshBackup(deps, CONFIG);
    expect(report.targets.powerRankings.action).toBe("noop-generator-active");
    expect(dispatched).not.toContain("power.yml");
  });

  it("counts a successful run today as current when the generator found no changes", async () => {
    const { deps, dispatched } = makeDeps({
      files: YESTERDAY_POWER,
      successfulRunTimes: { "power.yml": ["2026-09-23T13:00:00Z"] },
    });
    const report = await runRefreshBackup(deps, CONFIG);
    expect(report.targets.powerRankings).toMatchObject({ action: "noop-current", freshness: "current-no-change" });
    expect(dispatched).not.toContain("power.yml");
  });

  it("ignores yesterday's successful run", async () => {
    const { deps, dispatched } = makeDeps({
      files: YESTERDAY_POWER,
      successfulRunTimes: { "power.yml": ["2026-09-22T13:00:00Z"] },
    });
    await runRefreshBackup(deps, CONFIG);
    expect(dispatched).toContain("power.yml");
  });

  it("waits until 4 AM ET before dispatching", async () => {
    const earlyMorning = new Date("2026-09-23T06:17:00Z"); // 2:17 AM ET
    const { deps, dispatched } = makeDeps({ now: earlyMorning, files: YESTERDAY_POWER });
    const report = await runRefreshBackup(deps, CONFIG);
    expect(report.targets.powerRankings.action).toBe("noop-too-early");
    expect(dispatched).not.toContain("power.yml");
  });

  it("still dispatches on a no-games day (rankings are not slate-gated)", async () => {
    const { deps, dispatched } = makeDeps({ hasGames: "false", files: YESTERDAY_POWER });
    await runRefreshBackup(deps, CONFIG);
    expect(dispatched).toContain("power.yml");
  });
});

describe("gateRequest", () => {
  const env = { CRON_SECRET: "s3cret", GH_DISPATCH_TOKEN: "ghp_token" };

  it("fails closed with 500 when CRON_SECRET is missing", () => {
    expect(gateRequest({ GH_DISPATCH_TOKEN: "t" }, null)).toEqual({
      ok: false,
      status: 500,
      error: "CRON_SECRET not configured",
    });
    expect(gateRequest({ GH_DISPATCH_TOKEN: "t" }, "Bearer ")).toMatchObject({ ok: false, status: 500 });
  });

  it("rejects missing or wrong bearer tokens with 401", () => {
    expect(gateRequest(env, null)).toMatchObject({ ok: false, status: 401 });
    expect(gateRequest(env, "Bearer nope")).toMatchObject({ ok: false, status: 401 });
    expect(gateRequest(env, "s3cret")).toMatchObject({ ok: false, status: 401 });
  });

  it("fails closed with 500 when the GitHub token is missing", () => {
    expect(gateRequest({ CRON_SECRET: "s3cret" }, "Bearer s3cret")).toEqual({
      ok: false,
      status: 500,
      error: "GH_DISPATCH_TOKEN not configured",
    });
  });

  it("accepts the Vercel bearer header and applies defaults", () => {
    expect(gateRequest(env, "Bearer s3cret")).toMatchObject({
      ok: true,
      owner: "joeybukowski3",
      config: { mlbDataWorkflow: "generate-mlb-hr-props.yml", powerRankingsWorkflow: "generate-mlb-power-rankings.yml" },
    });
  });

  it("rejects unsafe repo or workflow identifiers from env", () => {
    expect(gateRequest({ ...env, GH_WORKFLOW_ID: "../../x" }, "Bearer s3cret")).toMatchObject({ ok: false, status: 500 });
  });

  it("never echoes secrets in error responses", () => {
    const errors = [gateRequest(env, "Bearer nope"), gateRequest({ CRON_SECRET: "s3cret" }, "Bearer s3cret")];
    for (const result of errors) expect(JSON.stringify(result)).not.toMatch(/s3cret|ghp_token/);
  });
});

describe("vercel.json cron registration", () => {
  const config = JSON.parse(readFileSync("vercel.json", "utf8")) as {
    crons?: Array<{ path: string; schedule: string }>;
  };

  it("registers exactly one daily Hobby-compatible cron at 08:17 UTC (4:17 AM EDT)", () => {
    const matches = (config.crons ?? []).filter(
      (entry) => entry.path === "/api/cron/generate-mlb-data",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].schedule).toBe("17 8 * * *");
  });
});
