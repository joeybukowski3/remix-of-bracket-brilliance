import { Metric, SourceTag, TeamLogo } from "@/components/nfl/guide/GuideAtoms";
import { formatGeneratedAt } from "@/components/nfl/guide/GuideHeader";
import { ChapterMarketSnapshot } from "@/components/nfl/guide/chapter/ChapterMarketSnapshot";
import { ChapterModelProfile } from "@/components/nfl/guide/chapter/ChapterModelProfile";
import { ChapterModelSummary } from "@/components/nfl/guide/chapter/ChapterModelSummary";
import { ChapterOffseasonSummary } from "@/components/nfl/guide/chapter/ChapterOffseasonSummary";
import { ChapterScheduleBreakdown } from "@/components/nfl/guide/chapter/ChapterScheduleBreakdown";
import { ChapterScheduleProfile } from "@/components/nfl/guide/chapter/ChapterScheduleProfile";
import { ChapterSourceNotes } from "@/components/nfl/guide/chapter/ChapterSourceNotes";
import { formatNflRecord, NFL_GUIDE_MODEL_STATUS, type NflGuideRecord } from "@/lib/nfl/guideRecord";

/**
 * Expanded team-chapter layout for pilot teams (see guidePilot.ts). Reads the
 * same NflGuideRecord contract as the compact GuideTeamSection, so live and
 * print render identically and no data is duplicated or recomputed here.
 */
export function GuideTeamChapter({ team }: { team: NflGuideRecord }) {
  const { model, previousSeason, market } = team;
  const { validationStatus, generatedAt } = NFL_GUIDE_MODEL_STATUS;

  return (
    <article
      data-testid={`guide-chapter-${team.abbr}`}
      data-guide-chapter="pilot"
      className="border-2 border-slate-900 bg-white"
    >
      {/* Header + at-a-glance stay together across a page break. */}
      <div className="break-inside-avoid">
        <header
          className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-900 p-4"
          style={{ borderTop: `6px solid ${team.primaryColor}` }}
        >
          <div className="flex min-w-0 items-center gap-4">
            <TeamLogo team={team} size={64} />
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-700">
                {team.division} · Team Chapter
              </div>
              <h3 className="mt-0.5 text-2xl font-black leading-tight tracking-tight text-slate-900 sm:text-3xl">
                {team.fullName}
              </h3>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {previousSeason ? (
              <Metric label="2025 record" value={formatNflRecord(previousSeason)} />
            ) : null}
            {model ? (
              <Metric label="NFL v0.3 Preseason Rank" value={`#${model.rank}`} sub="Internal Stage-1" />
            ) : null}
            {model ? (
              <Metric label="NFL v0.3 Public Rating" value={model.publicRating.toFixed(1)} sub="0-99 scale" />
            ) : null}
            {market ? <Metric label="Win total" value={market.winTotal.toFixed(1)} sub="Market" /> : null}
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
          <SourceTag kind="model" />
          {validationStatus && validationStatus !== "validated" ? (
            <span className="rounded-sm border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.09em] text-amber-900">
              Validation status: {validationStatus}
            </span>
          ) : null}
          <span className="text-[10px] text-slate-500">
            Model data generated {formatGeneratedAt(generatedAt)}. Not betting advice.
          </span>
        </div>

        <AtAGlance team={team} />
      </div>

      <div className="space-y-4 p-4">
        <ChapterModelProfile team={team} />
        <ChapterScheduleProfile team={team} />
        <ChapterScheduleBreakdown team={team} />
        <ChapterMarketSnapshot team={team} />
        <ChapterOffseasonSummary team={team} />
        <ChapterModelSummary team={team} />
        <ChapterSourceNotes team={team} />
      </div>
    </article>
  );
}

function AtAGlance({ team }: { team: NflGuideRecord }) {
  const { model, schedule, offseason } = team;

  return (
    <div className="grid grid-cols-2 gap-px border-b-2 border-slate-900 bg-slate-200 sm:grid-cols-4">
      {model ? (
        <GlanceTile label="Offense" value={model.offenseRating.toFixed(1)} sub="Public rating" tint="indigo" />
      ) : null}
      {model ? (
        <GlanceTile label="Defense" value={model.defenseRating.toFixed(1)} sub="Public rating" tint="indigo" />
      ) : null}
      {schedule ? (
        <GlanceTile
          label="Schedule strength"
          value={`#${schedule.strengthOfSchedule.hardestFirstRank}`}
          sub="1 = hardest"
          tint="teal"
        />
      ) : null}
      {schedule ? (
        <GlanceTile
          label="Net rest edge"
          value={schedule.netRestDays > 0 ? `+${schedule.netRestDays}` : String(schedule.netRestDays)}
          sub={`Rank #${schedule.netRestEdgeRank}`}
          tint="teal"
        />
      ) : null}
      {offseason ? (
        <GlanceTile
          label="Head coach"
          value={offseason.headCoach2026}
          sub={offseason.status === "Changed" ? "New in 2026" : "Returning"}
          tint="stone"
        />
      ) : null}
    </div>
  );
}

const GLANCE_TINT_CLASSES: Record<"indigo" | "teal" | "stone", string> = {
  indigo: "bg-indigo-50/40",
  teal: "bg-teal-50/40",
  stone: "bg-stone-50/60",
};

function GlanceTile({
  label,
  value,
  sub,
  tint,
}: {
  label: string;
  value: string;
  sub: string;
  tint: "indigo" | "teal" | "stone";
}) {
  return (
    <div className={`px-3 py-2.5 ${GLANCE_TINT_CLASSES[tint]}`}>
      <div className="text-[9px] font-bold uppercase tracking-[0.09em] text-slate-500">{label}</div>
      <div className="mt-0.5 truncate text-base font-black tabular-nums text-slate-900" title={value}>
        {value}
      </div>
      <div className="text-[10px] text-slate-500">{sub}</div>
    </div>
  );
}
