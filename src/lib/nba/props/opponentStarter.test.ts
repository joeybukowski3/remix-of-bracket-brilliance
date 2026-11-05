import { describe, expect, it } from "vitest";
import type { DvpPosition } from "./dvpPositions";
import { matchStarter, teamPointsAllowed, teamPointsFor, teamStatAllowed, type StarterCandidate } from "./opponentStarter";

const p = (name: string, position: DvpPosition | null, starter: boolean | undefined, over: Partial<StarterCandidate> = {}): StarterCandidate => ({ name, position, starter, minutes: starter ? 32 : 12, pts: 10, ...over });

/** A conventional five: one starter at each position, and a bench of two. */
const conventional = (): StarterCandidate[] => [
  p("Point", "PG", true), p("Wing", "SG", true), p("Small", "SF", true), p("Power", "PF", true), p("Big", "C", true),
  p("Bench One", "PG", false), p("Bench Two", "C", false),
];

describe("matchStarter", () => {
  it("returns the one explicit starter at the position, never a bench player at it", () => {
    const match = matchStarter(conventional(), "PG");
    expect(match).toMatchObject({ kind: "matched" });
    expect(match.kind === "matched" && match.player.name).toBe("Point");
  });

  it("does not choose by scoring: a bench player who outscored the starter is not the starter", () => {
    const players = conventional().map((x) => (x.name === "Bench One" ? { ...x, pts: 40 } : x));
    const match = matchStarter(players, "PG");
    expect(match.kind === "matched" && match.player.name).toBe("Point");
  });

  it("reports several starters at the position instead of choosing one (a two-guard lineup labelled twice as PG)", () => {
    const players = conventional().map((x) => (x.name === "Wing" ? { ...x, position: "PG" as const } : x));
    const match = matchStarter(players, "PG");
    expect(match.kind).toBe("multiple");
    expect(match.kind === "multiple" && match.players.map((x) => x.name).sort()).toEqual(["Point", "Wing"]);
  });

  it("reports none when no starter holds the position (a three-forward lineup has no starting PG)", () => {
    const players = conventional().map((x) => (x.name === "Point" ? { ...x, position: "SF" as const } : x));
    expect(matchStarter(players, "PG")).toEqual({ kind: "none" });
  });

  it("is uncertain, not matched, when a starter has no position estimate: that starter could be the one at the position", () => {
    const players = conventional().map((x) => (x.name === "Big" ? { ...x, position: null } : x));
    expect(matchStarter(players, "PG")).toEqual({ kind: "uncertain", unclassified: 1 });
    expect(matchStarter(players, "C")).toEqual({ kind: "uncertain", unclassified: 1 });
  });

  it("still reports several starters when another starter is unclassified, since that is already ambiguous", () => {
    const players = conventional().map((x) => (x.name === "Wing" ? { ...x, position: "PG" as const } : x.name === "Big" ? { ...x, position: null } : x));
    expect(matchStarter(players, "PG").kind).toBe("multiple");
  });

  it("is unavailable when the source gave no starter status for the game", () => {
    const players = conventional().map(({ starter: _starter, ...rest }) => rest);
    expect(matchStarter(players, "PG")).toEqual({ kind: "unavailable", reason: "no-flags" });
  });

  it("is unavailable when only some players carry a status: a half-flagged game proves nothing", () => {
    const players = conventional().map((x, i) => (i === 6 ? { name: x.name, position: x.position, minutes: x.minutes, pts: x.pts } : x));
    expect(matchStarter(players, "PG")).toEqual({ kind: "unavailable", reason: "no-flags" });
  });

  it.each([[4], [6]])("is unavailable when the flags name %i starters rather than five", (count) => {
    const flagged = conventional().map((x) => ({ ...x, starter: false }));
    const players = flagged.map((x, i) => (i < count ? { ...x, starter: true } : x));
    expect(matchStarter(players, "PG")).toEqual({ kind: "unavailable", reason: "starter-count", starters: count });
  });

  it("matches on the estimated primary position only, so a starter labelled at another position is not the PG", () => {
    expect(matchStarter(conventional(), "C").kind === "matched" && (matchStarter(conventional(), "C") as { player: StarterCandidate }).player.name).toBe("Big");
  });
});

describe("teamPointsAllowed", () => {
  const team = (minutes: number[], pts: number[]): StarterCandidate[] => minutes.map((m, i) => p(`P${i}`, null, i < 5, { minutes: m, pts: pts[i] }));

  it("is the opposing team's total points when its minutes make a full game", () => {
    expect(teamPointsAllowed(team([40, 38, 36, 30, 28, 24, 20, 14, 10], [30, 22, 18, 12, 10, 8, 6, 4, 2]))).toBe(112);
  });

  it("is null, never a floor, when the roster's minutes are short of a game (a missing player row)", () => {
    expect(teamPointsAllowed(team([40, 38, 36, 30, 28, 24, 20], [30, 22, 18, 12, 10, 8, 6]))).toBeNull();
  });

  it("allows 2 minutes of whole-number rounding, and no more: three over could hide a missing player row", () => {
    expect(teamPointsAllowed(team([40, 38, 36, 30, 28, 24, 20, 14, 12], [30, 22, 18, 12, 10, 8, 6, 4, 2]))).toBe(112); // 242 minutes
    expect(teamPointsAllowed(team([40, 38, 36, 30, 28, 24, 20, 14, 13], [30, 22, 18, 12, 10, 8, 6, 4, 2]))).toBeNull(); // 243 minutes
  });

  it("allows for overtime periods", () => {
    expect(teamPointsAllowed(team([48, 48, 48, 48, 48, 25], [30, 22, 18, 12, 10, 8]))).toBe(100);
  });

  it("is null for an empty list", () => {
    expect(teamPointsAllowed([])).toBeNull();
  });
});

describe("teamPointsFor", () => {
  const rows = (pts: number[], minutes: number[]) => pts.map((p, i) => ({ pts: p, minutes: minutes[i] }));
  const fullGame = rows([30, 22, 18, 12, 10, 8, 6, 4, 2], [40, 38, 36, 30, 28, 24, 20, 14, 10]); // 112 points, 240 minutes

  it("uses the official score, exact even when the box is not a full game, and says the box is complete when the rows add up to it", () => {
    expect(teamPointsFor(fullGame, 112)).toEqual({ points: 112, source: "official", complete: true, playerSum: 112 });
  });

  it("names a missing player row instead of understating the figure: the official score stands and the box is flagged", () => {
    const missing = fullGame.slice(0, 8); // the 2-point reserve is gone
    expect(teamPointsFor(missing, 112)).toEqual({ points: 112, source: "official", complete: false, playerSum: 110 });
  });

  it("falls back to the minutes rule, unchanged, when there is no official score", () => {
    expect(teamPointsFor(fullGame)).toEqual({ points: 112, source: "box", complete: true, playerSum: 112 });
    expect(teamPointsFor(fullGame.slice(0, 7))).toEqual({ points: null, source: null, complete: false, playerSum: 106 });
    expect(teamPointsFor(fullGame, null).source).toBe("box");
  });
});

describe("teamStatAllowed: the opposing team's total in one stat, never a position figure", () => {
  const line = (name: string, minutes: number, pts: number, reb: number, ast: number) => ({ name, position: null, minutes, pts, reb, ast });
  const fullGame = [line("A", 48, 30, 10, 6), line("B", 48, 25, 8, 9), line("C", 48, 22, 12, 4), line("D", 48, 20, 5, 3), line("E", 48, 15, 9, 2)];

  it("is the official score for points, whatever the rows add up to", () => {
    expect(teamStatAllowed(fullGame, "pts", 115)).toBe(115);
    expect(teamStatAllowed(fullGame.slice(0, 4), "pts", 115)).toBe(115);
  });

  it("sums rebounds and assists over a complete box", () => {
    expect(teamStatAllowed(fullGame, "reb", 112)).toBe(44);
    expect(teamStatAllowed(fullGame, "ast", 112)).toBe(24);
  });

  it("is null for rebounds and assists when the listed points do not add up to the official score (a row is missing)", () => {
    expect(teamStatAllowed(fullGame, "reb", 120)).toBeNull();
    expect(teamStatAllowed(fullGame, "ast", 120)).toBeNull();
  });

  it("is null for rebounds and assists when the minutes do not make a game, even if the points match", () => {
    const short = [...fullGame.slice(0, 4), line("E", 20, 15, 9, 2)];
    expect(teamStatAllowed(short, "reb", 112)).toBeNull();
  });

  it("without an official score uses the minutes rule for every stat, and is null for an empty box", () => {
    expect(teamStatAllowed(fullGame, "pts")).toBe(112);
    expect(teamStatAllowed(fullGame, "reb")).toBe(44);
    expect(teamStatAllowed(fullGame.slice(0, 3), "reb")).toBeNull();
    expect(teamStatAllowed([], "pts", 100)).toBe(100);
    expect(teamStatAllowed([], "reb", 100)).toBeNull();
  });
});
