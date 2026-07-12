import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { normalizeHrDashboardPayload } from "@/pages/MlbHrProps";
import { getSinCityResults } from "@/lib/mlb/mlbHrFilter";
import { parseReferenceRangeArtifact } from "../referenceRanges";
import { computeHrShadowRows, enrichHrPayloadWithShadow } from "../shadow";

const rangeArtifact = parseReferenceRangeArtifact(
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), "public/data/mlb/model-reference-ranges/hr-bridge-v1.json"),
      "utf8",
    ),
  ),
);

function loadFixturePayload() {
  const raw = JSON.parse(
    readFileSync(resolve(process.cwd(), "public/data/mlb/hr-props-raw.json"), "utf8"),
  );
  const payload = normalizeHrDashboardPayload(raw);
  if (!payload || payload.batters.length === 0) throw new Error("fixture payload empty");
  return payload;
}

describe("HR bridge shadow integration (checked-in fixture)", () => {
  it("attaches shadow fields to every batter row with version metadata", () => {
    const payload = loadFixturePayload();
    const enriched = enrichHrPayloadWithShadow(payload, rangeArtifact);
    expect(enriched.batters).toHaveLength(payload.batters.length);
    for (const row of enriched.batters) {
      expect(row.shadowScoreStatus === "ok" || row.shadowScoreStatus === "suppressed").toBe(true);
      expect(Array.isArray(row.shadowContributions)).toBe(true);
      expect(row.shadowCompleteness).toBeGreaterThanOrEqual(0);
    }
    expect(enriched.shadowMeta).toEqual({
      shadowModelId: "jkb-hr-bridge",
      shadowModelVersion: "1.0.0",
      shadowScoreVersion: "hr-bridge-abs@1",
      shadowRegistryVersion: "mlb-metrics@1",
      shadowRangeArtifactVersion: "hr-bridge-v1",
    });
  });

  it("leaves the production hrScore and hrScoreRank byte-identical", () => {
    const payload = loadFixturePayload();
    const before = payload.batters.map((b) => ({
      playerId: b.playerId,
      hrScore: b.hrScore,
      hrScoreRank: b.hrScoreRank,
      angleTags: b.angleTags,
    }));
    const enriched = enrichHrPayloadWithShadow(payload, rangeArtifact);
    const after = enriched.batters.map((b) => ({
      playerId: b.playerId,
      hrScore: b.hrScore,
      hrScoreRank: b.hrScoreRank,
      angleTags: b.angleTags,
    }));
    expect(after).toEqual(before);
  });

  it("does not mutate the input payload", () => {
    const payload = loadFixturePayload();
    const snapshot = JSON.parse(JSON.stringify(payload));
    enrichHrPayloadWithShadow(payload, rangeArtifact);
    expect(JSON.parse(JSON.stringify(payload))).toEqual(snapshot);
    expect("shadowMeta" in payload).toBe(false);
  });

  it("shadow slate rank is a separate contiguous ranking, not the production rank", () => {
    const enriched = enrichHrPayloadWithShadow(loadFixturePayload(), rangeArtifact);
    const ranked = enriched.batters
      .filter((b) => b.shadowSlateRank != null)
      .sort((a, b) => (a.shadowSlateRank ?? 0) - (b.shadowSlateRank ?? 0));
    expect(ranked[0]?.shadowSlateRank).toBe(1);
    expect(ranked[ranked.length - 1]?.shadowSlateRank).toBe(ranked.length);
    // Rank follows the shadow score, not the production score.
    for (let i = 1; i < ranked.length; i += 1) {
      expect(ranked[i - 1].shadowAbsoluteScore ?? 0).toBeGreaterThanOrEqual(
        ranked[i].shadowAbsoluteScore ?? 0,
      );
    }
  });

  it("a row's shadow score is slate-independent: single-row slice scores identically", () => {
    const payload = loadFixturePayload();
    const roofByGameKey = new Map(payload.games.map((g) => [g.gameKey, g.roofType] as const));
    const full = computeHrShadowRows(payload.batters, rangeArtifact, roofByGameKey);
    const target = full[10];
    const solo = computeHrShadowRows([payload.batters[10]], rangeArtifact, roofByGameKey)[0];
    expect(solo.shadowAbsoluteScore).toBe(target.shadowAbsoluteScore);
    expect(solo.shadowCompleteness).toBe(target.shadowCompleteness);
    expect(solo.shadowNormalizedMetrics).toEqual(target.shadowNormalizedMetrics);
    // Only the slate-relative rank may differ.
    expect(solo.shadowSlateRank).toBe(1);
  });

  it("closed-roof games treat a missing weather boost as inapplicable, not missing", () => {
    const payload = loadFixturePayload();
    const template = payload.batters[0];
    const domeRow = { ...template, gameKey: "DOME@GAME", weatherBoost: null };
    const openRow = { ...template, gameKey: "OPEN@GAME", weatherBoost: null };
    const roofs = new Map([
      ["DOME@GAME", "Dome"],
      ["OPEN@GAME", "Open"],
    ]);
    const [dome, open] = computeHrShadowRows([domeRow, openRow], rangeArtifact, roofs);
    expect(dome.shadowMissingMetrics).not.toContain("weather-hr-boost");
    expect(dome.shadowCompleteness).toBe(100);
    expect(open.shadowMissingMetrics).toContain("weather-hr-boost");
    expect(open.shadowCompleteness).toBe(98);
  });

  it("Sin City results are unchanged by shadow enrichment", () => {
    const payload = loadFixturePayload();
    const gameByKey = new Map(payload.games.map((g) => [g.gameKey, g] as const));
    const toSinCityInput = (batters: typeof payload.batters) =>
      batters.map((b) => ({
        player: b.player,
        hrScore: b.hrScore,
        barrelRate: b.barrelRate,
        hardHitRate: b.hardHitRate,
        exitVelo: b.exitVelo,
        pullRate: b.pullRate,
        stadium: gameByKey.get(b.gameKey)?.stadium ?? null,
        roofType: gameByKey.get(b.gameKey)?.roofType ?? null,
        windDirection: gameByKey.get(b.gameKey)?.windDirection ?? null,
        windSpeed: gameByKey.get(b.gameKey)?.windSpeed ?? null,
      }));

    const before = getSinCityResults(toSinCityInput(payload.batters));
    const enriched = enrichHrPayloadWithShadow(payload, rangeArtifact);
    const after = getSinCityResults(toSinCityInput(enriched.batters));

    expect(after.isFallback).toBe(before.isFallback);
    expect(after.rows.map((r) => r.batter.player)).toEqual(
      before.rows.map((r) => r.batter.player),
    );
    expect(after.rows.map((r) => r.evaluation.matchCount)).toEqual(
      before.rows.map((r) => r.evaluation.matchCount),
    );
  });
});
