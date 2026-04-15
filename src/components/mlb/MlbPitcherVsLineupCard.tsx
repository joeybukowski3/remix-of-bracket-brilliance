import MlbValuePill from "@/components/mlb/MlbValuePill";

export default function MlbPitcherVsLineupCard({
  label,
  pitcherValue,
  lineupValue,
}: {
  label: string;
  pitcherValue: string;
  lineupValue: string;
}) {
  return (
    <div className="rounded-2xl bg-secondary/35 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <MlbValuePill>Matchup</MlbValuePill>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-card/80 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Pitcher</div>
          <div className="mt-1 font-semibold text-foreground">{pitcherValue}</div>
        </div>
        <div className="rounded-2xl bg-card/80 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Opposing lineup</div>
          <div className="mt-1 font-semibold text-foreground">{lineupValue}</div>
        </div>
      </div>
    </div>
  );
}
