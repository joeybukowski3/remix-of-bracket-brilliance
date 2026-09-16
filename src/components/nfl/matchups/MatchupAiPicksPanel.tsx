import { useState } from "react";
import AiHandicapArticle from "@/components/nfl/matchups/AiHandicapArticle";
import type { AiHandicapCard, AiHandicapProvider, NflAiHandicapPresentation } from "@/lib/nfl/aiHandicapPresentation";
import {
  confidenceLabel,
  formatBaselineSpreadForTeam,
  formatBaselineTotal,
  formatFairSpread,
  formatSideEdge,
  formatSpreadLine,
  formatTimestamp,
  formatTotalEdge,
  formatTotalLine,
  isPlayLean,
  NA,
} from "@/lib/nfl/aiHandicapFormat";

/** Small labeled stat -- used for the fair spread / baseline / projected total row that displays even when the handicapper is passing. */
function PredictionStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className="mt-0.5 text-[13px] font-bold text-slate-900">{value}</p>
    </div>
  );
}

/** One handicapper's SIDE or TOTAL recommendation, sized as the card's primary content. */
function MarketOpinionBlock({ label, pickText, confidence, isPass }: { label: string; pickText: string; confidence: number | null; isPass: boolean }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className={`mt-1 text-[15px] font-black ${isPass ? "tracking-wide text-slate-500" : "text-slate-900"}`}>{isPass ? "PASS" : pickText}</p>
      {!isPass && <p className="mt-1 text-[12px] font-bold tabular-nums text-emerald-700">Confidence {confidenceLabel(confidence)}</p>}
    </div>
  );
}

/**
 * WU7.9 -- compact "AI Handicap Comparison" card: fair spread, baseline,
 * edge, side/total pick and confidence for ONE provider. Deliberately does
 * NOT show the thesis, matchup factors, failure modes, or evidence quality
 * -- those live in the full long-form article below (AiHandicapArticle),
 * never duplicated here so the comparison row stays scannable.
 */
function HandicapSummaryCard({ card, homeTeam, awayTeam }: { card: AiHandicapCard; homeTeam: string; awayTeam: string }) {
  if (card.status === "analysis_unavailable") {
    return (
      <section data-testid={`ai-handicap-summary-${card.provider}`} className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">{card.displayName}</h3>
        <p className="mt-2 rounded border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[12px] font-semibold text-slate-600">
          No handicap opinion available yet for this game.
        </p>
      </section>
    );
  }

  const analyzedLabel = formatTimestamp(card.analyzedAt);
  const sideIsPass = !isPlayLean(card.side.lean);
  const totalIsPass = !isPlayLean(card.total.lean);
  const sideText = formatSpreadLine(card.side.team, card.side.line);
  const totalText = formatTotalLine(card.total.lean, card.total.line);

  return (
    <section data-testid={`ai-handicap-summary-${card.provider}`} className="flex flex-col rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-3 py-2.5 sm:px-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <h3 className="text-sm font-bold text-slate-900">{card.displayName}</h3>
          {analyzedLabel && <span className="text-[10px] font-medium text-slate-500">Analyzed {analyzedLabel}</span>}
        </div>
      </div>

      <div className="space-y-2 px-3 py-3 sm:px-4">
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2.5">
          {analyzedLabel && <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Analysis Baseline &middot; As of {analyzedLabel}</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <PredictionStat label="Fair Spread" value={formatFairSpread(card.prediction?.fairSpread ?? null)} />
            <PredictionStat label="Baseline Spread" value={formatBaselineSpreadForTeam(card.prediction?.fairSpread ?? null, homeTeam, card.market.spread)} />
            <PredictionStat label="Edge" value={formatSideEdge(card.edges.sidePoints, homeTeam, awayTeam)} />
            <PredictionStat label="Projected Total" value={card.prediction ? `${card.prediction.projectedTotal}` : NA} />
            <PredictionStat label="Baseline Total" value={formatBaselineTotal(card.market.total)} />
            <PredictionStat label="Total Edge" value={formatTotalEdge(card.edges.totalPoints)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <MarketOpinionBlock label="Side" pickText={sideText} confidence={card.side.confidence} isPass={sideIsPass} />
          <MarketOpinionBlock label="Total" pickText={totalText} confidence={card.total.confidence} isPass={totalIsPass} />
        </div>
      </div>
    </section>
  );
}

const PROVIDER_TABS: { provider: AiHandicapProvider; key: "grokowski" | "chattyIce" }[] = [
  { provider: "grok", key: "grokowski" },
  { provider: "chatgpt", key: "chattyIce" },
];

/**
 * "AI Picks" tab: the latest independent Grokowski (Grok) and Chatty Ice
 * (ChatGPT) handicaps for this game. These are two fully independent
 * handicappers -- nothing here computes or shows a consensus, an average
 * confidence, or a "winner" between them.
 *
 * WU7.9 -- split into an "AI Handicap Comparison" row (compact cards for
 * both providers at once, for quick scanning) and a "Full Analysis" section
 * below it that shows ONE provider's long-form article at a time, switched
 * via tabs. Never renders both full articles side by side.
 */
export default function MatchupAiPicksPanel({
  presentation,
  loading,
  error,
}: {
  presentation: NflAiHandicapPresentation | null;
  loading: boolean;
  error: string | null;
}) {
  const [activeProvider, setActiveProvider] = useState<AiHandicapProvider>("grok");

  if (loading) {
    return <p className="text-[12px] font-semibold text-slate-600">Loading AI handicaps…</p>;
  }

  if (!presentation) {
    return (
      <p className="rounded border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[12px] font-semibold text-slate-600">
        {error ? "AI handicap data could not be loaded for this game." : "AI handicaps have not been generated for this game yet."}
      </p>
    );
  }

  const activeTab = PROVIDER_TABS.find((tab) => tab.provider === activeProvider) ?? PROVIDER_TABS[0];
  const activeCard = presentation.handicappers[activeTab.key];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">AI Handicap Comparison</h3>
        <p className="text-[11px] leading-4 text-slate-500">
          Two independent AI handicappers form their own opinions from public evidence and the sportsbook line in
          effect at analysis time. That baseline is frozen to whichever run produced it -- it will not track today&apos;s
          live market. They never see each other&apos;s work, and nothing on this page averages, compares, or declares
          a winner between them.
        </p>
        <div className="grid grid-cols-1 gap-3 @container sm:grid-cols-2">
          <HandicapSummaryCard card={presentation.handicappers.grokowski} homeTeam={presentation.homeTeam} awayTeam={presentation.awayTeam} />
          <HandicapSummaryCard card={presentation.handicappers.chattyIce} homeTeam={presentation.homeTeam} awayTeam={presentation.awayTeam} />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">Full Analysis</h3>
        <div role="tablist" aria-label="Full analysis provider" className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
          {PROVIDER_TABS.map((tab) => {
            const card = presentation.handicappers[tab.key];
            const isActive = tab.provider === activeProvider;
            return (
              <button
                key={tab.provider}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveProvider(tab.provider)}
                className={`rounded px-3 py-1.5 text-[12px] font-bold transition-colors ${
                  isActive ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {card.displayName}
              </button>
            );
          })}
        </div>

        {activeCard.status === "ok" ? (
          <AiHandicapArticle card={activeCard} homeTeam={presentation.homeTeam} awayTeam={presentation.awayTeam} />
        ) : (
          <p className="rounded border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[12px] font-semibold text-slate-600">
            No handicap opinion available yet for this game.
          </p>
        )}
      </div>
    </div>
  );
}
