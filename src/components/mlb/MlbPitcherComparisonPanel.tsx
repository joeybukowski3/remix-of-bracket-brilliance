import MlbPlayerHeadshot from "@/components/mlb/MlbPlayerHeadshot";
import MlbStatComparisonRow from "@/components/mlb/MlbStatComparisonRow";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import { getMlbTeamColors } from "@/lib/mlbTeamColors";
import type { MlbComparisonMetric, MlbStarterProfile } from "@/lib/mlb/mlbTypes";

export default function MlbPitcherComparisonPanel({
  awayPitcher,
  homePitcher,
  metrics,
  awayAbbreviation,
  homeAbbreviation,
}: {
  awayPitcher: MlbStarterProfile;
  homePitcher: MlbStarterProfile;
  metrics: MlbComparisonMetric[];
  awayAbbreviation: string;
  homeAbbreviation: string;
}) {
  const awayColors = getMlbTeamColors(awayAbbreviation);
  const homeColors = getMlbTeamColors(homeAbbreviation);

  return (
    <div className="space-y-2.5">
      {/* Both pitchers always on same row */}
      <div className="grid grid-cols-[1fr_28px_1fr] items-center gap-1.5">

        {/* Away pitcher */}
        <div className="flex items-center gap-2 rounded-xl p-2 min-w-0" style={{ backgroundColor: awayColors.tint }}>
          <div className="relative shrink-0">
            <MlbPlayerHeadshot playerId={awayPitcher.id} name={awayPitcher.name} size={40} teamAbbreviation={awayAbbreviation} />
            <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white ring-1 ring-black/10">
              <MlbTeamLogo team={awayAbbreviation} size={12} />
            </div>
          </div>
          <div className="min-w-0">
            <div className="truncate text-[11px] font-bold leading-tight" style={{ color: awayColors.primary }}>{awayPitcher.name}</div>
            <div className="text-[10px] text-muted-foreground">{awayPitcher.hand}HP · {awayPitcher.record}</div>
            {awayPitcher.era != null && <div className="text-[10px] font-semibold text-foreground">{Number(awayPitcher.era).toFixed(2)} ERA</div>}
            {awayPitcher.regressionScore != null && (
              <div className={`text-[9px] font-bold ${awayPitcher.regressionScore < -3 ? "text-green-600" : awayPitcher.regressionScore > 3 ? "text-red-600" : "text-slate-500"}`}>
                Regr: {awayPitcher.regressionScore > 0 ? "+" : ""}{awayPitcher.regressionScore}
              </div>
            )}
          </div>
        </div>

        {/* VS */}
        <div className="flex flex-col items-center">
          <span className="text-[11px] font-bold text-muted-foreground">vs</span>
          {awayPitcher.hand === homePitcher.hand && (
            <span className="text-[8px] uppercase tracking-wide text-muted-foreground/50">both {awayPitcher.hand}HP</span>
          )}
        </div>

        {/* Home pitcher */}
        <div className="flex items-center justify-end gap-2 rounded-xl p-2 min-w-0" style={{ backgroundColor: homeColors.tint }}>
          <div className="min-w-0 text-right">
            <div className="truncate text-[11px] font-bold leading-tight" style={{ color: homeColors.primary }}>{homePitcher.name}</div>
            <div className="text-[10px] text-muted-foreground">{homePitcher.hand}HP · {homePitcher.record}</div>
            {homePitcher.era != null && <div className="text-[10px] font-semibold text-foreground">{Number(homePitcher.era).toFixed(2)} ERA</div>}
            {homePitcher.regressionScore != null && (
              <div className={`text-[9px] font-bold ${homePitcher.regressionScore < -3 ? "text-green-600" : homePitcher.regressionScore > 3 ? "text-red-600" : "text-slate-500"}`}>
                Regr: {homePitcher.regressionScore > 0 ? "+" : ""}{homePitcher.regressionScore}
              </div>
            )}
          </div>
          <div className="relative shrink-0">
            <MlbPlayerHeadshot playerId={homePitcher.id} name={homePitcher.name} size={40} teamAbbreviation={homeAbbreviation} />
            <div className="absolute -bottom-1 -left-1 flex h-4 w-4 items-center justify-center rounded-full bg-white ring-1 ring-black/10">
              <MlbTeamLogo team={homeAbbreviation} size={12} />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        {metrics.map((metric) => (
          <MlbStatComparisonRow
            key={metric.key}
            {...metric}
            leftTeam={awayAbbreviation}
            rightTeam={homeAbbreviation}
            leftName={awayPitcher.name.split(" ").pop()}
            rightName={homePitcher.name.split(" ").pop()}
          />
        ))}
      </div>
    </div>
  );
}
