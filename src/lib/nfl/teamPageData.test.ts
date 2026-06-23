import { describe, expect, it } from "vitest";
import { NFL_POWER_RATINGS } from "@/data/nflPreseason2026";
import {
  NFL_NOTABLE_PLAYER_MOVES,
  NFL_OFFSEASON_TEAM_COUNT,
  getNflOffseasonProfile,
} from "@/data/nflOffseason2026";
import { normalizeNflSchedulePayload } from "@/lib/nfl/teamSchedule";

describe("2026 NFL team page data", () => {
  it("has coaching coverage for every power-rating team", () => {
    expect(NFL_OFFSEASON_TEAM_COUNT).toBe(32);
    for (const team of NFL_POWER_RATINGS) {
      const profile = getNflOffseasonProfile(team.abbr);
      expect(profile.abbr).toBe(team.abbr);
      expect(profile.headCoach2025).not.toBe("Not available");
      expect(profile.headCoach2026).not.toBe("Not available");
    }
  });

  it("indexes notable moves as both additions and departures", () => {
    const move = NFL_NOTABLE_PLAYER_MOVES.find((entry) => entry.player === "Kyler Murray");
    expect(move).toMatchObject({ from: "ari", to: "min" });
    expect(getNflOffseasonProfile("ari").departures).toContainEqual(move);
    expect(getNflOffseasonProfile("min").additions).toContainEqual(move);
  });

  it("normalizes the ESPN regular-season schedule response", () => {
    const payload = {
      events: [
        {
          id: "game-1",
          date: "2026-09-13T17:00:00Z",
          week: { number: 1 },
          seasonType: { type: 2, slug: "regular-season" },
          status: { type: { completed: false, shortDetail: "9/13 - 1:00 PM EDT" } },
          competitions: [{
            neutralSite: false,
            venue: { fullName: "Example Stadium" },
            competitors: [
              { homeAway: "away", team: { abbreviation: "ARI", displayName: "Arizona Cardinals" } },
              { homeAway: "home", team: { abbreviation: "LAC", displayName: "Los Angeles Chargers" } },
            ],
          }],
        },
        {
          id: "preseason",
          date: "2026-08-01T17:00:00Z",
          seasonType: { type: 1, slug: "preseason" },
          competitions: [],
        },
      ],
    };

    expect(normalizeNflSchedulePayload(payload, "ari")).toEqual([
      expect.objectContaining({
        id: "game-1",
        week: 1,
        opponentAbbr: "lac",
        opponentName: "Los Angeles Chargers",
        homeAway: "away",
        venue: "Example Stadium",
        completed: false,
      }),
    ]);
  });

  it("includes completed results without coercing blank scores to zero", () => {
    const payload = {
      events: [{
        id: "game-2",
        date: "2026-10-01T00:00:00Z",
        week: { number: 4 },
        seasonType: { type: 2 },
        status: { type: { completed: true, shortDetail: "Final" } },
        competitions: [{
          competitors: [
            { homeAway: "home", winner: true, score: "24", team: { abbreviation: "BUF", displayName: "Buffalo Bills" } },
            { homeAway: "away", winner: false, score: "17", team: { abbreviation: "MIA", displayName: "Miami Dolphins" } },
          ],
        }],
      }],
    };

    expect(normalizeNflSchedulePayload(payload, "buf")[0]).toMatchObject({
      completed: true,
      result: "W 24-17",
      teamScore: 24,
      opponentScore: 17,
    });
  });
});
