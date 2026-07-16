import { GuideSectionHeading, SourceTag } from "@/components/nfl/guide/GuideAtoms";
import { formatSignedNumber, NFL_GUIDE_RECORDS, type NflGuideRecord } from "@/lib/nfl/guideRecord";

const TRAJECTORY_COPY: Record<string, string> = {
  "Late Riser": "rated higher over the final eight games of the season than over the full season",
  "Late Decline": "rated lower over the final eight games of the season than over the full season",
  Stable: "rated about the same over the final eight games as over the full season",
};

function RatingBar({ label, rating }: { label: string; rating: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500">{label}</span>
        <span className="text-sm font-black tabular-nums text-slate-900">{rating.toFixed(1)}</span>
      </div>
      <div className="mt-1 h-2 w-full bg-slate-200">
        <div
          className="h-full bg-indigo-600 print:bg-slate-700"
          style={{ width: `${Math.max(1, Math.min(100, rating))}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Model profile (Section C): the strongest supported model comparisons —
 * offense/defense balance, full-season vs final-eight trend, and rated-team
 * position. Every figure traces back to NflGuideRecord.model; nothing here
 * is computed beyond ranking against the same set of already-rated teams.
 */
export function ChapterModelProfile({ team }: { team: NflGuideRecord }) {
  const { model } = team;
  if (!model) return null;

  const ratedCount = NFL_GUIDE_RECORDS.filter((entry) => entry.model !== null).length;
  const finalEight = team.finalEight;
  const trend =
    Math.abs(model.finalEightComposite - model.fullSeasonComposite) >= 0.001
      ? model.finalEightComposite - model.fullSeasonComposite
      : 0;

  return (
    <section className="break-inside-avoid border border-slate-200 bg-white p-3">
      <GuideSectionHeading eyebrow="Model profile" title="Power model comparison" />
      <div className="mt-3 flex items-center gap-2">
        <SourceTag kind="model" />
        <span className="text-[10px] text-slate-500">
          nfl-power-v0.3.0 · rank #{model.rank} of {ratedCount} rated teams
        </span>
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <RatingBar label="Overall public rating" rating={model.publicRating} />
          <RatingBar label="Offense rating" rating={model.offenseRating} />
          <RatingBar label="Defense rating" rating={model.defenseRating} />
        </div>

        <div className="border border-slate-200 bg-slate-50 p-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500">
            Full season vs. final eight games
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.09em] text-slate-400">
                Full season
              </div>
              <div className="text-lg font-black tabular-nums text-slate-900">
                {model.fullSeasonComposite.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.09em] text-slate-400">
                Final eight games
              </div>
              <div className="text-lg font-black tabular-nums text-slate-900">
                {model.finalEightComposite.toFixed(2)}
              </div>
            </div>
          </div>
          {finalEight ? (
            <p className="mt-2 text-[11px] leading-4 text-slate-600">
              <span className="font-black text-slate-900">{finalEight.trajectoryLabel}:</span> Seattle{" "}
              {TRAJECTORY_COPY[finalEight.trajectoryLabel]} ({formatSignedNumber(trend, 2)} composite).
              This label is published for review and does not change the public rating above.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
