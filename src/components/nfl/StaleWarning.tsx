import type { NflDataMeta } from "@/lib/nfl/standings";

export function isMetaStale(meta: NflDataMeta | null | undefined, maxAgeHours: number, now: Date = new Date()): boolean {
  if (!meta?.generatedAt) return true; // fail safe: missing metadata counts as stale
  const generated = Date.parse(meta.generatedAt);
  if (Number.isNaN(generated)) return true;
  return now.getTime() - generated > maxAgeHours * 60 * 60 * 1000;
}

/**
 * Warning banner shown when a data file is older than its freshness budget.
 * Pass enabled={false} on surfaces where staleness doesn't apply
 * (archived seasons, preseason before the refresh cron is active).
 */
export default function StaleWarning({
  meta,
  maxAgeHours,
  enabled = true,
  now,
}: {
  meta: NflDataMeta | null | undefined;
  maxAgeHours: number;
  enabled?: boolean;
  now?: Date;
}) {
  if (!enabled || !isMetaStale(meta, maxAgeHours, now)) return null;
  return (
    <div
      className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900"
      role="status"
      data-testid="nfl-stale-warning"
    >
      This data may be out of date — it was last refreshed more than {maxAgeHours} hours ago. The automated update may be delayed.
    </div>
  );
}
