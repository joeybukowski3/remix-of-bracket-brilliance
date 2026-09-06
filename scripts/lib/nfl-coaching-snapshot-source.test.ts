import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCoachingSnapshotSelector } from "./nfl-coaching-snapshot-source";
import { buildCoachingContext } from "./nfl-game-context";

let root: string;

const HISTORICAL_SNAPSHOT = {
  rating_version: "coaching-v1.0.0",
  season: 2021,
  week: 3,
  generated_from_cutoff: "2021-09-23T00:00:00.000Z",
  source_timestamp: "2026-09-06T00:00:00Z",
  coaches: [
    { coach_id: "old-a", coach: "Old A", team: "lar", coaching_rating: 55, career_wl: "40-20", tenure_wl: "40-20", season_wl: "2-0", career_ats: "30-28-2", tenure_ats: "30-28-2", season_ats: "1-1", recent_ats: "9-8", tenure_year: 5, small_sample: false, first_year: false, interim: false },
    { coach_id: "old-b", coach: "Old B", team: "sf", coaching_rating: 48, career_wl: "30-30", tenure_wl: "30-30", season_wl: "1-1", career_ats: "29-29-2", tenure_ats: "29-29-2", season_ats: "1-1", recent_ats: "8-9", tenure_year: 5, small_sample: false, first_year: false, interim: false },
  ],
};

const CURRENT_RATINGS = {
  _meta: { season: 2026, generatedAt: "2026-09-06T15:38:21.304Z" },
  ratingVersion: "coaching-v1.0.0",
  sourceCutoff: "completed games through 2025 season",
  coaches: [
    { coach_id: "new-a", coach: "New A", team: "lar", coaching_rating: 62, career_wl: "10-7", last17_ats: "9-8", tenure_year: 2, small_sample: true, first_year: false, interim: false },
    { coach_id: "new-b", coach: "New B", team: "sf", coaching_rating: 50, career_wl: "0-0", last17_ats: "0-0", tenure_year: 1, small_sample: true, first_year: true, interim: false },
  ],
};

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "coaching-src-"));
  mkdirSync(join(root, "public", "data", "nfl"), { recursive: true });
  mkdirSync(join(root, "data", "nfl", "coaching", "rating-snapshots", "2021"), { recursive: true });
  writeFileSync(join(root, "public", "data", "nfl", "coaching-ratings.json"), JSON.stringify(CURRENT_RATINGS));
  writeFileSync(
    join(root, "data", "nfl", "coaching", "rating-snapshots", "2021", "3.json"),
    JSON.stringify(HISTORICAL_SNAPSHOT)
  );
  writeFileSync(
    join(root, "data", "nfl", "coaching", "coach-effective-overrides.json"),
    JSON.stringify({ overrides: [] })
  );
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("createCoachingSnapshotSelector", () => {
  it("joins the point-in-time historical snapshot for a 2016–2025 game", () => {
    const selector = createCoachingSnapshotSelector(root);
    const snap = selector({ season: 2021, week: 3, kickoffUtc: "2021-09-26T17:00:00.000Z" });
    expect(snap?.coaches.find((c) => c.team === "lar")?.coach).toBe("Old A");
    const context = buildCoachingContext({
      snapshot: snap,
      homeTeam: "lar",
      awayTeam: "sf",
      gameKickoffUtc: "2021-09-26T17:00:00.000Z",
    });
    expect(context.coaching_context_status).toBe("OK");
    expect(context.home_coaching_rating).toBe(55);
  });

  it("uses the current-ratings adapter for a 2026 game", () => {
    const selector = createCoachingSnapshotSelector(root);
    const snap = selector({ season: 2026, week: 1, kickoffUtc: "2026-09-10T00:20:00.000Z" });
    expect(snap?.coaches.find((c) => c.team === "lar")?.coach).toBe("New A");
    expect(snap?.generated_from_cutoff).toBe("2026-03-01T00:00:00.000Z");
  });

  it("returns null (never a current-ratings fallback) for a historical game with no snapshot file", () => {
    const selector = createCoachingSnapshotSelector(root);
    expect(selector({ season: 2019, week: 5, kickoffUtc: "2019-10-06T17:00:00.000Z" })).toBeNull();
  });

  it("refuses a historical snapshot whose cutoff is after the game (leak guard)", () => {
    const selector = createCoachingSnapshotSelector(root);
    expect(selector({ season: 2021, week: 3, kickoffUtc: "2021-09-22T00:00:00.000Z" })).toBeNull();
  });
});
