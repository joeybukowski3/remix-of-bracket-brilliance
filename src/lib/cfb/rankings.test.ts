import { describe, expect, it } from "vitest";
import { getAllTeams } from "@/data/cfb";
import {
  filterByConference,
  getTop25,
  sortByJkbRank,
  sortRankings,
} from "./rankings";

describe("CFB rankings helpers", () => {
  const teams = getAllTeams();

  it("returns exactly 25 teams for Top 25 when sufficient data exists", () => {
    const top = getTop25(teams);
    expect(teams.length).toBeGreaterThanOrEqual(25);
    expect(top).toHaveLength(25);
  });

  it("sorts Top 25 by JKB rank ascending", () => {
    const top = getTop25(teams);
    const ranks = top.map((t) => t.ratings.jkbRank);
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]!).toBeGreaterThanOrEqual(ranks[i - 1]!);
    }
    expect(ranks[0]).toBe(1);
    expect(ranks[24]).toBe(25);
  });

  it("sortByJkbRank puts lower ranks first", () => {
    const sorted = sortByJkbRank(teams);
    expect(sorted[0]?.ratings.jkbRank).toBe(1);
  });

  it("filters by conference", () => {
    const sec = filterByConference(teams, "sec");
    expect(sec.length).toBeGreaterThan(0);
    expect(sec.every((t) => t.conference === "sec")).toBe(true);

    const all = filterByConference(teams, "all");
    expect(all).toHaveLength(teams.length);
  });

  it("sortRankings by power rating is descending by default", () => {
    const sorted = sortRankings(teams, "jkbPowerRating");
    const powers = sorted.map((t) => t.ratings.jkbPowerRating!);
    for (let i = 1; i < powers.length; i++) {
      expect(powers[i]!).toBeLessThanOrEqual(powers[i - 1]!);
    }
  });
});
