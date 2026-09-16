import { useState } from "react";
import MatchupCollapsibleGroup from "@/components/nfl/matchups/MatchupCollapsibleGroup";
import type { AiHandicapReady } from "@/lib/nfl/aiHandicapPresentation";
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
} from "@/lib/nfl/aiHandicapFormat";

/** One "SECTION HEADING" -- strong, uppercase, tracked-out, matching the rest of this article's editorial feel. */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h4 className="text-[13px] font-black uppercase tracking-[0.08em] text-slate-900">{children}</h4>;
}

function Paragraphs({ paragraphs }: { paragraphs: string[] }) {
  return (
    <div className="space-y-3">
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="text-[14px] leading-7 text-slate-700">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function BettingStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className="mt-0.5 text-[14px] font-bold text-slate-900">{value}</p>
    </div>
  );
}

/**
 * WU7.9 -- the full long-form editorial article for one handicapper, shown
 * one at a time behind the provider tabs in MatchupAiPicksPanel.tsx. Every
 * section is rendered only when the underlying data supports it -- a null
 * section is omitted entirely, never padded with placeholder copy.
 */
export default function AiHandicapArticle({ card, homeTeam, awayTeam }: { card: AiHandicapReady; homeTeam: string; awayTeam: string }) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const { editorial } = card;
  const analyzedLabel = formatTimestamp(card.analyzedAt);
  const sideIsPass = !isPlayLean(card.side.lean);
  const totalIsPass = !isPlayLean(card.total.lean);

  return (
    <article data-testid={`ai-handicap-article-${card.provider}`} className="mx-auto w-full max-w-[820px] space-y-6 px-1 py-1">
      {editorial.isLegacyPreview && (
        <p className="rounded border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
          Layout preview -- this article was assembled from {card.displayName}&apos;s pre-editorial analysis, not written in this format by the model.
        </p>
      )}

      <header className="space-y-2 border-b border-slate-200 pb-4">
        <h2 className="text-xl font-black leading-tight text-slate-900 sm:text-2xl">{editorial.headline}</h2>
        <p className="text-[14px] leading-6 text-slate-600">{editorial.dek}</p>
        {analyzedLabel && <p className="text-[11px] font-medium text-slate-400">Analyzed {analyzedLabel}</p>}
      </header>

      {editorial.openingRead.length > 0 && (
        <section>
          <SectionHeading>The Read</SectionHeading>
          <div className="mt-2">
            <Paragraphs paragraphs={editorial.openingRead} />
          </div>
        </section>
      )}

      {editorial.awayOffenseVsHomeDefense && (
        <section>
          <SectionHeading>{editorial.awayOffenseVsHomeDefense.heading}</SectionHeading>
          <div className="mt-2">
            <Paragraphs paragraphs={editorial.awayOffenseVsHomeDefense.paragraphs} />
          </div>
        </section>
      )}

      {editorial.homeOffenseVsAwayDefense && (
        <section>
          <SectionHeading>{editorial.homeOffenseVsAwayDefense.heading}</SectionHeading>
          <div className="mt-2">
            <Paragraphs paragraphs={editorial.homeOffenseVsAwayDefense.paragraphs} />
          </div>
        </section>
      )}

      {editorial.trenchesAndGameControl && (
        <section>
          <SectionHeading>The Trenches and Game Control</SectionHeading>
          <div className="mt-2">
            <Paragraphs paragraphs={editorial.trenchesAndGameControl} />
          </div>
        </section>
      )}

      {editorial.personnelAndAvailability && (
        <section>
          <SectionHeading>Personnel, Injuries and Context</SectionHeading>
          <div className="mt-2">
            <Paragraphs paragraphs={editorial.personnelAndAvailability} />
          </div>
        </section>
      )}

      {editorial.gameScript && (
        <section>
          <SectionHeading>How the Game Could Play Out</SectionHeading>
          <div className="mt-2">
            <Paragraphs paragraphs={editorial.gameScript} />
          </div>
        </section>
      )}

      {editorial.matchupKeys.length > 0 && (
        <section>
          <SectionHeading>Matchup Keys</SectionHeading>
          <ul className="mt-2 space-y-3">
            {editorial.matchupKeys.map((key, index) => (
              <li key={index} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[13px] font-bold text-slate-900">{key.title}</p>
                <p className="mt-1 text-[13px] leading-6 text-slate-700">{key.analysis}</p>
                {key.supportingStats && key.supportingStats.length > 0 && (
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {key.supportingStats.map((stat, statIndex) => (
                      <li key={statIndex} className="rounded bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">
                        {stat}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {editorial.swingFactors.length > 0 && (
        <section>
          <SectionHeading>What Could Flip the Handicap</SectionHeading>
          <ul className="mt-2 space-y-2">
            {editorial.swingFactors.map((factor, index) => (
              <li key={index} className="border-l-2 border-amber-300 pl-2.5">
                <p className="text-[13px] font-bold text-slate-900">{factor.title}</p>
                <p className="text-[13px] leading-6 text-slate-600">{factor.analysis}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <SectionHeading>Betting Breakdown</SectionHeading>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <BettingStat label="Fair Spread" value={formatFairSpread(card.prediction?.fairSpread ?? null)} />
          <BettingStat label="Baseline Spread" value={formatBaselineSpreadForTeam(card.prediction?.fairSpread ?? null, homeTeam, card.market.spread)} />
          <BettingStat label="Side Edge" value={formatSideEdge(card.edges.sidePoints, homeTeam, awayTeam)} />
          <BettingStat label="Side Pick" value={sideIsPass ? "PASS" : formatSpreadLine(card.side.team, card.side.line)} />
          <BettingStat label="Side Confidence" value={sideIsPass ? "—" : confidenceLabel(card.side.confidence)} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <BettingStat label="Projected Total" value={card.prediction ? `${card.prediction.projectedTotal}` : "N/A"} />
          <BettingStat label="Baseline Total" value={formatBaselineTotal(card.market.total)} />
          <BettingStat label="Total Edge" value={formatTotalEdge(card.edges.totalPoints)} />
          <BettingStat label="Total Pick" value={totalIsPass ? "PASS" : formatTotalLine(card.total.lean, card.total.line)} />
          <BettingStat label="Total Confidence" value={totalIsPass ? "—" : confidenceLabel(card.total.confidence)} />
        </div>

        {editorial.sideAnalysis && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Side Analysis</p>
            <div className="mt-1.5">
              <Paragraphs paragraphs={editorial.sideAnalysis} />
            </div>
          </div>
        )}

        {editorial.totalAnalysis && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Total Analysis</p>
            <div className="mt-1.5">
              <Paragraphs paragraphs={editorial.totalAnalysis} />
            </div>
          </div>
        )}
      </section>

      {editorial.finalWord.length > 0 && (
        <section>
          <SectionHeading>Final Word</SectionHeading>
          <div className="mt-2">
            <Paragraphs paragraphs={editorial.finalWord} />
          </div>
        </section>
      )}

      {(card.keyFactors.length > 0 || card.failureModes.length > 0 || card.evidenceQualitySummary) && (
        <section className="border-t border-slate-200 pt-2">
          <MatchupCollapsibleGroup
            id={`ai-picks-${card.provider}-research-and-sources`}
            triggerId={`ai-picks-${card.provider}-research-and-sources-trigger`}
            title="Research & Sources"
            open={sourcesOpen}
            onToggle={() => setSourcesOpen((current) => !current)}
          >
            <div className="space-y-4">
              {card.keyFactors.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Matchup factors ({card.keyFactors.length})</p>
                  <ul className="mt-1.5 space-y-1.5 text-[12px] leading-5 text-slate-700">
                    {card.keyFactors.map((factor, index) => (
                      <li key={index} className="border-l-2 border-slate-200 pl-2.5">
                        {factor.finding}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {card.failureModes.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Failure modes ({card.failureModes.length})</p>
                  <ul className="mt-1.5 space-y-2 text-[12px] leading-5 text-slate-700">
                    {card.failureModes.map((mode, index) => (
                      <li key={index} className="border-l-2 border-amber-300 pl-2.5">
                        <span className="font-semibold text-slate-900">{mode.scenario}</span>
                        <span className="block text-slate-600">{mode.whyItMatters}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {card.evidenceQualitySummary && (
                <div className="space-y-2 text-[12px] leading-5 text-slate-700">
                  {card.evidenceQualitySummary.limitations.length > 0 && (
                    <div>
                      <p className="font-semibold text-slate-900">Limitations</p>
                      <ul className="list-disc space-y-0.5 pl-4 text-slate-600">
                        {card.evidenceQualitySummary.limitations.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {card.evidenceQualitySummary.strengths.length > 0 && (
                    <div>
                      <p className="font-semibold text-slate-900">Strengths</p>
                      <ul className="list-disc space-y-0.5 pl-4 text-slate-600">
                        {card.evidenceQualitySummary.strengths.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </MatchupCollapsibleGroup>
        </section>
      )}
    </article>
  );
}
