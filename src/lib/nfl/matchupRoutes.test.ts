import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { getNflSeasonGuide } from "@/lib/nfl/guideData";
import { buildMatchupFromGame } from "@/lib/nfl/matchups";
import type { NflGameRecord } from "@/lib/nfl/standings";
import {
  LEGACY_NFL_MATCHUP_SEASON,
  buildLegacyNflMatchupRedirects,
  findNflMatchup,
  findNflMatchupsBySlug,
  legacyNflMatchupPath,
  nflMatchupPath,
  nflMatchupsWeekPath,
  parseNflMatchupRoute,
  resolveUniqueNflMatchup,
} from "@/lib/nfl/matchupRoutes";

const ROOT = resolve(__dirname, "../../..");
const GAMES: NflGameRecord[] = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/2026/games.json"), "utf-8")).games;
const GUIDE = getNflSeasonGuide(2026)!;
const REGULAR = GAMES.filter((game) => game.seasonType === "REG" && game.season === 2026);
const MATCHUPS = REGULAR.map((game) => buildMatchupFromGame(game, GUIDE)!);

describe("path builders", () => {
  it("builds the canonical season/week path", () => {
    expect(nflMatchupPath({ season: 2026, week: 4, slug: "la-chargers-at-buffalo-bills" })).toBe(
      "/nfl/matchups/2026/week-4/la-chargers-at-buffalo-bills"
    );
  });

  it("builds the legacy and week-landing paths", () => {
    expect(legacyNflMatchupPath("a-at-b")).toBe("/nfl/matchups/a-at-b");
    expect(nflMatchupsWeekPath(7)).toBe("/nfl/matchups?week=7");
  });
});

describe("parseNflMatchupRoute", () => {
  it("parses the canonical segments and lowercases the slug", () => {
    expect(parseNflMatchupRoute({ season: "2026", weekSegment: "week-12", gameSlug: "A-At-B" })).toEqual({
      season: 2026,
      week: 12,
      slug: "a-at-b",
    });
  });

  it.each([
    ["26", "week-1", "a-at-b"],
    ["2026x", "week-1", "a-at-b"],
    ["2026", "week-0", "a-at-b"],
    ["2026", "week-01", "a-at-b"],
    ["2026", "week-100", "a-at-b"],
    ["2026", "Week-1", "a-at-b"],
    ["2026", "1", "a-at-b"],
    ["2026", "week-1", "a_at_b"],
    ["2026", "week-1", "a-at-b-"],
    ["2026", "week-1", ""],
    [undefined, "week-1", "a-at-b"],
  ])("rejects season=%s week=%s slug=%s", (season, weekSegment, gameSlug) => {
    expect(parseNflMatchupRoute({ season, weekSegment, gameSlug })).toBeNull();
  });
});

describe("2026 slug collision audit", () => {
  it("resolves all 272 regular-season games", () => {
    expect(REGULAR).toHaveLength(272);
    expect(MATCHUPS.every(Boolean)).toBe(true);
  });

  it("has no duplicate game slug within the season, so every legacy slug is unambiguous", () => {
    const slugs = MATCHUPS.map((matchup) => matchup.slug);
    const duplicates = slugs.filter((slug, index) => slugs.indexOf(slug) !== index);
    expect(duplicates).toEqual([]);
  });

  it("gives divisional rematches distinct slugs because home and away swap", () => {
    const pairs = new Map<string, string[]>();
    for (const matchup of MATCHUPS) {
      const key = [matchup.away.slug, matchup.home.slug].sort().join("|");
      pairs.set(key, [...(pairs.get(key) ?? []), matchup.slug]);
    }
    const rematches = [...pairs.values()].filter((slugs) => slugs.length > 1);
    expect(rematches.length).toBeGreaterThan(0);
    for (const slugs of rematches) expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("uses -vs- for every neutral-site game and -at- otherwise", () => {
    const neutral = MATCHUPS.filter((matchup) => matchup.neutralSite);
    expect(neutral.length).toBeGreaterThan(0);
    for (const matchup of neutral) expect(matchup.slug).toContain("-vs-");
    for (const matchup of MATCHUPS.filter((m) => !m.neutralSite)) expect(matchup.slug).toContain("-at-");
  });

  it("never resolves a postseason game (policy: REG only), even one reusing a regular-season slug", () => {
    const regular = REGULAR.find((game) => game.week === 18)!;
    const playoff: NflGameRecord = { ...regular, gameId: `${regular.gameId}_WC`, week: 19, seasonType: "WC" };
    const slug = buildMatchupFromGame(regular, GUIDE)!.slug;
    const games = [...GAMES, playoff];
    expect(findNflMatchup(games, GUIDE, { season: 2026, week: 19, slug })).toBeNull();
    expect(resolveUniqueNflMatchup(games, GUIDE, 2026, slug)?.gameId).toBe(regular.gameId);
    expect(buildLegacyNflMatchupRedirects(games, GUIDE)).toEqual(buildLegacyNflMatchupRedirects(GAMES, GUIDE));
  });

  it("resolves every game through its own canonical season/week key and only that key", () => {
    for (const matchup of MATCHUPS) {
      expect(findNflMatchup(GAMES, GUIDE, matchup)?.gameId).toBe(matchup.gameId);
      const wrongWeek = { ...matchup, week: matchup.week === 1 ? 2 : 1 };
      expect(findNflMatchup(GAMES, GUIDE, wrongWeek)).toBeNull();
      expect(findNflMatchup(GAMES, GUIDE, { ...matchup, season: 2027 })).toBeNull();
    }
  });
});

describe("ambiguous slugs (synthetic same-venue rematch)", () => {
  const original = REGULAR.find((game) => game.week === 1 && !game.neutralSite)!;
  const slug = buildMatchupFromGame(original, GUIDE)!.slug;
  const rematch: NflGameRecord = { ...original, gameId: `${original.gameId}_REMATCH`, week: 17 };
  const games = [...GAMES, rematch];

  it("still resolves each game uniquely by season and week", () => {
    expect(findNflMatchupsBySlug(games, GUIDE, 2026, slug)).toHaveLength(2);
    expect(findNflMatchup(games, GUIDE, { season: 2026, week: 1, slug })?.gameId).toBe(original.gameId);
    expect(findNflMatchup(games, GUIDE, { season: 2026, week: 17, slug })?.gameId).toBe(rematch.gameId);
  });

  it("never guesses a game for the ambiguous legacy slug", () => {
    expect(resolveUniqueNflMatchup(games, GUIDE, 2026, slug)).toBeNull();
    const rules = buildLegacyNflMatchupRedirects(games, GUIDE);
    expect(rules.some((rule) => rule.source.includes(`(${slug}|`) || rule.source.includes(`|${slug}|`) || rule.source.includes(`|${slug})`))).toBe(false);
  });
});

/** Compile a Vercel `/nfl/matchups/:gameSlug(a|b)` source into an anchored RegExp. */
function sourceRegExp(source: string): RegExp {
  const match = /^\/nfl\/matchups\/:gameSlug\(([^)]*)\)$/.exec(source);
  if (!match) throw new Error(`unexpected source ${source}`);
  return new RegExp(`^/nfl/matchups/(${match[1]})$`);
}

describe("buildLegacyNflMatchupRedirects", () => {
  const rules = buildLegacyNflMatchupRedirects(GAMES, GUIDE);

  it("emits one permanent rule per 2026 week", () => {
    expect(LEGACY_NFL_MATCHUP_SEASON).toBe(2026);
    expect(rules).toHaveLength(18);
    for (const rule of rules) expect(rule.permanent).toBe(true);
  });

  it("sends every legacy slug to exactly its own season/week URL", () => {
    for (const matchup of MATCHUPS) {
      const legacy = legacyNflMatchupPath(matchup.slug);
      const hits = rules.filter((rule) => sourceRegExp(rule.source).test(legacy));
      expect(hits, matchup.slug).toHaveLength(1);
      expect(hits[0].destination.replace(":gameSlug", matchup.slug)).toBe(nflMatchupPath(matchup));
    }
  });

  it("never matches a canonical URL, an unknown slug or a partial slug (no loops, no guesses)", () => {
    const probes = [
      ...MATCHUPS.map((matchup) => nflMatchupPath(matchup)),
      "/nfl/matchups",
      "/nfl/matchups/not-a-real-game",
      `/nfl/matchups/${MATCHUPS[0].slug}-extra`,
      `/nfl/matchups/x${MATCHUPS[0].slug}`,
    ];
    for (const probe of probes) {
      expect(rules.filter((rule) => sourceRegExp(rule.source).test(probe)), probe).toEqual([]);
    }
  });

  it("is deterministic", () => {
    expect(buildLegacyNflMatchupRedirects([...GAMES].reverse(), GUIDE)).toEqual(rules);
  });
});

describe("production matchup links", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
  }

  it("build detail URLs only through matchupRoutes (no hand-built /nfl/matchups/ paths)", () => {
    const offenders = sourceFiles(join(ROOT, "src"))
      .filter((file) => !file.endsWith(join("lib", "nfl", "matchupRoutes.ts")))
      .filter((file) => /["'`]\/nfl\/matchups\/[^"'`]/.test(readFileSync(file, "utf-8")))
      .map((file) => relative(ROOT, file));
    expect(offenders).toEqual([]);
  });
});
