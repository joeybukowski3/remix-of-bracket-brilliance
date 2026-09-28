import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CANONICAL_BASE } from "@/hooks/usePageSeo";
import { getNflSeasonGuide } from "@/lib/nfl/guideData";
import { getMatchupBySlug } from "@/lib/nfl/matchups";
import { nflTeamCanonicalUrl } from "@/lib/nfl/teamPageSeo";
import { getAllTeams, getConferenceBySlug, getTeamBySlug } from "@/data/cfb";
import { researchStudies } from "@/data/researchStudies";
import { GENERATED_PGA_TOURNAMENTS } from "@/data/pga/generated/registry";
import { rbcHeritage2026Tournament } from "@/data/pga/tournaments/rbc-heritage-2026";
import { generateSitemaps, SITEMAP_INDEX_FILE } from "./seo-sitemap";
import {
  EXCLUDED_ROUTES,
  NFL_SITEMAP_SEASON,
  loadNflSeasonGames,
  matchExcludedRoute,
} from "./seo-sitemap-routes";
import { SITE_ORIGIN, SITEMAP_NAMESPACE, renderUrlset, toAbsoluteUrl } from "./seo-sitemap-xml";

const ROOT = resolve(__dirname, "..", "..");
const { sections, files } = generateSitemaps();

function parseXml(xml: string, name: string): Document {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const error = doc.getElementsByTagName("parsererror")[0];
  if (error) throw new Error(`${name} is malformed XML: ${error.textContent}`);
  return doc;
}

function textOf(doc: Document, tag: string): string[] {
  return Array.from(doc.getElementsByTagNameNS(SITEMAP_NAMESPACE, tag)).map((node) => node.textContent ?? "");
}

/** Every child sitemap parsed as XML: file -> absolute <loc> values. */
const childLocs = new Map(
  sections.map((section) => [section.file, textOf(parseXml(files.get(section.file)!, section.file), "loc")])
);
const allLocs = [...childLocs.values()].flat();
const allPaths = allLocs.map((loc) => (loc === `${SITE_ORIGIN}/` ? "/" : loc.slice(SITE_ORIGIN.length)));
const locsIn = (file: string) => childLocs.get(file) ?? [];
const pathsIn = (file: string, prefix: string) =>
  locsIn(file).map((loc) => loc.slice(SITE_ORIGIN.length)).filter((path) => path.startsWith(prefix));

describe("XML helpers", () => {
  it.each(["/nfl?week=2", "/nfl#top", "/nfl/", "/NFL", "nfl", "//nfl", "/nfl//teams", "/nfl/a b", "/nfl/%20"])(
    "rejects non-canonical path %s",
    (path) => {
      expect(() => toAbsoluteUrl(path)).toThrow();
    }
  );

  it("builds absolute https www URLs", () => {
    expect(toAbsoluteUrl("/")).toBe("https://www.joeknowsball.com/");
    expect(toAbsoluteUrl("/nfl/power-ratings")).toBe("https://www.joeknowsball.com/nfl/power-ratings");
  });

  it("uses the same canonical origin as the page metadata hook", () => {
    expect(SITE_ORIGIN).toBe(CANONICAL_BASE);
  });

  it("rejects duplicate URLs and invalid lastmod values", () => {
    expect(() => renderUrlset([{ path: "/nfl" }, { path: "/nfl" }])).toThrow(/Duplicate/);
    expect(() => renderUrlset([{ path: "/nfl", lastmod: "yesterday" }])).toThrow(/lastmod/);
    expect(renderUrlset([{ path: "/nfl", lastmod: "2026-09-01" }])).toContain("<lastmod>2026-09-01</lastmod>");
  });
});

describe("sitemap index", () => {
  const index = parseXml(files.get(SITEMAP_INDEX_FILE)!, SITEMAP_INDEX_FILE);

  it("is a <sitemapindex> in the sitemaps.org namespace", () => {
    expect(index.documentElement.localName).toBe("sitemapindex");
    expect(index.documentElement.namespaceURI).toBe(SITEMAP_NAMESPACE);
  });

  it("references exactly the generated child sitemaps, each of which is committed in public/", () => {
    const referenced = textOf(index, "loc");
    expect(referenced).toEqual(sections.map((section) => `${SITE_ORIGIN}/${section.file}`));
    for (const section of sections) {
      expect(files.has(section.file)).toBe(true);
      expect(() => readFileSync(resolve(ROOT, "public", section.file), "utf8")).not.toThrow();
    }
  });
});

describe("child sitemaps", () => {
  it("are well-formed <urlset> documents with at least one URL", () => {
    for (const section of sections) {
      const doc = parseXml(files.get(section.file)!, section.file);
      expect(doc.documentElement.localName, section.file).toBe("urlset");
      expect(doc.documentElement.namespaceURI, section.file).toBe(SITEMAP_NAMESPACE);
      expect(locsIn(section.file).length, section.file).toBeGreaterThan(0);
    }
  });

  it("contain only absolute https www URLs with no query, fragment, trailing slash or escaping artifacts", () => {
    for (const loc of allLocs) {
      const url = new URL(loc);
      expect(url.protocol, loc).toBe("https:");
      expect(url.host, loc).toBe("www.joeknowsball.com");
      expect(url.search, loc).toBe("");
      expect(url.hash, loc).toBe("");
      expect(loc === `${SITE_ORIGIN}/` || !loc.endsWith("/"), loc).toBe(true);
      expect(loc, loc).not.toMatch(/&|%|\s/);
    }
  });

  it("contain no duplicate URLs within or across files", () => {
    expect(new Set(allLocs).size).toBe(allLocs.length);
  });

  it("never list excluded, internal, export, tool or redirect-only routes", () => {
    for (const path of allPaths) {
      expect(matchExcludedRoute(path), path).toBeUndefined();
      expect(path, path).not.toMatch(/x-export|\/internal\/|^\/ncaa|\/dfs$|\/custom$|\/analyzer$|\/table$/);
    }
    for (const rule of Object.keys(EXCLUDED_ROUTES)) {
      expect(allPaths.some((path) => (rule.endsWith("/*") ? path.startsWith(rule.slice(0, -1)) : path === rule)), rule).toBe(false);
    }
  });

  it("keep known high-value routes", () => {
    const required = [
      "/",
      "/mlb",
      "/mlb/hr-props",
      "/mlb/strikeout-props",
      "/mlb/batter-vs-pitcher",
      "/pga",
      "/pga/best-bets",
      "/pga/model",
      "/pga/top-40-golf-picks",
      "/nfl",
      "/nfl/power-ratings",
      "/nfl/standings",
      "/nfl/schedule",
      "/nfl/matchups",
      "/nfl/guide",
      "/fantasy-football/weekly-rankings",
      "/college-football",
      "/college-football/rankings",
      "/college-football/schedule",
      "/research-studies",
      "/support",
    ];
    for (const path of required) expect(allPaths, path).toContain(path);
  });
});

describe("data-derived URLs resolve through the pages' own resolvers", () => {
  const guide = getNflSeasonGuide(NFL_SITEMAP_SEASON)!;

  it("lists all 32 NFL team pages at /nfl/teams/:teamSlug, each resolving to a guide team", () => {
    const teamLocs = locsIn("sitemap-nfl-teams.xml");
    const teamPaths = pathsIn("sitemap-nfl-teams.xml", "/nfl/teams/");
    expect(teamLocs).toHaveLength(32);
    expect(teamPaths).toHaveLength(32);
    expect(new Set(teamPaths).size).toBe(32);
    for (const path of teamPaths) {
      const slug = path.slice("/nfl/teams/".length);
      expect(slug, path).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(guide.teamBySlug.get(slug), path).toBeDefined();
    }
    // Same slugs, same order-independent set, as the page's canonical builder.
    expect(new Set(teamLocs)).toEqual(new Set(guide.teams.map((team) => nflTeamCanonicalUrl(team.slug))));
  });

  it("lists no legacy /nfl/guide/team/ URLs in any sitemap", () => {
    expect(allPaths.filter((path) => path.startsWith("/nfl/guide/team/"))).toEqual([]);
    const committed = readFileSync(resolve(ROOT, "public", "sitemap-nfl-teams.xml"), "utf8");
    expect(committed).not.toContain("/nfl/guide/team/");
    expect(committed.match(/<loc>https:\/\/www\.joeknowsball\.com\/nfl\/teams\/[a-z0-9-]+<\/loc>/g)).toHaveLength(32);
  });

  it("lists one unique matchup URL per resolvable regular-season game, each found by getMatchupBySlug", () => {
    const games = loadNflSeasonGames();
    const regular = games.filter((game) => game.seasonType === "REG" && game.season === NFL_SITEMAP_SEASON);
    const matchupPaths = pathsIn("sitemap-nfl-matchups.xml", "/nfl/matchups/");
    expect(matchupPaths).toHaveLength(locsIn("sitemap-nfl-matchups.xml").length);
    expect(new Set(matchupPaths).size).toBe(matchupPaths.length);
    expect(matchupPaths.length).toBe(regular.length);
    for (const path of matchupPaths) {
      const slug = path.slice("/nfl/matchups/".length);
      const matchup = getMatchupBySlug(games, guide, slug);
      expect(matchup, path).not.toBeNull();
      expect(matchup!.seasonType, path).toBe("REG");
    }
  });

  it("lists every CFB team and conference, each resolving to real data", () => {
    const teamPaths = pathsIn("sitemap-cfb.xml", "/college-football/team/");
    const conferencePaths = pathsIn("sitemap-cfb.xml", "/college-football/conference/");
    expect(teamPaths).toHaveLength(getAllTeams().length);
    for (const path of teamPaths) expect(getTeamBySlug(path.split("/").pop()!), path).toBeDefined();
    expect(conferencePaths.length).toBeGreaterThan(0);
    for (const path of conferencePaths) expect(getConferenceBySlug(path.split("/").pop()!), path).toBeDefined();
    expect(pathsIn("sitemap-cfb.xml", "/college-football/matchup/")).toEqual([]);
  });

  it("lists every research study and only indexable PGA tournament pages", () => {
    for (const study of researchStudies) expect(allPaths).toContain(`/research-studies/${study.slug}`);
    for (const tournament of [rbcHeritage2026Tournament, ...GENERATED_PGA_TOURNAMENTS]) {
      expect(allPaths).toContain(`/pga/${tournament.slug}`);
    }
    expect(allPaths).not.toContain("/pga/wells-fargo-championship-2026-picks");
  });
});

describe("lastmod honesty", () => {
  const lastmods = [...files.values()].flatMap((xml) => Array.from(xml.matchAll(/<lastmod>([^<]*)<\/lastmod>/g), (match) => match[1]));

  it("never stamps a blanket date: no shared value across many URLs and never today's date", () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const value of lastmods) expect(value.slice(0, 10)).not.toBe(today);
    const counts = new Map<string, number>();
    for (const value of lastmods) counts.set(value, (counts.get(value) ?? 0) + 1);
    for (const [value, count] of counts) expect(count, `lastmod ${value} repeated`).toBeLessThanOrEqual(1);
  });

  it("the generator never reads the clock or file timestamps", () => {
    for (const file of ["scripts/generate-seo-files.ts", "scripts/lib/seo-sitemap.ts", "scripts/lib/seo-sitemap-routes.ts", "scripts/lib/seo-sitemap-xml.ts"]) {
      const source = readFileSync(resolve(ROOT, file), "utf8");
      expect(source, file).not.toMatch(/new Date\(|Date\.now|statSync|mtime/);
    }
  });
});

describe("committed files and build wiring", () => {
  it("public/ sitemaps match the generator output (run npm run seo:generate)", () => {
    for (const [name, content] of files) {
      const committed = readFileSync(resolve(ROOT, "public", name), "utf8").replace(/\r\n/g, "\n");
      expect(committed, name).toBe(content);
    }
  });

  it("robots.txt declares the sitemap index without blanket disallows", () => {
    const robots = readFileSync(resolve(ROOT, "public", "robots.txt"), "utf8");
    expect(robots).toMatch(/^Sitemap: https:\/\/www\.joeknowsball\.com\/sitemap\.xml\r?$/m);
    expect(robots).not.toMatch(/^Disallow:\s*\S/m);
  });

  it("regenerates sitemaps before every production build", () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts.prebuild).toBe("npm run seo:generate");
    expect(pkg.scripts["seo:generate"]).toBe("tsx scripts/generate-seo-files.ts");
  });
});
