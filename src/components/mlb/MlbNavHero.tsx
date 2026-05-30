import { Link, useLocation } from "react-router-dom";
import { CalendarDays, Flame, Radar, Swords } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_TILES = [
  { label: "HR Props",      to: "/mlb/hr-props",          bg: "bg-sky-500 hover:bg-sky-600",     icon: <Flame      className="h-3 w-3" /> },
  { label: "K Props",       to: "/mlb/strikeout-props",   bg: "bg-emerald-500 hover:bg-emerald-600", icon: <Radar  className="h-3 w-3" /> },
  { label: "Hit Props",     to: "/mlb/batter-vs-pitcher", bg: "bg-violet-500 hover:bg-violet-600",   icon: <Swords className="h-3 w-3" /> },
  { label: "Game Matchups", to: "/mlb#schedule",          bg: "bg-amber-500 hover:bg-amber-600",  icon: <CalendarDays className="h-3 w-3" /> },
];

export default function MlbNavHero() {
  const { pathname } = useLocation();

  return (
    <section className="flex items-center gap-3 rounded-xl bg-[#1a2b4b] px-4 py-3 shadow-sm">
      <img src="/logos/mlb.svg" alt="MLB" className="h-8 w-auto shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-300/70">MLB Hub</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {NAV_TILES.map((tile) => {
            const isActive = pathname === tile.to || (tile.to !== "/mlb" && pathname.startsWith(tile.to.split("#")[0]));
            return (
              <Link
                key={tile.label}
                to={tile.to}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-extrabold text-white transition",
                  tile.bg,
                  isActive && "ring-2 ring-white/40",
                )}
              >
                {tile.icon}
                {tile.label}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
