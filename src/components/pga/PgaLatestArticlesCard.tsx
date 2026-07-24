import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { assessPgaFreshness } from "@/lib/pga/pgaFreshness";
import { getPgaScheduleSelection } from "@/lib/pga/pgaSchedule";

// "current" is the only status that may render the Latest badge. Frozen
// entries are always "historical" so a stale prior-tournament page can never
// inherit currentness from its position in the list.
type PgaArticleStatus = "current" | "historical";

export type PgaArticleCard = {
  title: string;
  description: string;
  date: string;
  category: string;
  path: string;
  status: PgaArticleStatus;
};

const UNAVAILABLE_MESSAGE = "Current PGA analysis is unavailable. Historical articles are shown below.";

// Frozen historical entry for the 2026 Open Championship's one-off SEO page --
// kept as a secondary reference, never eligible for "Latest".
const HISTORICAL_ARTICLES: PgaArticleCard[] = [
  {
    title: "2026 Open Championship Picks: Best Bets, Model Rankings and Golf Odds",
    description: "Model-driven outright, Top 5, Top 10, Top 20 and make-cut value for Royal Birkdale, plus the full interactive value board.",
    date: "July 15, 2026",
    category: "Best Bets",
    path: "/pga/the-open-2026-picks-best-bets-odds",
    status: "historical",
  },
];

function formatArticleDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "America/New_York" }).format(date);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Builds the generated Best Bets card only when the payload is verifiably the
 * current (or upcoming) tournament's article. Any missing, malformed, stale,
 * mismatched or untimestamped payload yields null so nothing is rendered as
 * current.
 */
function buildCurrentArticle(payload: unknown, referenceDate: string): PgaArticleCard | null {
  if (!isRecord(payload)) return null;

  const article = isRecord(payload.article) ? payload.article : null;
  const title = readString(article?.title);
  const tournament = readString(payload.tournament);
  const generatedAt = readString(payload.generatedAt);
  if (!title || !tournament || !generatedAt) return null;

  const formattedDate = formatArticleDate(generatedAt);
  if (!formattedDate) return null;

  const freshness = assessPgaFreshness(payload, {
    payloadType: "best-bets",
    expectedEvent: getPgaScheduleSelection(referenceDate).currentUpcoming,
    asOf: referenceDate,
  });
  if (!freshness.isUsable) return null;

  return {
    title,
    description:
      readString(article?.dek)
      ?? readString(article?.introduction)
      ?? `Model-driven outright, top 10, and top 20 picks for ${tournament}.`,
    date: formattedDate,
    category: "Best Bets",
    path: "/pga/best-bets",
    status: "current",
  };
}

/**
 * "Latest PGA Articles" sidebar card. Presentation moved from a right-sidebar
 * portal to a directly rendered left-sidebar card; the article sourcing,
 * titles, dates, labels and links are unchanged.
 */
export default function PgaLatestArticlesCard() {
  const [bestBetsPayload, setBestBetsPayload] = useState<unknown>(null);
  const referenceDate = getPgaScheduleSelection().referenceDate;

  useEffect(() => {
    let cancelled = false;

    fetch("/data/pga/best-bets.json", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!cancelled) setBestBetsPayload(payload ?? null);
      })
      .catch(() => {
        if (!cancelled) setBestBetsPayload(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const currentArticle = useMemo(
    () => buildCurrentArticle(bestBetsPayload, referenceDate),
    [bestBetsPayload, referenceDate],
  );
  const articles = currentArticle ? [currentArticle, ...HISTORICAL_ARTICLES] : HISTORICAL_ARTICLES;

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

      {currentArticle ? null : (
        <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] font-bold leading-relaxed text-amber-800">
          {UNAVAILABLE_MESSAGE}
        </p>
      )}

      <div className="space-y-2">
        {articles.map((article) => (
          <Link
            key={article.path}
            to={article.path}
            className="group block overflow-hidden rounded-lg border border-slate-200 bg-slate-50 transition hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-sm"
          >
            <div className="h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-amber-300" />
            <div className="p-3">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                <span>{article.category}</span>
                {article.status === "current" ? (
                  <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-white">Latest</span>
                ) : (
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 text-slate-600">Historical</span>
                )}
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
