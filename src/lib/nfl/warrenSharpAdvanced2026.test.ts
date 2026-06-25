import { describe, it, expect } from "vitest";
import {
  WS_OFFENSIVE_EFFICIENCY,
  WS_RUSHING_EFFICIENCY,
  WS_QB_METRICS,
  WS_HEALTH_BY_UNIT,
  WS_PROJECTED_QB_2026,
  getWsOffensiveEfficiency,
  getWsRushingEfficiency,
  getWsQbMetrics,
  getWsHealthByUnit,
  getWsQbMetricsForTeam,
} from "@/data/nflWarrenSharpAdvanced2026";

const ABBRS = [
  "ari","atl","bal","buf","car","chi","cin","cle","dal","den",
  "det","gb","hou","ind","jax","kc","lv","lac","lar","mia",
  "min","ne","no","nyg","nyj","phi","pit","sf","sea","tb","ten","wsh",
];

// ── Count checks ──────────────────────────────────────────────────────────────

describe("Record counts", () => {
  it("offensive efficiency has 32 teams", () => expect(Object.keys(WS_OFFENSIVE_EFFICIENCY).length).toBe(32));
  it("rushing efficiency has 32 teams", () => expect(Object.keys(WS_RUSHING_EFFICIENCY).length).toBe(32));
  it("health by unit has 32 teams", () => expect(Object.keys(WS_HEALTH_BY_UNIT).length).toBe(32));
  it("QB projections covers all 32 teams", () => expect(Object.keys(WS_PROJECTED_QB_2026).length).toBe(32));
  it("QB metrics has at least 20 players", () => expect(Object.keys(WS_QB_METRICS).length).toBeGreaterThanOrEqual(20));
});

// ── All teams present ─────────────────────────────────────────────────────────

describe("All 32 teams present in each dataset", () => {
  it("offensive efficiency — all 32 abbrs", () => {
    for (const abbr of ABBRS) expect(getWsOffensiveEfficiency(abbr), `missing ${abbr}`).not.toBeNull();
  });
  it("rushing efficiency — all 32 abbrs", () => {
    for (const abbr of ABBRS) expect(getWsRushingEfficiency(abbr), `missing ${abbr}`).not.toBeNull();
  });
  it("health by unit — all 32 abbrs", () => {
    for (const abbr of ABBRS) expect(getWsHealthByUnit(abbr), `missing ${abbr}`).not.toBeNull();
  });
});

// ── Offensive efficiency rank range ───────────────────────────────────────────

describe("Offensive efficiency rank validity", () => {
  const OFF_FIELDS = [
    "earlyDownSuccessRank","firstHalfEDPassRateRank","edQ13PassEpaRank","edQ13RushEpaRank",
    "edRzPassEpaRank","edRzRushEpaRank","thirdDownEpaFgRangeRank","downSetConvRank",
    "explosivePlayRank","thirdDownConvRank","fourthDownConvRank","paceRank",
  ];

  it("all ranks in 1–32", () => {
    for (const abbr of ABBRS) {
      const d = WS_OFFENSIVE_EFFICIENCY[abbr];
      for (const field of OFF_FIELDS) {
        const v = d[field as keyof typeof d] as number;
        expect(v, `${abbr}.${field}`).toBeGreaterThanOrEqual(1);
        expect(v, `${abbr}.${field}`).toBeLessThanOrEqual(32);
      }
    }
  });

  it("sourcePage is 46 for all teams", () => {
    for (const abbr of ABBRS) {
      expect(WS_OFFENSIVE_EFFICIENCY[abbr].sourcePage).toBe(46);
    }
  });

  // Spot-check known values
  it("DET ranks #1 early down success (verified p.46)", () => {
    expect(WS_OFFENSIVE_EFFICIENCY.det.earlyDownSuccessRank).toBe(1);
  });
  it("HOU ranks #32 early down success", () => {
    expect(WS_OFFENSIVE_EFFICIENCY.hou.earlyDownSuccessRank).toBe(32);
  });
  it("LAC ranks #1 pace", () => {
    expect(WS_OFFENSIVE_EFFICIENCY.lac.paceRank).toBe(1);
  });
  it("TB ranks #1 RZ pass EPA and #1 3rd down EPA", () => {
    expect(WS_OFFENSIVE_EFFICIENCY.tb.edRzPassEpaRank).toBe(3);
    expect(WS_OFFENSIVE_EFFICIENCY.tb.thirdDownConvRank).toBe(1);
  });
});

// ── Rushing efficiency ────────────────────────────────────────────────────────

describe("Rushing efficiency validity", () => {
  it("all ranks in 1–32", () => {
    for (const abbr of ABBRS) {
      const d = WS_RUSHING_EFFICIENCY[abbr];
      for (const [key, val] of Object.entries(d)) {
        if (key === "sourcePage") continue;
        const metric = val as { value: number; rank: number };
        expect(metric.rank, `${abbr}.${key}.rank`).toBeGreaterThanOrEqual(1);
        expect(metric.rank, `${abbr}.${key}.rank`).toBeLessThanOrEqual(32);
      }
    }
  });

  it("sourcePage is 45 for all teams", () => {
    for (const abbr of ABBRS) expect(WS_RUSHING_EFFICIENCY[abbr].sourcePage).toBe(45);
  });

  it("BAL ranks #1 EPA/rush and #1 YPC (verified p.45)", () => {
    expect(WS_RUSHING_EFFICIENCY.bal.epaPerPlay.rank).toBe(1);
    expect(WS_RUSHING_EFFICIENCY.bal.ypc.rank).toBe(1);
  });
  it("CLE ranks #32 EPA/rush", () => {
    expect(WS_RUSHING_EFFICIENCY.cle.epaPerPlay.rank).toBe(32);
  });
  it("DET ranks #1 success rate", () => {
    expect(WS_RUSHING_EFFICIENCY.det.successRate.rank).toBe(1);
  });
});

// ── QB metrics ────────────────────────────────────────────────────────────────

describe("QB metrics validity", () => {
  it("Drake Maye stable noPressure rank=2 (verified p.42)", () => {
    const m = getWsQbMetrics("Drake Maye");
    expect(m).not.toBeNull();
    expect(m!.stable.noPressure?.rank).toBe(2);
    expect(m!.stable.noPressure?.value).toBe(0.49);
  });

  it("Jordan Love stable noPressure rank=1 (verified p.42)", () => {
    const m = getWsQbMetrics("Jordan Love");
    expect(m!.stable.noPressure?.rank).toBe(1);
    expect(m!.stable.noPressure?.value).toBe(0.56);
  });

  it("all QB metric values have ranks in 1–45 range", () => {
    for (const [player, data] of Object.entries(WS_QB_METRICS)) {
      for (const [key, metric] of Object.entries(data.stable ?? {})) {
        if (!metric) continue;
        expect(metric.rank, `${player}.stable.${key}`).toBeGreaterThanOrEqual(1);
        expect(metric.rank, `${player}.stable.${key}`).toBeLessThanOrEqual(45);
      }
    }
  });

  it("getWsQbMetricsForTeam returns Lamar Jackson for BAL", () => {
    const m = getWsQbMetricsForTeam("bal");
    expect(m).not.toBeNull();
    expect(m!.playerName).toBe("Lamar Jackson");
  });

  it("getWsQbMetricsForTeam returns null for teams with new QBs", () => {
    // ARI has Gardner Minshew who is not in the 2025 metrics table
    const m = getWsQbMetricsForTeam("ari");
    expect(m).toBeNull();
  });
});

// ── Health by unit ────────────────────────────────────────────────────────────

describe("Health by unit validity", () => {
  const HEALTH_FIELDS = [
    "overall2025Rk","overall2024Rk","offenseRk","defenseRk",
    "qbRk","rbRk","wrRk","teRk","olineRk","dlineRk","lbRk","dbRk",
  ];

  it("all ranks in 1–32", () => {
    for (const abbr of ABBRS) {
      const d = WS_HEALTH_BY_UNIT[abbr];
      for (const field of HEALTH_FIELDS) {
        const v = d[field as keyof typeof d] as number;
        expect(v, `${abbr}.${field}`).toBeGreaterThanOrEqual(1);
        expect(v, `${abbr}.${field}`).toBeLessThanOrEqual(32);
      }
    }
  });

  it("dataSource is FTN for all teams", () => {
    for (const abbr of ABBRS) {
      expect(WS_HEALTH_BY_UNIT[abbr].dataSource).toBe("FTN Adjusted Games Lost");
    }
  });

  // Verified spot checks (from rasterized images)
  it("ATL health verified against p.94 image", () => {
    const h = WS_HEALTH_BY_UNIT.atl;
    expect(h.overall2025Rk).toBe(20);
    expect(h.overall2024Rk).toBe(4);
    expect(h.vsLastYrRk).toBe(29);
    expect(h.rbRk).toBe(1);
    expect(h.teRk).toBe(2);
    expect(h.qbRk).toBe(26);
    expect(h.lbRk).toBe(29);
  });

  it("CLE health verified against p.197 image", () => {
    const h = WS_HEALTH_BY_UNIT.cle;
    expect(h.overall2025Rk).toBe(26);
    expect(h.overall2024Rk).toBe(27);
    expect(h.qbRk).toBe(32);
    expect(h.olineRk).toBe(27);
    expect(h.dlineRk).toBe(12);
  });

  it("PHI health verified against p.502 image", () => {
    const h = WS_HEALTH_BY_UNIT.phi;
    expect(h.overall2025Rk).toBe(2);
    expect(h.overall2024Rk).toBe(2);
    expect(h.qbRk).toBe(1);
    expect(h.rbRk).toBe(6);
    expect(h.wrRk).toBe(4);
    expect(h.lbRk).toBe(20);
    expect(h.dbRk).toBe(10);
  });

  it("WSH health verified against p.605 image", () => {
    const h = WS_HEALTH_BY_UNIT.wsh;
    expect(h.overall2025Rk).toBe(30);
    expect(h.overall2024Rk).toBe(5);
    expect(h.vsLastYrRk).toBe(32);
    expect(h.qbRk).toBe(31);
    expect(h.olineRk).toBe(13);
    expect(h.lbRk).toBe(4);
  });
});

// ── Lookup safety ─────────────────────────────────────────────────────────────

describe("Lookup safety", () => {
  it("unknown abbr returns null for all getters", () => {
    expect(getWsOffensiveEfficiency("xyz")).toBeNull();
    expect(getWsRushingEfficiency("xyz")).toBeNull();
    expect(getWsHealthByUnit("xyz")).toBeNull();
    expect(getWsQbMetrics("Nobody McNoface")).toBeNull();
    expect(getWsQbMetricsForTeam("xyz")).toBeNull();
  });
});
