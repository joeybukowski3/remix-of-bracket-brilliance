import { useMemo } from "react";
import { Flame, Radar, Swords, Sparkles, TrendingUp, BarChart3 } from "lucide-react";
import { Accordion } from "@/components/ui/accordion";
import { MobileModelPreviewAccordion } from "@/components/mlb/MobileModelPreviewAccordion";
import { MlbGameTopPropsCard } from "@/components/mlb/MlbGameTopPropsCard";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import { getMlbTeamColors } from "@/lib/mlbTeamColors";
import { buildGameTopProps } from "@/lib/mlb/topProps/buildGameTopProps";
import { getOperationalDate } from "@/pages/MlbGameDetail";
import type {
  BvpItem,
  GameStatusCategory,
  HrPropItem,
  KPropItem,
  NumerologyItem,
} from "@/lib/mlb/topProps/types";
import type {
  HrDashboardBatter,
  HrDashboardPendingGame,
  PitcherStrikeoutTeamRow,
  PitcherVsBatterRow,
} from "@/pages/MlbHrProps";
import type { BvpHistoryEntry } from "@/hooks/useMlbBvpHistory";
import type { MlbGameDetail } from "@/lib/mlb/mlbTypes";
import type { MlbOddsData } from "@/hooks/useMlbOdds";
import type { MoneylineApiResponse } from "@/lib/mlb/polymarketMoneylines";
import type { NumerologyDailyData } from "@/types/mlbNumerology";

export interface MlbGameTopPropsProps {
  detail: MlbGameDetail;
  mlbOdds: MlbOddsData | null;
  polymarket: MoneylineApiResponse | null | undefined;
  gameStatusCategory: GameStatusCategory;
  propsData: {
    batters: HrDashboardBatter[];
    strikeoutDetailRows: PitcherStrikeoutTeamRow[];
    batterVsPitcherRows: PitcherVsBatterRow[];
    pendingGames: HrDashboardPendingGame[];
    stale: boolean;
    generatedAt: string | null;
  };
  bvpHistoryByKey: Map<string, BvpHistoryEntry>;
  numerology: { data: NumerologyDailyData | null; isStale: boolean };
}

const ICON_CLASS = {
  moneyline: "bg-blue-100 text-blue-700",
  hr: "bg-amber-100 text-amber-700",
  k: "bg-emerald-100 text-emerald-700",
  bvp: "bg-purple-100 text-purple-700",
  numerology: "bg-fuchsia-100 text-fuchsia-700",
  overUnder: "bg-slate-100 text-slate-400",
};

function HrRow({ item }: { item: HrPropItem }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
      <MlbTeamLogo team={item.team} size={20} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-bold text-slate-950">{item.player}</div>
        <div className="truncate text-[10px] font-medium text-slate-500">vs {item.opponent}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[12px] font-black tabular-nums text-slate-950">{item.hrScore.toFixed(1)}</div>
        <div className="text-[9px] font-semibold text-slate-400">
          {item.hrOddsYes ? item.hrOddsYes : "Market pending"}
        </div>
      </div>
    </div>
  );
}

function KRow({ item }: { item: KPropItem }) {
  const directionLabel = item.direction === "over" ? "Over" : item.direction === "under" ? "Under" : "Even";
  const sideOdds = item.direction === "over" ? item.kOddsOver : item.direction === "under" ? item.kOddsUnder : null;
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-bold text-slate-950">{item.pitcher}</div>
        <div className="truncate text-[10px] font-medium text-slate-500">{item.team} vs {item.opponent}</div>
      </div>
      <div className="shrink-0 text-right">
        {item.qualification === "qualified" ? (
          <>
            <div className="text-[12px] font-black tabular-nums text-slate-950">
              {directionLabel} {item.kLine ?? "--"}
            </div>
            <div className="text-[9px] font-semibold text-slate-400">{sideOdds ?? "--"}</div>
          </>
        ) : (
          <>
            <div className="text-[12px] font-black tabular-nums text-slate-950">
              {item.projectedKs != null ? `${item.projectedKs.toFixed(1)} proj. K` : "--"}
            </div>
            <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Market pending</div>
          </>
        )}
      </div>
    </div>
  );
}

function BvpRow({ item }: { item: BvpItem }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
      <div className="flex items-center gap-2.5">
        <MlbTeamLogo team={item.team} size={20} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-bold text-slate-950">{item.player}</div>
          <div className="truncate text-[10px] font-medium text-slate-500">vs {item.opponent}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[12px] font-black tabular-nums text-slate-950">{item.bestMatchupScore.toFixed(1)}</div>
          <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{item.tierLabel}</div>
        </div>
      </div>
      {item.careerLine ? (
        <div className="mt-1 text-[10px] font-medium text-slate-500">{item.careerLine} vs opposing starter</div>
      ) : null}
    </div>
  );
}

function NumerologyRow({ item }: { item: NumerologyItem }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-bold text-slate-950">{item.playerName}</div>
          <div className="truncate text-[10px] font-medium text-slate-500">
            {item.team} vs {item.opponent} · {item.recommendedMarket}
          </div>
        </div>
        <div className="shrink-0 text-right text-[12px] font-black tabular-nums text-slate-950">{item.numerologyScore}</div>
      </div>
    </div>
  );
}

function MoneylineStrip({ topProps, awayAbbr, homeAbbr }: { topProps: ReturnType<typeof buildGameTopProps>["moneyline"]; awayAbbr: string; homeAbbr: string }) {
  const item = topProps.items[0];

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
          <TrendingUp className="h-4 w-4" />
        </span>
        <span className="text-[15px] font-bold text-[#031635]">Moneyline</span>

        {topProps.status !== "ok" || !item ? (
          <span className="text-[12px] font-medium text-slate-400">{topProps.message}</span>
        ) : (
          <>
            <span
              className="rounded-full px-2.5 py-0.5 text-[11px] font-extrabold text-white"
              style={{
                backgroundColor: item.isPush
                  ? "#64748b"
                  : getMlbTeamColors(item.pickAbbr === awayAbbr ? awayAbbr : homeAbbr).primary,
              }}
            >
              {item.isPush ? "Even" : `${item.pickAbbr} · ${item.tierLabel}`}
            </span>
            <span className="text-[11px] font-medium text-slate-500">
              {item.isPush ? "Too close to call" : `Driven by ${item.topFactor.toLowerCase()} · +${item.differential}`}
            </span>
            <span className="ml-auto text-[11px] font-semibold text-slate-500">
              {item.marketLine ?? "Market pending"}
              {item.polymarketAgreement ? (
                <span className={item.polymarketAgreement === "aligned" ? "ml-2 text-emerald-600" : "ml-2 text-amber-600"}>
                  {item.polymarketAgreement === "aligned" ? "Aligned" : "Contrarian"}
                </span>
              ) : null}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function OverUnderStrip() {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-2.5">
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${ICON_CLASS.overUnder}`}>
        <BarChart3 className="h-3.5 w-3.5" />
      </span>
      <span className="text-[12px] font-semibold text-slate-400">Over/Under</span>
      <span className="ml-auto text-[11px] font-medium text-slate-400">Totals model coming soon</span>
    </div>
  );
}

/**
 * "Top Props for This Game" -- placed directly below MlbModelEdgeHero. Calls
 * the pure buildGameTopProps() adapter once per render (no fetches, no
 * scoring here) and renders whatever it returns. Desktop: compact Moneyline
 * strip, 2x2 card grid, disabled Over/Under strip. Mobile: static Moneyline
 * summary + four collapsed-by-default accordions (reusing the same
 * MobileModelPreviewAccordion primitive used elsewhere on this page) + a
 * static disabled Over/Under row.
 */
export default function MlbGameTopProps(props: MlbGameTopPropsProps) {
  const { detail, mlbOdds, polymarket, gameStatusCategory, propsData, bvpHistoryByKey, numerology } = props;
  const awayAbbr = detail.game.away.abbreviation;
  const homeAbbr = detail.game.home.abbreviation;

  const topProps = useMemo(
    () =>
      buildGameTopProps({
        identity: {
          gamePk: detail.game.gamePk,
          gameDate: getOperationalDate(),
          awayAbbr,
          homeAbbr,
          gameStatusCategory,
        },
        detail,
        mlbOdds,
        polymarket,
        propsData,
        bvpHistoryByKey,
        numerology,
      }),
    [detail, mlbOdds, polymarket, gameStatusCategory, propsData, bvpHistoryByKey, numerology, awayAbbr, homeAbbr],
  );

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-[#031635]">Top Props for This Game</h2>
        <p className="mt-0.5 text-xs text-slate-500">The strongest model signals for this matchup</p>
      </div>

      {/* Desktop */}
      <div className="hidden space-y-3 md:block">
        <MoneylineStrip topProps={topProps.moneyline} awayAbbr={awayAbbr} homeAbbr={homeAbbr} />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MlbGameTopPropsCard
            title="Home Run Props"
            icon={<Flame className="h-4 w-4" />}
            iconClassName={ICON_CLASS.hr}
            card={topProps.homeRuns}
            renderItem={(item, index) => <HrRow key={`${item.player}-${index}`} item={item} />}
          />
          <MlbGameTopPropsCard
            title="Strikeout Props"
            icon={<Radar className="h-4 w-4" />}
            iconClassName={ICON_CLASS.k}
            card={topProps.strikeouts}
            renderItem={(item, index) => <KRow key={`${item.pitcher}-${index}`} item={item} />}
          />
          <MlbGameTopPropsCard
            title="Batter vs Pitcher"
            icon={<Swords className="h-4 w-4" />}
            iconClassName={ICON_CLASS.bvp}
            card={topProps.batterVsPitcher}
            renderItem={(item, index) => <BvpRow key={`${item.player}-${index}`} item={item} />}
          />
          <MlbGameTopPropsCard
            title="Numerology Matches"
            icon={<Sparkles className="h-4 w-4" />}
            iconClassName={ICON_CLASS.numerology}
            card={topProps.numerology}
            renderItem={(item, index) => <NumerologyRow key={`${item.playerId ?? item.playerName}-${index}`} item={item} />}
          />
        </div>
        <p className="px-1 text-[10px] italic text-slate-400">
          Numerology alignment is not probability. Patterns are documented, not guaranteed.
        </p>
        <OverUnderStrip />
      </div>

      {/* Mobile */}
      <div className="space-y-3 md:hidden">
        <MoneylineStrip topProps={topProps.moneyline} awayAbbr={awayAbbr} homeAbbr={homeAbbr} />
        <Accordion type="multiple" className="space-y-2">
          <MobileModelPreviewAccordion
            value="top-props-hr"
            icon={<Flame className="h-4 w-4" />}
            iconClassName={ICON_CLASS.hr}
            title="Home Run Props"
            viewFullHref="/mlb/hr-props"
          >
            {topProps.homeRuns.status === "ok" ? (
              <div className="space-y-2 px-4 pb-3 pt-1">
                {topProps.homeRuns.items.map((item, index) => (
                  <HrRow key={`${item.player}-${index}`} item={item} />
                ))}
              </div>
            ) : (
              <div className="px-4 pb-3 pt-1 text-center text-[12px] text-slate-400">{topProps.homeRuns.message}</div>
            )}
          </MobileModelPreviewAccordion>
          <MobileModelPreviewAccordion
            value="top-props-k"
            icon={<Radar className="h-4 w-4" />}
            iconClassName={ICON_CLASS.k}
            title="Strikeout Props"
            viewFullHref="/mlb/strikeout-props"
          >
            {topProps.strikeouts.status === "ok" ? (
              <div className="space-y-2 px-4 pb-3 pt-1">
                {topProps.strikeouts.items.map((item, index) => (
                  <KRow key={`${item.pitcher}-${index}`} item={item} />
                ))}
              </div>
            ) : (
              <div className="px-4 pb-3 pt-1 text-center text-[12px] text-slate-400">{topProps.strikeouts.message}</div>
            )}
          </MobileModelPreviewAccordion>
          <MobileModelPreviewAccordion
            value="top-props-bvp"
            icon={<Swords className="h-4 w-4" />}
            iconClassName={ICON_CLASS.bvp}
            title="Batter vs Pitcher"
            viewFullHref="/mlb/batter-vs-pitcher"
          >
            {topProps.batterVsPitcher.status === "ok" ? (
              <div className="space-y-2 px-4 pb-3 pt-1">
                {topProps.batterVsPitcher.items.map((item, index) => (
                  <BvpRow key={`${item.player}-${index}`} item={item} />
                ))}
              </div>
            ) : (
              <div className="px-4 pb-3 pt-1 text-center text-[12px] text-slate-400">{topProps.batterVsPitcher.message}</div>
            )}
          </MobileModelPreviewAccordion>
          <MobileModelPreviewAccordion
            value="top-props-numerology"
            icon={<Sparkles className="h-4 w-4" />}
            iconClassName={ICON_CLASS.numerology}
            title="Numerology Matches"
            description="Alignment is not probability."
            viewFullHref="/mlb/numerology"
          >
            {topProps.numerology.status === "ok" ? (
              <div className="space-y-2 px-4 pb-3 pt-1">
                {topProps.numerology.items.map((item, index) => (
                  <NumerologyRow key={`${item.playerId ?? item.playerName}-${index}`} item={item} />
                ))}
              </div>
            ) : (
              <div className="px-4 pb-3 pt-1 text-center text-[12px] text-slate-400">{topProps.numerology.message}</div>
            )}
          </MobileModelPreviewAccordion>
        </Accordion>
        <OverUnderStrip />
      </div>
    </section>
  );
}
