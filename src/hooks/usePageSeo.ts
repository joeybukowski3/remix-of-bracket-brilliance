import { useEffect } from "react";

const SITE_NAME = "Joe Knows Ball";
const CANONICAL_BASE = "https://www.joeknowsball.com";

interface PageSeoOptions {
  title: string;
  description: string;
  path?: string;
  canonical?: string;
  noindex?: boolean;
  type?: "website" | "article";
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

export function usePageSeo({ title, description, path = "/", canonical, noindex = false, type = "website" }: PageSeoOptions) {
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
    upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: fullTitle });
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });
    upsertMeta('meta[name="robots"]', { name: "robots", content: noindex ? "noindex, follow" : "index, follow, max-image-preview:large" });
    upsertLink("canonical", canonicalUrl);
  }, [canonical, description, noindex, path, title, type]);
}

export { CANONICAL_BASE, SITE_NAME };
