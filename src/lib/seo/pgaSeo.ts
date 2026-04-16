import { CANONICAL_BASE } from "@/hooks/usePageSeo";
import { FEATURED_PGA_TOURNAMENT } from "@/lib/pga/tournaments";
import { getTournamentPicksPath } from "@/lib/pga/tournamentConfig";

export const CURRENT_TOURNAMENT_PATH = getTournamentPicksPath(FEATURED_PGA_TOURNAMENT);
export const CURRENT_TOURNAMENT_TITLE = FEATURED_PGA_TOURNAMENT.seo.title;
export const CURRENT_TOURNAMENT_DESCRIPTION = FEATURED_PGA_TOURNAMENT.seo.description;

export const currentTournamentFaqs = FEATURED_PGA_TOURNAMENT.seo.faqs;

export function buildArticleSchema({
  headline,
  description,
  path,
  dateModified,
}: {
  headline: string;
  description: string;
  path: string;
  dateModified: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    description,
    mainEntityOfPage: `${CANONICAL_BASE}${path}`,
    author: {
      "@type": "Organization",
      name: "Joe Knows Ball",
    },
    publisher: {
      "@type": "Organization",
      name: "Joe Knows Ball",
      logo: {
        "@type": "ImageObject",
        url: `${CANONICAL_BASE}/icon-192.png`,
      },
    },
    dateModified,
  };
}

export function buildBreadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${CANONICAL_BASE}${item.path}`,
    })),
  };
}

export function buildFaqSchema(entries: readonly { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: entry.answer,
      },
    })),
  };
}
