import { describe, expect, it } from "vitest";
import {
  buildEpaContext,
  buildTrenchesContext,
  buildYppContext,
  buildPregameGameContext,
  buildCoachingContext,
  NOT_IMPLEMENTED_COACHING_CONTEXT,
  SOURCE_UNAVAILABLE_COACHING_CONTEXT,
  type CoachRatingSnapshot,
  type EpaPriorSeasonWindow,
  type MetricsPriorSeasonWindow,
  type TrenchSeasonData,
} from "./nfl-game-context";

const EPA_WINDOW: EpaPriorSeasonWindow = {
  teams: {
    sea: { through: { season: 2025, dateUtc: "2026-01-04T21:25:00.000Z" }, totals: { offense: { offEpa: 20, offPlays: 100 } } },
    ne: { through: { season: 2025, dateUtc: "2026-01-04T21:25:00.000Z" }, totals: { offense: { offEpa: 10, offPlays: 100 } } },
  },
};

describe("buildEpaContext", () => {
  it("derives per-play EPA and advantage/differential from prior-season-full totals", () => {
    const ctx = buildEpaContext(EPA_WINDOW, "sea", "ne");
    expect(ctx.home_epa_value).toBeCloseTo(0.2);
    expect(ctx.away_epa_value).toBeCloseTo(0.1);
    expect(ctx.epa_differential).toBeCloseTo(0.1);
    expect(ctx.epa_advantage_team).toBe("home");
    expect(ctx.provenance_status).toBe("available");
    expect(ctx.source_season).toBe(2025);
  });

  it("is unavailable, never fabricated, when a team is missing from the window", () => {
    const ctx = buildEpaContext(EPA_WINDOW, "sea", "xxx");
    expect(ctx.away_epa_value).toBeNull();
    expect(ctx.epa_differential).toBeNull();
    expect(ctx.epa_advantage_team).toBeNull();
    expect(ctx.provenance_status).toBe("unavailable");
  });

  it("is unavailable when the window itself is null (no postgame leakage substitute)", () => {
    const ctx = buildEpaContext(null, "sea", "ne");
    expect(ctx.home_epa_value).toBeNull();
    expect(ctx.provenance_status).toBe("unavailable");
  });
});

const METRICS_WINDOW: MetricsPriorSeasonWindow = {
  teams: {
    sea: { through: { season: 2025, dateUtc: "2026-01-04T21:25:00.000Z" }, metrics: { "off.yardsPerPlay": [5.8, 3] } },
    ne: { through: { season: 2025, dateUtc: "2026-01-04T21:25:00.000Z" }, metrics: { "off.yardsPerPlay": [5.1, 20] } },
  },
};

describe("buildYppContext", () => {
  it("reads off.yardsPerPlay from the prior-season-full window", () => {
    const ctx = buildYppContext(METRICS_WINDOW, "sea", "ne");
    expect(ctx.home_ypp).toBe(5.8);
    expect(ctx.away_ypp).toBe(5.1);
    expect(ctx.ypp_differential).toBeCloseTo(0.7);
    expect(ctx.ypp_advantage_team).toBe("home");
    expect(ctx.provenance_status).toBe("available");
  });

  it("never substitutes a postgame value when unavailable", () => {
    const ctx = buildYppContext(null, "sea", "ne");
    expect(ctx.home_ypp).toBeNull();
    expect(ctx.away_ypp).toBeNull();
    expect(ctx.provenance_status).toBe("unavailable");
  });
});

const TRENCH_SEASON: TrenchSeasonData = {
  throughWeek: 18,
  sourceLastModified: "2026-01-06T15:51:59Z",
  teams: {
    sea: {
      metrics: {
        "off.passBlockWinRate": { valuePct: 65 },
        "off.runBlockWinRate": { valuePct: 70 },
        "def.passRushWinRate": { valuePct: 40 },
        "def.runStopWinRate": { valuePct: 35 },
      },
    },
    ne: {
      metrics: {
        "off.passBlockWinRate": { valuePct: 55 },
        "off.runBlockWinRate": { valuePct: 60 },
        "def.passRushWinRate": { valuePct: 45 },
        "def.runStopWinRate": { valuePct: 30 },
      },
    },
  },
};

describe("buildTrenchesContext", () => {
  it("preserves structured per-team subfields and computes an offensive-line composite differential", () => {
    const ctx = buildTrenchesContext(TRENCH_SEASON, 2025, "sea", "ne");
    expect(ctx.home_trenches_value).toEqual({
      off_pass_block_win_rate: 65,
      off_run_block_win_rate: 70,
      def_pass_rush_win_rate: 40,
      def_run_stop_win_rate: 35,
    });
    expect(ctx.trenches_differential).toBeCloseTo(20); // (65+70) - (55+60)
    expect(ctx.trenches_advantage_team).toBe("home");
    expect(ctx.provenance_status).toBe("available");
    expect(ctx.source_season).toBe(2025);
  });

  it("is unavailable, not backfilled with hindsight, when the season archive doesn't exist", () => {
    const ctx = buildTrenchesContext(null, null, "sea", "ne");
    expect(ctx.home_trenches_value).toBeNull();
    expect(ctx.provenance_status).toBe("unavailable");
    expect(ctx.source_season).toBeNull();
  });
});

const SNAPSHOT: CoachRatingSnapshot = {
  rating_version: "coaching-v1.0.0",
  season: 2024,
  week: 5,
  generated_from_cutoff: "2024-10-03T00:15:00.000Z",
  source_timestamp: "2026-09-06T00:00:00.000Z",
  coaches: [
    {
      coach_id: "sean-mcvay", coach: "Sean McVay", team: "lar", coaching_rating: 59,
      career_wl: "102-63", tenure_wl: "102-63", season_wl: "2-2",
      career_ats: "89-72-4", tenure_ats: "89-72-4", season_ats: "2-2", recent_ats: "9-7-1",
      tenure_year: 8, small_sample: false, first_year: false, interim: false,
    },
    {
      coach_id: "kyle-shanahan", coach: "Kyle Shanahan", team: "sf", coaching_rating: 51,
      career_wl: "91-72", tenure_wl: "70-45", season_wl: "3-1",
      career_ats: "83-79-1", tenure_ats: "60-53-1", season_ats: "2-2", recent_ats: "8-8-1",
      tenure_year: 8, small_sample: false, first_year: false, interim: false,
    },
    {
      coach_id: "jerod-mayo", coach: "Jerod Mayo", team: "ne", coaching_rating: 50,
      career_wl: "0-0", tenure_wl: "0-0", season_wl: "0-0",
      career_ats: "0-0", tenure_ats: "0-0", season_ats: "0-0", recent_ats: "0-0",
      tenure_year: 1, small_sample: true, first_year: true, interim: false,
    },
  ],
};

describe("coaching context", () => {
  it("NOT_IMPLEMENTED alias is the SOURCE_UNAVAILABLE contract", () => {
    expect(NOT_IMPLEMENTED_COACHING_CONTEXT).toBe(SOURCE_UNAVAILABLE_COACHING_CONTEXT);
    expect(SOURCE_UNAVAILABLE_COACHING_CONTEXT.coaching_context_status).toBe("SOURCE_UNAVAILABLE");
    expect(SOURCE_UNAVAILABLE_COACHING_CONTEXT.home_coaching_rating).toBeNull();
  });

  it("SOURCE_UNAVAILABLE when no snapshot is supplied (no silent current-ratings fallback)", () => {
    const ctx = buildCoachingContext({ snapshot: null, homeTeam: "lar", awayTeam: "sf" });
    expect(ctx.coaching_context_status).toBe("SOURCE_UNAVAILABLE");
  });

  it("SOURCE_UNAVAILABLE when the snapshot cutoff is later than kickoff (would leak)", () => {
    const ctx = buildCoachingContext({
      snapshot: SNAPSHOT, homeTeam: "lar", awayTeam: "sf",
      gameKickoffUtc: "2024-10-02T00:00:00.000Z",
    });
    expect(ctx.coaching_context_status).toBe("SOURCE_UNAVAILABLE");
  });

  it("COACH_UNRATED when one team's coach is absent from the snapshot", () => {
    const ctx = buildCoachingContext({ snapshot: SNAPSHOT, homeTeam: "lar", awayTeam: "atl" });
    expect(ctx.coaching_context_status).toBe("COACH_UNRATED");
    expect(ctx.home_coaching_rating).toBe(59);
    expect(ctx.away_coaching_rating).toBeNull();
    expect(ctx.coaching_advantage_team).toBeNull();
  });

  it("OK with HOME advantage, differential, and ATS context present but never weighted", () => {
    const ctx = buildCoachingContext({
      snapshot: SNAPSHOT, homeTeam: "lar", awayTeam: "sf",
      gameKickoffUtc: "2024-10-06T17:00:00.000Z",
    });
    expect(ctx.coaching_context_status).toBe("OK");
    expect(ctx.coaching_differential).toBe(8);
    expect(ctx.coaching_advantage_team).toBe("home");
    expect(ctx.home_coach_context?.career_ats).toBe("89-72-4");
    expect(ctx.rating_version).toBe("coaching-v1.0.0");
    expect(ctx.pregame_cutoff).toBe("2024-10-03T00:15:00.000Z");
  });

  it("EVEN when |differential| <= 4", () => {
    const ctx = buildCoachingContext({ snapshot: SNAPSHOT, homeTeam: "sf", awayTeam: "ne" });
    expect(ctx.coaching_context_status).toBe("OK");
    expect(ctx.coaching_advantage_team).toBe("even");
    expect(ctx.away_coach_context?.first_year).toBe(true);
  });

  it("AWAY advantage when the away coach is materially higher", () => {
    const ctx = buildCoachingContext({ snapshot: SNAPSHOT, homeTeam: "ne", awayTeam: "lar" });
    expect(ctx.coaching_advantage_team).toBe("away");
  });
});

describe("buildPregameGameContext", () => {
  it("assembles all four context families", () => {
    const ctx = buildPregameGameContext({
      epaWindow: EPA_WINDOW,
      yppWindow: METRICS_WINDOW,
      trenchSeasonData: TRENCH_SEASON,
      trenchSeasonKey: 2025,
      homeTeam: "sea",
      awayTeam: "ne",
    });
    expect(ctx.epa.provenance_status).toBe("available");
    expect(ctx.ypp.provenance_status).toBe("available");
    expect(ctx.trenches.provenance_status).toBe("available");
    expect(ctx.coaching.coaching_context_status).toBe("SOURCE_UNAVAILABLE");
  });

  it("wires a supplied coaching snapshot into the coaching family", () => {
    const ctx = buildPregameGameContext({
      epaWindow: null, yppWindow: null, trenchSeasonData: null, trenchSeasonKey: null,
      homeTeam: "lar", awayTeam: "sf",
      coachingSnapshot: SNAPSHOT,
      gameKickoffUtc: "2024-10-06T17:00:00.000Z",
    });
    expect(ctx.coaching.coaching_context_status).toBe("OK");
    expect(ctx.coaching.coaching_advantage_team).toBe("home");
  });
});
