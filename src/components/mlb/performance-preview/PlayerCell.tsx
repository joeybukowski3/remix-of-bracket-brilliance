import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";

/** Small logo + player name cell, shared across the HR/Numerology/Sin City tables. MlbTeamLogo already degrades to a colored-initials badge, so a missing/broken logo never breaks the row. */
export default function PlayerCell({ name, team }: { name: string; team: string }) {
  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      <MlbTeamLogo team={team} size={20} />
      <span className="truncate font-semibold text-slate-900">{name}</span>
    </div>
  );
}
