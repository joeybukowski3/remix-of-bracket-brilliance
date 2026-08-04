import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  EXPECTED_TEAM_COUNT,
  KNOWN_ARTICLE_IDS,
  TEAM_MODULE_HEADLINE,
  TRENCH_COLUMN_MAP,
  TRENCH_METRIC_KEYS,
  articleIdFromUrl,
  buildEspnTeamMap,
  findTeamModule,
  newsUrl,
  parseFreshness,
  parseLeaderboardHeadline,
  parseTeamModule,
  parseTeamSlug,
  parseTrenchCell,
  resolveColumnIndexes,
  selectSeasonArticle,
} from "../../../scripts/lib/nfl-espn-trench.mjs";
import { getMetricDef } from "@/lib/nfl/matchupMetrics";

const ROOT = resolve(__dirname, "../../..");
const TEAMS_JSON = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/teams.json"), "utf-8"));
const TEAM_MAP = buildEspnTeamMap(TEAMS_JSON);
const ALL_ABBRS = [...TEAM_MAP.keys()];

// ---------------------------------------------------------------------------
// Deterministic fixtures — no test calls the live ESPN API.
// ---------------------------------------------------------------------------

function teamCell(abbr: string) {
  return `<a href="https://www.espn.com/nfl/team/_/name/${abbr}/${abbr}-team" data-clubhouse-guid="x">${abbr.toUpperCase()}</a>`;
}

/** Builds a 32-row table with distinct 1-32 ranks per metric. */
function makeTeamModule(overrides: { header?: string[]; body?: unknown[][] } = {}) {
  const body =
    overrides.body ??
    ALL_ABBRS.map((abbr, i) => [
      teamCell(abbr),
      `${30 + (i % 10)}% (${i + 1})`,
      `${28 + (i % 6)}% (${i + 1})`,
      `${60 + (i % 12)}% (${i + 1})`,
      `${68 + (i % 8)}% (${i + 1})`,
    ]);
  return {
    id: 46139163,
    headline: "NFL team win rate rankings",
    moduleType: "table",
    json: { header: overrides.header ?? ["team", "PRWR", "RSWR", "PBWR", "RBWR"], body },
  };
}

function makePayload(module: unknown = makeTeamModule(), extra: Record<string, unknown> = {}) {
  return {
    headlines: [
      {
        id: 46138675,
        headline: "2025 NFL pass rush, run stop, blocking win rate rankings",
        lastModified: "2026-01-06T15:51:59Z",
        story:
          "<p>Some prose.</p><p><em>Last updated: Through all Week 18 games, Jan. 6, 10:30 a.m. ET</em></p>",
        inlines: [
          { headline: "Edge pass rush win rate rankings", json: { header: [], body: [] } },
          module,
          { headline: "IOL run block win rate rankings", json: { header: [], body: [] } },
        ],
        ...extra,
      },
    ],
  };
}

const LABEL = { label: "test" };

// ---------------------------------------------------------------------------

describe("team mapping", () => {
  it("maps all 32 ESPN slugs onto canonical abbreviations", () => {
    expect(TEAM_MAP.size).toBe(32);
    for (const slug of ["buf", "wsh", "lar", "lac", "ne", "sea"]) {
      expect(TEAM_MAP.get(slug), slug).toBe(slug);
    }
  });

  it("rejects a teams file that is not exactly 32 teams", () => {
    expect(() => buildEspnTeamMap({ teams: TEAMS_JSON.teams.slice(0, 30) })).toThrow(/32/);
  });
});

describe("metric mapping", () => {
  it("maps the four analyzer keys onto ESPN columns", () => {
    expect(TRENCH_COLUMN_MAP).toEqual({
      "off.passBlockWinRate": "PBWR",
      "off.runBlockWinRate": "RBWR",
      "def.passRushWinRate": "PRWR",
      "def.runStopWinRate": "RSWR",
    });
  });

  it("matches the UI catalogue, where all four are higher-is-better", () => {
    for (const key of TRENCH_METRIC_KEYS) {
      const def = getMetricDef(key);
      expect(def, key).not.toBeNull();
      expect(def!.direction, key).toBe("higher-is-better");
    }
  });

  it("builds the enable=inlines URL, which is required for table modules", () => {
    expect(newsUrl("46138675")).toBe(
      "https://now.core.api.espn.com/v1/sports/news/46138675?enable=inlines"
    );
  });
});

describe("article discovery", () => {
  const result = (title: string, id: string) => ({
    displayName: title,
    link: { web: `https://www.espn.com/nfl/story/_/id/${id}/slug` },
  });

  it("selects the exact current-season leaderboard", () => {
    const payload = {
      items: [
        result("2025 NFL pass rush, run stop, blocking win rate rankings", "46138675"),
        result("2024 NFL pass rush, run stop, blocking win rate rankings", "41040723"),
      ],
    };
    expect(selectSeasonArticle(payload, 2025).article).toMatchObject({ articleId: "46138675", season: 2025 });
    expect(selectSeasonArticle(payload, 2024).article).toMatchObject({ articleId: "41040723" });
  });

  it("ignores noisy unrelated search results", () => {
    const payload = {
      items: [
        result("Lundy's late block seals Raptors' win over Pacers", "111"),
        result("2026 NFL free agency: Ranking best players still available", "222"),
        result("Boxing divisional rankings: retain rankings with stoppage wins", "333"),
        result("2025 NFL pass rush, run stop, blocking win rate rankings", "46138675"),
      ],
    };
    expect(selectSeasonArticle(payload, 2025).article!.articleId).toBe("46138675");
  });

  it("returns no article when the season is absent rather than guessing", () => {
    const payload = { items: [result("2024 NFL pass rush, run stop, blocking win rate rankings", "41040723")] };
    expect(selectSeasonArticle(payload, 2026).article).toBeNull();
  });

  it("throws when two different articles claim the same season", () => {
    const payload = {
      items: [
        result("2025 NFL pass rush, run stop, blocking win rate rankings", "46138675"),
        result("2025 NFL blocking win rate rankings", "99999999"),
      ],
    };
    expect(() => selectSeasonArticle(payload, 2025)).toThrow(/Ambiguous article discovery/);
  });

  it("parses leaderboard headlines and rejects other headlines", () => {
    expect(parseLeaderboardHeadline("2025 NFL pass rush, run stop, blocking win rate rankings")).toMatchObject({
      season: 2025,
    });
    expect(parseLeaderboardHeadline("2026 NFL free agency: Ranking best players")).toBeNull();
    expect(parseLeaderboardHeadline("NFL win rate rankings")).toBeNull();
  });

  it("extracts the article id from a story url", () => {
    expect(articleIdFromUrl("https://www.espn.com/nfl/story/_/id/46138675/slug")).toBe("46138675");
    expect(articleIdFromUrl("https://www.espn.com/nfl/team/_/name/buf")).toBeNull();
  });

  it("exposes known ids usable as historical fixtures", () => {
    expect(KNOWN_ARTICLE_IDS[2025]).toBe("46138675");
    expect(KNOWN_ARTICLE_IDS[2024]).toBe("41040723");
  });
});

describe("module location", () => {
  it("finds the team module by headline, not by index", () => {
    const module = makeTeamModule();
    const reordered = makePayload();
    // Move the team module to the end; it must still be found.
    reordered.headlines[0].inlines = [
      { headline: "Edge pass rush win rate rankings", json: { header: [], body: [] } },
      { headline: "IOL run block win rate rankings", json: { header: [], body: [] } },
      module,
    ];
    const found = findTeamModule(reordered, LABEL);
    expect(found.module.headline).toBe("NFL team win rate rankings");
    expect(found.module.json.body).toHaveLength(32);
  });

  it("matches the headline case- and whitespace-insensitively", () => {
    const module = { ...makeTeamModule(), headline: "  NFL Team Win Rate Rankings  " };
    expect(findTeamModule(makePayload(module), LABEL).module.json.body).toHaveLength(32);
    expect(TEAM_MODULE_HEADLINE).toBe("nfl team win rate rankings");
  });

  it("rejects an HTML or WAF response", () => {
    expect(() => findTeamModule("<!doctype html><html>", LABEL)).toThrow(/not JSON|HTML|WAF/i);
  });

  it("rejects an empty payload and a payload with no headlines", () => {
    expect(() => findTeamModule({}, LABEL)).toThrow(/no headlines/);
    expect(() => findTeamModule({ headlines: [] }, LABEL)).toThrow(/no headlines/);
  });

  it("rejects an article with no inlines (enable=inlines omitted)", () => {
    const payload = makePayload();
    delete (payload.headlines[0] as { inlines?: unknown }).inlines;
    expect(() => findTeamModule(payload, LABEL)).toThrow(/no inline modules/);
  });

  it("fails clearly when the module headline changes", () => {
    const renamed = { ...makeTeamModule(), headline: "NFL team trench rankings" };
    expect(() => findTeamModule(makePayload(renamed), LABEL)).toThrow(/no inline module titled/);
  });

  it("rejects duplicate team modules", () => {
    const payload = makePayload();
    payload.headlines[0].inlines = [makeTeamModule(), makeTeamModule()];
    expect(() => findTeamModule(payload, LABEL)).toThrow(/2 modules titled/);
  });

  it("rejects a module without structured json", () => {
    const broken = { headline: "NFL team win rate rankings", json: null };
    expect(() => findTeamModule(makePayload(broken), LABEL)).toThrow(/no structured json/);
  });
});

describe("header handling", () => {
  it("resolves the expected header", () => {
    const idx = resolveColumnIndexes(["team", "PRWR", "RSWR", "PBWR", "RBWR"], LABEL);
    expect(idx).toEqual({ team: 0, PRWR: 1, RSWR: 2, PBWR: 3, RBWR: 4 });
  });

  it("tolerates reordered and differently-cased headers", () => {
    const idx = resolveColumnIndexes(["PBWR", "Team", "rbwr", "RSWR", "prwr"], LABEL);
    expect(idx).toEqual({ team: 1, PBWR: 0, RBWR: 2, RSWR: 3, PRWR: 4 });
  });

  it("rejects a missing metric column", () => {
    expect(() => resolveColumnIndexes(["team", "PRWR", "RSWR", "PBWR"], LABEL)).toThrow(/missing the "RBWR"/);
  });

  it("rejects a missing team column", () => {
    expect(() => resolveColumnIndexes(["PRWR", "RSWR", "PBWR", "RBWR"], LABEL)).toThrow(/no "team" column/);
  });

  it("rejects a duplicated metric column", () => {
    expect(() => resolveColumnIndexes(["team", "PBWR", "PBWR", "RSWR", "PRWR", "RBWR"], LABEL)).toThrow(
      /2 "PBWR" columns/
    );
  });
});

describe("cell parsing", () => {
  const opts = { label: "test", rowIndex: 0, column: "PBWR" };

  it("parses the published percentage and ESPN rank", () => {
    expect(parseTrenchCell("71% (4)", opts)).toEqual({ valuePct: 71, espnRank: 4 });
    expect(parseTrenchCell(" 31% (27) ", opts)).toEqual({ valuePct: 31, espnRank: 27 });
  });

  it("keeps whole-number precision without inventing decimals", () => {
    expect(parseTrenchCell("31% (27)", opts).valuePct).toBe(31);
    expect(Number.isInteger(parseTrenchCell("31% (27)", opts).valuePct)).toBe(true);
  });

  it("rejects malformed cells", () => {
    for (const bad of ["71%", "(4)", "71 (4)", "71%(4", "n/a", "", "71.5% (4)"]) {
      expect(() => parseTrenchCell(bad, opts), bad).toThrow();
    }
    expect(() => parseTrenchCell(null as never, opts)).toThrow(/not a string/);
  });

  it("rejects a percentage outside 0-100", () => {
    expect(() => parseTrenchCell("150% (4)", opts)).toThrow(/outside 0-100/);
  });

  it("rejects a rank outside 1-32", () => {
    expect(() => parseTrenchCell("71% (0)", opts)).toThrow(/outside 1-32/);
    expect(() => parseTrenchCell("71% (33)", opts)).toThrow(/outside 1-32/);
  });

  it("parses the team slug from the anchor rather than the visible name", () => {
    expect(parseTeamSlug(teamCell("wsh"), { label: "t", rowIndex: 0 })).toBe("wsh");
    expect(() => parseTeamSlug("Buffalo Bills", { label: "t", rowIndex: 0 })).toThrow(/no parseable team slug/);
  });
});

describe("table validation", () => {
  it("parses a valid 32-team table", () => {
    const teams = parseTeamModule(makeTeamModule(), { teamMap: TEAM_MAP, label: "t" });
    expect(Object.keys(teams)).toHaveLength(EXPECTED_TEAM_COUNT);
    expect(Object.keys(teams.buf.metrics).sort()).toEqual([...TRENCH_METRIC_KEYS].sort());
  });

  it("rejects a wrong row count", () => {
    const short = makeTeamModule({ body: ALL_ABBRS.slice(0, 31).map((a, i) => [teamCell(a), `30% (${i + 1})`, `28% (${i + 1})`, `60% (${i + 1})`, `68% (${i + 1})`]) });
    expect(() => parseTeamModule(short, { teamMap: TEAM_MAP, label: "t" })).toThrow(/expected 32 team rows/);
  });

  it("rejects an unknown team slug", () => {
    const body = ALL_ABBRS.map((a, i) => [teamCell(i === 0 ? "zzz" : a), `30% (${i + 1})`, `28% (${i + 1})`, `60% (${i + 1})`, `68% (${i + 1})`]);
    expect(() => parseTeamModule(makeTeamModule({ body }), { teamMap: TEAM_MAP, label: "t" })).toThrow(
      /unknown ESPN team slug "zzz"/
    );
  });

  it("rejects a duplicate team", () => {
    const body = ALL_ABBRS.map((a, i) => [teamCell(i === 1 ? ALL_ABBRS[0] : a), `30% (${i + 1})`, `28% (${i + 1})`, `60% (${i + 1})`, `68% (${i + 1})`]);
    expect(() => parseTeamModule(makeTeamModule({ body }), { teamMap: TEAM_MAP, label: "t" })).toThrow(
      /duplicate team/
    );
  });

  it("rejects duplicated official ranks within a metric", () => {
    // Two teams sharing rank 1 breaks the distinct 1-32 invariant.
    const body = ALL_ABBRS.map((a, i) => [teamCell(a), `30% (${i === 0 ? 2 : i + 1})`, `28% (${i + 1})`, `60% (${i + 1})`, `68% (${i + 1})`]);
    expect(() => parseTeamModule(makeTeamModule({ body }), { teamMap: TEAM_MAP, label: "t" })).toThrow(
      /official ranks are not distinct/
    );
  });

  it("rejects a missing metric cell", () => {
    const body = ALL_ABBRS.map((a, i) => [teamCell(a), `30% (${i + 1})`, `28% (${i + 1})`, `60% (${i + 1})`, undefined]);
    expect(() => parseTeamModule(makeTeamModule({ body }), { teamMap: TEAM_MAP, label: "t" })).toThrow(
      /RBWR cell is not a string/
    );
  });
});

describe("freshness parsing", () => {
  it("parses the through-week from ESPN's marker", () => {
    expect(parseFreshness("<em>Last updated: Through all Week 18 games, Jan. 6, 10:30 a.m. ET</em>")).toEqual({
      throughWeek: 18,
      sourceUpdatedText: "Last updated: Through all Week 18 games, Jan. 6, 10:30 a.m. ET",
    });
  });

  it("parses a mid-season marker", () => {
    expect(parseFreshness("Last updated: Through Week 4 games, Oct. 1").throughWeek).toBe(4);
  });

  it("returns a null week when it cannot be read safely, keeping the text", () => {
    const r = parseFreshness("Last updated: after the games concluded");
    expect(r.throughWeek).toBeNull();
    expect(r.sourceUpdatedText).toMatch(/Last updated/);
  });

  it("handles a missing freshness marker without throwing", () => {
    expect(parseFreshness("<p>No marker here.</p>")).toEqual({ throughWeek: null, sourceUpdatedText: null });
    expect(parseFreshness(undefined as never)).toEqual({ throughWeek: null, sourceUpdatedText: null });
  });

  it("rejects an implausible week rather than guessing", () => {
    expect(parseFreshness("Last updated: Through Week 99 games").throughWeek).toBeNull();
  });
});
