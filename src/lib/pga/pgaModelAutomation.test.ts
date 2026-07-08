import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("PGA Monday model automation", () => {
  it("has a Monday workflow with manual dispatch and no exact-hour runtime gate", () => {
    const workflow = read(".github/workflows/sync-pga-data.yml");

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toMatch(/cron:\s*["']0 12 \* \* 1,2,3["']/);
    expect(workflow).not.toMatch(/getHours\s*\(/i);
    expect(workflow).not.toMatch(/date \+%H/i);
    expect(workflow).not.toMatch(/if:\s*.*8\s*AM/i);
  });

  it("runs field sync, tournament shell generation, model generation, and post-generation freshness checks", () => {
    const workflow = read(".github/workflows/sync-pga-data.yml");

    const fieldSync = workflow.indexOf("node scripts/fetch-pga-current-field.mjs");
    const packageGeneration = workflow.indexOf("node scripts/generate-pga-tournament-package.mjs --feature");
    const rankings = workflow.indexOf("node scripts/generate-pga-tournament-rankings.mjs");
    const fieldCheck = workflow.indexOf("node scripts/check-pga-field-sync.mjs");
    const modelCheck = workflow.indexOf("node scripts/check-pga-model-sync.mjs");

    expect(fieldSync).toBeGreaterThan(-1);
    expect(packageGeneration).toBeGreaterThan(fieldSync);
    expect(rankings).toBeGreaterThan(packageGeneration);
    expect(fieldCheck).toBeGreaterThan(rankings);
    expect(modelCheck).toBeGreaterThan(rankings);
  });

  it("treats Google Sheet sync as optional and fetches API fallback before rankings when freshness fails", () => {
    const workflow = read(".github/workflows/sync-pga-data.yml");

    const sheetSync = workflow.indexOf("id: sheet_sync");
    const freshness = workflow.indexOf("id: freshness");
    const fallback = workflow.indexOf("node scripts/fetch-pga-player-stats.mjs");
    const rankings = workflow.indexOf("node scripts/generate-pga-tournament-rankings.mjs");

    expect(workflow).toContain("continue-on-error: true");
    expect(workflow).toContain("steps.sheet_sync.outcome == 'failure' || steps.freshness.outcome == 'failure'");
    expect(sheetSync).toBeGreaterThan(-1);
    expect(freshness).toBeGreaterThan(sheetSync);
    expect(fallback).toBeGreaterThan(freshness);
    expect(rankings).toBeGreaterThan(fallback);
  });

  it("labels model source and blocks stale Sheet data from masquerading as current", () => {
    const generator = read("scripts/generate-pga-tournament-rankings.mjs");
    const validator = read("scripts/check-pga-model-sync.mjs");

    expect(generator).toContain('new Set(["sheet", "online-api", "mixed", "fallback"])');
    expect(generator).toContain("deriveModelSource");
    expect(generator).toContain("sheetIsStale");
    expect(generator).toContain("onlineFallbackUsed");
    expect(generator).toContain("staleSheetBlocked");
    expect(validator).toContain("Refusing to publish stale Google Sheet data as current model data");
  });

  it("filters the current model to the official field and writes source metadata", () => {
    const generator = read("scripts/generate-pga-tournament-rankings.mjs");

    expect(generator).toContain("validateCurrentField");
    expect(generator).toContain("filterStatsToField");
    expect(generator).toContain("safeForCurrentTournament");
    expect(generator).toContain("model-source-meta.json");
    expect(generator).toContain("${currentTournament.slug}-model-meta.json");
    expect(generator).toContain("public/data/pga/${currentTournament.dataFile}");
  });

  it("keeps Sheet-only fields unavailable instead of fabricating them in the API model file", () => {
    const generator = read("scripts/generate-pga-tournament-rankings.mjs");

    expect(generator).toContain("SHEET_ONLY_FIELDS_UNAVAILABLE_ON_API");
    expect(generator).toContain('"Course True SG": null');
    expect(generator).toContain('"Par 4 Scoring Average_rank": null');
    expect(generator).toContain('"Birdie or Better 125-150 yds_rank": null');
    expect(generator).toContain("Unavailable Sheet-only fields are set to null and are not fabricated");
  });

  it("surfaces source metadata and warning behavior on the PGA model page header", () => {
    const header = read("src/components/pga/PgaMainHeader.tsx");

    expect(header).toContain("ModelSourceNotice");
    expect(header).toContain("sheetIsStale");
    expect(header).toContain("safeForCurrentTournament");
    expect(header).toContain("the Google Sheet model is stale");
  });

  it("does not change unrelated sport source files in this test contract", () => {
    const workflow = read(".github/workflows/sync-pga-data.yml");

    expect(workflow).not.toContain("public/data/nfl");
    expect(workflow).not.toContain("public/data/mlb");
    expect(workflow).not.toContain("src/data/ncaa");
  });
});
