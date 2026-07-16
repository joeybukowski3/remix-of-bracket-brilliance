/* eslint-disable react-refresh/only-export-components */
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import { cn } from "@/lib/utils";
import type { HrDashboardBatter, HrDashboardGame, HrDashboardPitcher, PitcherStrikeoutTeamRow, PitcherVsBatterRow } from "@/pages/MlbHrProps";

const DASH = "--";

type StrikeoutPreviewRow = {
  rank: number;
  gameKey: string;
  pitcher: string;
  team: string;
  opponent: string;
  park: string;
  opponentTeamKRate: number | null;
  opponentKSampleSize: number;
  pitcherKAbilityScore: number;
  kRate: number | null;
  whiffRate: number | null;
  kMatchupScore: number;
  reasonTags: string[];
};

type PropModelDashboardProps = {
  hrRows: HrDashboardBatter[];
  strikeoutRows: StrikeoutPreviewRow[];
  batterVsPitcherRows: PitcherVsBatterRow[];
  pitchers: HrDashboardPitcher[];
  games: HrDashboardGame[];
  generatedAt?: string | null;
  loading?: boolean;
};

export function formatPropPercent(value: number | null | undefined) {
  return Number.isFinite(value) ? `${Number(value).toFixed(1)}%` : DASH;
}

export function formatPropNumber(value: number | null | undefined, digits = 1) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : DASH;
}

export function formatModelTimestamp(value: string | null | undefined) {
  if (!value) return "Awaiting update";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function getPropEdgeTier(score: number | null | undefined) {
  if (!Number.isFinite(score)) return { label: "Neutral", className: "bg-slate-100 text-slate-600 ring-slate-200", bar: "bg-slate-300" };
  if (Number(score) >= 85) return { label: "Strong", className: "bg-emerald-100 text-emerald-800 ring-emerald-200", bar: "bg-emerald-500" };
  if (Number(score) >= 70) return { label: "Positive", className: "bg-sky-100 text-sky-800 ring-sky-200", bar: "bg-sky-500" };
  if (Number(score) >= 55) return { label: "Watch", className: "bg-amber-100 text-amber-800 ring-amber-200", bar: "bg-amber-500" };
  return { label: "Neutral", className: "bg-slate-100 text-slate-600 ring-slate-200", bar: "bg-slate-300" };
}

export function PropEdgeBadge({ score }: { score: number | null | undefined }) {
  const tier = getPropEdgeTier(score);
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ring-1", tier.className)}>
      {tier.label}
    </span>
  );
}

export function PropScoreBadge({ score }: { score: number | null | undefined }) {
  const tier = getPropEdgeTier(score);
  const width = Number.isFinite(score) ? Math.max(6, Math.min(100, Number(score))) : 0;
  return (
    <div className="min-w-[58px]">
      <div className="text-right text-sm font-black tabular-nums text-slate-950">{formatPropNumber(score)}</div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={cn("h-full rounded-full", tier.bar)} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function TeamLogoText({ team, align = "left", size = 20 }: { team?: string | null; align?: "left" | "right"; size?: number }) {
  const safeTeam = team || "TBD";
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", align === "right" && "flex-row-reverse text-right")}>
      <MlbTeamLogo team={safeTeam} size={size} />
      <span className="truncate text-xs font-bold uppercase tracking-[0.08em] text-slate-600">{safeTeam}</span>
    </span>
  );
}

export function getHrReason(row: HrDashboardBatter) {
  if ((row.barrelRate ?? 0) >= 15 && (row.opposingPitcherHrVs ?? 0) >= 65) return "Elite barrel matchup";
  if ((row.opposingPitcherHrVs ?? 0) >= 70) return "Pitcher allows HR damage";
  if ((row.hardHitRate ?? 0) >= 48) return "Hard-hit profile pops";
  if (row.last30HR >= 5) return "Recent HR form";
  if ((row.iso ?? 0) >= 0.24) return "Strong ISO power";
  return row.angleTags[0] || "Power edge rates well";
}

export function getStrikeoutReason(row: StrikeoutPreviewRow | PitcherStrikeoutTeamRow) {
  if ("reasonTags" in row && row.reasonTags.length) return row.reasonTags[0];
  if ((row.pitcherKSkillScore ?? 0) >= 75) return "High-K pitcher profile";
  if ((row.opponentTeamKRate ?? 0) >= 26) return "Whiff-heavy lineup";
  if ((row.opponentTeamWhiffRate ?? 0) >= 29) return "Swing-and-miss opponent";
  return "K matchup grades well";
}

export function getBatterVsPitcherReason(row: PitcherVsBatterRow) {
  if ((row.xba ?? 0) >= 0.29 && row.opposingPitcherHitsVs >= 65) return "Strong xBA split";
  if (row.opposingPitcherHitsVs >= 72) return "Pitcher hit risk";
  if ((row.hardHitRate ?? 0) >= 48) return "Hard contact edge";
  if (row.batterPowerScore >= 70) return "Batter quality leads";
  return row.angleTags[0] || "Attackable matchup";
}

export function getPitcherTeamForBatter(row: PitcherVsBatterRow, pitchers: HrDashboardPitcher[]) {
  return pitchers.find((pitcher) => pitcher.gameKey === row.gameKey && pitcher.pitcher === row.opposingPitcher)?.team || null;
}

export function getGameCount(games: HrDashboardGame[]) {
  return new Set(games.map((game) => game.gameKey)).size;
}

export function ModelSummaryHeader({
  title,
  eyebrow,
  description,
  generatedAt,
  gamesCount,
  rowsCount,
  bestScore,
  backTo = "/mlb",
  siblingLinks,
  showUpdatedAt = true,
}: {
  title: string;
  eyebrow: string;
  description: string;
  generatedAt?: string | null;
  gamesCount: number;
  rowsCount: number;
  bestScore: number | null | undefined;
  backTo?: string;
  siblingLinks?: Array<{ label: string; to: string; icon: ReactNode; color: string }>;
  /** Set false on pages that already surface freshness via the shared FreshnessStatus component, to avoid showing the model-updated timestamp twice. Defaults to true so every existing consumer is unaffected. */
  showUpdatedAt?: boolean;
}) {
  const summaryCells: Array<[string, string]> = [
    ...(showUpdatedAt ? ([["Last updated", formatModelTimestamp(generatedAt)]] as Array<[string, string]>) : []),
    ["Games analyzed", String(gamesCount)],
    ["Rows ranked", String(rowsCount)],
    ["Best edge", formatPropNumber(bestScore)],
  ];

  return (
    <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
      <div className="bg-[#10243f] px-4 py-4 text-white sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-200">{eyebrow}</div>
            <h1 className="mt-1 text-2xl font-black tracking-normal sm:text-3xl">{title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-sky-100">{description}</p>
            {siblingLinks && siblingLinks.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {siblingLinks.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-extrabold text-white transition opacity-90 hover:opacity-100"
                    style={{ backgroundColor: link.color }}
                  >
                    {link.icon}
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <Link to={backTo} className="w-fit rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-white/15">
            Back to MLB
          </Link>
        </div>
      </div>
      <div className={cn("grid gap-px bg-slate-200", showUpdatedAt ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
        {summaryCells.map(([label, value]) => (
          <div key={label} className="bg-white px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</div>
            <div className="mt-1 text-sm font-black text-slate-950">{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DashboardRow({
  rank,
  title,
  subtitle,
  team,
  opponent,
  score,
  reason,
}: {
  rank: number;
  title: string;
  subtitle: string;
  team: string;
  opponent?: string | null;
  score: number;
  reason: string;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[30px_minmax(0,1fr)_62px] items-center gap-2 border-t border-slate-100 px-3 py-2 first:border-t-0">
      <div className="text-sm font-black tabular-nums text-slate-400">#{rank}</div>
      <div className="min-w-0">
        <div className="truncate text-sm font-black text-slate-950">{title}</div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
          <TeamLogoText team={team} size={17} />
          {opponent ? (
            <>
              <span className="text-[11px] text-slate-300">vs</span>
              <TeamLogoText team={opponent} size={17} />
            </>
          ) : null}
          <span className="truncate text-[11px] text-slate-500">{subtitle}</span>
        </div>
        <div className="mt-1 truncate text-[11px] font-semibold text-slate-500">{reason}</div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <PropScoreBadge score={score} />
        <PropEdgeBadge score={score} />
      </div>
    </div>
  );
}

function DashboardCard({ title, description, cta, to, children }: { title: string; description: string; cta: string; to: string; children: ReactNode }) {
  return (
    <article className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-black text-slate-950">{title}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
          </div>
          <Link to={to} className="shrink-0 rounded-full bg-slate-950 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-slate-800">
            {cta}
          </Link>
        </div>
      </div>
      <div>{children}</div>
    </article>
  );
}

export function MlbPropModelDashboard({ hrRows, strikeoutRows, batterVsPitcherRows, pitchers, games, generatedAt, loading }: PropModelDashboardProps) {
  const topHr = [...hrRows].sort((left, right) => right.hrScore - left.hrScore).slice(0, 5);
  const topStrikeouts = strikeoutRows.slice(0, 5);
  const topBatterVsPitcher = batterVsPitcherRows.slice(0, 5);
  const bestScore = Math.max(
    ...topHr.map((row) => row.hrScore),
    ...topStrikeouts.map((row) => row.kMatchupScore),
    ...topBatterVsPitcher.map((row) => row.bestMatchupScore),
    0,
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-700">MLB Prop Model Dashboard</div>
          <h2 className="mt-1 text-2xl font-black tracking-normal text-slate-950">Today&apos;s top prop model edges</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            A quick read on HR power spots, pitcher strikeout upside, and batter attackability from the same model data used on the full pages.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-right sm:min-w-[360px]">
          <div className="rounded-2xl bg-slate-50 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Updated</div>
            <div className="mt-1 text-xs font-black text-slate-900">{loading ? "Loading" : formatModelTimestamp(generatedAt)}</div>
          </div>
          <div className="rounded-2xl bg-slate-50 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Games</div>
            <div className="mt-1 text-xs font-black text-slate-900">{getGameCount(games)}</div>
          </div>
          <div className="rounded-2xl bg-slate-50 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Best</div>
            <div className="mt-1 text-xs font-black text-slate-900">{formatPropNumber(bestScore)}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <DashboardCard
          title="Top HR Props"
          description="Batter HR upside against pitcher HR vulnerability and park context."
          cta="View Full HR Model"
          to="/mlb/hr-props"
        >
          {topHr.map((row, index) => (
            <DashboardRow
              key={`${row.player}-${row.team}-${row.opposingPitcher}`}
              rank={index + 1}
              title={row.player}
              subtitle={`vs ${row.opposingPitcher}`}
              team={row.team}
              opponent={row.opponent}
              score={row.hrScore}
              reason={getHrReason(row)}
            />
          ))}
        </DashboardCard>

        <DashboardCard
          title="Top Strikeout Props"
          description="Pitcher K skill against opponent strikeout and whiff tendencies."
          cta="View Full Strikeout Model"
          to="/mlb/strikeout-props"
        >
          {topStrikeouts.map((row, index) => (
            <DashboardRow
              key={`${row.pitcher}-${row.team}-${row.opponent}`}
              rank={index + 1}
              title={row.pitcher}
              subtitle={`Opp K ${formatPropPercent(row.opponentTeamKRate)}`}
              team={row.team}
              opponent={row.opponent}
              score={row.kMatchupScore}
              reason={getStrikeoutReason(row)}
            />
          ))}
        </DashboardCard>

        <DashboardCard
          title="Batter vs Pitcher"
          description="Overall batter attackability for hits, total bases, and quality contact."
          cta="View Full Batter vs Pitcher Model"
          to="/mlb/batter-vs-pitcher"
        >
          {topBatterVsPitcher.map((row, index) => (
            <DashboardRow
              key={`${row.player}-${row.team}-${row.opposingPitcher}`}
              rank={index + 1}
              title={row.player}
              subtitle={`vs ${row.opposingPitcher}`}
              team={row.team}
              opponent={getPitcherTeamForBatter(row, pitchers)}
              score={row.bestMatchupScore}
              reason={getBatterVsPitcherReason(row)}
            />
          ))}
        </DashboardCard>
      </div>
    </section>
  );
}
