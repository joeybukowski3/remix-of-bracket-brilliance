import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

export type PgaArticleCard = {
  title: string;
  description: string;
  date: string;
  category: string;
  path: string;
};

// Frozen historical entry for the 2026 Open Championship's one-off SEO page
// -- kept as a secondary reference, never shown as "Latest" (see index === 0
// below). The current week's article is fetched dynamically and prepended
// ahead of this so the card never points at a stale prior-tournament page.
const HISTORICAL_ARTICLES: PgaArticleCard[] = [
  {
    title: "2026 Open Championship Picks: Best Bets, Model Rankings and Golf Odds",
    description: "Model-driven outright, Top 5, Top 10, Top 20 and make-cut value for Royal Birkdale, plus the full interactive value board.",
    date: "July 15, 2026",
    category: "Best Bets",
    path: "/pga/the-open-2026-picks-best-bets-odds",
  },
];

function formatArticleDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "America/New_York" }).format(date);
}

/**
 * "Latest PGA Articles" sidebar card. Presentation moved from a right-sidebar
 * portal to a directly rendered left-sidebar card; the article sourcing,
 * titles, dates, labels and links are unchanged.
 */
export default function PgaLatestArticlesCard() {
  const [currentWeekArticle, setCurrentWeekArticle] = useState<PgaArticleCard | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/data/pga/best-bets.json", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled || !payload?.article?.title || !payload?.tournament) return;
        setCurrentWeekArticle({
          title: payload.article.title,
          description: payload.article.dek || payload.article.introduction || `Model-driven outright, top 10, and top 20 picks for ${payload.tournament}.`,
          date: payload.generatedAt ? formatArticleDate(payload.generatedAt) : payload.tournament,
          category: "Best Bets",
          path: "/pga/best-bets",
        });
      })
      .catch(() => {
        if (!cancelled) setCurrentWeekArticle(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const articles = currentWeekArticle ? [currentWeekArticle, ...HISTORICAL_ARTICLES] : HISTORICAL_ARTICLES;

  return (
    <section className="rounded-xl border bg-white p-3 shadow-sm" aria-labelledby="pga-latest-articles">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="pga-latest-articles" className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
          Latest PGA Articles
        </h2>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-800">
          Blog
        </span>
      </div>

      <div className="space-y-2">
        {articles.map((article, index) => (
          <Link
            key={article.path}
            to={article.path}
            className="group block overflow-hidden rounded-lg border border-slate-200 bg-slate-50 transition hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-sm"
          >
            <div className="h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-amber-300" />
            <div className="p-3">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                <span>{article.category}</span>
                {index === 0 ? <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-white">Latest</span> : null}
              </div>
              <h3 className="text-[13px] font-black leading-snug text-slate-900 group-hover:text-emerald-900">
                {article.title}
              </h3>
              <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-slate-500">
                {article.description}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-200 pt-2 text-[10px] font-bold">
                <span className="tabular-nums text-slate-400">{article.date}</span>
                <span className="text-emerald-700">Read article →</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
