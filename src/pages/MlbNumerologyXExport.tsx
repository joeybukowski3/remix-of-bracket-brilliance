import type { ReactNode } from "react";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import { getMlbTeamColors } from "@/lib/mlbTeamColors";
import { useMlbNumerologyXPreview, type NumerologyXOtherPlay, type NumerologyXPlaySummary } from "@/hooks/useMlbNumerologyXPreview";

const INK = "#0f172a";
const MUTED = "#64748b";
const BORDER = "#e2e8f0";

/** Same 5-tier scheme used by the numerology email's score badges, kept consistent across both surfaces. */
function getScoreTierColors(score: number | null) {
  if (score == null) return { background: "#e2e8f0", color: "#334155" };
  if (score >= 75) return { background: "#065f46", color: "#ffffff" };
  if (score >= 65) return { background: "#0d9488", color: "#ffffff" };
  if (score >= 55) return { background: "#b45309", color: "#ffffff" };
  if (score >= 51) return { background: "#334155", color: "#ffffff" };
  return { background: "#e2e8f0", color: "#334155" };
}

function ScoreBadge({ score, size = "md" }: { score: number | null; size?: "lg" | "md" | "sm" }) {
  const tier = getScoreTierColors(score);
  const sizeClass = size === "lg" ? "px-5 py-2 text-3xl" : size === "sm" ? "px-2.5 py-1 text-sm" : "px-3.5 py-1.5 text-xl";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-black tabular-nums ${sizeClass}`}
      style={{ backgroundColor: tier.background, color: tier.color }}
    >
      {score ?? "—"}
    </span>
  );
}

function DayNumberChip({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl bg-white/10 px-3 py-2 text-center">
      <div className="text-[10px] font-bold uppercase tracking-wider text-sky-200/80">{label}</div>
      <div className="text-lg font-black text-white">{value}</div>
    </div>
  );
}

function AlignmentChip({ text, accent }: { text: string; accent: string }) {
  return (
    <div className="rounded-lg border px-3 py-1.5 text-sm font-semibold" style={{ borderColor: accent, color: INK, backgroundColor: `${accent}14` }}>
      {text}
    </div>
  );
}

function SecondaryPlayCard({ play, rank }: { play: NumerologyXPlaySummary; rank: number }) {
  const colors = getMlbTeamColors(play.team);
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl border bg-white p-3" style={{ borderColor: BORDER, borderTopColor: colors.primary, borderTopWidth: 4 }}>
      <div className="flex items-center gap-2">
        <MlbTeamLogo team={play.team} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black" style={{ color: INK }}>
            {rank}. {play.player}
          </div>
          <div className="truncate text-xs" style={{ color: MUTED }}>
            {play.matchup} · {play.matchType}
          </div>
        </div>
        <ScoreBadge score={play.numerologyScore} size="sm" />
      </div>
      {play.chips.length > 0 && (
        <ul className="space-y-1 text-xs" style={{ color: INK }}>
          {play.chips.slice(0, 3).map((chip) => (
            <li key={chip} className="flex gap-1.5">
              <span style={{ color: colors.primary }}>•</span>
              <span className="min-w-0">{chip}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OthersTableRow({ play, index }: { play: NumerologyXOtherPlay; index: number }) {
  return (
    <tr className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}>
      <td className="whitespace-nowrap px-2.5 py-1.5 text-left">
        <div className="flex items-center gap-1.5">
          <MlbTeamLogo team={play.team} size={16} />
          <span className="text-xs font-bold" style={{ color: INK }}>
            {play.player}
          </span>
        </div>
      </td>
      <td className="px-2.5 py-1.5 text-center">
        <ScoreBadge score={play.numerologyScore} size="sm" />
      </td>
      <td className="px-2.5 py-1.5 text-xs" style={{ color: MUTED }}>
        {play.matchType}
      </td>
      <td className="px-2.5 py-1.5 text-xs" style={{ color: MUTED }}>
        {play.reason ?? "—"}
      </td>
    </tr>
  );
}

export default function MlbNumerologyXExport() {
  const { loading, fileUnavailable, preview } = useMlbNumerologyXPreview();

  if (loading) {
    return <div className="p-8 text-center text-sm text-slate-500">Loading numerology preview…</div>;
  }
  if (fileUnavailable || !preview) {
    return (
      <div className="p-8 text-center text-sm text-red-500" data-testid="numerology-x-export-unavailable">
        Numerology X preview data is unavailable. Run the generator first.
      </div>
    );
  }
  if (!preview.topPlay) {
    return (
      <div className="p-8 text-center text-sm text-slate-500" data-testid="numerology-x-export-no-plays">
        No qualifying numerology plays for {preview.date}.
      </div>
    );
  }

  const { topPlay, secondPlay, thirdPlay, othersOver50, dayNumbers } = preview;
  const heroColors = getMlbTeamColors(topPlay.team);

  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-200 p-6">
      <div
        data-x-export="mlb-numerology-social"
        className="w-[1080px] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl"
      >
        {/* A. Header */}
        <div className="bg-[#0f172a] px-8 pb-6 pt-7">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300/80">Joe Knows Ball</div>
          <div className="mt-1 text-4xl font-black text-white">MLB Numerology Plays</div>
          <div className="mt-1 text-base text-slate-300">
            {preview.date} · Today's strongest number alignments
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <DayNumberChip label="Universal Day" value={dayNumbers.universalDayLabel ?? "—"} />
            <DayNumberChip label="Primary Family" value={dayNumbers.primaryFamily.join("-") || "—"} />
            <DayNumberChip label="Secondary Family" value={dayNumbers.secondaryFamily.join("-") || "—"} />
            <DayNumberChip label="Complement" value={dayNumbers.balancingComplement ?? "—"} />
            <DayNumberChip label="Countercurrent" value={dayNumbers.countercurrent ?? "—"} />
          </div>
        </div>

        {/* B. Top Play Hero Section */}
        <div className="px-8 py-6" style={{ backgroundColor: `${heroColors.primary}0d` }}>
          <div className="text-xs font-black uppercase tracking-wider" style={{ color: heroColors.primary }}>
            Top Play
          </div>
          <div className="mt-2 flex items-center gap-4">
            <MlbTeamLogo team={topPlay.team} size={88} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-4xl font-black" style={{ color: INK }}>
                {topPlay.player}
              </div>
              <div className="mt-1 text-base font-semibold" style={{ color: MUTED }}>
                {topPlay.matchup} · {topPlay.matchType}
                {topPlay.modelRating != null ? ` · Model Rating ${topPlay.modelRating}` : ""}
              </div>
            </div>
            <ScoreBadge score={topPlay.numerologyScore} size="lg" />
          </div>
          {topPlay.chips.length > 0 && (
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {topPlay.chips.map((chip) => (
                <AlignmentChip key={chip} text={chip} accent={heroColors.primary} />
              ))}
            </div>
          )}
        </div>

        {/* C. Other Top Plays */}
        {(secondPlay || thirdPlay) && (
          <div className="px-8 py-5">
            <div className="mb-2 text-xs font-black uppercase tracking-wider" style={{ color: MUTED }}>
              Also Ranking Highly
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {secondPlay && <SecondaryPlayCard play={secondPlay} rank={2} />}
              {thirdPlay && <SecondaryPlayCard play={thirdPlay} rank={3} />}
            </div>
          </div>
        )}

        {/* D. Other Players Over 50 */}
        {othersOver50.length > 0 && (
          <div className="px-8 pb-4">
            <div className="mb-2 text-xs font-black uppercase tracking-wider" style={{ color: MUTED }}>
              Other Players Over {preview.scoreThreshold ?? 50}
            </div>
            <div className="overflow-hidden rounded-xl border" style={{ borderColor: BORDER }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-black uppercase tracking-wide" style={{ color: MUTED }}>
                    <th className="px-2.5 py-1.5 text-left">Player</th>
                    <th className="px-2.5 py-1.5 text-center">Score</th>
                    <th className="px-2.5 py-1.5 text-left">Match Type</th>
                    <th className="px-2.5 py-1.5 text-left">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {othersOver50.map((play, index) => (
                    <OthersTableRow key={`${play.player}-${play.team}`} play={play} index={index} />
                  ))}
                </tbody>
              </table>
            </div>
            {preview.othersOver50TruncatedCount > 0 && (
              <div className="mt-1.5 text-xs" style={{ color: MUTED }}>
                +{preview.othersOver50TruncatedCount} more on the full board.
              </div>
            )}
          </div>
        )}

        {/* E. Footer */}
        <div className="border-t px-8 py-4 text-center" style={{ borderColor: BORDER }}>
          <div className="text-sm font-black" style={{ color: INK }}>
            JoeKnowsBall · joeknowsball.com
          </div>
          <div className="mt-1 text-xs" style={{ color: MUTED }}>
            For entertainment / trend analysis only. Not betting advice.
          </div>
        </div>
      </div>
    </div>
  );
}
