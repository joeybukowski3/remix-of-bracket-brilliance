import MlbContextChip from "@/components/mlb/MlbContextChip";
import MlbStatComparisonRow from "@/components/mlb/MlbStatComparisonRow";
import { getMlbTeamColors } from "@/lib/mlbTeamColors";

export default function MlbParkContextPanel({
  venue,
  weather,
  parkType,
  totalLean,
  factorLabel,
  starterEraMetrics,
  runFactor,
  hrFactor,
  awayAbbreviation,
  homeAbbreviation,
}: {
  venue: string;
  weather: string;
  parkType: string;
  totalLean: string;
  factorLabel: string;
  starterEraMetrics: Array<{
    key: string;
    label: string;
    leftValue: number | null;
    rightValue: number | null;
    leagueAverage: number | null;
    format: "era" | "factor";
    scaleKey: "era" | "factor";
  }>;
  runFactor: number | null;
  hrFactor: number | null;
  awayAbbreviation: string;
  homeAbbreviation: string;
}) {
  const awayColors = getMlbTeamColors(awayAbbreviation);
  const homeColors = getMlbTeamColors(homeAbbreviation);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <MlbContextChip label={parkType} style={{ backgroundColor: awayColors.tint, color: awayColors.primary }} />
        <MlbContextChip label={totalLean} style={{ backgroundColor: homeColors.tint, color: homeColors.primary }} />
        <MlbContextChip label={factorLabel} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.25fr]">
        <div className="rounded-[24px] bg-secondary/30 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Environment</div>
          <div className="mt-3 space-y-3 text-sm">
            <div>
              <div className="text-muted-foreground">Venue</div>
              <div className="font-semibold text-foreground">{venue}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Weather</div>
              <div className="font-semibold text-foreground">{weather}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-card/80 p-3">
                <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Run factor</div>
                <div className="mt-1 text-sm font-semibold text-foreground">{runFactor ?? "—"}</div>
              </div>
              <div className="rounded-2xl bg-card/80 p-3">
                <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">HR factor</div>
                <div className="mt-1 text-sm font-semibold text-foreground">{hrFactor ?? "—"}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          {starterEraMetrics.map((metric) => (
            <MlbStatComparisonRow
              key={metric.key}
              {...metric}
              leftTeam={awayAbbreviation}
              rightTeam={homeAbbreviation}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
