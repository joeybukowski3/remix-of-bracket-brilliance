import { describe, expect, it } from "vitest";
import { normalizeEpaTeamGameRows, buildPregameRollingEpa, buildPregameRollingEpaAt, rankTeamsAt } from "./nfl-epa-week-rank-core.mjs";

function row({ season, week, team, opponent, offEpa, offPlays = 60 }) {
  return { season: String(season), week: String(week), team, opponent, off_epa: String(offEpa), off_plays: String(offPlays), game_id: `${season}_${week}_${team}_${opponent}` };
}

describe("buildPregameRollingEpa", () => {
  it("excludes the current game from its own pregame rolling value (no leakage)", () => {
    // Team A plays weeks 1 and 2. Week 2's rolling value must reflect ONLY week 1.
    const rows = normalizeEpaTeamGameRows([
      row({ season: 2025, week: 1, team: "A", opponent: "B", offEpa: 10 }),
      row({ season: 2025, week: 1, team: "B", opponent: "A", offEpa: -5 }),
      row({ season: 2025, week: 2, team: "A", opponent: "C", offEpa: 999 }), // huge value -- must NOT leak into its own pregame rank
      row({ season: 2025, week: 2, team: "C", opponent: "A", offEpa: -20 }),
    ]);
    const index = buildPregameRollingEpa(rows);
    const week2 = index.get("A|2025|2");
    expect(week2.offEpaPerPlay).toBeCloseTo(10 / 60, 5); // only week 1's value, week 2's 999 excluded
    expect(week2.trailingGames).toBe(1);
  });

  it("returns a null pregame value for a team's first-ever game (no prior games)", () => {
    const rows = normalizeEpaTeamGameRows([row({ season: 2025, week: 1, team: "A", opponent: "B", offEpa: 10 })]);
    const index = buildPregameRollingEpa(rows);
    const week1 = index.get("A|2025|1");
    expect(week1.offEpaPerPlay).toBeNull();
    expect(week1.defEpaAllowedPerPlay).toBeNull();
  });

  it("caps the trailing window at 10 games", () => {
    const rows = [];
    for (let week = 1; week <= 12; week += 1) {
      rows.push(row({ season: 2025, week, team: "A", opponent: "B", offEpa: week }));
      rows.push(row({ season: 2025, week, team: "B", opponent: "A", offEpa: -week }));
    }
    const index = buildPregameRollingEpa(normalizeEpaTeamGameRows(rows));
    const week12 = index.get("A|2025|12");
    expect(week12.trailingGames).toBe(10); // weeks 2-11, not week 1
  });
});

describe("normalizeEpaTeamGameRows team code aliasing", () => {
  it("aliases the Rams' epa_team_game code 'LAR' to the stats_player_week/teams.json convention 'LA'", () => {
    const rows = normalizeEpaTeamGameRows([
      row({ season: 2025, week: 1, team: "lar", opponent: "sea", offEpa: 5 }),
      row({ season: 2025, week: 1, team: "sea", opponent: "lar", offEpa: -5 }),
    ]);
    expect(rows[0].team).toBe("LA");
    expect(rows[1].opponent).toBe("LA");
  });

  it("aliases Washington's epa_team_game code 'WSH' to the stats_player_week/teams.json convention 'WAS'", () => {
    const rows = normalizeEpaTeamGameRows([
      row({ season: 2025, week: 1, team: "wsh", opponent: "dal", offEpa: 5 }),
    ]);
    expect(rows[0].team).toBe("WAS");
  });

  it("regression: an LAR opponent now resolves a pregame defense rank instead of a silent null", () => {
    // Before the alias fix, epaRollingIndex was keyed by "LAR" while every join key elsewhere
    // in the yardage-history pipeline (stats_player_week opponentTeam, teams.json nflverseAbbr)
    // used "LA" -- the lookup below would always miss and return null.
    const rows = normalizeEpaTeamGameRows([
      row({ season: 2025, week: 1, team: "lar", opponent: "sea", offEpa: 5 }),
      row({ season: 2025, week: 1, team: "sea", opponent: "lar", offEpa: -5 }),
      row({ season: 2025, week: 2, team: "lar", opponent: "dal", offEpa: 3 }),
      row({ season: 2025, week: 2, team: "dal", opponent: "lar", offEpa: -3 }),
    ]);
    const index = buildPregameRollingEpa(rows);
    const ranks = rankTeamsAt(index, 2025, 2, "defense");
    expect(ranks.get("LA")).not.toBeUndefined();
  });
});

describe("rankTeamsAt", () => {
  it("ranks defense (allowed) ascending -- lowest EPA allowed is rank 1", () => {
    const rows = normalizeEpaTeamGameRows([
      row({ season: 2025, week: 1, team: "A", opponent: "X", offEpa: 5 }), // X allowed 5
      row({ season: 2025, week: 1, team: "B", opponent: "Y", offEpa: 1 }), // Y allowed 1 (stingiest)
      row({ season: 2025, week: 2, team: "X", opponent: "A", offEpa: 0 }),
      row({ season: 2025, week: 2, team: "Y", opponent: "B", offEpa: 0 }),
    ]);
    const index = buildPregameRollingEpa(rows);
    const ranks = rankTeamsAt(index, 2025, 2, "defense");
    expect(ranks.get("Y")).toBe(1);
    expect(ranks.get("X")).toBe(2);
  });

  it("excludes teams with no pregame value from ranking, never fabricates a rank", () => {
    const rows = normalizeEpaTeamGameRows([row({ season: 2025, week: 1, team: "A", opponent: "B", offEpa: 5 })]);
    const index = buildPregameRollingEpa(rows);
    const ranks = rankTeamsAt(index, 2025, 1, "offense");
    expect(ranks.has("A")).toBe(false);
  });
});

describe("buildPregameRollingEpaAt", () => {
  it("produces the exact same rolling value at an unplayed cutoff as buildPregameRollingEpa does at the next played game -- same formula, same trailing window", () => {
    // Team A plays weeks 1-3. The value buildPregameRollingEpaAt computes for
    // the not-yet-played week 4 must equal what buildPregameRollingEpa would
    // compute if week 4 actually existed in the input (weeks 1-3 trailing).
    const rows = normalizeEpaTeamGameRows([
      row({ season: 2025, week: 1, team: "A", opponent: "B", offEpa: 10 }),
      row({ season: 2025, week: 1, team: "B", opponent: "A", offEpa: -5 }),
      row({ season: 2025, week: 2, team: "A", opponent: "C", offEpa: 20 }),
      row({ season: 2025, week: 2, team: "C", opponent: "A", offEpa: -10 }),
      row({ season: 2025, week: 3, team: "A", opponent: "D", offEpa: 30 }),
      row({ season: 2025, week: 3, team: "D", opponent: "A", offEpa: -15 }),
      // A's week-4 opponent, unplayed at week 4 -- no epa_team_game row for
      // week 4 at all, matching the real upcoming-week shape.
      row({ season: 2025, week: 1, team: "E", opponent: "F", offEpa: 1 }),
      row({ season: 2025, week: 1, team: "F", opponent: "E", offEpa: -1 }),
    ]);
    const atCutoff = buildPregameRollingEpaAt(rows, 2025, 4);
    const a = atCutoff.get("A|2025|4");
    expect(a.offEpaPerPlay).toBeCloseTo((10 + 20 + 30) / (60 * 3), 5);
    expect(a.defEpaAllowedPerPlay).toBeCloseTo((-5 + -10 + -15) / (60 * 3), 5);
    expect(a.trailingGames).toBe(3);
  });

  it("no future-game leakage: appending a week-4 row for the team after the cutoff does not change the week-4 cutoff value", () => {
    const before = normalizeEpaTeamGameRows([
      row({ season: 2025, week: 1, team: "A", opponent: "B", offEpa: 10 }),
      row({ season: 2025, week: 1, team: "B", opponent: "A", offEpa: -5 }),
    ]);
    const after = normalizeEpaTeamGameRows([
      row({ season: 2025, week: 1, team: "A", opponent: "B", offEpa: 10 }),
      row({ season: 2025, week: 1, team: "B", opponent: "A", offEpa: -5 }),
      // A week 4 game that has since been played, with a huge value that must
      // NOT leak into the week-4 pregame cutoff computed against it.
      row({ season: 2025, week: 4, team: "A", opponent: "C", offEpa: 999 }),
      row({ season: 2025, week: 4, team: "C", opponent: "A", offEpa: -999 }),
    ]);
    const beforeIndex = buildPregameRollingEpaAt(before, 2025, 4);
    const afterIndex = buildPregameRollingEpaAt(after, 2025, 4);
    expect(afterIndex.get("A|2025|4").offEpaPerPlay).toBeCloseTo(beforeIndex.get("A|2025|4").offEpaPerPlay, 10);
    expect(afterIndex.get("A|2025|4").trailingGames).toBe(beforeIndex.get("A|2025|4").trailingGames);
  });

  it("resolves null, never a fabricated rank, for a team with zero prior games", () => {
    const rows = normalizeEpaTeamGameRows([row({ season: 2025, week: 1, team: "A", opponent: "B", offEpa: 5 })]);
    // "B" has one prior game (week 1) by the week-2 cutoff; a team that never appears has no entry at all.
    const index = buildPregameRollingEpaAt(rows, 2025, 1);
    // At the week-1 cutoff, neither A nor B has any strictly-prior game.
    expect(index.get("A|2025|1").offEpaPerPlay).toBeNull();
    expect(index.get("B|2025|1").defEpaAllowedPerPlay).toBeNull();
  });

  it("rankTeamsAt works unmodified against buildPregameRollingEpaAt's output -- same ranking function, no second ranking formula", () => {
    // P's defense allowed -3 (stingier); Q's defense allowed 5.
    const rows = normalizeEpaTeamGameRows([
      row({ season: 2025, week: 1, team: "P", opponent: "Q", offEpa: 5 }), // Q allowed 5
      row({ season: 2025, week: 1, team: "Q", opponent: "P", offEpa: -3 }), // P allowed -3 (stingiest)
    ]);
    const atCutoff = buildPregameRollingEpaAt(rows, 2025, 2);
    const ranks = rankTeamsAt(atCutoff, 2025, 2, "defense");
    expect(ranks.get("P")).toBe(1);
    expect(ranks.get("Q")).toBe(2);
  });
});
