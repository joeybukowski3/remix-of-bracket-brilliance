import { GuideSectionHeading, Metric, SourceTag } from "@/components/nfl/guide/GuideAtoms";
import { NFL_GUIDE_MARKET_DISAGREEMENTS } from "@/lib/nfl/guideOverview";
import type { NflGuideRecord } from "@/lib/nfl/guideRecord";

/**
 * Market snapshot (Section E): win total and VSiN futures as published,
 * plus the already-approved model-vs-market rank gap. No betting edge is
 * calculated here — only the rank comparison already used league-wide in
 * GuideLeagueOverview.
 */
export function ChapterMarketSnapshot({ team }: { team: NflGuideRecord }) {
  const { market, vsin } = team;
  const odds = vsin?.odds;
  const disagreement = NFL_GUIDE_MARKET_DISAGREEMENTS.find((entry) => entry.team.abbr === team.abbr);

  if (!market && !odds) return null;

  return (
    <section className="break-inside-avoid border border-slate-200 bg-white p-3">
      <GuideSectionHeading as="h3" eyebrow="Market snapshot" title="Win total and futures" />
      <div className="mt-3 flex items-center gap-2">
        <SourceTag kind="market" />
        <span className="text-[10px] text-slate-500">
          Reference prices as published, not live odds.
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {market ? (
          <Metric label="Win total" value={market.winTotal.toFixed(1)} sub="Preseason market win total" />
        ) : null}
        {odds?.division ? (
          <Metric label={odds.division.label} value={odds.division.displayValue} sub="Division odds" />
        ) : null}
        {odds?.conference ? (
          <Metric label={odds.conference.label} value={odds.conference.displayValue} sub="Conference odds" />
        ) : null}
        {odds?.superBowl ? (
          <Metric label="Super Bowl" value={odds.superBowl.displayValue} sub="Championship odds" />
        ) : null}
      </div>

      {disagreement ? (
        <p className="mt-3 text-[11px] leading-4 text-slate-600">
          NFL v0.3 rank <span className="font-black text-slate-900">#{disagreement.modelRank}</span> vs. market
          win-total rank <span className="font-black text-slate-900">#{disagreement.marketRank}</span> — a{" "}
          <span className="font-black text-slate-900">
            {disagreement.rankGap > 0 ? `+${disagreement.rankGap}` : disagreement.rankGap}
          </span>{" "}
          gap. {disagreement.rankGap > 0
            ? "The v0.3 model rates the team higher than its market win total implies."
            : disagreement.rankGap < 0
              ? "The market win total implies a higher standing than the v0.3 rank."
              : "The v0.3 rank and market win-total rank agree."}
        </p>
      ) : null}

      {market || odds ? (
        <p className="mt-2 text-[9px] text-slate-500">
          {market ? "Win total snapshot date unavailable in legacy source." : null}
          {odds ? ` Futures source: 2026 VSiN NFL Betting Guide, page ${vsin?.sourcePage}.` : null}
        </p>
      ) : null}
    </section>
  );
}
