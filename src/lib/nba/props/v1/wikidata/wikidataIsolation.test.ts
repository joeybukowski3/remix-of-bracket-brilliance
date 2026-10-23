/**
 * Guards the constraints on the folded-in Wikidata position tooling: it is read-only, reads no secret, never touches the
 * odds, quota, rights registry or board code, and the only module that can reach the network is the probe, through an
 * injected fetch. These checks read source text only.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dir = __dirname;
const repoRoot = path.resolve(dir, "../../../../../..");
const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
const read = (file: string) => readFileSync(path.join(dir, file), "utf8");
const importsOf = (text: string) => [...text.matchAll(/(?:from\s+|import\s*\()\s*["']([^"']+)["']/g)].map((m) => m[1]);

const ALLOWED_IMPORT = /^(\.\/wikidata[A-Za-z]*|\.\/pathGuard|\.\.\/\.\.\/dvpPositions|node:(crypto|fs|path))$/;

describe("Wikidata position tooling isolation", () => {
  it("finds the modules under test", () => {
    expect(sources.sort()).toEqual(["pathGuard.ts", "wikidataProbe.ts", "wikidataQueries.ts", "wikidataSnapshot.ts", "wikidataTypes.ts"]);
  });

  it.each(sources)("%s imports only approved modules", (file) => {
    expect(importsOf(read(file)).filter((spec) => !ALLOWED_IMPORT.test(spec))).toEqual([]);
  });

  it.each(sources)("%s reads no environment variable or credential", (file) => {
    expect(read(file)).not.toMatch(/process\.env|api[_-]?key|ODDS_API|["']authorization["']\s*[:,]|\bbearer\b|\.env\b/i);
  });

  it("only the probe can reach the network, and only through an injected fetch", () => {
    for (const file of sources) {
      const text = read(file);
      expect(text, file).not.toMatch(/\b(XMLHttpRequest|WebSocket|https?\.request|node:https?|node:net|node:dgram)\b/);
      if (file !== "wikidataProbe.ts") expect(text, file).not.toMatch(/\bfetch\s*\(/);
    }
    expect(read("wikidataProbe.ts")).toMatch(/deps\.fetch\(/);
    expect(read("wikidataProbe.ts")).not.toMatch(/(?<![.\w])fetch\s*\(/);
  });

  it("names no host other than Wikidata, and no paid or odds provider", () => {
    const hosts = new Set(sources.flatMap((f) => [...read(f).matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase())));
    const unexpected = [...hosts].filter((h) => !/(^|\.)(wikidata\.org|mediawiki\.org|wikimedia\.org|github\.com|wikiba\.se|w3\.org)$/.test(h));
    expect(unexpected).toEqual([]);
    for (const file of sources) expect(read(file), file).not.toMatch(/the-odds-api|odds-api\.com|api-sports\.io|balldontlie\.io|sportsdata\.io|nba\.com\/stats/i);
  });

  it("does not modify the source license registry, profiles or any rights record, and the registry does not mention Wikidata", () => {
    for (const file of sources) expect(read(file), file).not.toMatch(/SOURCE_LICENSES\s*(\[[^\]]*\]\s*)?=[^=]|SOURCE_PROFILES\s*(\[[^\]]*\]\s*)?=[^=]|Object\.assign\(\s*SOURCE_/);
    expect(readFileSync(path.join(dir, "../../sources/licenses.ts"), "utf8")).not.toMatch(/wikidata/i);
  });

  it("is reached only by the V1 position mapper (types only), the probe script and this folder", () => {
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) => {
        if (e.name === "node_modules" || e.name.startsWith(".")) return [];
        const full = path.join(d, e.name);
        return e.isDirectory() ? walk(full) : /\.(ts|tsx|mts|mjs|js)$/.test(e.name) ? [full] : [];
      });
    const files = [...walk(path.join(repoRoot, "src")), ...walk(path.join(repoRoot, "scripts")), ...walk(path.join(repoRoot, "api"))];
    const importers = files
      .filter((f) => !f.startsWith(dir))
      .filter((f) => importsOf(readFileSync(f, "utf8")).some((spec) => /\/wikidata\/|props\/v1\/wikidata/.test(spec)))
      .map((f) => path.relative(repoRoot, f).split(path.sep).join("/"));
    expect(importers.sort()).toEqual(["scripts/nba-wikidata-position-probe.ts", "src/lib/nba/props/v1/positionMapper.ts"]);
  }, 60_000);

  it("is not imported by any page, component, hook or the public board builder", () => {
    const board = ["pipeline/boardBuild.ts", "propsBoard.ts"].map((f) => readFileSync(path.join(dir, "../..", f), "utf8"));
    for (const text of board) expect(importsOf(text).filter((s) => /wikidata/i.test(s))).toEqual([]);
  });

  it("the position mapper uses the folder for constants and the snapshot shape only, never the network modules", () => {
    const mapper = readFileSync(path.join(dir, "../positionMapper.ts"), "utf8");
    expect(importsOf(mapper).filter((s) => /wikidata/i.test(s))).toEqual(["./wikidata/wikidataTypes"]);
  });
});
