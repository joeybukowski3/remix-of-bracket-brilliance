/**
 * Pure resolution of a page's SEO declaration into the exact head values
 * usePageSeo writes. It is the single source for both consumers:
 *
 * - usePageSeo applies it to the live document inside an effect (browser);
 * - the build-time prerender (scripts/prerender.ts) serializes it into static
 *   HTML via the SEO collector, because effects never run in renderToString.
 *
 * No DOM access here, so it is safe to import in Node.
 */

export const SITE_NAME = "Joe Knows Ball";
export const CANONICAL_BASE = "https://www.joeknowsball.com";

export const DEFAULT_OG_IMAGE = "https://www.joeknowsball.com/og/joeknowsball-social-preview-v2.png";
export const DEFAULT_OG_IMAGE_ALT = "Joe Knows Ball advanced sports analytics and betting models";

/**
 * Neutral site-level metadata restored whenever a page's SEO effect is torn
 * down (route change, unmount, or changed inputs). A route that renders no
 * usePageSeo call therefore shows these values -- never the previous route's
 * title, canonical, robots, social tags or JSON-LD.
 */
export const DEFAULT_TITLE = `${SITE_NAME} | Advanced Sports Analytics`;
export const DEFAULT_DESCRIPTION =
  "Free advanced sports analytics, power ratings, matchup research and prop models from Joe Knows Ball.";
export const DEFAULT_ROBOTS = "index, follow, max-image-preview:large";

export type StructuredDataItem = Record<string, unknown>;

export interface PageSeoOptions {
  title: string;
  description: string;
  path?: string;
  canonical?: string;
  noindex?: boolean;
  nofollow?: boolean;
  type?: "website" | "article";
  ogImage?: string;
  structuredData?: StructuredDataItem | StructuredDataItem[];
}

/** One `<meta>` element, keyed by either its `name` or its `property` attribute. */
export interface SeoMetaTag {
  attr: "name" | "property";
  key: string;
  content: string;
}

export interface ResolvedPageSeo {
  title: string;
  canonicalUrl: string;
  /** In the order usePageSeo has always written them. */
  metas: SeoMetaTag[];
  structuredData: StructuredDataItem[];
}

function normalizePath(path: string): string {
  const withFallback = path || "/";
  const withoutOrigin = withFallback.replace(/^https?:\/\/[^/]+/i, "") || "/";
  const withoutHash = withoutOrigin.split("#")[0] || "/";
  const withoutQuery = withoutHash.split("?")[0] || "/";
  const ensuredLeadingSlash = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  if (ensuredLeadingSlash !== "/" && ensuredLeadingSlash.endsWith("/")) {
    return ensuredLeadingSlash.slice(0, -1);
  }
  return ensuredLeadingSlash || "/";
}

export function buildCanonicalUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    const url = new URL(pathOrUrl);
    return `${CANONICAL_BASE}${normalizePath(`${url.pathname}${url.search}${url.hash}`)}`;
  }

  return `${CANONICAL_BASE}${normalizePath(pathOrUrl)}`;
}

const meta = (attr: SeoMetaTag["attr"], key: string, content: string): SeoMetaTag => ({ attr, key, content });

/** The shared social-image tag set (og:image*, twitter:image*). */
export function socialImageMetas(image: string): SeoMetaTag[] {
  return [
    meta("property", "og:image", image),
    meta("property", "og:image:secure_url", image),
    meta("property", "og:image:type", "image/png"),
    meta("property", "og:image:width", "1200"),
    meta("property", "og:image:height", "630"),
    meta("property", "og:image:alt", DEFAULT_OG_IMAGE_ALT),
    meta("name", "twitter:image", image),
    meta("name", "twitter:image:alt", DEFAULT_OG_IMAGE_ALT),
  ];
}

export function buildRobots(noindex: boolean, nofollow: boolean): string {
  const robotsIndex = noindex ? "noindex" : "index";
  const robotsFollow = nofollow ? "nofollow" : "follow";
  const robotsPreview = noindex ? "" : ", max-image-preview:large";
  return `${robotsIndex}, ${robotsFollow}${robotsPreview}`;
}

export function resolvePageSeo({
  title,
  description,
  path = "/",
  canonical,
  noindex = false,
  nofollow = false,
  type = "website",
  ogImage,
  structuredData,
}: PageSeoOptions): ResolvedPageSeo {
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
  const canonicalUrl = buildCanonicalUrl(canonical ?? path);

  return {
    title: fullTitle,
    canonicalUrl,
    metas: [
      meta("name", "description", description),
      meta("property", "og:site_name", SITE_NAME),
      meta("property", "og:type", type),
      meta("property", "og:title", fullTitle),
      meta("property", "og:description", description),
      meta("property", "og:url", canonicalUrl),
      ...socialImageMetas(ogImage ?? DEFAULT_OG_IMAGE),
      meta("name", "twitter:card", "summary_large_image"),
      meta("name", "twitter:title", fullTitle),
      meta("name", "twitter:description", description),
      meta("name", "robots", buildRobots(noindex, nofollow)),
    ],
    structuredData: Array.isArray(structuredData) ? structuredData : structuredData ? [structuredData] : [],
  };
}
