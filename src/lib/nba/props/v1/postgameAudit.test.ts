/**
 * Postgame audit of a pregame board against its captured lines and the final box score. Invented players, lines and scores,
 * checked against hand-computed figures; no network, credential or real data.
 *
 * Error = projection (or line) minus actual, so a positive number is an over-prediction.
 */
import { describe, expect, it } from "vitest";
import { boardWith, book, captureOf } from "../__fixtures__/capturedLines";
import { FIXTURE_GAME_KEY, fixtureName } from "../__fixtures__/v1Fixtures";
import type { BoardEntry } from "../propsBoard";
import { AuditLookaheadError, auditGame, type AuditInput, type FinalBoxRow } from "./postgameAudit";

const GAME = "2026-10-28|AAA@BBB";
const TIPOFF = "2026-10-29T00:10:00Z";
const BUILT = "2026-10-28T20:44:19Z";
const CAPTURED = "2026-10-28T20:43:31Z";
const RETRIEVED = "2026-10-29T12:28:27Z";

const entry = (name: string, team: string, proj: number, minutes: number, line: number | null): BoardEntry => ({
  entryKey: `${GAME}|${name}|pts|private`, playerName: name, team, opponent: team === "AAA" ? "BBB" : "AAA", gameKey: GAME, tipoffUtc: TIPOFF, positionLabel: null, market: "pts",
  line: line === null ? null : { sportsbook: "bookx", line, overPrice: -110, underPrice: -110, capturedAtUtc: CAPTURED, freshness: "fresh", ageMinutes: 1 },
  lineWithheldReason: line === null ? "no sportsbook line captured for this player and market" : null,
  projection: { value: proj, minutes, modelVersion: "nba-props-baseline-v0" }, projectionUnavailableReason: null,
});

const row = (name: string, team: string, minutes: number, points: number, over: Partial<FinalBoxRow> = {}): FinalBoxRow => ({ gameKey: GAME, team, playerId: `id-${name}`, playerName: name, minutes, points, didNotPlay: false, started: false, ...over });

/** Two full 240-minute teams: the named rows plus a filler row that makes each team complete. */
const fullBox = (rows: FinalBoxRow[]): FinalBoxRow[] => {
  const filler = (team: string) => row(`Filler ${team}`, team, 240 - rows.filter((r) => r.team === team && !r.didNotPlay).reduce((s, r) => s + r.minutes, 0), 0);
  return [...rows, filler("AAA"), filler("BBB")];
};

const entries = [
  entry("Player A", "AAA", 20, 30, 18.5),
  entry("Player B", "AAA", 12, 24, 13.5),
  entry("Player C", "BBB", 15, 30, 14.5),
  entry("Player D", "BBB", 8, 20, null),
  entry("Player E", "BBB", 5, 15, null),
  entry("Player F", "AAA", 9, 20, null),
];
const box = fullBox([
  row("Player A", "AAA", 25, 10, { started: true }),
  row("Player B", "AAA", 28, 16),
  row("Player C", "BBB", 30, 15, { started: true }),
  row("Player D", "BBB", 18, 6),
  row("Player F", "AAA", 0, 0, { didNotPlay: true }),
]);
const base = (over: Partial<AuditInput> = {}): AuditInput => ({ gameKey: GAME, board: { generatedAtUtc: BUILT, entries }, captures: [], box, boxRetrievedAtUtc: RETRIEVED, ...over });

describe("the audit measures projections and lines against the final box score", () => {
  const report = auditGame(base());
  const a = report.players.find((p) => p.name === "Player A");

  it("computes per-player errors, rates and the minutes/rate split of the points error", () => {
    expect(a).toMatchObject({ status: "played", actPts: 10, actMin: 25, ptsErr: 10, lineErr: 8.5, minErr: 5, gap: 1.5, jkbSide: "Over", result: "Under", dirHit: false, jkbCloser: false });
    expect(a?.projPPM).toBeCloseTo(2 / 3, 10);
    expect(a?.actPPM).toBeCloseTo(0.4, 10);
    expect(a?.minutesEffect).toBeCloseTo(10 / 3, 10);
    expect(a?.rateEffect).toBeCloseTo(20 / 3, 10);
    expect((a?.minutesEffect ?? 0) + (a?.rateEffect ?? 0)).toBeCloseTo(a?.ptsErr ?? 0, 10);
  });

  it("summarizes MAE, signed bias, minutes error, line error and directional accuracy over the players with a line", () => {
    expect(report.matched).toMatchObject({ n: 3, dirHits: 1, dirN: 3, closer: 1 });
    expect(report.matched?.jkbMAE).toBeCloseTo(14 / 3, 10);
    expect(report.matched?.jkbME).toBeCloseTo(2, 10);
    expect(report.matched?.lineMAE).toBeCloseTo(11.5 / 3, 10);
    expect(report.matched?.lineME).toBeCloseTo(5.5 / 3, 10);
    expect(report.matched?.minMAE).toBeCloseTo(3, 10);
    expect(report.matched?.minME).toBeCloseTo(1 / 3, 10);
  });

  it("groups performance by the size of projection minus line", () => {
    expect(report.groups["<1"]).toMatchObject({ n: 1, dirHits: 1 });
    expect(report.groups["1-3"]).toMatchObject({ n: 2, dirHits: 0 });
    expect(report.groups[">=3"]).toBeNull();
  });

  it("lists players with no line, no box row, or a did-not-play row, and never counts them as errors", () => {
    expect(report.players.find((p) => p.name === "Player E")).toMatchObject({ status: "no-box-row", actPts: null, ptsErr: null });
    expect(report.players.find((p) => p.name === "Player F")).toMatchObject({ status: "dnp", actPts: null });
    expect(report.missing.map((m) => [m.name, m.status])).toEqual([["Player E", "no-box-row"], ["Player F", "dnp"]]);
    expect(report.allPlayed.n).toBe(4);
  });

  it("treats a result equal to the line as a push, outside the directional count", () => {
    const pushLine = auditGame(base({ board: { generatedAtUtc: BUILT, entries: entries.map((e) => (e.playerName === "Player C" ? entry("Player C", "BBB", 15, 30, 15) : e)) } }));
    expect(pushLine.players.find((p) => p.name === "Player C")).toMatchObject({ result: "Push", dirHit: null });
    expect(pushLine.matched).toMatchObject({ dirN: 2 });
  });

  it("warns that a sample this small proves nothing, and records the model version", () => {
    expect(report.warnings.join(" ")).toMatch(/sample of 3/);
    expect(report.modelVersions).toEqual(["nba-props-baseline-v0"]);
  });

  it("reports the final score from the box score and checks player ids and teams when ids are supplied", () => {
    expect(report.finalScore).toEqual({ AAA: 26, BBB: 21 });
    const ids = new Map([["player a", ["id-Player A"]], ["player b", ["someone-else"]]]);
    const checked = auditGame(base({ knownPlayerIds: ids }));
    expect(checked.players.find((p) => p.name === "Player A")?.identity).toMatchObject({ idMatches: true, teamMatches: true });
    expect(checked.players.find((p) => p.name === "Player B")?.identity).toMatchObject({ idMatches: false });
    expect(checked.warnings.join(" ")).toMatch(/Player B.*id/);
  });
});

describe("the audit refuses any input that could carry lookahead", () => {
  const refused = (over: Partial<AuditInput>, pattern: RegExp) => {
    expect(() => auditGame(base(over))).toThrow(AuditLookaheadError);
    expect(() => auditGame(base(over))).toThrow(pattern);
  };

  it("refuses a board built after tipoff", () => refused({ board: { generatedAtUtc: "2026-10-29T00:30:00Z", entries } }, /built after tipoff/));
  it("refuses model inputs cut off after the board was built", () => refused({ projectionInputCutoffUtc: "2026-10-28T21:00:00Z" }, /input cutoff/));
  it("refuses a displayed line captured after the board was built", () => {
    const late = entries.map((e) => (e.line ? { ...e, line: { ...e.line, capturedAtUtc: "2026-10-28T20:50:00Z" } } : e));
    refused({ board: { generatedAtUtc: BUILT, entries: late } }, /captured after the board/);
  });
  it("refuses a box score retrieved before tipoff", () => refused({ boxRetrievedAtUtc: "2026-10-28T23:00:00Z" }, /before tipoff/));
  it("refuses a box score that is not a complete game", () => refused({ box: box.filter((r) => r.playerName !== "Filler AAA") }, /not a complete game/));
  it("refuses a game that is not on the board or not in the box score", () => {
    refused({ gameKey: "2026-10-28|ZZZ@YYY" }, /not on the pregame board/);
    refused({ box: box.map((r) => ({ ...r, gameKey: "2026-10-28|OTH@ER" })) }, /not in the box score/);
  });
  it("does not change the board, captures or box rows it is given", () => {
    const frozen = JSON.stringify([entries, box]);
    auditGame(base());
    expect(JSON.stringify([entries, box])).toBe(frozen);
  });
});

describe("lookahead guards do not fail open on a missing or malformed timestamp", () => {
  const refused = (over: Partial<AuditInput>, pattern: RegExp) => expect(() => auditGame(base(over))).toThrow(pattern);

  it("refuses a malformed or missing board build time, box retrieval time or input cutoff", () => {
    refused({ board: { generatedAtUtc: "yesterday", entries } }, /board build time/);
    refused({ board: { generatedAtUtc: undefined as unknown as string, entries } }, /board build time/);
    refused({ boxRetrievedAtUtc: "" }, /box-score retrieval time/);
    refused({ boxRetrievedAtUtc: undefined as unknown as string }, /box-score retrieval time/);
    refused({ projectionInputCutoffUtc: "not a time" }, /input cutoff/);
  });

  it("refuses a displayed line whose capture time is malformed", () => {
    const bad = entries.map((e) => (e.line ? { ...e, line: { ...e.line, capturedAtUtc: "later" } } : e));
    refused({ board: { generatedAtUtc: BUILT, entries: bad } }, /capture time/);
  });

  it("warns, rather than silently skipping the check, when the build recorded no input cutoff", () => {
    expect(auditGame(base()).warnings.join(" ")).toMatch(/no model-input cutoff/);
    expect(auditGame(base({ projectionInputCutoffUtc: "2026-10-27T12:52:37Z" })).warnings.join(" ")).not.toMatch(/no model-input cutoff/);
  });
});

describe("a player the audit cannot score is reported, never dropped", () => {
  const noMinutes = entries.map((e) => (e.playerName === "Player D" ? { ...e, projection: { value: 8, minutes: null, modelVersion: "nba-props-baseline-v0" } } : e));
  const report = auditGame(base({ board: { generatedAtUtc: BUILT, entries: noMinutes } }));

  it("lists a player who played but had no projected minutes as unscorable, with a warning", () => {
    expect(report.players.find((p) => p.name === "Player D")).toMatchObject({ status: "unscorable", ptsErr: null });
    expect(report.missing.map((m) => [m.name, m.status])).toContainEqual(["Player D", "unscorable"]);
    expect(report.warnings.join(" ")).toMatch(/Player D.*no projected minutes/);
    expect(report.allPlayed.n).toBe(3);
  });

  it("warns when two box-score rows in one game share a normalized name, since matching is by name", () => {
    const twins = auditGame(base({ box: fullBox([row("Player A", "AAA", 25, 10), row("Player A", "BBB", 10, 3), row("Player B", "AAA", 28, 16), row("Player C", "BBB", 30, 15)]) }));
    expect(twins.warnings.join(" ")).toMatch(/two box-score rows.*player a/i);
  });
});

describe("the audit re-derives the displayed line from the immutable capture", () => {
  const player = fixtureName("BOS", 3);
  const capture = captureOf([book("booka", [{ player, point: 14.5 }]), book("bookb", [{ player, point: 14.5 }]), book("ladder", [{ player, point: 12.5 }, { player, point: 13.5 }, { player, point: 14.5 }])]);
  const { artifact } = boardWith([capture]);
  const realBox = (name: string, team: string): FinalBoxRow[] =>
    ["BOS", "NYK"].map((t) => row(t === team ? name : `Filler ${t}`, t, t === team ? 30 : 240, 12, { gameKey: FIXTURE_GAME_KEY, playerId: `id-${name}` })).concat(
      ["BOS", "NYK"].map((t) => row(`Rest ${t}`, t, t === team ? 210 : 0, 0, { gameKey: FIXTURE_GAME_KEY })),
    );
  const input = (board = artifact): AuditInput => ({ gameKey: FIXTURE_GAME_KEY, board: { generatedAtUtc: board.generatedAtUtc, entries: board.entries }, captures: [capture], box: realBox(player, "BOS"), boxRetrievedAtUtc: "2026-10-25T06:00:00Z" });

  it("agrees with the board and lists each voting book's own prices, excluding the ladder", () => {
    const report = auditGame(input());
    const p = report.players.find((x) => x.name === player && x.line !== null);
    expect(report.warnings.filter((w) => /differs/.test(w))).toEqual([]);
    expect(p?.bookLines.map((b) => b.sportsbook)).toEqual(["booka", "bookb"]);
    expect(p?.excludedBooks).toEqual([expect.objectContaining({ sportsbook: "ladder", lines: [12.5, 13.5, 14.5] })]);
  });

  it("ignores a capture taken after the board was built, and says so, so no later line enters the report", () => {
    const later = captureOf([book("late", [{ player, point: 20.5 }], "2026-10-24T21:20:00Z")], { capturedAtUtc: "2026-10-24T21:30:00Z" });
    const report = auditGame({ ...input(), captures: [capture, later] });
    expect(report.players.find((x) => x.name === player && x.line !== null)?.bookLines.map((b) => b.sportsbook)).toEqual(["booka", "bookb"]);
    expect(report.warnings.join(" ")).toMatch(/1 capture.* after the board was built/);
    expect(report.captureIds).toEqual([capture.captureId]);
  });

  it("flags a board whose displayed line the capture does not reproduce, and still scores the line that was displayed", () => {
    const tampered = { ...artifact, entries: artifact.entries.map((e) => (e.playerName === player && e.market === "pts" && e.line ? { ...e, line: { ...e.line, line: 99.5 } } : e)) };
    const report = auditGame(input(tampered));
    expect(report.warnings.join(" ")).toMatch(/differs from the line re-derived/);
    expect(report.players.find((x) => x.name === player && x.line !== null)?.line?.line).toBe(99.5);
  });
});
