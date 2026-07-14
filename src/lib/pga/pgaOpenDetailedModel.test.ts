import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeTournamentPlayerData, rankPlayersByScore } from "@/lib/pga/modelEngine";
import { getTournamentModelPath } from "@/lib/pga/tournamentConfig";
import { getPgaTournamentBySlug, PGA_TOURNAMENTS } from "@/lib/pga/tournaments";
import {
  getWeightsForPreset,
  PGA_CUSTOM_MODEL_KEY,
  PGA_TOP_20_PROFILE_KEY,
  PGA_TOP_20_PROFILE_WEIGHTS,
  withPermanentPgaPresets,
} from "@/lib/pga/pgaWeights";
import type { PgaWeights, RawPgaPlayer } from "@/lib/pga/pgaTypes";
import { REQUIRED_MODEL_FIELDS, validateDetailedTournamentData } from "../../../scripts/lib/pga-detailed-model.mjs";

const ROOT = resolve(__dirname, "../../..");
const DATA = JSON.parse(readFileSync(join(ROOT, "public/data/pga/the-open-2026.json"), "utf8")) as RawPgaPlayer[];
const FIELD = JSON.parse(readFileSync(join(ROOT, "public/data/pga/current-field.json"), "utf8"));
const TREND = JSON.parse(readFileSync(join(ROOT, "public/data/pga/jkb-trend-rankings.json"), "utf8"));
const SCHEDULE = JSON.parse(readFileSync(join(ROOT, "src/data/pga/schedule.json"), "utf8"));
const WORKFLOW = readFileSync(join(ROOT, ".github/workflows/sync-pga-data.yml"), "utf8");
const FRESHNESS_GUARD = readFileSync(join(ROOT, "scripts/check-pga-stats-freshness.mjs"), "utf8");
const OPEN_MODULE = readFileSync(join(ROOT, "src/data/pga/generated/the-open-2026-picks.ts"), "utf8");

const tournament = getPgaTournamentBySlug("the-open-2026-picks");
if (!tournament) throw new Error("The Open detailed tournament is not registered.");
const presets = withPermanentPgaPresets(tournament.model.presets);
const players = normalizeTournamentPlayerData(DATA);

describe("2026 Open detailed package", () => {
  it("registers the exact route without changing existing detailed routes", () => {
    expect(getTournamentModelPath(tournament)).toBe("/pga/the-open-2026-picks/model");
    expect(PGA_TOURNAMENTS.map((entry) => entry.slug)).toEqual(expect.arrayContaining([
      "cadillac-championship-2026-picks",
      "charles-schwab-challenge-2026-picks",
      "the-memorial-tournament-2026-picks",
      "us-open-2026-picks",
      "zurich-classic-of-new-orleans-2026-picks",
    ]));
  });

  it("has valid Open metadata and the corrected tournament dates", () => {
    const source = SCHEDULE.find((entry: { slug: string }) => entry.slug === tournament.slug);
    expect(tournament.name).toBe("The Open");
    expect(tournament.courseName).toBe("Royal Birkdale GC");
    expect(tournament.location).toBe("Southport, England");
    expect(tournament.schedule).toMatchObject({ startDate: "2026-07-16", endDate: "2026-07-19" });
    expect(source).toMatchObject({ par: 70, yardage: 7223, major: true, tournamentType: "major" });
    expect(source.officialMetadataSource).toBe("https://www.theopen.com/royal-birkdale-154th-open/course-guide");
  });

  it("contains the current field once and exposes all required normalized inputs", () => {
    const names = DATA.map((row) => row["Player Name"]);
    expect(DATA).toHaveLength(FIELD.fieldCount);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(names)).toEqual(new Set(FIELD.players));
    for (const row of DATA) {
      expect(REQUIRED_MODEL_FIELDS.every((fieldName) => fieldName in row)).toBe(true);
    }
  });

  it("uses the corrected JKB Trend artifact and leaves unsupported players missing", () => {
    expect(TREND.schemaVersion).toBe("jkb-trend-rankings-v2");
    expect(TREND.validation.status).toBe("valid");
    expect(TREND.newestUsableRoundDate).toBe("2026-07-12");
    const unsupported = DATA.find((row) => row["Player Name"] === "Jon Rahm");
    expect(unsupported?.TrendRank).toBeNull();
    expect(unsupported?.["SG: Approach the Green"]).toBeNull();
    expect(unsupported?.dataCompletenessScore).toBeLessThan(5);
  });

  it("passes 80 players through the existing minimum-evidence gate", () => {
    const defaultWeights = getWeightsForPreset(presets, "balanced");
    expect(rankPlayersByScore(players, defaultWeights)).toHaveLength(80);
    expect(DATA.filter((row) => (row.dataCompletenessScore ?? 0) < 5)).toHaveLength(76);
  });

  it("injects Top 20 Profile and keeps Custom Model available through the shared controls", () => {
    expect(presets.some((preset) => preset.key === PGA_TOP_20_PROFILE_KEY)).toBe(true);
    expect(PGA_CUSTOM_MODEL_KEY).toBe("custom-model");
    expect(OPEN_MODULE).toContain("previewSliderKeys");
  });

  it("reranks deterministically for Top 20 and custom weights, then resets to default", () => {
    const defaultWeights = getWeightsForPreset(presets, "balanced");
    const customWeights: PgaWeights = {
      sgApproach: 30,
      par4: 5,
      drivingAccuracy: 5,
      bogeyAvoidance: 5,
      sgAroundGreen: 5,
      trendRank: 30,
      birdie125150: 5,
      sgPutting: 5,
      birdieUnder125: 5,
      courseTrueSg: 5,
    };
    const defaultOrder = rankPlayersByScore(players, defaultWeights).map((row) => row.player);
    const top20Order = rankPlayersByScore(players, PGA_TOP_20_PROFILE_WEIGHTS as PgaWeights).map((row) => row.player);
    const customOrder = rankPlayersByScore(players, customWeights).map((row) => row.player);
    expect(top20Order).not.toEqual(defaultOrder);
    expect(customOrder).not.toEqual(defaultOrder);
    expect(rankPlayersByScore(players, defaultWeights).map((row) => row.player)).toEqual(defaultOrder);
    expect(rankPlayersByScore(players, defaultWeights).map((row) => row.player)).toEqual(defaultOrder);
  });

  it("rejects an empty replacement before publication", () => {
    expect(() => validateDetailedTournamentData([], {
      field: FIELD,
      config: { slug: tournament.slug },
      generatedAt: DATA[0]["Model Data Generated At"],
    })).toThrow(/row count/);
  });

  it("refreshes only while the official Open field is active and validates before copy", () => {
    const generate = WORKFLOW.indexOf("generate-pga-detailed-model-data.mjs");
    const publish = WORKFLOW.indexOf('cp "${RUNNER_TEMP}/the-open-2026.json"');
    expect(WORKFLOW).toContain("field.tournamentId === 'R2026100'");
    expect(WORKFLOW).toContain("steps.open_detailed.outputs.active == 'true'");
    expect(generate).toBeGreaterThan(0);
    expect(publish).toBeGreaterThan(generate);
    expect(WORKFLOW).toContain("git add public/data/pga/current-field.json");
    expect(WORKFLOW).toContain("public/data/pga/the-open-2026.json");
    expect(FRESHNESS_GUARD).toContain('"par4ScoringAverage", "birdie125150", "birdieUnder125"');
    expect(FRESHNESS_GUARD).toContain("MIN_REQUIRED_FIELD_COVERAGE = 75");
  });

  it("does not add probability, fair-price, or guaranteed-outcome language", () => {
    expect(OPEN_MODULE).not.toMatch(/calibrated probability|fair odds|guaranteed outcome/i);
  });
});
