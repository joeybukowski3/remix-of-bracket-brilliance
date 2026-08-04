import { describe, it, expect } from "vitest";
import {
  DEFENSE_METRIC_GROUPS,
  DEFENSE_RUN_METRICS,
  EXCLUDED_INJURY_POSITIONS,
  MARKET_PROFILE_METRICS,
  OFFENSE_METRIC_GROUPS,
  OFFENSE_RUSHING_METRICS,
  TRENCH_BATTLES,
  UNIT_BATTLE_GROUPS,
  getAllMetricKeys,
  getMetricDef,
  injuryExposureBucket,
  isExcludedInjuryPosition,
  unavailableInjuryResolver,
  unavailableMetricResolver,
  type NflGameStatus,
} from "@/lib/nfl/matchupMetrics";

describe("Phase 1 resolvers", () => {
  it("returns null for every known metric key, so no value can be fabricated", () => {
    const keys = getAllMetricKeys();
    expect(keys.length).toBeGreaterThan(30);
    for (const key of keys) {
      expect(unavailableMetricResolver("any-team", key)).toBeNull();
    }
  });

  it("returns null for every injury profile lookup", () => {
    expect(unavailableInjuryResolver("new-england-patriots")).toBeNull();
    expect(unavailableInjuryResolver("seattle-seahawks")).toBeNull();
  });
});

describe("metric catalogue integrity", () => {
  it("uses unique metric keys across every group", () => {
    const keys = getAllMetricKeys();
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("declares a direction and format for every metric", () => {
    for (const key of getAllMetricKeys()) {
      const def = getMetricDef(key);
      expect(def, key).not.toBeNull();
      expect(["higher-is-better", "lower-is-better", "context-only"]).toContain(def!.direction);
      expect(def!.format).toBeTruthy();
      expect(def!.label.length).toBeGreaterThan(0);
    }
  });

  it("exposes the three offense and three defense subgroups in order", () => {
    expect(OFFENSE_METRIC_GROUPS.map((group) => group.label)).toEqual([
      "Overall Offense",
      "Passing",
      "Rushing",
    ]);
    expect(DEFENSE_METRIC_GROUPS.map((group) => group.label)).toEqual([
      "Overall Defense",
      "Pass Defense",
      "Run Defense",
    ]);
  });
});

describe("metric direction metadata", () => {
  it("marks offensive volume/tendency metrics as context-only rather than good or bad", () => {
    expect(getMetricDef("off.passPlayRate")!.direction).toBe("context-only");
    expect(getMetricDef("off.rushPlayRate")!.direction).toBe("context-only");
    expect(getMetricDef("off.timeOfPossession")!.direction).toBe("context-only");
  });

  it("marks defensive conventional metrics as lower-is-better", () => {
    const lowerIsBetter = [
      "def.epaPerPlayAllowed",
      "def.yardsPerPlayAllowed",
      "def.pointsAllowedPerGame",
      "def.opponentPasserRating",
      "def.opponentYardsPerRushAttempt",
      "def.rushSuccessRateAllowed",
    ];
    for (const key of lowerIsBetter) {
      expect(getMetricDef(key)!.direction, key).toBe("lower-is-better");
    }
  });

  it("marks defensive disruption and win-rate metrics as higher-is-better", () => {
    for (const key of ["def.takeawaysPerGame", "def.sacksPerGame", "def.passRushWinRate", "def.runStopWinRate"]) {
      expect(getMetricDef(key)!.direction, key).toBe("higher-is-better");
    }
  });

  it("marks giveaways and sacks allowed as lower-is-better on offense", () => {
    expect(getMetricDef("off.turnoversPerGame")!.direction).toBe("lower-is-better");
    expect(getMetricDef("off.sacksAllowedPerGame")!.direction).toBe("lower-is-better");
  });
});

describe("line-of-scrimmage naming", () => {
  it("labels the defensive run-game win rate Run Stop Win Rate, not Run Block Win Rate", () => {
    const runStop = getMetricDef("def.runStopWinRate")!;
    expect(runStop.label).toBe("Run Stop Win Rate");
    expect(runStop.shortLabel).toBe("RSWR");

    const defenseLabels = DEFENSE_RUN_METRICS.map((metric) => metric.label);
    expect(defenseLabels).not.toContain("Run Block Win Rate");
  });

  it("keeps Run Block Win Rate on the offensive side", () => {
    const offenseLabels = OFFENSE_RUSHING_METRICS.map((metric) => metric.label);
    expect(offenseLabels).toContain("Run Block Win Rate");
  });

  it("pairs blocking win rates against the correct defensive counterparts", () => {
    const byId = new Map(TRENCH_BATTLES.map((battle) => [battle.id, battle]));
    expect(byId.get("pass-protection")).toMatchObject({
      offenseKey: "off.passBlockWinRate",
      defenseKey: "def.passRushWinRate",
    });
    expect(byId.get("run-blocking")).toMatchObject({
      offenseKey: "off.runBlockWinRate",
      defenseKey: "def.runStopWinRate",
    });
  });
});

describe("offense vs defense pairings", () => {
  it("references only metric keys that exist in the catalogue", () => {
    for (const group of UNIT_BATTLE_GROUPS) {
      for (const pairing of group.pairings) {
        expect(getMetricDef(pairing.offenseKey), pairing.offenseKey).not.toBeNull();
        expect(getMetricDef(pairing.defenseKey), pairing.defenseKey).not.toBeNull();
      }
    }
  });

  it("always pairs an offensive key with a defensive key", () => {
    for (const group of UNIT_BATTLE_GROUPS) {
      for (const pairing of group.pairings) {
        expect(pairing.offenseKey.startsWith("off.")).toBe(true);
        expect(pairing.defenseKey.startsWith("def.")).toBe(true);
      }
    }
  });
});

describe("market profile", () => {
  it("scaffolds the descriptive record slots without any projected line", () => {
    const labels = MARKET_PROFILE_METRICS.map((metric) => metric.label);
    expect(labels).toEqual([
      "W/L Record",
      "ATS Record",
      "Point Differential",
      "ATS Differential",
      "ATS Differential (Home/Away)",
      "Home ATS Record",
      "Away ATS Record",
      "Over/Under Record",
    ]);
    // Nothing in the catalogue may imply a model line or a pick.
    expect(labels.join(" ")).not.toMatch(/projected|pick|edge/i);
  });

  it("ranks only the two differentials, never a raw record", () => {
    // An over-heavy or ATS-heavy record is not thereby "better", so those rows
    // stay context-only and draw no tier colour.
    const byKey = new Map(MARKET_PROFILE_METRICS.map((metric) => [metric.key, metric]));
    expect(byKey.get("mkt.atsDifferential")!.direction).toBe("higher-is-better");
    expect(byKey.get("mkt.pointDifferential")!.direction).toBe("higher-is-better");
    for (const key of ["mkt.record", "mkt.atsRecord", "mkt.overUnderRecord", "mkt.homeAtsRecord", "mkt.awayAtsRecord"]) {
      expect(byKey.get(key)!.direction, key).toBe("context-only");
    }
  });

  it("describes ATS against the historical market spread, never a verified close", () => {
    // The source publishes one settled line and does not document it as an
    // independently verified sportsbook close.
    const help = MARKET_PROFILE_METRICS.map((metric) => metric.help ?? "").join(" ");
    expect(help).toMatch(/historical market spread/i);
    expect(help).not.toMatch(/closing spread/i);
  });
});

describe("injury rules", () => {
  it("counts OUT and DOUBTFUL as unavailable exposure", () => {
    expect(injuryExposureBucket("OUT")).toBe("unavailable");
    expect(injuryExposureBucket("DOUBTFUL")).toBe("unavailable");
  });

  it("tracks QUESTIONABLE in its own bucket", () => {
    expect(injuryExposureBucket("QUESTIONABLE")).toBe("questionable");
  });

  it("puts a blank game status in neither exposure bucket", () => {
    // A player can appear on the report with only a practice note. That is not
    // a designation and must never be forced into one.
    expect(injuryExposureBucket(null)).toBeNull();
  });

  it("keeps every game designation in a defined bucket", () => {
    const all: NflGameStatus[] = ["OUT", "DOUBTFUL", "QUESTIONABLE"];
    for (const status of all) {
      expect(injuryExposureBucket(status), status).not.toBeUndefined();
    }
  });

  it("excludes special-teams-only positions from injury exposure", () => {
    expect(EXCLUDED_INJURY_POSITIONS).toEqual(["K", "P", "LS"]);
    for (const position of ["K", "P", "LS", "k", "p", "ls"]) {
      expect(isExcludedInjuryPosition(position), position).toBe(true);
    }
  });

  it("includes offensive and defensive contributors", () => {
    for (const position of ["QB", "RB", "WR", "TE", "OT", "EDGE", "CB", "LB", "S"]) {
      expect(isExcludedInjuryPosition(position), position).toBe(false);
    }
  });
});
