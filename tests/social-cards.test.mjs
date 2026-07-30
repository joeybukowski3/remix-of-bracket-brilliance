import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  evaluateConfirmedReadiness,
  normalizeConfirmed,
  normalizeMorning,
} from "../scripts/lib/social-cards/mlb.mjs";
import { renderCard } from "../scripts/lib/social-cards/render.mjs";
import { logoMarkup, normalizeTeam } from "../scripts/lib/social-cards/core.mjs";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);
const repositoryRoot = path.resolve(currentDirectory, "..");
const fixturesDirectory = path.join(
  repositoryRoot,
  "scripts",
  "fixtures",
);

function loadFixture(filename) {
  const fixturePath = path.join(fixturesDirectory, filename);
  return JSON.parse(readFileSync(fixturePath, "utf8"));
}

describe("MLB daily cards", () => {
  it("normalizes morning without odds and preserves order", () => {
    const normalized = normalizeMorning(
      loadFixture("mlb-daily-morning.json"),
    );

    expect(normalized.homeRuns).toHaveLength(6);
    expect(normalized.strikeouts).toHaveLength(5);
    expect(normalized.homeRuns[0].player).toBe("James Wood");
    expect(JSON.stringify(normalized)).not.toContain("odds");
  });

  it("caps rows without reranking", () => {
    const input = loadFixture("mlb-daily-morning.json");

    input.homeRuns.push({
      rank: 7,
      player: "Seventh",
      team: "BOS",
      hrScore: 99,
    });

    input.strikeouts.push({
      rank: 6,
      pitcher: "Sixth",
      team: "BOS",
      kScore: 99,
      projectedK: 9,
    });

    const normalized = normalizeMorning(input);

    expect(normalized.homeRuns).toHaveLength(6);
    expect(normalized.homeRuns[0].player).toBe("James Wood");
    expect(normalized.strikeouts).toHaveLength(5);
    expect(normalized.strikeouts[0].pitcher).toBe("Paul Skenes");
  });

  it("renders exact SVG dimensions and required notes", () => {
    const normalized = normalizeMorning(
      loadFixture("mlb-daily-morning.json"),
    );
    const svg = renderCard(normalized);

    expect(svg).toContain('width="1080" height="1350"');
    expect(svg).toContain(
      "Lineups not confirmed. Odds may not yet be available.",
    );
    expect(svg).toContain("joeknowsball.com");
    expect(svg).toContain("@_joeknowsball_");
    expect(svg).not.toMatch(/(?:href|src)="https?:\/\//);
    expect(svg).not.toMatch(/undefined|NaN|null/);
  });

  it("formats confirmed markets and edges", () => {
    const normalized = normalizeConfirmed(
      loadFixture("mlb-daily-confirmed.json"),
    );

    expect(normalized.homeRuns[0].odds).toBe("+340");
    expect(normalized.strikeouts[0].line).toBe("O 6.5");
    expect(normalized.values[1].edge).toBe("+9.4%");
    expect(normalized.values[0].edge).toBe("+0.7");
    expect(normalized.publishReady).toBe(true);
    expect(renderCard(normalized)).toContain(
      "Updated with confirmed lineups, starters, and available markets.",
    );
  });

  it("rejects incomplete confirmed HR and K markets", () => {
    const missingHrOdds = loadFixture("mlb-daily-confirmed.json");
    missingHrOdds.homeRuns[0].odds = null;

    expect(() => normalizeConfirmed(missingHrOdds)).toThrow(
      /requires odds/,
    );

    const missingKLine = loadFixture("mlb-daily-confirmed.json");
    missingKLine.strikeouts[0].line = null;

    expect(() => normalizeConfirmed(missingKLine)).toThrow(
      /requires side, line, odds and edge/,
    );

    const missingKSide = loadFixture("mlb-daily-confirmed.json");
    missingKSide.strikeouts[0].side = null;

    expect(() => normalizeConfirmed(missingKSide)).toThrow(
      /requires side, line, odds and edge/,
    );

    const missingKOdds = loadFixture("mlb-daily-confirmed.json");
    missingKOdds.strikeouts[0].odds = null;

    expect(() => normalizeConfirmed(missingKOdds)).toThrow(
      /requires side, line, odds and edge/,
    );

    const missingKEdge = loadFixture("mlb-daily-confirmed.json");
    missingKEdge.strikeouts[0].edge = null;

    expect(() => normalizeConfirmed(missingKEdge)).toThrow(
      /requires side, line, odds and edge/,
    );
  });

  it("fails readiness below minimums", () => {
    const input = loadFixture("mlb-daily-confirmed-partial.json");
    const readiness = evaluateConfirmedReadiness(input);

    expect(readiness.ready).toBe(false);
    expect(readiness.reasons).toContain(
      "INSUFFICIENT_CONFIRMED_VALUE_ROWS",
    );
  });

  it("requires explicit preview for partial confirmed", () => {
    const input = loadFixture("mlb-daily-confirmed-partial.json");

    expect(() => normalizeConfirmed(input)).toThrow(/not ready/);

    const normalized = normalizeConfirmed(input, {
      preview: true,
      valuesSourceAvailable: false,
    });

    expect(normalized.preview).toBe(true);
    expect(normalized.publishReady).toBe(false);
    expect(normalized.readiness.reasons).toContain(
      "CONFIRMED_VALUES_SOURCE_UNAVAILABLE",
    );
  });

  it("truncates long names deterministically", () => {
    const normalized = normalizeMorning(
      loadFixture("mlb-daily-long-names.json"),
    );

    expect(normalized.homeRuns[0].player.endsWith("…")).toBe(true);
    expect(normalized.homeRuns[0].player.length).toBeLessThanOrEqual(24);
  });

  it("renders a missing-logo abbreviation fallback", () => {
    const normalized = normalizeMorning(
      loadFixture("mlb-daily-missing-logo.json"),
    );

    expect(renderCard(normalized)).toContain("ZZZ");
  });

  it("normalizes short team codes to a key with an existing local logo file, not a long form with none", () => {
    // Regression guard: KC/TB/SD/SF/CWS previously normalized to KCR/TBR/SDP/SFG/CHW,
    // none of which have a matching public/logos/mlb/*.svg file (which uses short
    // codes), silently forcing these five teams onto the generic unbranded fallback.
    expect(normalizeTeam("KC")).toBe("KC");
    expect(normalizeTeam("TB")).toBe("TB");
    expect(normalizeTeam("SD")).toBe("SD");
    expect(normalizeTeam("SF")).toBe("SF");
    expect(normalizeTeam("CWS")).toBe("CWS");
    for (const team of ["KC", "TB", "SD", "SF", "CWS", "ATH", "NYY", "MIN"]) {
      expect(logoMarkup(team, 0, 0, {})).toContain("data:image/svg+xml;base64,");
    }
  });

  it("uses the documented modeled-hitters source", () => {
    const input = loadFixture("mlb-daily-morning.json");
    const normalized = normalizeMorning(input);

    expect(normalized.snapshot.modeledHitters).toBe(
      input.snapshot.modeledHitters,
    );
    expect(normalized.snapshot.highestHrScore.value).toBe(78);
    expect(normalized.snapshot.highestProjectedK.value).toBe(7.6);
  });
});