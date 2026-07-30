/**
 * Eastern-time display formatting for the MLB daily model card live
 * adapters. None of the frozen production artifacts (hr-props-raw.json,
 * hr-props-best-bets.json) pre-format a display timestamp -- only a UTC ISO
 * `generatedAt` -- so this derives the "9:15 AM ET" style string the card
 * renderer expects from a real timestamp, the same convention already used
 * for `nextRunAt.label` in generate-mlb-hr-props.mjs (e.g. "1:00 PM ET").
 */

const ET_CLOCK_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/**
 * @param {string|null|undefined} isoString
 * @returns {string|null} e.g. "9:15 AM ET", or null when isoString is missing/unparseable.
 */
export function formatEasternClock(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  return `${ET_CLOCK_FORMATTER.format(date)} ET`;
}
