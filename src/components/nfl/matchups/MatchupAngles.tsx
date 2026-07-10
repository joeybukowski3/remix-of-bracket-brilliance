import { NO_ANGLE_MESSAGE, type MatchupAngle, type AngleSeverity } from "@/lib/nfl/matchupComparison";

const SEVERITY_STYLE: Record<AngleSeverity, string> = {
  strong: "border-emerald-300 bg-emerald-50 text-emerald-800",
  moderate: "border-sky-300 bg-sky-50 text-sky-800",
  small: "border-slate-200 bg-slate-50 text-slate-600",
};

function SeverityBadge({ severity }: { severity?: AngleSeverity }) {
  if (!severity) {
    return (
      <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-slate-500">
        Context
      </span>
    );
  }
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide ${SEVERITY_STYLE[severity]}`}>
      {severity}
    </span>
  );
}

/** Rules-based "Angles to Watch". Falls back to a clear message when none apply. */
export default function MatchupAngles({ angles }: { angles: MatchupAngle[] }) {
  if (angles.length === 0) {
    return <p className="text-sm text-slate-500">{NO_ANGLE_MESSAGE}</p>;
  }
  return (
    <ul className="space-y-3">
      {angles.map((angle) => (
        <li key={angle.key} className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-black text-slate-900">{angle.label}</span>
            <SeverityBadge severity={angle.severity} />
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-600">{angle.explanation}</p>
          {angle.favoredName && (
            <p className="mt-1 text-[11px] font-bold text-emerald-700">
              <span className="sr-only">Favors </span>Leans {angle.favoredName}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
