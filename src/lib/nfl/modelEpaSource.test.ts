import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv } from "../../../scripts/lib/nfl-schedules-results-core.mjs";
import { parseCompactRow } from "../../../scripts/lib/nfl-epa-core.mjs";
import {
  NFL_MODEL_EPA_CACHE_DIR,
  NFL_MODEL_EPA_DEFINITION,
  NFL_MODEL_EPA_SOURCE,
  aggregatePbpTeamMetrics,
  computePbpTeamMetricsForTeamWeeks,
} from "../../../scripts/lib/nfl-epa-team-metrics.mjs";
import { NFL_POWER_V03_FORMULA_METADATA, NFL_POWER_V03_FORMULA_WEIGHTS, NFL_POWER_V03_MODEL_VERSION, NFL_POWER_V03_TRAJECTORY } from "../../../scripts/lib/nfl-power-v03-metrics.mjs";

const ROOT = resolve(__dirname, "../../..");
const records = parseCsv(
  readFileSync(join(ROOT, "data/nfl/nflverse/epa-team-game/epa_team_game_2025.csv"), "utf8")
).map(parseCompactRow);

const artifact = JSON.parse(
  readFileSync(join(ROOT, "public/data/nfl/2025/full-season-team-metrics.json"), "utf8")
);

describe("active model EPA source", () => {
  it("declares play-by-play as the model's EPA source", () => {
    expect(NFL_MODEL_EPA_SOURCE).toMatch(/play-by-play/i);
    expect(NFL_MODEL_EPA_SOURCE).toMatch(/nflfastR/i);
    expect(NFL_MODEL_EPA_DEFINITION).toBe("matchup-epa-v1");
    expect(NFL_MODEL_EPA_CACHE_DIR).toBe("data/nfl/nflverse/epa-team-game");
  });

  it("records the migration in the versioned formula metadata", () => {
    expect(NFL_POWER_V03_MODEL_VERSION).toBe("nfl-power-v0.3.1");
    const epa = NFL_POWER_V03_FORMULA_METADATA.epaSource;
    expect(epa.source).toMatch(/play-by-play/i);
    expect(epa.migratedIn).toBe("nfl-power-v0.3.1");
    // The legacy definition is named so the change stays auditable.
    expect(epa.previousSource).toMatch(/stats_team_week/);
    expect(epa.eligiblePlays).toBe(
      "(pass == 1 OR rush == 1) AND epa present AND posteam present AND two_point_attempt != 1"
    );
  });

  it("publishes the play-by-play source on generated artifacts", () => {
    expect(artifact._meta.modelVersion).toBe("nfl-power-v0.3.1");
    expect(artifact._meta.epaSource.source).toMatch(/play-by-play/i);
    expect(artifact._meta.epaSource.definition).toBe("matchup-epa-v1");
    expect(artifact._meta.source).toMatch(/play-by-play EPA cache/i);
    // The legacy weekly cache must no longer be claimed as the EPA source.
    expect(artifact._meta.source).not.toMatch(/stats_team weekly/i);
  });
});

describe("model EPA aggregation", () => {
  const metrics = aggregatePbpTeamMetrics(records, { season: 2025 });

  it("covers all 32 teams from the committed cache", () => {
    expect(metrics.size).toBe(32);
  });

  it("divides summed EPA by summed plays rather than averaging games", () => {
    const sea = metrics.get("sea")!;
    expect(sea.offensiveEpaPerPlay).toBeCloseTo(sea.offensiveEpa / sea.offensivePlays, 12);
    expect(sea.gamesRepresented).toBe(17);

    // An equal-weight mean of the 17 per-game rates is a different number.
    const games = records.filter((r) => r.season === 2025 && r.team === "sea");
    const naive = games.reduce((sum, g) => sum + g.offEpa / g.offPlays, 0) / games.length;
    expect(naive).not.toBeCloseTo(sea.offensiveEpaPerPlay!, 6);
  });

  it("reproduces the audited 2025 season values", () => {
    // Independently verified against RBSDM's published figures in Phase 6.
    expect(metrics.get("ne")!.offensiveEpaPerPlay).toBeCloseTo(0.1545, 4);
    expect(metrics.get("sea")!.offensiveEpaPerPlay).toBeCloseTo(0.0365, 4);
    expect(metrics.get("kc")!.offensiveEpaPerPlay).toBeCloseTo(0.0421, 4);
    expect(metrics.get("phi")!.offensiveEpaPerPlay).toBeCloseTo(0.0343, 4);
  });

  it("derives defense from the opponent's offense in the same games", () => {
    const sea = metrics.get("sea")!;
    expect(sea.defensiveEpaPerPlay).toBeCloseTo(-0.1128, 4);
    expect(sea.defensiveEpaPerPlay).toBeCloseTo(sea.defensiveEpa / sea.defensivePlays, 12);
    // Offensive and defensive play counts differ — defence is genuinely the
    // opponents' snaps, not a mirror of the team's own.
    expect(sea.defensivePlays).not.toBe(sea.offensivePlays);
  });

  it("differs materially from the retired legacy EPA definition", () => {
    // Legacy stats_team_week put KC's scrambles in rushing: rush +0.0197 and
    // pass +0.0394. Play-by-play flips the rushing sign.
    const kc = metrics.get("kc")!;
    expect(kc.passingEpaPerPlay).toBeCloseTo(0.0925, 3);
    expect(kc.rushingEpaPerPlay).toBeCloseTo(-0.0596, 3);
    expect(kc.rushingEpaPerPlay!).toBeLessThan(0);
  });

  it("fails loudly when a season is not cached", () => {
    expect(() => aggregatePbpTeamMetrics(records, { season: 1999 })).toThrow(/no cached EPA rows/);
  });
});

describe("model EPA team-week selection", () => {
  it("aggregates only the selected weeks", () => {
    const weeks = [15, 16, 17, 18].map((week) => ({ season: 2025, week, team: "ne" }));
    const out = computePbpTeamMetricsForTeamWeeks(records, 2025, weeks).get("ne")!;
    expect(out.gamesRepresented).toBe(4);

    const selected = records.filter(
      (r) => r.season === 2025 && r.team === "ne" && [15, 16, 17, 18].includes(r.week)
    );
    const epa = selected.reduce((s, g) => s + g.offEpa, 0);
    const plays = selected.reduce((s, g) => s + g.offPlays, 0);
    expect(out.offensiveEpaPerPlay).toBeCloseTo(epa / plays, 12);
  });

  it("fails rather than silently shrinking a window", () => {
    expect(() =>
      computePbpTeamMetricsForTeamWeeks(records, 2025, [{ season: 2025, week: 99, team: "ne" }])
    ).toThrow(/No cached EPA row/);
  });
});

describe("model structure is unchanged by the migration", () => {
  it("keeps the 40/40/20 weights", () => {
    expect(NFL_POWER_V03_FORMULA_WEIGHTS).toEqual({
      opponentAdjustedOffensiveEpaPerPlay: 0.4,
      opponentAdjustedDefensiveEpaPerPlayInverted: 0.4,
      opponentAdjustedPointDifferentialPerGame: 0.2,
    });
    expect(artifact._meta.formulaWeights).toEqual(NFL_POWER_V03_FORMULA_WEIGHTS);
  });

  it("keeps the one-pass opponent adjustment", () => {
    expect(artifact.adjustmentMethods).toEqual({
      margin: "game-level one-pass residual",
      epa: "opponent-mean one-pass",
    });
  });

  it("keeps recency disabled", () => {
    expect(NFL_POWER_V03_TRAJECTORY.lambda).toBe(0);
    expect(artifact._meta.trajectory.lambda).toBe(0);
  });

  it("adds no home-field advantage and no market input", () => {
    const json = JSON.stringify(artifact);
    expect(json).not.toMatch(/homeField|hfa|spread|moneyline|marketLine|odds/i);
    expect(json).not.toMatch(/projectedSpread|winProbability|modelEdge|pickedWinner/i);
  });

  it("scores only the three v0.3 metrics plus net EPA context", () => {
    expect(artifact.metricKeys).toEqual([
      "offEpaPerPlay",
      "defEpaPerPlay",
      "netEpaPerPlay",
      "pointDiffPerGame",
    ]);
    // Success rate, trenches and injuries stay out of the rating.
    const json = JSON.stringify(artifact);
    expect(json).not.toMatch(/successRate|passBlockWinRate|passRushWinRate|snapPct|injur/i);
  });
});
