import type { WalterCaptureDelta } from "@/lib/walter/types";

function DeltaList({ title, items, tone }: { title: string; items: string[]; tone: "new" | "changed" | "removed" }) {
  if (items.length === 0) return null;
  const toneClass = tone === "new" ? "text-emerald-400" : tone === "removed" ? "text-slate-500 line-through" : "text-amber-400";
  return (
    <div>
      <h5 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h5>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item} className={`text-sm ${toneClass}`}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function UpdateTimeline({ delta }: { delta: WalterCaptureDelta | null }) {
  if (!delta || !delta.comparedTo) {
    return <p className="text-sm text-slate-600">This is the baseline capture for the week -- no prior snapshot to compare against.</p>;
  }

  const hasAnyChange = delta.new.length + delta.changed.length + delta.removed.length + delta.newInjuries.length + delta.pickChanges.length > 0;

  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">Changes since {delta.comparedTo}</p>
      {!hasAnyChange && <p className="text-sm text-slate-600">No detected changes from the {delta.comparedTo} capture.</p>}
      <DeltaList title="New" items={delta.new} tone="new" />
      <DeltaList title="Changed" items={delta.changed} tone="changed" />
      <DeltaList title="Removed / No longer emphasized" items={delta.removed} tone="removed" />
      <DeltaList title="New injury concerns" items={delta.newInjuries} tone="new" />
      <DeltaList title="Pick / confidence changes" items={delta.pickChanges} tone="changed" />
    </div>
  );
}
