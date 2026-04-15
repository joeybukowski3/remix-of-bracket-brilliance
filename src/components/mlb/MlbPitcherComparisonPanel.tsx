import MlbStatComparisonRow from "@/components/mlb/MlbStatComparisonRow";
import type { MlbComparisonMetric, MlbStarterProfile } from "@/lib/mlb/mlbTypes";

function PitcherPhoto({ pitcher, align }: { pitcher: MlbStarterProfile; align: "left" | "right" }) {
  const espnUrl = pitcher.id
    ? `https://a.espncdn.com/combiner/i?img=/i/headshots/mlb/players/full/${pitcher.id}.png&w=200&h=145`
    : null;

  const initials = pitcher.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={`flex items-center gap-3 ${align === "right" ? "flex-row-reverse" : ""}`}>
      <div className="relative h-16 w-16 shrink-0">
        {espnUrl ? (
          <img
            src={espnUrl}
            alt={pitcher.name}
            className="h-16 w-16 rounded-full object-cover object-top ring-2 ring-border"
            onError={(e) => {
              const target = e.currentTarget;
              target.style.display = "none";
              const fallback = target.nextElementSibling as HTMLElement;
              if (fallback) fallback.style.display = "flex";
            }}
          />
        ) : null}
        <div
          className="h-16 w-16 rounded-full bg-secondary ring-2 ring-border items-center justify-center text-sm font-semibold text-muted-foreground"
          style={{ display: espnUrl ? "none" : "flex" }}
        >
          {initials}
        </div>
      </div>
      <div className={align === "right" ? "text-right" : ""}>
        <div className="text-sm font-semibold text-foreground">{pitcher.name}</div>
        <div className="text-xs text-muted-foreground">{pitcher.hand} • {pitcher.record}</div>
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
}: {
  awayPitcher: MlbStarterProfile;
  homePitcher: MlbStarterProfile;
  metrics: MlbComparisonMetric[];
}) {
  return (
    <div className="space-y-6">
      {/* Pitcher photo header */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-2xl border border-border/60 bg-secondary/30 p-4">
        <PitcherPhoto pitcher={awayPitcher} align="left" />
        <div className="text-center">
          <div className="text-lg font-semibold text-muted-foreground">vs</div>
          <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground/60">
            {awayPitcher.hand === homePitcher.hand ? `Both ${awayPitcher.hand}HP` : ""}
          </div>
        </div>
        <PitcherPhoto pitcher={homePitcher} align="right" />
      </div>

      {/* Stat comparison bars */}
      <div className="space-y-3">
        {metrics.map((metric) => (
          <MlbStatComparisonRow key={metric.key} {...metric} />
        ))}
      </div>
    </div>
  );
}
