import { describe, expect, it } from "vitest";
import { buildRatingSnapshots, selectSnapshotForGame } from "./nfl-coach-rating-snapshot.mjs";

const g = (o) => ({
  game_id: o.id,
  season: String(o.season),
  game_type: o.type ?? "REG",
  week: String(o.week),
  gameday: o.day ?? `${o.season}-09-10`,
  gametime: o.time ?? "13:00",
  home_team: o.home,
  away_team: o.away,
  home_score: o.hs == null ? "" : String(o.hs),
  away_score: o.as == null ? "" : String(o.as),
  spread_line: o.spread == null ? "" : String(o.spread),
  home_coach: o.hc,
  away_coach: o.ac,
  home_qb_name: o.hqb ?? "",
  away_qb_name: o.aqb ?? "",
  home_rest: "7",
  away_rest: "7",
  div_game: "0",
});

// Two franchises, two coaches, three seasons of a single weekly game each.
function fixtureRows() {
  const rows = [];
  for (const season of [2021, 2022, 2023]) {
    for (let week = 1; week <= 3; week += 1) {
      const kcHome = week % 2 === 1;
      rows.push(
        g({
          id: `${season}_0${week}_KC_LAC`,
          season,
          week,
          day: `${season}-09-${String(9 + week).padStart(2, "0")}`,
          home: kcHome ? "KC" : "LAC",
          away: kcHome ? "LAC" : "KC",
          hs: kcHome ? 27 : 17,
          as: kcHome ? 17 : 27, // KC always wins by 10
          spread: kcHome ? 3 : -3,
          hc: kcHome ? "Andy Reid" : "Brandon Staley",
          ac: kcHome ? "Brandon Staley" : "Andy Reid",
        })
      );
    }
  }
  return rows;
}

describe("buildRatingSnapshots — leakage-safe point-in-time ratings", () => {
  const opts = { seasons: [2022, 2023], sourceTimestamp: "t" };

  it("week 1 ingests zero current-season results", () => {
    const { snapshots } = buildRatingSnapshots(fixtureRows(), opts);
    const wk1 = snapshots.get("2022/1");
    expect(wk1).toBeTruthy();
    const reid = wk1.coaches.find((c) => c.coach_id === "andy-reid");
    // 2021 had 3 games; none from 2022
    expect(reid.career_games).toBe(3);
    expect(reid.season_wl).toBe("0-0");
  });

  it("week 2 ingests week 1 but not week 2 (target never feeds itself)", () => {
    const { snapshots } = buildRatingSnapshots(fixtureRows(), opts);
    const wk2 = snapshots.get("2022/2");
    const reid = wk2.coaches.find((c) => c.coach_id === "andy-reid");
    expect(reid.career_games).toBe(4); // 3 (2021) + 1 (2022 wk1)
    expect(reid.season_wl).toBe("1-0");
    const wk3 = snapshots.get("2022/3");
    expect(wk3.coaches.find((c) => c.coach_id === "andy-reid").career_games).toBe(5);
  });

  it("generated_from_cutoff is strictly before the week's first kickoff and gates consumption", () => {
    const { snapshots } = buildRatingSnapshots(fixtureRows(), opts);
    const wk2 = snapshots.get("2022/2");
    expect(wk2.newest_ingested_kickoff < wk2.generated_from_cutoff).toBe(true);
    // a game kicking off at the week cutoff may consume it
    expect(selectSnapshotForGame(snapshots, 2022, 2, wk2.generated_from_cutoff)).toBe(wk2);
    // a hypothetical snapshot whose cutoff is after the game is refused
    const leaky = { ...wk2, generated_from_cutoff: "2999-01-01T00:00:00.000Z" };
    expect(selectSnapshotForGame({ "2022/2": leaky }, 2022, 2, wk2.generated_from_cutoff)).toBeNull();
  });

  it("is deterministic — identical output across repeated builds", () => {
    const a = buildRatingSnapshots(fixtureRows(), opts).snapshots;
    const b = buildRatingSnapshots(fixtureRows(), opts).snapshots;
    expect(JSON.stringify([...a])).toBe(JSON.stringify([...b]));
  });

  it("ratings use the frozen v1 version and expose reliability + ATS context (not weighted)", () => {
    const { snapshots } = buildRatingSnapshots(fixtureRows(), opts);
    const snap = snapshots.get("2023/1");
    expect(snap.rating_version).toBe("coaching-v1.0.0");
    const reid = snap.coaches.find((c) => c.coach_id === "andy-reid");
    expect(typeof reid.coaching_rating).toBe("number");
    expect(reid).toHaveProperty("career_ats");
    expect(reid).toHaveProperty("recent_ats");
    expect(reid).toHaveProperty("reliability_modifier");
  });

  it("midseason coaching change selects the new coach from the effective week", () => {
    const rows = fixtureRows();
    // LAC fires Staley; Giff Smith takes over from 2023 week 2
    for (const r of rows) {
      if (r.season === "2023" && Number(r.week) >= 2) {
        if (r.home_team === "LAC") r.home_coach = "Giff Smith";
        if (r.away_team === "LAC") r.away_coach = "Giff Smith";
      }
    }
    const { snapshots } = buildRatingSnapshots(rows, { seasons: [2023], sourceTimestamp: "t" });
    const lacWk1 = snapshots.get("2023/1").coaches.find((c) => c.team === "lac");
    const lacWk2 = snapshots.get("2023/2").coaches.find((c) => c.team === "lac");
    expect(lacWk1.coach_id).toBe("brandon-staley");
    expect(lacWk2.coach_id).toBe("giff-smith");
    expect(lacWk2.first_year).toBe(true);
  });
});
