import { NO_ANGLE_MESSAGE, type MatchupAngle, type AngleSeverity } from "@/lib/nfl/matchupComparison";

const SEVERITY_STYLE: Record<AngleSeverity, string> = {
  strong: "border-emerald-300 bg-emerald-50 text-emerald-800",
  moderate: "border-sky-300 bg-sky-50 text-sky-800",
  small: "border-slate-200 bg-slate-50 text-slate-600",
};

function SeverityBadge({ severity }: { severity?: AngleSeverity }) {
  if (!severity) {
    return (
      <span className="shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-slate-500">
        Context
      </span>
    );
  }
  return (
    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${SEVERITY_STYLE[severity]}`}>
      {severity}
    </span>
  );
}

/**
 * Rules-based "Angles to Watch". Falls back to a clear message when none apply.
 *
 * Rendered as divided rows rather than bordered cards. These are one-line
 * editorial observations, and a card apiece — nested inside the section card —
 * spent roughly 110px each on a single sentence while making context read as
 * heavily as the analytical sections above it.
 */
export default function MatchupAngles({ angles }: { angles: MatchupAngle[] }) {
  if (angles.length === 0) {
    return <p className="text-sm text-slate-500">{NO_ANGLE_MESSAGE}</p>;
  }
  return (
    <ul className="divide-y divide-slate-100">
      {angles.map((angle) => (
        <li key={angle.key} className="py-2 first:pt-0 last:pb-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-bold leading-4 text-slate-900">{angle.label}</span>
            <SeverityBadge severity={angle.severity} />
          </div>
          <p className="mt-0.5 text-[11px] leading-4 text-slate-600">{angle.explanation}</p>
          {angle.favoredName && (
            <p className="mt-0.5 text-[11px] font-bold text-emerald-700">
              <span className="sr-only">Favors </span>Leans {angle.favoredName}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
