import { describe, expect, it } from "vitest";
import type { DvpPosition } from "../dvpPositions";
import { combinePlayers, espnGroupOf, GROUPS, HIGH_PRECISION, MIN_MINUTES, propose, REQUIRED_HELD_OUT, REQUIRED_PRECISION, trainGroup, type CombinedPlayer, type GroupModel, type PlayerSeasonFeatures } from "./positionProposals";

function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const totals = (over: Partial<PlayerSeasonFeatures["totals"]> = {}) => ({ pts: 0, reb: 0, oreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fga: 0, fg3a: 0, fta: 0, ...over });
const season = (playerId: string, over: Partial<PlayerSeasonFeatures> = {}): PlayerSeasonFeatures => ({
  season: "2025-26", playerId, name: `Demo ${playerId}`, team: "BOS", games: 60, starts: 40, minutes: 1800, totals: totals(), espnPositions: { G: 60 }, ...over,
});

describe("espnGroupOf", () => {
  it("takes ESPN's most frequent listing, and returns no group for a center, a specific code or nothing", () => {
    expect(espnGroupOf({ G: 5, F: 2 })).toBe("G");
    expect(espnGroupOf({ F: 5, G: 2 })).toBe("F");
    expect(espnGroupOf({ G: 3, F: 3 })).toBe("F");
    expect(espnGroupOf({ C: 9, F: 2 })).toBeNull();
    expect(espnGroupOf({ PG: 4 })).toBeNull();
    expect(espnGroupOf({})).toBeNull();
    expect(espnGroupOf({ UNKNOWN: 4 })).toBeNull();
  });
});

describe("combinePlayers", () => {
  it("pools both seasons' totals and computes per-36 rates from the pooled minutes", () => {
    const rows = [
      season("1", { season: "2025-26", minutes: 1000, totals: totals({ ast: 200, fga: 400, fg3a: 100 }) }),
      season("1", { season: "2026-27", minutes: 500, totals: totals({ ast: 100, fga: 100, fg3a: 50 }), name: "Demo Renamed", team: "NYK" }),
    ];
    const p = combinePlayers(rows).get("1");
    expect(p?.minutes).toBe(1500);
    expect(p?.rates.ast36).toBeCloseTo((300 * 36) / 1500, 12);
    expect(p?.rates.fg3Rate).toBeCloseTo(150 / 500, 12);
    expect(p).toMatchObject({ name: "Demo Renamed", team: "NYK", group: "G" });
  });

  it("has a zero 3-point share for a player with no shots, not NaN", () => {
    expect(combinePlayers([season("1")]).get("1")?.rates.fg3Rate).toBe(0);
  });
});

/** An invented league: point guards pass, shooting guards shoot. */
function guardLeague(n: number): { players: Map<string, CombinedPlayer>; labels: Array<{ playerId: string; primary: DvpPosition }> } {
  const random = rng(5);
  const rows: PlayerSeasonFeatures[] = [];
  const labels: Array<{ playerId: string; primary: DvpPosition }> = [];
  for (let i = 0; i < n; i += 1) {
    const point = i % 2 === 0;
    const minutes = 1800;
    const ast36 = (point ? 7 : 3) + (random() - 0.5) * 3;
    const pts36 = (point ? 14 : 19) + (random() - 0.5) * 4;
    rows.push(season(`g${i}`, { minutes, totals: totals({ ast: (ast36 * minutes) / 36, pts: (pts36 * minutes) / 36, tov: 60, stl: 50, reb: 200, fga: 600, fg3a: point ? 200 : 330, fta: 150 }) }));
    labels.push({ playerId: `g${i}`, primary: point ? "PG" : "SG" });
  }
  return { players: combinePlayers(rows), labels };
}

describe("trainGroup", () => {
  const { players, labels } = guardLeague(120);
  const trained = trainGroup("G", players, labels) as GroupModel;

  it("measures held-out accuracy, and the precision and coverage at each threshold", () => {
    expect(trained.validation).toMatchObject({ group: "G", classes: ["PG", "SG"], trained: 120 });
    expect(trained.validation.classCounts).toEqual({ PG: 60, SG: 60 });
    expect(trained.validation.outOfFoldAccuracy).toBeGreaterThan(0.9);
    expect(trained.validation.thresholds.map((t) => t.threshold)).toEqual([0.7, 0.75, 0.8, 0.85, 0.9]);
  });

  it("sets the proposal threshold at the smallest one that reaches the required held-out precision on enough players", () => {
    const { assignThreshold, thresholds } = trained.validation;
    expect(assignThreshold).not.toBeNull();
    const row = thresholds.find((t) => t.threshold === assignThreshold);
    expect(row?.n).toBeGreaterThanOrEqual(REQUIRED_HELD_OUT);
    expect(row?.precision).toBeGreaterThanOrEqual(REQUIRED_PRECISION);
    const earlier = thresholds.filter((t) => t.threshold < (assignThreshold ?? 0));
    expect(earlier.every((t) => t.n < REQUIRED_HELD_OUT || (t.precision ?? 0) < REQUIRED_PRECISION)).toBe(true);
    expect(trained.validation.highThreshold === null || trained.validation.highThreshold >= (assignThreshold ?? 0)).toBe(true);
    expect(HIGH_PRECISION).toBeGreaterThan(REQUIRED_PRECISION);
  });

  it("trains only on players ESPN lists in the group, with enough minutes, and a label the group allows", () => {
    const mixed = combinePlayers([
      ...[...players.values()].map((p) => season(p.playerId, { minutes: p.minutes, totals: totals({ ast: (p.rates.ast36 * p.minutes) / 36, pts: (p.rates.pts36 * p.minutes) / 36, fga: 600, fg3a: p.rates.fg3Rate * 600 }) })),
      season("forward", { espnPositions: { F: 60 } }),
      season("tiny", { minutes: MIN_MINUTES - 1 }),
    ]);
    const result = trainGroup("G", mixed, [...labels, { playerId: "forward", primary: "SG" }, { playerId: "tiny", primary: "PG" }, { playerId: "wing", primary: "SF" }]);
    expect(result?.validation.trained).toBe(120);
  });

  it("refuses to fit a group with too few labelled players in a class", () => {
    expect(trainGroup("G", players, labels.slice(0, 10))).toBeNull();
    expect(trainGroup("F", players, labels)).toBeNull();
  });

  it("finds no threshold on pure noise, so nothing would be proposed", () => {
    const random = rng(99);
    const rows = Array.from({ length: 100 }, (_, i) => season(`n${i}`, { totals: totals({ ast: random() * 300, pts: random() * 600, tov: random() * 100, stl: random() * 80, reb: random() * 300, fga: 500, fg3a: random() * 400, fta: random() * 200 }) }));
    const noiseLabels = rows.map((r, i): { playerId: string; primary: DvpPosition } => ({ playerId: r.playerId, primary: random() > 0.5 && i >= 0 ? "PG" : "SG" }));
    expect(trainGroup("G", combinePlayers(rows), noiseLabels)?.validation.assignThreshold).toBeNull();
  });
});

describe("propose", () => {
  const { players, labels } = guardLeague(120);
  const models = { G: trainGroup("G", players, labels) as GroupModel };
  const player = (over: Partial<CombinedPlayer> & { ast36?: number; pts36?: number }): CombinedPlayer => {
    const base = [...players.values()][0];
    const { ast36, pts36, ...rest } = over;
    return { ...base, ...rest, rates: { ...base.rates, ...(ast36 === undefined ? {} : { ast36 }), ...(pts36 === undefined ? {} : { pts36 }) } };
  };

  it("proposes a position, with the evidence, when the model is confident and its threshold was validated", () => {
    const result = propose(player({ playerId: "x", minutes: 2000, ast36: 9, pts36: 12, rates: undefined as never }), models);
    expect(result).toMatchObject({ status: "proposed", best: "PG" });
    expect(result.confidence === "high" || result.confidence === "medium").toBe(true);
    expect(result.probability).toBeGreaterThanOrEqual(models.G.validation.assignThreshold ?? 1);
    expect(result.evidence).toMatch(/out-of-fold precision.*95% lower bound.*players whose positions are already known/);
    expect(result.evidence).toMatch(/AST\/36|PTS\/36/);
  });

  it("leaves a borderline player unassigned but shows the best guess and why", () => {
    // Blend a typical point guard's rates with a typical shooting guard's: the middle of the blend is the hard case.
    const [pg, sg] = [players.get("g0") as CombinedPlayer, players.get("g1") as CombinedPlayer];
    const blend = (a: number): CombinedPlayer => ({ ...pg, playerId: "x", minutes: 2000, rates: Object.fromEntries(Object.keys(pg.rates).map((k) => [k, a * pg.rates[k as keyof typeof pg.rates] + (1 - a) * sg.rates[k as keyof typeof sg.rates]])) as CombinedPlayer["rates"] });
    const sweep = Array.from({ length: 101 }, (_, i) => propose(blend(i / 100), models));
    const borderline = sweep.find((r) => r.status === "unassigned");
    expect(borderline).toBeDefined();
    expect(borderline?.confidence).toBeNull();
    expect(borderline?.best).not.toBeNull();
    expect(borderline?.probability).toBeLessThan(models.G.validation.assignThreshold ?? 0);
    expect(borderline?.evidence).toMatch(/below the .* threshold/);
    expect(sweep[0].status).toBe("proposed");
    expect(sweep[100].status).toBe("proposed");
  });

  it("never proposes outside the two classes ESPN's listing allows", () => {
    for (const ast36 of [0, 3, 6, 9, 14]) expect(["PG", "SG"]).toContain(propose(player({ playerId: "x", minutes: 2000, ast36 }), models).best);
  });

  it("proposes nothing for a center, a player with no guard or forward listing, or too few minutes", () => {
    const none = propose(player({ playerId: "c", group: null }), models);
    expect(none).toMatchObject({ status: "unassigned", best: null, probability: null });
    expect(none.evidence).toMatch(/ESPN lists no guard or forward/);
    const tiny = propose(player({ playerId: "t", minutes: MIN_MINUTES - 1 }), models);
    expect(tiny).toMatchObject({ status: "unassigned", best: null });
    expect(tiny.evidence).toMatch(/noise/);
  });

  it("says so when no model could be fit for the group", () => {
    const result = propose(player({ playerId: "f", group: "F", minutes: 2000 }), models);
    expect(result).toMatchObject({ status: "unassigned", best: null });
    expect(result.evidence).toMatch(/too few labelled forwards/);
  });

  it("does not propose when the group's model never reached the required held-out precision", () => {
    const weak: GroupModel = { ...models.G, validation: { ...models.G.validation, assignThreshold: null, highThreshold: null } };
    const result = propose(player({ playerId: "x", minutes: 2000, ast36: 12 }), { G: weak });
    expect(result.status).toBe("unassigned");
    expect(result.evidence).toMatch(/never reached/);
  });

  it("exposes the group definitions it trains on", () => {
    expect(GROUPS.G.classes).toEqual(["PG", "SG"]);
    expect(GROUPS.F.classes).toEqual(["SF", "PF"]);
  });
});
