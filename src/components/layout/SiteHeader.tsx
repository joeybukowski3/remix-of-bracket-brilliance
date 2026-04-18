import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
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
    <header className="sticky top-0 z-[100] border-b border-[#eeeeee] bg-white">
      <div className="mx-auto flex min-h-[64px] max-w-[1440px] items-center justify-between px-4 sm:px-8">
        <Link to="/" className="inline-flex items-center gap-[10px] no-underline">
          <img
            src="/images/IconOnly_Transparent.png"
            alt="Joe Knows Ball icon"
            className="h-9 w-9 object-contain"
          />
          <span className="text-[18px] font-bold tracking-normal text-[#1a1a1a] normal-case">
            Joe Knows Ball
          </span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {navItems.map((item) => {
            const active = isActive(location.pathname, item);
            if (!item.to) {
              return (
                <span
                  key={`${item.label}-disabled`}
                  className="text-[15px] font-medium text-[#333333]"
                >
                  {item.label}
                </span>
              );
            }
            return (
              <Link
                key={`${item.label}-${item.to}`}
                to={item.to}
                className={`transition ${
                  active
                    ? "rounded-[20px] bg-[#f0f0f0] px-[14px] py-1 text-[15px] font-semibold text-[#111111]"
                    : "px-0 py-0 text-[15px] font-medium text-[#333333] hover:text-[#000000]"
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
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#1a1a1a] transition hover:bg-[#f5f5f5] md:hidden"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen ? (
        <div className="border-t border-[#eeeeee] px-4 py-3 md:hidden">
          <div className="rounded-2xl bg-white p-3 shadow-[0_12px_32px_rgba(17,17,17,0.05)]">
            <nav className="flex flex-col gap-2">
              {navItems.map((item) => {
                const active = isActive(location.pathname, item);
                if (!item.to) {
                  return (
                    <span
                      key={`${item.label}-disabled-mobile`}
                      className="rounded-2xl px-4 py-2.5 text-sm text-[#333333]"
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
                      active ? "bg-[#f0f0f0] font-semibold text-[#111111]" : "text-[#333333] hover:bg-[#f5f5f5] hover:text-[#000000]"
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
