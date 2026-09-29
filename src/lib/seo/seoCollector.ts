import { createContext } from "react";
import { resolvePageSeo, type PageSeoOptions, type ResolvedPageSeo, type StructuredDataItem } from "@/lib/seo/pageSeoHead";

/**
 * Build-time SEO collector.
 *
 * usePageSeo and SeoJsonLd write the document head inside effects, and
 * effects never run during renderToString. When -- and only when -- a
 * collector is provided through SeoCollectorContext (src/entry-server.tsx
 * does this for the build-time prerender), both report the exact arguments
 * they were given synchronously during render. The browser app never
 * provides the context, so client behavior is unchanged.
 */
export interface SeoJsonLdDeclaration {
  id: string;
  data: StructuredDataItem | StructuredDataItem[];
}

export interface CollectedSeo {
  /** Every usePageSeo declaration, resolved, in render order. */
  pages: ResolvedPageSeo[];
  /** SeoJsonLd blocks, keyed by id; a repeated id keeps the last value (the client upserts by id). */
  jsonLd: SeoJsonLdDeclaration[];
}

export interface SeoCollector {
  recordPage(options: PageSeoOptions): void;
  recordJsonLd(declaration: SeoJsonLdDeclaration): void;
  result(): CollectedSeo;
}

export const SeoCollectorContext = createContext<SeoCollector | null>(null);

export function createSeoCollector(): SeoCollector {
  const pages: ResolvedPageSeo[] = [];
  const jsonLd = new Map<string, SeoJsonLdDeclaration>();
  return {
    recordPage: (options) => {
      pages.push(resolvePageSeo(options));
    },
    recordJsonLd: (declaration) => {
      jsonLd.delete(declaration.id);
      jsonLd.set(declaration.id, declaration);
    },
    result: () => ({ pages: [...pages], jsonLd: [...jsonLd.values()] }),
  };
}
