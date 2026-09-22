import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateMatchupMetricsAlignment } from "../../../scripts/validate-nfl-matchup-metrics-alignment.mjs";

const ROOT = resolve(__dirname, "../../..");
const read = (name: string) => JSON.parse(readFileSync(join(ROOT, "public/data/nfl", name), "utf-8"));

const DOWN_KEYS = ["off.firstDownsPerPlay", "def.firstDownsPerPlayAllowed", "off.thirdDownConversion", "def.thirdDownConversionAllowed"];
const EPA_KEYS = ["off.epaPerPlay", "off.epaPerPass", "off.epaPerRush", "def.epaPerPlayAllowed", "def.epaPerPassAllowed", "def.epaPerRushAllowed"];
const WINDOWS = ["last5-blend", "last5-current", "prior-season-full", "season-blend", "season-current"];
const CURRENT_ONLY = new Set(["last5-current", "season-current"]);
const ABBRS = Array.from({ length: 32 }, (_, i) => `t${String(i).padStart(2, "0")}`);

/** A small consistent pair of artifacts; each test then breaks exactly one thing. */
function fixture(currentTeams = ABBRS) {
  const team = (id: string, keys: string[], gameIds: string[]) => ({
    gamesIncluded: gameIds.length,
    gameIds,
    seasons: CURRENT_ONLY.has(id) ? [2026] : [2025, 2026],
    metrics: Object.fromEntries(keys.map((k) => [k, [1.5, 1]])),
  });
  const windows = (keys: string[]) =>
    Object.fromEntries(
      WINDOWS.map((id) => {
        const teams = CURRENT_ONLY.has(id) ? currentTeams : ABBRS;
        return [id, { teams: Object.fromEntries(teams.map((t) => [t, team(id, keys, [`2026_01_${t}`]) ])) }];
      })
    );
  return {
    metrics: { _meta: { currentSeason: 2026, metricKeys: DOWN_KEYS }, windows: windows(DOWN_KEYS) },
    epa: { currentSeason: 2026, metricKeys: EPA_KEYS, windows: windows(EPA_KEYS) },
  };
}

const run = (f: ReturnType<typeof fixture>, finalGames = 17) =>
  validateMatchupMetricsAlignment(f.metrics, f.epa, { finalCurrentSeasonGames: finalGames }).problems;

describe("matchup metric / EPA alignment gate", () => {
  it("passes the committed artifacts", () => {
    const { problems } = validateMatchupMetricsAlignment(read("matchup-metrics.json"), read("matchup-epa.json"), {
      finalCurrentSeasonGames: 1,
    });
    expect(problems).toEqual([]);
  });

  it("rejects two equally stale artifacts against final results", () => {
    const f = fixture();
    const expectedCurrentTeamGames = ABBRS.map((team) => ({ team, gameId: `2026_01_${team}` }));
    expectedCurrentTeamGames.push({ team: "t05", gameId: "2026_02_GB_NYJ" });
    const { problems, summary } = validateMatchupMetricsAlignment(f.metrics, f.epa, { expectedCurrentTeamGames });
    expect(problems.join(" ")).toMatch(/metrics: missing team-games.*epa: missing team-games/);
    expect(summary.metricsCoverage.missingGameIds).toContain("2026_02_GB_NYJ");
  });

  it("passes a consistent pair, and an empty current window when no games are final yet", () => {
    expect(run(fixture())).toEqual([]);
    expect(run(fixture([]), 0)).toEqual([]);
  });

  it("fails when games are final but the current-only windows are empty", () => {
    expect(run(fixture([]), 17).join(" ")).toMatch(/window is empty/);
  });

  it("fails when the two artifacts disagree on the current season", () => {
    const f = fixture();
    f.epa.currentSeason = 2025;
    expect(run(f).join(" ")).toMatch(/currentSeason differs/);
  });

  it("fails when one team's game ids differ between the artifacts (partial-window mismatch)", () => {
    const f = fixture();
    f.epa.windows["season-current"].teams.t05.gameIds = ["2026_01_t05", "2026_02_t05"];
    f.epa.windows["season-current"].teams.t05.gamesIncluded = 2;
    expect(run(f).join(" ")).toMatch(/season-current\/t05: game ids differ/);
  });

  it("fails when a team is present in one artifact's window but not the other", () => {
    const f = fixture();
    delete f.epa.windows["last5-current"].teams.t07;
    expect(run(f).join(" ")).toMatch(/last5-current: team sets differ/);
  });

  it("fails when a full-coverage window has fewer than 32 teams", () => {
    const f = fixture();
    delete f.metrics.windows["season-blend"].teams.t01;
    delete f.epa.windows["season-blend"].teams.t01;
    expect(run(f).join(" ")).toMatch(/season-blend: expected 32 teams, got 31/);
  });

  it("fails when a down metric is missing for a team in the window", () => {
    const f = fixture();
    delete (f.metrics.windows["prior-season-full"].teams.t02.metrics as Record<string, unknown>)["off.thirdDownConversion"];
    expect(run(f).join(" ")).toMatch(/prior-season-full\/t02: off.thirdDownConversion is missing/);
  });

  it("fails when a current-only window contains a non-current-season game", () => {
    const f = fixture();
    f.metrics.windows["season-current"].teams.t03.seasons = [2025, 2026];
    f.epa.windows["season-current"].teams.t03.seasons = [2025, 2026];
    expect(run(f).join(" ")).toMatch(/non-2026 game/);
  });

  it("fails when metricKeys drop a required metric or a window is missing", () => {
    const f = fixture();
    f.metrics._meta.metricKeys = DOWN_KEYS.slice(1);
    expect(run(f).join(" ")).toMatch(/metricKeys is missing off.firstDownsPerPlay/);
    const g = fixture();
    delete (g.epa.windows as Record<string, unknown>)["last5-blend"];
    expect(run(g).join(" ")).toMatch(/matchup-epa windows are/);
  });

  it("rejects unparseable structure instead of throwing", () => {
    expect(validateMatchupMetricsAlignment({}, {}).problems.length).toBeGreaterThan(0);
  });
});
