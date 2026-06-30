import { Link, useLocation } from "react-router-dom";
import {
  BarChart3,
  CalendarDays,
  Flame,
  Radar,
  Rocket,
  Sparkles,
  Swords,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SPORTSBOOKS } from "@/lib/sportsbooks";

export type MlbHubLink = {
  label: string;
  to: string;
  icon: React.ReactNode;
};

/**
 * Single source of truth for the MLB hub sidebar navigation. Order matters --
 * the sidebar renders the first PRIMARY_LINK_COUNT as the primary nav block
 * and the rest under a "Tables" sub-heading. Numerology sits directly under
 * Power Rankings per product requirement, with a visible Sparkles icon --
 * this replaces the prior invisible "369" easter-egg link that lived only
 * in MlbGameDetail.tsx (color: transparent, only discoverable by selecting
 * text). That hidden link is removed since this is now the single,
 * visible, accessible entry point to /mlb/numerology from every MLB page.
 */
export const MLB_HUB_LINKS: MlbHubLink[] = [
  { label: "Hit Props", to: "/mlb/batter-vs-pitcher", icon: <Swords className="h-4 w-4" /> },
  { label: "HR Props", to: "/mlb/hr-props", icon: <Flame className="h-4 w-4" /> },
  { label: "K Props", to: "/mlb/strikeout-props", icon: <Radar className="h-4 w-4" /> },
  { label: "Game Matchups", to: "/mlb#schedule", icon: <CalendarDays className="h-4 w-4" /> },
  { label: "Power Rankings", to: "/mlb/power-rankings", icon: <BarChart3 className="h-4 w-4" /> },
  { label: "Numerology", to: "/mlb/numerology", icon: <Sparkles className="h-4 w-4" /> },
  { label: "Moneyline Edges", to: "/mlb#moneylines", icon: <TrendingUp className="h-4 w-4" /> },
  { label: "Pitcher Regression", to: "/mlb#pitcher-regression", icon: <BarChart3 className="h-4 w-4" /> },
  { label: "Overdue Batters", to: "/mlb/hr-props#overdue", icon: <Flame className="h-4 w-4" /> },
  { label: "Biggest Mismatches", to: "/mlb/hr-props#mismatches", icon: <Swords className="h-4 w-4" /> },
  { label: "Schedule", to: "/mlb#schedule", icon: <CalendarDays className="h-4 w-4" /> },
];

/** Number of links rendered in the primary (un-headed) nav block before the "Tables" sub-heading. */
const PRIMARY_LINK_COUNT = 6;

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

/** Returns true if the given link's route is the current page (ignoring hash fragments, which point to in-page sections of /mlb rather than distinct pages). */
function isActiveLink(pathname: string, to: string): boolean {
  const base = to.split("#")[0];
  if (!base) return false;
  if (base === "/mlb") return pathname === "/mlb";
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * Shared MLB hub sidebar -- the single source of truth for MLB navigation,
 * the partner sportsbook list, the stat glossary, and the regression-scale
 * legend. Rendered identically across every MLB page via MlbPageLayout.
 */
export default function MlbHubSidebar() {
  const location = useLocation();

  return (
    <aside className="hidden w-56 shrink-0 self-start border-r border-slate-200 bg-[#eff4ff] py-4 lg:sticky lg:top-24 lg:block lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
      <div className="mb-5 px-5">
        <Link to="/mlb">
          <img src="/logos/mlb.svg" alt="MLB" className="h-9 w-auto" />
        </Link>
      </div>
      <nav className="flex flex-col gap-1" aria-label="MLB navigation">
        {MLB_HUB_LINKS.slice(0, PRIMARY_LINK_COUNT).map((item) => {
          const active = isActiveLink(location.pathname, item.to);
          return (
            <Link
              key={item.label}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "mx-2 flex items-center gap-3 rounded-lg px-4 py-2.5 text-xs font-bold transition hover:translate-x-1 hover:bg-[#dce9ff] hover:text-[#031635]",
                active ? "bg-[#dce9ff] text-[#031635]" : "text-slate-600",
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
        <div className="mx-4 my-2 border-t border-slate-200" />
        <div className="px-5 pb-1 text-[9px] font-semibold uppercase tracking-widest text-slate-400">Tables</div>
        {MLB_HUB_LINKS.slice(PRIMARY_LINK_COUNT).map((item) => {
          const active = isActiveLink(location.pathname, item.to);
          return (
            <Link
              key={item.label}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "mx-2 flex items-center gap-3 rounded-lg px-4 py-2.5 text-xs font-bold transition hover:translate-x-1 hover:bg-[#dce9ff] hover:text-[#031635]",
                active ? "bg-[#dce9ff] text-[#031635]" : "text-slate-600",
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-6 px-4">
        <Link
          to="/mlb/props"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#031635] px-4 py-3 text-xs font-extrabold text-white transition hover:bg-[#1a2b4b]"
        >
          <Rocket className="h-4 w-4" />
          Prop Optimizer
        </Link>
      </div>

      {/* Bet with our partners */}
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
            <div className="h-1.5 flex-1 rounded-full" style={{ background: "linear-gradient(to right, #1e3a8a, #93c5fd, #dbeafe, #f1f5f9, #dcfce7, #22c55e, #15803d)" }} />
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
