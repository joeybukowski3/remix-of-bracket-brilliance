import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GAME_COMPLETION_MS,
  NFL_SPREAD_MODEL_VERSION,
  SPREAD_HFA_POINTS,
  SPREAD_PRIOR_K,
  SPREAD_WEIGHTS,
  adjustOnePass,
  buildTeamGameLog,
  compositeStrength,
  fitBeta,
  homeFieldFor,
  indexLogByTeam,
  populationZ,
  priorWeight,
  projectGame,
  teamSample,
  toConventionalSpread,
} from "../../../scripts/lib/nfl-spread-model.mjs";

const HOUR = 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

/** A completed REG game plus both teams' EPA records, in one helper. */
function fixture({
  gameId,
  season = 2025,
  week = 1,
  kickoff,
  home,
  away,
  homeScore = 24,
  awayScore = 17,
  homeOffEpa = 6,
  homeOffPlays = 60,
  awayOffEpa = -3,
  awayOffPlays = 60,
}: {
  gameId: string;
  season?: number;
  week?: number;
  kickoff: number;
  home: string;
  away: string;
  homeScore?: number;
  awayScore?: number;
  homeOffEpa?: number;
  homeOffPlays?: number;
  awayOffEpa?: number;
  awayOffPlays?: number;
}) {
  return {
    game: { gameId, season, week, seasonType: "REG", dateUtc: iso(kickoff), homeAbbr: home, awayAbbr: away },
    result: { gameId, seasonType: "REG", final: true, homeAbbr: home, awayAbbr: away, homeScore, awayScore },
    epa: [
      [`${gameId}|${home}`, { gameId, team: home, opponent: away, offEpa: homeOffEpa, offPlays: homeOffPlays }],
      [`${gameId}|${away}`, { gameId, team: away, opponent: home, offEpa: awayOffEpa, offPlays: awayOffPlays }],
    ] as const,
  };
}

function buildLog(fixtures: ReturnType<typeof fixture>[]) {
  return buildTeamGameLog({
    games: fixtures.map((f) => f.game),
    results: fixtures.map((f) => f.result),
    epaByKey: new Map(fixtures.flatMap((f) => f.epa.map((e) => [e[0], e[1]]))),
  });
}

describe("priorWeight", () => {
  it("returns 1 before any current-season game has been played", () => {
    expect(priorWeight(0)).toBe(1);
  });

  it("decays as K / (K + nCurrent) with K = 2", () => {
    expect(SPREAD_PRIOR_K).toBe(2);
    expect(priorWeight(1)).toBeCloseTo(2 / 3, 12);
    expect(priorWeight(2)).toBeCloseTo(1 / 2, 12);
    expect(priorWeight(4)).toBeCloseTo(1 / 3, 12);
    expect(priorWeight(8)).toBeCloseTo(1 / 5, 12);
  });

  it("never reaches zero, so a prior always retains some influence", () => {
    expect(priorWeight(17)).toBeGreaterThan(0);
  });

  it("rejects a non-integer or negative game count rather than returning NaN", () => {
    expect(() => priorWeight(-1)).toThrow(/non-negative integer/);
    expect(() => priorWeight(1.5)).toThrow(/non-negative integer/);
  });
});

describe("walk-forward sample cutoff", () => {
  const target = Date.parse("2025-09-14T17:00:00.000Z");

  it("excludes a game that kicked off but has not yet finished", () => {
    // Kicked off 3 hours before the target — still in progress under the
    // 3.5-hour completion rule.
    const log = buildLog([
      fixture({ gameId: "2025_02_A_B", kickoff: target - 3 * HOUR, home: "b", away: "a" }),
    ]);
    const rows = indexLogByTeam(log).get("b")!;
    expect(teamSample(rows, { cutoffMs: target, season: 2025 })).toBeNull();
  });

  it("includes a game that finished before kickoff", () => {
    const log = buildLog([
      fixture({ gameId: "2025_02_A_B", kickoff: target - 4 * HOUR, home: "b", away: "a" }),
    ]);
    const rows = indexLogByTeam(log).get("b")!;
    expect(teamSample(rows, { cutoffMs: target, season: 2025 })!.sampleGames).toBe(1);
  });

  it("uses elapsed time, not week number: a later week that already finished counts", () => {
    const log = buildLog([
      fixture({ gameId: "2025_09_A_B", week: 9, kickoff: target - 5 * HOUR, home: "b", away: "a" }),
    ]);
    const rows = indexLogByTeam(log).get("b")!;
    expect(teamSample(rows, { cutoffMs: target, season: 2025 })!.sampleGames).toBe(1);
  });

  it("treats the completion boundary as inclusive", () => {
    const log = buildLog([
      fixture({ gameId: "2025_02_A_B", kickoff: target - GAME_COMPLETION_MS, home: "b", away: "a" }),
    ]);
    const rows = indexLogByTeam(log).get("b")!;
    expect(teamSample(rows, { cutoffMs: target, season: 2025 })!.sampleGames).toBe(1);
  });

  it("never includes the target game in its own sample", () => {
    const log = buildLog([fixture({ gameId: "2025_02_A_B", kickoff: target, home: "b", away: "a" })]);
    const rows = indexLogByTeam(log).get("b")!;
    expect(teamSample(rows, { cutoffMs: target, season: 2025 })).toBeNull();
  });
});

describe("teamSample aggregation", () => {
  const base = Date.parse("2025-10-01T17:00:00.000Z");
  const cutoff = base + 30 * 24 * HOUR;

  it("divides weighted EPA numerators by weighted play denominators, not averaging rates", () => {
    // 10 EPA / 100 plays and 2 EPA / 20 plays. Averaging the two rates gives
    // 0.10; the correct weighted rate is 12/120 = 0.10 here only because the
    // rates match, so use differing rates to make the distinction visible.
    const log = buildLog([
      fixture({
        gameId: "2025_01_A_B",
        kickoff: base,
        home: "b",
        away: "a",
        homeOffEpa: 20,
        homeOffPlays: 100,
      }),
      fixture({
        gameId: "2025_02_C_B",
        week: 2,
        kickoff: base + 7 * 24 * HOUR,
        home: "b",
        away: "c",
        homeOffEpa: 0,
        homeOffPlays: 20,
      }),
    ]);
    const sample = teamSample(indexLogByTeam(log).get("b")!, { cutoffMs: cutoff, season: 2025 })!;
    // Weighted: (20 + 0) / (100 + 20) = 0.16667. Mean of rates would be 0.10.
    expect(sample.off).toBeCloseTo(20 / 120, 12);
    expect(sample.off).not.toBeCloseTo(0.1, 3);
  });

  it("uses a weighted mean over games for point differential, with no play denominator", () => {
    const log = buildLog([
      fixture({ gameId: "2025_01_A_B", kickoff: base, home: "b", away: "a", homeScore: 30, awayScore: 10 }),
      fixture({
        gameId: "2025_02_C_B",
        week: 2,
        kickoff: base + 7 * 24 * HOUR,
        home: "b",
        away: "c",
        homeScore: 10,
        awayScore: 20,
      }),
    ]);
    const sample = teamSample(indexLogByTeam(log).get("b")!, { cutoffMs: cutoff, season: 2025 })!;
    expect(sample.pdg).toBeCloseTo((20 + -10) / 2, 12);
  });

  it("weights prior-season games by K/(K+n) and current-season games by 1", () => {
    const priorKick = Date.parse("2024-10-01T17:00:00.000Z");
    const log = buildLog([
      fixture({ gameId: "2024_01_A_B", season: 2024, kickoff: priorKick, home: "b", away: "a", homeScore: 30, awayScore: 0 }),
      fixture({ gameId: "2025_01_C_B", kickoff: base, home: "b", away: "c", homeScore: 10, awayScore: 20 }),
    ]);
    const sample = teamSample(indexLogByTeam(log).get("b")!, { cutoffMs: cutoff, season: 2025 })!;
    expect(sample.priorWeight).toBeCloseTo(2 / 3, 12);
    expect(sample.priorGames).toBe(1);
    expect(sample.currentGames).toBe(1);
    // (2/3 · 30 + 1 · −10) / (2/3 + 1)
    expect(sample.pdg).toBeCloseTo(((2 / 3) * 30 - 10) / (2 / 3 + 1), 12);
  });

  it("falls back to the full prior season alone when no current games exist", () => {
    const priorKick = Date.parse("2024-10-01T17:00:00.000Z");
    const log = buildLog([
      fixture({ gameId: "2024_01_A_B", season: 2024, kickoff: priorKick, home: "b", away: "a" }),
    ]);
    const sample = teamSample(indexLogByTeam(log).get("b")!, { cutoffMs: cutoff, season: 2025 })!;
    expect(sample.priorWeight).toBe(1);
    expect(sample.priorSeason).toBe(2024);
    expect(sample.currentGames).toBe(0);
  });

  it("applies no recency decay — two identical games carry identical weight", () => {
    const log = buildLog([
      fixture({ gameId: "2025_01_A_B", kickoff: base, home: "b", away: "a", homeScore: 30, awayScore: 0 }),
      fixture({
        gameId: "2025_02_C_B",
        week: 2,
        kickoff: base + 7 * 24 * HOUR,
        home: "b",
        away: "c",
        homeScore: 0,
        awayScore: 30,
      }),
    ]);
    const sample = teamSample(indexLogByTeam(log).get("b")!, { cutoffMs: cutoff, season: 2025 })!;
    // A decayed model would tilt toward the recent −30; flat weighting cancels.
    expect(sample.pdg).toBeCloseTo(0, 12);
  });
});

describe("buildTeamGameLog", () => {
  it("rejects an EPA record whose opponent disagrees with the result", () => {
    const f = fixture({ gameId: "2025_01_A_B", kickoff: Date.now(), home: "b", away: "a" });
    const epa = new Map(f.epa.map((e) => [e[0], { ...e[1] }]));
    epa.get("2025_01_A_B|b")!.opponent = "zz";
    expect(() =>
      buildTeamGameLog({ games: [f.game], results: [f.result], epaByKey: epa })
    ).toThrow(/does not match/);
  });

  it("ignores games that are not completed regular-season games", () => {
    const f = fixture({ gameId: "2025_01_A_B", kickoff: Date.now(), home: "b", away: "a" });
    expect(
      buildTeamGameLog({
        games: [f.game],
        results: [{ ...f.result, final: false }],
        epaByKey: new Map(f.epa.map((e) => [e[0], e[1]])),
      })
    ).toHaveLength(0);
  });
});

describe("populationZ", () => {
  it("divides by N, not N − 1", () => {
    const z = populationZ([1, 2, 3], "test");
    // Population SD of [1,2,3] is sqrt(2/3) ≈ 0.8165; sample SD would be 1.
    expect(z[2]).toBeCloseTo(1 / Math.sqrt(2 / 3), 12);
  });

  it("centres on the mean", () => {
    const z = populationZ([1, 2, 3], "test");
    expect(z.reduce((s: number, v: number) => s + v, 0)).toBeCloseTo(0, 12);
  });

  it("fails hard on zero variance rather than emitting 0/0", () => {
    expect(() => populationZ([5, 5, 5], "flat")).toThrow(/zero or non-finite standard deviation/);
  });
});

describe("compositeStrength", () => {
  const snapshot = (rows: Array<{ team: string; off: number; def: number; pdg: number }>) => {
    const map = new Map(
      rows.map((r) => [r.team, { ...r, opponents: [], sampleGames: 1, sampleGameIds: [] }])
    );
    return compositeStrength(adjustOnePass(map));
  };

  it("weights 0.45 offence, 0.35 inverted defence, 0.20 point differential", () => {
    expect(SPREAD_WEIGHTS).toEqual({ off: 0.45, def: 0.35, pdg: 0.2 });
  });

  it("treats a lower defensive EPA allowed as better", () => {
    const out = snapshot([
      { team: "a", off: 0.1, def: -0.2, pdg: 8 },
      { team: "b", off: 0.1, def: 0.2, pdg: 8 },
      { team: "c", off: 0.0, def: 0.0, pdg: 0 },
    ]);
    expect(out.get("a")!.compositeZ).toBeGreaterThan(out.get("b")!.compositeZ);
  });

  it("returns unclamped, unrounded values", () => {
    const out = snapshot([
      { team: "a", off: 0.4, def: -0.4, pdg: 25 },
      { team: "b", off: -0.4, def: 0.4, pdg: -25 },
      { team: "c", off: 0.0, def: 0.0, pdg: 0 },
    ]);
    const z = out.get("a")!.compositeZ;
    expect(Number.isInteger(z * 10)).toBe(false);
    expect(Math.abs(z)).toBeGreaterThan(0);
  });
});

describe("home field", () => {
  it("is a fixed 2.0 points", () => {
    expect(SPREAD_HFA_POINTS).toBe(2.0);
    expect(homeFieldFor(false)).toBe(2.0);
  });

  it("is exactly zero at a neutral site", () => {
    expect(homeFieldFor(true)).toBe(0);
  });

  it("is not fitted: fitBeta subtracts it as a constant", () => {
    // Two observations whose margins are exactly HFA plus 3·d. Beta must come
    // back as 3 — if HFA were absorbed into the fit, it would not.
    const { beta } = fitBeta([
      { strengthDiff: 1, margin: 3 + SPREAD_HFA_POINTS, neutralSite: false },
      { strengthDiff: -1, margin: -3 + SPREAD_HFA_POINTS, neutralSite: false },
    ]);
    expect(beta).toBeCloseTo(3, 12);
  });
});

describe("fitBeta", () => {
  it("solves the closed form Σ[d·(margin − HFA)] / Σ[d²]", () => {
    const obs = [
      { strengthDiff: 0.5, margin: 6, neutralSite: false },
      { strengthDiff: -1.0, margin: -8, neutralSite: false },
      { strengthDiff: 0.25, margin: 1, neutralSite: true },
    ];
    let num = 0;
    let den = 0;
    for (const o of obs) {
      num += o.strengthDiff * (o.margin - (o.neutralSite ? 0 : SPREAD_HFA_POINTS));
      den += o.strengthDiff ** 2;
    }
    expect(fitBeta(obs).beta).toBeCloseTo(num / den, 12);
  });

  it("throws rather than returning zero when there is nothing to fit", () => {
    expect(() => fitBeta([])).toThrow(/no usable observations/);
  });

  it("throws when every strength difference is zero", () => {
    expect(() =>
      fitBeta([{ strengthDiff: 0, margin: 7, neutralSite: false }])
    ).toThrow(/zero or non-finite denominator/);
  });
});

describe("projectGame", () => {
  it("adds home field to beta × strength difference", () => {
    const p = projectGame({ homeStrength: 0.5, awayStrength: -0.25, neutralSite: false, beta: 4 });
    expect(p.strengthDiff).toBeCloseTo(0.75, 12);
    expect(p.neutralMargin).toBeCloseTo(3, 12);
    expect(p.homeFieldAdvantage).toBe(2);
    expect(p.projectedHomeMargin).toBeCloseTo(5, 12);
  });

  it("omits home field entirely at a neutral site", () => {
    const p = projectGame({ homeStrength: 0.5, awayStrength: -0.25, neutralSite: true, beta: 4 });
    expect(p.homeFieldAdvantage).toBe(0);
    expect(p.projectedHomeMargin).toBeCloseTo(3, 12);
  });

  it("is antisymmetric on a neutral field", () => {
    const a = projectGame({ homeStrength: 0.4, awayStrength: -0.1, neutralSite: true, beta: 4.6 });
    const b = projectGame({ homeStrength: -0.1, awayStrength: 0.4, neutralSite: true, beta: 4.6 });
    expect(a.projectedHomeMargin).toBeCloseTo(-b.projectedHomeMargin, 12);
  });
});

describe("toConventionalSpread", () => {
  const teams = { homeTeam: "sea", awayTeam: "ne" };

  it("gives the favourite a negative line", () => {
    expect(toConventionalSpread(3.36, teams)).toEqual({
      favoriteTeam: "sea",
      line: -3.4,
      display: "SEA -3.4",
    });
  });

  it("flips to the away team on a negative home margin", () => {
    expect(toConventionalSpread(-2.1, teams)).toEqual({
      favoriteTeam: "ne",
      line: -2.1,
      display: "NE -2.1",
    });
  });

  it("reports an exact pick'em", () => {
    expect(toConventionalSpread(0, teams)).toEqual({ favoriteTeam: null, line: 0, display: "PK" });
    expect(toConventionalSpread(0.02, teams).display).toBe("PK");
  });
});

describe("market independence", () => {
  const modelSource = readFileSync(
    resolve(process.cwd(), "scripts/lib/nfl-spread-model.mjs"),
    "utf-8"
  );
  const generatorSource = readFileSync(
    resolve(process.cwd(), "scripts/generate-nfl-matchup-projections.mjs"),
    "utf-8"
  );

  it("keeps the model module free of any market identifier", () => {
    const code = modelSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    for (const term of ["spreadLine", "moneyline", "totalLine", "ats", "overUnder", "vegas", "book"]) {
      expect(code.toLowerCase()).not.toContain(term.toLowerCase());
    }
  });

  it("keeps the generator from importing the market artifact or module", () => {
    expect(generatorSource).not.toContain("matchup-market.json");
    expect(generatorSource).not.toContain("nfl-market-core");
    expect(generatorSource).not.toContain("marketData");
  });

  it("declares in the published artifact that no market input was used", () => {
    const artifact = JSON.parse(
      readFileSync(resolve(process.cwd(), "public/data/nfl/matchup-projections.json"), "utf-8")
    );
    expect(artifact.model.marketInputUsed).toBe(false);
    expect(artifact.model.fittedParameters).toEqual(["beta"]);
  });
});

describe("independence from the display sample control", () => {
  const pageSource = readFileSync(resolve(process.cwd(), "src/pages/NFLMatchupDetail.tsx"), "utf-8");
  const componentSource = readFileSync(
    resolve(process.cwd(), "src/components/nfl/matchups/MatchupModelAnalysis.tsx"),
    "utf-8"
  );

  it("never passes the Season / Last 5 setting into the Model Analysis section", () => {
    const usage = pageSource.slice(
      pageSource.indexOf("<MatchupModelAnalysis"),
      pageSource.indexOf("/>", pageSource.indexOf("<MatchupModelAnalysis"))
    );
    expect(usage).toContain("<MatchupModelAnalysis");
    expect(usage).not.toContain("sampleSettings");
    expect(usage).not.toContain("window");
  });

  it("gives the section no way to read a display window", () => {
    expect(componentSource).not.toContain("WINDOW_IDS");
    expect(componentSource).not.toContain("sampleSettings");
    expect(componentSource).not.toContain("NflMatchupSampleSettings");
  });

  it("fixes the sample by kickoff alone, with no window parameter", () => {
    const target = Date.parse("2025-11-01T17:00:00.000Z");
    const log = buildLog([
      fixture({ gameId: "2025_01_A_B", kickoff: target - 40 * 24 * HOUR, home: "b", away: "a" }),
      fixture({ gameId: "2025_02_C_B", week: 2, kickoff: target - 30 * 24 * HOUR, home: "b", away: "c" }),
      fixture({ gameId: "2025_03_D_B", week: 3, kickoff: target - 20 * 24 * HOUR, home: "b", away: "d" }),
    ]);
    const rows = indexLogByTeam(log).get("b")!;
    // teamSample accepts only a cutoff, a season and K — there is no argument
    // by which a "last 5" view could narrow it.
    expect(teamSample(rows, { cutoffMs: target, season: 2025 })!.sampleGames).toBe(3);
  });
});

describe("published artifact", () => {
  const artifact = JSON.parse(
    readFileSync(resolve(process.cwd(), "public/data/nfl/matchup-projections.json"), "utf-8")
  );

  it("carries the model version and its documented configuration", () => {
    expect(artifact.modelVersion).toBe(NFL_SPREAD_MODEL_VERSION);
    expect(artifact.model.weights).toEqual({ off: 0.45, def: 0.35, pdg: 0.2 });
    expect(artifact.model.priorK).toBe(2);
    expect(artifact.model.homeFieldAdvantage).toBe(2);
    expect(artifact.model.neutralSiteHomeFieldAdvantage).toBe(0);
    expect(artifact.model.opponentAdjustment).toBe("one-pass");
    expect(artifact.model.recency).toMatch(/flat/i);
    expect(artifact.model.epaDefinition).toBe("matchup-epa-v1");
  });

  it("fits beta only on complete prior seasons and lands near the audited value", () => {
    expect(artifact.model.betaFitThrough).toBe(2025);
    expect(artifact.model.betaFitSeasons.every((s: number) => s < 2026)).toBe(true);
    expect(artifact.model.beta).toBeGreaterThan(4.0);
    expect(artifact.model.beta).toBeLessThan(5.2);
  });

  it("projects a full 2026 regular season", () => {
    const games = Object.values(artifact.projections) as Array<Record<string, unknown>>;
    expect(games).toHaveLength(272);
    for (const g of games) {
      expect(Number.isFinite(g.projectedHomeMargin as number)).toBe(true);
      expect(g.season).toBe(2026);
    }
  });

  it("gives every 2026 team a full prior season and no fabricated current-season games", () => {
    for (const g of Object.values(artifact.projections) as Array<Record<string, never>>) {
      for (const side of ["home", "away"] as const) {
        expect(g[side].currentSeasonGames).toBe(0);
        expect(g[side].priorSeason).toBe(2025);
        expect(g[side].priorWeight).toBe(1);
        expect(g[side].priorSeasonGames).toBeGreaterThanOrEqual(16);
      }
    }
  });

  it("keeps the spread notation consistent with the projected margin", () => {
    for (const g of Object.values(artifact.projections) as Array<Record<string, never>>) {
      const margin = g.projectedHomeMargin as unknown as number;
      const spread = g.projectedSpread as unknown as { favoriteTeam: string | null; line: number };
      if (Math.round(margin * 10) === 0) {
        expect(spread.favoriteTeam).toBeNull();
      } else {
        expect(spread.favoriteTeam).toBe(margin > 0 ? g.homeTeam : g.awayTeam);
        expect(spread.line).toBeLessThan(0);
      }
    }
  });

  it("never lets a team's sample reach into the game being projected", () => {
    for (const g of Object.values(artifact.projections) as Array<Record<string, never>>) {
      for (const side of ["home", "away"] as const) {
        expect(g[side].lastSampleGameId).not.toBe(g.gameId);
        // 2026 projections draw entirely on 2025, so no sample id may be a
        // 2026 game.
        expect(String(g[side].lastSampleGameId)).not.toMatch(/^2026_/);
      }
    }
  });
});
