import type { ReactNode } from "react";
import { Activity, BarChart3, CalendarDays, Sparkles, Swords, Target } from "lucide-react";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import { getMlbTeamColors } from "@/lib/mlbTeamColors";
import { computeK9, MLB_DASH } from "@/lib/mlb/mlbFormatters";
import { computeModelEdge, getEdgeTierKey, getEdgeTierLabel, ML_EDGE_METHODOLOGY, type EdgeTierKey, type ModelFactor } from "@/lib/mlb/mlbModelEdge";
import type { MlbGameDetail } from "@/lib/mlb/mlbTypes";
import type { MlbOddsData } from "@/hooks/useMlbOdds";
import { cn } from "@/lib/utils";

// Canonical K/9 source for this hero -- see src/lib/mlb/mlbFormatters.ts. Never
// recompute K/9 from partial fields locally; MlbStarterProfile has no direct
// K/9 field, only strikeOuts + inningsPitched, which computeK9 already
// combines correctly (including its own missing-data handling).
const FACTOR_ICONS: Record<string, ReactNode> = {
  "Pitcher Quality": <Target className="h-4 w-4" />,
  "Matchup Edge": <Swords className="h-4 w-4" />,
  "Lineup Offense": <BarChart3 className="h-4 w-4" />,
  "Recent Form": <Activity className="h-4 w-4" />,
  "Season Quality": <CalendarDays className="h-4 w-4" />,
};

const TIER_OFFSET: Record<EdgeTierKey, number> = {
  "coin-flip": 0,
  slight: 16,
  moderate: 33,
  strong: 50,
};

function formatFirstPitch(gameDate: string): string {
  try {
    return `${new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
      hour12: true,
    }).format(new Date(gameDate))} ET`;
  } catch {
    return MLB_DASH;
  }
}

function isRealAmericanOdds(value: string | null | undefined): value is string {
  return value != null && /^[+-]\d+$/.test(String(value).trim());
}

function FactorRow({
  factor,
  awayAbbr,
  homeAbbr,
  awayColor,
  homeColor,
}: {
  factor: ModelFactor;
  awayAbbr: string;
  homeAbbr: string;
  awayColor: string;
  homeColor: string;
}) {
  const total = factor.awayScore + factor.homeScore;
  const awayPct = total === 0 ? 50 : Math.round((factor.awayScore / total) * 100);
  const homePct = 100 - awayPct;

  // Edge column: the leader is derived from the SIGN of the canonical
  // weightedDifference (positive = away leads, negative = home leads),
  // never from a separate awayScore/homeScore comparison -- that would let
  // >= silently hand a tied factor to the away team. The displayed number
  // is the absolute magnitude of that signed value; direction is conveyed
  // by which team's abbreviation it sits beside, not by a +/- sign on the
  // number itself. A factor whose rounded magnitude is 0 (exact tie, or a
  // signed value too small to round to a nonzero display) is shown as a
  // neutral "EVEN / 0 / No advantage" rather than crediting either team.
  const edgeMagnitude = Math.round(Math.abs(factor.weightedDifference));
  const isNeutralEdge = edgeMagnitude === 0;
  const awayLeads = factor.weightedDifference > 0;
  const leaderAbbr = awayLeads ? awayAbbr : homeAbbr;
  const outcomeLabel = isNeutralEdge ? "Even factor" : `${leaderAbbr} advantage`;

  return (
    <article
      className="mlb-factor-row rounded-lg border border-slate-200 bg-white p-3"
      data-factor-row
      data-factor-outcome={isNeutralEdge ? "even" : awayLeads ? "away" : "home"}
    >
      <div className="mlb-factor-info min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
              {FACTOR_ICONS[factor.label] ?? <Target className="h-4 w-4" />}
            </span>
            <span className="truncate text-[12px] font-bold text-[#031635]">{factor.label}</span>
          </div>
          <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
            {Math.round(factor.weight * 100)}% wt
          </span>
        </div>
        <p className="text-[10px] leading-4 text-slate-500">{factor.description}</p>
      </div>

      <div className="mlb-factor-comparison min-w-0 space-y-1.5">
        <div className="flex items-center justify-between gap-3 text-[10px] font-bold text-[#031635]">
          <span className={cn("flex min-w-0 items-center gap-1.5", !isNeutralEdge && awayLeads && "font-extrabold")}>
            <span className="h-2 w-2 shrink-0 rounded-full ring-1 ring-white" style={{ backgroundColor: awayColor }} aria-hidden="true" />
            <span>{awayAbbr}</span>
            <span className={cn("tabular-nums", !isNeutralEdge && !awayLeads && "text-slate-500")}>{factor.awayScore}</span>
          </span>
          <span className={cn("flex min-w-0 items-center gap-1.5", !isNeutralEdge && !awayLeads && "font-extrabold")}>
            <span className={cn("tabular-nums", !isNeutralEdge && awayLeads && "text-slate-500")}>{factor.homeScore}</span>
            <span>{homeAbbr}</span>
            <span className="h-2 w-2 shrink-0 rounded-full ring-1 ring-white" style={{ backgroundColor: homeColor }} aria-hidden="true" />
          </span>
        </div>
        <div
          className="relative flex h-3 w-full overflow-hidden rounded-full bg-slate-200 ring-1 ring-inset ring-slate-300"
          role="img"
          aria-label={`${awayAbbr} ${factor.awayScore}, ${homeAbbr} ${factor.homeScore}. ${outcomeLabel}.`}
        >
          <div
            className={cn("h-full", isNeutralEdge || !awayLeads ? "bg-slate-300" : "bg-sky-600")}
            data-factor-away-segment
            style={{ width: `${awayPct}%` }}
          />
          <div
            className={cn("h-full", isNeutralEdge || awayLeads ? "bg-slate-300" : "bg-sky-600")}
            data-factor-home-segment
            style={{ width: `${homePct}%` }}
          />
          <span className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/90 shadow-[0_0_0_1px_rgba(15,23,42,0.12)]" aria-hidden="true" />
        </div>
      </div>

      <div className="mlb-factor-winner">
        <div className="min-w-0 text-right">
          <span className={cn("block text-[10px] font-extrabold uppercase tracking-wide", isNeutralEdge ? "text-slate-500" : "text-sky-700")}>
            {isNeutralEdge ? "EVEN" : `${leaderAbbr} advantage`}
          </span>
          <span className="block text-[13px] font-extrabold tabular-nums text-[#031635]" title="Model differential">
            {isNeutralEdge ? "0" : `+${edgeMagnitude}`}
          </span>
          <span className="block text-[8px] font-semibold uppercase tracking-wide text-slate-400">
            {isNeutralEdge ? "No advantage" : "Factor winner"}
          </span>
        </div>
        {isNeutralEdge ? (
          <span
            className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-slate-100 px-1.5 text-[8px] font-extrabold tracking-wide text-slate-600"
            data-factor-neutral-badge
            aria-label="Even factor"
          >
            EVEN
          </span>
        ) : (
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm"
            data-factor-winner-logo
            data-team={leaderAbbr}
          >
            <MlbTeamLogo team={leaderAbbr} size={28} />
          </span>
        )}
      </div>
    </article>
  );
}

export interface MlbModelEdgeHeroProps {
  detail: MlbGameDetail;
  mlbOdds: MlbOddsData | null;
}

export default function MlbModelEdgeHero({ detail, mlbOdds }: MlbModelEdgeHeroProps) {
  const { game, starters } = detail;
  const awayAbbr = game.away.abbreviation;
  const homeAbbr = game.home.abbreviation;
  const awayColors = getMlbTeamColors(awayAbbr);
  const homeColors = getMlbTeamColors(homeAbbr);

  const awayEra = starters.away.era != null ? Number(starters.away.era).toFixed(2) : null;
  const homeEra = starters.home.era != null ? Number(starters.home.era).toFixed(2) : null;
  const awayK9 = computeK9(starters.away.strikeOuts, starters.away.inningsPitched);
  const homeK9 = computeK9(starters.home.strikeOuts, starters.home.inningsPitched);

  const result = computeModelEdge(detail);
  const isPush = result.pick === "push";
  const pickAbbr = result.pick === "away" ? awayAbbr : result.pick === "home" ? homeAbbr : "";
  const pickColor = result.pick === "away" ? awayColors.primary : result.pick === "home" ? homeColors.primary : null;
  const tierKey = getEdgeTierKey(result.confidence);
  const tierLabel = isPush ? "Coin flip" : getEdgeTierLabel(result.confidence);

  const awayScoreTotal = Math.round(result.factors.reduce((s, f) => s + f.awayScore * f.weight, 0));
  const homeScoreTotal = Math.round(result.factors.reduce((s, f) => s + f.homeScore * f.weight, 0));

  const markerOffset = isPush ? 0 : TIER_OFFSET[tierKey] * (result.pick === "home" ? 1 : -1);
  const markerLeftPct = 50 + markerOffset;

  const ml = mlbOdds?.moneylines?.[`${awayAbbr}@${homeAbbr}`];
  const awayAmerican = ml?.away?.american ?? null;
  const homeAmerican = ml?.home?.american ?? null;
  const hasRealOdds = isRealAmericanOdds(awayAmerican) && isRealAmericanOdds(homeAmerican);

  const firstPitch = formatFirstPitch(game.gameDate);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* 1. Top heading */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 md:px-5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-700">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#031635]">Model Edge</span>
        </div>
        <span className="text-[9px] italic text-slate-400">Entertainment only — not betting advice</span>
      </div>

      <div className="flex flex-col gap-4 p-4 md:gap-5 md:p-5">
        {/* Game context row -- mobile: first; desktop: after team/pitchers */}
        <div className="order-1 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-600 md:order-2">
          <span><span className="font-bold text-slate-400">First Pitch </span>{firstPitch}</span>
          <span><span className="font-bold text-slate-400">Venue </span>{game.venue || MLB_DASH}</span>
          <span><span className="font-bold text-slate-400">Weather </span>{detail.weather || MLB_DASH}</span>
          <span>
            <span className="font-bold text-slate-400">Line </span>
            {hasRealOdds ? `${awayAbbr} ${awayAmerican} / ${homeAbbr} ${homeAmerican}` : "Market pending"}
          </span>
          <span><span className="font-bold text-slate-400">Total </span>Market pending</span>
        </div>

        {/* Team/matchup summary + pitchers + verdict */}
        <div className="order-2 grid grid-cols-1 items-center gap-4 md:order-1 md:grid-cols-[1fr_auto_1fr] md:gap-6">
          {/* Away */}
          <div className="order-1 flex items-center gap-3 md:flex-col md:text-center">
            <MlbTeamLogo team={awayAbbr} size={56} />
            <div className="min-w-0">
              <div className="text-lg font-extrabold leading-tight text-[#031635] md:text-xl">{awayAbbr}</div>
              <div className="truncate text-[11px] font-medium text-slate-500">{game.away.name}</div>
              <div className="text-[10px] font-semibold text-slate-400">{game.away.record}</div>
              <div className="mt-1.5 truncate text-[12px] font-bold text-[#031635]">{starters.away.name}</div>
              <div className="text-[10px] font-medium text-slate-500">
                {starters.away.hand}
                {awayEra ? ` · ${awayEra} ERA` : ""}
                {awayK9 != null ? ` · ${awayK9.toFixed(1)} K/9` : ""}
              </div>
            </div>
          </div>

          {/* Center: verdict, score, edge-strength visual */}
          <div className="order-3 flex flex-col items-center gap-2 md:order-2 md:min-w-[160px]">
            <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Model Verdict</div>
            {isPush ? (
              <div className="rounded-full bg-slate-100 px-3 py-1 text-[13px] font-extrabold text-slate-600">Even</div>
            ) : (
              <div className="rounded-full px-3 py-1 text-[13px] font-extrabold text-white" style={{ backgroundColor: pickColor ?? "#334155" }}>
                {pickAbbr} · {tierLabel}
              </div>
            )}

            {!isPush && (
              <div className="flex items-center gap-2 text-[12px] font-bold text-slate-600">
                <span style={{ color: awayColors.primary }}>{awayAbbr} {awayScoreTotal}</span>
                <span className="text-[10px] font-semibold uppercase text-slate-300">vs</span>
                <span style={{ color: homeColors.primary }}>{homeAbbr} {homeScoreTotal}</span>
              </div>
            )}

            {/* Edge-strength visual: categorical tiered scale, never a percentage */}
            <div className="w-full space-y-1" title={ML_EDGE_METHODOLOGY}>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="absolute inset-y-0 left-0 w-1/2" style={{ background: `linear-gradient(90deg, ${awayColors.tint}, transparent)` }} />
                <div className="absolute inset-y-0 right-0 w-1/2" style={{ background: `linear-gradient(270deg, ${homeColors.tint}, transparent)` }} />
                <div className="absolute inset-y-0 left-1/2 w-px bg-slate-300" aria-hidden />
                <div
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                  style={{ left: `${markerLeftPct}%`, backgroundColor: pickColor ?? "#64748b" }}
                  aria-hidden
                />
              </div>
              <div className="flex justify-between text-[8px] font-bold uppercase tracking-wide text-slate-400">
                <span style={{ color: awayColors.primary }}>{awayAbbr}</span>
                <span>{tierLabel}</span>
                <span style={{ color: homeColors.primary }}>{homeAbbr}</span>
              </div>
            </div>
          </div>

          {/* Home */}
          <div className="order-2 flex items-center justify-end gap-3 text-right md:order-3 md:flex-col md:text-center">
            <div className="min-w-0 md:order-2">
              <div className="text-lg font-extrabold leading-tight text-[#031635] md:text-xl">{homeAbbr}</div>
              <div className="truncate text-[11px] font-medium text-slate-500">{game.home.name}</div>
              <div className="text-[10px] font-semibold text-slate-400">{game.home.record}</div>
              <div className="mt-1.5 truncate text-[12px] font-bold text-[#031635]">{starters.home.name}</div>
              <div className="text-[10px] font-medium text-slate-500">
                {starters.home.hand}
                {homeEra ? ` · ${homeEra} ERA` : ""}
                {homeK9 != null ? ` · ${homeK9.toFixed(1)} K/9` : ""}
              </div>
            </div>
            <div className="md:order-1">
              <MlbTeamLogo team={homeAbbr} size={56} />
            </div>
          </div>
        </div>

        {/* Factor breakdown + edge column */}
        <div className="order-3 space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Factor Breakdown</div>
          <div className="mlb-factor-breakdown space-y-2">
            {result.factors.map((factor) => (
              <FactorRow
                key={factor.label}
                factor={factor}
                awayAbbr={awayAbbr}
                homeAbbr={homeAbbr}
                awayColor={awayColors.primary}
                homeColor={homeColors.primary}
              />
            ))}
          </div>
        </div>

        {/* Takeaway */}
        <p className={cn("order-4 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] italic leading-5 text-slate-600")}>
          {result.summary}
        </p>
      </div>
    </div>
  );
}
