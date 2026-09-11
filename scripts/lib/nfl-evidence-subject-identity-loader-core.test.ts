import { describe, expect, it } from "vitest";
import { buildSubjectIdentitySource, selectRosterWeek, type CoachingRatingsArtifact, type DepthChartRow, type WeeklyRosterRow } from "./nfl-evidence-subject-identity-loader-core";
import { validateSubjectIdentities } from "./nfl-evidence-subject-identity";

const GAME_FACTS = { gameId: "2026_01_BAL_IND", season: 2026, week: 1, homeTeam: "ind", awayTeam: "bal" } as const;
const FIXED_NOW = () => "2026-09-11T00:00:00.000Z";

function rosterRow(overrides: Partial<WeeklyRosterRow>): WeeklyRosterRow {
  return {
    season: 2026,
    week: 1,
    team: "IND",
    gsis_id: "00-0000001",
    full_name: "Sample Player",
    position: "WR",
    status: "ACT",
    ...overrides,
  };
}

const COACHING_RATINGS: CoachingRatingsArtifact = {
  _meta: { season: 2026 },
  coaches: [
    { coach_id: "shane-steichen", coach: "Shane Steichen", team: "ind" },
    { coach_id: "jesse-minter", coach: "Jesse Minter", team: "bal" },
    { coach_id: "some-kc-coach", coach: "Some KC Coach", team: "kc" },
  ],
};

describe("selectRosterWeek", () => {
  it("6. prefers an exact match for the requested week", () => {
    expect(selectRosterWeek([1, 2, 3], 2)).toEqual({ weekUsed: 2, isCurrentWeek: true });
  });

  it("7. never selects a week later than requested (no future-week leakage)", () => {
    // Only week 3 (future) exists; nothing prior/at the requested week 2.
    expect(selectRosterWeek([3], 2)).toEqual({ weekUsed: null, isCurrentWeek: false });
  });

  it("8. falls back to the latest prior safe week when the requested week is unavailable", () => {
    expect(selectRosterWeek([1, 2], 4)).toEqual({ weekUsed: 2, isCurrentWeek: false });
  });
});

describe("buildSubjectIdentitySource (WU2.2)", () => {
  it("1 & 2. resolves a valid BAL and a valid IND player from the weekly roster", () => {
    const source = buildSubjectIdentitySource({
      gameFacts: GAME_FACTS,
      weeklyRosterRows: [
        rosterRow({ team: "IND", full_name: "Indy Fixture Player", gsis_id: "00-0000001", position: "LT" }),
        rosterRow({ team: "BAL", full_name: "Ravens Fixture Player", gsis_id: "00-0000002", position: "RB" }),
      ],
      depthChartRows: [],
      coachingRatings: COACHING_RATINGS,
      now: FIXED_NOW,
    });

    expect(source.meta?.status).toBe("available");
    expect(source.meta?.rosterWeekUsed).toBe(1);
    expect(source.meta?.rosterIsCurrentWeek).toBe(true);

    const validation = validateSubjectIdentities({ players: ["Indy Fixture Player", "Ravens Fixture Player"], coaches: [] }, { homeTeam: "ind", awayTeam: "bal" }, source);
    expect(validation.players[0]).toMatchObject({ status: "confirmed", team: "ind" });
    expect(validation.players[1]).toMatchObject({ status: "confirmed", team: "bal" });
  });

  it("3. an unrelated-team player is rejected by the validator against loader output", () => {
    const source = buildSubjectIdentitySource({
      gameFacts: GAME_FACTS,
      weeklyRosterRows: [
        rosterRow({ team: "IND", full_name: "Indy Fixture Player", gsis_id: "00-0000001" }),
        rosterRow({ team: "KC", full_name: "Unrelated Chiefs Player", gsis_id: "00-0000099", season: 2026, week: 1 }),
      ],
      depthChartRows: [],
      coachingRatings: COACHING_RATINGS,
      now: FIXED_NOW,
    });

    // KC roster row is included in loader output (it doesn't filter by the
    // requested game's teams) -- unrelated-ness is the validator's job.
    const validation = validateSubjectIdentities({ players: ["Unrelated Chiefs Player"], coaches: [] }, { homeTeam: "ind", awayTeam: "bal" }, source);
    expect(validation.players[0].status).toBe("rejected");
    expect(validation.players[0].team).toBe("kc");
  });

  it("4. an unknown player name stays unresolved, never fabricated", () => {
    const source = buildSubjectIdentitySource({
      gameFacts: GAME_FACTS,
      weeklyRosterRows: [rosterRow({ team: "IND", full_name: "Indy Fixture Player", gsis_id: "00-0000001" })],
      depthChartRows: [],
      coachingRatings: COACHING_RATINGS,
      now: FIXED_NOW,
    });
    const validation = validateSubjectIdentities({ players: ["Totally Unknown Player"], coaches: [] }, { homeTeam: "ind", awayTeam: "bal" }, source);
    expect(validation.players[0].status).toBe("unresolved");
  });

  it("5. two distinct players sharing a normalized name in-game resolve as conflicting, not silently picked", () => {
    const source = buildSubjectIdentitySource({
      gameFacts: GAME_FACTS,
      weeklyRosterRows: [
        rosterRow({ team: "IND", full_name: "Duplicate Name", gsis_id: "00-0000001", position: "WR" }),
        rosterRow({ team: "BAL", full_name: "Duplicate Name", gsis_id: "00-0000002", position: "CB" }),
      ],
      depthChartRows: [],
      coachingRatings: COACHING_RATINGS,
      now: FIXED_NOW,
    });
    expect(source.players).toHaveLength(2); // both distinct players retained, not deduped away
    const validation = validateSubjectIdentities({ players: ["Duplicate Name"], coaches: [] }, { homeTeam: "ind", awayTeam: "bal" }, source);
    expect(validation.players[0].status).toBe("conflicting");
  });

  it("6/7/8. week selection: prefers requested week, never leaks a future week, falls back to latest prior week", () => {
    const rowsAcrossWeeks: WeeklyRosterRow[] = [
      rosterRow({ team: "IND", full_name: "Week One Player", gsis_id: "00-0000001", week: 1 }),
      rosterRow({ team: "IND", full_name: "Week Two Player", gsis_id: "00-0000002", week: 2 }),
      rosterRow({ team: "IND", full_name: "Week Five Player", gsis_id: "00-0000005", week: 5 }), // future relative to requested week 2
    ];

    const exact = buildSubjectIdentitySource({
      gameFacts: { ...GAME_FACTS, week: 2 },
      weeklyRosterRows: rowsAcrossWeeks,
      depthChartRows: [],
      coachingRatings: COACHING_RATINGS,
      now: FIXED_NOW,
    });
    expect(exact.meta?.rosterWeekUsed).toBe(2);
    expect(exact.meta?.rosterIsCurrentWeek).toBe(true);
    expect(exact.players.some((p) => p.canonicalName === "Week Five Player")).toBe(false); // no future-week leakage

    const fallback = buildSubjectIdentitySource({
      gameFacts: { ...GAME_FACTS, week: 4 },
      weeklyRosterRows: rowsAcrossWeeks,
      depthChartRows: [],
      coachingRatings: COACHING_RATINGS,
      now: FIXED_NOW,
    });
    expect(fallback.meta?.rosterWeekUsed).toBe(2); // latest prior safe week
    expect(fallback.meta?.rosterIsCurrentWeek).toBe(false);
    expect(fallback.meta?.status).toBe("stale");
    expect(fallback.players.some((p) => p.canonicalName === "Week Five Player")).toBe(false);
  });

  it("9. resolves a valid BAL coach and a valid IND coach", () => {
    const source = buildSubjectIdentitySource({
      gameFacts: GAME_FACTS,
      weeklyRosterRows: [],
      depthChartRows: [],
      coachingRatings: COACHING_RATINGS,
      now: FIXED_NOW,
    });
    const validation = validateSubjectIdentities({ players: [], coaches: ["Shane Steichen", "Jesse Minter"] }, { homeTeam: "ind", awayTeam: "bal" }, source);
    expect(validation.coaches[0]).toMatchObject({ status: "confirmed", team: "ind" });
    expect(validation.coaches[1]).toMatchObject({ status: "confirmed", team: "bal" });
  });

  it("10. (duplicate of 9, IND coach) confirms Shane Steichen for IND specifically", () => {
    const source = buildSubjectIdentitySource({
      gameFacts: GAME_FACTS,
      weeklyRosterRows: [],
      depthChartRows: [],
      coachingRatings: COACHING_RATINGS,
      now: FIXED_NOW,
    });
    const validation = validateSubjectIdentities({ players: [], coaches: ["Shane Steichen"] }, { homeTeam: "ind", awayTeam: "bal" }, source);
    expect(validation.coaches[0].canonicalCoachId).toBe("shane-steichen");
  });

  it("11. rejects a coach conclusively associated with an unrelated team", () => {
    const source = buildSubjectIdentitySource({
      gameFacts: GAME_FACTS,
      weeklyRosterRows: [],
      depthChartRows: [],
      coachingRatings: COACHING_RATINGS,
      now: FIXED_NOW,
    });
    const validation = validateSubjectIdentities({ players: [], coaches: ["Some KC Coach"] }, { homeTeam: "ind", awayTeam: "bal" }, source);
    expect(validation.coaches[0].status).toBe("rejected");
    expect(validation.coaches[0].team).toBe("kc");
  });

  it("12. an unavailable coaching source (missing artifact / wrong season) degrades to unresolved, not fabricated", () => {
    const missingArtifact = buildSubjectIdentitySource({
      gameFacts: GAME_FACTS,
      weeklyRosterRows: [rosterRow({ team: "IND", full_name: "Indy Fixture Player", gsis_id: "00-0000001" })],
      depthChartRows: [],
      coachingRatings: null,
      now: FIXED_NOW,
    });
    expect(missingArtifact.coaches).toHaveLength(0);
    expect(missingArtifact.meta?.coachSource).toBe("none");
    const validation = validateSubjectIdentities({ players: [], coaches: ["Shane Steichen"] }, { homeTeam: "ind", awayTeam: "bal" }, missingArtifact);
    expect(validation.coaches[0].status).toBe("unresolved");

    const staleSeasonArtifact = buildSubjectIdentitySource({
      gameFacts: GAME_FACTS,
      weeklyRosterRows: [],
      depthChartRows: [],
      coachingRatings: { _meta: { season: 2025 }, coaches: COACHING_RATINGS.coaches },
      now: FIXED_NOW,
    });
    expect(staleSeasonArtifact.coaches).toHaveLength(0); // prior-season artifact never trusted for "coaches now"
    expect(staleSeasonArtifact.meta?.coachIsCurrentSeason).toBe(false);
  });

  it("13. does not mutate the source rows/artifact passed in", () => {
    const weeklyRosterRows = [rosterRow({ team: "IND", full_name: "Indy Fixture Player", gsis_id: "00-0000001" })];
    const depthChartRows: DepthChartRow[] = [{ team: "IND", player_name: "Indy Fixture Player", pos_abb: "LT" }];
    const before = { rows: JSON.stringify(weeklyRosterRows), depth: JSON.stringify(depthChartRows), coaching: JSON.stringify(COACHING_RATINGS) };

    buildSubjectIdentitySource({ gameFacts: GAME_FACTS, weeklyRosterRows, depthChartRows, coachingRatings: COACHING_RATINGS, now: FIXED_NOW });

    expect(JSON.stringify(weeklyRosterRows)).toBe(before.rows);
    expect(JSON.stringify(depthChartRows)).toBe(before.depth);
    expect(JSON.stringify(COACHING_RATINGS)).toBe(before.coaching);
  });

  it("enriches position from the depth chart when the weekly roster row is missing one", () => {
    const source = buildSubjectIdentitySource({
      gameFacts: GAME_FACTS,
      weeklyRosterRows: [rosterRow({ team: "IND", full_name: "Indy Fixture Player", gsis_id: "00-0000001", position: "" })],
      depthChartRows: [{ team: "IND", player_name: "Indy Fixture Player", pos_abb: "LT" }],
      coachingRatings: COACHING_RATINGS,
      now: FIXED_NOW,
    });
    expect(source.players[0].position).toBe("LT");
  });

  it("marks the source fully unavailable when no roster and no coach data exist", () => {
    const source = buildSubjectIdentitySource({
      gameFacts: GAME_FACTS,
      weeklyRosterRows: [],
      depthChartRows: [],
      coachingRatings: null,
      now: FIXED_NOW,
    });
    expect(source.meta?.status).toBe("unavailable");
    expect(source.players).toEqual([]);
    expect(source.coaches).toEqual([]);
  });
});
