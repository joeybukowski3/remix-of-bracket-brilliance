import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import PgaHistoryModel from "./PgaHistoryModel";

const PGA_ARTICLES = [
  {
    title: "2026 Open Championship Picks: Best Bets, Model Rankings and Golf Odds",
    description: "Model-driven outright, Top 5, Top 10, Top 20 and make-cut value for Royal Birkdale.",
    date: "July 15, 2026",
    category: "Best Bets",
    path: "/pga/the-open-2026-model-value-bets",
  },
];

export default function PgaHistoryModelWithArticles() {
  const [sidebarTarget, setSidebarTarget] = useState<Element | null>(null);

  useEffect(() => {
    const locateSidebar = () => {
      const partnerAside = Array.from(document.querySelectorAll("aside")).find((aside) =>
        aside.textContent?.toLowerCase().includes("bet with our partners"),
      );
      setSidebarTarget(partnerAside?.firstElementChild ?? null);
    };

    locateSidebar();
    const frame = window.requestAnimationFrame(locateSidebar);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <>
      <PgaHistoryModel />
      {sidebarTarget
        ? createPortal(
            <section className="mt-4 border-t border-slate-200 pt-4" aria-labelledby="pga-latest-articles">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 id="pga-latest-articles" className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                  Latest PGA Articles
                </h2>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-800">
                  Blog
                </span>
              </div>

              <div className="space-y-2">
                {PGA_ARTICLES.map((article, index) => (
                  <Link
                    key={article.path}
                    to={article.path}
                    className="group block overflow-hidden rounded-lg border border-slate-200 bg-slate-50 transition hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-sm"
                  >
                    <div className="h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-amber-300" />
                    <div className="p-3">
                      <div className="mb-1 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide text-emerald-700">
                        <span>{article.category}</span>
                        {index === 0 ? <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-white">Latest</span> : null}
                      </div>
                      <h3 className="text-[12px] font-black leading-snug text-slate-900 group-hover:text-emerald-900">
                        {article.title}
                      </h3>
                      <p className="mt-1.5 line-clamp-3 text-[10px] leading-relaxed text-slate-500">
                        {article.description}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-200 pt-2 text-[9px] font-bold">
                        <span className="text-slate-400">{article.date}</span>
                        <span className="text-emerald-700">Read article →</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>,
            sidebarTarget,
          )
        : null}
    </>
  );
}
