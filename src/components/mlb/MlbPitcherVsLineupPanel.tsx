import MlbPitcherVsLineupCard from "@/components/mlb/MlbPitcherVsLineupCard";
import MlbValuePill from "@/components/mlb/MlbValuePill";
import { computeHr9, computeK9, computePercent, formatAvgLike, formatDecimal } from "@/lib/mlb/mlbFormatters";
import type { MlbLineupSummary, MlbOpponentSplit, MlbStarterProfile } from "@/lib/mlb/mlbTypes";

export default function MlbPitcherVsLineupPanel({
  title,
  pitcher,
  lineupLabel,
  split,
  lineupSummary,
}: {
  title: string;
  pitcher: MlbStarterProfile;
  lineupLabel: string;
  split: MlbOpponentSplit;
  lineupSummary: MlbLineupSummary;
}) {
  const cards = [
    {
      label: "Strikeout shape",
      pitcherValue: `${computeK9(pitcher.strikeOuts, pitcher.inningsPitched)?.toFixed(1) ?? "—"} K/9`,
      lineupValue: `${computePercent(split?.strikeOuts ?? null, split?.plateAppearances ?? null)?.toFixed(1) ?? "—"}% K`,
    },
    {
      label: "Command / traffic",
      pitcherValue: `${computePercent(pitcher.baseOnBalls, pitcher.battersFaced)?.toFixed(1) ?? "—"}% BB`,
      lineupValue: formatAvgLike(split?.obp ?? lineupSummary.obp ?? null),
    },
    {
      label: "Damage risk",
      pitcherValue: `${computeHr9(pitcher.homeRuns, pitcher.inningsPitched)?.toFixed(2) ?? "—"} HR/9`,
      lineupValue: formatAvgLike(split?.slg ?? lineupSummary.slg ?? null),
    },
    {
      label: "Overall production",
      pitcherValue: formatDecimal(pitcher.era, 2),
      lineupValue: formatAvgLike(split?.ops ?? lineupSummary.ops ?? null),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <MlbValuePill>{title}</MlbValuePill>
        <span className="text-sm text-muted-foreground">{lineupLabel}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <MlbPitcherVsLineupCard
            key={card.label}
            label={card.label}
            pitcherValue={card.pitcherValue}
            lineupValue={card.lineupValue}
          />
        ))}
      </div>
    </div>
  );
}
