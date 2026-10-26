import { describe, expect, it } from "vitest";
import { parseCsv } from "../pipeline/csv";
import type { PlayerSeasonSummary } from "./hooprAdapter";
import type { EvidenceKind, UnclassifiedPlayer } from "./positionMapper";
import { buildReviewList, overridesFromCsv, reviewListCsv, TOP_N_STEPS } from "./positionReview";

const player = (id: string, over: Partial<PlayerSeasonSummary> = {}): PlayerSeasonSummary => ({
  season: "2026-27", playerId: id, name: `Demo Player ${id}`, team: "BOS", games: 10, starts: 5, minutes: 300, espnPositions: { G: 10 }, ...over,
});
const unclassified = (summary: PlayerSeasonSummary, kind: EvidenceKind = "item-without-position", extra: Partial<UnclassifiedPlayer["evidence"]> = {}): UnclassifiedPlayer => ({
  summary, evidence: { kind, qid: kind === "no-wikidata-item" ? null : `Q${summary.playerId}`, scopedCandidates: [], hybridLabels: [], ...extra },
});

describe("buildReviewList: one prioritized entry per player", () => {
  const classified = player("1", { minutes: 1000 });
  const all = [classified, player("2", { minutes: 400 }), player("3", { minutes: 300 }), player("2", { season: "2025-26", minutes: 900 }), player("4", { minutes: 50, team: "LAL" })];
  const gaps = [unclassified(all[1]), unclassified(all[2]), unclassified(all[3]), unclassified(all[4])];
  const review = buildReviewList(gaps, all, new Set(["LAL"]));

  it("orders by minutes across both seasons, highest first, and numbers the priorities from 1", () => {
    expect(review.entries.map((e) => [e.priority, e.playerId])).toEqual([[1, "2"], [2, "3"], [3, "4"]]);
  });

  it("keeps each season's minutes and games apart", () => {
    expect(review.entries[0]).toMatchObject({ minutes: { "2026-27": 400, "2025-26": 900 }, games: { "2026-27": 10, "2025-26": 10 } });
  });

  it("marks only players with a 2026-27 season whose team plays on the slate", () => {
    expect(review.entries.map((e) => [e.playerId, e.onSlate])).toEqual([["2", false], ["3", false], ["4", true]]);
    const lastSeasonOnly = buildReviewList([unclassified(all[3])], all, new Set(["BOS"]));
    expect(lastSeasonOnly.entries[0].onSlate).toBe(false);
  });

  it("breaks minute ties by player id so the order is reproducible", () => {
    const a = player("9", { minutes: 100 }), b = player("8", { minutes: 100 });
    expect(buildReviewList([unclassified(a), unclassified(b)], [a, b]).entries.map((e) => e.playerId)).toEqual(["8", "9"]);
  });

  it("never lists a classified player", () => {
    expect(review.entries.some((e) => e.playerId === "1")).toBe(false);
  });

  it("hints at what ESPN's listing allows, and all five positions when ESPN lists nothing usable", () => {
    const g = player("5", { espnPositions: { G: 4, F: 1 } }), f = player("6", { espnPositions: { F: 2 } }), none = player("7", { espnPositions: { UNKNOWN: 3 } });
    const r = buildReviewList([unclassified(g), unclassified(f), unclassified(none)], [g, f, none]);
    const byId = Object.fromEntries(r.entries.map((e) => [e.playerId, e]));
    expect(byId["5"]).toMatchObject({ espnListing: "G", allowedByEspn: ["PG", "SG"] });
    expect(byId["6"]).toMatchObject({ espnListing: "F", allowedByEspn: ["SF", "PF"] });
    expect(byId["7"]).toMatchObject({ espnListing: "none", allowedByEspn: ["PG", "SG", "SF", "PF", "C"] });
  });
});

describe("buildReviewList: gap analysis per season", () => {
  const all = [
    player("1", { minutes: 600 }), player("2", { minutes: 200, espnPositions: { G: 1 } }), player("3", { minutes: 100, espnPositions: { F: 1 } }), player("4", { minutes: 100, espnPositions: { F: 1 } }),
    player("1", { season: "2025-26", minutes: 1000 }),
  ];
  const gaps = [
    unclassified(all[1], "item-without-position"),
    unclassified(all[2], "scoped-label-only", { scopedCandidates: ["SF"] }),
    unclassified(all[3], "hybrid-label-only", { hybridLabels: ["swingman"] }),
  ];
  const { analysis } = buildReviewList(gaps, all);
  const season = analysis["2026-27"];

  it("computes the unclassified share of the season's minutes", () => {
    expect(season).toMatchObject({ totalMinutes: 1000, unclassifiedPlayers: 3, unclassifiedMinutes: 400, unclassifiedMinutesShare: 0.4 });
  });

  it("splits the gap by evidence kind and by ESPN listing", () => {
    expect(season.byEvidence["item-without-position"]).toEqual({ players: 1, minutes: 200, minutesShare: 0.2 });
    expect(season.byEvidence["scoped-label-only"]).toMatchObject({ players: 1, minutes: 100 });
    expect(season.byEvidence["no-wikidata-item"]).toBeUndefined();
    expect(season.byEspnListing.G).toMatchObject({ players: 1, minutes: 200 });
    expect(season.byEspnListing.F).toMatchObject({ players: 2, minutes: 200 });
  });

  it("counts weak evidence (scoped or hybrid labels) separately, and applies none of it", () => {
    expect(season.weakEvidenceMinutesShare).toBe(0.2);
  });

  it("projects the coverage a top-N review would give, by this season's minutes", () => {
    expect(TOP_N_STEPS).toEqual([25, 50, 100]);
    expect(season.topN["25"]).toEqual({ gapClosedShare: 1, coverageWouldBe: 1 });
    expect(season.topN["100"].coverageWouldBe).toBe(1);
  });

  it("reports a season with no gap as fully covered, without dividing by zero", () => {
    expect(analysis["2025-26"]).toMatchObject({ unclassifiedPlayers: 0, unclassifiedMinutesShare: 0, weakEvidenceMinutesShare: 0 });
    expect(analysis["2025-26"].topN["25"]).toEqual({ gapClosedShare: 0, coverageWouldBe: 1 });
  });

  it("limits a top-N step to N players, highest minutes first", () => {
    const many = Array.from({ length: 30 }, (_, i) => player(`p${i}`, { minutes: 30 - i }));
    const r = buildReviewList(many.map((p) => unclassified(p)), many).analysis["2026-27"];
    const gap = many.reduce((s, p) => s + p.minutes, 0);
    const top25 = many.slice(0, 25).reduce((s, p) => s + p.minutes, 0);
    expect(r.topN["25"].gapClosedShare).toBeCloseTo(top25 / gap, 10);
    expect(r.topN["25"].coverageWouldBe).toBeCloseTo(top25 / gap, 10);
    expect(r.topN["50"].gapClosedShare).toBe(1);
  });
});

describe("reviewListCsv", () => {
  const entry = (name: string, hybrid: string[] = []) => {
    const p = player("7", { name });
    return buildReviewList([unclassified(p, hybrid.length ? "hybrid-label-only" : "item-without-position", { hybridLabels: hybrid })], [p], new Set(["BOS"])).entries;
  };

  it("has a header, the evidence columns, and blank primary, secondary and reason for the reviewer", () => {
    const [head, row] = parseCsv(reviewListCsv(entry("Demo Seven")));
    expect(head.slice(-3)).toEqual(["primary", "secondary", "reason"]);
    expect(head).toHaveLength(16);
    expect(row.slice(-3)).toEqual(["", "", ""]);
    expect(row.slice(0, 5)).toEqual(["1", "7", "Demo Seven", "BOS", "yes"]);
  });

  it("neutralizes a leading formula character in a name, so a spreadsheet never runs it", () => {
    for (const name of ["=HYPERLINK(\"http://x\")", "+1", "-1", "@SUM(A1)"]) {
      const row = parseCsv(reviewListCsv(entry(name)))[1];
      expect(row[2].startsWith("'")).toBe(true);
      expect(row[2]).toBe(`'${name}`);
    }
  });

  it("neutralizes every cell, including leading whitespace, not only the name and hybrid columns", () => {
    const p = player("7", { name: " =cmd()" });
    const entries = buildReviewList([unclassified(p, "scoped-label-only", { qid: "+Q7", scopedCandidates: ["PG"] })], [p]).entries;
    const row = parseCsv(reviewListCsv(entries))[1];
    expect(row[2]).toBe("' =cmd()");
    expect(row[10]).toBe("'+Q7");
  });

  it("neutralizes hybrid labels the same way, and quotes commas, quotes and newlines", () => {
    const row = parseCsv(reviewListCsv(entry("Demo, \"Seven\"\nJr.", ["=bad"])))[1];
    expect(row[2]).toBe("Demo, \"Seven\"\nJr.");
    expect(row[12]).toBe("'=bad");
  });

  it("writes only the header for an empty list", () => {
    expect(parseCsv(reviewListCsv([]))).toHaveLength(1);
  });
});

describe("overridesFromCsv", () => {
  const players = [player("1"), player("1", { season: "2025-26" }), player("2"), player("3", { season: "2025-26" })];
  const csv = (...rows: string[]) => `playerId,name,primary,secondary,reason\n${rows.join("\n")}\n`;

  it("turns a reviewed row into an override for every season the player has", () => {
    expect(overridesFromCsv(csv("1,Demo One,pg,SG|SF,starting point guard per team site"), players)).toEqual([
      { season: "2026-27", playerId: "1", primary: "PG", secondary: ["SG", "SF"], reason: "starting point guard per team site" },
      { season: "2025-26", playerId: "1", primary: "PG", secondary: ["SG", "SF"], reason: "starting point guard per team site" },
    ]);
  });

  it("skips rows with no primary, so an unreviewed list changes nothing", () => {
    expect(overridesFromCsv(csv("1,Demo One,,,", "2,Demo Two,,,"), players)).toEqual([]);
  });

  it("accepts the full review-list layout, with the filled columns last", () => {
    const text = `${reviewListCsv(buildReviewList([unclassified(players[2])], players).entries).trimEnd().replace(/,,,$/, ",C,,center per team site")}\n`;
    expect(overridesFromCsv(text, players)).toEqual([{ season: "2026-27", playerId: "2", primary: "C", secondary: [], reason: "center per team site" }]);
  });

  it("drops the primary from the secondary list, and splits on bars, slashes, commas and spaces", () => {
    const [o] = overridesFromCsv(csv('2,Demo Two,SF,"SF / PF, c",wing who defends bigs'), players);
    expect(o.secondary).toEqual(["PF", "C"]);
  });

  it("refuses a primary that is not one of the five positions", () => {
    expect(() => overridesFromCsv(csv("1,Demo One,G,,guard per team site"), players)).toThrow(/line 2: primary must be one of/);
    expect(() => overridesFromCsv(csv("1,Demo One,swingman,,wing per team site"), players)).toThrow(/primary must be one of/);
  });

  it("refuses a primary without a real reason", () => {
    expect(() => overridesFromCsv(csv("1,Demo One,PG,,"), players)).toThrow(/line 2: a primary needs a reason/);
    expect(() => overridesFromCsv(csv("1,Demo One,PG,,ok"), players)).toThrow(/reason of at least 5/);
  });

  it("refuses a secondary that is not a position", () => {
    expect(() => overridesFromCsv(csv("1,Demo One,PG,wing,starting point guard"), players)).toThrow(/secondary has a position/);
  });

  it("refuses an id that is not in the hoopR data, and never invents one", () => {
    expect(() => overridesFromCsv(csv("999,Nobody,PG,,not a player in the data"), players)).toThrow(/line 2: player 999 is not in the hoopR data/);
  });

  it("refuses a player listed twice, and reports the line of the repeat", () => {
    expect(() => overridesFromCsv(csv("1,Demo One,PG,,first reason here", "1,Demo One,SG,,second reason here"), players)).toThrow(/line 3: player 1 appears twice/);
  });

  it("fails the whole file on one bad row: nothing is half applied", () => {
    expect(() => overridesFromCsv(csv("1,Demo One,PG,,starting point guard", "2,Demo Two,XX,,bad position here"), players)).toThrow(/line 3/);
  });

  it("needs the playerId, primary and reason columns", () => {
    expect(() => overridesFromCsv("playerId,primary\n1,PG\n", players)).toThrow(/missing required column\(s\): reason/);
  });

  it("reads a spreadsheet export with a BOM and CRLF line ends", () => {
    const text = `${String.fromCharCode(0xfeff)}playerId,primary,reason\r\n3,SF,small forward per team site\r\n`;
    expect(overridesFromCsv(text, players)).toEqual([{ season: "2025-26", playerId: "3", primary: "SF", secondary: [], reason: "small forward per team site" }]);
  });
});
