import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";

const navItems = [
  { to: "/pga/rbc-heritage-2026-picks", label: "PGA Picks" },
  { to: "/pga/model", label: "PGA Model" },
  { to: "/ncaa", label: "Rankings" },
  { to: "/schedule", label: "Schedule" },
  { to: "/betting-edge", label: "Betting" },
];

function isActive(pathname: string, to: string) {
  if (to === "/pga/rbc-heritage-2026-picks") {
    return pathname === "/pga/rbc-heritage-2026-picks" || pathname === "/rbc-heritage-2026-picks" || pathname === "/pga";
  }
  return pathname === to || pathname.startsWith(`${to}/`);
}

export default function SiteHeader() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-50 bg-white/90 shadow-[0_8px_24px_hsl(var(--foreground)/0.04)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6 sm:py-3 lg:px-8">
        <Link to="/" className="text-base font-semibold tracking-[-0.03em] text-foreground transition hover:text-primary sm:text-xl">
          Joe Knows Ball
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => {
            const active = isActive(location.pathname, item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <Link
            to="/pga/rbc-heritage-2026-picks"
            className="ml-2 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            View Picks
          </Link>
        </nav>

        <button
          type="button"
          onClick={() => setMobileOpen((value) => !value)}
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-foreground transition hover:bg-accent md:hidden"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen ? (
        <div className="px-4 pb-3 md:hidden">
          <div className="rounded-3xl bg-card p-3 shadow-[0_12px_32px_hsl(var(--foreground)/0.05)]">
            <nav className="flex flex-col gap-2">
              {navItems.map((item) => {
                const active = isActive(location.pathname, item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`rounded-2xl px-4 py-2.5 text-sm transition ${
                      active ? "bg-primary/10 text-primary" : "bg-secondary/70 text-foreground hover:bg-secondary"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <Link to="/pga/rbc-heritage-2026-picks" className="rounded-2xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90">
                View Picks
              </Link>
            </nav>
          </div>
        </div>
      ) : null}
    </header>
  );
}
