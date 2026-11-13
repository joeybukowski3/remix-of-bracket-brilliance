import { describeFantasyAllowedFreshness } from "@/lib/nfl/fantasyAllowed/freshness";
import type { FantasyAllowedArtifact } from "@/lib/nfl/fantasyAllowed/types";

/**
 * One-line provenance for the Fantasy Points Allowed table: which week the
 * opponents are for, which games the ranks include, and a visible warning when
 * the data is partial or old. The wording lives in the unit-tested formatter.
 */
export default function DataFreshnessNotice({ artifact, now = new Date() }: { artifact: FantasyAllowedArtifact; now?: Date }) {
  const view = describeFantasyAllowedFreshness(artifact, now);
  const warn = view.tone === "warn";
  return (
    <section
      aria-label="Data freshness"
      className={`mt-3 rounded-lg border px-3 py-2 text-[11px] ${warn ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-600"}`}
    >
      <p className="font-medium">{view.headline}</p>
      {view.warnings.map((warning) => (
        <p key={warning} role="status" className="mt-1">
          {warning}
        </p>
      ))}
    </section>
  );
}
