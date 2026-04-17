import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import Logo from "@/components/ui/Logo";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/mlb", label: "MLB" },
  { to: "/ncaa", label: "NCAA" },
  { to: "/", label: "NFL" },
  { to: "/", label: "NBA" },
  { to: "/pga", label: "PGA" },
];

function isActive(pathname: string, item: { to: string; label: string }) {
  if (item.label === "Home") {
    return pathname === "/";
  }

  if (item.label === "PGA") {
    return pathname === "/pga" || pathname.startsWith("/pga/") || pathname === "/rbc-heritage-2026-picks";
  }

  if (item.label === "NFL" || item.label === "NBA") {
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
    <header className="sticky top-0 z-50 bg-white/90 shadow-[0_8px_24px_hsl(var(--foreground)/0.04)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6 sm:py-3 lg:px-8">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Logo clickable size={28} className="max-w-[172px] sm:max-w-[205px]" />
        </div>

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => {
            const active = isActive(location.pathname, item);
            return (
              <Link
                key={`${item.label}-${item.to}`}
                to={item.to}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
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
