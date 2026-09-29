import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePageSeo } from "@/lib/seo/pageSeoHead";
import {
  escapeHtmlAttr,
  injectPrerenderedDocument,
  renderSeoHead,
  serializeJsonForScript,
  summarizeDocument,
  validateDocument,
} from "./prerender-html";

/** The real source template: the built dist/index.html differs only in asset URLs. */
const TEMPLATE = readFileSync(resolve(__dirname, "..", "..", "index.html"), "utf8");

const BILLS = resolvePageSeo({
  title: "Buffalo Bills 2026 Team Rankings, Stats & Schedule | Joe Knows Ball",
  description: 'Bills "team" page <with> & markup',
  path: "/nfl/teams/buffalo-bills",
  structuredData: [{ "@type": "SportsTeam", name: "</script><b>x" }, { "@type": "BreadcrumbList" }],
});

const buildBills = () =>
  injectPrerenderedDocument({
    template: TEMPLATE,
    headHtml: renderSeoHead(BILLS, [{ id: "faq", data: { "@type": "FAQPage" } }]),
    bodyHtml: '<main><h1>Buffalo Bills</h1><svg><title>icon</title></svg><p>Team content</p></main>',
  });

describe("injectPrerenderedDocument", () => {
  it("replaces the shell's homepage head with exactly one route-specific set", () => {
    const summary = summarizeDocument(buildBills());
    expect(summary.titles).toEqual(["Buffalo Bills 2026 Team Rankings, Stats & Schedule | Joe Knows Ball"]);
    expect(summary.canonicals).toEqual(["https://www.joeknowsball.com/nfl/teams/buffalo-bills"]);
    expect(summary.ogUrls).toEqual(["https://www.joeknowsball.com/nfl/teams/buffalo-bills"]);
    expect(summary.robots).toEqual(["index, follow, max-image-preview:large"]);
    expect(summary.descriptions).toEqual(['Bills "team" page <with> & markup']);
    expect(summary.jsonLdTypes).toEqual(["SportsTeam", "BreadcrumbList", "FAQPage"]);
  });

  it("leaves no homepage canonical, og:url or title behind", () => {
    const doc = buildBills();
    expect(doc).not.toContain('href="https://www.joeknowsball.com/"');
    expect(doc).not.toContain('content="https://www.joeknowsball.com/"');
    expect(doc).not.toContain("MLB Props, PGA Golf Models");
  });

  it("keeps each og:* and twitter:* key exactly once", () => {
    const head = buildBills().split("<body")[0];
    const keys = [...head.matchAll(/<meta (?:name|property)="((?:og|twitter):[^"]+)"/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(10);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("tags JSON-LD so the client's first effect replaces it instead of duplicating it", () => {
    const doc = buildBills();
    expect(doc.match(/data-jkb-structured-data="true"/g)).toHaveLength(2);
    expect(doc).toContain('data-seo-jsonld="faq"');
  });

  it("escapes attribute values and keeps JSON-LD from closing its script element", () => {
    const doc = buildBills();
    expect(doc).toContain(`content="${escapeHtmlAttr('Bills "team" page <with> & markup')}"`);
    expect(doc).not.toContain("</script><b>x");
    expect(serializeJsonForScript({ a: "</script>" })).toBe('{"a":"\\u003c/script\\u003e"}');
    expect(JSON.parse(serializeJsonForScript({ a: "</script>&" }))).toEqual({ a: "</script>&" });
  });

  it("fills #root, marks <html>, drops the generic noscript, and keeps the app, analytics and ads scripts", () => {
    const doc = buildBills();
    expect(doc).toContain('<div id="root"><main><h1>Buffalo Bills</h1>');
    expect(doc).toContain('<html lang="en" data-jkb-prerendered="true">');
    expect(doc).not.toContain("<noscript>");
    expect(doc).toContain("googletagmanager.com/gtag/js");
    expect(doc).toContain("adsbygoogle.js");
    expect(doc).toContain('src="/src/main.tsx"');
    expect(doc).toContain('<meta name="author" content="Joe Knows Ball" />');
  });

  it("reads head signals from <head> only, ignoring inline SVG titles in the body", () => {
    expect(summarizeDocument(buildBills()).titles).toHaveLength(1);
    expect(summarizeDocument(buildBills()).h1s).toEqual(["Buffalo Bills"]);
  });

  it("is deterministic", () => {
    expect(buildBills()).toBe(buildBills());
  });

  it("refuses a template whose shape it does not recognise", () => {
    const bad = TEMPLATE.replace('<div id="root"></div>', '<div id="root">x</div>');
    expect(() => injectPrerenderedDocument({ template: bad, headHtml: "", bodyHtml: "" })).toThrow(/#root/);
    const twoTitles = TEMPLATE.replace("</head>", "<title>again</title></head>");
    expect(() => injectPrerenderedDocument({ template: twoTitles, headHtml: "", bodyHtml: "" })).toThrow(/<title>/);
  });
});

describe("validateDocument", () => {
  const expected = {
    canonicalUrl: "https://www.joeknowsball.com/nfl/teams/buffalo-bills",
    title: "Buffalo Bills 2026 Team Rankings, Stats & Schedule | Joe Knows Ball",
    robots: "index, follow, max-image-preview:large",
    jsonLdCount: 3,
  };

  it("accepts a correct document", () => {
    expect(validateDocument(buildBills(), expected)).toEqual([]);
  });

  it("flags duplicates, wrong values, a missing marker and an empty root", () => {
    const duplicated = buildBills().replace("</head>", '<link rel="canonical" href="https://www.joeknowsball.com/" /></head>');
    expect(validateDocument(duplicated, expected)).toContain("canonical: expected 1, found 2");
    expect(validateDocument(buildBills(), { ...expected, title: "Other" })[0]).toMatch(/^title: expected "Other"/);
    expect(validateDocument(buildBills(), { ...expected, jsonLdCount: 2 })).toContain("JSON-LD: expected 2, found 3");
    expect(validateDocument(TEMPLATE, expected)).toEqual(
      expect.arrayContaining(["missing prerender marker on <html>", "#root is empty"]),
    );
  });
});
