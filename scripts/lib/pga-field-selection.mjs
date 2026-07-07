/**
 * Shared "which tournament should be current" selection logic.
 *
 * Single source of truth used by scripts/fetch-pga-current-field.mjs, the
 * sync-pga-data workflow's post-run guard, and tests — so the field fetcher
 * and the freshness guard can never silently disagree about the target
 * tournament.
 *
 * Selection: the active event whose date range covers `asOfDate`, else the
 * next upcoming event, skipping alternate-field events. Throws when nothing
 * qualifies so callers fail loudly instead of fetching a stale field.
 */

export function selectLocalTarget(schedule, asOfDate) {
  if (!Array.isArray(schedule)) throw new Error("PGA schedule.json must contain an array.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(asOfDate ?? ""))) {
    throw new Error(`selectLocalTarget requires an ISO date (YYYY-MM-DD), got ${asOfDate}`);
  }
  const eligible = schedule
    .filter((event) => !String(event.eventType ?? "").toLowerCase().includes("alternate field"))
    .filter((event) => event.startDate && event.endDate)
    .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));

  const active = eligible.find((event) => event.startDate <= asOfDate && event.endDate >= asOfDate);
  if (active) return active;

  const upcoming = eligible.find((event) => event.startDate >= asOfDate);
  if (upcoming) return upcoming;

  throw new Error(`No current or future non-alternate PGA event found for ${asOfDate}.`);
}
