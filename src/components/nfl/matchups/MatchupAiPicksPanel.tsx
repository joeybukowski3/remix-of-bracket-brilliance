import { useState } from "react";
import AiHandicapArticle from "@/components/nfl/matchups/AiHandicapArticle";
import type { AiHandicapCard, AiHandicapProvider, NflAiHandicapPresentation } from "@/lib/nfl/aiHandicapPresentation";
import { getProviderTheme } from "@/lib/nfl/aiHandicapProviderTheme";
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

/** Small labeled stat -- used for the fair spread / baseline / projected total row that displays even when the handicapper is passing. Deliberately neutral (not provider-colored): these are compact reference numbers, not the decision itself. */
function PredictionStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className="mt-0.5 text-[13px] font-bold text-slate-900">{value}</p>
    </div>
  );
}

/**
 * WU7.10 -- one handicapper's SIDE or TOTAL recommendation. This is the
 * card's actual betting opinion, so it gets the strongest visual treatment
 * in the card: a provider-tinted surface, a provider-colored border, larger
 * pick typography in a provider-tinted dark color, and confidence as
 * secondary supporting text -- deliberately easier to find than the
 * compact baseline stats above it.
 */
function MarketOpinionBlock({
  label,
  pickText,
  confidence,
  isPass,
  provider,
}: {
  label: string;
  pickText: string;
  confidence: number | null;
  isPass: boolean;
  provider: AiHandicapProvider;
}) {
  const theme = getProviderTheme(provider);
  return (
    <div className={`rounded-md border-2 px-3 py-2.5 ${isPass ? "border-slate-200 bg-slate-50" : `${theme.accentBorder} ${theme.accentBg}`}`}>
      <p className={`text-[10px] font-bold uppercase tracking-[0.08em] ${isPass ? "text-slate-500" : theme.accentText}`}>{label}</p>
      <p className={`mt-1 text-[17px] font-black leading-tight ${isPass ? "tracking-wide text-slate-500" : theme.pickText}`}>{isPass ? "PASS" : pickText}</p>
      {!isPass && <p className="mt-1 text-[12px] font-bold tabular-nums text-slate-600">Confidence {confidenceLabel(confidence)}</p>}
    </div>
  );
}

/**
 * WU7.10 -- the provider masthead: a strong, branded dark header (never the
 * whole card) carrying the provider name, a fixed tagline, and the analyzed
 * timestamp. Provider name stays in plain text (color is never the only
 * signal) and is visually dominant via size/weight. The small square
 * monogram is a plain typographic mark, not an invented logo.
 */
function ProviderMasthead({ provider, analyzedLabel }: { provider: AiHandicapProvider; analyzedLabel: string | null }) {
  const theme = getProviderTheme(provider);
  return (
    <div data-testid={`ai-handicap-masthead-${provider}`} className={`${theme.headerBg} ${theme.headerAccentBorder} px-3 py-2.5 sm:px-4`}>
      <div className="flex items-center gap-2.5">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${theme.headerText} bg-white/10 text-sm font-black`} aria-hidden="true">
          {theme.monogram}
        </span>
        <div className="min-w-0">
          <h3 className={`text-base font-black leading-tight ${theme.headerText}`}>{theme.displayName}</h3>
          <p className={`text-[10px] font-bold uppercase tracking-[0.1em] ${theme.headerSubtext}`}>{theme.tagline}</p>
        </div>
      </div>
      {analyzedLabel && <p className={`mt-1.5 text-[10px] font-medium ${theme.headerSubtext}`}>Analyzed {analyzedLabel}</p>}
    </div>
  );
}

/**
 * WU7.9/7.10 -- compact "AI Handicap Comparison" card: fair spread,
 * baseline, edge, side/total pick and confidence for ONE provider.
 * Deliberately does NOT show the thesis, matchup factors, failure modes, or
 * evidence quality -- those live in the full long-form article below
 * (AiHandicapArticle), never duplicated here so the comparison row stays
 * scannable. Each card is a branded analyst column: a strong provider
 * masthead on top, a light neutral reading surface for the numbers below --
 * never a fully-dark card.
 */
function HandicapSummaryCard({ card, homeTeam, awayTeam }: { card: AiHandicapCard; homeTeam: string; awayTeam: string }) {
  const theme = getProviderTheme(card.provider);

  if (card.status === "analysis_unavailable") {
    return (
      <section data-testid={`ai-handicap-summary-${card.provider}`} data-provider={card.provider} className="flex h-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
        <ProviderMasthead provider={card.provider} analyzedLabel={null} />
        <p className="m-3 rounded border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[12px] font-semibold text-slate-600 sm:m-4">
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
    <section data-testid={`ai-handicap-summary-${card.provider}`} data-provider={card.provider} className="flex h-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
      <ProviderMasthead provider={card.provider} analyzedLabel={analyzedLabel} />

      <div className="flex flex-1 flex-col justify-between space-y-2 px-3 py-3 sm:px-4">
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2.5">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Analysis Baseline{analyzedLabel ? ` · As of ${analyzedLabel}` : ""}</p>
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
          <MarketOpinionBlock label="Side" pickText={sideText} confidence={card.side.confidence} isPass={sideIsPass} provider={card.provider} />
          <MarketOpinionBlock label="Total" pickText={totalText} confidence={card.total.confidence} isPass={totalIsPass} provider={card.provider} />
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
 *
 * WU7.10 -- each comparison card and the active Full Analysis tab now carry
 * a distinct provider visual identity (see aiHandicapProviderTheme.ts) so
 * the two independent opinions read as two different analysts, not two
 * copies of the same card with different numbers.
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
      <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-100/60 p-3 sm:p-4">
        <h3 className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">AI Handicap Comparison</h3>
        <p className="text-[11px] leading-4 text-slate-500">
          Two independent AI handicappers form their own opinions from public evidence and the sportsbook line in
          effect at analysis time. That baseline is frozen to whichever run produced it -- it will not track today&apos;s
          live market. They never see each other&apos;s work, and nothing on this page averages, compares, or declares
          a winner between them.
        </p>
        <div className="grid grid-cols-1 items-stretch gap-4 @container sm:grid-cols-2">
          <HandicapSummaryCard card={presentation.handicappers.grokowski} homeTeam={presentation.homeTeam} awayTeam={presentation.awayTeam} />
          <HandicapSummaryCard card={presentation.handicappers.chattyIce} homeTeam={presentation.homeTeam} awayTeam={presentation.awayTeam} />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">Full Analysis</h3>
        <div role="tablist" aria-label="Full analysis provider" className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
          {PROVIDER_TABS.map((tab) => {
            const card = presentation.handicappers[tab.key];
            const theme = getProviderTheme(tab.provider);
            const isActive = tab.provider === activeProvider;
            return (
              <button
                key={tab.provider}
                type="button"
                role="tab"
                aria-selected={isActive}
                data-provider={tab.provider}
                onClick={() => setActiveProvider(tab.provider)}
                className={`rounded px-3 py-1.5 text-[12px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 ${theme.focusRing} ${
                  isActive ? `${theme.activeTabBg} ${theme.activeTabText} shadow-sm` : "text-slate-500 hover:text-slate-700"
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
