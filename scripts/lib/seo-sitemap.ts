import { buildSitemapSections, matchExcludedRoute, type SitemapSection } from "./seo-sitemap-routes";
import { latestLastmod, renderSitemapIndex, renderUrlset, toAbsoluteUrl } from "./seo-sitemap-xml";

export const SITEMAP_INDEX_FILE = "sitemap.xml";

export type GeneratedSitemaps = {
  sections: SitemapSection[];
  /** File name (relative to public/) -> XML content, index first. */
  files: Map<string, string>;
};

/**
 * Fail closed: a URL listed twice (within or across child sitemaps) or a URL
 * matching a known excluded route aborts generation instead of shipping.
 */
export function assertSectionsPublishable(sections: readonly SitemapSection[]): void {
  const owner = new Map<string, string>();
  for (const section of sections) {
    if (section.entries.length === 0) throw new Error(`${section.file} has no URLs`);
    for (const { path } of section.entries) {
      const loc = toAbsoluteUrl(path);
      const previous = owner.get(loc);
      if (previous) throw new Error(`Duplicate sitemap URL ${loc} in ${previous} and ${section.file}`);
      owner.set(loc, section.file);
      const rule = matchExcludedRoute(path);
      if (rule) throw new Error(`Excluded route ${path} (${rule}) listed in ${section.file}`);
    }
  }
}

export function generateSitemaps(sections: SitemapSection[] = buildSitemapSections()): GeneratedSitemaps {
  assertSectionsPublishable(sections);
  const files = new Map<string, string>();
  files.set(
    SITEMAP_INDEX_FILE,
    renderSitemapIndex(sections.map((section) => ({ file: section.file, lastmod: latestLastmod(section.entries) })))
  );
  for (const section of sections) files.set(section.file, renderUrlset(section.entries));
  return { sections, files };
}
