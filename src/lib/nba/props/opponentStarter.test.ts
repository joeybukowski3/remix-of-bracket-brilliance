import { describe, expect, it } from "vitest";
import type { DvpPosition } from "./dvpPositions";
import { matchStarter, teamPointsAllowed, type StarterCandidate } from "./opponentStarter";

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
