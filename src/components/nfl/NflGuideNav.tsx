import { Link, useLocation } from "react-router-dom";
import { NFL_SECTION_NAV_ITEMS, isNflSectionPathActive } from "@/lib/nfl/sectionNav";

export default function NflGuideNav() {
  const location = useLocation();
  return (
    <nav className="flex flex-wrap gap-2" aria-label="NFL sections">
      {NFL_SECTION_NAV_ITEMS.map((item) => {
        const active = isNflSectionPathActive(location.pathname, item.to);
        return active ? (
          <span key={item.to} className="rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white">
            {item.shortLabel}
          </span>
        ) : (
          <Link
            key={item.to}
            to={item.to}
            className="rounded-full bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-200"
          >
            {item.shortLabel}
          </Link>
        );
      })}
    </nav>
  );
}
