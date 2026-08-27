import { describe, expect, it } from "vitest";
import { normalizeEpaTeamGameRows, buildPregameRollingEpa, rankTeamsAt } from "./nfl-epa-week-rank-core.mjs";

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
