import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";

const navItems = [
  { to: "/rbc-heritage-2026-picks", label: "Best Bets" },
  { to: "/pga/model", label: "PGA Model" },
  { to: "/ncaa", label: "Rankings" },
  { to: "/schedule", label: "Schedule" },
  { to: "/betting-edge", label: "Betting" },
] as const;

function isActive(pathname: string, to: string) {
  if (to === "/rbc-heritage-2026-picks") {
    return pathname === "/rbc-heritage-2026-picks" || pathname === "/pga";
  }
  return pathname === to || pathname.startsWith(`${to}/`);
}

export default function SiteNav() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/92 shadow-sm backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="text-lg font-bold tracking-[-0.03em] text-slate-900 transition hover:text-primary sm:text-xl"
        >
          <span className="text-foreground">Joe Knows Ball</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => {
            const active = isActive(location.pathname, item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-slate-600 hover:bg-slate-100 hover:text-primary"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <Link
            to="/rbc-heritage-2026-picks"
            className="ml-2 inline-flex rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
          >
            View Picks
          </Link>
        </nav>

        <button
          type="button"
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          onClick={() => setMobileOpen((open) => !open)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:border-primary/30 hover:text-primary md:hidden"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen ? (
        <div className="border-t border-slate-200 bg-white px-4 pb-4 pt-2 shadow-sm md:hidden">
          <nav className="flex flex-col gap-2">
            {navItems.map((item) => {
              const active = isActive(location.pathname, item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`rounded-2xl px-4 py-3 text-sm font-medium transition ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-slate-50 text-slate-700 hover:bg-primary/5 hover:text-primary"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link
              to="/rbc-heritage-2026-picks"
              className="mt-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
            >
              View Picks
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
