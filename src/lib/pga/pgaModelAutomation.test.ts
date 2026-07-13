import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { checkModelSync, MAX_STATS_AGE_DAYS } from "../../../scripts/check-pga-field-sync.mjs";
import { selectLocalTarget } from "../../../scripts/lib/pga-field-selection.mjs";
import { assessPgaFreshness } from "@/lib/pga/pgaFreshness";

const ROOT = resolve(__dirname, "../../..");
const SCHEDULE = JSON.parse(readFileSync(join(ROOT, "public/data/pga/schedule.json"), "utf-8"));
const MODEL = JSON.parse(readFileSync(join(ROOT, "public/data/pga/current-tournament.json"), "utf-8"));
const STATS_META = JSON.parse(readFileSync(join(ROOT, "public/data/pga/player-stats-meta.json"), "utf-8"));
const WORKFLOW = readFileSync(join(ROOT, ".github/workflows/sync-pga-data.yml"), "utf-8");

const FIXTURE_SCHEDULE = [
  { id: "john-deere-classic-2026", name: "John Deere Classic", startDate: "2026-07-02", endDate: "2026-07-05" },
  { id: "genesis-scottish-open-2026", name: "Genesis Scottish Open", startDate: "2026-07-09", endDate: "2026-07-12" },
];
const FRESH_STATS = { syncedAt: "2026-07-07T01:00:00.000Z" };

describe("model sync guard (checkModelSync)", () => {
  it("rejects a stale sheet-style model for the wrong tournament", () => {
    const staleSheetModel = { tournamentName: "John Deere Classic", modelAvailable: true, rows: [{}] };
    expect(() => checkModelSync(FIXTURE_SCHEDULE, staleSheetModel, FRESH_STATS, "2026-07-07")).toThrow(
      /Model\/schedule mismatch/
    );
  });

  it("rejects an unavailable model (stale sheet gated by sync-pga-sheet)", () => {
    const gated = { tournamentName: "Genesis Scottish Open", modelAvailable: false, rows: [] };
    expect(() => checkModelSync(FIXTURE_SCHEDULE, gated, FRESH_STATS, "2026-07-07")).toThrow(/Model unavailable/);
  });

  it("rejects a model built from stale player stats", () => {
    const model = { tournamentName: "Genesis Scottish Open", modelAvailable: true, rows: [{}] };
    const oldStats = { syncedAt: "2026-06-01T00:00:00.000Z" };
    expect(() => checkModelSync(FIXTURE_SCHEDULE, model, oldStats, "2026-07-07")).toThrow(/stats are .* days old/);
    expect(MAX_STATS_AGE_DAYS).toBe(14);
  });

  it("accepts a fresh matching online-api model", () => {
    const model = {
      tournamentName: "Genesis Scottish Open",
      tournamentId: "genesis-scottish-open-2026",
      modelAvailable: true,
      modelSource: "online-api",
      rows: [{}],
    };
    const result = checkModelSync(FIXTURE_SCHEDULE, model, FRESH_STATS, "2026-07-07");
    expect(result.modelSource).toBe("online-api");
    expect(result.statsAgeDays).toBeLessThan(MAX_STATS_AGE_DAYS);
  });

  it("the committed model passes the guard against the real schedule today", () => {
    const asOf = new Date().toISOString().slice(0, 10);
    const result = checkModelSync(SCHEDULE, MODEL, STATS_META, asOf);
    expect(result.target.id).toBe(MODEL.tournamentId);
  });
});

describe("generated model metadata (data-source transparency)", () => {
  it("the committed current model is online-api sourced, not sheet-driven", () => {
    expect(MODEL.modelSource).toBe("online-api");
    expect(MODEL.modelAvailable).toBe(true);
    expect(MODEL.rows.length).toBeGreaterThan(100);
    expect(MODEL.statsSource).toBeTruthy();
    expect(Number.isNaN(Date.parse(MODEL.statsSyncedAt))).toBe(false);
    expect(Number.isNaN(Date.parse(MODEL.generatedAt))).toBe(false);
  });

  it("the model tournament equals the schedule-selected current tournament", () => {
    const target = selectLocalTarget(SCHEDULE, new Date().toISOString().slice(0, 10));
    expect(MODEL.tournamentId).toBe(target.id);
    expect(MODEL.tournamentName).toBe(target.name);
  });

  it("pgaFreshness accepts the committed model for the current event and surfaces the source", () => {
    const target = selectLocalTarget(SCHEDULE, new Date().toISOString().slice(0, 10));
    const result = assessPgaFreshness(MODEL, {
      payloadType: "current-tournament",
      expectedEvent: { name: target.name, startDate: target.startDate, endDate: target.endDate },
    });
    expect(["current", "upcoming"]).toContain(result.status);
    expect(result.source).toBe("online-api");
  });

  it("pgaFreshness still rejects a stale sheet payload posing as the current event", () => {
    const target = selectLocalTarget(SCHEDULE, new Date().toISOString().slice(0, 10));
    const staleSheet = {
      section: "current-tournament",
      tournamentName: "John Deere Classic",
      generatedAt: "2026-06-30T20:21:59.442Z",
      modelSource: "google-sheet",
      rows: [{ rank: 1, player: "Someone" }],
    };
    const result = assessPgaFreshness(staleSheet, {
      payloadType: "current-tournament",
      expectedEvent: { name: target.name, startDate: target.startDate, endDate: target.endDate },
    });
    expect(result.status).toBe("mismatched");
  });
});

describe("Monday workflow guarantees", () => {
  it("runs field sync, stats refresh, JKB Trend, model generation, and the sync guard in order", () => {
    const jobsSection = WORKFLOW.slice(WORKFLOW.indexOf("jobs:"));
    const order = [
      "npm run pga:trend -- --validate-input-only",
      "fetch-pga-current-field.mjs",
      "check-pga-stats-freshness.mjs",
      "fetch-pga-player-stats.mjs",
      'npm run pga:trend -- --output-dir "${RUNNER_TEMP}/jkb-trend"',
      "Publish validated JKB Trend artifacts",
      "generate-pga-tournament-rankings.mjs",
      "check-pga-field-sync.mjs",
    ].map((step) => jobsSection.indexOf(step));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("dependency-triggers Monday only after history succeeds and keeps Tue/Wed fallbacks", () => {
    const cron = WORKFLOW.match(/cron:\s*"([^"]+)"/)?.[1] ?? "";
    expect(cron.split(" ")[4]).toBe("2,3");
    expect(WORKFLOW).toContain("workflow_run:");
    expect(WORKFLOW).toContain("Refresh PGA Player History");
    expect(WORKFLOW).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(WORKFLOW).toContain("workflow_dispatch");
    expect(WORKFLOW).not.toContain("should_run");
  });

  it("the Google Sheet step is optional enrichment and cannot block the refresh", () => {
    const sheetStep = WORKFLOW.slice(WORKFLOW.indexOf("Sync PGA JSON from Google Sheet"));
    const stepBlock = sheetStep.slice(0, sheetStep.indexOf("run:"));
    expect(stepBlock).toContain("continue-on-error: true");
  });
});
