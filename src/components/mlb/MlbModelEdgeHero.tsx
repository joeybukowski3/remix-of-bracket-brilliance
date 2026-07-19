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
  const leaderAbbr = factor.awayScore >= factor.homeScore ? awayAbbr : homeAbbr;
  const leaderColor = factor.awayScore >= factor.homeScore ? awayColor : homeColor;
  const edgeValue = Math.round(Math.abs(factor.weightedDifference));

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 md:grid md:grid-cols-[1fr_auto] md:items-center md:gap-3">
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
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
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-l-full" style={{ width: `${awayPct}%`, backgroundColor: awayColor }} />
          <div className="h-full rounded-r-full" style={{ width: `${homePct}%`, backgroundColor: homeColor }} />
        </div>
        <div className="flex justify-between text-[9px] font-semibold text-slate-400">
          <span style={{ color: awayColor }}>{awayAbbr} {factor.awayScore}</span>
          <span style={{ color: homeColor }}>{homeAbbr} {factor.homeScore}</span>
        </div>
      </div>

      {/* Edge column -- strong border separates it from the factor bar */}
      <div className="flex shrink-0 flex-col items-center justify-center gap-0.5 border-t border-[#0f172a]/15 pt-2 md:min-w-[84px] md:border-l md:border-t-0 md:pl-3 md:pt-0">
        <span className="text-[11px] font-extrabold" style={{ color: leaderColor }}>
          {leaderAbbr}
        </span>
        <span className="text-[13px] font-extrabold text-[#031635]" title="Model differential">
          +{edgeValue}
        </span>
        <span className="text-[8px] font-semibold uppercase tracking-wide text-slate-400">{leaderAbbr} advantage</span>
      </div>
    </div>
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
          <div className="space-y-2">
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
