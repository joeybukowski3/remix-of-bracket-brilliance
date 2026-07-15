import { Fragment, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { SPORTSBOOKS } from "@/lib/sportsbooks";
import { MLB_NAV_SECTIONS, isMlbNavItemActive, type MlbNavItem } from "@/lib/mlb/sectionNav";

const STAT_GLOSSARY: [string, string][] = [
  ["xERA", "Expected ERA from Statcast exit velocity & launch angle. Strips luck from actual results."],
  ["xFIP", "Expected FIP — normalises HR/FB% to league average. Best predictor of future ERA."],
  ["K-BB%", "Strikeout rate minus walk rate. Pure skill indicator — higher = better command."],
  ["LOB%", "Left-on-base (strand) rate. League avg ~73%. >80% is unsustainable luck."],
  ["HR/FB%", "Home runs per fly ball. League avg ~10.5%. <8% = likely lucky, >13% = unlucky."],
  ["BABIP", "Batting avg on balls in play. Pitcher norm ~.300. <.270 = likely lucky."],
  ["Regr ↓", "Blue pill — pitcher is overperforming ERA vs metrics. Regression toward higher ERA likely."],
  ["Regr ↑", "Green pill — pitcher is underperforming ERA vs metrics. ERA improvement likely."],
];

function NavLink({ item, active, onNavigate }: { item: MlbNavItem; active: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "mx-2 flex items-center gap-3 rounded-lg px-4 py-2.5 text-xs font-bold transition hover:translate-x-1 hover:bg-[#dce9ff] hover:text-[#031635]",
        active ? "bg-[#dce9ff] text-[#031635]" : "text-slate-600",
      )}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}

type MlbSectionSidebarProps = {
  mobile?: boolean;
  onNavigate?: () => void;
};

export default function MlbSectionSidebar({ mobile = false, onNavigate }: MlbSectionSidebarProps) {
  const location = useLocation();
  const isActive = (item: MlbNavItem) => isMlbNavItemActive(location.pathname, location.hash, item);

  return (
    <aside
      className={cn(
        "w-56 shrink-0 self-start border-r border-slate-200 bg-[#eff4ff] py-4",
        mobile ? "block" : "hidden xl:block xl:sticky xl:top-24 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto",
      )}
      aria-label="MLB platform navigation"
    >
      <div className="mb-5 px-5">
        <Link to="/mlb" onClick={onNavigate}>
          <img src="/logos/mlb.svg" alt="MLB" className="h-9 w-auto" />
        </Link>
      </div>

      <nav className="flex flex-col gap-1" aria-label="MLB sitemap">
        {MLB_NAV_SECTIONS.map((section, index) => (
          <Fragment key={section.id}>
            {index > 0 && <div className="mx-4 my-2 border-t border-slate-200" />}
            <div className="px-5 pb-1 text-[9px] font-semibold uppercase tracking-widest text-slate-400">
              {section.label}
            </div>
            {section.items.map((item) => (
              <NavLink key={item.id} item={item} active={isActive(item)} onNavigate={onNavigate} />
            ))}
          </Fragment>
        ))}
      </nav>

      {/* Vertical "Bet with our partners" section card (stacked, no horizontal scroll) */}
      <div className="mt-4 border-t border-slate-200 pt-3 px-3">
        <div className="px-1 mb-1.5 text-[10px] font-semibold tracking-wide text-slate-500">
          Bet with our partners
        </div>
        <div className="flex flex-col gap-1">
          {SPORTSBOOKS.map((sb) => (
            <a
              key={sb.name}
              href={sb.referralUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md px-3 py-[5px] text-[11px] font-bold transition hover:opacity-95 active:opacity-90"
              style={{ backgroundColor: sb.bgColor, color: sb.textColor }}
            >
              <img
                src={sb.logoUrl}
                alt={sb.name}
                className="h-4 w-4 rounded object-contain shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              {sb.name}
            </a>
          ))}
        </div>
        <div className="mt-2 px-1 text-[9px] text-slate-400">21+ • Call 1-800-GAMBLER</div>
      </div>

      {/* Stat Glossary */}
      <div className="mt-6 border-t border-slate-200 px-4 pt-4">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Stat Glossary</div>
        <dl className="space-y-2">
          {STAT_GLOSSARY.map(([term, def]) => (
            <div key={term}>
              <dt className="text-[10px] font-extrabold text-slate-700">{term}</dt>
              <dd className="text-[9px] leading-tight text-slate-500">{def}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 rounded-md bg-slate-100 p-2">
          <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">Regression Scale</div>
          <div className="flex items-center gap-1">
            <span className="rounded px-1 py-0.5 text-[8px] font-bold" style={{ backgroundColor: "#1e3a8a", color: "#93c5fd" }}>-10</span>
            <div className="h-1.5 flex-1 rounded-full bg-gradient-to-r from-[#1e3a8a] via-[#dbeafe] to-white to-[#dcfce7] via-white via-[50%]" style={{ background: "linear-gradient(to right, #1e3a8a, #93c5fd, #dbeafe, #f1f5f9, #dcfce7, #22c55e, #15803d)" }} />
            <span className="rounded px-1 py-0.5 text-[8px] font-bold" style={{ backgroundColor: "#14532d", color: "#bbf7d0" }}>+10</span>
          </div>
          <div className="mt-0.5 flex justify-between text-[8px] text-slate-400">
            <span>Blue = regress ↓</span>
            <span>0 = neutral</span>
            <span>Green = improve ↑</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function MlbMobileMenu() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.hash]);

  return (
    <div className="mb-4 xl:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-between border-slate-200 bg-white font-black text-slate-900 shadow-sm" aria-label="Open MLB menu">
            <span className="inline-flex items-center gap-2">
              <Menu className="h-4 w-4" aria-hidden />
              MLB Menu
            </span>
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Sections</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="top-[73px] h-[calc(100vh-73px)] w-[88vw] max-w-sm overflow-y-auto bg-slate-50 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>MLB Menu</SheetTitle>
            <SheetDescription>Navigate Joe Knows Ball MLB pages.</SheetDescription>
          </SheetHeader>
          <MlbSectionSidebar mobile onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
