import { Link, useLocation } from "react-router-dom";
import { NFL_SECTION_NAV_ITEMS, isNflSectionPathActive } from "@/lib/nfl/sectionNav";

export default function NflSectionSidebar() {
  const location = useLocation();

  return (
    <aside className="order-first xl:order-last xl:sticky xl:top-24" aria-label="NFL section navigation">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-slate-950 px-5 py-4 text-white">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-300">NFL Navigation</div>
          <h2 className="mt-1 text-lg font-black">Explore the NFL section</h2>
          <p className="mt-1 text-xs leading-5 text-slate-300">Jump directly to the major model, market and team-analysis pages.</p>
        </div>

        <nav className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-1">
          {NFL_SECTION_NAV_ITEMS.map((item) => {
            const active = isNflSectionPathActive(location.pathname, item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={`group flex items-start gap-3 rounded-xl border p-3 transition ${active ? "border-blue-200 bg-blue-50" : "border-transparent hover:border-slate-200 hover:bg-slate-50"}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-black ${active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 group-hover:bg-slate-200"}`}>
                  {item.marker}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-black ${active ? "text-blue-900" : "text-slate-900"}`}>{item.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{item.description}</span>
                </span>
                <span className={`mt-1 text-sm font-black ${active ? "text-blue-600" : "text-slate-300 group-hover:text-slate-500"}`} aria-hidden>→</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-[11px] leading-5 text-slate-500">
          Select any team in the ratings table to open its full schedule, stats, odds and offseason dashboard.
        </div>
      </div>
    </aside>
  );
}
