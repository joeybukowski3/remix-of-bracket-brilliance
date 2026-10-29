/**
 * Alternate-line ladders and source-level line detail on the private board. Invented books, players, prices and event; the
 * provider payload goes through the real Odds API normalizer and the real capture builder, with no network or credential.
 *
 * A book that posts several distinct lines for one player and market in one capture is posting a ladder of alternate
 * thresholds. The provider labels none of them as the main line (every rung carries the same market key), so none is chosen:
 * the book does not vote, and the board says so.
 */
import { describe, expect, it } from "vitest";
import { FRESH, boardWith, book, captureOf, type Prop } from "../__fixtures__/capturedLines";
import { fixtureName } from "../__fixtures__/v1Fixtures";
import { containsPrivateData } from "../propsBoard";
import { ALTERNATE_LADDER_REASON, ALTERNATE_ONLY_REASON } from "./privateLines";

const player = fixtureName("BOS", 3);
const one = (point: number, over = -110, under = -110): Prop[] => [{ player, point, over, under }];
const LADDER_OVER = [-230, -180, -135, 115, 140, 175];
const LADDER_UNDER = [170, 135, 105, -150, -185, -240];
const ladder = (points: readonly number[]): Prop[] => points.map((point, i) => ({ player, point, over: LADDER_OVER[i % 6], under: LADDER_UNDER[i % 6] }));
const entryOf = (artifact: ReturnType<typeof boardWith>["artifact"]) => artifact.entries.find((e) => e.playerName === player && e.market === "pts");

describe("an alternate-line ladder never votes for the main line", () => {
  // Two real books disagree (14.5 vs 16.5); the ladder's first rung (16.5) would have broken the tie in its favour.
  const capture = captureOf([book("booka", one(14.5)), book("bookb", one(16.5)), book("ladderbook", ladder([16.5, 17.5, 18.5]))]);
  const { artifact, report } = boardWith([capture]);

  it("leaves the ladder out of the vote, so the two real books tie and the tie rule decides", () => {
    expect(entryOf(artifact)?.line).toMatchObject({ line: 14.5, sportsbook: "booka" });
  });

  it("does not pick a rung because of its position in the ladder, whichever order the provider lists it", () => {
    for (const rungs of [[16.5, 17.5, 18.5], [18.5, 17.5, 16.5], [17.5, 16.5, 18.5]]) {
      const shuffled = captureOf([book("booka", one(14.5)), book("bookb", one(16.5)), book("ladderbook", ladder(rungs))]);
      expect(entryOf(boardWith([shuffled]).artifact)?.line?.line).toBe(14.5);
    }
  });

  it("reports every ladder line as unmatched with the reason, and keeps retrieved = matched + unmatched", () => {
    expect(report.lines).toMatchObject({ linesRetrieved: 5, matched: 2, displayed: 1 });
    expect(report.lines?.unmatched).toHaveLength(3);
    expect(report.lines?.unmatched.every((u) => u.bookmaker === "ladderbook" && u.reason === ALTERNATE_LADDER_REASON)).toBe(true);
    expect((report.lines?.matched ?? 0) + (report.lines?.unmatched.length ?? 0)).toBe(report.lines?.linesRetrieved);
  });

  it("records the excluded book and every rung it posted on the entry, so nothing is lost", () => {
    expect(entryOf(artifact)?.lineDetail?.excluded).toEqual([{ sportsbook: "ladderbook", lines: [16.5, 17.5, 18.5], reason: ALTERNATE_LADDER_REASON }]);
  });

  it("shows no line, and says why, when a ladder is all a player has", () => {
    const only = captureOf([book("ladderbook", ladder([12.5, 13.5, 14.5, 15.5]))]);
    const entry = entryOf(boardWith([only]).artifact);
    expect(entry).toMatchObject({ line: null, lineWithheldReason: ALTERNATE_ONLY_REASON });
    expect(entry?.lineDetail).toMatchObject({ books: [], excluded: [{ sportsbook: "ladderbook", lines: [12.5, 13.5, 14.5, 15.5] }] });
  });

  it("does not mistake a line that moved between two captures for a ladder", () => {
    const early = captureOf([book("booka", one(14.5), "2026-10-24T19:55:00Z")], { capturedAtUtc: "2026-10-24T20:00:00Z" });
    const late = captureOf([book("booka", one(15.5))], { capturedAtUtc: "2026-10-24T20:30:00Z" });
    const { artifact: moved, report: movedReport } = boardWith([early, late]);
    expect(entryOf(moved)?.line?.line).toBe(15.5);
    expect(movedReport.lines?.unmatched).toEqual([]);
    expect(entryOf(moved)?.lineDetail?.excluded).toEqual([]);
  });
});

describe("a book is judged by its newest capture, so an older capture can neither vote against a newer ladder nor be excluded by it", () => {
  const T1 = { capturedAtUtc: "2026-10-24T20:00:00Z" };
  const T2 = { capturedAtUtc: "2026-10-24T20:30:00Z" };
  const old = (point: number) => book("booka", one(point), "2026-10-24T19:55:00Z");

  it("drops a book's older single line when its newest capture is a ladder, and lists the book as excluded", () => {
    const early = captureOf([old(22.5), book("bookb", one(14.5), "2026-10-24T19:55:00Z")], T1);
    const late = captureOf([book("booka", ladder([20.5, 22.5, 24.5]))], T2);
    const entry = entryOf(boardWith([early, late]).artifact);
    expect(entry?.lineDetail?.books.map((b) => b.sportsbook)).toEqual(["bookb"]);
    expect(entry?.lineDetail?.excluded.map((x) => x.sportsbook)).toEqual(["booka"]);
    expect(entry?.line?.line).toBe(14.5);
  });

  it("uses a book's newer single line over its older ladder, and no longer lists the book as excluded", () => {
    const early = captureOf([book("booka", ladder([20.5, 22.5, 24.5]), "2026-10-24T19:55:00Z")], T1);
    const late = captureOf([old(22.5)], T2);
    const entry = entryOf(boardWith([early, late]).artifact);
    expect(entry?.lineDetail?.books.map((b) => [b.sportsbook, b.line])).toEqual([["booka", 22.5]]);
    expect(entry?.lineDetail?.excluded).toEqual([]);
  });
});

describe("source-level lines and the reason one was shown", () => {
  const capture = captureOf([
    book("booka", one(14.5, -120, 100), "2026-10-24T20:10:00Z"),
    book("bookb", one(14.5, -105, -115), "2026-10-24T20:25:00Z"),
    book("bookc", one(15.5, 110, -130), FRESH),
  ]);
  const { artifact } = boardWith([capture]);
  const entry = entryOf(artifact);

  it("keeps every voting book's own line, prices, provider update time and capture time", () => {
    expect(entry?.lineDetail?.books).toEqual([
      expect.objectContaining({ sportsbook: "booka", line: 14.5, overPrice: -120, underPrice: 100, sourceLastUpdateUtc: "2026-10-24T20:10:00.000Z", role: "voted" }),
      expect.objectContaining({ sportsbook: "bookb", line: 14.5, overPrice: -105, underPrice: -115, sourceLastUpdateUtc: "2026-10-24T20:25:00.000Z", role: "shown" }),
      expect.objectContaining({ sportsbook: "bookc", line: 15.5, overPrice: 110, underPrice: -130, role: "voted" }),
    ]);
    expect(entry?.lineDetail?.books.every((b) => typeof b.capturedAtUtc === "string")).toBe(true);
  });

  it("shows one book's line together with that same book's prices, never a blend of books", () => {
    const shown = entry?.lineDetail?.books.find((b) => b.role === "shown");
    expect(entry?.line).toMatchObject({ sportsbook: shown?.sportsbook, line: shown?.line, overPrice: shown?.overPrice, underPrice: shown?.underPrice });
    expect(entry?.lineDetail?.books.filter((b) => b.role === "shown")).toHaveLength(1);
  });

  it("states how the line was selected, in words a reviewer can check", () => {
    expect(entry?.lineDetail?.selection).toMatch(/14\.5/);
    expect(entry?.lineDetail?.selection).toMatch(/2 of 3/);
    expect(entry?.lineDetail?.selection).toMatch(/bookb/);
    expect(entry?.lineDetail?.selection).toMatch(/most recent/);
  });

  it("names the tie rule when the vote is split", () => {
    const split = captureOf([book("booka", one(14.5)), book("bookb", one(16.5))]);
    expect(entryOf(boardWith([split]).artifact)?.lineDetail?.selection).toMatch(/tie/i);
  });

  it("marks a board that carries line detail as private, so the public page refuses it", () => {
    expect(containsPrivateData({ ...artifact, privatePreview: undefined, opponentRecent: undefined, opponentBoxScores: undefined, entries: artifact.entries.map((e) => ({ ...e, seasonStats: undefined })) })).toBe(true);
  });

  it("has no line detail on an entry with no captured line", () => {
    const bare = artifact.entries.find((e) => e.line === null);
    expect(bare?.lineDetail).toBeUndefined();
  });
});
