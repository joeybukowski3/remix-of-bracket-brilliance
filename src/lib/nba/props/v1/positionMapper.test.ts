import { describe, expect, it } from "vitest";
import type { PlayerSeasonSummary } from "./hooprAdapter";
import { parsePositionEstimates } from "./positionEstimates";
import { buildPositionFiles, indexWikidataSnapshot, overridesFileSchema, ROLE_MIN_GAMES_FOR_STARTER, ROLE_ROTATION_MINUTES, ROLE_STARTER_SHARE } from "./positionMapper";

type Stmt = { positionQid: string; rank?: "preferred" | "normal" | "deprecated"; seasons?: unknown[]; teamQids?: string[]; end?: string | null };
const PG = "Q212413", SG = "Q273199", SF = "Q308879", PF = "Q462471", C = "Q222052";

const item = (qid: string, espnIds: string[], positions: Stmt[]) => ({
  qid,
  ids: { espn: espnIds.map((value) => ({ value, rank: "normal" as "normal" | "deprecated" | "preferred" })) },
  positions: positions.map((s) => ({ positionQid: s.positionQid, rank: s.rank ?? "normal", qualifiers: { seasons: s.seasons ?? [], teamQids: s.teamQids ?? [], end: s.end ?? null } })),
});
const provenance = { retrievedAtUtc: "2026-10-23T14:48:10.264Z", restrictedToItems: null as string[] | null, vocabularyIssues: [] as string[] };
const snapshot = (players: ReturnType<typeof item>[], over: Partial<typeof provenance> = {}) => ({ schemaVersion: "wikidata-positions-snapshot-v1", provenance: { ...provenance, ...over }, players });
const index = (players: ReturnType<typeof item>[]) => indexWikidataSnapshot(snapshot(players));
const FORWARD = "Q10498241", SWINGMAN = "Q2302133";

const player = (id: string, over: Partial<PlayerSeasonSummary> = {}): PlayerSeasonSummary => ({
  season: "2026-27", playerId: id, name: `Demo Player ${id}`, team: "BOS", games: 10, starts: 8, minutes: 300, espnPositions: { G: 10 }, ...over,
});
const map = (players: PlayerSeasonSummary[], wikidata: ReturnType<typeof index>, overrides?: Parameters<typeof buildPositionFiles>[0]["overrides"]) =>
  buildPositionFiles({ players, wikidata, overrides, asOfUtc: "2026-10-23T19:09:16Z" });
const entryOf = (result: ReturnType<typeof map>, season: "2025-26" | "2026-27", id: string) => (result.files[season] as { players: Array<Record<string, unknown>> } | undefined)?.players.find((p) => p.playerId === id);

describe("indexWikidataSnapshot", () => {
  it("keeps career-level five-position labels only, by QID, in PG..C order", () => {
    const idx = index([item("Q1", ["10"], [{ positionQid: C }, { positionQid: PG }, { positionQid: "Q25075" }, { positionQid: "Q10498241" }])]);
    expect(idx.byEspnId.get("10")).toEqual({ qid: "Q1", positions: ["PG", "C"], scoped: [], hybrid: ["forward"] });
  });

  it("ignores deprecated, season-scoped, team-scoped and end-dated statements", () => {
    const idx = index([
      item("Q1", ["10"], [{ positionQid: PG, rank: "deprecated" }, { positionQid: SG, seasons: [{}] }, { positionQid: SF, teamQids: ["Q9"] }, { positionQid: PF, end: "2019-06-30" }, { positionQid: C }]),
    ]);
    expect(idx.byEspnId.get("10")?.positions).toEqual(["C"]);
  });

  it("leaves out an ESPN id carried by two items instead of picking one", () => {
    const idx = index([item("Q1", ["10"], [{ positionQid: PG }]), item("Q2", ["10"], [{ positionQid: C }])]);
    expect(idx.byEspnId.has("10")).toBe(false);
    expect(idx.ambiguousIds.has("10")).toBe(true);
  });

  it("ignores a deprecated ESPN id and records the snapshot date", () => {
    const deprecated = { ...item("Q1", [], [{ positionQid: PG }]), ids: { espn: [{ value: "10", rank: "deprecated" as const }] } };
    const idx = index([deprecated]);
    expect(idx.byEspnId.has("10")).toBe(false);
    expect(idx.retrievedAtUtc).toBe("2026-10-23T14:48:10.264Z");
  });

  it("rejects a snapshot in an unexpected format", () => {
    expect(() => indexWikidataSnapshot({ schemaVersion: "other" })).toThrow();
  });

  it("refuses a sample snapshot: labels for a few items must not stand in for the population", () => {
    expect(() => indexWikidataSnapshot(snapshot([], { restrictedToItems: ["Q1"] }))).toThrow(/only a sample of items/);
  });

  it("refuses a snapshot whose vocabulary check failed", () => {
    expect(() => indexWikidataSnapshot(snapshot([], { vocabularyIssues: ["Q212413 label changed"] }))).toThrow(/vocabulary check failed.*Q212413 label changed/);
  });

  it("refuses a snapshot written before provenance carried those fields", () => {
    expect(() => indexWikidataSnapshot({ schemaVersion: "wikidata-positions-snapshot-v1", provenance: { retrievedAtUtc: "2026-10-23T14:48:10.264Z" }, players: [] })).toThrow();
  });

  it("refuses an unreadable retrieval date, which would silence the stale-snapshot warning, and a malformed item id", () => {
    expect(() => indexWikidataSnapshot(snapshot([], { retrievedAtUtc: "not a date" }))).toThrow();
    expect(() => index([item("=HYPERLINK(1)", ["10"], [{ positionQid: PG }])])).toThrow();
  });

  it("keeps scoped five-position labels and hybrid labels as weak evidence, apart from the career-level labels", () => {
    const idx = index([item("Q1", ["10"], [{ positionQid: SG, seasons: [{}] }, { positionQid: PF, end: "2019-06-30" }, { positionQid: SWINGMAN }, { positionQid: FORWARD }, { positionQid: PG, rank: "deprecated" }])]);
    expect(idx.byEspnId.get("10")).toEqual({ qid: "Q1", positions: [], scoped: ["SG", "PF"], hybrid: ["forward", "swingman"] });
  });
});

describe("primary position rules", () => {
  it("takes a single Wikidata label as the primary position", () => {
    const r = map([player("10")], index([item("Q1", ["10"], [{ positionQid: SG }])]));
    expect(entryOf(r, "2026-27", "10")).toMatchObject({ primary: "SG", secondary: [] });
    expect(r.report.seasons["2026-27"].bySource.wikidataSingle).toBe(1);
  });

  it("with several labels, ESPN's coarse listing picks the primary and the rest become secondary", () => {
    const labels = index([item("Q1", ["10"], [{ positionQid: SG }, { positionQid: SF }])]);
    expect(entryOf(map([player("10", { espnPositions: { G: 9, F: 1 } })], labels), "2026-27", "10")).toMatchObject({ primary: "SG", secondary: ["SF"] });
    expect(entryOf(map([player("10", { espnPositions: { F: 9 } })], labels), "2026-27", "10")).toMatchObject({ primary: "SF", secondary: ["SG"] });
  });

  it("when several labels survive the ESPN listing, the primary follows PG, SG, SF, PF, C order and is flagged", () => {
    const r = map([player("10")], index([item("Q1", ["10"], [{ positionQid: SG }, { positionQid: PG }])]));
    expect(entryOf(r, "2026-27", "10")).toMatchObject({ primary: "PG", secondary: ["SG"] });
    expect(String(entryOf(r, "2026-27", "10")?.note)).toMatch(/primary chosen by PG, SG, SF, PF, C order/);
    expect(r.report.seasons["2026-27"].bySource.wikidataMultiPrimaryChosen).toBe(1);
  });

  it("keeps Wikidata's label when ESPN's coarse listing differs, and flags it instead of dropping the player", () => {
    const r = map([player("10", { espnPositions: { G: 10 } })], index([item("Q1", ["10"], [{ positionQid: SF }])]));
    expect(entryOf(r, "2026-27", "10")).toMatchObject({ primary: "SF" });
    expect(String(entryOf(r, "2026-27", "10")?.note)).toMatch(/ESPN's coarse listing differs/);
    expect(r.report.seasons["2026-27"].bySource.wikidataOverEspn).toBe(1);
  });

  it("labels a player with no Wikidata label directly from ESPN only when ESPN names one position", () => {
    const empty = index([]);
    expect(entryOf(map([player("10", { espnPositions: { C: 10 } })], empty), "2026-27", "10")).toMatchObject({ primary: "C", note: expect.stringContaining("ESPN lists C") });
    expect(entryOf(map([player("11", { espnPositions: { PF: 3, F: 1 } })], empty), "2026-27", "11")).toMatchObject({ primary: "PF" });
  });

  it("never guesses PG vs SG or SF vs PF: a player ESPN lists only as G or F, with no Wikidata label, stays unclassified", () => {
    const r = map([player("10", { espnPositions: { G: 10 } }), player("11", { espnPositions: { F: 10 } }), player("12", { espnPositions: {} })], index([]));
    expect(r.files["2026-27"]).toBeUndefined();
    expect(Object.values(r.report.seasons["2026-27"].unclassified)).toEqual([3]);
    expect(Object.keys(r.report.seasons["2026-27"].unclassified)[0]).toMatch(/PG vs SG, SF vs PF would be a guess/);
  });

  it("does not use an ESPN id that matches two Wikidata items, except through ESPN's own single listing", () => {
    const ambiguous = index([item("Q1", ["10"], [{ positionQid: PG }]), item("Q2", ["10"], [{ positionQid: C }])]);
    const unlabelled = map([player("10", { espnPositions: { G: 5 } })], ambiguous);
    expect(entryOf(unlabelled, "2026-27", "10")).toBeUndefined();
    expect(Object.keys(unlabelled.report.seasons["2026-27"].unclassified)[0]).toMatch(/^ESPN id matches two Wikidata items/);
    expect(entryOf(map([player("10", { espnPositions: { C: 5 } })], ambiguous), "2026-27", "10")).toMatchObject({ primary: "C" });
  });
});

describe("unclassified players carry evidence for review and are never classified from it", () => {
  const evidenceOf = (r: ReturnType<typeof map>, id: string) => r.unclassified.find((u) => u.summary.playerId === id)?.evidence;

  it("tells apart no item, an item with nothing, scoped-only and hybrid-only evidence", () => {
    const wikidata = index([
      item("Q2", ["20"], []),
      item("Q3", ["30"], [{ positionQid: SG, seasons: [{}] }, { positionQid: PG, teamQids: ["Q9"] }]),
      item("Q4", ["40"], [{ positionQid: SWINGMAN }]),
      item("Q5", ["50"], [{ positionQid: PG }]),
      item("Q6", ["60"], [{ positionQid: PG }]),
      item("Q7", ["60"], [{ positionQid: C }]),
    ]);
    const r = map(["10", "20", "30", "40", "60"].map((id) => player(id)), wikidata);
    expect(evidenceOf(r, "10")).toEqual({ kind: "no-wikidata-item", qid: null, scopedCandidates: [], hybridLabels: [] });
    expect(evidenceOf(r, "20")).toEqual({ kind: "item-without-position", qid: "Q2", scopedCandidates: [], hybridLabels: [] });
    expect(evidenceOf(r, "30")).toEqual({ kind: "scoped-label-only", qid: "Q3", scopedCandidates: ["PG", "SG"], hybridLabels: [] });
    expect(evidenceOf(r, "40")).toEqual({ kind: "hybrid-label-only", qid: "Q4", scopedCandidates: [], hybridLabels: ["swingman"] });
    expect(evidenceOf(r, "60")).toMatchObject({ kind: "ambiguous-wikidata-id", qid: null });
  });

  it("applies none of it: a player with only weak evidence has no position in the files", () => {
    const wikidata = index([item("Q3", ["30"], [{ positionQid: SG, seasons: [{}] }]), item("Q4", ["40"], [{ positionQid: SWINGMAN }])]);
    const r = map([player("30"), player("40")], wikidata);
    expect(entryOf(r, "2026-27", "30")).toBeUndefined();
    expect(entryOf(r, "2026-27", "40")).toBeUndefined();
    expect(r.unclassified).toHaveLength(2);
  });

  it("does not list a player ESPN's own single listing classified, or a manual override", () => {
    const r = map([player("10", { espnPositions: { C: 10 } }), player("20")], index([]), [{ season: "2026-27", playerId: "20", primary: "PG", secondary: [], reason: "starting point guard per team site" }]);
    expect(r.unclassified).toEqual([]);
  });

  it("lists one entry per player-season, with the season's own summary", () => {
    const r = map([player("10", { season: "2025-26", minutes: 700 }), player("10", { minutes: 90 })], index([]));
    expect(r.unclassified.map((u) => [u.summary.season, u.summary.minutes]).sort()).toEqual([["2025-26", 700], ["2026-27", 90]]);
  });
});

describe("roles", () => {
  const labels = index([item("Q1", ["10"], [{ positionQid: PG }])]);
  const roleOf = (over: Partial<PlayerSeasonSummary>) => entryOf(map([player("10", over)], labels), "2026-27", "10")?.role;

  it("does not call one start in one game a starting role", () => {
    expect(ROLE_MIN_GAMES_FOR_STARTER).toBe(3);
    expect(roleOf({ games: 1, starts: 1, minutes: 30 })).toBe("rotation");
    expect(roleOf({ games: 2, starts: 2, minutes: 10 })).toBe("bench");
    expect(roleOf({ games: 3, starts: 2, minutes: 90 })).toBe("starter");
  });

  it("is a starter at half the games started or more, a rotation player at 12 minutes a game, otherwise bench", () => {
    expect(ROLE_STARTER_SHARE).toBe(0.5);
    expect(ROLE_ROTATION_MINUTES).toBe(12);
    expect(roleOf({ games: 10, starts: 5 })).toBe("starter");
    expect(roleOf({ games: 10, starts: 4, minutes: 120 })).toBe("rotation");
    expect(roleOf({ games: 10, starts: 4, minutes: 119 })).toBe("bench");
  });
});

describe("seasons, coverage and the files themselves", () => {
  const labels = index([item("Q1", ["10"], [{ positionQid: PG }]), item("Q2", ["20"], [{ positionQid: C }])]);
  const players = [player("10", { minutes: 300 }), player("20", { minutes: 100, espnPositions: { C: 10 } }), player("30", { minutes: 100 }), player("10", { season: "2025-26", minutes: 800 })];
  const result = map(players, labels);

  it("writes one file per season, each holding only that season's players", () => {
    expect((result.files["2026-27"] as { players: unknown[] }).players).toHaveLength(2);
    expect((result.files["2025-26"] as { players: unknown[] }).players).toHaveLength(1);
    expect((result.files["2025-26"] as { season: string }).season).toBe("2025-26");
  });

  it("reports minutes coverage and the highest-minute unclassified players", () => {
    expect(result.report.seasons["2026-27"]).toMatchObject({ players: 3, classified: 2, minutesCoverage: 400 / 500 });
    expect(result.report.seasons["2026-27"].topUnclassified[0]).toMatchObject({ playerId: "30", minutes: 100 });
    expect(result.report.seasons["2025-26"].minutesCoverage).toBe(1);
  });

  it("produces files the V1 position loader accepts, marked estimated, with the sources and the career-level disclosure", () => {
    const estimates = parsePositionEstimates(result.files["2026-27"]);
    expect(estimates.map((e) => [e.playerId, e.primary, e.status])).toEqual([["10", "PG", "estimated"], ["20", "C", "estimated"]]);
    const note = estimates[0].sourceNote;
    expect(note).toContain("Wikidata (CC0, snapshot 2026-10-23)");
    expect(note).toMatch(/Not verified minutes at a position/);
    expect(note).toMatch(/same career-level label is applied to 2025-26 and 2026-27/);
    expect(note).toMatch(/No depth-chart source is available/);
  });
});

describe("manual overrides", () => {
  const labels = index([item("Q1", ["10"], [{ positionQid: PG }])]);

  it("replaces the estimate, requires a reason, and is flagged by the V1 loader", () => {
    const r = map([player("10")], labels, [{ season: "2026-27", playerId: "10", primary: "SG", secondary: ["PG"], reason: "plays off the ball next to a point guard" }]);
    const [estimate] = parsePositionEstimates(r.files["2026-27"]);
    expect(estimate).toMatchObject({ primary: "SG", secondary: ["PG"], overridden: true, basis: "manual-override" });
    expect(r.report.seasons["2026-27"].bySource.manualOverride).toBe(1);
    expect(r.report.overridesApplied).toBe(1);
  });

  it("can classify a player no source labels, but only a player that exists in the hoopR data", () => {
    const r = map([player("30", { espnPositions: { G: 10 } })], index([]), [{ season: "2026-27", playerId: "30", primary: "PG", secondary: [], reason: "starting point guard per team site" }]);
    expect(entryOf(r, "2026-27", "30")).toMatchObject({ primary: "PG" });
    expect(() => map([player("10")], labels, [{ season: "2026-27", playerId: "999", primary: "PG", secondary: [], reason: "someone not in the data" }])).toThrow(/identities are never invented/);
    expect(() => map([player("10")], labels, [{ season: "2025-26", playerId: "10", primary: "PG", secondary: [], reason: "wrong season for this player" }])).toThrow(/no such player/);
  });

  it("refuses two overrides for one player-season, and the overrides file needs a reason", () => {
    const twice = [{ season: "2026-27" as const, playerId: "10", primary: "SG" as const, secondary: [], reason: "first reason here" }, { season: "2026-27" as const, playerId: "10", primary: "PF" as const, secondary: [], reason: "second reason here" }];
    expect(() => map([player("10")], labels, twice)).toThrow(/two overrides/);
    expect(overridesFileSchema.safeParse({ schemaVersion: "jkb-position-overrides-v1", overrides: [{ season: "2026-27", playerId: "10", primary: "PG", reason: "" }] }).success).toBe(false);
  });
});
