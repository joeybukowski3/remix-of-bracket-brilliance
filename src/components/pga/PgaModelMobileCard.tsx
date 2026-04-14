import { formatCompositeScore } from "@/lib/pga/pgaModelHelpers";
import type { PlayerModelRow } from "@/lib/pga/pgaTypes";

const STAT_GROUPS = [
  { label: "Approach",  key: "sgApproachRank",      tooltip: "SG: Approach the Green" },
  { label: "Par 4",     key: "par4Rank",             tooltip: "Par 4 Scoring Average" },
  { label: "Drive Acc", key: "drivingAccuracyRank",  tooltip: "Driving Accuracy %" },
  { label: "Bogey Av",  key: "bogeyAvoidanceRank",   tooltip: "Bogey Avoidance %" },
  { label: "ARG",       key: "sgAroundGreenRank",    tooltip: "SG: Around the Green" },
  { label: "125-150",   key: "birdie125150Rank",     tooltip: "Birdie or Better 125–150 yds" },
  { label: "Putting",   key: "sgPuttingRank",        tooltip: "SG: Putting" },
  { label: "<125",      key: "birdieUnder125Rank",   tooltip: "Birdie or Better <125 yds" },
] as const;

function rankColor(rank: number | null, max: number) {
  if (rank == null) return { bg: "bg-secondary/50", text: "text-muted-foreground" };
  const pct = rank / max;
  if (pct <= 0.2) return { bg: "bg-emerald-100 dark:bg-emerald-950/60", text: "text-emerald-800 dark:text-emerald-300" };
  if (pct <= 0.4) return { bg: "bg-green-100 dark:bg-green-950/50",    text: "text-green-800 dark:text-green-400" };
  if (pct <= 0.6) return { bg: "bg-yellow-100 dark:bg-yellow-950/40",  text: "text-yellow-800 dark:text-yellow-300" };
  if (pct <= 0.8) return { bg: "bg-orange-100 dark:bg-orange-950/40",  text: "text-orange-800 dark:text-orange-400" };
  return { bg: "bg-red-100 dark:bg-red-950/40", text: "text-red-800 dark:text-red-400" };
}

function finishColor(val: string | null) {
  if (!val || val === "CUT") return val === "CUT" ? "text-red-500" : "text-muted-foreground";
  try {
    const n = parseInt(val.replace("T", ""));
    if (n <= 5)  return "text-emerald-700 dark:text-emerald-400 font-semibold";
    if (n <= 20) return "text-sky-700 dark:text-sky-400";
  } catch { /**/ }
  return "text-foreground";
}

function csgColor(v: number | null) {
  if (v == null) return "text-muted-foreground";
  if (v > 1.0) return "text-emerald-700 dark:text-emerald-400 font-semibold";
  if (v > 0.3) return "text-emerald-600 dark:text-emerald-500";
  if (v >= 0)  return "text-foreground";
  return "text-red-500 dark:text-red-400";
}

export default function PgaModelMobileCard({
  player,
  maxRank,
}: {
  player: PlayerModelRow;
  maxRank: number;
}) {
  const isTop5  = player.rank <= 5;
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
      {/* ── Top row: rank + name + score ── */}
      <div className="flex items-center gap-3">
        {/* Rank badge */}
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

        {/* Name */}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {player.player}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {player.htRounds != null ? `${player.htRounds} HT rounds` : "No HT history"} · {player.cutsLast5} cuts
          </p>
        </div>

        {/* Score pill */}
        <div
          className={`shrink-0 rounded-xl px-3 py-1.5 text-center ${
            isTop5
              ? "bg-emerald-100 dark:bg-emerald-950/60"
              : "bg-secondary"
          }`}
        >
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Score</p>
          <p className={`mt-0.5 font-mono text-sm font-bold ${isTop5 ? "text-emerald-800 dark:text-emerald-300" : "text-foreground"}`}>
            {formatCompositeScore(player.score)}
          </p>
        </div>
      </div>

      {/* ── Key context row: Masters + Course SG ── */}
      <div className="mt-3 flex gap-2">
        <div className="flex-1 rounded-[14px] bg-secondary/50 px-3 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Masters 2026</p>
          <p className={`mt-0.5 font-mono text-xs ${finishColor(player.masters2026)}`}>
            {player.masters2026 || "—"}
          </p>
        </div>
        <div className="flex-1 rounded-[14px] bg-secondary/50 px-3 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Course SG</p>
          <p className={`mt-0.5 font-mono text-xs ${csgColor(player.courseTrueSg)}`}>
            {player.courseTrueSg != null ? player.courseTrueSg.toFixed(2) : "—"}
          </p>
        </div>
        <div className="flex-1 rounded-[14px] bg-secondary/50 px-3 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">DG Rank</p>
          <p className="mt-0.5 text-xs font-medium text-foreground">
            {player.trendRank ?? "—"}
          </p>
        </div>
      </div>

      {/* ── Stat rank grid: 4 col, color-coded ── */}
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {STAT_GROUPS.map((stat) => {
          const rank = player[stat.key as keyof PlayerModelRow] as number | null;
          const { bg, text } = rankColor(rank, maxRank);
          return (
            <div key={stat.key} className={`rounded-[12px] px-2 py-2 text-center ${bg}`}>
              <p className="text-[8px] font-semibold uppercase leading-tight tracking-[0.08em] text-muted-foreground/80">
                {stat.label}
              </p>
              <p className={`mt-1 font-mono text-sm font-bold ${text}`}>
                {rank ?? "—"}
              </p>
            </div>
          );
        })}
      </div>
    </article>
  );
}
