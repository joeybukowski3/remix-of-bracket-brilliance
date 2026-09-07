import { describe, expect, it } from "vitest";
import {
  COACHING_RATING_V1,
  COACHING_RATING_VERSION,
  assignRanks,
  coachingAdvantage,
  computeCoachRating,
  ratingBand,
  reliabilityModifier,
  shrinkCareerWinPct,
  shrinkWinOverExpectation,
} from "./nfl-coach-rating.mjs";
import { buildCoachingRatings, matchupCoachingAdvantage } from "./nfl-coach-rating-build.mjs";

// ---- fixture games.csv rows -------------------------------------------------
// Minimal completed history + 2026 schedule rows that name the current coaches.
const g = (o) => ({
  game_id: o.id,
  season: String(o.season),
  game_type: o.type ?? "REG",
  week: String(o.week),
  gameday: o.day ?? `${o.season}-09-10`,
  gametime: "13:00",
  away_team: o.away,
  away_score: o.as ?? "",
  home_team: o.home,
  home_score: o.hs ?? "",
  result: o.hs === "" || o.hs == null ? "" : String(o.hs - o.as),
  spread_line: o.spread ?? "-3",
  div_game: "0",
  home_rest: "7",
  away_rest: "7",
  away_coach: o.ac,
  home_coach: o.hc,
});

/** N completed games for `coach` at `team` vs a filler opponent, alternating home. */
function season(coach, team, yr, wins, losses) {
  const rows = [];
  let wk = 1;
  for (let i = 0; i < wins + losses; i += 1) {
    const win = i < wins;
    const home = i % 2 === 0;
    rows.push(
      g({
        id: `${yr}_${String(wk).padStart(2, "0")}_${team}_BUF_${i}`,
        season: yr,
        week: wk,
        home: home ? team : "BUF",
        away: home ? "BUF" : team,
        hs: home ? (win ? 24 : 10) : (win ? 10 : 24),
        as: home ? (win ? 10 : 24) : (win ? 24 : 10),
        spread: "-3",
        hc: home ? coach : "Filler Coach",
        ac: home ? "Filler Coach" : coach,
      }),
    );
    wk += 1;
  }
  return rows;
}

describe("shrinkage", () => {
  it("first-year (0 games) -> average band: win% prior .500, woe prior 0", () => {
    expect(shrinkCareerWinPct(NaN, 0)).toBe(0.5);
    expect(shrinkWinOverExpectation(NaN, 0)).toBe(0);
    expect(shrinkWinOverExpectation(0.3, 0)).toBe(0);
  });

  it("4-game extreme record stays near the prior", () => {
    // 1.000 win pct over 4 games, k=40 -> barely moves off .500
    const shrunk = shrinkCareerWinPct(1, 4);
    expect(shrunk).toBeGreaterThan(0.5);
    expect(shrunk).toBeLessThan(0.55);
  });

  it("30-game coach is heavily shrunk but not fully", () => {
    const shrunk = shrinkCareerWinPct(0.8, 30); // k=40
    expect(shrunk).toBeGreaterThan(0.6);
    expect(shrunk).toBeLessThan(0.68);
  });

  it("150+ game coach is mostly observed", () => {
    const shrunk = shrinkCareerWinPct(0.7, 200); // k=40 -> 200/240 weight on obs
    expect(shrunk).toBeGreaterThan(0.66);
  });

  it("reliability modifier: 0 under 17 games, ramps, 1 at 50+", () => {
    expect(reliabilityModifier(0)).toBe(0);
    expect(reliabilityModifier(16)).toBe(0);
    expect(reliabilityModifier(17)).toBeCloseTo(0.5, 5);
    expect(reliabilityModifier(50)).toBe(1);
    expect(reliabilityModifier(200)).toBe(1);
    const mid = reliabilityModifier(33);
    expect(mid).toBeGreaterThan(0.5);
    expect(mid).toBeLessThan(1);
  });
});

describe("computeCoachRating", () => {
  const prior = COACHING_RATING_V1.transform.center;

  it("frozen params: version + no ATS weight anywhere", () => {
    expect(COACHING_RATING_VERSION).toBe("coaching-v1.0.0");
    const keys = JSON.stringify(COACHING_RATING_V1.weights);
    expect(keys).not.toMatch(/ats/i);
    expect(Object.keys(COACHING_RATING_V1.weights).sort()).toEqual(
      ["intercept", "w_career_win_pct", "w_win_over_expectation"],
    );
  });

  it("no signal -> league-average prior, flagged", () => {
    const r = computeCoachRating({ career_games: 0 });
    expect(r.coaching_rating).toBe(prior);
    expect(r.rating_is_prior).toBe(true);
    expect(r.first_year).toBe(true);
    expect(r.raw_z).toBe(0);
  });

  it("4-game elite record does NOT produce an elite rating", () => {
    const r = computeCoachRating({
      win_over_expectation_per_game: 0.4,
      win_over_expectation_n: 4,
      career_win_pct: 1,
      career_games: 4,
    });
    expect(r.coaching_rating).toBeLessThan(prior + 5);
    expect(r.first_year).toBe(true);
  });

  it("strong 120-game resume lands above average, deterministic, no NaN", () => {
    const input = {
      win_over_expectation_per_game: 0.08,
      win_over_expectation_n: 120,
      career_win_pct: 0.66,
      career_games: 120,
    };
    const a = computeCoachRating(input);
    const b = computeCoachRating(input);
    expect(a).toEqual(b);
    expect(a.coaching_rating).toBeGreaterThan(prior);
    expect(Number.isFinite(a.raw_score)).toBe(true);
    expect(Number.isFinite(a.raw_z)).toBe(true);
    expect(a.small_sample).toBe(false);
  });

  it("30-game coach deviation is capped by the reliability modifier", () => {
    const full = computeCoachRating({
      win_over_expectation_per_game: 0.15, win_over_expectation_n: 120,
      career_win_pct: 0.72, career_games: 120,
    });
    const small = computeCoachRating({
      win_over_expectation_per_game: 0.15, win_over_expectation_n: 30,
      career_win_pct: 0.72, career_games: 30,
    });
    expect(Math.abs(small.coaching_rating - prior)).toBeLessThan(Math.abs(full.coaching_rating - prior));
    expect(small.small_sample).toBe(true);
  });

  it("transform stays inside [0,100]", () => {
    const lo = computeCoachRating({
      win_over_expectation_per_game: -0.6, win_over_expectation_n: 300,
      career_win_pct: 0.05, career_games: 300,
    });
    const hi = computeCoachRating({
      win_over_expectation_per_game: 0.6, win_over_expectation_n: 300,
      career_win_pct: 0.95, career_games: 300,
    });
    expect(lo.coaching_rating).toBeGreaterThanOrEqual(0);
    expect(hi.coaching_rating).toBeLessThanOrEqual(100);
  });
});

describe("ranking + advantage", () => {
  it("assignRanks orders by rating desc, 1-based, dense sequence", () => {
    const ranked = assignRanks([
      { coaching_rating: 40, raw_z: -1 },
      { coaching_rating: 60, raw_z: 1 },
      { coaching_rating: 50, raw_z: 0 },
    ]);
    expect(ranked.map((r) => [r.coaching_rating, r.rating_rank])).toEqual([
      [60, 1], [50, 2], [40, 3],
    ]);
  });

  it("coaching advantage: HOME / AWAY / EVEN around threshold 4", () => {
    expect(coachingAdvantage(65, 50)).toBe("HOME");
    expect(coachingAdvantage(50, 65)).toBe("AWAY");
    expect(coachingAdvantage(54, 50)).toBe("EVEN"); // diff 4 -> EVEN
    expect(coachingAdvantage(55, 50)).toBe("HOME"); // diff 5 -> HOME
    expect(coachingAdvantage(50, 50)).toBe("EVEN");
    expect(coachingAdvantage(50, NaN)).toBe("EVEN");
  });

  it("ratingBand matches the published legend edges", () => {
    expect(ratingBand(95)).toBe("elite");
    expect(ratingBand(50)).toBe("average");
    expect(ratingBand(39)).toBe("below average");
    expect(ratingBand(10)).toBe("extreme");
  });
});

describe("buildCoachingRatings artifact", () => {
  const rows = [
    ...season("Anne Ace", "ARI", 2022, 13, 4),
    ...season("Anne Ace", "ARI", 2023, 12, 5),
    ...season("Anne Ace", "ARI", 2024, 11, 6),
    ...season("Anne Ace", "ARI", 2025, 12, 5),
    ...season("Bob Blank", "ATL", 2024, 4, 13),
    ...season("Bob Blank", "ATL", 2025, 3, 14),
    // 2026 schedule (uncompleted) naming both current coaches + one true first-year
    g({ id: "2026_01_BBB_AAA", season: 2026, week: 1, home: "ARI", away: "ATL", hc: "Anne Ace", ac: "Bob Blank" }),
    g({ id: "2026_02_CCC_AAA", season: 2026, week: 2, home: "ARI", away: "BAL", hc: "Anne Ace", ac: "Rook Newman" }),
    g({ id: "2026_03_BBB_CCC", season: 2026, week: 3, home: "BAL", away: "ATL", hc: "Rook Newman", ac: "Bob Blank" }),
  ];
  const art = buildCoachingRatings(rows);

  it("emits exactly the current head coaches, ranked", () => {
    expect(art.coaches.map((c) => c.team).sort()).toEqual(["ari", "atl", "bal"]);
    expect(art.coaches.map((c) => c.rating_rank)).toEqual([1, 2, 3]);
    expect(art.ratingVersion).toBe("coaching-v1.0.0");
  });

  it("winning coach outranks losing coach; first-year gets the prior", () => {
    const byTeam = Object.fromEntries(art.coaches.map((c) => [c.team, c]));
    expect(byTeam.ari.coaching_rating).toBeGreaterThan(byTeam.atl.coaching_rating);
    expect(byTeam.bal.rating_is_prior).toBe(true);
    expect(byTeam.bal.first_year).toBe(true);
    expect(byTeam.bal.coaching_rating).toBe(50);
  });

  it("ATS records are present as context but never a weighted field", () => {
    const c = art.coaches.find((x) => x.team === "ari");
    expect(c.career_ats).toMatch(/^\d+-\d+/);
    expect(c).not.toHaveProperty("career_ats_weight");
    expect(JSON.stringify(art.fittedParameters)).not.toMatch(/ats/i);
  });

  it("study metadata records the ATS-context-only decision", () => {
    expect(art.study.model_decision).toMatch(/ANALYSIS CONTEXT/);
    expect(art.study.signal_classifications.ats_all_windows).toMatch(/CONTEXT-ONLY|DROP/);
  });

  it("matchupCoachingAdvantage returns a valid designation", () => {
    const m = matchupCoachingAdvantage(art, "ari", "atl");
    expect(m.status).toBe("OK");
    expect(["HOME", "AWAY", "EVEN"]).toContain(m.coaching_advantage_team);
    expect(m.coaching_differential).toBe(m.home_coaching_rating - m.away_coaching_rating);
    expect(matchupCoachingAdvantage(art, "ari", "zzz").status).toBe("COACH_UNRATED");
  });
});
