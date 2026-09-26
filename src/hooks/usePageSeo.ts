import { useEffect } from "react";

const SITE_NAME = "Joe Knows Ball";
const CANONICAL_BASE = "https://www.joeknowsball.com";

const DEFAULT_OG_IMAGE = "https://www.joeknowsball.com/og/joeknowsball-social-preview-v2.png";
const DEFAULT_OG_IMAGE_ALT = "Joe Knows Ball advanced sports analytics and betting models";

/**
 * Neutral site-level metadata restored whenever a page's SEO effect is torn
 * down (route change, unmount, or changed inputs). A route that renders no
 * usePageSeo call therefore shows these values -- never the previous route's
 * title, canonical, robots, social tags or JSON-LD.
 */
const DEFAULT_TITLE = `${SITE_NAME} | Advanced Sports Analytics`;
const DEFAULT_DESCRIPTION =
  "Free advanced sports analytics, power ratings, matchup research and prop models from Joe Knows Ball.";
const DEFAULT_ROBOTS = "index, follow, max-image-preview:large";

interface PageSeoOptions {
  title: string;
  description: string;
  path?: string;
  canonical?: string;
  noindex?: boolean;
  nofollow?: boolean;
  type?: "website" | "article";
  ogImage?: string;
  structuredData?: Record<string, unknown> | Array<Record<string, unknown>>;
}

function upsertMeta(selector: string, attrs: Record<string, string>) {
  let element = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }

  Object.entries(attrs).forEach(([key, value]) => {
    element?.setAttribute(key, value);
  });
}

function upsertLink(rel: string, href: string) {
  let element = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!element) {
    element = document.createElement("link");
    element.rel = rel;
    document.head.appendChild(element);
  }
  element.href = href;
}

function normalizePath(path: string) {
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

function buildCanonicalUrl(pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    const url = new URL(pathOrUrl);
    return `${CANONICAL_BASE}${normalizePath(`${url.pathname}${url.search}${url.hash}`)}`;
  }

  return `${CANONICAL_BASE}${normalizePath(pathOrUrl)}`;
}

function removeHeadElements(selector: string) {
  document.head.querySelectorAll(selector).forEach((node) => node.parentNode?.removeChild(node));
}

function clearStructuredData() {
  removeHeadElements('script[data-jkb-structured-data="true"]');
}

function applySocialImage(image: string) {
  upsertMeta('meta[property="og:image"]', { property: "og:image", content: image });
  upsertMeta('meta[property="og:image:secure_url"]', { property: "og:image:secure_url", content: image });
  upsertMeta('meta[property="og:image:type"]', { property: "og:image:type", content: "image/png" });
  upsertMeta('meta[property="og:image:width"]', { property: "og:image:width", content: "1200" });
  upsertMeta('meta[property="og:image:height"]', { property: "og:image:height", content: "630" });
  upsertMeta('meta[property="og:image:alt"]', { property: "og:image:alt", content: DEFAULT_OG_IMAGE_ALT });
  upsertMeta('meta[name="twitter:image"]', { name: "twitter:image", content: image });
  upsertMeta('meta[name="twitter:image:alt"]', { name: "twitter:image:alt", content: DEFAULT_OG_IMAGE_ALT });
}

/**
 * Restore neutral site defaults. Page-specific URL signals (canonical, og:url)
 * are removed rather than guessed: an absent canonical is safe, a stale one
 * points search engines at the wrong page.
 */
export function resetPageSeo(): void {
  document.title = DEFAULT_TITLE;
  upsertMeta('meta[name="description"]', { name: "description", content: DEFAULT_DESCRIPTION });
  upsertMeta('meta[property="og:site_name"]', { property: "og:site_name", content: SITE_NAME });
  upsertMeta('meta[property="og:type"]', { property: "og:type", content: "website" });
  upsertMeta('meta[property="og:title"]', { property: "og:title", content: DEFAULT_TITLE });
  upsertMeta('meta[property="og:description"]', { property: "og:description", content: DEFAULT_DESCRIPTION });
  applySocialImage(DEFAULT_OG_IMAGE);
  upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
  upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: DEFAULT_TITLE });
  upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: DEFAULT_DESCRIPTION });
  upsertMeta('meta[name="robots"]', { name: "robots", content: DEFAULT_ROBOTS });
  removeHeadElements('link[rel="canonical"]');
  removeHeadElements('meta[property="og:url"]');
  clearStructuredData();
}

export function usePageSeo({
  title,
  description,
  path = "/",
  canonical,
  noindex = false,
  nofollow = false,
  type = "website",
  ogImage,
  structuredData,
}: PageSeoOptions) {
  useEffect(() => {
    const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
    const canonicalUrl = buildCanonicalUrl(canonical ?? path);

    document.title = fullTitle;
    upsertMeta('meta[name="description"]', { name: "description", content: description });
    upsertMeta('meta[property="og:site_name"]', { property: "og:site_name", content: SITE_NAME });
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: type });
    upsertMeta('meta[property="og:title"]', { property: "og:title", content: fullTitle });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: description });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: canonicalUrl });
    applySocialImage(ogImage ?? DEFAULT_OG_IMAGE);
    upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: fullTitle });
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });
    const robotsIndex = noindex ? "noindex" : "index";
    const robotsFollow = nofollow ? "nofollow" : "follow";
    const robotsPreview = noindex ? "" : ", max-image-preview:large";
    upsertMeta('meta[name="robots"]', { name: "robots", content: `${robotsIndex}, ${robotsFollow}${robotsPreview}` });
    upsertLink("canonical", canonicalUrl);
    clearStructuredData();

    const schemaItems = Array.isArray(structuredData) ? structuredData : structuredData ? [structuredData] : [];
    schemaItems.forEach((item) => {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.dataset.jkbStructuredData = "true";
      script.textContent = JSON.stringify(item);
      document.head.appendChild(script);
    });

    // A page owns its metadata only while this effect is applied. React runs
    // every teardown of a commit before any new effect, so the incoming route
    // always starts from the neutral defaults and never inherits this page's
    // title, canonical, robots, social tags or JSON-LD.
    return resetPageSeo;
  }, [canonical, description, nofollow, noindex, ogImage, path, structuredData, title, type]);
}

export { CANONICAL_BASE, DEFAULT_DESCRIPTION, DEFAULT_ROBOTS, DEFAULT_TITLE, SITE_NAME };
