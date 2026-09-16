import { useState } from "react";
import MatchupCollapsibleGroup from "@/components/nfl/matchups/MatchupCollapsibleGroup";
import type { AiHandicapCard, NflAiHandicapPresentation } from "@/lib/nfl/aiHandicapPresentation";

const NA = "N/A";

function formatTimestamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  });
}

function formatSpreadLine(team: string | null, line: number | null): string {
  if (team == null || line == null) return NA;
  const signed = line > 0 ? `+${line}` : `${line}`;
  return `${team.toUpperCase()} ${signed}`;
}

function formatTotalLine(lean: "over" | "under" | "pass" | "undecided", line: number | null): string {
  if (lean !== "over" && lean !== "under") return NA;
  if (line == null) return NA;
  return `${lean === "over" ? "Over" : "Under"} ${line}`;
}

function confidenceLabel(confidence: number | null): string {
  return confidence == null ? "—" : `${confidence}/10`;
}

function isPlayLean(lean: string): boolean {
  return lean === "home" || lean === "away" || lean === "over" || lean === "under";
}

function formatFairSpread(fairSpread: { team: string; line: number } | null): string {
  if (!fairSpread) return NA;
  const signed = fairSpread.line > 0 ? `+${fairSpread.line}` : `${fairSpread.line}`;
  return `${fairSpread.team.toUpperCase()} ${signed}`;
}

/**
 * WU7.7 -- the FROZEN baseline spread (the sportsbook line in effect when this
 * handicapper's opinion was formed, never today's live line), shown for the
 * SAME team as the handicapper's fair line -- home line negated when the
 * fair-line team is the away team.
 */
function formatBaselineSpreadForTeam(fairSpread: { team: string; line: number } | null, homeTeam: string, market: { homeLine: number | null; awayLine: number | null }): string {
  if (!fairSpread) return NA;
  const line = fairSpread.team === homeTeam ? market.homeLine : market.awayLine;
  if (line == null) return NA;
  const signed = line > 0 ? `+${line}` : `${line}`;
  return `${fairSpread.team.toUpperCase()} ${signed}`;
}

/** WU7.7 -- the FROZEN baseline total (never today's live total). */
function formatBaselineTotal(total: number | null): string {
  return total == null ? NA : `${total}`;
}

/** WU4.6 -- "5.0 pts IND" style label. `sidePoints` is home-oriented (positive = value on home); this resolves it to the actual favored-toward team using the fair-spread pairing, so the label always names a real team, never a raw sign. */
function formatSideEdge(sidePoints: number | null, homeTeam: string, awayTeam: string | null): string {
  if (sidePoints == null) return NA;
  if (sidePoints === 0) return "No edge";
  const team = sidePoints > 0 ? homeTeam : awayTeam;
  if (!team) return NA;
  return `${Math.abs(sidePoints).toFixed(1)} pts ${team.toUpperCase()}`;
}

/** WU7.7 -- "1.5 pts Over"/"1.5 pts Under" style label, mirroring formatSideEdge for the total. `totalPoints` is over-oriented (positive = value on the over). */
function formatTotalEdge(totalPoints: number | null): string {
  if (totalPoints == null) return NA;
  if (totalPoints === 0) return "No edge";
  const direction = totalPoints > 0 ? "Over" : "Under";
  return `${Math.abs(totalPoints).toFixed(1)} pts ${direction}`;
}

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
function MarketOpinionBlock({
  label,
  pickText,
  confidence,
  isPass,
}: {
  label: string;
  pickText: string;
  confidence: number | null;
  isPass: boolean;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className={`mt-1 text-[15px] font-black ${isPass ? "tracking-wide text-slate-500" : "text-slate-900"}`}>
        {isPass ? "PASS" : pickText}
      </p>
      {!isPass && (
        <p className="mt-1 text-[12px] font-bold tabular-nums text-emerald-700">
          Confidence {confidenceLabel(confidence)}
        </p>
      )}
    </div>
  );
}

function HandicapCard({ card, homeTeam, awayTeam }: { card: AiHandicapCard; homeTeam: string; awayTeam: string }) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const toggle = (id: string) => setOpenGroup((current) => (current === id ? null : id));

  if (card.status === "analysis_unavailable") {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4">
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
    <section className="flex flex-col rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-3 py-2.5 sm:px-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <h3 className="text-sm font-bold text-slate-900">{card.displayName}</h3>
          {analyzedLabel && <span className="text-[10px] font-medium text-slate-500">Analyzed {analyzedLabel}</span>}
        </div>
      </div>

      <div className="space-y-2 px-3 py-3 sm:px-4">
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2.5">
          {analyzedLabel && (
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
              Analysis Baseline &middot; As of {analyzedLabel}
            </p>
          )}
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

        {card.centralThesis && (
          <p className="text-[12px] leading-5 text-slate-700">{card.centralThesis}</p>
        )}
      </div>

      {(card.keyFactors.length > 0 || card.failureModes.length > 0 || card.evidenceQualitySummary) && (
        <div className="border-t border-slate-100">
          {card.keyFactors.length > 0 && (
            <MatchupCollapsibleGroup
              id={`ai-picks-${card.provider}-factors`}
              triggerId={`ai-picks-${card.provider}-factors-trigger`}
              title="Key matchup factors"
              meta={`${card.keyFactors.length}`}
              open={openGroup === "factors"}
              onToggle={() => toggle("factors")}
            >
              <ul className="space-y-1.5 text-[12px] leading-5 text-slate-700">
                {card.keyFactors.map((factor, index) => (
                  <li key={index} className="border-l-2 border-slate-200 pl-2.5">
                    {factor.finding}
                  </li>
                ))}
              </ul>
            </MatchupCollapsibleGroup>
          )}

          {card.failureModes.length > 0 && (
            <MatchupCollapsibleGroup
              id={`ai-picks-${card.provider}-failure-modes`}
              triggerId={`ai-picks-${card.provider}-failure-modes-trigger`}
              title="What could go wrong"
              meta={`${card.failureModes.length}`}
              open={openGroup === "failureModes"}
              onToggle={() => toggle("failureModes")}
            >
              <ul className="space-y-2 text-[12px] leading-5 text-slate-700">
                {card.failureModes.map((mode, index) => (
                  <li key={index} className="border-l-2 border-amber-300 pl-2.5">
                    <span className="font-semibold text-slate-900">{mode.scenario}</span>
                    <span className="block text-slate-600">{mode.whyItMatters}</span>
                  </li>
                ))}
              </ul>
            </MatchupCollapsibleGroup>
          )}

          {card.evidenceQualitySummary && (
            <MatchupCollapsibleGroup
              id={`ai-picks-${card.provider}-evidence-quality`}
              triggerId={`ai-picks-${card.provider}-evidence-quality-trigger`}
              title="Evidence quality"
              open={openGroup === "evidenceQuality"}
              onToggle={() => toggle("evidenceQuality")}
            >
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
            </MatchupCollapsibleGroup>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * "AI Picks" tab: the latest independent Grokowski (Grok) and Chatty Ice
 * (ChatGPT) handicaps for this game, side by side. These are two fully
 * independent handicappers -- nothing here computes or shows a consensus,
 * an average confidence, or a "winner" between them.
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

  return (
    <div className="space-y-2">
      <p className="text-[11px] leading-4 text-slate-500">
        Two independent AI handicappers form their own opinions from public evidence and the sportsbook line in
        effect at analysis time. That baseline is frozen to whichever run produced it -- it will not track today&apos;s
        live market. They never see each other&apos;s work, and nothing on this page averages, compares, or declares
        a winner between them.
      </p>
      <div className="grid grid-cols-1 gap-3 @container sm:grid-cols-2">
        <HandicapCard card={presentation.handicappers.grokowski} homeTeam={presentation.homeTeam} awayTeam={presentation.awayTeam} />
        <HandicapCard card={presentation.handicappers.chattyIce} homeTeam={presentation.homeTeam} awayTeam={presentation.awayTeam} />
      </div>
    </div>
  );
}
