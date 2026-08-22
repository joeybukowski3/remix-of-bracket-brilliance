import { Link } from "react-router-dom";
import type { FantasyRankingMode } from "@/lib/fantasy/rankingModes";
import { cn } from "@/lib/utils";

export default function FantasyRankingModeNav({
  mode,
  week,
}: {
  mode: FantasyRankingMode;
  week?: number;
}) {
  return (
    <nav aria-label="Fantasy ranking mode" className="grid grid-cols-2 rounded-lg bg-slate-200 p-1">
      <ModeLink
        active={mode === "weekly"}
        label="Weekly Rankings"
        to={week == null ? "/fantasy-football/weekly-rankings" : `/fantasy-football/weekly-rankings?week=${week}`}
      />
      <ModeLink active={mode === "ros"} label="Rest of Season" to="/fantasy-football?view=ros" />
    </nav>
  );
}

function ModeLink({ active, label, to }: { active: boolean; label: string; to: string }) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-2 text-center text-xs font-bold transition-colors",
        active ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-950",
      )}
    >
      {label}
    </Link>
  );
}
