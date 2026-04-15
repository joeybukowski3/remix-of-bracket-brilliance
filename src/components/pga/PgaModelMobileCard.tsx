import { formatCompositeScore } from "@/lib/pga/pgaModelHelpers";
import { getRankColor } from "@/lib/pga/rankColors";
import type { PlayerModelRow } from "@/lib/pga/pgaTypes";

const STAT_GROUPS = [
  { label: "Approach", key: "sgApproachRank" },
  { label: "Par 4", key: "par4Rank" },
  { label: "Drive Acc", key: "drivingAccuracyRank" },
  { label: "Bogey Av", key: "bogeyAvoidanceRank" },
  { label: "ARG", key: "sgAroundGreenRank" },
  { label: "125-150", key: "birdie125150Rank" },
  { label: "Putting", key: "sgPuttingRank" },
  { label: "<125", key: "birdieUnder125Rank" },
] as const;

function finishColor(val: string | null) {
  if (!val || val === "CUT") return val === "CUT" ? "text-red-500" : "text-muted-foreground";
  try {
    const n = parseInt(val.replace("T", ""), 10);
    if (n <= 5) return "text-emerald-700 dark:text-emerald-400 font-semibold";
    if (n <= 20) return "text-sky-700 dark:text-sky-400";
  } catch {
    // Ignore parse failures and fall back to the default text color.
  }
  return "text-foreground";
}

function csgColor(v: number | null) {
  if (v == null) return "text-muted-foreground";
  if (v > 1.0) return "text-emerald-700 dark:text-emerald-400 font-semibold";
  if (v > 0.3) return "text-emerald-600 dark:text-emerald-500";
  if (v >= 0) return "text-foreground";
  return "text-red-500 dark:text-red-400";
}

export default function PgaModelMobileCard({
  player,
  maxRank,
}: {
  player: PlayerModelRow;
  maxRank: number;
}) {
  const isTop5 = player.rank <= 5;
  const isTop10 = player.rank <= 10;

  return (
    <article
      className={`rounded-[24px] bg-card p-4 shadow-sm ring-1 ${
        isTop5
          ? "ring-emerald-300/60 dark:ring-emerald-800/60"
          : isTop10
            ? "ring-primary/20"
            : "ring-border/50"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            isTop5
              ? "bg-emerald-600 text-white"
              : isTop10
                ? "bg-primary/15 text-primary"
                : "bg-secondary text-muted-foreground"
          }`}
        >
          {player.rank}
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">{player.player}</h2>
          <p className="text-[11px] text-muted-foreground">
            {player.htRounds != null ? `${player.htRounds} HT rounds` : "No HT history"} · {player.cutsLast5} cuts
          </p>
        </div>

        <div
          className={`shrink-0 rounded-xl px-3 py-1.5 text-center ${
            isTop5 ? "bg-emerald-100 dark:bg-emerald-950/60" : "bg-secondary"
          }`}
        >
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Score</p>
          <p
            className={`mt-0.5 font-mono text-sm font-bold ${
              isTop5 ? "text-emerald-800 dark:text-emerald-300" : "text-foreground"
            }`}
          >
            {formatCompositeScore(player.score)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <div className="min-w-0 flex-1 rounded-[14px] bg-secondary/50 px-3 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Masters 2026</p>
          <p className={`mt-0.5 truncate font-mono text-xs ${finishColor(player.masters2026)}`}>
            {player.masters2026 || "—"}
          </p>
        </div>
        <div className="min-w-0 flex-1 rounded-[14px] bg-secondary/50 px-3 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Course SG</p>
          <p className={`mt-0.5 font-mono text-xs ${csgColor(player.courseTrueSg)}`}>
            {player.courseTrueSg != null ? player.courseTrueSg.toFixed(2) : "—"}
          </p>
        </div>
        <div className="min-w-0 flex-1 rounded-[14px] bg-secondary/50 px-3 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">DG Rank</p>
          <p className="mt-0.5 font-mono text-xs text-foreground">{player.trendRank ?? "—"}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {STAT_GROUPS.map((stat) => {
          const rank = player[stat.key as keyof PlayerModelRow] as number | null;
          const { bg, text } = getRankColor(rank, maxRank);
          return (
            <div key={stat.key} className="min-w-0 rounded-[12px] bg-secondary/30 px-2 py-2 text-center">
              <p className="text-[8px] font-semibold uppercase leading-tight tracking-[0.08em] text-muted-foreground/80">
                {stat.label}
              </p>
              <div className="mt-1 flex justify-center">
                <span
                  style={{
                    background: bg,
                    color: text,
                    borderRadius: "5px",
                    display: "inline-block",
                    minWidth: "32px",
                    padding: "3px 6px",
                    fontWeight: 500,
                    fontSize: "12px",
                    textAlign: "center",
                  }}
                >
                  {rank ?? "—"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
