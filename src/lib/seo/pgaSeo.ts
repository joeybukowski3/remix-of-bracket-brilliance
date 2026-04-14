import { CANONICAL_BASE } from "@/hooks/usePageSeo";

export const CURRENT_TOURNAMENT_PATH = "/pga/rbc-heritage-2026-picks";
export const CURRENT_TOURNAMENT_TITLE = "RBC Heritage 2026 Picks, Best Bets & Top 40 Parlays | PGA Model";
export const CURRENT_TOURNAMENT_DESCRIPTION =
  "RBC Heritage 2026 picks, best bets, and top 40 parlay golfers. Data-driven PGA model using course history, form, and key stats to find value.";

export const currentTournamentFaqs = [
  {
    question: "What are the best bets for RBC Heritage 2026?",
    answer:
      "The model leans to Collin Morikawa, Patrick Cantlay, Jordan Spieth, and Sam Burns as the strongest RBC Heritage 2026 best bets based on course history, approach play, and recent form.",
  },
  {
    question: "What stats matter most at Harbour Town?",
    answer:
      "Harbour Town rewards SG: Approach, driving accuracy, par-4 scoring, bogey avoidance, and strong wedge play more than pure driving distance.",
  },
  {
    question: "What are the safest golf bets?",
    answer:
      "Top 40 golf bets are usually the safest betting structure because they emphasize consistency, cut-making, and course fit instead of outright win volatility.",
  },
  {
    question: "How do Top 40 golf bets work?",
    answer:
      "A Top 40 bet cashes if a golfer finishes 40th or better. They are often used in parlays because the floor is higher than top-10 or outright markets.",
  },
] as const;

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
