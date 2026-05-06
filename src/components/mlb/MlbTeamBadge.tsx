import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import { getMlbTeamColors } from "@/lib/mlbTeamColors";

export default function MlbTeamBadge({
  abbreviation,
  name,
  record,
  size = 44,
  compact = false,
}: {
  abbreviation: string;
  name: string;
  record?: string;
  size?: number;
  compact?: boolean;
}) {
  const colors = getMlbTeamColors(abbreviation);

  return (
    <div className="flex items-center gap-3">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ring-black/5"
        style={{ backgroundColor: colors.tint }}
      >
        <MlbTeamLogo team={abbreviation} size={size} />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold sm:text-base" style={{ color: colors.primary }}>{name}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{abbreviation}</span>
          {record ? (
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
              style={{ backgroundColor: colors.primary, color: "#ffffff" }}
            >
              {compact ? record : `${abbreviation} • ${record}`}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
