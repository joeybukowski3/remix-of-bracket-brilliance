import { ChevronDown } from "lucide-react";
import { describeSampleRule, type NflMatchupSampleSettings } from "@/lib/nfl/matchupSampleWindow";

export default function MatchupExplainer({
  sampleLabel,
  sampleSettings,
}: {
  sampleLabel?: string;
  sampleSettings: NflMatchupSampleSettings;
}) {
  return (
    <details className="matchup-explainer rounded-lg border border-slate-300 bg-white">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
        <span id="overview-explainer-heading" className="text-sm font-semibold text-slate-900">
          What this page is telling you
        </span>
        <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-slate-500" />
      </summary>
      <div className="space-y-2 border-t border-slate-200 px-3 py-3 text-[12px] leading-5 text-slate-600 sm:px-4">
        <p>
          Three separate things are shown above, and they are deliberately not combined. The{" "}
          <span className="font-semibold text-slate-900">category advantage</span> table counts
          how many individual statistics each team leads within a section — it treats every metric
          as equally important, which no serious model does. Select a category to open its detailed
          metrics. The <span className="font-semibold text-slate-900">projection</span> is the actual
          model output, built from opponent-adjusted efficiency plus a fixed home-field adjustment.
          The <span className="font-semibold text-slate-900">advantages and things to watch</span> are
          plain descriptions of the largest gaps in the underlying rows.
        </p>
        <p>
          If you are new to these metrics:{" "}
          <span className="font-semibold text-slate-900">EPA per play</span> measures how many points
          an average play is worth from a given situation,{" "}
          <span className="font-semibold text-slate-900">success rate</span> is the share of plays
          that keep an offense on schedule, and{" "}
          <span className="font-semibold text-slate-900">power rating</span> is Joe Knows Ball&apos;s
          opponent-adjusted measure of team strength.
        </p>
        <p className="rounded border border-amber-300 bg-amber-50 px-2.5 py-2 text-amber-900">
          <span className="font-semibold">Sample in use:</span>{" "}
          {sampleLabel ? `${sampleLabel}. ` : ""}
          {describeSampleRule(sampleSettings)}
        </p>
      </div>
    </details>
  );
}
