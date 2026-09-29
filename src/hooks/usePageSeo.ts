import { useContext, useEffect } from "react";
import {
  CANONICAL_BASE,
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  DEFAULT_ROBOTS,
  DEFAULT_TITLE,
  SITE_NAME,
  resolvePageSeo,
  socialImageMetas,
  type PageSeoOptions,
  type SeoMetaTag,
} from "@/lib/seo/pageSeoHead";
import { SeoCollectorContext } from "@/lib/seo/seoCollector";

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

function applyMeta({ attr, key, content }: SeoMetaTag) {
  upsertMeta(`meta[${attr}="${key}"]`, { [attr]: key, content });
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

function removeHeadElements(selector: string) {
  document.head.querySelectorAll(selector).forEach((node) => node.parentNode?.removeChild(node));
}

function clearStructuredData() {
  removeHeadElements('script[data-jkb-structured-data="true"]');
}

/**
 * Restore neutral site defaults. Page-specific URL signals (canonical, og:url)
 * are removed rather than guessed: an absent canonical is safe, a stale one
 * points search engines at the wrong page.
 */
export function resetPageSeo(): void {
  document.title = DEFAULT_TITLE;
  applyMeta({ attr: "name", key: "description", content: DEFAULT_DESCRIPTION });
  applyMeta({ attr: "property", key: "og:site_name", content: SITE_NAME });
  applyMeta({ attr: "property", key: "og:type", content: "website" });
  applyMeta({ attr: "property", key: "og:title", content: DEFAULT_TITLE });
  applyMeta({ attr: "property", key: "og:description", content: DEFAULT_DESCRIPTION });
  socialImageMetas(DEFAULT_OG_IMAGE).forEach(applyMeta);
  applyMeta({ attr: "name", key: "twitter:card", content: "summary_large_image" });
  applyMeta({ attr: "name", key: "twitter:title", content: DEFAULT_TITLE });
  applyMeta({ attr: "name", key: "twitter:description", content: DEFAULT_DESCRIPTION });
  applyMeta({ attr: "name", key: "robots", content: DEFAULT_ROBOTS });
  removeHeadElements('link[rel="canonical"]');
  removeHeadElements('meta[property="og:url"]');
  clearStructuredData();
}

export function usePageSeo(options: PageSeoOptions) {
  const { title, description, path = "/", canonical, noindex = false, nofollow = false, type = "website", ogImage, structuredData } =
    options;

  // Build-time prerender only: effects never run in renderToString, so the
  // declaration is reported synchronously. The browser never provides a
  // collector, so this is a no-op there.
  const collector = useContext(SeoCollectorContext);
  collector?.recordPage(options);

  useEffect(() => {
    const head = resolvePageSeo({ title, description, path, canonical, noindex, nofollow, type, ogImage, structuredData });

    document.title = head.title;
    head.metas.forEach(applyMeta);
    upsertLink("canonical", head.canonicalUrl);
    clearStructuredData();

    head.structuredData.forEach((item) => {
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
