import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EPA_METRIC_KEYS,
  composeMetricResolvers,
  createEpaResolver,
  epaGameIds,
  epaWindowId,
  formatEpa,
  isEpaMetric,
  type EpaArtifact,
} from "@/lib/nfl/epaData";
import {
  createMatchupMetricResolver,
  type MatchupMetricsArtifact,
} from "@/lib/nfl/matchupMetricsData";
import { computeRanks, selectWindowGames } from "../../../scripts/lib/nfl-matchup-metrics.mjs";
import type { NflMatchupSampleSettings } from "@/lib/nfl/matchupSampleWindow";

const ROOT = resolve(__dirname, "../../..");
const EPA = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/matchup-epa.json"), "utf8")) as EpaArtifact;
const CONVENTIONAL = JSON.parse(
  readFileSync(join(ROOT, "public/data/nfl/matchup-metrics.json"), "utf8")
) as MatchupMetricsArtifact;

const SLUGS = new Map([
  ["new-england-patriots", "ne"],
  ["seattle-seahawks", "sea"],
  ["kansas-city-chiefs", "kc"],
  ["philadelphia-eagles", "phi"],
]);

const settings = (
  window: "season" | "last5",
  includePriorSeason: boolean
): NflMatchupSampleSettings => ({ window, includePriorSeason });

describe("window ids", () => {
  it("maps the four control states to the shared artifact keys", () => {
    expect(epaWindowId(settings("season", true))).toBe("season-blend");
    expect(epaWindowId(settings("season", false))).toBe("season-current");
    expect(epaWindowId(settings("last5", true))).toBe("last5-blend");
    expect(epaWindowId(settings("last5", false))).toBe("last5-current");
  });
});

describe("formatting", () => {
  it("renders signed three-decimal EPA", () => {
    expect(formatEpa(0.128)).toBe("+0.128");
    expect(formatEpa(-0.043)).toBe("-0.043");
    expect(formatEpa(0.2150)).toBe("+0.215");
  });

  it("renders zero unsigned", () => {
    expect(formatEpa(0)).toBe("0.000");
    expect(formatEpa(0.0001)).toBe("0.000");
  });

  it("renders a missing value as N/A, never zero", () => {
    expect(formatEpa(null)).toBe("N/A");
    expect(formatEpa(undefined)).toBe("N/A");
    expect(formatEpa(Number.NaN)).toBe("N/A");
    expect(formatEpa(null)).not.toBe("0.000");
  });
});

describe("selection guard", () => {
  it("claims exactly the six EPA metrics", () => {
    expect([...EPA_METRIC_KEYS]).toEqual([
      "off.epaPerPlay", "off.epaPerPass", "off.epaPerRush",
      "def.epaPerPlayAllowed", "def.epaPerPassAllowed", "def.epaPerRushAllowed",
    ]);
    for (const key of EPA_METRIC_KEYS) expect(isEpaMetric(key), key).toBe(true);
  });

  it("claims nothing else, so success rate and trenches stay with their own pipelines", () => {
    for (const key of [
      "off.successRate", "def.successRateAllowed", "off.passBlockWinRate",
      "def.passRushWinRate", "off.yardsPerPlay", "mkt.atsRecord",
    ]) {
      expect(isEpaMetric(key), key).toBe(false);
    }
  });
});

describe("resolver", () => {
  const resolve = createEpaResolver(EPA, settings("season", true), SLUGS);

  it("resolves all six metrics for a known team", () => {
    for (const key of EPA_METRIC_KEYS) {
      const value = resolve("seattle-seahawks", key);
      expect(value, key).not.toBeNull();
      expect(value!.formattedValue, key).toMatch(/^([+-]\d+\.\d{3}|0\.000)$/);
      expect(Number.isFinite(value!.value!), key).toBe(true);
    }
  });

  it("returns null for non-EPA keys so it can be composed safely", () => {
    expect(resolve("seattle-seahawks", "off.yardsPerPlay")).toBeNull();
    expect(resolve("seattle-seahawks", "off.successRate")).toBeNull();
  });

  it("returns null for unknown teams and a missing artifact", () => {
    expect(resolve("not-a-team", "off.epaPerPlay")).toBeNull();
    expect(createEpaResolver(null, settings("season", true), SLUGS)("seattle-seahawks", "off.epaPerPlay")).toBeNull();
  });

  it("returns null for a control state with no completed games", () => {
    // No 2026 games exist yet, so blend-OFF is legitimately empty.
    const current = createEpaResolver(EPA, settings("season", false), SLUGS);
    expect(current("seattle-seahawks", "off.epaPerPlay")).toBeNull();
  });

  it("changes value when the sample control changes", () => {
    const season = createEpaResolver(EPA, settings("season", true), SLUGS);
    const last5 = createEpaResolver(EPA, settings("last5", true), SLUGS);
    const a = season("kansas-city-chiefs", "off.epaPerPlay")!.value;
    const b = last5("kansas-city-chiefs", "off.epaPerPlay")!.value;
    expect(a).not.toBe(b);
    expect(a).toBeCloseTo(-0.103, 3);
    expect(b).toBeCloseTo(-0.269, 3);
  });
});

describe("composed resolver", () => {
  const composed = composeMetricResolvers(
    createEpaResolver(EPA, settings("season", true), SLUGS),
    createMatchupMetricResolver(CONVENTIONAL, settings("season", true), SLUGS)
  );

  it("serves EPA from the EPA artifact", () => {
    const value = composed("seattle-seahawks", "off.epaPerPlay");
    expect(value).not.toBeNull();
    expect(value!.source).toMatch(/play-by-play/i);
  });

  it("still serves conventional metrics from the Phase 2 artifact", () => {
    const value = composed("seattle-seahawks", "off.yardsPerPlay");
    expect(value).not.toBeNull();
    expect(value!.source).not.toMatch(/play-by-play/i);
  });

  it("leaves genuinely unavailable metrics null", () => {
    expect(composed("seattle-seahawks", "off.successRate")).toBeNull();
    expect(composed("seattle-seahawks", "mkt.atsRecord")).toBeNull();
  });
});

describe("window membership matches Phase 2 exactly", () => {
  it("selects identical game ids for every team and control state", () => {
    let compared = 0;
    for (const id of ["season-blend", "season-current", "last5-blend", "last5-current"]) {
      const epaWindow = EPA.windows[id];
      const convWindow = CONVENTIONAL.windows[id];
      for (const [abbr, team] of Object.entries(epaWindow.teams)) {
        const conv = convWindow.teams[abbr];
        expect(conv, `${id}/${abbr} missing from the conventional artifact`).toBeDefined();
        expect(team.gameIds, `${id}/${abbr}`).toEqual(conv.gameIds);
        expect(team.gamesIncluded, `${id}/${abbr}`).toBe(conv.gamesIncluded);
        expect(team.seasons, `${id}/${abbr}`).toEqual(conv.seasons);
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(50);
  });

  it("exposes the backing game ids for auditing", () => {
    const ids = epaGameIds(EPA, settings("last5", true), "ne");
    expect(ids).toHaveLength(5);
    expect(ids.every((id) => id.startsWith("2025_"))).toBe(true);
  });
});

describe("shared window selection", () => {
  const games = (spec: [number, number][]) =>
    spec.map(([season, week]) => ({
      gameId: `${season}_${String(week).padStart(2, "0")}_X_Y`,
      season, week, dateUtc: `${season}-09-${String(week).padStart(2, "0")}T17:00:00.000Z`,
    }));
  const opts = { currentSeason: 2026, priorSeason: 2025 };
  const prior = games([[2025, 11], [2025, 12], [2025, 13], [2025, 15], [2025, 16], [2025, 17], [2025, 18]]);
  const pick = (teamGames: unknown[], mode: string, includePriorSeason: boolean) =>
    (selectWindowGames(teamGames, { mode, includePriorSeason, ...opts }) as { gameId: string; season: number }[]);

  it("preseason blend ON + Season uses the prior season's final games", () => {
    const out = pick(prior, "season", true);
    expect(out.every((g) => g.season === 2025)).toBe(true);
    expect(out).toHaveLength(7); // only 7 prior games exist in this fixture
  });

  it("preseason blend ON + Last 5 uses the prior season's final five", () => {
    const out = pick(prior, "last5", true);
    expect(out).toHaveLength(5);
    expect(out.map((g) => g.gameId)).toEqual(prior.slice(-5).map((g) => g.gameId));
  });

  it("preseason blend OFF yields nothing, so EPA is N/A", () => {
    expect(pick(prior, "season", false)).toHaveLength(0);
    expect(pick(prior, "last5", false)).toHaveLength(0);
  });

  it("rolls 7 prior + 1 current", () => {
    const all = [...games([[2025, 12], [2025, 13], [2025, 14], [2025, 15], [2025, 16], [2025, 17], [2025, 18]]), ...games([[2026, 1]])];
    const out = pick(all, "season", true);
    expect(out).toHaveLength(8);
    expect(out.filter((g) => g.season === 2026)).toHaveLength(1);
    expect(out.filter((g) => g.season === 2025)).toHaveLength(7);
  });

  it("rolls 4 prior + 4 current", () => {
    const all = [...prior, ...games([[2026, 1], [2026, 2], [2026, 3], [2026, 4]])];
    const out = pick(all, "season", true);
    expect(out).toHaveLength(8);
    expect(out.filter((g) => g.season === 2026)).toHaveLength(4);
    expect(out.filter((g) => g.season === 2025)).toHaveLength(4);
  });

  it("lets Last 5 cross the season boundary", () => {
    const all = [...prior, ...games([[2026, 1], [2026, 2]])];
    const out = pick(all, "last5", true);
    expect(out).toHaveLength(5);
    expect(out.filter((g) => g.season === 2026)).toHaveLength(2);
    expect(out.filter((g) => g.season === 2025)).toHaveLength(3);
  });

  it("uses current-season games only when blend is OFF", () => {
    const all = [...prior, ...games([[2026, 1], [2026, 2], [2026, 3]])];
    expect(pick(all, "season", false).every((g) => g.season === 2026)).toBe(true);
    expect(pick(all, "last5", false)).toHaveLength(3);
  });

  it("drops the prior season entirely once eight current games exist", () => {
    const all = [...prior, ...games([[2026, 1], [2026, 2], [2026, 3], [2026, 4], [2026, 5], [2026, 6], [2026, 7], [2026, 8]])];
    const out = pick(all, "season", true);
    expect(out).toHaveLength(8);
    expect(out.every((g) => g.season === 2026)).toBe(true);
  });

  it("counts games, not weeks, so a bye changes nothing", () => {
    // Week 14 is missing from `prior`; the window still reaches back five games.
    const out = pick(prior, "last5", true);
    expect(out.map((g) => g.week)).toEqual([13, 15, 16, 17, 18]);
  });
});

describe("ranking", () => {
  it("ranks offense higher-is-better and defense lower-is-better", () => {
    const values = { a: 0.2, b: 0.1, c: -0.1 };
    expect(computeRanks(values, "higher-is-better")).toEqual({ a: 1, b: 2, c: 3 });
    expect(computeRanks(values, "lower-is-better")).toEqual({ c: 1, b: 2, a: 3 });
  });

  it("uses competition ranking on ties", () => {
    expect(computeRanks({ a: 0.2, b: 0.2, c: 0.1 }, "higher-is-better")).toEqual({ a: 1, b: 1, c: 3 });
  });

  it("does not rank null or non-finite values", () => {
    const ranks = computeRanks({ a: 0.2, b: null, c: Number.NaN, d: 0.1 }, "higher-is-better");
    expect(ranks).toEqual({ a: 1, d: 2 });
  });

  it("ranks on unrounded values, so display rounding cannot move a team", () => {
    // Both display as +0.123 but are genuinely different.
    const ranks = computeRanks({ a: 0.12344, b: 0.12345 }, "higher-is-better");
    expect(ranks).toEqual({ b: 1, a: 2 });
    expect(formatEpa(0.12344)).toBe(formatEpa(0.12345));
  });
});

describe("generated artifact", () => {
  it("declares schema, attribution and the eligible-play filter", () => {
    expect(EPA.schemaVersion).toBe("nfl-matchup-epa-v1");
    expect(EPA.attribution).toBe("EPA data: nflverse / nflfastR");
    expect(EPA._meta.notes.join(" ")).toMatch(/two_point_attempt != 1/);
    expect(EPA._meta.notes.join(" ")).toMatch(/scrambles count as PASS/i);
  });

  it("records that raw play-by-play was not committed", () => {
    const p = EPA.provenance as { rawPlayByPlayCommitted: boolean; opponentJoinCoverage: { requestedTeamGames: number; resolvedTeamGames: number } };
    expect(p.rawPlayByPlayCommitted).toBe(false);
    expect(p.opponentJoinCoverage.resolvedTeamGames).toBe(p.opponentJoinCoverage.requestedTeamGames);
  });

  it("contains no derived matchup score, edge, spread or probability", () => {
    const { _meta, ...data } = EPA;
    const json = JSON.stringify(data);
    expect(json).not.toMatch(/edge|matchupScore|projectedSpread|winProb|favorite|pickedWinner/i);
  });

  it("carries auditable numerators and denominators for every team-window", () => {
    for (const [id, window] of Object.entries(EPA.windows)) {
      for (const [abbr, team] of Object.entries(window.teams)) {
        const label = `${id}/${abbr}`;
        expect(team.totals.offense.offPlays, label).toBeGreaterThan(0);
        expect(team.totals.defense.offPlays, label).toBeGreaterThan(0);
        expect(
          team.totals.offense.passPlays + team.totals.offense.rushPlays,
          label
        ).toBe(team.totals.offense.offPlays);
        // The stored value must equal the ratio of the stored totals.
        const expected = team.totals.offense.offEpa / team.totals.offense.offPlays;
        expect(team.metrics["off.epaPerPlay"][0], label).toBeCloseTo(expected, 3);
      }
    }
  });

  it("reproduces the audited 2025 Last 8 values", () => {
    const cases: [string, number, number, number][] = [
      // team, EPA/play, off EPA numerator, play denominator
      ["ne", 0.215, 107.69, 501],
      ["sea", -0.010, -5.09, 511],
      ["kc", -0.103, -52.19, 506],
      ["phi", -0.009, -4.38, 508],
    ];
    for (const [abbr, epaPerPlay, numerator, denominator] of cases) {
      const team = EPA.windows["season-blend"].teams[abbr];
      expect(team.gamesIncluded, abbr).toBe(8);
      expect(team.metrics["off.epaPerPlay"][0], abbr).toBeCloseTo(epaPerPlay, 3);
      expect(team.totals.offense.offEpa, abbr).toBeCloseTo(numerator, 1);
      expect(team.totals.offense.offPlays, abbr).toBe(denominator);
    }
  });

  it("reproduces the audited 2025 Last 5 values", () => {
    const cases: [string, number][] = [["ne", 0.279], ["sea", 0.023], ["kc", -0.269], ["phi", 0.034]];
    for (const [abbr, expected] of cases) {
      const team = EPA.windows["last5-blend"].teams[abbr];
      expect(team.gamesIncluded, abbr).toBe(5);
      expect(team.metrics["off.epaPerPlay"][0], abbr).toBeCloseTo(expected, 3);
    }
  });

  it("gives every team a rank in a populated window", () => {
    const window = EPA.windows["season-blend"];
    expect(Object.keys(window.teams)).toHaveLength(32);
    for (const key of EPA_METRIC_KEYS) {
      const ranks = Object.values(window.teams).map((t) => t.metrics[key][1]);
      expect(ranks.every((r) => r != null && r >= 1 && r <= 32), key).toBe(true);
      expect(Math.min(...(ranks as number[])), key).toBe(1);
    }
  });
});
