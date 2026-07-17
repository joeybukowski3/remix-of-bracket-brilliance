import { GuideSectionHeading, Metric, SourceTag } from "@/components/nfl/guide/GuideAtoms";
import type { NflGuideRecord } from "@/lib/nfl/guideRecord";
import { WARREN_SHARP_SCHEDULE_SOURCE } from "@/lib/nfl/warrenSharpSchedule2026";

/**
 * Schedule & rest profile (Section D): a summary rather than the full
 * 18-week schedule, with a link to the team dashboard for the week-by-week
 * view. Every figure comes directly from the Warren Sharp schedule dataset.
 */
export function ChapterScheduleProfile({ team }: { team: NflGuideRecord }) {
  const { schedule } = team;
  if (!schedule) return null;

  const byeWeek = schedule.weeklyRestEdges.find((week) => week.bye)?.week ?? null;
  const toughestRestWeek = schedule.weeklyRestEdges
    .filter((week) => !week.bye)
    .reduce<(typeof schedule.weeklyRestEdges)[number] | null>(
      (worst, week) => (worst === null || week.restEdgeDays < worst.restEdgeDays ? week : worst),
      null,
    );

  return (
    <section className="break-inside-avoid border border-slate-200 border-l-4 border-l-teal-400 bg-teal-50/30 p-3">
      <GuideSectionHeading as="h3" eyebrow="Schedule & rest" title="Schedule strength and rest profile" />
      <div className="mt-3 flex items-center gap-2">
        <SourceTag kind="schedule" />
        <span className="text-[10px] text-slate-500">
          {WARREN_SHARP_SCHEDULE_SOURCE.title} · {WARREN_SHARP_SCHEDULE_SOURCE.season} season
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric
          label="Schedule strength"
          value={`#${schedule.strengthOfSchedule.hardestFirstRank}`}
          sub="1 = hardest, 32 = easiest"
        />
        <Metric
          label="Net rest days"
          value={schedule.netRestDays > 0 ? `+${schedule.netRestDays}` : String(schedule.netRestDays)}
          sub={`Rank #${schedule.netRestEdgeRank}`}
        />
        <Metric
          label="Rest advantage games"
          value={schedule.gamesWithRestAdvantage}
          sub={`vs. ${schedule.gamesWithRestDisadvantage} disadvantage`}
        />
        <Metric
          label="Short-week road games"
          value={schedule.shortWeekRoadGames}
          sub={`Rank #${schedule.shortWeekRoadGamesRank}`}
        />
        <Metric label="Bye week" value={byeWeek != null ? `Week ${byeWeek}` : null} />
        {toughestRestWeek ? (
          <Metric
            label="Toughest rest week"
            value={`Week ${toughestRestWeek.week}`}
            sub={`${toughestRestWeek.restEdgeDays} rest-day edge vs. ${toughestRestWeek.opponent?.toUpperCase() ?? "opponent"}`}
          />
        ) : null}
        {team.finalEight ? (
          <Metric
            label="Final-8 opp. strength"
            value={team.finalEight.opponentStrength.toFixed(2)}
            sub="Higher = tougher slate"
          />
        ) : null}
      </div>
    </section>
  );
}
