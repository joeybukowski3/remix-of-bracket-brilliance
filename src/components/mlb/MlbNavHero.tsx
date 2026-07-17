import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { AlertTriangle, BarChart3, CalendarDays, Dice5, Flame, Radar, Swords, TrendingUp } from "lucide-react";
import MlbHrBestBets from "@/components/mlb/MlbHrBestBets";
import { cn } from "@/lib/utils";

const NAV_TILES = [
  { label: "HR Props", to: "/mlb/hr-props", bg: "bg-sky-500 hover:bg-sky-600", icon: <Flame className="h-3 w-3" /> },
  { label: "Strikeout Props", to: "/mlb/strikeout-props", bg: "bg-emerald-500 hover:bg-emerald-600", icon: <Radar className="h-3 w-3" /> },
  { label: "Batter vs Pitcher", to: "/mlb/batter-vs-pitcher", bg: "bg-violet-500 hover:bg-violet-600", icon: <Swords className="h-3 w-3" /> },
  { label: "Game Matchups", to: "/mlb#schedule", bg: "bg-amber-500 hover:bg-amber-600", icon: <CalendarDays className="h-3 w-3" /> },
  { label: "Props Hub", to: "/mlb/props", bg: "bg-cyan-500 hover:bg-cyan-600", icon: <TrendingUp className="h-3 w-3" /> },
  { label: "Power Rankings", to: "/mlb/power-rankings", bg: "bg-indigo-500 hover:bg-indigo-600", icon: <BarChart3 className="h-3 w-3" /> },
  { label: "Sin City", to: "/mlb/sin-city", bg: "bg-rose-500 hover:bg-rose-600", icon: <Dice5 className="h-3 w-3" /> },
  { label: "Vulnerable Pitchers", to: "/mlb/vulnerable-pitchers", bg: "bg-orange-500 hover:bg-orange-600", icon: <AlertTriangle className="h-3 w-3" /> },
];

const MLB_MAIN_DESKTOP_STYLES = `
  @media (min-width: 1024px) {
    /* The .site-container width-forcing rule that used to live here has
       been removed: /mlb now sits inside MlbLayout's shared sidebar grid,
       which already controls outer width via its own "wide" content
       variant. Forcing .site-container to 96vw fought that and pushed
       content past the sidebar's content column, causing horizontal
       overflow. The readability text-size bumps below are unrelated and
       still apply. */
    body.mlb-main-readable main {
      font-size: 15px;
    }

    body.mlb-main-readable main [class*="text-[9px]"] {
      font-size: 11px !important;
      line-height: 1.35 !important;
    }

    body.mlb-main-readable main [class*="text-[10px]"] {
      font-size: 11.5px !important;
      line-height: 1.4 !important;
    }

    body.mlb-main-readable main [class*="text-[11px]"] {
      font-size: 12.5px !important;
      line-height: 1.4 !important;
    }

    body.mlb-main-readable main [class*="text-xs"] {
      font-size: 13px !important;
      line-height: 1.45 !important;
    }

    body.mlb-main-readable main table th {
      font-size: 11.5px !important;
      padding: 10px 12px !important;
    }

    body.mlb-main-readable main table td {
      font-size: 12.5px !important;
      padding: 9px 12px !important;
    }

    body.mlb-main-readable main article,
    body.mlb-main-readable main section {
      letter-spacing: 0;
    }
  }
`;

export default function MlbNavHero() {
  const { pathname } = useLocation();
  const showHrBestBets = pathname === "/mlb/hr-props";
  const isMainMlbHub = pathname === "/mlb";

  useEffect(() => {
    if (!isMainMlbHub) return;
    document.body.classList.add("mlb-main-readable");
    return () => document.body.classList.remove("mlb-main-readable");
  }, [isMainMlbHub]);

  return (
    <div>
      {isMainMlbHub && <style>{MLB_MAIN_DESKTOP_STYLES}</style>}
      <section className="flex items-center gap-3 rounded-xl bg-[#1a2b4b] px-4 py-3 shadow-sm">
        <img src="/logos/mlb.svg" alt="MLB" className="h-8 w-auto shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-300/70">MLB Hub</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {NAV_TILES.map((tile) => {
              const routePath = tile.to.split("#")[0];
              const isActive = pathname === routePath;
              return (
                <Link key={tile.label} to={tile.to} className={cn("flex min-h-7 items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-extrabold text-white transition", tile.bg, isActive && "ring-2 ring-white/40")}>
                  {tile.icon}
                  {tile.label}
                </Link>
              );
            })}
          </div>
        </div>
      </section>
      {showHrBestBets && <MlbHrBestBets />}
    </div>
  );
}
