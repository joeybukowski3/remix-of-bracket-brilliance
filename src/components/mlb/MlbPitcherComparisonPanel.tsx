import MlbPlayerHeadshot from "@/components/mlb/MlbPlayerHeadshot";
import MlbStatComparisonRow from "@/components/mlb/MlbStatComparisonRow";
import { getMlbTeamColors } from "@/lib/mlbTeamColors";
import type { MlbComparisonMetric, MlbStarterProfile } from "@/lib/mlb/mlbTypes";

function PitcherPhoto({
  pitcher,
  align,
  teamAbbreviation,
}: {
  pitcher: MlbStarterProfile;
  align: "left" | "right";
  teamAbbreviation: string;
}) {
  const colors = getMlbTeamColors(teamAbbreviation);

  return (
    <div className={`flex items-center gap-3 ${align === "right" ? "flex-row-reverse" : ""}`}>
      <MlbPlayerHeadshot playerId={pitcher.id} name={pitcher.name} size={72} teamAbbreviation={teamAbbreviation} />
      <div className={align === "right" ? "text-right" : ""}>
        <div className="text-sm font-semibold" style={{ color: colors.primary }}>{pitcher.name}</div>
        <div className="text-xs text-muted-foreground">
          {pitcher.hand} • {pitcher.record}
        </div>
        {pitcher.era != null && (
          <div className="mt-1 text-xs font-medium text-foreground">{Number(pitcher.era).toFixed(2)} ERA</div>
        )}
      </div>
    </div>
  );
}

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
    <div className="space-y-6">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-2xl border border-border/60 p-4">
        <div className="rounded-2xl p-3" style={{ backgroundColor: awayColors.tint }}>
          <PitcherPhoto pitcher={awayPitcher} align="left" teamAbbreviation={awayAbbreviation} />
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-muted-foreground">vs</div>
          <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground/60">
            {awayPitcher.hand === homePitcher.hand ? `Both ${awayPitcher.hand}HP` : ""}
          </div>
        </div>
        <div className="rounded-2xl p-3" style={{ backgroundColor: homeColors.tint }}>
          <PitcherPhoto pitcher={homePitcher} align="right" teamAbbreviation={homeAbbreviation} />
        </div>
      </div>

      <div className="space-y-3">
        {metrics.map((metric) => (
          <MlbStatComparisonRow
            key={metric.key}
            {...metric}
            leftTeam={awayAbbreviation}
            rightTeam={homeAbbreviation}
          />
        ))}
      </div>
    </div>
  );
}
