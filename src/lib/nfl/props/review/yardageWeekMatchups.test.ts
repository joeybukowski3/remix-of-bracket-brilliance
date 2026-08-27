import { describe, expect, test } from "vitest";
import { buildYardageWeekMatchups } from "./yardageWeekMatchups";

function row(overrides: {
  gameId: string;
  kickoff: string | null;
  team: string;
  opponent: string;
  homeAway: "home" | "away";
}) {
  return overrides;
}

describe("buildYardageWeekMatchups", () => {
  test("dedupes both rows of a game into one matchup with correct home/away", () => {
    const rows = [
      row({ gameId: "2026_01_NE_SEA", kickoff: "2026-09-07T17:00:00Z", team: "ne", opponent: "sea", homeAway: "away" }),
      row({ gameId: "2026_01_NE_SEA", kickoff: "2026-09-07T17:00:00Z", team: "sea", opponent: "ne", homeAway: "home" }),
    ];
    const result = buildYardageWeekMatchups(rows);
    expect(result).toEqual([{ gameId: "2026_01_NE_SEA", kickoff: "2026-09-07T17:00:00Z", homeAbbr: "sea", awayAbbr: "ne" }]);
  });

  test("orders matchups by kickoff, earliest first", () => {
    const rows = [
      row({ gameId: "2026_01_LATE", kickoff: "2026-09-08T00:00:00Z", team: "buf", opponent: "mia", homeAway: "home" }),
      row({ gameId: "2026_01_EARLY", kickoff: "2026-09-07T17:00:00Z", team: "ne", opponent: "sea", homeAway: "away" }),
    ];
    const result = buildYardageWeekMatchups(rows);
    expect(result.map((m) => m.gameId)).toEqual(["2026_01_EARLY", "2026_01_LATE"]);
  });

  test("games with no kickoff sort last, ordered deterministically by gameId", () => {
    const rows = [
      row({ gameId: "2026_01_ZZZ", kickoff: null, team: "buf", opponent: "mia", homeAway: "home" }),
      row({ gameId: "2026_01_AAA", kickoff: null, team: "ne", opponent: "sea", homeAway: "away" }),
      row({ gameId: "2026_01_DATED", kickoff: "2026-09-07T17:00:00Z", team: "gb", opponent: "chi", homeAway: "home" }),
    ];
    const result = buildYardageWeekMatchups(rows);
    expect(result.map((m) => m.gameId)).toEqual(["2026_01_DATED", "2026_01_AAA", "2026_01_ZZZ"]);
  });
});
