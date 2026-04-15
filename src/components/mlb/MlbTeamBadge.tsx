import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";

export default function MlbTeamBadge({
  abbreviation,
  name,
  record,
  size = 44,
}: {
  abbreviation: string;
  name: string;
  record?: string;
  size?: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/70">
        <MlbTeamLogo team={abbreviation} size={size} />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground sm:text-base">{name}</div>
        <div className="text-xs text-muted-foreground">
          {abbreviation}
          {record ? ` • ${record}` : ""}
        </div>
      </div>
    </div>
  );
}
