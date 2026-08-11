import { CFB_PROVENANCE } from "@/data/cfb";

type Props = {
  /** Which data provenance notices to show. */
  kind: "ratings" | "schedule" | "both";
};

/**
 * Concise provenance for generated ratings and any remaining provisional layer.
 */
export default function CollegeFootballDataNotice({ kind }: Props) {
  const showRatings = kind === "ratings" || kind === "both";
  const showSchedule = kind === "schedule" || kind === "both";

  if (!showRatings && !showSchedule) return null;

  return (
    <div className="space-y-2" role="status">
      {showRatings && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-950">
          <span className="font-semibold">JKB Preseason Power:</span>{" "}
          Market-informed preseason ratings adjusted by JoeKnowsBall efficiency data for{" "}
          {CFB_PROVENANCE.season}. These are team-strength ratings, not projected spreads or picks.
        </p>
      )}
      {showSchedule && (
        <p className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs leading-5 text-slate-700">
          <span className="font-semibold">Schedule status:</span>{" "}
          Eight Pac-12 Week 13 flex opponents remain unassigned. Their remaining SOS is
          provisional until those matchups are set.
        </p>
      )}
    </div>
  );
}
