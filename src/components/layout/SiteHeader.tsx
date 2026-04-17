import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import Logo from "@/components/ui/Logo";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/mlb", label: "MLB" },
  { to: "/ncaa", label: "NCAA" },
  { to: "/nfl", label: "NFL" },
  // TODO: wire the NBA nav item once an NBA landing route exists.
  { to: null, label: "NBA" },
  { to: "/pga", label: "PGA" },
];

function isActive(pathname: string, item: { to: string | null; label: string }) {
  if (item.label === "Home") {
    return pathname === "/";
  }

  if (item.label === "PGA") {
    return pathname === "/pga" || pathname.startsWith("/pga/") || pathname === "/rbc-heritage-2026-picks";
  }

  if (item.label === "NBA" || !item.to) {
    return false;
  }

  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export default function SiteHeader() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-50 border-b border-black/5 bg-white shadow-[0_8px_24px_rgba(17,17,17,0.04)]">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center">
          <div className="sm:hidden">
            <Logo clickable size={34} />
          </div>
          <div className="hidden sm:block">
            <Logo clickable size={46} />
          </div>
        </div>

        <nav className="hidden items-center gap-2 md:flex lg:gap-3">
          {navItems.map((item) => {
            const active = isActive(location.pathname, item);
            if (!item.to) {
              return (
                <span
                  key={`${item.label}-disabled`}
                  className="rounded-full px-4 py-2 text-sm text-muted-foreground/80"
                >
                  {item.label}
                </span>
              );
            }
            return (
              <Link
                key={`${item.label}-${item.to}`}
                to={item.to}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  active ? "bg-primary/10 font-medium text-primary" : "text-foreground/80 hover:bg-secondary hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
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
                const active = isActive(location.pathname, item);
                if (!item.to) {
                  return (
                    <span
                      key={`${item.label}-disabled-mobile`}
                      className="rounded-2xl bg-secondary/40 px-4 py-2.5 text-sm text-muted-foreground"
                    >
                      {item.label}
                    </span>
                  );
                }
                return (
                  <Link
                    key={`${item.label}-${item.to}`}
                    to={item.to}
                    className={`rounded-2xl px-4 py-2.5 text-sm transition ${
                      active ? "bg-primary/10 text-primary" : "bg-secondary/70 text-foreground hover:bg-secondary"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      ) : null}
    </header>
  );
}
