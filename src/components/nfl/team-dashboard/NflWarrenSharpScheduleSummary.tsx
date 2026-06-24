import type { WarrenSharpScheduleProfile } from "@/lib/nfl/warrenSharpSchedule2026";

export default function NflWarrenSharpScheduleSummary({
  profile,
}: {
  profile: WarrenSharpScheduleProfile;
}) {
  const netRestTone = profile.netRestDays > 0 ? "good" : profile.netRestDays < 0 ? "bad" : "neutral";
  const restTone = profile.restGameDifference > 0 ? "good" : profile.restGameDifference < 0 ? "bad" : "neutral";
  const prepTone = profile.prepDifference > 0 ? "good" : profile.prepDifference < 0 ? "bad" : "neutral";

  return (
    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">
            Warren Sharp schedule profile
          </div>
          <h3 className="mt-1 text-lg font-black text-slate-900">
            Opponent difficulty and rest environment
          </h3>
        </div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Source pages {profile.sourcePages.strengthOfSchedule}, {profile.sourcePages.weeklySchedule}, {profile.sourcePages.timingSummary}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <ScheduleMetric
          label="Sharp SOS"
          value={`#${profile.strengthOfSchedule.hardestFirstRank}`}
          detail="1 = hardest"
          tone={profile.strengthOfSchedule.hardestFirstRank <= 8 ? "bad" : profile.strengthOfSchedule.hardestFirstRank >= 25 ? "good" : "neutral"}
        />
        <ScheduleMetric
          label="Net rest"
          value={formatSignedDays(profile.netRestDays)}
          detail={`NFL rank #${profile.netRestEdgeRank}`}
          tone={netRestTone}
        />
        <ScheduleMetric
          label="Rest games"
          value={`${profile.gamesWithRestAdvantage}–${profile.gamesWithRestDisadvantage}`}
          detail={`advantage–disadvantage · rank #${profile.restRank}`}
          tone={restTone}
        />
        <ScheduleMetric
          label="Opponent prep"
          value={`${profile.opponentsWithShortPrep}–${profile.opponentsWithExtraPrep}`}
          detail={`short–extra · prep rank #${profile.prepRank}`}
          tone={prepTone}
        />
        <ScheduleMetric
          label="Short-week road"
          value={String(profile.shortWeekRoadGames)}
          detail={`NFL rank #${profile.shortWeekRoadGamesRank}`}
          tone={profile.shortWeekRoadGames === 0 ? "good" : profile.shortWeekRoadGames >= 2 ? "bad" : "neutral"}
        />
        <ScheduleMetric
          label="Road SNF/MNF follow-ups"
          value={String(profile.gamesAfterRoadSnfOrMnf)}
          detail={`${profile.negatedByeWeeks} negated bye weeks`}
          tone={profile.gamesAfterRoadSnfOrMnf === 0 && profile.negatedByeWeeks === 0 ? "good" : "neutral"}
        />
      </div>
    </div>
  );
}

function ScheduleMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "good" | "bad" | "neutral";
}) {
  const classes = tone === "good"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : tone === "bad"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-slate-200 bg-white text-slate-800";

  return (
    <div className={`rounded-xl border p-3 ${classes}`}>
      <div className="text-[8px] font-black uppercase tracking-wider opacity-70">{label}</div>
      <div className="mt-1 text-xl font-black tabular-nums">{value}</div>
      <div className="mt-1 text-[9px] font-bold leading-4 opacity-75">{detail}</div>
    </div>
  );
}

function formatSignedDays(value: number) {
  if (value === 0) return "0 days";
  return `${value > 0 ? "+" : ""}${value} days`;
}
