/**
 * Pure sitemap XML helpers: canonical URL normalization/validation and
 * rendering of <urlset> and <sitemapindex> documents.
 *
 * No I/O and no clock access. Output is a pure function of the entries passed
 * in, so regenerating from unchanged inputs is byte-identical.
 *
 * lastmod policy: an entry carries `lastmod` only when its builder read a real
 * modification date from a data source. There is no default, no build date
 * and no "today" -- an entry without a trustworthy date simply omits the tag.
 */

export const SITE_ORIGIN = "https://www.joeknowsball.com";
export const SITEMAP_NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9";

export type SitemapUrlEntry = {
  /** Site-relative canonical path, e.g. "/nfl/power-ratings". */
  path: string;
  /** W3C date (YYYY-MM-DD or full ISO timestamp) from a real data source. */
  lastmod?: string;
};

export type SitemapChild = {
  /** File name served at the site root, e.g. "sitemap-nfl.xml". */
  file: string;
  lastmod?: string;
};

const PATH_PATTERN = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/;
const LASTMOD_PATTERN = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/;
const SITEMAP_FILE_PATTERN = /^sitemap(?:-[a-z0-9]+)*\.xml$/;

/**
 * Throws unless `path` is a clean canonical path: leading slash, lowercase
 * kebab-case segments, no trailing slash (except "/"), no query, no fragment,
 * no encoded or empty segments.
 */
export function assertCanonicalPath(path: string): void {
  if (!PATH_PATTERN.test(path)) {
    throw new Error(`Invalid sitemap path ${JSON.stringify(path)}: expected a lowercase, slash-separated canonical path with no query, fragment or trailing slash.`);
  }
}

export function assertLastmod(lastmod: string, context: string): void {
  if (!LASTMOD_PATTERN.test(lastmod) || Number.isNaN(Date.parse(lastmod))) {
    throw new Error(`Invalid lastmod ${JSON.stringify(lastmod)} for ${context}: expected a W3C date.`);
  }
}

export function toAbsoluteUrl(path: string): string {
  assertCanonicalPath(path);
  return path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path}`;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function lastmodLine(lastmod: string | undefined, context: string): string {
  if (lastmod === undefined) return "";
  assertLastmod(lastmod, context);
  return `\n    <lastmod>${escapeXml(lastmod)}</lastmod>`;
}

export function renderUrlset(entries: readonly SitemapUrlEntry[]): string {
  const seen = new Set<string>();
  const body = entries
    .map((entry) => {
      const loc = toAbsoluteUrl(entry.path);
      if (seen.has(loc)) throw new Error(`Duplicate sitemap URL ${loc}`);
      seen.add(loc);
      return `  <url>\n    <loc>${escapeXml(loc)}</loc>${lastmodLine(entry.lastmod, loc)}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${SITEMAP_NAMESPACE}">\n${body}\n</urlset>\n`;
}

export function renderSitemapIndex(children: readonly SitemapChild[]): string {
  const body = children
    .map((child) => {
      if (!SITEMAP_FILE_PATTERN.test(child.file)) throw new Error(`Invalid child sitemap file name ${child.file}`);
      const loc = `${SITE_ORIGIN}/${child.file}`;
      return `  <sitemap>\n    <loc>${escapeXml(loc)}</loc>${lastmodLine(child.lastmod, loc)}\n  </sitemap>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="${SITEMAP_NAMESPACE}">\n${body}\n</sitemapindex>\n`;
}

/** Latest lastmod among entries, or undefined when none carries one. */
export function latestLastmod(entries: readonly SitemapUrlEntry[]): string | undefined {
  let latest: string | undefined;
  for (const entry of entries) {
    if (entry.lastmod === undefined) continue;
    if (latest === undefined || Date.parse(entry.lastmod) > Date.parse(latest)) latest = entry.lastmod;
  }
  return latest;
}
