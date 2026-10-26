import { describe, expect, it } from "vitest";
import type { HooprPlayerBoxRow } from "../hooprAdapter";
import { normalizeResearchPlayerBox, RESEARCH_SEASONS } from "./researchGames";

const raw = (over: Partial<HooprPlayerBoxRow> = {}): HooprPlayerBoxRow => ({
  game_id: 1001, season: 2025, season_type: 2, game_date: "2024-11-05", athlete_id: 11, athlete_display_name: "Demo One", team_abbreviation: "BOS", opponent_team_abbreviation: "NYK",
  home_away: "home", minutes: 30, points: 12, rebounds: 5, assists: 3, starter: true, did_not_play: false, athlete_position_abbreviation: "G", ...over,
});
/** A complete two-team game: one player each side. */
const game = (id: number, date: string, hooprSeason = 2025, extra: Partial<HooprPlayerBoxRow> = {}): HooprPlayerBoxRow[] => [
  raw({ game_id: id, game_date: date, season: hooprSeason, ...extra }),
  raw({ game_id: id, game_date: date, season: hooprSeason, athlete_id: 22, athlete_display_name: "Demo Two", team_abbreviation: "NYK", opponent_team_abbreviation: "BOS", home_away: "away", ...extra }),
];

describe("normalizeResearchPlayerBox", () => {
  it("maps hoopR seasons 2025, 2026 and 2027 to 2024-25, 2025-26 and 2026-27, and nothing else", () => {
    expect(RESEARCH_SEASONS).toEqual({ 2025: "2024-25", 2026: "2025-26", 2027: "2026-27" });
    const { rows } = normalizeResearchPlayerBox([{ hooprSeason: 2025, rows: game(1, "2024-11-05") }, { hooprSeason: 2026, rows: game(2, "2025-11-05", 2026) }]);
    expect(rows.map((r) => r.season)).toEqual(["2024-25", "2024-25", "2025-26", "2025-26"]);
    expect(() => normalizeResearchPlayerBox([{ hooprSeason: 2024, rows: [] }])).toThrow(/not in the research mapping/);
  });

  it("converts a row to the research shape, with the ESPN athlete id as the identity", () => {
    const { rows } = normalizeResearchPlayerBox([{ hooprSeason: 2025, rows: game(1, "2024-11-05") }]);
    expect(rows[0]).toEqual({ season: "2024-25", seasonType: "regular", gameId: "1", gameDate: "2024-11-05", team: "BOS", opponent: "NYK", isHome: true, playerId: "11", playerName: "Demo One", minutes: 30, pts: 12, reb: 5, ast: 3 });
  });

  it("counts every exclusion: did not play, no minutes, unknown season type, All-Star teams, unusable rows, incomplete games", () => {
    const rows = [
      ...game(1, "2024-11-05"),
      raw({ game_id: 1, athlete_id: 33, did_not_play: true }),
      raw({ game_id: 1, athlete_id: 34, minutes: 0 }),
      raw({ game_id: 1, athlete_id: 35, minutes: null }),
      raw({ game_id: 1, athlete_id: 36, season_type: 9 }),
      raw({ game_id: 1, athlete_id: 37, team_abbreviation: "STARS" }),
      raw({ game_id: 1, athlete_id: null }),
      raw({ game_id: 1, athlete_id: 38, points: null }),
      raw({ game_id: 2, athlete_id: 41 }),
    ];
    const { rows: kept, report } = normalizeResearchPlayerBox([{ hooprSeason: 2025, rows }]);
    expect(kept).toHaveLength(2);
    expect(report.excluded).toEqual({ unknownSeasonType: 1, didNotPlay: 1, noOrZeroMinutes: 2, unknownTeam: 1, unusable: 2, incompleteGames: 1 });
    expect(report.rowsRead).toEqual({ "2024-25": rows.length });
    expect(report.rowsKept).toEqual({ "2024-25": 2 });
    expect(report.gamesKept).toEqual({ "2024-25": 1 });
  });

  it("keeps preseason rows, labelled, for the caller to filter: they are not competitive history", () => {
    const { rows } = normalizeResearchPlayerBox([{ hooprSeason: 2025, rows: game(1, "2024-10-10", 2025, { season_type: 1 }) }]);
    expect(rows.every((r) => r.seasonType === "preseason")).toBe(true);
  });

  it("rejects a row whose season disagrees with its file, a date outside the season, and a duplicated player", () => {
    expect(() => normalizeResearchPlayerBox([{ hooprSeason: 2025, rows: game(1, "2025-11-05", 2026) }])).toThrow(/carries season 2026/);
    expect(() => normalizeResearchPlayerBox([{ hooprSeason: 2025, rows: game(1, "2025-11-05") }])).toThrow(/outside the season's window/);
    expect(() => normalizeResearchPlayerBox([{ hooprSeason: 2025, rows: [...game(1, "2024-11-05"), raw({ game_id: 1 })] }])).toThrow(/1 player-game row\(s\) appear twice in one game/);
  });

  it("accepts the play-in and playoffs of the season's second year", () => {
    const { rows } = normalizeResearchPlayerBox([{ hooprSeason: 2025, rows: [...game(1, "2025-04-16", 2025, { season_type: 5 }), ...game(2, "2025-06-20", 2025, { season_type: 3 })] }]);
    expect(rows.map((r) => r.seasonType)).toEqual(["play_in", "play_in", "playoffs", "playoffs"]);
  });
});
