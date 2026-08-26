import type { NflMatchupScoreBand } from "@/lib/nfl/props/review/yardageMarketJoin";
import { MATCHUP_SCORE_BAND_LABEL } from "@/lib/nfl/props/review/yardageMarketJoin";
import { cn } from "@/lib/utils";

const BAND_TONE: Record<NflMatchupScoreBand, string> = {
  elite: "border-emerald-300 bg-emerald-50 text-emerald-800",
  strong: "border-sky-300 bg-sky-50 text-sky-800",
  average: "border-slate-300 bg-slate-100 text-slate-700",
  weak: "border-amber-300 bg-amber-50 text-amber-800",
  poor: "border-red-300 bg-red-50 text-red-800",
};

/**
 * Matchup Score value plus its presentation-only band. This is the second
 * most important number in a row (after the projection itself) -- sized to
 * scan easily but never colored as an over/under signal. Never labeled a
 * pick/recommendation.
 */
export function NflMatchupScoreBadge({ score, band }: { score: number | null; band: NflMatchupScoreBand | null }) {
  if (score == null || band == null) {
    return <span className="text-slate-400">—</span>;
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-bold tabular-nums", BAND_TONE[band])}>
      {Math.round(score)}
      <span className="text-[9px] font-semibold uppercase tracking-wide opacity-80">{MATCHUP_SCORE_BAND_LABEL[band]}</span>
    </span>
  );
}

const FLAG_LABEL: Record<string, string> = {
  noHistory: "No History",
  roleUncertain: "Role Uncertain",
  teamChanged: "Team Changed",
  limitedHistory: "Limited History",
};

/** Small diagnostic chips for pregame-observable hard cases. Never a confidence or betting signal. */
export function NflYardageReviewFlagChips({
  flags,
}: {
  flags: { noHistory: boolean; roleUncertain: boolean; teamChanged: boolean; limitedHistory: boolean };
}) {
  const active = (["noHistory", "roleUncertain", "teamChanged", "limitedHistory"] as const).filter((key) => flags[key]);
  if (active.length === 0) return <span className="text-slate-300">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {active.map((key) => (
        <span
          key={key}
          className="rounded border border-amber-300 bg-amber-50 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-800"
        >
          {FLAG_LABEL[key]}
        </span>
      ))}
    </span>
  );
}

const ROLE_CONFIDENCE_DOT: Record<string, string> = {
  sourced: "bg-emerald-500",
  inferred: "bg-slate-300",
};

/**
 * Supplementary provenance context, deliberately the quietest badge on the
 * row -- a small dot plus label rather than a bordered pill, so it does not
 * compete with the Matchup Score for attention.
 */
export function NflRoleConfidenceBadge({ roleConfidence, roleSource }: { roleConfidence: string; roleSource: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[9px] font-medium uppercase tracking-wide text-slate-500"
      title={`Role source: ${roleSource}`}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", ROLE_CONFIDENCE_DOT[roleConfidence] ?? ROLE_CONFIDENCE_DOT.inferred)} aria-hidden="true" />
      {roleConfidence}
    </span>
  );
}
