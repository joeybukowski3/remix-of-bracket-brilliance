import { Link, useLocation } from "react-router-dom";

const items = [
  { to: "/nfl", label: "Power Ratings" },
  { to: "/nfl/standings", label: "Standings" },
  { to: "/nfl/guide", label: "2026 Guide" },
  { to: "/nfl/guide/regression", label: "Fluke or Real" },
  { to: "/nfl/super-bowl", label: "Super Bowl Odds" },
];

export default function NflGuideNav() {
  const location = useLocation();
  return (
    <nav className="flex flex-wrap gap-2" aria-label="NFL sections">
      {items.map((item) => {
        const active = item.to === "/nfl/guide"
          ? location.pathname === item.to || location.pathname.startsWith("/nfl/guide/team/")
          : location.pathname === item.to;
        return active ? (
          <span key={item.to} className="rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white">
            {item.label}
          </span>
        ) : (
          <Link
            key={item.to}
            to={item.to}
            className="rounded-full bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-200"
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
