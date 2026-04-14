import PgaHeatmapCell from "@/components/pga/PgaHeatmapCell";
import { formatCompositeScore } from "@/lib/pga/pgaModelHelpers";
import type { PlayerModelRow } from "@/lib/pga/pgaTypes";

function finishTone(value: string | null) {
  if (!value) return "text-muted-foreground";
  if (value === "CUT") return "text-destructive";
  const parsed = Number.parseInt(value.replace("T", ""), 10);
  if (Number.isNaN(parsed)) return "text-foreground";
  if (parsed <= 5) return "text-[hsl(var(--success))] font-medium";
  if (parsed <= 20) return "text-primary";
  return "text-foreground";
}

function courseTone(value: number | null) {
  if (value == null) return "text-muted-foreground";
  if (value > 1) return "text-[hsl(var(--success))] font-medium";
  if (value > 0.25) return "text-primary";
  if (value < -0.2) return "text-destructive";
  return "text-foreground";
}

const statKeys: (keyof PlayerModelRow)[] = [
  "sgApproachRank",
  "par4Rank",
  "drivingAccuracyRank",
  "bogeyAvoidanceRank",
  "sgAroundGreenRank",
  "birdie125150Rank",
  "sgPuttingRank",
  "birdieUnder125Rank",
];

export default function PgaModelTableRow({ player, maxRank }: { player: PlayerModelRow; maxRank: number }) {
  return (
    <div className="grid min-w-[1700px] grid-cols-[220px_90px_70px_90px_90px_100px_repeat(5,72px)_repeat(8,112px)_110px] items-center gap-2 rounded-[24px] bg-secondary/42 px-2 py-2 transition-colors hover:bg-secondary/68">
      <div className="px-3 py-2">
        <p className="font-semibold text-foreground">{player.player}</p>
      </div>
      <div className="px-3 py-2 text-right text-sm font-semibold text-foreground">{formatCompositeScore(player.score)}</div>
      <div className="px-3 py-2 text-right text-sm font-semibold text-primary">{player.rank}</div>
      <div className="px-3 py-2 text-center">
        <PgaHeatmapCell value={player.trendRank} maxRank={maxRank} />
      </div>
      <div className="px-3 py-2 text-center text-sm text-foreground">{player.htRounds ?? "—"}</div>
      <div className="px-3 py-2 text-center text-sm text-foreground">{player.cutsLast5}</div>
      {([player.finish2025, player.finish2024, player.finish2023, player.finish2022, player.finish2021] as const).map((finish, index) => (
        <div key={`${player.id}-finish-${index}`} className={`px-3 py-2 text-center text-sm ${finishTone(finish)}`}>
          {finish ?? "—"}
        </div>
      ))}
      {statKeys.map((key) => (
        <div key={`${player.id}-${key}`} className="px-3 py-2 text-center">
          <PgaHeatmapCell value={player[key] as number | null} maxRank={maxRank} />
        </div>
      ))}
      <div className={`px-3 py-2 text-center text-sm ${courseTone(player.courseTrueSg)}`}>
        {player.courseTrueSg != null ? player.courseTrueSg.toFixed(3) : "—"}
      </div>
    </div>
  );
}
