/**
 * Pure string helpers for the build-time prerender (scripts/prerender.ts):
 * serialize a resolved page SEO declaration into head markup, inject it and
 * the rendered body into the built dist/index.html template, and validate the
 * resulting document. No DOM, no network, no clock -- deterministic output.
 */
import type { ResolvedPageSeo } from "@/lib/seo/pageSeoHead";
import type { SeoJsonLdDeclaration } from "@/lib/seo/seoCollector";

/** Set on <html> of every prerendered document; index.html's canonical fix-up script skips such documents. */
export const PRERENDER_MARKER_ATTR = "data-jkb-prerendered";

const HTML_OPEN = '<html lang="en">';
const ROOT_EMPTY = '<div id="root"></div>';

/** Head tags the page's SEO declaration owns; removed from the template before the page's own set is inserted. */
const OWNED_HEAD_TAG_PATTERNS: readonly RegExp[] = [
  /[ \t]*<title>[\s\S]*?<\/title>[ \t]*\r?\n?/gi,
  /[ \t]*<meta\s+name="(?:description|robots|twitter:[^"]+)"[^>]*>[ \t]*\r?\n?/gi,
  /[ \t]*<meta\s+property="og:[^"]+"[^>]*>[ \t]*\r?\n?/gi,
  /[ \t]*<link\s+rel="canonical"[^>]*>[ \t]*\r?\n?/gi,
];

const HEAD_PLACEHOLDER = "<!--jkb-prerender-head-->";

export function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeHtmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** JSON safe inside a <script> element: no `</script>`, comment openers or line-separator surprises. */
export function serializeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(new RegExp(String.fromCharCode(0x2028), "g"), "\\u2028")
    .replace(new RegExp(String.fromCharCode(0x2029), "g"), "\\u2029");
}

/**
 * Head markup equivalent to what usePageSeo + SeoJsonLd write in the browser.
 * The JSON-LD elements carry the same attributes the client uses, so the
 * client's first effect replaces them instead of duplicating them:
 * usePageSeo clears `script[data-jkb-structured-data="true"]`, SeoJsonLd
 * upserts `script[data-seo-jsonld="<id>"]`.
 */
export function renderSeoHead(page: ResolvedPageSeo, jsonLd: readonly SeoJsonLdDeclaration[] = []): string {
  const indent = "    ";
  const lines = [
    `<title>${escapeHtmlText(page.title)}</title>`,
    ...page.metas.map((tag) => `<meta ${tag.attr}="${escapeHtmlAttr(tag.key)}" content="${escapeHtmlAttr(tag.content)}" />`),
    `<link rel="canonical" href="${escapeHtmlAttr(page.canonicalUrl)}" />`,
    ...page.structuredData.map(
      (item) => `<script type="application/ld+json" data-jkb-structured-data="true">${serializeJsonForScript(item)}</script>`,
    ),
    ...jsonLd.map(
      ({ id, data }) =>
        `<script type="application/ld+json" data-seo-jsonld="${escapeHtmlAttr(id)}">${serializeJsonForScript(data)}</script>`,
    ),
  ];
  return lines.map((line, index) => (index === 0 ? line : `${indent}${line}`)).join("\n");
}

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

/** Throws unless `pattern` occurs exactly once; guards against silently injecting into an unexpected template. */
function requireSingle(template: string, literal: string, what: string): void {
  const occurrences = template.split(literal).length - 1;
  if (occurrences !== 1) throw new Error(`prerender template: expected exactly one ${what} (${literal}), found ${occurrences}`);
}

export interface InjectInput {
  template: string;
  headHtml: string;
  bodyHtml: string;
}

/**
 * Builds one prerendered document from the built SPA shell:
 * - replaces the shell's generic title/description/robots/canonical/OG/Twitter tags with the page's own set;
 * - marks <html> so the shell's canonical fix-up script leaves the prerendered canonical alone;
 * - fills #root with the rendered markup (the browser entry uses createRoot, which replaces it on boot);
 * - drops the generic <noscript> fallback, whose MLB/PGA copy and <h1> would contradict the route's content.
 */
export function injectPrerenderedDocument({ template, headHtml, bodyHtml }: InjectInput): string {
  requireSingle(template, HTML_OPEN, "html open tag");
  requireSingle(template, ROOT_EMPTY, "empty #root");
  if (countMatches(template, /<title>/gi) !== 1) throw new Error("prerender template: expected exactly one <title>");
  if (template.includes(HEAD_PLACEHOLDER)) throw new Error("prerender template: already contains the head placeholder");

  let doc = template.replace(/<title>[\s\S]*?<\/title>/i, HEAD_PLACEHOLDER);
  for (const pattern of OWNED_HEAD_TAG_PATTERNS) doc = doc.replace(pattern, "");
  doc = doc.replace(HEAD_PLACEHOLDER, headHtml);
  doc = doc.replace(HTML_OPEN, `<html lang="en" ${PRERENDER_MARKER_ATTR}="true">`);

  const [head, body] = doc.split(/(?=<body)/i);
  if (body === undefined) throw new Error("prerender template: no <body>");
  const bodyWithoutNoscript = body.replace(/[ \t]*<noscript>[\s\S]*?<\/noscript>[ \t]*\r?\n?/gi, "");
  return head + bodyWithoutNoscript.replace(ROOT_EMPTY, `<div id="root">${bodyHtml}</div>`);
}

export interface DocumentExpectation {
  canonicalUrl: string;
  title: string;
  robots: string;
  jsonLdCount: number;
}

export interface DocumentSummary {
  titles: string[];
  canonicals: string[];
  robots: string[];
  descriptions: string[];
  ogUrls: string[];
  jsonLdTypes: string[];
  h1s: string[];
  bodyTextLength: number;
  hasMarker: boolean;
}

const decode = (value: string): string =>
  value.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&amp;/g, "&");

const allCaptures = (text: string, pattern: RegExp): string[] => [...text.matchAll(pattern)].map((match) => decode(match[1]));

export function summarizeDocument(doc: string): DocumentSummary {
  // Head signals are read from <head> only: inline SVG in the body can carry its own <title>.
  const bodyStart = doc.search(/<body/i);
  const head = bodyStart >= 0 ? doc.slice(0, bodyStart) : doc;
  const body = bodyStart >= 0 ? doc.slice(bodyStart) : "";
  const jsonLdTypes = [...head.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => {
    const parsed = JSON.parse(match[1]) as { "@type"?: string } | Array<{ "@type"?: string }>;
    return Array.isArray(parsed) ? parsed.map((item) => item["@type"] ?? "?").join("+") : parsed["@type"] ?? "?";
  });
  const visibleText = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    titles: allCaptures(head, /<title>([\s\S]*?)<\/title>/gi),
    canonicals: allCaptures(head, /<link rel="canonical" href="([^"]*)"/gi),
    robots: allCaptures(head, /<meta name="robots" content="([^"]*)"/gi),
    descriptions: allCaptures(head, /<meta name="description" content="([^"]*)"/gi),
    ogUrls: allCaptures(head, /<meta property="og:url" content="([^"]*)"/gi),
    jsonLdTypes,
    h1s: [...body.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) => decode(match[1].replace(/<[^>]+>/g, "")).trim()),
    bodyTextLength: visibleText.length,
    hasMarker: doc.includes(`${PRERENDER_MARKER_ATTR}="true"`),
  };
}

/** Returns human-readable problems; empty means the document is valid. */
export function validateDocument(doc: string, expected: DocumentExpectation): string[] {
  const summary = summarizeDocument(doc);
  const problems: string[] = [];
  const exactlyOne = (label: string, values: string[], want: string) => {
    if (values.length !== 1) problems.push(`${label}: expected 1, found ${values.length}`);
    else if (values[0] !== want) problems.push(`${label}: expected "${want}", found "${values[0]}"`);
  };
  exactlyOne("title", summary.titles, expected.title);
  exactlyOne("canonical", summary.canonicals, expected.canonicalUrl);
  exactlyOne("og:url", summary.ogUrls, expected.canonicalUrl);
  exactlyOne("robots", summary.robots, expected.robots);
  if (summary.descriptions.length !== 1 || !summary.descriptions[0]) problems.push(`description: expected 1 non-empty, found ${summary.descriptions.length}`);
  if (summary.jsonLdTypes.length !== expected.jsonLdCount) problems.push(`JSON-LD: expected ${expected.jsonLdCount}, found ${summary.jsonLdTypes.length}`);
  if (!summary.hasMarker) problems.push("missing prerender marker on <html>");
  if (/<div id="root"><\/div>/.test(doc)) problems.push("#root is empty");
  return problems;
}
