import { GuideSectionHeading, SourceTag } from "@/components/nfl/guide/GuideAtoms";
import { formatNflRecord, formatSignedNumber, type NflGuideRecord } from "@/lib/nfl/guideRecord";

/**
 * Section G. No hand-written editorial exists for every team (only a small
 * set of Coach of the Year cases in NflCoachOfYearCase.tsx, none for a team
 * that made the prior playoffs). Rather than auto-generate prose to fill an
 * "editorial outlook" section, this restates only values already shown
 * elsewhere in the chapter as short factual sentences, explicitly labeled as
 * a model summary rather than editorial analysis. When a team gets an
 * approved hand-written case in the future, that content should replace
 * this block rather than appear alongside it.
 */
export function ChapterModelSummary({ team }: { team: NflGuideRecord }) {
  const { model, previousSeason, schedule } = team;
  if (!model) return null;

  const strongerUnit = model.offenseRating >= model.defenseRating ? "Offense" : "Defense";
  const weakerUnit = strongerUnit === "Offense" ? "Defense" : "Offense";
  const strongerValue = strongerUnit === "Offense" ? model.offenseRating : model.defenseRating;
  const weakerValue = strongerUnit === "Offense" ? model.defenseRating : model.offenseRating;
  const unitGap = strongerValue - weakerValue;

  const pythagSentence =
    previousSeason?.pythagoreanExpectedWins != null && previousSeason.expectedWinsDelta != null
      ? `${team.name} finished ${formatNflRecord(previousSeason)}, ${
          previousSeason.expectedWinsDelta >= 0 ? "above" : "below"
        } its Pythagorean-expected win total of ${previousSeason.pythagoreanExpectedWins.toFixed(1)} by ${Math.abs(
          previousSeason.expectedWinsDelta,
        ).toFixed(1)} wins.`
      : null;

  return (
    <section className="break-inside-avoid border border-slate-200 bg-slate-50 p-3">
      <GuideSectionHeading as="h3" eyebrow="Model summary — not editorial analysis" title="What the numbers show" />
      <div className="mt-3 flex items-center gap-2">
        <SourceTag kind="model" />
        <span className="text-[10px] text-slate-500">
          Restates values already shown above; no written analysis is available for this team yet.
        </span>
      </div>

      <ul className="mt-3 space-y-1.5 text-xs leading-5 text-slate-700">
        <li>
          <span className="font-black text-slate-900">{strongerUnit}</span> rates {strongerValue.toFixed(1)}{" "}
          against <span className="font-black text-slate-900">{weakerUnit}</span> at {weakerValue.toFixed(1)} —
          a {unitGap.toFixed(1)}-point gap on the public scale, the largest component difference in the model
          profile above.
        </li>
        {team.finalEight ? (
          <li>
            Full-season vs. final-eight trend: <span className="font-black text-slate-900">{team.finalEight.trajectoryLabel}</span> (
            {formatSignedNumber(model.finalEightComposite - model.fullSeasonComposite, 2)} composite change).
          </li>
        ) : null}
        {schedule ? (
          <li>
            Schedule strength ranks{" "}
            <span className="font-black text-slate-900">#{schedule.strengthOfSchedule.hardestFirstRank}</span> of
            32 (1 = hardest).
          </li>
        ) : null}
        {pythagSentence ? <li>{pythagSentence}</li> : null}
      </ul>
    </section>
  );
}
