import type { AiHandicapV2Card } from "@/lib/nfl/aiHandicapPresentation";
import { getProviderTheme } from "@/lib/nfl/aiHandicapProviderTheme";
import { formatTimestamp } from "@/lib/nfl/aiHandicapFormat";
import { formatV2Confidence, formatV2FairScore, formatV2FairSpread, formatV2Percent, formatV2Pick, V2_VERDICT_STYLE } from "@/lib/nfl/aiHandicapV2Format";

function Row({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-slate-100 py-1.5 first:border-t-0">
      <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</dt>
      <dd data-testid={testId} className="min-w-0 text-right text-[13px] font-bold tabular-nums text-slate-900">
        {value}
      </dd>
    </div>
  );
}

/**
 * v2 compact summary card for ONE provider: verdict badge, preferred side +
 * line, cover probability, fair spread, projected total, confidence and
 * generated time. Deliberately short -- the reasoning lives in the analysis
 * below, and there is no stats grid.
 */
export default function AiHandicapV2SummaryCard({ card, homeTeam, awayTeam }: { card: AiHandicapV2Card; homeTeam: string; awayTeam: string }) {
  const theme = getProviderTheme(card.provider);
  const verdict = V2_VERDICT_STYLE[card.verdict];
  const generated = formatTimestamp(card.generatedAt);

  return (
    <section
      data-testid={`ai-handicap-summary-${card.provider}`}
      data-provider={card.provider}
      data-handicap-version="v2"
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white"
    >
      <div className={`${theme.headerBg} ${theme.headerAccentBorder} px-3 py-2.5 sm:px-4`}>
        <div className="flex items-center gap-2.5">
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${theme.headerText} bg-white/10 text-sm font-black`} aria-hidden="true">
            {theme.monogram}
          </span>
          <h3 className={`min-w-0 text-base font-black leading-tight ${theme.headerText}`}>{theme.displayName}</h3>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span data-testid={`ai-handicap-verdict-${card.provider}`} className={`rounded px-2 py-0.5 text-[11px] font-black tracking-[0.1em] ${verdict.className}`}>
            {verdict.label}
          </span>
          <p data-testid={`ai-handicap-pick-${card.provider}`} className={`text-[20px] font-black leading-tight ${theme.pickText}`}>
            {formatV2Pick(card)}
          </p>
        </div>

        <dl className="rounded-md border border-slate-200 px-3">
          <Row label="Cover probability" value={formatV2Percent(card.coverProbabilityPreferred)} testId={`ai-handicap-cover-${card.provider}`} />
          <Row label="Fair spread" value={formatV2FairSpread(card)} testId={`ai-handicap-fair-spread-${card.provider}`} />
          <Row label="Fair score" value={formatV2FairScore(card, awayTeam, homeTeam)} testId={`ai-handicap-fair-score-${card.provider}`} />
          <Row label="Projected total" value={`${card.projectedTotal}`} testId={`ai-handicap-total-${card.provider}`} />
          <Row label="Confidence" value={formatV2Confidence(card.confidence)} testId={`ai-handicap-confidence-${card.provider}`} />
        </dl>

        {generated && <p className="mt-auto text-[10px] font-medium text-slate-500">Generated {generated}</p>}
      </div>
    </section>
  );
}
