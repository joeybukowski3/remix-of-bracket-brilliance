import PgaHeatmapCell from "@/components/pga/PgaHeatmapCell";
import { formatCompositeScore } from "@/lib/pga/pgaModelHelpers";
import type { PlayerModelRow } from "@/lib/pga/pgaTypes";

const statGroups = [
  { label: "Trend", key: "trendRank" },
  { label: "Approach", key: "sgApproachRank" },
  { label: "Par 4", key: "par4Rank" },
  { label: "Accuracy", key: "drivingAccuracyRank" },
  { label: "Bogey", key: "bogeyAvoidanceRank" },
  { label: "ARG", key: "sgAroundGreenRank" },
  { label: "125-150", key: "birdie125150Rank" },
  { label: "Putting", key: "sgPuttingRank" },
  { label: "<125", key: "birdieUnder125Rank" },
] as const;

export default function PgaModelMobileCard({ player, maxRank }: { player: PlayerModelRow; maxRank: number }) {
  return (
    <article className="rounded-[28px] bg-card p-4 shadow-[0_16px_36px_hsl(var(--foreground)/0.05)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-[-0.03em] text-foreground">{player.player}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Harbour Town profile and model output</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-secondary px-3 py-2 text-right">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Score</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{formatCompositeScore(player.score)}</p>
          </div>
          <div className="rounded-2xl bg-secondary px-3 py-2 text-right">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Rank</p>
            <p className="mt-1 text-sm font-semibold text-primary">{player.rank}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-secondary/65 p-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">HT Rounds</p>
          <p className="mt-1 text-foreground">{player.htRounds ?? "—"}</p>
        </div>
        <div className="rounded-2xl bg-secondary/65 p-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Cuts Last 5</p>
          <p className="mt-1 text-foreground">{player.cutsLast5}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {statGroups.map((stat) => (
          <div key={`${player.id}-${stat.key}`} className="rounded-2xl bg-secondary/40 p-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{stat.label}</p>
            <div className="mt-2">
              <PgaHeatmapCell value={player[stat.key] as number | null} maxRank={maxRank} className="min-w-[3.5rem]" />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
